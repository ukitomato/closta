# security-reviewer Review: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01
**Reviewer**: security-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 (`SelectablePermissionMode`)、FR-003 (`validate.ts` / decoder / SDK 直前の assert の 3 段)、FR-004 (項目 16 と rule fixture)、FR-005 / FR-006 (`requiresAutoModeConfirmation`)、FR-007 (`autoUnconfirmed`)、FR-012 (プリセット版 3)、SC-002 / SC-003。
- charter / Confirmation: AD-066 Confirmation 1-3、AD-041 (a) / AD-062 Decision 1 / AD-059 Decision 3 の置き換え、session charter の権限モードの規則。
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

起動・再開・実行中の 3 つの IPC の口に `autoModeAcknowledged` を足す変更。preload は既存の 3 関数の引数が 1 つ増えただけ。`ipc.ts:220-225` の `isTrustedSender` は迂回されない。main は `=== true` だけを承諾とみなし (`session-ipc.ts:203,246,413`)、確認が要るのに印が無ければ `prepareLaunch`・枠の予約・制御の送信の前に `auto-mode-unconfirmed` で拒否する。agents の decoder (`session-core.ts:557`, `sdk-agent-session.ts:324`) と SDK 直前の assert (`sdk-agent-session.ts:799,892`, `session-core.ts:257`) は `acceptEdits` / `bypassPermissions` を落とす。`PERMISSION_MODE_ESCALATION_VALUES` は `auto` を含めたまま。再開の init の検査 (`sdk-agent-session.ts:983-991`) は頼んだ値と比べる形。renderer は固定のラベルだけを描く。secret / openExternal / spawn / 依存の追加は無し。

## Findings

### [Medium] renderer が送る確認の印は「承諾した事実」ではなく「確認が要るか」から作られている (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/LaunchDialog.tsx:590` の `send()` は `const ack = requiresAutoModeConfirmation(config.permissionMode, autoModeAllowed)` で印を作る。今正しく動くのは `send()` の呼び出し 2 か所 (`:613` の `launch()` と `:625` の `acceptAuto()`) が承諾済みの時だけ呼ぶから。`LivePane.tsx:219` / `:353` は false / true を直に渡しており問題無し。
- **同種事象探索**: `requiresAutoModeConfirmation\(` (renderer、非 test) で 3 件 (`LaunchDialog.tsx:590`, `:607`, `:944`)。印を「要るか」から作るのは `:590` の 1 件。
- **リスク/影響**: 今後 `send()` を確認の前に呼ぶ経路を足すと、確認を出さずに main の検査 (FR-007) を通る。今その経路は無いので Medium。
- **推奨アクション**: `send(config, acknowledged: boolean)` にし、承諾の分岐だけが `true` を渡す。テストを 1 件足す。
- **根拠**: spec FR-007、AD-066 Decision 2、CWE-807

### [Low] 実行中の切り替えの印の検査で、`runtimeId` が無いと検査を飛ばす (L-001) (scope: feature)

- **観察**: `src/main/app/session-launch-service.ts:654-657` は `runtimeId !== undefined && autoUnconfirmed(...)` で、`undefined` なら検査を飛ばす (fail-open)。今は届かない分岐。
- **同種事象探索**: `autoUnconfirmed\(` で 3 件 (`:580`, `:591`, `:655`)。`undefined` で通す形は `:655` の 1 件。
- **推奨アクション**: entry が無ければ先に `unknown-session` を返すか、`runtimeId ?? ''` で確認が要る側に倒す。
- **根拠**: AD-066 Decision 2、CWE-636

### [Low] AD-066 Alternatives の記述が main の印の検査で防げる範囲を言い過ぎている (L-002) (scope: feature)

- **観察**: `docs/decisions/0066-auto-permission-mode-with-confirmation.md` の Alternatives は「renderer の確認だけにすると直接 IPC を呼ぶ経路で確認を飛ばせる」と書くが、印は renderer の自己申告で、preload を直接呼べば通る。
- **同種事象探索**: `autoModeAcknowledged` (src/main, src/preload) で、印を main が発行する仕組みは 0 件。
- **推奨アクション**: ADR に「印は renderer の実装の漏れに対する二重化で、乗っ取られた renderer への防御ではない」と 1 行書く。
- **根拠**: AD-066 Decision 2、spec FR-007

### [Low] H: 実行中の印の検査に、registry の entry が無い分岐のテストが無い (L-003) (scope: feature)

- **観察**: `session-launch-service.test.ts` は印の 4 種類の値と 3 経路を網羅するが、L-001 の分岐のテストは無い。
- **推奨アクション**: L-001 を直すならテストを 1 件足す。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `requiresAutoModeConfirmation\(` (renderer, 非 test) | 3 | src/renderer/src/features/session/LaunchDialog.tsx:590, :607, :944 |
| L-001 | `autoUnconfirmed\(` | 3 | src/main/app/session-launch-service.ts:580, :591, :655 |
| L-002 | `autoModeAcknowledged` (main / preload) | 発行する仕組み 0 件 | src/main/app/session-ipc.ts:203, :246, :413; src/preload/index.ts:62-63, :68-69, :86-87 |
| L-003 | `auto-mode-unconfirmed` (main test) | entry 無しは 0 件 | src/main/app/session-launch-service.test.ts |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
