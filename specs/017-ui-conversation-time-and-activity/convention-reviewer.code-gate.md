# convention-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17
**Reviewer**: convention-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Round**: 1 (code-gate iteration 1)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-005 / SC-001、FR-006 / FR-007 / SC-002、FR-008〜FR-011 / SC-003、FR-012 / FR-013 / SC-004、FR-014 / FR-016 / SC-006、FR-005 / SC-005
- touched files に該当する charter / Confirmation: ui charter の In scope (conversation map / observability 表示 / 右のペインのタブの表 / 長大スレッドの仮想化)。session charter の AD-051 (U-1)。AD-045 / AD-046 Decision 4。Constitution VII / XV
- lint-agent JSON (CONV-1): 受領。`exit_code` 0。`commands[]` 5 本 (eslint / tsc 2 本 / depcruise / constitution) すべて 0、`violations[]` 空。非ゼロ exit が無いので Critical 0
- A. 認可 / 認証 / secret 管理: 該当なし: owner 範囲外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner 範囲外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: owner 範囲外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: owner 範囲外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: owner 範囲外 (po-reviewer)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:6
- G. optional reviewer 範囲: 該当なし: optional reviewer 範囲を持たない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

diff 56 ファイル (docs 7、src 変更 31、src 新規 15、tests 1、spec 付随 3)。レイヤ配置は plan の表どおり。循環なし (depcruise no-circular 違反 0)。ファイル名規則は一貫。spec / plan / data-model の識別子は実装と一致。

## Findings

### [Medium] 新しいタブの component テストが、分割を求められている `AppShell.test.tsx` に追記された (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/shell/AppShell.test.tsx:414` から約 55 行の「会話の地図」のタブのテスト。ファイルは 1,189 行。roadmap O-4 の行と spec FR-008 は `test-support/` に setup を出して分けると定める
- **同種事象探索**: `ConversationMapTab|conversationMapTab` in `AppShell.test.tsx` で 1 件。同タブのテストは `ConversationMapTab.test.tsx` / `RightPanel.tabs.test.tsx` にもあり 3 箇所に分散
- **リスク/影響**: CONV-3 の悪化。`SizedResizeObserver` スタブが `ConversationMapTab.test.tsx` と重複
- **推奨アクション**: テストを `RightPanel.tabs.test.tsx` か `ConversationMapTab` 側へ移し、`SizedResizeObserver` を `test-support/` に出す
- **根拠**: roadmap O-4 / spec FR-008 / CONV-3

### [Medium] tasks が名指すテストの一部が無い (H-001) (scope: feature)

- **観察**: tasks.md FE-012 / FE-022 が挙げる次のテストが見当たらない
  - 実行中で SDK 時刻をホストから 5 分ずらしても所要時間が受信時刻どうしで出る component テスト (US-1 AC6 / SC-002)。AC6 は `turns.test.ts` 単体のみ
  - 所要時間が変わらない更新で利用者メッセージが再描画されない (RK-10)
  - hover / focus の全体書式、Hook / task 行と divider に時刻が出ない、入れ子のメッセージ
  - 地図: 実行中に行が増えてもスクロールとフォーカスが動かない、右ペインを畳むと描かない
  - `ConversationTimeProvider` の test と `convert.test.ts` (`createdAt` 二重書き込み)
  - `isRunBusy` (`composer-queue.ts:42`) の直接テスト
- **同種事象探索**: `receivedAt|hover|userEvent` in `MessageTimeLabel.test.tsx` 0 件。`isRunBusy` in `*.test.*` 0 件
- **リスク/影響**: U-8 の component レベルの回帰が `deriveTurns` 単体にしか守られない
- **推奨アクション**: `MessageTimeLabel.test.tsx` に skew ±5 分 fixture、`composer-queue.test.ts` に `isRunBusy` 2 ケース、RK-10 の再描画テスト
- **根拠**: tasks.md FE-012 / FE-022 / spec SC-002 / plan RK-10

### [Low] import の並びのずれ (L-001)

- `CenterPane.tsx:18`、`thread.aui.tsx:33`。lint に import order 規則なし (CONV-4)

### [Low] 他モジュールから使われない export (L-002)

- `EMPTY_TURN_DURATIONS` (`conversation-time-context.ts:9`)、`TURN_HEAD_MAX_CODE_POINTS` / `TURN_MARK_CATEGORIES` / `startsTurn` / `Turn.clock` (`turns.ts`)、`CONVERSATION_MAP_THROTTLE_MS` (`ConversationMapTab.tsx:37`)、`ThrottledConversation` (`useThrottledConversation.ts:11`)。`Turn.endedAt` は test のみ (CONV-5)

### [Low] `isRunBusy` に寄せられていない inline 複製 (L-003)

- `running-session-store.ts:347` の `!terminal && isBusyRunState(runState)` (CONV-5)

### [Low] 用語集の語と識別子のずれ (L-004)

- glossary は `Activity bar`、実装は `activityBins` / `ActivityBand` / `band`。bin / band / bar が混在 (CONV-6 / Principle XIV)

### [Low] 500 行超えのファイルがさらに伸びた (L-005)

- `thread.aui.tsx` 1,402 / `live-signals.ts` 836 / `running-session-store.ts` 805 / `AppShell.test.tsx` 1,189 ほか。新規最大は `ConversationMapTab.tsx` 417 行 (CONV-3)

### [Low] 配置と記録の細部 (L-006)

- `ConversationNavigateContext` が `center-conversation.ts:79-83` に置かれ plan の記述と異なる
- リポジトリ直下 `.vitest/json/output.json` が未追跡で `.gitignore` に無い
- `docs/glossary.md` frontmatter `generated_by` に O-9 の追記が無い

## lint-agent の生出力 (CONV-1)

invoker から受領 (eslint / tsc node / tsc web / depcruise / check:constitution すべて exit 0、violations 0)。lint 由来の finding は 0 件。

## 同種事象探索 cascade summary

Critical は 0 件なので cascade 対象は無い。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `ConversationMapTab\|conversationMapTab` in AppShell.test.tsx | 1 | `src/renderer/src/features/shell/AppShell.test.tsx:414` |
| H-001 | `receivedAt\|hover\|userEvent` in MessageTimeLabel.test.tsx | 0 | `src/renderer/src/features/chat/MessageTimeLabel.test.tsx` |
| L-002 | 新規 export の他ファイル参照 (src) | 0 | `turns.ts:17,22,32,50` ほか |
| L-003 | `isBusyRunState\(\|!terminal &&` | 2 | `composer-queue.ts:43`, `running-session-store.ts:347` |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 6
