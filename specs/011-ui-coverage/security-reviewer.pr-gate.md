# security-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: security-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (pr-gate, HEAD 57fcc0b)

## 初回読了 viewpoint

- FR/SC: FR-007 (error / truncated marks on every display), FR-008, FR-009, FR-014, SC-003, SC-004, SC-006
- Charters / Confirmation: AD-043 Decision 2, AD-041 (g), AD-034 Decision 1, AD-044, session / ui charters, Constitution V / XIII
- A. 認可 / 認証 / secret 管理 / プロセス境界: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 本 reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

101 files, none under `src/main/**` / `src/preload/**`, no `BrowserWindow` / `ipcMain`, no new dependencies. New error text path: `ToolErrorResult` (`tool-result-marks.tsx:61-85`) renders `{result}` as a React text child, only when `isError` and non-empty; no raw HTML anywhere in `src/renderer` (0 hits); size capped by `sanitizeBody` 200KB and the 1MB resend cap; shape checked in `transcript-guard.ts:64-74`; marks are fixed labels. No Critical / High path.

## Round 1 inheritance

| R1 ID | Content | Status | Evidence |
|---|---|---|---|
| L-001 | `hook_name` without secret check | resolved | `system-event.ts:107-110`; test `system-event.test.ts:181` |
| L-002 | `mayCarrySecret` misses URL creds / Bearer / -p | resolved | `system-event.ts:121` `local_bash` always `''`; test `:160-175` |
| L-003 | Resend cap counts only `result` | resolved (documented) | `data-model.md:110-111` |
| L-004 | No cumulative cap test | resolved | `live-tool-results.test.ts:196-212` |

## Findings

### [Low] The `hook_name` check has the same blind spots (URL credentials / `Bearer` / `-p<pw>`) (L-101) (scope: feature)

- **観察**: `hook_name` relies on `mayCarrySecret` (`system-event.ts:44-51,110`), which the code itself distrusts for `local_bash` (`:119-120`). `curl -H Authorization:Bearer abc` passes and is shown up to 120 code points
- **同種事象探索**: `mayCarrySecret\(` 1 call site (`system-event.ts:110`)
- **リスク/影響**: CWE-200; in practice `hook_name` is usually an event:matcher label
- **推奨アクション**: (a) show only `hook_name` matching an allowlist shape such as `^[A-Za-z]+(:[\w.*-]*)?$`, else `''`; or (b) extend `mayCarrySecret`. Add a Bearer / URL-credential test
- **根拠**: CWE-200 / CWE-532, Constitution V, data-model §2
- **scope 根拠**: touched file

### [Low] (H) No test pins `ToolErrorResult` to plain text against HTML injection (L-102) (scope: feature)

- **観察**: error text tests use ASCII only (`SessionScreen.o2.test.tsx:212-231,266-282`). Safe today, but a future change to Markdown/HTML would expose 5 displays. Separately, the `<pre>` has no height limit (ux-reviewer's call)
- **推奨アクション**: add a failed-Edit test with `'<img src=x onerror="window.__pwned=1">'` asserting no `img` in `[data-slot="tool-result-error-text"]` and `window.__pwned` undefined
- **根拠**: reviewer-base H, OWASP A03, CWE-79
- **scope 根拠**: touched files

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 | `mayCarrySecret\(` (excluding tests) | 1 | src/domain/session/system-event.ts:110 |
| L-102 | `tool-result-error-text\|onerror\|<script` (`*.test.tsx`) | 0 for the target | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
- Round inheritance: resolved 4 / unresolved 0 / new 2
