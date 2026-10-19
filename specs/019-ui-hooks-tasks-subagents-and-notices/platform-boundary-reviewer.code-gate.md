# platform-boundary-reviewer Review: 019 UI hooks / tasks / subagents and notices

**Run**: 2026-10-19
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Gate**: code-gate iter 1

## 初回読了 viewpoint

- FR/SC in my slice: FR-001 / FR-007 (`includeHookEvents` / `forwardSubagentText` are literal `true` in `QUERY_OPTION_KEYS`), FR-010 (`listSubagents` / `getSubagentMessages` in `read-transcript.ts`), SC-004 (item 14 / 16 boundary and fixtures). FR-004 / FR-006 / FR-008 also touch `src/agents/`, but only through per-session closures, so I looked at them for PB-2.
- Charter / Confirmation that apply to the touched files: AD-055 Confirmation (item 14 allows the two calls only in `read-transcript.ts`, and fixtures make it fire), Principle VII (`src/agents/` does not import electron), Principle III / AD-024 #13 (permission gate), Principle I (`pathTail` moved to domain).
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: no `runtime` / `isolation` charter files or code are touched. No other changes cross the runtime/isolation Out of scope.
- D. Constitution / ADR drift: 該当なし: Principle I (`pathTail` is display-only slicing of conversation strings and never goes back into IPC), Principle III (`permissionMode` path is unchanged, and the 2 new query keys are not in `QUERY_ESCALATION_OPTION_KEYS` and do not escalate), Principle VII (no new electron or native import in `src/agents/`), AD-003 / AD-004 / AD-012 (no runtime or path-type code changed). None of these show drift.
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

The diff adds four things:
- `listSubagents` and `getSubagentMessages` to `AGENT_SDK_ALLOWED_CALLS`, plus a new per-file restriction table `AGENT_SDK_CALL_FILES` (AD-055).
- A rewrite of item 14's binding collection. It now reads every named import statement and tracks (imported, local) pairs, so aliasing a restricted API to an allowed name is caught.
- Four new violation fixtures.
- Two literal-`true` query options (AD-054), live and past-log subagent nesting, and the background-task meter and tab.

PB-1 to PB-6 have no findings:
- PB-1: no HostPath / RuntimePath values cross IPC or persistence. `pathTail` is display-only and documented as never fed back into IPC.
- PB-2: the task memory and tool-result tracker are per-run closures (`sdk-agent-session.ts:375`). There is no new module-scope state in `src/agents/` or in `foreground-tasks.ts`, apart from the constant `MAX_FOREGROUND_TASKS`.
- PB-3: capabilities are not touched.
- PB-4: the `permissionMode` path is unchanged, and the new options are escalation-neutral.
- PB-5: no path conversion changed. `read-transcript.ts` passes no `dir`, which matches the existing `getSessionMessages`.
- PB-6: nothing is persisted.

The findings come from PB-7, gaps in the rewritten item 14 rule.

## Findings

### [Medium] Item 14 misses SDK re-exports: `export { listSubagents } from '<sdk>'` gets past both the allowlist and the AD-055 per-file restriction (M-001) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:680-692` checks only two import forms: `import * as x from SDK` (an error) and `import { ... } from SDK` (binding collection). Suppose a file under `src/agents/` contains `export { listSubagents } from '@anthropic-ai/claude-agent-sdk'` or `export * from '@anthropic-ai/claude-agent-sdk'`:
  - It passes the directory check at `:670`.
  - It matches neither regex, so it produces no bindings and no finding.
  - Any file that imports from that re-exporting module does not contain the package string, so `:668` skips it entirely.
  The result is that `listSubagents(` / `getSubagentMessages(` can be called outside `read-transcript.ts` without detection. Write APIs such as `renameSession` can also be called that way from any `src/` file. AD-055 Decision 1 says "項目 14 は 2 つの呼び出しを他のファイルで見つけたら発火する". `UNDETECTED_NOTES` in `tests/rule-fixtures/expected.mjs:739-756` lists rebinding and dynamic import as known limits, but not re-export. No fixture covers this form. Item 14 is the only guard for the SDK package: no ESLint or dependency-cruiser rule references `claude-agent-sdk`.
- **同種事象探索**: Grep `claude-agent-sdk` in `src/` found 5 hits. None is an `export ... from` (`src/agents/enumerate-sessions.ts:1`, `src/agents/read-transcript.ts:5`, `src/agents/sdk-agent-session.ts:19`, plus 2 `vi.mock` lines in tests). Grep `claude-agent-sdk` in `eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/*.mjs` found 0 guarding rules (only the `AGENT_SDK_PACKAGE` constant and a `node_modules` path). So there is no current violation; this is a gap in the rule.
- **リスク/影響**: The first defense (no write IPC) still holds, so nothing is harmed today. But the per-file restriction that AD-055 introduces can be bypassed by an ordinary refactor, such as a "shared SDK helper" module, and the check stays green.
- **推奨アクション**: In item 14, treat `export\s*(\*|\{[^}]*\})\s*from\s*['"]` + `AGENT_SDK_PACKAGE` as a violation ("SDK を再 export している (呼び出し形で検査できない)"), the same way the namespace import is handled at `:683-686`. Add a fixture `a-direct/sdk-reexport.ts.fixture` to `expected.mjs` with `detectors: ['constitution']`, `rules: ['#14']`. If you choose to accept the gap instead, record re-export in `UNDETECTED_NOTES` next to rebinding and dynamic import.
- **根拠**: AD-055 Decision 1 / Confirmation, AD-034 §3, PB-7.
- **scope 根拠**: `scripts/constitution/check.mjs` and `tests/rule-fixtures/expected.mjs` are touched files in this diff.

### [Low] The alias name goes into `new RegExp` without escaping, so aliases containing `$` never match the call pattern (L-001) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:709` builds `` String.raw`(?<![.\w])` + local + String.raw`\s*\(` ``. With `import { listSubagents as $ls }`, the pattern becomes `(?<![.\w])$ls\s*\(`, where `$` is an end anchor. It never matches, so `$ls(...)` outside `read-transcript.ts` is not reported. The lookbehind `[.\w]` also does not treat `$` as part of an identifier.
- **同種事象探索**: Grep `new RegExp\(` together with an interpolated identifier inside the item 14 block: 1 hit (`check.mjs:709`).
- **リスク/影響**: Another bypass by naming alone. Unlikely in practice.
- **推奨アクション**: Escape `local` (`local.replace(/[$]/g, '\\$')`, or a general regex escape) and use `(?<![.\w$])` for the lookbehind.
- **根拠**: PB-7.
- **scope 根拠**: Touched in this diff.

### [Medium] No fixture or test shows item 14 catches the re-export form (H-001) (scope: feature)

- **観察**: The 4 new fixtures (`tests/rule-fixtures/a-direct/sdk-*.ts.fixture`) cover direct calls outside the file, a second import statement, and aliasing to an allowed name. They are a good regression set for the rewrite. Nothing covers M-001's re-export form, and nothing records it as undetected.
- **同種事象探索**: Grep `export \{|re-export|再 export` in `tests/rule-fixtures/expected.mjs`: 0 hits.
- **推奨アクション**: Same as M-001 (add a fixture, or add an `UNDETECTED_NOTES` entry).
- **根拠**: AD-055 Confirmation.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `claude-agent-sdk` in src (looking for `export ... from`) | 0 re-exports (5 imports/mocks) | src/agents/enumerate-sessions.ts:1, src/agents/read-transcript.ts:5, src/agents/sdk-agent-session.ts:19 |
| M-001 | `claude-agent-sdk` in eslint / depcruise / scripts/constitution | 0 guarding rules | scripts/constitution/allowlists.mjs:350 (constant), check.mjs:1343 (node_modules path) |
| L-001 | interpolated identifier in `new RegExp` inside item 14 | 1 | scripts/constitution/check.mjs:709 |
| H-001 | `export \{|re-export|再 export` in expected.mjs | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 1
