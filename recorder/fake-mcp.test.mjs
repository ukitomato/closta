#!/usr/bin/env node
// Self-test of the fake MCP server over 127.0.0.1 (no real API needed).
import assert from 'node:assert/strict';
import { startFakeMcpServer } from './fake-mcp.mjs';

let failures = 0;
const check = async (name, fn) => {
  try { await fn(); process.stdout.write(`  ✓ ${name}\n`); } catch (e) { failures += 1; process.stdout.write(`  ✗ ${name}: ${e.message}\n`); }
};

const post = (srv, msg) => fetch(srv.url.replace('localhost', '127.0.0.1'), {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify(msg),
});

// Reads an SSE response as a reader of parsed data events.
function events(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  return async () => {
    for (;;) {
      const at = buf.indexOf('\n\n');
      if (at >= 0) {
        const block = buf.slice(0, at);
        buf = buf.slice(at + 2);
        const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
        if (data) return JSON.parse(data);
        continue;
      }
      const { done, value } = await reader.read();
      if (done) return null;
      buf += decoder.decode(value, { stream: true });
    }
  };
}

const withServer = async (fn) => {
  const srv = await startFakeMcpServer('fake-echo');
  try { await fn(srv); } finally { await srv.close(); }
};

const call = (srv, name) => post(srv, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: {} } });

await check('initialize, tools/list and ping answer as before; echo, ask_form and ask_url are offered', () => withServer(async (srv) => {
  const init = await (await post(srv, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
  assert.equal(init.result.serverInfo.name, 'fake-echo');
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const list = await (await post(srv, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  assert.deepEqual(list.result.tools.map((t) => t.name), ['echo', 'ask_form', 'ask_url']);
  const ping = await (await post(srv, { jsonrpc: '2.0', id: 3, method: 'ping' })).json();
  assert.deepEqual(ping.result, {});
  assert.equal((await post(srv, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
}));

await check('ask_form: elicitation/create with the form schema, the answer is accepted with 202 and comes back as the result', () => withServer(async (srv) => {
  const res = await call(srv, 'ask_form');
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const next = events(res);
  const req = await next();
  assert.equal(req.method, 'elicitation/create');
  assert.equal(req.params.mode, 'form');
  assert.equal(req.params.message, 'Fill in the test form');
  assert.deepEqual(req.params.requestedSchema.required, ['name']);
  assert.deepEqual(req.params.requestedSchema.properties.color.enumNames, ['Red', 'Blue']);
  assert.equal(req.params.requestedSchema.properties.count.maximum, 5);
  const answer = await post(srv, { jsonrpc: '2.0', id: req.id, result: { action: 'accept', content: { name: 'Ada' } } });
  assert.equal(answer.status, 202);
  const result = await next();
  assert.equal(result.id, 7);
  assert.equal(result.result.content[0].text, '{"action":"accept","content":{"name":"Ada"}}');
  assert.equal(await next(), null);
}));

await check('ask_url: accept sends the completion notification before the result, decline does not', () => withServer(async (srv) => {
  for (const action of ['accept', 'decline']) {
    const next = events(await call(srv, 'ask_url'));
    const req = await next();
    assert.deepEqual(req.params, { mode: 'url', url: 'https://example.com/closta-test', elicitationId: 'closta-test-1', message: 'Open the test page' });
    assert.equal((await post(srv, { jsonrpc: '2.0', id: req.id, result: { action } })).status, 202);
    const seen = [];
    for (let e = await next(); e; e = await next()) seen.push(e);
    if (action === 'accept') {
      assert.equal(seen.length, 2);
      assert.equal(seen[0].method, 'notifications/elicitation/complete');
      assert.deepEqual(seen[0].params, { elicitationId: 'closta-test-1' });
      assert.equal(seen[1].result.content[0].text, '{"action":"accept"}');
    } else {
      assert.equal(seen.length, 1);
      assert.equal(seen[0].result.content[0].text, '{"action":"decline"}');
    }
  }
}));

process.stdout.write(failures ? `\nNG: ${failures} failed\n` : '\nOK\n');
process.exit(failures ? 1 : 0);
