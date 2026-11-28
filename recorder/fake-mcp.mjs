// Fake HTTP MCP server for the recorder. Answers initialize, tools/list and ping, and offers three tools:
//   echo      listed only (nothing calls it)
//   ask_form  tools/call streams an elicitation/create (form mode) request, waits for the client's answer, and returns it as the tool result
//   ask_url   the same in url mode; when the answer is accept, notifications/elicitation/complete is streamed before the result
// Never reaches outside (127.0.0.1). Returns { url, port, close }. The url has a form that matches http://localhost* in the managed settings allow list.
import http from 'node:http';

const FORM_PARAMS = {
  mode: 'form',
  message: 'Fill in the test form',
  requestedSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Name', minLength: 1 },
      color: { type: 'string', enum: ['red', 'blue'], enumNames: ['Red', 'Blue'] },
      count: { type: 'integer', minimum: 1, maximum: 5 },
      agree: { type: 'boolean' },
    },
    required: ['name'],
  },
};

const URL_PARAMS = {
  mode: 'url',
  url: 'https://example.com/closta-test',
  elicitationId: 'closta-test-1',
  message: 'Open the test page',
};

const TOOLS = [
  { name: 'echo', description: 'Echo the text back.', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'ask_form', description: 'Ask the user to fill in a form.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ask_url', description: 'Ask the user to open a page.', inputSchema: { type: 'object', properties: {} } },
];

export async function startFakeMcpServer(name) {
  const reply = (res, id, result) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  };
  // Server-to-client requests waiting for the client's POSTed answer: id -> resolve.
  const waiting = new Map();
  let serverRequestN = 0;

  const streamElicitation = (res, callId, params) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const send = (msg) => res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
    const id = `fake-elicit-${(serverRequestN += 1)}`;
    waiting.set(id, (answer) => {
      const result = answer.result ?? { action: 'cancel' };
      if (params.mode === 'url' && result.action === 'accept') {
        send({ jsonrpc: '2.0', method: 'notifications/elicitation/complete', params: { elicitationId: params.elicitationId } });
      }
      send({ jsonrpc: '2.0', id: callId, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
      res.end();
    });
    res.on('close', () => waiting.delete(id));
    send({ jsonrpc: '2.0', id, method: 'elicitation/create', params });
  };

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let msg = null;
      try { msg = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      if (msg.method === undefined && (msg.result !== undefined || msg.error !== undefined)) {
        // The client's answer to a request the server streamed.
        res.writeHead(202).end();
        waiting.get(msg.id)?.(msg);
        waiting.delete(msg.id);
        return;
      }
      if (msg.id === undefined) { res.writeHead(202).end(); return; } // notifications/initialized, etc.
      switch (msg.method) {
        case 'initialize':
          reply(res, msg.id, {
            protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name, version: '0.0.0' },
          });
          break;
        case 'tools/list':
          reply(res, msg.id, { tools: TOOLS });
          break;
        case 'ping':
          reply(res, msg.id, {});
          break;
        case 'tools/call':
          if (msg.params?.name === 'ask_form') { streamElicitation(res, msg.id, FORM_PARAMS); break; }
          if (msg.params?.name === 'ask_url') { streamElicitation(res, msg.id, URL_PARAMS); break; }
          // falls through to method not found, as before
        default:
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } }));
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  return {
    port,
    url: `http://localhost:${port}/mcp`,
    close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }),
  };
}
