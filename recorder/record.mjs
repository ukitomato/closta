#!/usr/bin/env node
// Recording driver. Starts the claude CLI with bidirectional stream-json, drives it through the scenario steps,
// and writes stdout to fixtures.
//
// Invariants (the key design points):
//   - Every stdout line goes through scrubLine() before it is written to a file. There is no raw write path.
//   - After writing, findPii() audits the file, and any remaining PII discards the recording and fails
//     (the last line of defence against anything that bypassed the scrubber).
//   - stdin is not closed until the done check (closing early misses background self-resumption,
//     and AskUserQuestion reads it as "interrupted").
//
// Usage:
//   node record.mjs                 record all scenarios (overwrites existing ones; only when moving to a new version)
//   node record.mjs 07 06           record only the given ids (the manifest is updated only for those)
//   node record.mjs --list          list the scenarios
//   --allow-version-change          allow recording with a version different from the manifest (only when re-recording everything on a new version)
//   CLAUDE_BIN=/path/to/claude ...  name the claude binary explicitly (an absolute path to pin the version)
//
// Attachment scenarios (scenario.stdinFile true): the lines the recorder wrote to the CLI's stdin are scrubbed and kept next to the capture as <id>.stdin.jsonl
//   (the reference for comparing with the lines StdinEncoder writes; a userContent step sends content as an array of blocks).
//
// MCP scenarios (scenario.mcpServer present): starts a fake HTTP MCP server on 127.0.0.1 (it only offers one tool, echo)
//   and starts the CLI with its URL (http://localhost:<port>/mcp) via --mcp-config. Stops the server once recording ends (even on failure).
//   The port differs on every recording, so the scrubber replaces it with a fixed fake value (MCP_FAKE_PORT in scrub.mjs).
//   Control request steps (mcpStatus, mcpToggle, mcpReconnect) wait for the control_response with their request_id.
//   The CLI writes mcp_toggle into the temporary cwd's project entry in the user's ~/.claude.json. The scenario re-enables at the end, so only an empty array remains
//   (a failure midway leaves the name disabled. Harmless: the temporary cwd is never opened again. See the README).
//
// Per-scenario environment variables (scenario.env present): the child's environment is process.env with scenario.env laid over it (names with a null value are removed; the same for the second CLI of a resume).
//   Values are only non-secret flags (no secrets in scenarios; verify.mjs check 10 enforces this). Recorded in the manifest entry as env.
//   Once recording ends (even on failure), removes file-history/<every session id of this recording (the recorder's id and each phase's system/init id)> in the config root (regardless of env; a no-op if absent; cleanup.mjs).
//   A rewind_files step (rewindFiles) uses the uuid of a user line sent in that phase as user_message_id and waits for the answer to its request_id.
//
// Resume scenarios (scenario.resume present): starts the first CLI with --session-id, runs steps and closes it, scrubs the stored transcript of the cwd
//   (~/.claude/projects/<cwd with non-alphanumerics replaced by ->/<id>.jsonl) and keeps it next to the capture as the transcript,
//   then starts a second CLI with --resume on the same id and runs resume.steps. Both stdouts are kept in one capture, split by a boundary line
//   (type: recorder_boundary; a recorder mark, not a CLI line). The directory the CLI created for the recording is removed afterwards.
//   If resume.fork is true, --fork-session is added to the second CLI's flags; after the second closes and before the directory is removed, the names and line counts
//   of the .jsonl files in it go into the manifest's fork_transcripts (names replaced with <first id>, <second id>, <other>; no content is kept).
//
// Second-CLI scenarios (scenario.then present): after the first CLI closes, a second CLI with then.flags and a new session id (not a resume) runs then.steps,
//   in the same out after a recorder_boundary line (phase "then"). The manifest entry gets then_flags and exit_codes (a CLI that refuses to start exits on its own).
// Hidden-command scenarios (scenario.hideCommands present): the child's PATH is a directory of symlinks without those names (shimPathWithout), checked with command -v.

import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scenarios, findScenario, rewindDefinitionProblem, resumeAtUuid, resumeFlagsFor } from './scenarios.mjs';
import { removeFileHistory } from './cleanup.mjs';
import { newScrubState, scrubLine, scrubLines, findPii, createStreamScrubber, joinedFragments } from './scrub.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURES_DIR = path.join(
  REPO,
  'jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures',
);
const MANIFEST = path.join(FIXTURES_DIR, 'manifest.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

const BASE_FLAGS = [
  '-p',
  '--output-format', 'stream-json',
  '--input-format', 'stream-json',
  '--include-partial-messages',
  '--verbose',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fake HTTP MCP server. Answers only initialize, tools/list and ping, and offers one tool, echo. Never reaches outside (127.0.0.1).
// Returns { url, port, close }. The url has a form that matches http://localhost* in the managed settings allow list.
async function startFakeMcpServer(name) {
  const reply = (res, id, result) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  };
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let msg = null;
      try { msg = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
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
          reply(res, msg.id, {
            tools: [{ name: 'echo', description: 'Echo the text back.', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }],
          });
          break;
        case 'ping':
          reply(res, msg.id, {});
          break;
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

// A PATH of one directory holding a symlink to every command on the given PATH except the hidden names (the first one found wins, as a shell would pick).
// Directories under /mnt (the Windows drives on WSL) are skipped. Stops if the shell still finds a hidden name.
async function shimPathWithout(dir, searchPath, hidden) {
  await fsp.mkdir(dir, { recursive: true });
  const placed = new Set(hidden);
  for (const from of searchPath.split(':').filter((d) => d && !d.startsWith('/mnt/'))) {
    let names = [];
    try { names = await fsp.readdir(from); } catch { continue; }
    for (const name of names) {
      if (placed.has(name)) continue;
      placed.add(name);
      await fsp.symlink(path.join(from, name), path.join(dir, name));
    }
  }
  for (const name of hidden) {
    const found = execFileSync('/bin/sh', ['-c', `command -v ${name} || true`], { encoding: 'utf8', env: { PATH: dir } }).trim();
    if (found !== '') throw new Error(`hideCommands: ${name} is still found (${found})`);
  }
  return dir;
}

function claudeVersion() {
  const out = execFileSync(CLAUDE_BIN, ['--version'], { encoding: 'utf8' });
  const m = out.match(/(\d+\.\d+\.\d+)/);
  if (!m) throw new Error(`cannot parse claude --version: ${out}`);
  return m[1];
}

function initializeRequest() {
  // sdkMcpServers / webSearchIsolationExemptMcpServers must be string arrays.
  return {
    subtype: 'initialize',
    hooks: {},
    sdkMcpServers: [],
    webSearchIsolationExemptMcpServers: [],
  };
}

// Name of the directory where the CLI stores transcripts: the cwd with non-alphanumerics replaced by - (sdk.mjs in the SDK). Truncation of names over 200 characters is not recorded.
function transcriptDirName(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

function configRoot() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function projectsRoot() {
  return path.join(configRoot(), 'projects');
}

// The child's environment: process.env itself for scenarios without env. Otherwise env is laid over it, and names with a null value are removed.
function childEnvFor(scenario) {
  if (!scenario.env) return process.env;
  const env = { ...process.env };
  for (const [name, value] of Object.entries(scenario.env)) {
    if (value === null) delete env[name]; else env[name] = value;
  }
  return env;
}

async function recordOne(scenario, version) {
  process.stderr.write(`\n▶ ${scenario.id} — ${scenario.summary}\n`);

  // Temporary work directory, split into the cwd and a place outside it (to trigger can_use_tool).
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), `closta-rec-${scenario.id}-`));
  const cwd = path.join(work, 'cwd');
  const outside = path.join(work, 'outside');
  await fsp.mkdir(cwd);
  await fsp.mkdir(outside);
  // Files for subagents to read (placed in the cwd to avoid absolute paths).
  await fsp.writeFile(path.join(cwd, 'NOTES.md'), '# NOTES\nA small file that exists so a subagent can read and summarize it.\n');
  await fsp.writeFile(path.join(cwd, 'GUIDE.md'), '# GUIDE\nAnother small file for a parallel subagent to read and summarize.\n');
  // Files the scenario places in the cwd from the start (Edit targets, etc.).
  // A name may hold a directory (.claude/settings.json); the directory is created first.
  for (const [name, text] of Object.entries(scenario.seed ?? {})) {
    await fsp.mkdir(path.dirname(path.join(cwd, name)), { recursive: true });
    await fsp.writeFile(path.join(cwd, name), text);
  }

  const substitute = (text) => text.replaceAll('{OUTSIDE}', outside);

  // MCP scenarios: the fake server is started inside the try below (wherever a failure happens after that, cleanup stops it).
  let fakeMcp = null;
  let scenarioFlags = scenario.flags;
  const mcpName = scenario.mcpServer?.name ?? '';

  const sessionId = randomUUID();
  // hideCommands replaces PATH inside the try below (a copy, so process.env is untouched).
  const childEnv = { ...childEnvFor(scenario) };
  // What file checkpointing leaves behind. Collects the session ids born in this recording (the recorder's id and each phase's system/init id) and removes only their directories once recording ends (even on failure).
  const sessionIds = new Set([sessionId]);
  const cleanupFileHistory = () => removeFileHistory(configRoot(), [...sessionIds]);
  // Where the CLI stores the cwd's transcripts. Only resume scenarios read it. Only the directory of this name is removed once recording ends (even on failure).
  const transcriptDir = path.join(projectsRoot(), transcriptDirName(await fsp.realpath(cwd)));
  const transcriptOut = path.join(FIXTURES_DIR, `${scenario.id}.transcript.jsonl`);
  const transcriptPartial = `${transcriptOut}.partial`;
  // Attachment scenarios: the stdin lines the recorder wrote to the CLI.
  const stdinOut = path.join(FIXTURES_DIR, `${scenario.id}.stdin.jsonl`);
  const stdinPartial = `${stdinOut}.partial`;
  const stdinLines = [];

  const scrubState = newScrubState();
  const outFile = path.join(FIXTURES_DIR, `${scenario.id}.ndjson`);
  // The partial output goes to another name and replaces the capture only after passing the audit. A failure midway keeps the previous capture.
  const partial = `${outFile}.partial`;
  const out = createWriteStream(partial, { encoding: 'utf8' });

  // seen: counts of the line kinds seen (type and type/subtype). Read by the waitFor step.
  const state = { results: 0, controlResponses: 0, lastLineAt: Date.now(), lastCost: 0, stderr: '', initSessionId: null, seen: new Map(), answered: new Set() };
  let totalCost = 0;
  const sawKind = (key) => state.seen.set(key, (state.seen.get(key) ?? 0) + 1);
  const waiters = [];
  const checkWaiters = () => {
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].predicate(state)) {
        waiters[i].resolve();
        waiters.splice(i, 1);
      }
    }
  };
  const waitFor = (predicate, timeoutMs, label = '') => new Promise((resolve, reject) => {
    if (predicate(state)) { resolve(); return; }
    const w = { predicate, resolve };
    waiters.push(w);
    if (timeoutMs) {
      setTimeout(() => {
        const idx = waiters.indexOf(w);
        if (idx >= 0) { waiters.splice(idx, 1); reject(new Error(`waitFor timeout (${scenario.id}${label ? `: ${label}` : ''})`)); }
      }, timeoutMs);
    }
  });

  const respondPermission = scenario.permission?.respond
    || ((req) => ({ behavior: 'allow', updatedInput: req.input }));
  const holdMs = scenario.permission?.holdMs ?? 0;
  let ctrlN = 0;

  // Starts one CLI, runs steps, and closes it once done is met. stdout goes line by line through the scrubber into out.
  // The second run (resume) writes to the same out with the same scrubber state (carrying the learned values).
  const runPhase = async (phaseFlags, steps, done) => {
    // Recount per phase (waitFor and the done check only look at this phase's lines).
    state.results = 0;
    state.controlResponses = 0;
    state.lastLineAt = Date.now();
    state.seen = new Map();
    state.answered = new Set();
    state.initSessionId = null;
    // uuids of the user lines sent in this phase (in send order; looked up by rewindFiles' userIndex).
    const sentUserUuids = [];
    const child = spawn(CLAUDE_BIN, phaseFlags, { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.on('data', (d) => { state.stderr += d.toString(); });
    // A CLI that refuses to start exits before reading stdin; writing to it then must not crash the recorder.
    child.stdin.on('error', () => {});

    const send = (msg) => {
      const line = JSON.stringify(msg);
      if (scenario.stdinFile) stdinLines.push(line);
      child.stdin.write(`${line}\n`);
    };
    const control = (request) => {
      const requestId = `${scenario.id}-req-${(ctrlN += 1)}`;
      send({ type: 'control_request', request_id: requestId, request });
      return requestId;
    };
    // Sends a control request and waits for the control_response with its request_id.
    const controlAndWait = async (request, label) => {
      const requestId = control(request);
      try {
        await waitFor((st) => st.answered.has(requestId), done.maxMs, label);
      } catch (e) {
        // Timed out: report the step name (label) and the head of the CLI's stderr.
        throw new Error(`${e.message} (head of stderr: ${state.stderr.slice(0, 300) || 'empty'})`);
      }
    };
    const serverNameOf = (name) => name.replaceAll('{MCP}', mcpName);
    const sendUser = (content) => {
      const uuid = randomUUID();
      sentUserUuids.push(uuid);
      send({
        type: 'user',
        message: { role: 'user', content },
        session_id: sessionId,
        parent_tool_use_id: null,
        uuid,
      });
    };
    const handleCanUseTool = (env) => {
      const doIt = () => send({
        type: 'control_response',
        response: { subtype: 'success', request_id: env.request_id, response: respondPermission(env.request) },
      });
      if (holdMs > 0) setTimeout(doIt, holdMs); else doIt();
    };

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    // Block fragments (tool input in pieces) are joined before scrubbing. Held lines are written in their original order.
    const streamScrubber = createStreamScrubber(scrubState);
    const writeScrubbed = (lines) => { for (const l of lines) out.write(`${l}\n`); };
    rl.on('close', () => writeScrubbed(streamScrubber.flush()));
    rl.on('line', (line) => {
      if (line === '') return;
      state.lastLineAt = Date.now();
      writeScrubbed(streamScrubber.push(line));
      let o = null;
      try { o = JSON.parse(line); } catch { /* non-JSON lines are already saved as is; the state machine ignores them */ }
      if (o) {
        sawKind(String(o.type));
        if (o.subtype) sawKind(`${o.type}/${o.subtype}`);
        if (o.type === 'system' && o.subtype === 'init' && typeof o.session_id === 'string') { state.initSessionId = o.session_id; sessionIds.add(o.session_id); }
        if (o.type === 'result') {
          state.results += 1;
          if (typeof o.total_cost_usd === 'number') state.lastCost = Math.max(state.lastCost, o.total_cost_usd);
        }
        if (o.type === 'control_response') {
          state.controlResponses += 1;
          if (typeof o.response?.request_id === 'string') state.answered.add(o.response.request_id);
        }
        if (o.type === 'control_request' && o.request?.subtype === 'can_use_tool') handleCanUseTool(o);
      }
      checkWaiters();
    });

    let exited = false;
    let exitCode = null;
    child.on('exit', (code) => { exited = true; exitCode = code; });
    try {
      // Run the steps.
      for (const step of steps) {
        switch (step.kind) {
          case 'initialize': control(initializeRequest()); break;
          case 'getContextUsage': control({ subtype: 'get_context_usage' }); break;
          case 'getSettings': await controlAndWait({ subtype: 'get_settings' }, 'get_settings answer'); break;
          case 'applyFlagSettings': await controlAndWait({ subtype: 'apply_flag_settings', settings: step.settings }, 'apply_flag_settings answer'); break;
          case 'setModel': control({ subtype: 'set_model', model: step.model }); break;
          case 'setPermissionMode': control({ subtype: 'set_permission_mode', mode: step.mode }); break;
          case 'user': sendUser(substitute(step.text)); break;
          case 'userContent': sendUser(step.content); break;
          case 'wait': await sleep(step.ms); break;
          case 'waitResults': await waitFor((s) => s.results >= step.n, done.maxMs, `${step.n} results`); break;
          case 'waitFor':
            await waitFor((s) => (s.seen.get(step.line) ?? 0) >= (step.n ?? 1), done.maxMs, `${step.n ?? 1} of ${step.line}`);
            break;
          case 'interrupt': control({ subtype: 'interrupt' }); break;
          case 'mcpStatus': await controlAndWait({ subtype: 'mcp_status' }, 'mcp_status answer'); break;
          case 'mcpToggle':
            await controlAndWait({ subtype: 'mcp_toggle', serverName: serverNameOf(step.serverName), enabled: step.enabled }, 'mcp_toggle answer');
            break;
          case 'mcpReconnect':
            await controlAndWait({ subtype: 'mcp_reconnect', serverName: serverNameOf(step.serverName) }, 'mcp_reconnect answer');
            break;
          case 'rewindFiles': {
            const uuid = sentUserUuids[step.userIndex - 1];
            if (uuid === undefined) throw new Error(`rewindFiles: no user line sent at position ${step.userIndex} (${scenario.id})`);
            await controlAndWait({ subtype: 'rewind_files', user_message_id: uuid, dry_run: step.dryRun }, 'rewind_files answer');
            break;
          }
          default: throw new Error(`unknown step: ${step.kind}`);
        }
      }

      // Done check: the expected counts are met and quietMs of silence followed. Hard cap at maxMs.
      const start = Date.now();
      await new Promise((resolve) => {
        const t = setInterval(() => {
          const counted = state.results >= (done.results || 0) && state.controlResponses >= (done.controlResponses || 0);
          const quiet = (Date.now() - state.lastLineAt) >= (done.quietMs || 2000);
          const capped = (Date.now() - start) >= (done.maxMs || 30000);
          if ((counted && quiet) || capped) { clearInterval(t); resolve(); }
        }, 250);
      });

      // Close stdin and wait for the process to exit (kill after a grace period).
      child.stdin.end();
      await new Promise((resolve) => {
        if (exited) { resolve(); return; }
        const to = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } resolve(); }, 2000);
        }, 5000);
        child.on('exit', () => { clearTimeout(to); resolve(); });
      });
      // Let readline drain what the child wrote before it exited.
      if (exited) await sleep(200);
      rl.close();
    } catch (failure) {
      if (!exited) { try { child.kill('SIGKILL'); } catch { /* noop */ } }
      rl.close();
      throw failure;
    }
    exitCodes.push(exitCode);
    totalCost += state.lastCost;
    state.lastCost = 0;
  };

  // From the steps to the post-write audit. On any failure, stop the child, remove the partial output and the work directory, then rethrow.
  let content = '';
  let transcript = null;
  let stdinText = null;
  let forkTranscripts = null;
  const exitCodes = [];
  try {
    if (scenario.hideCommands) childEnv.PATH = await shimPathWithout(path.join(work, 'shim'), childEnv.PATH ?? '', scenario.hideCommands);
    if (scenario.mcpServer) {
      fakeMcp = await startFakeMcpServer(scenario.mcpServer.name);
      scrubState.mcpPorts.add(String(fakeMcp.port));
      scenarioFlags = [...scenario.flags, '--mcp-config', JSON.stringify({ mcpServers: { [scenario.mcpServer.name]: { type: 'http', url: fakeMcp.url } } })];
    }
    await runPhase([...BASE_FLAGS, `--session-id=${sessionId}`, ...scenarioFlags], scenario.steps, scenario.done);

    if (scenario.then) {
      // A second, unrelated CLI with its own flags and a new session id (not a resume). Same out, same scrubber state.
      const thenId = randomUUID();
      sessionIds.add(thenId);
      out.write(`${scrubLine(JSON.stringify({ type: 'recorder_boundary', phase: 'then', note: 'the lines after this one come from a second CLI started with other flags and a new session id (not a resume)' }), scrubState)}\n`);
      await runPhase([...BASE_FLAGS, `--session-id=${thenId}`, ...scenario.then.flags], scenario.then.steps, scenario.then.done);
    }

    if (scenario.resume) {
      // Read the transcript the first CLI wrote before starting the second (the second appends to the same file). The scrubber runs in two passes:
      // learn from all lines first, then replace (so earlier lines are scrubbed even when the line revealing a value comes later).
      const raw = await fsp.readFile(path.join(transcriptDir, `${sessionId}.jsonl`), 'utf8');
      // resume.at: the cut point uuid is taken from the raw transcript before scrubbing. If there is none, stop without writing anything.
      let atUuid = null;
      let newId = null;
      if (scenario.resume.at) {
        atUuid = resumeAtUuid(raw, scenario.resume.at.beforeUser);
        if (!atUuid) throw new Error(`${scenario.id}: cannot get the parentUuid of user prompt ${scenario.resume.at.beforeUser} from the first transcript — stopped without writing anything`);
        newId = randomUUID();
      }
      const lines = scrubLines(raw.split('\n').filter(Boolean), scrubState);
      transcript = `${lines.join('\n')}\n`;
      // The boundary line is a recorder mark, not a CLI line.
      const boundaryNote = scenario.resume.fork
        ? 'the lines after this one come from a second CLI started with --resume and --fork-session (a new session id)'
        : 'the lines after this one come from a second CLI started with --resume of the same session id';
      out.write(`${scrubLine(JSON.stringify({ type: 'recorder_boundary', phase: 'resume', note: boundaryNote }), scrubState)}\n`);
      await runPhase(
        resumeFlagsFor(scenario.resume, { baseFlags: BASE_FLAGS, firstId: sessionId, newId, atUuid, scenarioFlags }),
        scenario.resume.steps,
        scenario.resume.done,
      );
      if (scenario.resume.at && state.initSessionId !== newId) {
        throw new Error(`${scenario.id}: the second system/init session_id differs from the --session-id passed (${state.initSessionId} / ${newId}) — recording discarded`);
      }
      if (scenario.resume.fork) {
        // Before removing the directory, read only the names and line counts of its .jsonl files (to keep where a fork creates transcripts; no content is kept).
        const secondId = state.initSessionId;
        const nameOf = (file) => {
          const stem = file.replace(/\.jsonl$/, '');
          if (stem === sessionId) return '<first id>';
          if (secondId && stem === secondId) return '<second id>';
          return '<other>';
        };
        let names = [];
        try { names = (await fsp.readdir(transcriptDir)).filter((f) => f.endsWith('.jsonl')).sort(); } catch { /* a missing directory is a finding too */ }
        forkTranscripts = [];
        for (const f of names) {
          const text = await fsp.readFile(path.join(transcriptDir, f), 'utf8');
          forkTranscripts.push({ file: `${nameOf(f)}.jsonl`, lines: text.split('\n').filter(Boolean).length });
        }
      }
    }
    await new Promise((resolve) => out.end(resolve));

    // Post-write PII audit. Any hit discards the recording and fails.
    content = await fsp.readFile(partial, 'utf8');
    const pii = [
      ...findPii(content, scrubState.username, scrubState),
      ...joinedFragments(content.split('\n').filter(Boolean)).flatMap((j) => findPii(j, scrubState.username, scrubState)),
    ];
    if (pii.length > 0) throw new Error(`PII found in ${scenario.id}: ${JSON.stringify(pii.slice(0, 3))} — recording discarded`);
    if (content.split('\n').filter(Boolean).length === 0) {
      throw new Error(`${scenario.id}: recorded 0 lines (stderr: ${state.stderr.slice(0, 300)})`);
    }
    if (scenario.stdinFile) {
      // Run through the scrubber (with the same state as stdout, carrying the learned values). The audit too.
      stdinText = `${stdinLines.map((l) => scrubLine(l, scrubState)).join('\n')}\n`;
      const stdinPii = findPii(stdinText, scrubState.username, scrubState);
      if (stdinPii.length > 0) throw new Error(`PII found in the stdin of ${scenario.id}: ${JSON.stringify(stdinPii.slice(0, 3))} — recording discarded`);
      await fsp.writeFile(stdinPartial, stdinText);
      await fsp.rename(stdinPartial, stdinOut);
    }
    if (transcript !== null) {
      const transcriptPii = findPii(transcript, scrubState.username, scrubState);
      if (transcriptPii.length > 0) throw new Error(`PII found in the transcript of ${scenario.id}: ${JSON.stringify(transcriptPii.slice(0, 3))} — recording discarded`);
      await fsp.writeFile(transcriptPartial, transcript);
      await fsp.rename(transcriptPartial, transcriptOut);
    }
    await fsp.rename(partial, outFile);
  } catch (failure) {
    await new Promise((resolve) => out.end(resolve));
    await fsp.rm(partial, { force: true });
    await fsp.rm(transcriptPartial, { force: true });
    await fsp.rm(stdinPartial, { force: true });
    await fsp.rm(work, { recursive: true, force: true });
    await fsp.rm(transcriptDir, { recursive: true, force: true });
    await cleanupFileHistory();
    if (fakeMcp) await fakeMcp.close();
    throw failure;
  }
  if (fakeMcp) await fakeMcp.close();
  await fsp.rm(work, { recursive: true, force: true });
  await fsp.rm(transcriptDir, { recursive: true, force: true });
  await cleanupFileHistory();

  const lines = content.split('\n').filter(Boolean).length;
  const sha256 = createHash('sha256').update(content).digest('hex');
  process.stderr.write(`  ✓ ${lines} lines / $${totalCost.toFixed(4)}\n`);

  const entry = {
    scenario: scenario.id,
    file: `${scenario.id}.ndjson`,
    claude_version: version,
    recorded_at: new Date().toISOString(),
    // MCP scenarios record the --mcp-config value (the fake server's URL) as <generated>.
    flags: [...BASE_FLAGS, '--session-id=<generated>', ...scenario.flags, ...(fakeMcp ? ['--mcp-config', '<generated>'] : [])],
    sha256,
    lines,
    cost_usd: Number(totalCost.toFixed(6)),
  };
  if (transcript !== null) {
    // Resume scenarios: the second CLI's flags (--resume on the same id) and the details of the transcript kept next to the capture.
    entry.resume_flags = [...BASE_FLAGS, '--resume=<same id>', ...(scenario.resume.fork ? ['--fork-session'] : []), ...(scenario.resume.at ? ['--session-id=<generated>', '--resume-session-at=<uuid>'] : []), ...scenario.flags];
    entry.transcript_file = `${scenario.id}.transcript.jsonl`;
    entry.transcript_sha256 = createHash('sha256').update(transcript).digest('hex');
    entry.transcript_lines = transcript.split('\n').filter(Boolean).length;
    if (forkTranscripts !== null) entry.fork_transcripts = forkTranscripts;
  }
  if (scenario.env) entry.env = scenario.env;
  if (scenario.hideCommands) entry.hidden_commands = scenario.hideCommands;
  if (scenario.then) {
    entry.then_flags = [...BASE_FLAGS, '--session-id=<generated>', ...scenario.then.flags];
    entry.exit_codes = exitCodes;
  }
  if (stdinText !== null) {
    // Attachment scenarios: the details of the stdin lines the recorder wrote to the CLI (the <id>.stdin.jsonl next to the capture).
    entry.stdin_file = `${scenario.id}.stdin.jsonl`;
    entry.stdin_sha256 = createHash('sha256').update(stdinText).digest('hex');
    entry.stdin_lines = stdinText.split('\n').filter(Boolean).length;
  }
  return entry;
}

async function loadManifest() {
  try {
    return JSON.parse(await fsp.readFile(MANIFEST, 'utf8'));
  } catch {
    return null;
  }
}

async function writeManifest(entriesById, version) {
  const scenarioOrder = scenarios.map((s) => s.id);
  const list = [...entriesById.values()].sort(
    (a, b) => scenarioOrder.indexOf(a.scenario) - scenarioOrder.indexOf(b.scenario),
  );
  const versions = [...new Set(list.map((e) => e.claude_version))];
  const manifest = {
    generated_at: new Date().toISOString(),
    recorder: 'recorder/record.mjs',
    scrubbed: true,
    claude_version: versions.length === 1 ? versions[0] : versions,
    base_flags: BASE_FLAGS,
    scenario_count: list.length,
    scenarios: list,
  };
  await fsp.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    for (const s of scenarios) process.stdout.write(`${s.id}\t${s.summary}\n`);
    return;
  }
  const ids = argv.filter((a) => !a.startsWith('-'));
  const targets = ids.length ? ids.map((id) => {
    const s = findScenario(id) || findScenario(scenarios.find((x) => x.id.startsWith(`${id}-`))?.id);
    if (!s) throw new Error(`unknown scenario: ${id}`);
    return s;
  }) : scenarios;
  for (const s of targets) {
    const problem = rewindDefinitionProblem(s);
    if (problem) throw new Error(`scenario ${s.id} definition does not fit: ${problem}`);
  }

  await fsp.mkdir(FIXTURES_DIR, { recursive: true });
  const version = claudeVersion();
  process.stderr.write(`recording ${targets.length} scenarios with claude ${version} (output: ${path.relative(REPO, FIXTURES_DIR)}/)\n`);

  // Start from the existing manifest and replace only what was recorded.
  const existing = await loadManifest();
  // Do not mix versions: if the version differs from the existing manifest, stop before writing anything. The flag lets it through only when re-recording everything on a new version.
  if (existing && typeof existing.claude_version === 'string' && existing.claude_version !== version
      && !argv.includes('--allow-version-change')) {
    throw new Error(
      `claude ${version} differs from ${existing.claude_version} in the manifest. Pass a binary of the same version to CLAUDE_BIN as an absolute path`
      + ' (use --allow-version-change only when re-recording on a new version)',
    );
  }
  const entriesById = new Map();
  if (existing?.scenarios) for (const e of existing.scenarios) entriesById.set(e.scenario, e);

  let total = 0;
  const failed = [];
  for (const s of targets) {
    try {
      const entry = await recordOne(s, version);
      entriesById.set(entry.scenario, entry);
      total += entry.cost_usd || 0;
    } catch (e) {
      failed.push(s.id);
      process.stderr.write(`  ✗ ${s.id}: ${e.message}\n`);
    }
  }

  const manifest = await writeManifest(entriesById, version);
  process.stderr.write(`\n=== done: ${targets.length - failed.length}/${targets.length} scenarios / about $${total.toFixed(4)} ===\n`);
  process.stderr.write(`manifest: ${path.relative(REPO, MANIFEST)} (version=${JSON.stringify(manifest.claude_version)})\n`);
  if (failed.length) {
    process.stderr.write(`failed: ${failed.join(', ')}\n`
);
    process.exitCode = 1;
  }
}

main().catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exit(1); });
