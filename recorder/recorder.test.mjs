#!/usr/bin/env node
// Self-test (no real API needed): file-history cleanup, the rewind scenario definition check, and scenario 25's texts against its stdin.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { removeFileHistory } from './cleanup.mjs';
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

process.stdout.write(failures === 0 ? 'OK\n' : `${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
