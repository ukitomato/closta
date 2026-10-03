# platform-boundary-reviewer Review: O-2 ui-coverage (specs/011-ui-coverage)

**Run**: 2026-10-03
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Gate**: pr-gate Round 1 (diff `main...HEAD`, HEAD a05dfc8, 88 files)

## 初回読了 viewpoint

- FR/SC in my slice: FR-003 / SC-001 / SC-002 (item 21, `coverage.mjs`), FR-007 (`live-tool-results.ts` and wiring), FR-008 / FR-009 (`system-event.ts`, as far as Principle VII / layer rules apply)
- Charter / Confirmation: Principle I / II / VII and the layer matrix in `eslint.config.mjs`; the `GENERATED_FILES` relaxation and restore blocks (`eslint.config.mjs:530-599`); Principle XII item 21. No file belongs to `runtime` / `isolation`.
- A. 認可 / 認証 / secret 管理: 該当なし: owner is security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner is security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: none of the 88 files is in the `runtime` / `isolation` domain
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: owner is po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: ui-coverage-reviewer owns the table decisions
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

The diff adds item 21 (`check.mjs:1298-1358`) with pure functions in `coverage.mjs`, 3 new src modules, and an eslint change re-enabling `react-hooks/refs` and `no-empty` for `thread.aui.tsx`. `src/preload`, `src/main`, `src/agents/supervisor*`, `transport.ts`, `.dependency-cruiser.js`, `allowlists.mjs`, `scan.mjs`, `scripts/rules` are unchanged.

### What I verified

- **eslint.config.mjs**: only stricter. The restore block at `:557-567` follows the relaxation at `:536` / `:539` and nothing later turns them off. The relaxation never touches `no-restricted-imports`, `boundaries/*` or Principle II rules. (`explicit-function-return-type` still off for `thread.aui.tsx` is a CONV-5 question.)
- **Item 21**: code-gate L-001 fixed (`readFileSync` inside try/catch, `:1327-1331`); L-002 fixed (`item21.test.ts:122-132` removes the table and `sdk.d.ts` in one child process). No env/argv override. Exports still used by `check.mjs` / `item21.test.ts` remain exported. `expected.mjs` runs to `#20` and does not depend on the item count; item 21 has its own firing test.
- **PB-2**: `createLiveToolResultTracker()` keeps state in the factory closure; one per `run()` (`sdk-agent-session.ts:276`); bounded at 256.
- **PB-1 / PB-3〜PB-6**: 該当なし (added-line grep found only test fixture literals and `tests/ui-coverage/item21.test.ts` temp-dir usage, cleaned in `afterAll`).
- **PB-7**: the only rule change tightens.

### Not verified by me: the rule-firing run

I did not run `scripts/rules/run.mjs` (Bash limited to git diff; the runner must run alone). The invoker must record it.

> **invoker 注記**: Round 1 の reviewer 起動前に `node scripts/rules/run.mjs` を単独で実行し、exit 0 (期待表と一致) を確認した。verdict の `rule_verification` に記録する。

## Findings

None.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (none) | added-line grep `process\.platform\|node:path\|child_process\|spawn\|HostPath\|RuntimePath\|autoModeSafe\|permissionMode\|capabilities\|docker\|wsl\|homedir` | 6 relevant (test fixtures / item21.test.ts) | diff L4354-4358; tests/ui-coverage/item21.test.ts:1,12,41-42,68 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
