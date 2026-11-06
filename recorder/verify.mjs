#!/usr/bin/env node
// Checks the recordings. It does not call the real API, so it runs both in CI and locally.
// Mechanically checks the conditions for the recordings to count as done:
//   1. All scenarios were recorded with the same claude version
//   2. Zero PII hits (the same check as scrub.mjs)
//   3. The sha256 values in manifest.json match the actual files
//   4. Scenario definitions (all of scenarios.mjs) and fixtures correspond one to one
//   5. The replay.jsonl built from the captures (jetbrains/src/test/protocol-fixtures) also has zero PII hits
//   6. Resume scenarios (manifest entries with transcript_file): sha256, line count and PII of the transcript next to it, exactly one
//      boundary line, the same session_id in both stdouts, no user or assistant line of the first in the second, and the second's flags use --resume without --session-id
//   7. Attachment scenarios (manifest entries with stdin_file): sha256, line count and PII of the stdin lines next to it, user line content
//      is an array of blocks with image and document blocks, and both turns end with a successful result
//   8. MCP scenarios (scenarios.mjs entries with mcpServer): flags have --strict-mcp-config and --mcp-config, the stdin lines are the sequence of
//      control requests (mcp_status, mcp_toggle, mcp_reconnect), stdout has 4 mcp_status answers with the 1st, 3rd and 4th connected (with tool echo)
//      and the 2nd disabled, the mcp_toggle and mcp_reconnect answers are success, the last answer (unknown name) is an error, and config.url uses the fixed fake port
//   Variant of 6 (scenario definitions with resume.fork): instead of "both session_ids are the same", the system/init session_ids of the first and second differ,
//      the second stdout has one session_id, the second's last result is success with is_error false, and resume_flags has --fork-session. fork_transcripts is not checked
//   9. Rewind scenarios, in two parts: (a) scenario definitions (rewindFiles in steps or resume.steps) are not caught by rewindDefinitionProblem
//      (even without a manifest entry; rewindFiles only in the first phase, words in rewindRead, stdinFile true), (b) manifest entries of scenarios with no reason: the stdin rewind_files requests match the definition in count and dry_run,
//      user_message_id is the uuid of the userIndex-th user line of stdin, stdout has a control_response per request_id that is success with canRewind true,
//      and after the real rewind's answer there is a Read tool_result that has the definition's rewindRead included word and not the excluded word (readShowsRewind)
//   10. Scenario env (every scenario definition with env): names start with CLAUDE_CODE_ and values are true or null, and the manifest entry's env matches the definition
//
// Usage: node verify.mjs   (non-zero exit on failure)

import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scenarios, rewindDefinitionProblem, readShowsRewind } from './scenarios.mjs';
import { findPii, joinedFragments, MCP_FAKE_PORT } from './scrub.mjs';
import { replayedLines } from './replay.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURES_DIR = path.join(
  REPO,
  'jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures',
);
const MANIFEST = path.join(FIXTURES_DIR, 'manifest.json');
// The golden built by passing the captures through core's fold, the presenter's projection, the differ and the sender. It is audited too.
const REPLAY = path.join(REPO, 'jetbrains/src/test/protocol-fixtures/replay.jsonl');

async function main() {
  const problems = [];
  const ok = (msg) => process.stdout.write(`  ✓ ${msg}\n`);
  const bad = (msg) => { problems.push(msg); process.stdout.write(`  ✗ ${msg}\n`); };

  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(MANIFEST, 'utf8'));
  } catch (e) {
    process.stderr.write(`cannot read manifest.json: ${e.message}\n`);
    process.exit(1);
  }

  // 1. A single version.
  if (Array.isArray(manifest.claude_version)) {
    bad(`mixed versions: ${manifest.claude_version.join(', ')}`);
  } else {
    ok(`single claude version: ${manifest.claude_version}`);
  }

  const entries = manifest.scenarios || [];

  // 4. Correspondence with the scenario definitions.
  const defIds = new Set(scenarios.map((s) => s.id));
  const manIds = new Set(entries.map((e) => e.scenario));
  for (const id of defIds) if (!manIds.has(id)) bad(`scenario missing from manifest: ${id}`);
  for (const id of manIds) if (!defIds.has(id)) bad(`manifest entry with no definition: ${id}`);
  if (entries.length === scenarios.length && [...defIds].every((id) => manIds.has(id))) {
    ok(`${entries.length} scenarios match the definitions`);
  }

  // 2 & 3. PII and sha256 of each file.
  let piiTotal = 0;
  for (const e of entries) {
    const file = path.join(FIXTURES_DIR, e.file);
    let content;
    try {
      content = await fsp.readFile(file, 'utf8');
    } catch {
      bad(`file missing: ${e.file}`);
      continue;
    }
    // Whether the version also matches per entry.
    if (!Array.isArray(manifest.claude_version) && e.claude_version !== manifest.claude_version) {
      bad(`${e.file}: version differs from the overall one (${e.claude_version})`);
    }
    // sha256.
    const sha = createHash('sha256').update(content).digest('hex');
    if (sha !== e.sha256) bad(`${e.file}: sha256 mismatch`);
    // PII.
    // Values streamed in pieces (tool input, etc.) are also checked after joining them per block.
    const pii = [
      ...findPii(content),
      ...joinedFragments(content.split('\n').filter(Boolean)).flatMap((j) => findPii(j)),
    ];
    piiTotal += pii.length;
    if (pii.length) bad(`${e.file}: ${pii.length} PII hits (${JSON.stringify(pii.slice(0, 2))})`);
  }
  if (piiTotal === 0) ok('0 PII hits');
  if (entries.every((e) => problems.every((p) => !p.includes(e.file)))) ok('all sha256 match');

  // 6. Resume scenarios.
  for (const e of entries.filter((x) => x.transcript_file)) {
    const label = e.scenario;
    let transcript = null;
    try {
      transcript = await fsp.readFile(path.join(FIXTURES_DIR, e.transcript_file), 'utf8');
    } catch {
      bad(`${label}: transcript file missing: ${e.transcript_file}`);
    }
    if (transcript !== null) {
      if (createHash('sha256').update(transcript).digest('hex') !== e.transcript_sha256) bad(`${e.transcript_file}: sha256 mismatch`);
      const transcriptLines = transcript.split('\n').filter(Boolean);
      if (transcriptLines.length !== e.transcript_lines) bad(`${e.transcript_file}: line count differs from manifest (${transcriptLines.length} / ${e.transcript_lines})`);
      const transcriptPii = findPii(transcript);
      if (transcriptPii.length) bad(`${e.transcript_file}: ${transcriptPii.length} PII hits (${JSON.stringify(transcriptPii.slice(0, 2))})`);
      else ok(`${e.transcript_file}: 0 PII hits, sha256 matches, ${transcriptLines.length} lines`);
      const parsed = transcriptLines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
      if (parsed.some((r) => r === null)) bad(`${e.transcript_file}: has lines that cannot be read as JSON`);
      const kinds = new Set(parsed.filter(Boolean).map((r) => r.type));
      if (!kinds.has('user') || !kinds.has('assistant')) bad(`${e.transcript_file}: no user or assistant line`);
      const blocks = parsed.filter((r) => r && (r.type === 'user' || r.type === 'assistant')).flatMap((r) => (Array.isArray(r.message?.content) ? r.message.content : []));
      // Requires tool lines in the transcript. Only an explicit mark in the scenario definition lifts this (transcriptTools: false; 27, which uses no tools). A missing definition is an error.
      const def6 = scenarios.find((sc) => sc.id === e.scenario);
      if (def6 === undefined) bad(`${e.transcript_file}: scenario definition not found (${e.scenario})`);
      else if (def6.transcriptTools !== false && (!blocks.some((b) => b.type === 'tool_use') || !blocks.some((b) => b.type === 'tool_result'))) bad(`${e.transcript_file}: no tool_use and tool_result`);
    }
    let capture = [];
    try {
      capture = (await fsp.readFile(path.join(FIXTURES_DIR, e.file), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (err) {
      bad(`${label}: cannot read the capture as JSON lines: ${err.message}`);
    }
    const at = capture.map((r, i) => (r.type === 'recorder_boundary' ? i : -1)).filter((i) => i >= 0);
    if (at.length !== 1) { bad(`${label}: ${at.length} boundary lines (should be 1)`); continue; }
    const first = capture.slice(0, at[0]);
    const second = capture.slice(at[0] + 1);
    const ids = (rows) => new Set(rows.map((r) => r.session_id).filter(Boolean));
    const [id1, id2] = [ids(first), ids(second)];
    if (scenarios.find((x) => x.id === label)?.resume?.fork) {
      // Fork scenarios get a new session id. Compare init lines only (user lines sent to the second CLI carry the original id, so all lines could mix).
      const initIds = (rows) => new Set(rows.filter((r) => r.type === 'system' && r.subtype === 'init').map((r) => r.session_id));
      const [init1, init2] = [initIds(first), initIds(second)];
      if (init1.size === 1 && init2.size === 1 && [...init1][0] !== [...init2][0] && id2.size === 1) ok(`${label}: the second system/init session_id differs from the first, and the second stdout has one session_id`);
      else bad(`${label}: unexpected fork session_id (init ${[...init1]} / ${[...init2]}, second stdout ${[...id2]})`);
      const secondResults = second.filter((r) => r.type === 'result');
      const lastResult = secondResults[secondResults.length - 1];
      if (lastResult && lastResult.subtype === 'success' && lastResult.is_error === false) ok(`${label}: the second's last result is success`);
      else bad(`${label}: the second's last result is not success with is_error false (${lastResult ? `${lastResult.subtype}/${lastResult.is_error}` : 'no result'})`);
      if ((e.resume_flags ?? []).includes('--fork-session')) ok(`${label}: resume_flags has --fork-session`);
      else bad(`${label}: resume_flags has no --fork-session`);
    } else if (id1.size === 1 && id2.size === 1 && [...id1][0] === [...id2][0]) ok(`${label}: both stdouts have the same session_id`);
    else bad(`${label}: session_ids do not match (${[...id1]} / ${[...id2]})`);
    const speech = (rows) => rows.filter((r) => r.type === 'user' || r.type === 'assistant');
    const replayed = replayedLines(first, second);
    if (speech(first).length > 0 && replayed.length === 0) ok(`${label}: the second stdout has none of the first's ${speech(first).length} user and assistant lines`);
    else bad(`${label}: the second stdout replays ${replayed.length} lines of the first (or the first has no lines)`);
    const resumeFlags = e.resume_flags ?? [];
    const def = scenarios.find((x) => x.id === label);
    if (def?.resume?.at) {
      if (['--resume=', '--fork-session', '--session-id=', '--resume-session-at='].every((p) => resumeFlags.some((f) => f.startsWith(p)))) ok(`${label}: resume_flags has --fork-session, --session-id= and --resume-session-at=`);
      else bad(`${label}: resume_flags lacks one of --fork-session / --session-id= / --resume-session-at= (${resumeFlags})`);
    } else if (resumeFlags.some((f) => f.startsWith('--resume=')) && !resumeFlags.some((f) => f.startsWith('--session-id'))) ok(`${label}: the second's flags use --resume without --session-id`);
    else bad(`${label}: resume_flags is not --resume only`);
    if (def?.resumeAnswer) {
      const text = second.filter((r) => r.type === 'assistant').flatMap((r) => (Array.isArray(r.message?.content) ? r.message.content : [])).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (text.includes(def.resumeAnswer.includes) && !text.includes(def.resumeAnswer.excludes)) ok(`${label}: assistant text after the boundary has ${def.resumeAnswer.includes} and not ${def.resumeAnswer.excludes}`);
      else bad(`${label}: unexpected assistant text after the boundary (${JSON.stringify(text.slice(0, 200))})`);
    }
  }

  // 7. Attachment scenarios.
  for (const e of entries.filter((x) => x.stdin_file)) {
    const label = e.scenario;
    let stdin = null;
    try {
      stdin = await fsp.readFile(path.join(FIXTURES_DIR, e.stdin_file), 'utf8');
    } catch {
      bad(`${label}: stdin lines file missing: ${e.stdin_file}`);
    }
    if (stdin !== null) {
      if (createHash('sha256').update(stdin).digest('hex') !== e.stdin_sha256) bad(`${e.stdin_file}: sha256 mismatch`);
      const stdinLines = stdin.split('\n').filter(Boolean);
      if (stdinLines.length !== e.stdin_lines) bad(`${e.stdin_file}: line count differs from manifest (${stdinLines.length} / ${e.stdin_lines})`);
      const stdinPii = findPii(stdin);
      if (stdinPii.length) bad(`${e.stdin_file}: ${stdinPii.length} PII hits (${JSON.stringify(stdinPii.slice(0, 2))})`);
      else ok(`${e.stdin_file}: 0 PII hits, sha256 matches, ${stdinLines.length} lines`);
      const parsed = stdinLines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
      if (parsed.some((r) => r === null)) bad(`${e.stdin_file}: has lines that cannot be read as JSON`);
      // Only attachment scenarios (userContent in steps) check the user line blocks. MCP scenarios are checked in 8.
      const attachment = scenarios.find((x) => x.id === label)?.steps.some((st) => st.kind === 'userContent');
      if (attachment) {
        const users = parsed.filter((r) => r && r.type === 'user');
        const kinds = users.flatMap((r) => (Array.isArray(r.message?.content) ? r.message.content.map((b) => b.type) : []));
        if (users.length >= 2 && kinds.includes('image') && kinds.includes('document') && kinds.includes('text')) ok(`${label}: ${users.length} user lines have image, document and text blocks`);
        else bad(`${label}: user line content is not an array of image, document and text blocks`);
      }
    }
    if (!scenarios.find((x) => x.id === e.scenario)?.steps.some((st) => st.kind === 'userContent')) continue;
    try {
      const capture = (await fsp.readFile(path.join(FIXTURES_DIR, e.file), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const results = capture.filter((r) => r.type === 'result');
      if (results.length === 2 && results.every((r) => r.subtype === 'success' && r.is_error === false)) ok(`${label}: both turns end with a successful result`);
      else bad(`${label}: results are not two successes (${results.map((r) => `${r.subtype}/${r.is_error}`).join(', ')})`);
    } catch (err) {
      bad(`${label}: cannot read the capture as JSON lines: ${err.message}`);
    }
  }

  // 8. MCP scenarios.
  for (const e of entries.filter((x) => scenarios.find((d) => d.id === x.scenario)?.mcpServer)) {
    const label = e.scenario;
    const flags = e.flags ?? [];
    if (flags.includes('--strict-mcp-config') && flags.includes('--mcp-config')) ok(`${label}: flags have --strict-mcp-config and --mcp-config`);
    else bad(`${label}: flags lack --strict-mcp-config and --mcp-config`);
    let capture = [];
    let stdin = [];
    try {
      capture = (await fsp.readFile(path.join(FIXTURES_DIR, e.file), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
      stdin = (await fsp.readFile(path.join(FIXTURES_DIR, e.stdin_file ?? ''), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (err) {
      bad(`${label}: cannot read the capture or stdin lines as JSON lines: ${err.message}`);
      continue;
    }
    const subtypeOf = new Map(stdin.filter((r) => r.type === 'control_request').map((r) => [r.request_id, r.request?.subtype]));
    const replies = capture.filter((r) => r.type === 'control_response').map((r) => r.response).filter((r) => r && subtypeOf.has(r.request_id));
    const statuses = replies.filter((r) => subtypeOf.get(r.request_id) === 'mcp_status');
    const servers = (r) => r.response?.mcpServers ?? [];
    const statusOf = (r) => servers(r).map((sv) => sv.status);
    if (statuses.length === 4 && statuses.every((r) => r.subtype === 'success')) ok(`${label}: 4 mcp_status answers`);
    else bad(`${label}: not 4 successful mcp_status answers (${statuses.length})`);
    const [s1, s2, s3, s4] = statuses;
    const connectedWithTool = (r) => r && servers(r).length === 1 && servers(r)[0].status === 'connected' && (servers(r)[0].tools ?? []).some((t) => t.name === 'echo');
    if (connectedWithTool(s1) && connectedWithTool(s3) && connectedWithTool(s4)) ok(`${label}: the 1st, 3rd and 4th are connected with tool echo`);
    else bad(`${label}: the 1st, 3rd and 4th mcp_status are not connected with tool echo`);
    if (s2 && statusOf(s2).length === 1 && statusOf(s2)[0] === 'disabled') ok(`${label}: the 2nd is disabled`);
    else bad(`${label}: the 2nd mcp_status is not disabled`);
    const others = replies.filter((r) => ['mcp_toggle', 'mcp_reconnect'].includes(subtypeOf.get(r.request_id)));
    const lastOne = others[others.length - 1];
    const rest = others.slice(0, -1);
    if (rest.length === 3 && rest.every((r) => r.subtype === 'success')) ok(`${label}: mcp_toggle and mcp_reconnect answers are success (3)`);
    else bad(`${label}: the mcp_toggle and mcp_reconnect answers before the last are not 3 successes`);
    if (lastOne && lastOne.subtype === 'error' && typeof lastOne.error === 'string' && subtypeOf.get(lastOne.request_id) === 'mcp_toggle') ok(`${label}: the last answer (mcp_toggle with an unknown name) is an error`);
    else bad(`${label}: the last answer is not an mcp_toggle error`);
    const urls = statuses.flatMap((r) => servers(r).map((sv) => sv.config?.url).filter(Boolean));
    if (urls.length > 0 && urls.every((u) => u === `http://localhost:${MCP_FAKE_PORT}/mcp`)) ok(`${label}: config.url uses the fixed fake port`);
    else bad(`${label}: config.url is not the fixed fake value (${[...new Set(urls)]})`);
  }

  // 9. Rewind scenarios. (a) Check every definition, and (b) check manifest entries only for scenarios with no reason.
  const rewindOk = new Set();
  for (const d of scenarios.filter((x) => [...x.steps, ...(x.resume?.steps ?? [])].some((st) => st.kind === 'rewindFiles'))) {
    const problem = rewindDefinitionProblem(d);
    if (problem) bad(`${d.id}: rewind scenario definition does not fit: ${problem}`);
    else { ok(`${d.id}: rewind scenario definition follows the rules`); rewindOk.add(d.id); }
  }
  for (const e of entries.filter((x) => rewindOk.has(x.scenario))) {
    const label = e.scenario;
    const def = scenarios.find((d) => d.id === label);
    const wanted = def.steps.filter((st) => st.kind === 'rewindFiles');
    let capture = [];
    let stdin = [];
    try {
      capture = (await fsp.readFile(path.join(FIXTURES_DIR, e.file), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
      stdin = (await fsp.readFile(path.join(FIXTURES_DIR, e.stdin_file ?? ''), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (err) {
      bad(`${label}: cannot read the capture or stdin lines as JSON lines: ${err.message}`);
      continue;
    }
    const rewinds = stdin.filter((r) => r.type === 'control_request' && r.request?.subtype === 'rewind_files');
    const userUuids = stdin.filter((r) => r.type === 'user').map((r) => r.uuid);
    if (rewinds.length === wanted.length && wanted.every((w, i) => rewinds[i].request.dry_run === w.dryRun)) ok(`${label}: ${rewinds.length} rewind_files requests in stdin with dry_run as defined`);
    else bad(`${label}: stdin rewind_files requests do not match the definition (${rewinds.length} / dry_run ${rewinds.map((r) => r.request?.dry_run)})`);
    if (rewinds.length === wanted.length && wanted.every((w, i) => userUuids[w.userIndex - 1] !== undefined && rewinds[i].request.user_message_id === userUuids[w.userIndex - 1])) ok(`${label}: user_message_id is the uuid of the userIndex-th user line of stdin`);
    else bad(`${label}: user_message_id is not the uuid of the userIndex-th user line of stdin`);
    const answerAt = rewinds.map((r) => capture.findIndex((c) => c.type === 'control_response' && c.response?.request_id === r.request_id));
    const answers = answerAt.map((i) => (i >= 0 ? capture[i].response : null));
    if (answers.length === wanted.length && answers.every((a) => a && a.subtype === 'success' && a.response?.canRewind === true)) ok(`${label}: rewind_files answers are success with canRewind true (${answers.length})`);
    else bad(`${label}: rewind_files answers are not success with canRewind true (${answers.map((a) => (a ? `${a.subtype}/${a.response?.canRewind ?? a.error}` : 'no answer')).join(', ')})`);
    // A Read tool_result after the answer to the real (last) rewind shows the rewound content (first) and not second.
    const after = answerAt.length > 0 && answerAt[answerAt.length - 1] >= 0 ? capture.slice(answerAt[answerAt.length - 1] + 1) : [];
    const blocks = after.filter((r) => r.type === 'user').flatMap((r) => (Array.isArray(r.message?.content) ? r.message.content : []));
    const readUseIds = new Set(after.filter((r) => r.type === 'assistant').flatMap((r) => (Array.isArray(r.message?.content) ? r.message.content : []))
      .filter((b) => b.type === 'tool_use' && b.name === 'Read').map((b) => b.id));
    const textOf = (b) => (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((x) => x?.text ?? '').join('\n') : '');
    const reads = blocks.filter((b) => b.type === 'tool_result' && readUseIds.has(b.tool_use_id)).map(textOf);
    const { includes, excludes } = def.rewindRead;
    if (reads.some((t) => readShowsRewind(t, def.rewindRead))) ok(`${label}: the Read tool_result after the rewind has ${includes} and not ${excludes}`);
    else bad(`${label}: no Read tool_result after the rewind has ${includes} without ${excludes} (${reads.length} results)`);
  }

  // 10. Scenario env.
  for (const d of scenarios.filter((x) => x.env)) {
    const entry = entries.find((x) => x.scenario === d.id);
    const bads = Object.entries(d.env).filter(([name, value]) => !name.startsWith('CLAUDE_CODE_') || !(value === 'true' || value === null));
    if (bads.length === 0) ok(`${d.id}: env names start with CLAUDE_CODE_ and values are true or null`);
    else bad(`${d.id}: env has entries that do not start with CLAUDE_CODE_ or whose value is not true or null (${bads.map(([n]) => n)})`);
    if (entry && JSON.stringify(entry.env ?? null) === JSON.stringify(d.env)) ok(`${d.id}: manifest env matches the definition`);
    else if (entry) bad(`${d.id}: manifest env differs from the definition`);
  }

  // 11. Live effort changes: the request of step i is <id>-req-(i+1). The apply_flag_settings answer is success, the following
  // get_settings has applied.effort at the level set (null means the model default, a string), the first get_settings has the --effort level, and applied.model is a string.
  for (const d of scenarios.filter((x) => x.steps.some((st) => st.kind === 'applyFlagSettings'))) {
    const entry = entries.find((x) => x.scenario === d.id);
    if (!entry) continue;
    let capture = [];
    try {
      capture = (await fsp.readFile(path.join(FIXTURES_DIR, entry.file), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (err) {
      bad(`${d.id}: cannot read the capture as JSON lines: ${err.message}`);
      continue;
    }
    const answerOf = (index) => capture.find((c) => c.type === 'control_response' && c.response?.request_id === `${d.id}-req-${index + 1}`)?.response;
    const flagAt = d.flags.indexOf('--effort');
    let wanted = flagAt >= 0 ? d.flags[flagAt + 1] : undefined;
    const problemsHere = [];
    d.steps.forEach((st, i) => {
      const answer = answerOf(i);
      if (st.kind === 'applyFlagSettings') {
        if (answer?.subtype !== 'success') problemsHere.push(`req-${i + 1} is not success`);
        wanted = st.settings.effortLevel;
      } else if (st.kind === 'getSettings') {
        const applied = answer?.response?.applied;
        const effort = applied?.effort;
        const fits = wanted === null ? typeof effort === 'string' && effort.length > 0 : effort === wanted;
        if (!fits) problemsHere.push(`req-${i + 1} applied.effort is ${JSON.stringify(effort)} (expected ${JSON.stringify(wanted)})`);
        if (typeof applied?.model !== 'string' || applied.model.length === 0) problemsHere.push(`req-${i + 1} has no applied.model`);
      }
    });
    if (problemsHere.length === 0) ok(`${d.id}: apply_flag_settings is success and the following get_settings has applied.effort at the level set (null is the model default)`);
    else bad(`${d.id}: live effort does not match (${problemsHere.join(', ')})`);
  }

  // 5. PII in replay.jsonl.
  let replay = null;
  try {
    replay = await fsp.readFile(REPLAY, 'utf8');
  } catch (e) {
    bad(e.code === 'ENOENT' ? 'replay.jsonl missing' : `cannot read replay.jsonl: ${e.message}`);
  }
  if (replay !== null) {
    const replayPii = findPii(replay);
    if (replayPii.length) bad(`replay.jsonl: ${replayPii.length} PII hits (${JSON.stringify(replayPii.slice(0, 2))})`);
    else ok('replay.jsonl: 0 PII hits');
  }

  process.stdout.write(problems.length ? `\nNG: ${problems.length} problems\n` : '\nOK: all conditions met\n');

  process.exit(problems.length ? 1 : 0);
}

main();
