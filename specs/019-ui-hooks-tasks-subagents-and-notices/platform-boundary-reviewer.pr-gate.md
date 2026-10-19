# platform-boundary-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Gate**: pr-gate round 1

## 初回読了 viewpoint

- FR/SC in my slice:
  - FR-001 / FR-007: `includeHookEvents` and `forwardSubagentText` are literal `true` (`src/agents/session-core.ts:74-76,186-190`).
  - FR-008 / FR-009: live nesting in `src/agents/sdk-agent-session.ts:662-677,714-740`.
  - FR-010: `listSubagents` / `getSubagentMessages` in `src/agents/read-transcript.ts:74-97`.
  - FR-013 / SC-004: item 14 per-file restriction and fixtures.
  - FR-004 / FR-006: per-session task memory (checked for PB-2).
- Charter / Confirmation that apply to the touched files:
  - AD-055 Confirmation: the two APIs may be called only in `read-transcript.ts`, and fixtures make item 14 fire.
  - AD-054: the two keys are escalation-neutral.
  - Principle VII: nothing under `src/agents/` imports electron.
  - Principle III / AD-024 #13: the permission gate path is unchanged.
  - Principle I: `pathTail` moved to domain and is used only for display.
- A. 認可 / 認証 / secret 管理: 該当なし: owned by security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owned by security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: no `runtime` / `isolation` charter or code is touched, and no change crosses their Out of scope.
- D. Constitution / ADR drift: 該当なし: no drift in my slice.
  - Principle III: `permissionMode` / `QUERY_ESCALATION_OPTION_KEYS` are unchanged, and the new keys are typed as literal `true`.
  - Principle VII: the new domain modules `foreground-tasks.ts`, `command-name.ts` and `path-tail.ts` import only sibling domain files.
  - Principle I: `src/domain/session/path-tail.ts` is pure string slicing with no `node:path`, and its result never goes back into IPC.
  - AD-003 / AD-004 / AD-012: no runtime, branded path or docker code is touched.
- E. User Story / SC / AC / UX: 該当なし: owned by po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: owned by the optional reviewers
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

The diff adds two read-only SDK calls (`listSubagents` / `getSubagentMessages`) and the per-file table `AGENT_SDK_CALL_FILES`. Item 14 now reads every named import and tracks (imported, local) pairs, and four new fixtures cover it. Two literal-`true` query options are added, plus live and past-log subagent nesting and the `background-tasks` meter and tab.

PB-1 to PB-6 have no findings:

- **PB-1**: no HostPath / RuntimePath crosses IPC or persistence.
  - `read-transcript.ts` passes only `sessionId` and does not pass `dir`, the same as the existing `getSessionMessages`.
  - The config root is fixed per spawn through the `CLAUDE_CONFIG_DIR` env (`read-transcript.ts:16`), so subagent files resolve in the same runtime namespace as the main transcript.
- **PB-2**:
  - In `src/agents/`, the task memory and the tool-result tracker are per-run closures (`sdk-agent-session.ts:375,989` in the diff).
  - Grep for `^(let|const|var) ` found 0 module-scope matches in `foreground-tasks.ts` and in `live-tool-results.ts`.
  - On the renderer side, `backgroundTasks` is stored per session inside `SessionMeters`.
- **PB-3**: capabilities are not touched.
- **PB-4**: the gate is unchanged.
- **PB-5**: no path conversion changed.
- **PB-6**: nothing is persisted.

All the findings come from PB-7 and are carry-overs from the code-gate that are still unresolved.

## Findings

### [Medium] Item 14 still does not catch SDK re-exports, so `export { listSubagents } from '<sdk>'` gets past both the allowlist and the AD-055 per-file table (M-001) (scope: feature)

- **観察**:
  - `scripts/constitution/check.mjs:680-692` checks only `import * as x from SDK` and `import { ... } from SDK`.
  - Suppose `src/agents/x.ts` contains `export { getSubagentMessages } from '@anthropic-ai/claude-agent-sdk'` or `export * from ...`. It passes the directory check (`:670`) and produces no bindings, so it is not reported.
  - A module that imports from `x.ts` does not contain the package string, so `:668` skips it entirely.
  - The AD-055 "only `read-transcript.ts`" restriction can therefore be bypassed by an ordinary "shared SDK helper" refactor. Unrestricted write APIs such as `renameSession` can be bypassed the same way.
  - `UNDETECTED_NOTES['sdk-forbidden-call-alias']` (`tests/rule-fixtures/expected.mjs:737-760`) lists rebinding and dynamic import for the two AD-055 names, but not re-export.
  - This was reported as M-001 in the code-gate (`platform-boundary-reviewer.code-gate.md`). It was not in must_fix and is unchanged at HEAD.
- **同種事象探索**:
  - Grep for `claude-agent-sdk` in `src/` found no `export ... from` (imports only: `src/agents/enumerate-sessions.ts:1`, `src/agents/read-transcript.ts:5`, `src/agents/sdk-agent-session.ts:19`).
  - Grep for `export\s*\(|re-export|再 export` in `scripts/constitution` found 1 hit, `check.mjs:1119`. That hit belongs to the item that checks `node:process` `kill`, which shows the re-export pattern already exists elsewhere in this checker but is not applied to item 14.
  - There is no current violation; the gap is in the rule.
- **リスク/影響**: The first defense (no write IPC) still holds, so there is no harm today. But the second defense that AD-055 introduces stays green when it is bypassed.
- **推奨アクション**:
  - In item 14, treat `export\s*(\*|\{[^}]*\})\s*from\s*['"]` + `AGENT_SDK_PACKAGE` as a violation, the same way the namespace import is handled at `:683-686`.
  - Add the fixture `a-direct/sdk-reexport.ts.fixture` (`rules: ['#14']`).
  - If you accept the gap instead, add re-export to the `why` of `UNDETECTED_NOTES['sdk-forbidden-call-alias']`.
- **根拠**: AD-055 Decision 1 / Confirmation, AD-034 §3, PB-7.
- **scope 根拠**: `scripts/constitution/check.mjs` and `tests/rule-fixtures/expected.mjs` are touched files.

### [Low] The alias name goes into `new RegExp` without escaping, and the lookbehind does not treat `$` as part of an identifier (L-001) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:709` builds `(?<![.\w])` + local + `\s*\(`.
  - With `import { getSubagentMessages as $g }`, the pattern becomes `(?<![.\w])$g\s*\(`. There `$` is an end anchor, so a call outside `read-transcript.ts` is never reported.
  - This is a carry-over of code-gate L-001 and is unchanged.
- **同種事象探索**: Inside the item 14 block, `new RegExp` with an interpolated identifier appears once (`check.mjs:709`).
- **推奨アクション**: Regex-escape `local` and use the lookbehind `(?<![.\w$])`.
- **根拠**: PB-7.
- **scope 根拠**: Touched in this diff.

### [Low] No fixture shows that item 14 catches (or knowingly ignores) the re-export form (L-002) (scope: feature)

- **観察**: The 4 new fixtures (`tests/rule-fixtures/a-direct/sdk-{list-subagents-outside,get-subagent-messages-outside,second-import-statement,alias-to-allowed-name}.ts.fixture`) are a good regression set for the binding rewrite. Neither the fixtures nor `UNDETECTED_NOTES` mention the M-001 re-export form.
- **同種事象探索**: Grep for `export \{|re-export|再 export` in `tests/rule-fixtures/expected.mjs` found 0 hits.
- **推奨アクション**: Same as M-001.
- **根拠**: AD-055 Confirmation.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `claude-agent-sdk` in src/ (looking for `export ... from`) | 0 re-exports | src/agents/enumerate-sessions.ts:1, src/agents/read-transcript.ts:5, src/agents/sdk-agent-session.ts:19 (imports only) |
| M-001 | `export\s*\(\|re-export\|再 export` in scripts/constitution | 1 (a different item) | scripts/constitution/check.mjs:1119 |
| L-001 | interpolated `new RegExp` in item 14 | 1 | scripts/constitution/check.mjs:709 |
| L-002 | `export \{\|re-export\|再 export` in expected.mjs | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 2
