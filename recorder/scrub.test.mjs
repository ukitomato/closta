#!/usr/bin/env node
// Self-test of the scrubber on synthetic lines (no real API needed).

import assert from 'node:assert/strict';
import { newScrubState, scrubLine, scrubLines, findPii, createStreamScrubber, joinedFragments, scrubFragments, knownNamePatterns, knownOrgs } from './scrub.mjs';

let failures = 0;
const check = (name, fn) => {
  try { fn(); process.stdout.write(`  ✓ ${name}\n`); } catch (e) { failures += 1; process.stdout.write(`  ✗ ${name}: ${e.message}\n`); }
};

check('removes account.email and organization', () => {
  const st = newScrubState('alice');
  const line = JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', response: { account: { email: 'jane.doe@corp.example.com', organization: 'Sample Co - Team (1)', subscriptionType: 'Claude Pro' } } },
  });
  const out = scrubLine(line, st);
  assert.equal(findPii(out, 'alice').length, 0, out);
  assert.ok(out.includes('user@example.com'));
  assert.ok(out.includes('Example Org'));
  assert.ok(!out.includes('corp.example.com'));
});

check('drops the managed (policySettings) settings and what they put into effective', () => {
  const st = newScrubState('alice');
  const managed = {
    allowedMcpServers: [{ serverName: 'internal', serverUrl: 'https://mcp.corp.example/mcp' }],
    permissions: { deny: ['Bash(curl:*)'] },
    companyAnnouncements: ['Welcome to Corp'],
  };
  const line = JSON.stringify({
    type: 'control_response',
    response: {
      subtype: 'success',
      response: {
        applied: { effort: 'high' },
        sources: [{ source: 'flagSettings', settings: { effortLevel: 'high' } }, { source: 'policySettings', settings: managed }],
        effective: { ...managed, effortLevel: 'high' },
      },
    },
  });
  const out = JSON.parse(scrubLine(line, st)).response.response;
  assert.deepEqual(out.sources, [{ source: 'flagSettings', settings: { effortLevel: 'high' } }, { source: 'policySettings', settings: {} }]);
  assert.deepEqual(out.effective, { effortLevel: 'high' });
  assert.deepEqual(out.applied, { effort: 'high' });
});

check('drops companyAnnouncements wherever they appear', () => {
  const st = newScrubState('alice');
  const line = JSON.stringify({ type: 'system', settings: { companyAnnouncements: ['Corp news'], theme: 'dark' } });
  const out = scrubLine(line, st);
  assert.ok(!out.includes('Corp news'), out);
  assert.deepEqual(JSON.parse(out).settings, { theme: 'dark' });
});

check('a line without managed settings keeps its exact text', () => {
  const st = newScrubState('alice');
  const line = '{"type":"system",  "subtype":"status"}';
  assert.equal(scrubLine(line, st), line);
});

// A path in a tool input streams in pieces through input_json_delta (the Write in capture 29).
const deltaLine = (index, partial) => JSON.stringify({
  type: 'stream_event',
  event: { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partial } },
  parent_tool_use_id: null,
});
const stopLine = (index) => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_stop', index }, parent_tool_use_id: null });

check('a home path streamed in pieces is joined before scrubbing', () => {
  const st = newScrubState('alice');
  const scrubber = createStreamScrubber(st);
  const pieces = ['{"file_path": "/ho', 'me/al', 'ic', 'e/.claude/plans/p.md", "content": "x"}'];
  const lines = [...pieces.map((p) => deltaLine(1, p)), stopLine(1)];
  const out = [...lines.flatMap((l) => scrubber.push(l)), ...scrubber.flush()];
  assert.equal(out.length, lines.length);
  const joined = joinedFragments(out);
  assert.deepEqual(joined, ['{"file_path": "/home/user/.claude/plans/p.md", "content": "x"}']);
  assert.equal(findPii(out.join('\n'), 'alice').length, 0);
  assert.equal(joined.flatMap((j) => findPii(j, 'alice')).length, 0);
});

check('the number of fragment splits and the order of untouched lines do not change', () => {
  const st = newScrubState('alice');
  assert.deepEqual(scrubFragments(['/home/al', 'ice/a', 'b'], st), ['/home/user', '/a', 'b']);
  const plain = ['{"a"', ': 1}'];
  assert.equal(scrubFragments(plain, st), plain);
  const scrubber = createStreamScrubber(st);
  const other = JSON.stringify({ type: 'system', subtype: 'status' });
  const out = [deltaLine(0, '{"x":'), other, deltaLine(0, '"/home/alice"}'), stopLine(0)].flatMap((l) => scrubber.push(l));
  assert.equal(out.length, 4);
  assert.equal(out[1], other);
});

check('verify finds a home path in the rebuilt input', () => {
  const raw = ['{"p": "/hom', 'e/alice/x"}'].map((p) => deltaLine(2, p));
  assert.equal(findPii(raw.join('\n'), 'alice').length, 0, 'not visible line by line');
  assert.equal(joinedFragments(raw).flatMap((j) => findPii(j, 'alice')).length, 1);
});

check('an email in an unknown field is removed by the regex', () => {
  const st = newScrubState('alice');
  const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'contact me at bob99@corp.example.co.jp please' }] } });
  const out = scrubLine(line, st);
  assert.equal(findPii(out, 'alice').length, 0, out);
  assert.ok(out.includes('user@example.com'));
});

check('removes the user name in home paths (real path and encoded form)', () => {
  const st = newScrubState('someuser');
  const line = JSON.stringify({ cwd: '/home/someuser/work/x', file: '/tmp/claude-1000/-home-someuser-work-tools/y.output' });
  const out = scrubLine(line, st);
  assert.ok(out.includes('/home/user/work/x'), out);
  assert.ok(out.includes('-home-user-work-tools'), out);
  assert.equal(findPii(out, 'someuser').length, 0, out);
});

check('the audit reads organization names from settings (none written in the file)', () => {
  assert.deepEqual(knownOrgs(' Sample Co - Team (1) , Other Co '), ['Sample Co - Team (1)', 'Other Co']);
  assert.deepEqual(knownOrgs(''), []);
  assert.ok(findPii('at Other Co', 'alice', undefined, [], ['Other Co']).some((h) => h.kind === 'organization'));
  assert.equal(findPii('at Other Co', 'alice', undefined, [], []).length, 0);
});

check('name patterns are built from configured names (separators optional; no names written in the file)', () => {
  const [re] = knownNamePatterns(['ann.lee']);
  for (const seen of ['ann.lee', 'annlee', 'Ann Lee', 'ANN_LEE', 'ann-lee']) {
    assert.equal(seen.match(re)?.[0], seen, seen);
  }
  assert.equal('anne'.match(re), null);
  assert.deepEqual(knownNamePatterns(['', 'ab']), [], 'names that are too short get no pattern');
  assert.ok(findPii('by Ann Lee', 'alice', undefined, knownNamePatterns(['ann.lee'])).some((h) => h.kind === 'name'));
  assert.equal(findPii('by Ann Lee', 'alice', undefined, []).length, 0);
});

check('an organization name learned earlier is removed from later lines (state carried through one recording)', () => {
  const st = newScrubState('alice');
  // Pass the init response containing the organization name first.
  scrubLine(JSON.stringify({ account: { organization: 'Acme Holdings K.K.', email: 'x@acme.test' } }), st);
  // A bare organization name in a later line is removed too.
  const out = scrubLine(JSON.stringify({ note: 'welcome to Acme Holdings K.K.' }), st);
  assert.ok(!out.includes('Acme Holdings'), out);
  assert.ok(out.includes('Example Org'), out);
});

check('an organization name with parentheses does not break (literal replacement)', () => {
  const st = newScrubState('alice');
  const line = JSON.stringify({ account: { organization: 'Sample Co - Team (1)' } });
  const out = scrubLine(line, st);
  assert.ok(!out.includes('Sample Co'), out);
});

check('removes organizationUuid of a transcript credential_org line, and the audit flags it if left', () => {
  const st = newScrubState('alice');
  const uuid = '00000000-0000-4000-8000-000000000001'; // Obviously fake. Never copy values from recorded transcripts or a user's environment
  const line = JSON.stringify({ type: 'attachment', attachment: { type: 'credential_org', organizationUuid: uuid } });
  assert.ok(findPii(line, 'alice').some((h) => h.kind === 'organization-uuid'), 'the raw line is flagged');
  const out = scrubLine(line, st);
  assert.ok(!out.includes(uuid), out);
  assert.equal(findPii(out, 'alice').length, 0, out);
  // A learned value is removed even from another line without the key name.
  assert.ok(!scrubLine(JSON.stringify({ note: `org ${uuid}` }), st).includes(uuid));
});

check('two passes: removed from earlier lines even when the line revealing the value comes later', () => {
  const uuid = '00000000-0000-4000-8000-000000000002'; // obviously fake
  const earlier = JSON.stringify({ type: 'user', message: { content: `org ${uuid}` } });
  const teaching = JSON.stringify({ type: 'attachment', attachment: { type: 'credential_org', organizationUuid: uuid } });
  // The single pass (for streaming stdout) cannot scrub lines that passed before the value was learned.
  const streamed = scrubLine(earlier, newScrubState('alice'));
  assert.ok(streamed.includes(uuid), 'the one-pass scrub cannot know it yet');
  const [first, second] = scrubLines([earlier, teaching], newScrubState('alice'));
  assert.ok(!first.includes(uuid), first);
  assert.ok(!second.includes(uuid), second);
});

check('two passes: also learns and removes a value escaped inside a JSON string', () => {
  const uuid = '00000000-0000-4000-8000-000000000003'; // obviously fake
  const inner = JSON.stringify({ organizationUuid: uuid });
  const nested = JSON.stringify({ type: 'attachment', note: inner });
  assert.ok(nested.includes(`\\"organizationUuid\\"`), 'the value is inside an escaped string');
  assert.ok(findPii(nested, 'alice').some((h) => h.kind === 'organization-uuid'), 'the audit sees the escaped key');
  const [out] = scrubLines([nested, JSON.stringify({ later: uuid })], newScrubState('alice'));
  assert.ok(!out.includes(uuid), out);
});

check('the audit flags a learned value left without a key', () => {
  const uuid = '00000000-0000-4000-8000-000000000004'; // obviously fake
  const st = newScrubState('alice');
  scrubLine(JSON.stringify({ organizationUuid: uuid }), st);
  const left = JSON.stringify({ note: `see ${uuid} here` });
  assert.equal(findPii(left, 'alice').length, 0, 'without what was learned, a bare value is not seen');
  assert.ok(findPii(left, 'alice', st).some((h) => h.kind === 'organization-uuid'), 'with it, it is');
  assert.equal(findPii(scrubLine(left, st), 'alice', st).length, 0);
});

check('the fake MCP server port becomes a fixed fake value', () => {
  const st = newScrubState('alice');
  st.mcpPorts.add('45678');
  const row = JSON.stringify({ config: { type: 'http', url: 'http://localhost:45678/mcp' }, error: 'connect ECONNREFUSED 127.0.0.1:45678' });
  const out = scrubLine(row, st);
  assert.ok(out.includes('http://localhost:39039/mcp'), out);
  assert.ok(out.includes('localhost:39039'), out);
  assert.ok(!out.includes('45678'), out);
  // Numbers that are not the recorded server's port are left alone.
  assert.equal(scrubLine('{"n":"localhost:45679"}', st), '{"n":"localhost:45679"}');
});

check('the account plan is written as one fixed plan, also inside an escaped string', () => {
  const st = newScrubState('alice');
  const line = JSON.stringify({ account: { subscriptionType: 'Claude Team' }, text: JSON.stringify({ subscriptionType: 'Claude Max' }) });
  const out = scrubLine(line, st);
  assert.ok(!out.includes('Team') && !out.includes('Max'), out);
  assert.equal(out.split('Claude Pro').length - 1, 2, out);
  assert.equal(findPii(out, 'alice').length, 0, out);
  assert.equal(findPii(line, 'alice').filter((h) => h.kind === 'plan').length, 2);
});

process.stdout.write(failures ? `\nNG: ${failures} failed\n`
 : '\nOK\n');
process.exit(failures ? 1 : 0);
