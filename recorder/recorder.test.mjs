#!/usr/bin/env node
// Self-test (no real API needed): file-history cleanup, the rewind scenario definition check, and scenario 25's texts against its stdin.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { removeFileHistory, removeOnSignal } from './cleanup.mjs';
import { initializeRequest, sceneAnswer } from './protocol.mjs';
import { scenarios, rewindDefinitionProblem, readShowsRewind, resumeAtUuid, resumeFlagsFor } from './scenarios.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, '..', 'jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures');
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); process.stdout.write(`  ✓ ${name}\n`); } catch (e) { failures += 1; process.stdout.write(`  ✗ ${name}: ${e.message}\n`); }
};
const exists = (p) => fsp.access(p).then(() => true, () => false);

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

await check('removeFileHistory: removes only the first and second, keeps the rest (with duplicates, null, ., ../x, another name)', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'closta-cleanup-'));
  try {
    const fh = path.join(root, 'file-history');
    for (const n of [U1, U2, U3, 'other-name']) {
      await fsp.mkdir(path.join(fh, n), { recursive: true });
      await fsp.writeFile(path.join(fh, n, 'f'), 'x');
    }
    await fsp.mkdir(path.join(root, 'x'));
    await fsp.writeFile(path.join(root, 'keep.txt'), 'x');
    await removeFileHistory(root, [U1, U1, null, U2, '.', '../x', 'other-name']);
    assert.equal(await exists(path.join(fh, U1)), false);
    assert.equal(await exists(path.join(fh, U2)), false);
    assert.equal(await exists(path.join(fh, U3)), true);
    assert.equal(await exists(path.join(fh, 'other-name')), true);
    assert.equal(await exists(fh), true);
    assert.equal(await exists(path.join(root, 'x')), true);
    assert.equal(await exists(path.join(root, 'keep.txt')), true);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

await check('removeFileHistory: does not fail on a missing UUID (even without file-history)', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'closta-cleanup-'));
  try {
    await removeFileHistory(root, [U3]);
    await fsp.mkdir(path.join(root, 'file-history'));
    await removeFileHistory(root, [U3]);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

const good = { steps: [{ kind: 'rewindFiles', userIndex: 1, dryRun: false }], rewindRead: { includes: 'a', excludes: 'b' }, stdinFile: true };
await check('rewindDefinitionProblem: null for every current scenario', () => {
  for (const s of scenarios) assert.equal(rewindDefinitionProblem(s), null, s.id);
});
await check('rewindDefinitionProblem: null for a made-up definition that follows the rules', () => assert.equal(rewindDefinitionProblem(good), null));
await check('rewindDefinitionProblem: a reason when resume.steps has rewindFiles', () => {
  assert.match(rewindDefinitionProblem({ ...good, resume: { steps: [{ kind: 'rewindFiles', userIndex: 1, dryRun: true }] } }), /first phase/);
  assert.match(rewindDefinitionProblem({ steps: [], resume: { steps: [{ kind: 'rewindFiles' }] } }), /first phase/);
});
await check('rewindDefinitionProblem: a reason when rewindRead is missing or excludes is empty', () => {
  assert.match(rewindDefinitionProblem({ ...good, rewindRead: undefined }), /rewindRead/);
  assert.match(rewindDefinitionProblem({ ...good, rewindRead: { includes: 'a', excludes: '' } }), /rewindRead/);
  assert.match(rewindDefinitionProblem({ ...good, rewindRead: { includes: '', excludes: 'b' } }), /rewindRead/);
});
await check('rewindDefinitionProblem: a reason when stdinFile is missing', () => {
  assert.match(rewindDefinitionProblem({ ...good, stdinFile: undefined }), /stdinFile/);
});

await check('readShowsRewind: true for text with only first, false otherwise', () => {
  const r = { includes: 'first', excludes: 'second' };
  assert.equal(readShowsRewind('1\tfirst', r), true);
  assert.equal(readShowsRewind('first and second', r), false);
  assert.equal(readShowsRewind('second', r), false);
  assert.equal(readShowsRewind('', r), false);
});

await check('scenario 25 user texts match the content of the user lines in its stdin, in order', async () => {
  const def = scenarios.find((s) => s.id === '25-rewind-files');
  const texts = def.steps.filter((st) => st.kind === 'user').map((st) => st.text);
  const lines = (await fsp.readFile(path.join(FIXTURES_DIR, '25-rewind-files.stdin.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const contents = lines.filter((r) => r.type === 'user').map((r) => r.message?.content);
  assert.ok(texts.length > 0);
  assert.deepEqual(contents, texts);
});

await check('resumeAtUuid: takes the parentUuid of the beforeUser-th user prompt (string content), or null', () => {
  const raw = [
    { type: 'user', uuid: 'u1', parentUuid: null, message: { content: 'first' } },
    { type: 'assistant', uuid: 'a1', parentUuid: 'u1', message: { content: [{ type: 'text', text: 'ok' }] } },
    { type: 'user', uuid: 'r1', parentUuid: 'a1', message: { content: [{ type: 'tool_result' }] } },
    { type: 'user', uuid: 'u2', parentUuid: 'a1', message: { content: 'second' } },
  ].map((o) => JSON.stringify(o)).join('\n');
  assert.equal(resumeAtUuid(raw, 2), 'a1');
  assert.equal(resumeAtUuid(raw, 1), null);
  assert.equal(resumeAtUuid(raw, 3), null);
  assert.equal(resumeAtUuid('not json\n', 1), null);
});

await check('resumeFlagsFor: with resume.at, adds fork, a new id and the cut point; 26 stays as is', () => {
  const base = { baseFlags: ['-p'], firstId: 'F', newId: 'N', atUuid: 'A', scenarioFlags: ['--x'] };
  assert.deepEqual(resumeFlagsFor({ fork: true, at: { beforeUser: 2 } }, base), ['-p', '--resume=F', '--fork-session', '--session-id=N', '--resume-session-at=A', '--x']);
  assert.deepEqual(resumeFlagsFor({ fork: true }, base), ['-p', '--resume=F', '--fork-session', '--x']);
  assert.deepEqual(resumeFlagsFor({}, base), ['-p', '--resume=F', '--x']);
});

await check('resumeFlagsFor: resume.flags go last, only on the second CLI', () => {
  const base = { baseFlags: ['-p'], firstId: 'F', newId: 'N', atUuid: 'A', scenarioFlags: ['--x'] };
  assert.deepEqual(resumeFlagsFor({ flags: ['--settings', '{}'] }, base), ['-p', '--resume=F', '--x', '--settings', '{}']);
});

await check('removeOnSignal: SIGINT or SIGTERM removes the directory and exits as the signal would; stopping leaves it', async () => {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'closta-signal-'));
    await fsp.writeFile(path.join(dir, '.credentials.json'), 'x');
    const proc = Object.assign(new EventEmitter(), { exitCode: null, exit(c) { this.exitCode = c; } });
    removeOnSignal(dir, proc);
    proc.emit(signal);
    assert.equal(await exists(dir), false, signal);
    assert.equal(proc.exitCode, code, signal);
    assert.equal(proc.listenerCount('SIGINT') + proc.listenerCount('SIGTERM'), 1, 'the other signal still listens');
  }
  const kept = await fsp.mkdtemp(path.join(os.tmpdir(), 'closta-signal-'));
  try {
    const proc = Object.assign(new EventEmitter(), { exit() { throw new Error('exited'); } });
    removeOnSignal(kept, proc)();
    assert.equal(proc.listenerCount('SIGINT') + proc.listenerCount('SIGTERM'), 0);
    assert.equal(await exists(kept), true);
  } finally {
    await fsp.rm(kept, { recursive: true, force: true });
  }
});

await check('scenes 45 to 50 and 52 to 57 are pending and the other scenes are not', () => {
  const pending = scenarios.filter((s) => s.pending).map((s) => s.id.slice(0, 2));
  assert.deepEqual(pending, ['45', '46', '47', '48', '49', '50', '52', '53', '54', '55', '56', '57']);
});

const sceneOf = (n) => scenarios.find((s) => s.id.startsWith(`${n}-`));

await check('scene 52: --add-dir names the extra folder, project and local settings are read, the seed holds the rules', () => {
  const s = sceneOf('52');
  assert.deepEqual(s.extraDirs, ['other']);
  assert.ok(s.flags.some((f) => f.startsWith('--add-dir=') && f.includes('{EXTRA:other}')));
  assert.ok(s.flags.includes('project,local'));
  assert.ok(!s.flags.includes('project'));
  assert.deepEqual(JSON.parse(s.seed['.claude/settings.local.json']).permissions.allow, ['Bash(make:*)']);
  assert.deepEqual(JSON.parse(s.seed['.claude/settings.json']).permissions.deny, ['Read(./secret.txt)']);
  assert.deepEqual(s.steps.at(-1), { kind: 'control', request: { subtype: 'list_permission_rules' } });
});

await check('scene 53: two cancelQueued steps, the second after waiting for the second command_lifecycle/started', () => {
  const s = sceneOf('53');
  const kinds = s.steps.map((st) => st.kind);
  assert.equal(kinds.filter((k) => k === 'cancelQueued').length, 2);
  const waitAt = s.steps.findIndex((st) => st.kind === 'waitFor');
  assert.deepEqual(s.steps[waitAt], { kind: 'waitFor', line: 'command_lifecycle/started', n: 2 });
  assert.deepEqual(s.steps.filter((st) => st.kind === 'cancelQueued').map((st) => st.userIndex), [3, 2]);
  assert.equal(s.steps[waitAt + 1].kind, 'cancelQueued');
  assert.equal(s.done.results, 1);
  assert.equal(s.done.maxMs, 90000);
});

await check('scene 54: backgroundTool for Bash, then taskOutput three times and once, then a bogus task id', () => {
  const s = sceneOf('54');
  assert.ok(s.steps.some((st) => st.kind === 'backgroundTool' && st.toolName === 'Bash'));
  assert.ok(s.steps.some((st) => st.kind === 'taskOutput' && st.times === 3 && st.everyMs === 2000));
  assert.ok(s.steps.some((st) => st.kind === 'taskOutput' && st.times === 1 && st.everyMs === 0));
  assert.deepEqual(s.steps.at(-1), { kind: 'control', request: { subtype: 'get_task_output', task_id: 'bogus' } });
});

await check('scene 55: renameSession before and after /clear (the second for the previous session), with a resume', () => {
  const s = sceneOf('55');
  const renames = s.steps.filter((st) => st.kind === 'renameSession');
  assert.deepEqual(renames.map((st) => st.previousSession), [false, true]);
  assert.ok(s.steps.some((st) => st.kind === 'user' && st.text === '/clear'));
  assert.equal(s.resume.done.results, 1);
  assert.ok(s.resume.steps.some((st) => st.kind === 'initialize'));
});

await check('scene 56: reload_plugins with refuse_if_busy while idle and while a Bash runs', () => {
  const s = sceneOf('56');
  const reloads = s.steps.filter((st) => st.kind === 'control' && st.request.subtype === 'reload_plugins');
  assert.equal(reloads.length, 2);
  for (const r of reloads) assert.equal(r.request.refuse_if_busy, true);
});

await check('scene 57: ExitPlanMode is denied with a diff message the first time and allowed with an edited plan the second; other tools are allowed', () => {
  const s = sceneOf('57');
  assert.ok(s.flags.includes('plan'));
  const { respond } = s.permission;
  const cwd = '/nowhere-57';
  const exit = { tool_name: 'ExitPlanMode', input: { plan: '# Plan\nfix it' } };
  const first = respond(exit, { index: 3, cwd });
  assert.equal(first.behavior, 'deny');
  assert.ok(first.message.length > 0);
  assert.match(first.message, /@@ /);
  const bash = { tool_name: 'Bash', input: { command: 'ls' } };
  assert.deepEqual(respond(bash, { index: 4, cwd }), { behavior: 'allow', updatedInput: bash.input });
  const second = respond(exit, { index: 5, cwd });
  assert.equal(second.behavior, 'allow');
  assert.ok(second.updatedInput.plan.startsWith(exit.input.plan));
  assert.ok(second.updatedInput.plan.length > exit.input.plan.length);
  assert.equal(s.done.maxMs, 180000);
});

const fileHooksOf = (timeout) => ({
  PreToolUse: [{ matcher: 'Edit|Write|NotebookEdit|Read', hookCallbackIds: ['closta-before-file-tool'], timeout }],
  PostToolUse: [{ matcher: 'Edit|Write|NotebookEdit', hookCallbackIds: ['closta-after-edit'], timeout }],
});

await check('scene 48: Pre answers {} and Post answers with additionalContext', () => {
  const { respond } = sceneOf('48').hookCallback;
  const pre = { subtype: 'hook_callback', callback_id: 'closta-before-file-tool', input: { hook_event_name: 'PreToolUse', tool_name: 'Read' } };
  const post = { subtype: 'hook_callback', callback_id: 'closta-after-edit', input: { hook_event_name: 'PostToolUse', tool_name: 'Edit' } };
  assert.deepEqual(respond(pre, { index: 0, cwd: '/nowhere' }).payload, {});
  const answer = respond(post, { index: 1, cwd: '/nowhere' }).payload;
  assert.equal(answer.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(answer.hookSpecificOutput.additionalContext, /<ide-diagnostics>/);
});

await check('scene 48: the second Edit Pre appends a line to the seeded file, the first does not', async () => {
  const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), 'closta-hook-'));
  try {
    const s = sceneOf('48');
    const file = path.join(cwd, 'a.txt');
    await fsp.writeFile(file, s.seed['a.txt']);
    const editPre = { subtype: 'hook_callback', callback_id: 'closta-before-file-tool', input: { hook_event_name: 'PreToolUse', tool_name: 'Edit' } };
    const readPre = { ...editPre, input: { hook_event_name: 'PreToolUse', tool_name: 'Read' } };
    assert.deepEqual(s.hookCallback.respond(editPre, { index: 1, cwd }).payload, {});
    assert.equal(await fsp.readFile(file, 'utf8'), s.seed['a.txt']);
    assert.deepEqual(s.hookCallback.respond(readPre, { index: 2, cwd }).payload, {});
    assert.equal(await fsp.readFile(file, 'utf8'), s.seed['a.txt']);
    assert.deepEqual(s.hookCallback.respond(editPre, { index: 3, cwd }).payload, {});
    assert.ok((await fsp.readFile(file, 'utf8')).startsWith(s.seed['a.txt']));
    assert.ok((await fsp.readFile(file, 'utf8')).length > s.seed['a.txt'].length);
  } finally {
    await fsp.rm(cwd, { recursive: true, force: true });
  }
});

await check('scene 50: the first Pre holds 5 s and answers {}, the second is an error answer; timeout is 2', () => {
  const s = sceneOf('50');
  assert.equal(s.hooks.PreToolUse[0].timeout, 2);
  const pre = { subtype: 'hook_callback', callback_id: 'closta-before-file-tool', input: { hook_event_name: 'PreToolUse', tool_name: 'Read' } };
  const cwd = '/nowhere-50';
  assert.deepEqual(s.hookCallback.respond(pre, { index: 0, cwd }), { holdMs: 5000, payload: {} });
  assert.equal(s.hookCallback.respond(pre, { index: 1, cwd }).payload, null);
});

await check('scenes 45 to 47: elicitation answers, accept then decline, accept, and none', () => {
  assert.deepEqual(sceneOf('45').elicitation.respond({}, { index: 0, cwd: '' }).payload,
    { action: 'accept', content: { name: 'Ada', color: 'blue', count: 2, agree: true } });
  assert.deepEqual(sceneOf('45').elicitation.respond({}, { index: 1, cwd: '' }).payload, { action: 'decline' });
  assert.deepEqual(sceneOf('46').elicitation.respond({}, { index: 0, cwd: '' }).payload, { action: 'accept' });
  assert.equal(sceneOf('47').elicitation.respond({}, { index: 0, cwd: '' }).payload, null);
  assert.equal(sceneOf('47').done.maxMs, 180000);
});

await check('initializeRequest(s.hooks): the file-tool declaration for 48 only, {} for every other scene', () => {
  for (const s of scenarios) {
    const hooks = initializeRequest(s.hooks).hooks;
    if (s.id.startsWith('48-')) {
      assert.deepEqual(hooks.PreToolUse[0].hookCallbackIds, ['closta-before-file-tool']);
      assert.deepEqual(hooks.PostToolUse[0].hookCallbackIds, ['closta-after-edit']);
      assert.equal(hooks.PreToolUse[0].timeout, 10);
    } else if (s.id.startsWith('49-')) {
      assert.deepEqual(hooks, fileHooksOf(10));
    } else if (s.id.startsWith('50-')) {
      assert.deepEqual(hooks, fileHooksOf(2));
    } else {
      assert.deepEqual(hooks, {}, s.id);
    }
  }
});

await check('sceneAnswer: passes holdMs and payload through, and turns a throw into an Error naming the request', () => {
  assert.deepEqual(sceneAnswer({ respond: () => ({ payload: {} }) }, { subtype: 'hook_callback' }, {}), { holdMs: 0, payload: {} });
  assert.deepEqual(sceneAnswer({ respond: () => ({ holdMs: 5, payload: null }) }, { subtype: 'elicitation' }, {}), { holdMs: 5, payload: null });
  assert.throws(
    () => sceneAnswer({ respond: () => { throw new Error('ENOENT'); } }, { subtype: 'hook_callback' }, {}),
    /answer to hook_callback failed: ENOENT/,
  );
});

process.stdout.write(failures === 0 ? 'OK\n' : `${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
