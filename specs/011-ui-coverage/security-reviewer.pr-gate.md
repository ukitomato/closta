# security-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: security-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 3 (pr-gate, HEAD a28fcf9; diff 57fcc0b..a28fcf9)

## 初回読了 viewpoint

- FR/SC: FR-007, FR-008 / FR-009 (hook_name allowlist), SC-003, SC-004, SC-006
- Charters / Confirmation: AD-043 Decision 2, AD-041 (g), AD-034 Decision 1, AD-044, session / ui charters, Constitution V / XIII
- A. 認可 / 認証 / secret 管理 / プロセス境界: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 本 reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

Round 2 fixes: `hook_name` allowlist (`system-event.ts:59-65`), tests (`system-event.test.ts:201-227`, `SessionScreen.o2.test.tsx:359-374`), `ToolResultMarks` in terminal-block, fixed text `taskFailedGuidance`. No change under `src/main/**` / `src/preload/**`; no rendering use of `innerHTML`.

## Round 2 inheritance

| R2 ID | Content | Status | Evidence |
|---|---|---|---|
| L-101 | `hook_name` check misses URL creds / Bearer / -p | resolved | `HOOK_NAME_SHAPE` rejects whitespace, `/`, `@`, `=`, quotes, `$`; `mayCarrySecret` still applied; tests :201-227 |
| L-102 | No HTML injection test for `ToolErrorResult` | resolved | `SessionScreen.o2.test.tsx:359-374` |

Residual analysis: truncation adds `…` which fails the allowlist (no cut-off secret prefix shown); known prefixes still blocked by `mayCarrySecret`; a bare prefix-less word-shaped secret as the whole `hook_name` or a `:` segment would pass, but no observed path — not raised (hypothetical, and fixing it would drop legitimate matcher names). Non-ASCII fails `\w`.

## Findings

No new findings. `ToolResultMarks` takes only booleans; `taskFailedGuidance` is a constant shown only for failed / killed task rows; `title` attributes are React-escaped and pass through `oneLine` (and the allowlist for `name`).

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (none) | `dangerouslySetInnerHTML\|innerHTML` in `src` | 0 rendering uses | comments / test reads only |
| (none) | `ToolResultMarks` call sites | 6 components | all pass only booleans |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: resolved 2 / unresolved 0 / new 0
