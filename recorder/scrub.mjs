// PII scrubber. Pure functions applied to each stdout line while recording.
//
// Key design point: recording is a single path "claude stdout -> scrub() -> file write",
// with no path that writes without the scrubber (record.mjs guarantees this). This file is
// the transformation on that path.
//
// Three stages:
//   1. Email addresses (regex)          -> user@example.com
//   2. Values learned from the data     -> picks the real account.email / account.organization
//      values from JSON and removes them wherever they appear by string match (nothing hardcoded)
//   3. User name in home paths          -> /home/user, -home-user- (the encoded form too)
// And the account's plan (subscriptionType) is written as one fixed plan, and the API request/message ids, which tie a
// capture to an account, become fake ids of the same shape.
//
// 1 is the guarantee: even if a future CLI puts an email in an unknown field, the regex removes it.
// 2 discovers values that no pattern can detect, such as organization names, from the recording's
//   own initialize response and removes them (works when the account changes).
// 3 covers user names hidden in paths.

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { createHash } from 'node:crypto';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_PLACEHOLDER = 'user@example.com';
const ORG_PLACEHOLDER = 'Example Org';
// The credential_org line of a stored transcript carries the account's organization UUID in organizationUuid. It is an identifier, not a name, so it is removed separately.
const ORG_UUID_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
// Port of the fake MCP server. It is a different free port on every recording, so captures use a fixed fake value.
export const MCP_FAKE_PORT = '39039';
// The keyed form. Also matches the form escaped inside a JSON string (\"organizationUuid\":\"…\").
const ORG_UUID_KEY_RE = /\\?"organizationUuid\\?"\s*:\s*\\?"([^"\\]*)\\?"/g;
// The account's plan says which kind of account recorded (a company's plan names the company's kind of account). Every
// capture carries the same fixed plan instead. Matched by key, the escaped form too.
export const PLAN_PLACEHOLDER = 'Example Plan';
const PLAN_KEY_RE = /(\\?"subscriptionType\\?"\s*:\s*\\?")([^"\\]*)(\\?")/g;

// Real ids: req_/msg_ + 011C + 20 base58 chars. The fake keeps the shape (28 chars): 011CScrubbed + 12 base58 chars of
// the sha256 of the whole real id, so the same real id always maps to the same fake one.
export const API_ID_RE = /\b(req|msg)_011C[1-9A-HJ-NP-Za-km-z]{20}\b/g;
const FAKE_ID_MARK = '011CScrubbed';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58(bytes) {
  let n = BigInt('0x' + bytes.toString('hex'));
  let out = '';
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out;
}

export function fakeApiId(id) {
  if (id.slice(id.indexOf('_') + 1).startsWith(FAKE_ID_MARK)) return id;
  const hash = base58(createHash('sha256').update(id).digest()).padStart(12, '1');
  return `${id.slice(0, id.indexOf('_') + 1)}${FAKE_ID_MARK}${hash.slice(0, 12)}`;
}

// Scrubber state, carried through one recording (= the stdout of one process).
// Needed so values learned from the initialize response also apply to later lines.
export function newScrubState(username = currentUsername()) {
  return {
    username,
    emails: new Set(), // learned real emails (the regex catches them too; a second safety net)
    orgs: new Set(), // learned organization names (no pattern detects them, so this is the main defence)
    orgUuids: new Set(), // learned organization UUIDs (the credential_org line of a transcript)
    mcpPorts: new Set(), // ports of the fake MCP servers started for recording (added by record.mjs; replaced with the fixed MCP_FAKE_PORT)
  };
}

function currentUsername() {
  // os.userInfo() can fail depending on the environment, so be defensive.
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER || process.env.LOGNAME || 'user';
  }
}

// Recursively collects values whose key is email / organization (wherever account is nested).
function learnSecrets(node, state) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const v of node) learnSecrets(v, state);
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && v) {
        if (k === 'email') state.emails.add(v);
        if (k === 'organization') state.orgs.add(v);
        if (k === 'organizationUuid' && v !== ORG_UUID_PLACEHOLDER) state.orgUuids.add(v);
      }
      learnSecrets(v, state);
    }
  }
}

function replaceAllLiteral(haystack, needle, replacement) {
  if (!needle) return haystack;
  return haystack.split(needle).join(replacement);
}

// Learns values from one line (does not replace). Picks them from the JSON structure and also the keyed form from the
// raw line (values escaped inside a JSON string are not visible in the structure).
export function learnLine(line, state) {
  try {
    learnSecrets(JSON.parse(line), state);
  } catch {
    // Not a JSON line (unexpected, but be defensive). Skip learning from the structure.
  }
  for (const m of line.matchAll(ORG_UUID_KEY_RE)) {
    if (m[1] && m[1] !== ORG_UUID_PLACEHOLDER) state.orgUuids.add(m[1]);
  }
}

// Managed settings describe the recording machine's organization (MCP servers, rules, hooks, announcements), not the
// protocol. Empties the policySettings source, removes the keys it contributed to `effective`, and drops
// companyAnnouncements anywhere. Returns the node, changed in place, and whether anything changed.
function dropManagedSettings(node) {
  let changed = false;
  const walk = (n) => {
    if (n == null || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (Array.isArray(n.sources)) {
      for (const src of n.sources) {
        if (src?.source !== 'policySettings' || src.settings == null || typeof src.settings !== 'object') continue;
        const keys = Object.keys(src.settings);
        if (!keys.length) continue;
        if (n.effective && typeof n.effective === 'object') for (const k of keys) delete n.effective[k];
        src.settings = {};
        changed = true;
      }
    }
    if ('companyAnnouncements' in n) {
      delete n.companyAnnouncements;
      changed = true;
    }
    Object.values(n).forEach(walk);
  };
  walk(node);
  return changed;
}

function withoutManagedSettings(line) {
  if (!line.includes('policySettings') && !line.includes('companyAnnouncements')) return line;
  let o;
  try { o = JSON.parse(line); } catch { return line; }
  return dropManagedSettings(o) ? JSON.stringify(o) : line;
}

// Replaces one line using the learned state (does not learn).
function replaceLine(line, state) {
  let s = withoutManagedSettings(line);
  // 2: remove learned values (organization names, emails) wherever they appear.
  for (const org of state.orgs) s = replaceAllLiteral(s, org, ORG_PLACEHOLDER);
  for (const email of state.emails) s = replaceAllLiteral(s, email, EMAIL_PLACEHOLDER);
  for (const uuid of state.orgUuids) s = replaceAllLiteral(s, uuid, ORG_UUID_PLACEHOLDER);
  // Port of the fake MCP server (in both localhost and 127.0.0.1 forms).
  for (const port of state.mcpPorts) {
    s = replaceAllLiteral(s, `localhost:${port}`, `localhost:${MCP_FAKE_PORT}`);
    s = replaceAllLiteral(s, `127.0.0.1:${port}`, `localhost:${MCP_FAKE_PORT}`);
  }
  s = s.replace(PLAN_KEY_RE, (_, open, _plan, close) => `${open}${PLAN_PLACEHOLDER}${close}`);
  s = s.replace(API_ID_RE, fakeApiId);
  // 1: remove every remaining email-like string with the regex (the guarantee).
  s = s.replace(EMAIL_RE, EMAIL_PLACEHOLDER);
  // 3: user name in home paths. Both the real path and the encoded cwd name.
  s = replaceAllLiteral(s, `/home/${state.username}`, '/home/user');
  s = replaceAllLiteral(s, `-home-${state.username}-`, '-home-user-');
  return s;
}

// Scrubs one line. state comes from newScrubState() (shared within one recording).
// Learns from this line first, then removes (so an organization name on the same line is removed too). Single-pass
// version for streaming stdout: earlier lines only lose the values that were learned by then.
export function scrubLine(line, state) {
  learnLine(line, state);
  return replaceLine(line, state);
}

// Scrubs a set of lines in two passes. Learns from all lines before replacing, so even when the line that reveals a
// value (credential_org, etc.) comes after the lines using it, those earlier lines are scrubbed. For stored
// transcripts, where all lines are available before writing the file.
export function scrubLines(lines, state) {
  for (const line of lines) learnLine(line, state);
  return lines.map((line) => replaceLine(line, state));
}

// Known values the audit treats as PII.
//   - Personal names: the recorder's own name. Not written in the file; built from the recording machine's settings (knownNamePatterns)
//   - Organization names: the account's organization value (scrub removes it by learning; this is the last line of defence)

// One pattern per name. Separators (. space _ -) are optional and case is ignored ("ann.lee" also matches annlee, Ann Lee).
// Names shorter than 3 characters get no pattern (short words appear everywhere).
export function knownNamePatterns(names = configuredNames()) {
  return names
    .map((name) => String(name).trim())
    .filter((name) => name.length >= 3)
    .map((name) => new RegExp(
      name.split(/[.\s_-]+/).filter(Boolean).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[.\\s_-]?'),
      'gi',
    ));
}

// Names from the recording machine's settings: the CLOSTA_PII_NAMES environment variable (comma-separated) and git's user.name.
function configuredNames() {
  const fromEnv = (process.env.CLOSTA_PII_NAMES ?? '').split(',');
  let fromGit = '';
  try {
    fromGit = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    // No git or no setting: use only the names from the environment variable
  }
  return [...fromEnv, fromGit];
}

const KNOWN_NAMES = knownNamePatterns();
// Organization names: the recording machine's CLOSTA_PII_ORGS environment variable (comma-separated). Not written in the file (scrub removes them by learning, so this is the last line of defence).
export function knownOrgs(raw = process.env.CLOSTA_PII_ORGS ?? '') {
  return String(raw).split(',').map((org) => org.trim()).filter(Boolean);
}

const KNOWN_ORGS = knownOrgs();

// Audit that scans the written file content for leftover PII.
// When learned (the scrub state) is passed, it also checks that values the scrubber learned (organization UUIDs,
// organization names, emails) do not remain without a key or inside escaped strings (the keyed form alone would slip
// past the last line of defence). record.mjs runs this after writing and discards the recording on any hit
// (the last line of defence against anything kept without going through the scrubber). verify.mjs uses the same check.
export function findPii(text, username = currentUsername(), learned = undefined, names = KNOWN_NAMES, orgs = KNOWN_ORGS) {
  const hits = [];
  // Real emails (other than the placeholder). Pattern-based, so it catches them in unknown places too.
  for (const m of text.matchAll(EMAIL_RE)) {
    if (m[0] !== EMAIL_PLACEHOLDER) hits.push({ kind: 'email', value: m[0] });
  }
  // Organization UUIDs (matched by key name; any value other than the placeholder is PII).
  for (const m of text.matchAll(ORG_UUID_KEY_RE)) {
    if (m[1] !== ORG_UUID_PLACEHOLDER) hits.push({ kind: 'organization-uuid', value: m[1] });
  }
  // The account's plan (matched by key name; any value other than the placeholder).
  for (const m of text.matchAll(PLAN_KEY_RE)) {
    if (m[2] !== PLAN_PLACEHOLDER) hits.push({ kind: 'plan', value: m[2] });
  }
  // Real API ids (fake ones start with the marker).
  for (const m of text.matchAll(API_ID_RE)) {
    if (fakeApiId(m[0]) !== m[0]) hits.push({ kind: 'api-id', value: m[0] });
  }
  // Values the scrubber learned, excluding placeholders.
  if (learned) {
    const known = [
      ['organization-uuid', learned.orgUuids, ORG_UUID_PLACEHOLDER],
      ['organization', learned.orgs, ORG_PLACEHOLDER],
      ['email', learned.emails, EMAIL_PLACEHOLDER],
    ];
    for (const [kind, values, placeholder] of known) {
      for (const value of values ?? []) {
        if (value && value !== placeholder && text.includes(value)) hits.push({ kind, value });
      }
    }
  }
  // Personal names.
  for (const re of names) {
    for (const m of text.matchAll(re)) hits.push({ kind: 'name', value: m[0] });
  }
  // Known organization name literals.
  for (const org of orgs) {
    let idx = text.indexOf(org);
    while (idx !== -1) {
      hits.push({ kind: 'organization', value: org });
      idx = text.indexOf(org, idx + org.length);
    }
  }
  // Real user name left in home paths.
  if (username && username !== 'user') {
    for (const needle of [`/home/${username}`, `-home-${username}-`]) {
      let idx = text.indexOf(needle);
      while (idx !== -1) {
        hits.push({ kind: 'home-path', value: needle });
        idx = text.indexOf(needle, idx + needle.length);
      }
    }
  }
  return hits;
}

// --- Join a block's fragments before scrubbing ---
// A stream_event content_block_delta carries one value (a path in a tool input, etc.) split over many lines
// (partial_json of input_json_delta, text of text_delta, thinking of thinking_delta). Scrubbing line by line misses
// home paths and emails that cross a split. Fragments are joined per block before scrubbing; the replacement goes into
// the fragment where the value started and is removed from the following ones (the number and positions of splits stay).

const FRAGMENT_FIELDS = { input_json_delta: 'partial_json', text_delta: 'text', thinking_delta: 'thinking' };

function deltaOf(o) {
  if (o?.type !== 'stream_event' || o.event?.type !== 'content_block_delta') return null;
  const field = FRAGMENT_FIELDS[o.event.delta?.type];
  if (!field || typeof o.event.delta[field] !== 'string') return null;
  return { key: `${o.parent_tool_use_id ?? ''}:${o.event.index}`, field };
}

function blockKey(o, type) {
  if (o?.type !== 'stream_event' || o.event?.type !== type) return null;
  return `${o.parent_tool_use_id ?? ''}:${o.event.index}`;
}

// Positions of the values to replace in the joined string (on overlap, the earlier one is kept).
function spansOf(text, state) {
  const literals = [
    ...[...state.orgs].map((v) => [v, ORG_PLACEHOLDER]),
    ...[...state.emails].map((v) => [v, EMAIL_PLACEHOLDER]),
    ...[...state.orgUuids].map((v) => [v, ORG_UUID_PLACEHOLDER]),
    ...[...state.mcpPorts].flatMap((p) => [[`localhost:${p}`, `localhost:${MCP_FAKE_PORT}`], [`127.0.0.1:${p}`, `localhost:${MCP_FAKE_PORT}`]]),
  ];
  if (state.username && state.username !== 'user') {
    literals.push([`/home/${state.username}`, '/home/user'], [`-home-${state.username}-`, '-home-user-']);
  }
  const spans = [];
  for (const [needle, replacement] of literals) {
    if (!needle) continue;
    let at = text.indexOf(needle);
    while (at !== -1) {
      spans.push({ start: at, end: at + needle.length, replacement });
      at = text.indexOf(needle, at + needle.length);
    }
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    if (m[0] !== EMAIL_PLACEHOLDER) spans.push({ start: m.index, end: m.index + m[0].length, replacement: EMAIL_PLACEHOLDER });
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const span of spans) if (!kept.length || span.start >= kept[kept.length - 1].end) kept.push(span);
  return kept;
}

/** Scrubs [fragments] as one value and splits it back into the same number of fragments. Returns the same array if nothing changed. */
export function scrubFragments(fragments, state) {
  const text = fragments.join('');
  const spans = spansOf(text, state);
  if (!spans.length) return fragments;
  const out = [];
  let offset = 0;
  for (const fragment of fragments) {
    const start = offset;
    const end = offset + fragment.length;
    offset = end;
    let piece = '';
    let at = start;
    for (const span of spans) {
      if (span.end <= at || span.start >= end) continue;
      if (span.start > at) piece += text.slice(at, span.start);
      if (span.start >= start) piece += span.replacement;
      at = Math.min(span.end, end);
    }
    if (at < end) piece += text.slice(at, end);
    out.push(piece);
  }
  return out;
}

/**
 * Scrubber that takes stdout lines in order and returns scrubbed lines once they can be written. While a block carrying
 * fragments is open, later lines are held too so the order is kept; when the block closes (content_block_stop or flush),
 * the fragments are joined and scrubbed before being released.
 */
export function createStreamScrubber(state) {
  const queue = []; // { line, o, delta }
  const open = new Map(); // block key → queue entries of its deltas
  const settle = (key) => {
    const entries = open.get(key);
    open.delete(key);
    if (!entries?.length) return;
    const fragments = entries.map((e) => e.o.event.delta[e.delta.field]);
    const scrubbed = scrubFragments(fragments, state);
    if (scrubbed === fragments) return;
    entries.forEach((e, i) => {
      if (scrubbed[i] !== fragments[i]) {
        e.o.event.delta[e.delta.field] = scrubbed[i];
        e.line = JSON.stringify(e.o);
      }
    });
  };
  const drain = () => (open.size ? [] : queue.splice(0).map((e) => replaceLine(e.line, state)));
  return {
    push(line) {
      learnLine(line, state);
      let o = null;
      try { o = JSON.parse(line); } catch { /* non-JSON lines pass through as is */ }
      const delta = deltaOf(o);
      const entry = { line, o, delta };
      if (delta) {
        if (!open.has(delta.key)) open.set(delta.key, []);
        open.get(delta.key).push(entry);
      }
      queue.push(entry);
      const stopped = blockKey(o, 'content_block_stop');
      if (stopped !== null && open.has(stopped)) settle(stopped);
      return drain();
    },
    flush() {
      for (const key of [...open.keys()]) settle(key);
      return drain();
    },
  };
}

/** Returns the fragments joined per block (tool input, text, thinking) from capture lines (verify runs findPii on them). */

export function joinedFragments(lines) {
  const blocks = new Map();
  const joined = [];
  for (const line of lines) {
    let o = null;
    try { o = JSON.parse(line); } catch { continue; }
    const delta = deltaOf(o);
    if (delta) blocks.set(delta.key, (blocks.get(delta.key) ?? '') + o.event.delta[delta.field]);
    const stopped = blockKey(o, 'content_block_stop');
    if (stopped !== null && blocks.has(stopped)) {
      joined.push(blocks.get(stopped));
      blocks.delete(stopped);
    }
  }
  return [...joined, ...blocks.values()];
}
