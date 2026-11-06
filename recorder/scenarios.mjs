// Declarative definitions of the recording scenarios.
//
// Each scenario has the stdin procedure (steps) that draws out a given protocol shape,
// the policy for answering permission requests (can_use_tool) (permission), and when to stop recording (done).
// The triggers were worked out backwards from the old prototype's protocol-fixtures/*.ndjson (the only source of truth).
//
// Step kinds:
//   {kind:'initialize'}                     initialize control request
//   {kind:'getContextUsage'}                get_context_usage control request (identified in 06)
//   {kind:'setModel', model}                set_model control request
//   {kind:'setPermissionMode', mode}        set_permission_mode control request
//   {kind:'user', text}                     send a user message
//   {kind:'waitResults', n}                 wait until n results have been seen
//   {kind:'wait', ms}                       wait ms
//   {kind:'waitFor', line, n?}              wait until n (default 1) lines of line (type or type/subtype, e.g. system/task_started) have been seen
//   {kind:'interrupt'}                      interrupt control request
//   {kind:'userContent', content}           send a user message whose content is an array of blocks (image, document and text blocks)
//   {kind:'mcpStatus'}                      mcp_status control request. Waits for the control_response with its request_id
//   {kind:'mcpToggle', serverName, enabled} mcp_toggle control request (serverName '{MCP}' means the scenario's fake server). Waits for the answer
//   {kind:'mcpReconnect', serverName}       mcp_reconnect control request (same as above). Waits for the answer
//   {kind:'rewindFiles', userIndex, dryRun} rewind_files control request. userIndex is the position (from 1) of the user line sent in that phase,
//                                           and that line's uuid becomes user_message_id. Waits for the answer
//   rewindFiles may appear only in the first phase's steps (not in resume.steps). Such a scenario sets stdinFile true and has rewindRead.
//
// rewindRead: {includes, excludes}  for a scenario with rewindFiles, what the Read tool_result after the rewind should show (a word it includes and one it excludes; neither empty).
// stdinFile: true  keep the lines the recorder wrote to the CLI's stdin next to the capture as <id>.stdin.jsonl.
//
// env: {name: value}  when present, the child's environment is process.env with this laid over it. Names whose value is null are removed from the child's environment.
//   No secret values (only flag-like true or null; verify.mjs check 10 enforces this). Recorded in the manifest entry.
//
// mcpServer: {name}  when present, the recorder starts a fake HTTP MCP server on 127.0.0.1 (it only offers one tool, echo),
//   starts the CLI with its URL (http://localhost:<port>/mcp, a form that matches http://localhost* in the managed settings allow list) via --mcp-config,
//   and stops it once recording ends (even on failure). The port differs on every recording, so the scrubber replaces it with a fixed fake value.
//
// seed: {name: content}  files placed in the cwd from the start (Edit targets, etc.)
//
// done: {results, controlResponses, quietMs, maxMs}
//   When the results/controlResponses counts are met and quietMs of silence follows, stdin is closed and the run ends.
//   maxMs is a hard cap.
//
// permission: {holdMs, respond(req)->payload}  the answer to can_use_tool (allow by default).
//
// resume: {steps, done}  when present, after the CLI of steps and done is closed, the stored transcript of the cwd is kept as the transcript,
//   and a second CLI is started with --resume on the same session id to run resume.steps (see the top of record.mjs).
//   If resume.fork is true, --fork-session is added to the second CLI's flags (a transcript with a new session id is created).

import { deflateSync } from 'node:zlib';

// The attachment data put into captures is only a small fake image and PDF (no recorded values, no user files).
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}
/** A single-color PNG (width x height pixels, 8-bit RGB). */
export function solidPng(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
/** A one-page PDF with a single word on it. */
export function oneWordPdf(word) {
  const stream = `BT /F1 36 Tf 72 120 Td (${word}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const ALLOW = (req) => ({ behavior: 'allow', updatedInput: req.input });

// Startup for the isolated scenarios: take approvals on stdin, leave out the user's settings and the account's MCP servers,
// and use the same model as the first 15 scenarios. Kept in each capture's flags in the manifest.
const ISOLATED = [
  '--permission-prompt-tool', 'stdio',
  '--setting-sources', 'project',
  '--strict-mcp-config',
  '--model', 'claude-sonnet-4-6',
];

export const scenarios = [
  {
    id: '01-baseline-text',
    summary: 'one turn without tools (the minimal text_delta sequence)',
    flags: [],
    steps: [{ kind: 'user', text: 'Respond with exactly one word: pong' }],
    done: { results: 1, quietMs: 2000, maxMs: 30000 },
  },
  {
    id: '02-tool-bash-autorun',
    summary: 'Bash tool_use → tool_result (runs automatically under prior permission)',
    flags: [],
    steps: [{ kind: 'user', text: 'Run this exact bash command and report its output: echo hello-from-capture' }],
    done: { results: 1, quietMs: 2500, maxMs: 40000 },
  },
  {
    id: '03-initialize-handshake',
    summary: 'successful initialize response (all of models[]/commands[]/account) + one short turn',
    flags: [],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Respond with exactly one word: pong' },
    ],
    done: { results: 1, controlResponses: 1, quietMs: 2000, maxMs: 30000 },
  },
  {
    id: '04-tool-autorun-with-ppt-stdio',
    summary: 'pre-permitted Bash still runs automatically with --permission-prompt-tool stdio',
    flags: ['--permission-prompt-tool', 'stdio'],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Run this exact bash command and report its output: echo should-be-denied' },
    ],
    done: { results: 1, controlResponses: 1, quietMs: 2500, maxMs: 40000 },
  },
  {
    id: '05-permission-can-use-tool',
    summary: 'Write outside the cwd → can_use_tool (with Write diff material) → allow',
    flags: ['--permission-prompt-tool', 'stdio'],
    // Writing outside the startup cwd triggers can_use_tool. The driver prepares OUTSIDE.
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Use the Write tool to create the file {OUTSIDE}/note.txt containing exactly the text: hello' },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 60000 },
  },
  {
    id: '06-context-usage',
    summary: 'get_context_usage response (categories/totalTokens/maxTokens/...)',
    flags: [],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 400 },
      { kind: 'getContextUsage' },
    ],
    done: { results: 0, controlResponses: 2, quietMs: 2500, maxMs: 20000 },
  },
  {
    id: '07-set-model-and-mode',
    summary: 'set_model / set_permission_mode round trips (no user messages, so no tokens used)',
    flags: ['--model', 'opus', '--permission-mode', 'manual'],
    steps: [
      { kind: 'initialize' },
      { kind: 'setModel', model: 'opus' },
      { kind: 'setModel', model: 'default' },
      { kind: 'setModel', model: 'sonnet' },
      { kind: 'setModel', model: 'default' },
      { kind: 'setPermissionMode', mode: 'plan' },
      { kind: 'setPermissionMode', mode: 'acceptEdits' },
      { kind: 'setPermissionMode', mode: 'bypassPermissions' },
      { kind: 'setPermissionMode', mode: 'auto' },
      { kind: 'setPermissionMode', mode: 'dontAsk' },
      { kind: 'setPermissionMode', mode: 'manual' },
      { kind: 'initialize' },
    ],
    done: { results: 0, controlResponses: 12, quietMs: 3000, maxMs: 40000 },
  },
  {
    id: '08-subagent-task',
    summary: 'one subagent through the Agent tool (assistant/user carry the attribution)',
    flags: [],
    // The driver creates the file to read in the cwd (NOTES.md), avoiding absolute paths.
    steps: [
      {
        kind: 'user',
        text:
          'Use the Agent tool to spawn one subagent (subagent_type "Explore", run_in_background false) '
          + 'that reads the file NOTES.md in the current directory and reports a one-sentence summary. '
          + 'Then relay the summary.',
      },
    ],
    done: { results: 1, quietMs: 3500, maxMs: 90000 },
  },
  {
    id: '09-parallel-subagents',
    summary: 'two subagents at once (arriving as different indexes of the same message)',
    flags: [],
    steps: [
      {
        kind: 'user',
        text:
          'Use the Agent tool to spawn two subagents in parallel in a single message '
          + '(both subagent_type "Explore", run_in_background false): one reads NOTES.md and the other '
          + 'reads GUIDE.md in the current directory, each reporting a one-sentence summary. Then relay both.',
      },
    ],
    done: { results: 1, quietMs: 3500, maxMs: 90000 },
  },
  {
    id: '10-background-task',
    summary: 'background run and self-resumption (several results, user_message_uuid=null)',
    flags: ['--permission-mode', 'acceptEdits'],
    steps: [
      {
        kind: 'user',
        text:
          'Use the Agent tool with run_in_background true to run the bash command '
          + '`sleep 45 && echo bg-done` and report its output once it completes.',
      },
    ],
    // sleep 45 + two self-resumptions. stdin is kept open (the driver does not close it until done).
    done: { results: 3, quietMs: 5000, maxMs: 100000 },
  },
  {
    id: '11-background-followup',
    summary: 'send another user message while the background task runs',
    flags: ['--permission-mode', 'acceptEdits'],
    steps: [
      {
        kind: 'user',
        text:
          'Use the Agent tool with run_in_background true to run the bash command '
          + '`sleep 40 && echo bg2-done` and report its output once it completes.',
      },
      { kind: 'waitResults', n: 1 },
      { kind: 'user', text: 'While that runs: respond with exactly one character: 4 (what is 2+2)' },
    ],
    done: { results: 4, quietMs: 5000, maxMs: 100000 },
  },
  {
    id: '12-subagent-permission',
    summary: 'can_use_tool from a subagent (attributed by request.agent_id)',
    flags: ['--permission-prompt-tool', 'stdio'],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the Agent tool to spawn a subagent (subagent_type "general-purpose", run_in_background false) '
          + 'that uses the Write tool to create the file {OUTSIDE}/probe.txt containing exactly the text hello. '
          + 'Then report done.',
      },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 3500, maxMs: 90000 },
  },
  {
    id: '13-ask-timeout',
    summary: 'allow AskUserQuestion at once → settles as "did not answer"',
    flags: ['--permission-prompt-tool', 'stdio'],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the AskUserQuestion tool to ask the question "AとBどちらがいいですか？" '
          + '(header "選択肢") with two options: A ("Aを選択します") and B ("Bを選択します"), multiSelect false.',
      },
    ],
    // Immediate allow without answers → the CLI settles it as "no answer".
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 2500, maxMs: 40000 },
  },
  {
    id: '14-ask-answers-updatedinput',
    summary: 'hold can_use_tool for 5s, then inject answers through updatedInput.answers',
    flags: ['--permission-prompt-tool', 'stdio'],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the AskUserQuestion tool to ask the question "AとBどちらがいいですか？" '
          + '(header "選択肢") with two options: A ("Aを選択します") and B ("Bを選択します"), multiSelect false.',
      },
    ],
    permission: {
      holdMs: 5000,
      respond: (req) => {
        const q = req.input?.questions?.[0];
        const answers = q ? { [q.question]: q.options?.[0]?.label ?? 'A' } : {};
        return { behavior: 'allow', updatedInput: { ...req.input, answers } };
      },
    },
    done: { results: 1, controlResponses: 1, quietMs: 2500, maxMs: 40000 },
  },
  {
    id: '15-ask-afktimeout-updatedinput',
    summary: 'hold can_use_tool for 5s, then answer AFK through updatedInput.afkTimeoutMs',
    flags: ['--permission-prompt-tool', 'stdio'],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the AskUserQuestion tool to ask the question "AとBどちらがいいですか？" '
          + '(header "選択肢") with two options: A ("Aを選択します") and B ("Bを選択します"), multiSelect false.',
      },
    ],
    permission: {
      holdMs: 5000,
      respond: (req) => ({ behavior: 'allow', updatedInput: { ...req.input, afkTimeoutMs: 5000 } }),
    },
    done: { results: 1, controlResponses: 1, quietMs: 2500, maxMs: 40000 },
  },

  // ---- Recorded with 2.1.282, without the user's settings and the account's MCP servers (ISOLATED). ----
  {
    id: '16-permission-suggestion-accept',
    summary: 'can_use_tool for a Write outside the cwd: accept the suggestions (permission_suggestions), rewrite the input and allow → the following Read',
    flags: ISOLATED,
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the Write tool to create the file {OUTSIDE}/note.txt containing exactly the text: hello. '
          + 'Then use the Read tool to read {OUTSIDE}/note.txt and report its exact content.',
      },
    ],
    // Put only the suggestions (addDirectories, etc.) whose destination is session into updatedPermissions, and rewrite content.
    // Returning suggestions outside the session (userSettings, etc.) would write permissions into the user's real settings on every recording.
    // Shows whether the following Read raises can_use_tool (whether the suggestions took effect) and the written content (whether the rewrite did).
    permission: {
      holdMs: 0,
      respond: (req) => (req.tool_name === 'Write'
        ? {
          behavior: 'allow',
          updatedInput: { ...req.input, content: 'hello-rewritten-by-host' },
          updatedPermissions: (req.permission_suggestions ?? []).filter((s) => s.destination === 'session'),
        }
        : ALLOW(req)),
    },
    done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 90000 },
  },
  {
    id: '17-edit-approval',
    summary: 'Edit of an existing file in the cwd → can_use_tool (Edit input) → allow',
    flags: ISOLATED,
    seed: { 'EDITME.md': '# EDITME\nstatus: old-value\n' },
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text: 'Use the Edit tool to replace the text old-value with new-value in the file EDITME.md. Then report done.',
      },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 90000 },
  },
  {
    id: '18-ask-multi-question',
    summary: 'two questions in one AskUserQuestion → inject answers to both',
    flags: ISOLATED,
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the AskUserQuestion tool once, with two questions in the same call: '
          + 'first "AとBどちらがいいですか？" (header "選択肢") with options A ("Aを選択します") and B ("Bを選択します"), multiSelect false; '
          + 'second "XとYどちらにしますか？" (header "もう一つ") with options X ("Xを選択します") and Y ("Yを選択します"), multiSelect false. '
          + 'Then report the answers.',
      },
    ],
    permission: {
      holdMs: 2000,
      respond: (req) => {
        const answers = Object.fromEntries((req.input?.questions ?? []).map((q) => [q.question, q.options?.[0]?.label ?? '']));
        return { behavior: 'allow', updatedInput: { ...req.input, answers } };
      },
    },
    done: { results: 1, controlResponses: 1, quietMs: 2500, maxMs: 60000 },
  },
  {
    id: '19-interrupt-background',
    summary: 'interrupt while a background Agent runs → whether it arrives and how the turn and task close',
    flags: [...ISOLATED, '--permission-mode', 'acceptEdits'],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the Agent tool with run_in_background true to run the bash command '
          + '`sleep 60 && echo bg-interrupt-done` and report its output once it completes.',
      },
      { kind: 'waitFor', line: 'system/task_started' },
      { kind: 'wait', ms: 3000 },
      { kind: 'interrupt' },
    ],
    // Two control_responses, for initialize and interrupt. Waits longer to also see what comes after sleep 60.
    done: { results: 1, controlResponses: 2, quietMs: 10000, maxMs: 100000 },
  },
  {
    id: '20-todowrite',
    summary: 'ask for TodoWrite (in this setup the 2.1.282 tools have no TodoWrite; ToolSearch replaces it with TaskCreate and TaskUpdate)',
    flags: ISOLATED,
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the TodoWrite tool to record a todo list with exactly two items: '
          + '"write tests" (status pending) and "run build" (status in_progress). Then report done.',
      },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 60000 },
  },
  {
    id: '21-compact',
    summary: '/compact after one turn → the lines compaction sends',
    flags: ISOLATED,
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Respond with exactly one word: pong' },
      { kind: 'waitResults', n: 1 },
      { kind: 'user', text: '/compact' },
    ],
    done: { results: 2, controlResponses: 1, quietMs: 5000, maxMs: 120000 },
  },
  // ---- Also recorded with 2.1.282 and ISOLATED. Starts the CLI twice within one scenario (resume). ----
  {
    id: '22-resume',
    summary: 'a --session-id CLI runs one turn using Bash once → close → keep the stored transcript → a --resume CLI with the same id runs one turn',
    flags: ISOLATED,
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Run this exact bash command and report its output: echo hello-from-resume' },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 90000 },
    resume: {
      steps: [
        { kind: 'initialize' },
        { kind: 'wait', ms: 500 },
        { kind: 'user', text: 'Respond with exactly one word: pong' },
      ],
      done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 90000 },
    },
  },
  // ---- Also recorded with 2.1.282 and ISOLATED. Sends an image and a PDF with text as an array of content blocks. ----
  {
    id: '23-attachments',
    summary: 'turn 1: an image block (fake single-color PNG) and text → turn 2: a PDF block (fake single word) and text. Also keeps the stdin lines the recorder wrote',
    flags: ISOLATED,
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'userContent',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: solidPng(4, 4, [255, 0, 0]).toString('base64') } },
          { type: 'text', text: 'What is the single color of this image? Answer with exactly one word.' },
        ],
      },
      { kind: 'waitResults', n: 1 },
      {
        kind: 'userContent',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: oneWordPdf('KIWI').toString('base64') } },
          { type: 'text', text: 'What is the single word written in this PDF? Answer with exactly that word.' },
        ],
      },
    ],
    done: { results: 2, controlResponses: 1, quietMs: 3000, maxMs: 120000 },
    stdinFile: true,
  },
  // ---- Also recorded with 2.1.282 and ISOLATED. Sends no user turn, only MCP control requests. ----
  {
    id: '24-mcp-management',
    summary: 'pass only one fake HTTP MCP server: mcp_status → mcp_toggle (disable) → mcp_status → mcp_toggle (enable) → mcp_status → mcp_reconnect → mcp_status → mcp_toggle with an unknown name. Also keeps the stdin lines the recorder wrote',
    flags: ISOLATED,
    mcpServer: { name: 'fake-echo' },
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 3000 },
      { kind: 'mcpStatus' },
      { kind: 'mcpToggle', serverName: '{MCP}', enabled: false },
      { kind: 'mcpStatus' },
      { kind: 'mcpToggle', serverName: '{MCP}', enabled: true },
      { kind: 'wait', ms: 2000 },
      { kind: 'mcpStatus' },
      { kind: 'mcpReconnect', serverName: '{MCP}' },
      { kind: 'wait', ms: 2000 },
      { kind: 'mcpStatus' },
      { kind: 'mcpToggle', serverName: 'no-such-server', enabled: false },
    ],
    done: { results: 0, controlResponses: 9, quietMs: 2000, maxMs: 60000 },
    stdinFile: true,
  },
  // ---- Also recorded with 2.1.282. 25 enables file checkpointing and sends rewind_files; 26 resumes with --fork-session. ----
  {
    id: '25-rewind-files',
    summary: 'with file checkpointing on: Write → rewrite with Read + Write → rewind_files (dry_run true, false) → Read to see whether the content came back. Also keeps the stdin lines the recorder wrote',
    flags: ISOLATED,
    // The CLI enables checkpointing when ENABLE is set and DISABLE is not (2.1.282). DISABLE is removed even if the parent environment has it.
    env: { CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: 'true', CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING: null },
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Use the Write tool to create the file note.txt in the current directory containing exactly the text: first' },
      { kind: 'waitResults', n: 1 },
      {
        kind: 'user',
        text:
          'Use the Read tool to read note.txt in the current directory, then use the Write tool to overwrite '
          + 'note.txt with exactly the text: second',
      },
      { kind: 'waitResults', n: 2 },
      { kind: 'rewindFiles', userIndex: 2, dryRun: true },
      { kind: 'rewindFiles', userIndex: 2, dryRun: false },
      { kind: 'user', text: 'Use the Read tool to read note.txt in the current directory and report its content exactly as it is.' },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    // 3 results, and 3 control_responses for initialize and the two rewind_files. Answers to can_use_tool are written by the recorder and not counted.
    done: { results: 3, controlResponses: 3, quietMs: 3000, maxMs: 120000 },
    stdinFile: true,
    // The Read after the rewind includes first and not second (verify check 9).
    rewindRead: { includes: 'first', excludes: 'second' },
  },
  {
    id: '26-fork-session',
    summary: 'a --session-id CLI runs one turn using Bash once → close → keep the stored transcript → a --resume --fork-session CLI runs one turn (new session id)',
    flags: ISOLATED,
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Run this exact bash command and report its output: echo kiwi-from-fork' },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 90000 },
    resume: {
      fork: true,
      steps: [
        { kind: 'initialize' },
        { kind: 'wait', ms: 500 },
        {
          kind: 'user',
          text: 'Reply in one line: the word forked, then a space, then the output of the command you ran earlier.',
        },
      ],
      done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 90000 },
    },
  },
  {
    id: '27-resume-session-at',
    summary: 'a --session-id CLI runs two turns (remember alpha, bravo) → close → keep the stored transcript → a CLI with --resume, --fork-session, --session-id and --resume-session-at (before the second prompt) runs one turn',
    flags: ISOLATED,
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Remember the word alpha. Reply with only: ok' },
      { kind: 'waitResults', n: 1 },
      { kind: 'user', text: 'Remember the word bravo too. Reply with only: ok' },
    ],
    done: { results: 2, controlResponses: 1, quietMs: 3000, maxMs: 90000 },
    resume: {
      fork: true,
      at: { beforeUser: 2 },
      steps: [
        { kind: 'initialize' },
        { kind: 'wait', ms: 500 },
        { kind: 'user', text: "List every word I asked you to remember, comma separated, nothing else." },
      ],
      done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 90000 },
    },
    resumeAnswer: { includes: 'alpha', excludes: 'bravo' },
    // A scenario that uses no tools (it only checks the --resume-session-at cut point): no tool lines in the transcript is correct (verify.mjs checks).
    transcriptTools: false,
  },
  {
    id: '28-effort-live',
    summary: 'start with --effort medium, get_settings (applied.effort) → get_settings after each apply_flag_settings that sets effortLevel to high, low, null (the model default) (no user messages, so no tokens used)',
    flags: [...ISOLATED, '--effort', 'medium'],
    steps: [
      { kind: 'initialize' },
      { kind: 'getSettings' },
      { kind: 'applyFlagSettings', settings: { effortLevel: 'high' } },
      { kind: 'getSettings' },
      { kind: 'applyFlagSettings', settings: { effortLevel: 'low' } },
      { kind: 'getSettings' },
      { kind: 'applyFlagSettings', settings: { effortLevel: null } },
      { kind: 'getSettings' },
    ],
    done: { results: 0, controlResponses: 8, quietMs: 2500, maxMs: 40000 },
  },
  {
    // Plan approval: ExitPlanModeInput in sdk-tools.d.ts has no plan in its type ([k: string]: unknown), so
    // this confirms the shape of the input the CLI sends in can_use_tool.
    id: '29-exit-plan-mode',
    summary: 'in Plan mode, a plan to fix the README headings → ExitPlanMode can_use_tool (the plan input) → allow',
    flags: [...ISOLATED, '--permission-mode', 'plan'],
    seed: { 'README.md': '# Prject\n\n## Usgae\n\nRun it.\n' },
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text: 'Make a short plan to fix the spelling of the headings in README.md, then call ExitPlanMode with it. '
          + 'Once it is approved, make the fix with the Edit tool and report done.',
      },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 3000, maxMs: 120000 },
  },
  {
    id: '30-deny-empty-message',
    summary: 'refuse AskUserQuestion with a deny that has an empty reason → API 400 → send again (same 400). Reproduces old Closta\'s "do not answer". '
      + 'Users saw the 400 on Opus 5.5 (on Sonnet 4.6 the empty tool_result went through)',
    flags: [...ISOLATED.filter((f, i, all) => f !== '--model' && all[i - 1] !== '--model'), '--model', 'claude-opus-5-5'],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      {
        kind: 'user',
        text:
          'Use the AskUserQuestion tool to ask the question "AとBどちらがいいですか？" '
          + '(header "選択肢") with two options: A ("Aを選択します") and B ("Bを選択します"), multiSelect false.',
      },
      { kind: 'waitResults', n: 1 },
      { kind: 'wait', ms: 1000 },
      { kind: 'user', text: 'Say OK.' },
    ],
    permission: { holdMs: 0, respond: () => ({ behavior: 'deny', message: '' }) },
    done: { results: 2, controlResponses: 1, quietMs: 3000, maxMs: 120000 },
  },
  {
    id: '31-send-mid-turn',
    summary: 'send another message mid-response → whether the CLI absorbs it into the running turn (queue remove, reason absorbed_mid_turn) or makes it the next turn',
    flags: [...ISOLATED],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Run the Bash command `sleep 8; echo done` and then tell me its output in one line.' },
      { kind: 'wait', ms: 4000 },
      { kind: 'user', text: 'Also end your reply with the word hi.' },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    done: { results: 1, controlResponses: 1, quietMs: 8000, maxMs: 120000 },
  },
  {
    id: '32-interrupt-foreground',
    summary: 'interrupt while a foreground Bash runs → which result the CLI sends and whether it names the turn (stop seemed to do nothing on a real machine)',
    flags: [...ISOLATED],
    steps: [
      { kind: 'initialize' },
      { kind: 'wait', ms: 500 },
      { kind: 'user', text: 'Run the Bash command `sleep 30; echo fg-interrupt-done` in the foreground and then tell me its output.' },
      { kind: 'waitFor', line: 'assistant' },
      { kind: 'wait', ms: 4000 },
      { kind: 'interrupt' },
    ],
    permission: { holdMs: 0, respond: ALLOW },
    // Two control_responses, for initialize and interrupt. Quiet long enough to see whether sleep 30 still reports.
    done: { results: 1, controlResponses: 2, quietMs: 8000, maxMs: 90000 },
  },
];

// resume.at: from the raw first transcript, takes the parentUuid of the beforeUser-th user prompt line (string content). null if there is none.
export function resumeAtUuid(raw, beforeUser) {
  let n = 0;
  for (const line of String(raw).split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o?.type !== 'user' || typeof o.message?.content !== 'string') continue;
    n++;
    if (n === beforeUser) return typeof o.parentUuid === 'string' && o.parentUuid !== '' ? o.parentUuid : null;
  }
  return null;
}

// Flags of the second CLI (the same set as the host). Without at, unchanged from before.
export function resumeFlagsFor(resume, { baseFlags, firstId, newId, atUuid, scenarioFlags }) {
  const forkPart = resume.fork ? ['--fork-session'] : [];
  const atPart = resume.at ? [`--session-id=${newId}`, `--resume-session-at=${atUuid}`] : [];
  return [...baseFlags, `--resume=${firstId}`, ...forkPart, ...atPart, ...scenarioFlags];
}

// Rules for rewind scenario definitions. Returns the reason as a string, or null. Called by record.mjs (refuses before recording) and verify.mjs (check 9).
export function rewindDefinitionProblem(scenario) {
  if ((scenario.resume?.steps ?? []).some((st) => st.kind === 'rewindFiles')) {
    return 'rewindFiles may appear only in the steps of the first phase (verify check 9 counts userIndex over the user lines of the first phase)';
  }
  if (!(scenario.steps ?? []).some((st) => st.kind === 'rewindFiles')) return null;
  const r = scenario.rewindRead;
  if (!r || typeof r.includes !== 'string' || r.includes === '' || typeof r.excludes !== 'string' || r.excludes === '') {
    return 'a rewind scenario must give rewindRead a word to include and a word to exclude';
  }
  if (scenario.stdinFile !== true) {
    return 'a rewind scenario must set stdinFile to true (verify check 9 reads userIndex and the requests from the stdin lines)';
  }
  return null;
}

// Whether the text of the Read tool_result after the rewind is as expected (true only when it has the included word and not the excluded one).

export function readShowsRewind(text, rewindRead) {
  return typeof text === 'string' && text.includes(rewindRead.includes) && !text.includes(rewindRead.excludes);
}

export function findScenario(id) {
  return scenarios.find((s) => s.id === id);
}
