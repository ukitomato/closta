#!/usr/bin/env node
// Self-test of the pure protocol helpers (no real API needed).
import assert from 'node:assert/strict';
import { initializeRequest, kindOf, permissionAnswer } from './protocol.mjs';

let failures = 0;
const check = (name, fn) => {
  try { fn(); process.stdout.write(`  ✓ ${name}\n`); } catch (e) { failures += 1; process.stdout.write(`  ✗ ${name}: ${e.message}\n`); }
};

check('kindOf: control_request by its subtype, subtyped lines by type/subtype, others by type', () => {
  assert.equal(kindOf({ type: 'control_request', request: { subtype: 'elicitation' } }), 'control_request/elicitation');
  assert.equal(kindOf({ type: 'control_request', request: { subtype: 'hook_callback' } }), 'control_request/hook_callback');
  assert.equal(kindOf({ type: 'system', subtype: 'init' }), 'system/init');
  assert.equal(kindOf({ type: 'result' }), 'result');
});

check('kindOf: command_lifecycle lines are counted by their state', () => {
  assert.equal(kindOf({ type: 'command_lifecycle', state: 'started' }), 'command_lifecycle/started');
  assert.equal(kindOf({ type: 'command_lifecycle', state: 'cancelled' }), 'command_lifecycle/cancelled');
  assert.equal(kindOf({ type: 'command_lifecycle' }), 'command_lifecycle');
});

check('permissionAnswer: allows with the input as is when the scene has no respond, and hands {index} to a scene that has one', () => {
  assert.deepEqual(permissionAnswer(undefined, { input: { a: 1 } }, 4), { behavior: 'allow', updatedInput: { a: 1 } });
  const seen = [];
  const permission = { respond: (req, ctx) => { seen.push(ctx.index); return { behavior: 'deny', message: 'm' }; } };
  assert.deepEqual(permissionAnswer(permission, {}, 2), { behavior: 'deny', message: 'm' });
  assert.deepEqual(seen, [2]);
});

check('permissionAnswer: a throwing respond becomes an Error naming can_use_tool and the tool', () => {
  assert.throws(
    () => permissionAnswer({ respond: () => { throw new Error('boom'); } }, { tool_name: 'ExitPlanMode' }, 0),
    /answer to can_use_tool for ExitPlanMode failed: boom/,
  );
});

check('initializeRequest: hooks default to {} and a given declaration is kept as is', () => {
  assert.deepEqual(initializeRequest().hooks, {});
  const hooks = { PreToolUse: [{ matcher: 'Edit', hookCallbackIds: ['x'], timeout: 10 }] };
  const req = initializeRequest(hooks);
  assert.equal(req.hooks, hooks);
  assert.equal(req.subtype, 'initialize');
  assert.deepEqual(req.sdkMcpServers, []);
  assert.deepEqual(req.webSearchIsolationExemptMcpServers, []);
});

process.stdout.write(failures ? `\nNG: ${failures} failed\n` : '\nOK\n');
process.exit(failures ? 1 : 0);
