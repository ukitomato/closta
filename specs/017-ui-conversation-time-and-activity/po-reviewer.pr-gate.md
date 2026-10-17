# po-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17T13:30:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: この PR は FR-001〜FR-016 と SC-001〜SC-006 を全部実装している。PO の観点で中身まで見たのは US-1 AC1〜AC6 (FR-006 / FR-007、SC-002)、US-2 AC1〜AC6 (FR-008〜FR-011、SC-003)、US-3 AC1〜AC4 (FR-012 / FR-013、SC-004)、Edge Cases の 9 項目。
- touched files に当たる charter / Confirmation: ui charter の Mission、KPI「表示網羅」、Related Specs の O-9 行、「長大スレッドは仮想化する」。session charter の U-1。AD-051 (Decision と Confirmation)。AD-046 Decision 4 (タブの表)。AD-050 (Medium / Low の扱い)。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (時刻の未信頼検査は FR-004 として security / architecture が見る)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:1 Low:0
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

時刻 (`createdAt`) を 3 つの経路で埋める: 過去ログは `transcript-time.ts` / `transcript.ts`、実行中は `live-message.ts` / `sdk-agent-session.ts`、利用者の入力は `running-session-store.ts` の `appendUser`。所要時間の時計として、renderer の中だけで持つ `receivedAt` を足す。画面には 3 つを足す: 中央の時刻と所要時間 (`MessageTimeLabel.tsx` / `thread.aui.tsx`)、右のペインの「会話の地図」タブ (`ConversationMapTab.tsx`。ターンは `turns.ts`、間引きは `useThrottledConversation.ts`、公開口は `center-conversation.ts`)、活動の帯 (`activity-bins.ts`)。合わせて ui-coverage / glossary / charter / roadmap / AD-051 を書き換える。

地図と帯の移動の経路は O-3 の `navigateTo` を切り出して使い回しており、知らない id では何もしない。この点は `RunningSessionsProvider.tsx:167-172` で確かめた。ターンの区切り・所要時間の時計・区間の分け方は data-model §2 / §4 と照らして、食い違いは見つからなかった。PO の観点で残ったのは、SC が「確かめた」と言っているのに計測経路が無い箇所と、実機での確認が済んでいない前提の 2 点。

## Findings

### [High] SC-003 は US-2 AC3 (実行中に行が増えても地図のスクロールとフォーカスを奪わない) を満たすと言うが、計測経路が無い (H-001) (scope: feature)

- **観察**: SC-003 (`spec.md:220`) は「US-2 の AC1〜AC6 のとおりになり … 計測経路: 地図のタブの component テスト」と書いている。tasks FE-022 のテスト項目 (`tasks.md:57`) にも「実行中に行が増えても地図のスクロールとフォーカスが動かない」がある。ところが `ConversationMapTab.test.tsx:121-283` の 10 件のうち、行を足しても `document.activeElement` やスクロール位置が変わらないことを確かめるものは無い。
  - 近いのは `:221` の間引きのテストだが、行の数しか見ていない。
  - `:250` は行が消える場合で、増える場合ではない。
  - 実装を読む限りでは奪わないように見える。`focusRequest` (`ConversationMapTab.tsx:254-265`) はキー操作のときだけ進み、更新のときに `scrollToIndex` を呼ばない。ただし、これは読んだ結果であって確かめた結果ではない。
- **同種事象探索**: `奪|scrollTop|AC3` を `features/shell/*ConversationMap*` で探して 1 件。実装のコメント `ConversationMapTab.tsx:31` だけで、テストは 0 件。`増えて|奪わ|append` を `features/shell/*.test.tsx` で探して、当たったのは無関係の `CommandPalette.test.tsx:353` だけ。中央側の SC-002 にも同じ形の穴がある。US-1 AC6 (時計が 2 つ) は `turns.test.ts:79` の単体にしかなく、`MessageTimeLabel.test.tsx` の 5 件に 2 つの時計の fixture は無い。code-gate の convention-reviewer H-001 (Medium) と同じ欠落を指している。ここでは SC が満たされたと言えるかという観点で挙げている。
- **リスク/影響**: US-2 の価値は「数千メッセージの会話で、実行中でも地図を見ながら目当てへ移れる」こと。行が届くたびにフォーカスやスクロールが飛ぶと、実行中の地図は使えなくなる。今のままでは SC-003 を PASS と書く根拠が無い。virtualizer の key や `rangeExtractor` を後で直したときの回帰も守られない。
- **推奨アクション**: `ConversationMapTab.test.tsx` に 1 件足す。中ほどの行にフォーカスを置き、`store.publish(conversation('s', n + 3))` を流して時計を 500ms 進め、`document.activeElement.dataset.turnId` と `scroller.scrollTop` が前と同じことを確かめる。SC-002 の AC6 は `MessageTimeLabel.test.tsx` に足す。`receivedAt` と `createdAt` を ±5 分ずらした fixture を `withReceivedAt` で組み、「所要 0:04」が出ることを確かめる。
- **根拠**: spec SC-002 / SC-003、US-2 AC3、tasks FE-012 / FE-022、reviewer-base「Critical / High は spec の要件に関わる指摘」
- **scope 根拠**: touched files のテストファイル 2 本に足すだけで直る

### [Medium] US-1 の過去ログの価値は、公開の型に無い `timestamp` に頼っており、実機での確認 (V-3) がまだ済んでいない (M-001) (scope: feature)

- **観察**: spec Assumptions (`spec.md:214`) は「quickstart で実機の 1 件ずつを確かめ、無ければ `null` / 受信時刻に倒れることを記録する」と書いている。しかし `quickstart-results.md:26-28` は V-3 を「未実施 (利用者に残す)」とし、確認を roadmap の O-9 の行に回している。過去ログに `timestamp` が無ければ、US-1 AC1 (過去ログの時刻)、US-2 の行の時刻と所要時間、US-3 の帯 (`activity-bins.ts:58` が空の状態を返す) がどれも中身を失う。それでも単体テストはすべて緑のまま。
- **リスク/影響**: どのテストも fixture でしか確かめておらず、SDK 0.3.270 の実機の transcript で値が埋まるかは未確認のまま完了する。もし無ければ、Journey 1 (過去の会話を読む) で時刻も帯も出ず、「今と同じ表示」に落ちる。誤りではないが、価値の大半が消える。
- **推奨アクション**: マージ前に実機の過去ログ 1 件で、時刻が出て帯が描かれることを確かめる。それができないなら、PR の説明に「V-3 未実施・実機で確かめるまで US-1 の過去ログの価値は未確定」と明記し、roadmap の行を正本にする (今の記録で足りる)。
- **根拠**: spec Assumptions、AD-051 Confirmation (SDK の版を上げる PR で確かめる)、PO-2
- **scope 根拠**: この feature の quickstart の結果

### [Low] 時刻を読めずに `null` に倒したことを観測する手段が無い (L-001) (scope: feature)

- **観察**: `parseMessageTime` (`transcript-time.ts`) は、無い値・壊れた値・範囲外の値をすべて黙って `null` にする。SDK がフィールドを落としても、利用者の目視でしか気づけない。
- **同種事象探索**: 本件は Low なので省略
- **リスク/影響**: 気づく経路は、SDK の版を上げたときの手順 (`docs/ui-coverage.md` に 1 行) だけになる。
- **推奨アクション**: 今は直さない (AD-050)。棚卸しで、O-8 の観測点 (例: 時刻を持たない記録の数) を足すかどうかを判断する。
- **根拠**: reviewer-base H の「障害時の観測点」
- **scope 根拠**: この feature の変換

### H (テスト / regression) の所見

- 既存の振る舞いを壊していないと言える根拠: 全テスト 3141 件が pass。O-3 の `ConversationSearch.test.tsx` には移動の経路のテストが 2 件足され (`:4079-4101`)、既存のものは書き換えずに通っている。IPC / preload / main の差分は 0 (`quickstart-results.md:17`)。
- E の H-001 は、この H の観点ではテストの欠落そのものでもある (上に記録済み)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `奪\|scrollTop\|AC3` in `features/shell/*ConversationMap*` | 1 (実装のコメントのみ。テストは 0) | src/renderer/src/features/shell/ConversationMapTab.tsx:31 |
| H-001 | `増えて\|奪わ\|append` in `features/shell/*.test.tsx` | 1 (無関係) | src/renderer/src/features/shell/CommandPalette.test.tsx:353 |
| H-001 | `message-time"\|turn-duration\|MessageTimeLabel` in renderer `*.test.*` | 1 ファイル (AC6 の fixture なし) | src/renderer/src/features/chat/MessageTimeLabel.test.tsx |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 1
