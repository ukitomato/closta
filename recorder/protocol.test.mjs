#!/usr/bin/env node
// Self-test of the pure protocol helpers (no real API needed).
import assert from 'node:assert/strict';
import { initializeRequest, kindOf } from './protocol.mjs';

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
