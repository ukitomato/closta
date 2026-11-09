#!/usr/bin/env node
// Self-test of the replay check (replay.mjs); no real API needed. The check verify.mjs uses must find replays
// not only by uuid but also by message id and body.

import assert from 'node:assert/strict';
import { replayedLines } from './replay.mjs';

let failures = 0;
const check = (name, fn) => {
  try { fn(); process.stdout.write(`  ✓ ${name}\n`); } catch (e) { failures += 1; process.stdout.write(`  ✗ ${name}: ${e.message}\n`); }
};

const said = (uuid, id, text) => ({ type: 'assistant', uuid, message: { id, content: [{ type: 'text', text }] } });
const first = [said('11111111-1111-4111-8111-111111111111', 'msg_one', 'hello')];

check('only new lines means zero replays', () => {
  assert.equal(replayedLines(first, [said('22222222-2222-4222-8222-222222222222', 'msg_two', 'pong')]).length, 0);
});
check('same uuid is a replay', () => {
  assert.equal(replayedLines(first, [said('11111111-1111-4111-8111-111111111111', 'msg_x', 'other')]).length, 1);
});
check('different uuid but same message id is a replay', () => {
  assert.equal(replayedLines(first, [said('22222222-2222-4222-8222-222222222222', 'msg_one', 'other')]).length, 1);
});
check('different uuid and id but same body is a replay', () => {
  assert.equal(replayedLines(first, [said('22222222-2222-4222-8222-222222222222', 'msg_two', 'hello')]).length, 1);
});
check('lines other than user and assistant are ignored', () => {
  assert.equal(replayedLines(first, [{ type: 'system', uuid: '11111111-1111-4111-8111-111111111111' }]).length, 0);
});

process.stdout.write(failures ? `\nNG: ${failures} failed\n` : '\nOK\n');
process.exit(failures ? 1 : 0);
