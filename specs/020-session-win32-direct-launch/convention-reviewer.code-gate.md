# convention-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: convention-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: code-gate iter 2

## 初回読了 viewpoint

- FR/SC: FR-014, FR-015, FR-001〜FR-013, SC-001〜SC-006
- lint-agent JSON 受領済み (自分では lint を実行していない / CONV-1)。全 6 command exit_code 0 (eslint / tsc x3 / depcruise / constitution)。error 0 / warning 27 (prettier/prettier)。CONV-1 Critical 0 件
- iter 1 からの差分は c49190c の 5 ファイル
- A. 認可 / 認証 / secret 管理: 該当なし: owner 外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner 外
- C. 業務不変条件 / Charter drift: 該当なし: owner 外
- D. Constitution / ADR drift: 該当なし: owner 外 (constitution 検査は違反 0 / 検査対象なし 1)
- E. User Story / SC / AC / UX: 該当なし: owner 外
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:3
- G. optional reviewer 範囲: 該当なし: owner 外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

c49190c は確認文言の wsl / win32 分割 (`labels.ts:528-543`) と `RunningSessionsProvider.tsx:59-64` の `runtimeTitle` 利用。import 前例と一貫、重複定義なし、取り残された旧参照なし。新設モジュールの配置は plan.md のレイヤ表どおり。

## Findings

### [Medium] prettier/prettier warning 27 件 / 8 ファイル (M-001)
- launch-preparation.test.ts, provider-service.test.ts, win32-claude-path-service.ts, win32-claude.test.ts, win32-claude.ts, runtime-settings-store.ts, LaunchDialog.test.tsx, RunningSessionsProvider.test.tsx。iter 1 は 24 件 / 6 ファイル
- exit_code 0 で gate は阻害しない。AD-050 により棚卸しで扱う

### [Medium] 500 行超ファイルの肥大 (M-002)
- `sdk-agent-session.ts` 813→976 行、`session-core.ts` 639、`LaunchDialog.tsx` 790、`labels.ts` 597 (全て既存超過)

### [Low] `isWin32LaunchInput` が export されて未使用 (L-001)
- `src/domain/session/agent-session.ts:228`

### [Low] 確認文言選択が JSX 内の入れ子三項 (L-003)
- `LaunchDialog.tsx:760-764`

### [Low] `.vitest/` が untracked かつ .gitignore に無い (L-002) (scope: out-of-scope)

## 同種事象探索 cascade summary

Critical は 0 件のため該当なし。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | lint-agent violations[] | 27 / 8 files | 上記 |
| M-002 | 500 行超ファイル増分 | 4 | sdk-agent-session.ts, session-core.ts, LaunchDialog.tsx, labels.ts |
| L-001 | `isWin32LaunchInput\|isWslLaunchInput` | 1 | agent-session.ts:228 |
| L-003 | `PROVIDER_RESET_CONFIRMATION` | 1 | LaunchDialog.tsx:760-764 |
| L-002 | `.vitest` (git status) | 1 | `.vitest/` |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 3
- Round inheritance: resolved 0 / unresolved 4 / new 1 (L-003)
