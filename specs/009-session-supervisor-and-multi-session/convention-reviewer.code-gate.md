# convention-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01
**Reviewer**: convention-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 2 (code-gate iteration 2。iteration 1 の出力は `convention-reviewer.code-gate.md.iter1`)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-004 (`src/agents/supervisor*.ts`, `transport.ts`, `session-spawner.ts`, `session-status-relay.ts`)。FR-005 (`concurrency.ts`)。FR-008〜FR-011 (`running-session-store.ts` / `running-session-context.ts` / `running-session-types.ts` / `session-view.ts` / `RunningSessionList.tsx` / `useRunningThreadList.ts` / `useLiveSession.ts`)。FR-016 (glossary の Running session list)。SC-002・SC-009・SC-001/003/006
- touched files に該当する charter / Confirmation: session charter、AD-043 Decision 1・7、AD-021、Constitution Principle XIV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (glossary の語と識別子の整合は CONV-6 として F で数える)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:3
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

対象は `.code-gate-scope.txt` の 97 ファイル。lint-agent の 6 detector (lint / typecheck:node / typecheck:web / typecheck:e2e / depcruise / check:constitution) はすべて `exit_code: 0`・`violations: []`。iteration 1 の 12 件はすべて resolved。新しい指摘は Low 3 件。

## 前回指摘の解消状況

- **H-001 — resolved**: `src/` で旧識別子 0 件。`RunningSessionStore` / `createRunningSessionStore` / `runningSessionStore` / `useRunningSessionStore`。plan.md:230 に注記
- **M-001 — resolved**: `eslint.config.mjs:383-394` の boundaries が全レイヤで禁止し 2 ファイルだけ開ける。`RESTRICTED_DEFAULT` (`:152`) にも追加し `:450` / `:456` で without。eslint 発火 fixture 2 件 (`expected.mjs:595-610`)
- **M-002 — resolved**: plan.md / tasks.md に「実装時の変更」注記と取り消し線
- **M-003 — resolved**: `eslint.config.mjs:558-567` で `thread-list.aui.tsx` の strictness を戻した
- **M-004 — resolved**: `running-session-context.ts:21-40` に集約、`stores/` に置かない理由を `:18` に記載
- **M-005 — resolved**: `verify.yml:132-142` に typecheck (e2e)・launch-dialog・multi-session、`discovery.md:149` に E2E 型検査の行
- **M-006 — resolved**: `session-event-decoder.test.ts` が kind ごとに正例・負例
- **L-001 — resolved**: `running-session-store.ts` 442 行 (前回 590)
- **L-002 — resolved**: `useRunningThreadList.ts`
- **L-003 — resolved**: `session-spawner.ts` の export は `createSupervisorConnection` だけ
- **L-004 — resolved (本番コードのみ)**: テストの残りは L-007 (new)
- **L-005 — resolved**: `RunningSessionList.tsx`

## Findings

### [Low] 改名の後に旧名を指すコメントとテスト見出しが残っている (L-006) (scope: feature) — new

- **観察**: `SessionScreen.tsx:69` のコメント「契約は running-thread-list.ts」、`running-session-store.test.ts:113,202,263,361` の describe 見出し `'session-store — …'`、`eslint.config.mjs:320-327` の (3) のコメントに `worker_threads` が無い
- **推奨アクション**: それぞれ新しい名前に直し、(3) に `worker_threads` を足す
- **対応 (invoker)**: iteration 2 の中で修正済み (lint / 該当テスト緑)

### [Low] `transport.test.ts` が `OpaqueBody` を supervisor 専用モジュール経由で import している (L-007) (scope: feature) — new

- **観察**: `src/agents/transport.test.ts:3` `import type { OpaqueBody } from './supervisor-protocol'`
- **推奨アクション**: `import type { OpaqueBody } from './transport'`
- **対応 (invoker)**: iteration 2 の中で修正済み

### [Low] scope 内の変更ファイルで 500 行を超えるものがある (L-008) (scope: feature) — new

- **観察**: `SessionScreen.tsx` 567 行、`LaunchDialog.tsx` 733 行、`sdk-agent-session.ts` 566 行
- **推奨アクション**: 本 PR での分割は求めない。後続で一覧と画面の結線の分離を検討する

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 |
|---|---|---|
| L-006 | `\b(session-store\|running-thread-list)\b` (src) | 5 (+ eslint.config.mjs のコメント) |
| L-007 | `OpaqueBody` (src) | 15 (向きが逆なのは 1 件) |
| L-008 | 行数 | 3 |

Critical は 0 件。lint-agent の 6 detector はすべて `exit_code: 0`。

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
- Round inheritance: resolved from 1: 12 / unresolved: 0 / new: 3 (L-006, L-007 は修正済み、L-008 は見送り)
