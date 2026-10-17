# ux-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17
**Reviewer**: ux-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Round**: 1 (pr-gate, system scope)

## 初回読了 viewpoint

- FR/SC: FR-006 / FR-007 (時刻と所要時間)、FR-008〜FR-011 (地図)、FR-012 / FR-013 (活動の帯)、SC-002 / SC-003 / SC-004。FR-001〜FR-005 (変換) は UX 観点の対象外
- touched files に該当する charter / Confirmation: docs/domains/ui/charter.md (長大スレッドは仮想化、シェルの部品の表示は対応表に書く)、AD-045 (UI の文言は i18n リソース化せず labels.ts に置く)、AD-046 (右のペインのタブの表)、AD-051 (時刻は表示だけに使う)。AD-050 に従い、Medium と Low は gate では直されない
- A. 認可 / 認証 / secret 管理: 該当なし: ux-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: ux-reviewer の担当外
- C. 業務不変条件 / Charter drift: 該当なし: ux-reviewer の担当外
- D. Constitution / ADR drift: 該当なし: ux-reviewer の担当外
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。UX の完成度は G に記録
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当。UX-9 の重複 helper は G の L-005 に記録
- G. optional reviewer 範囲 (ux-reviewer): Critical:0 High:1 Medium:4 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

diff の UI 部分のうち ConversationMapTab.tsx (地図の行と活動の帯)、MessageTimeLabel.tsx (中央の時刻と所要時間)、labels.ts (shell と chat の 2 つ)、message-time.ts、turns.ts、activity-bins.ts、useThrottledConversation.ts、center-conversation.ts、ConversationTimeProvider.tsx、CenterPane.tsx、useTranscript.ts との連携を読んだ。コードは実行していない。地図と時刻には、空 (UX-1)・読み込み中 (UX-3)・失敗 (UX-2)・情報の見せ方 (UX-7)・一貫性 (UX-9) の観点で穴がある。1 件は、過去の会話の読み込み中と失敗のときに、地図が事実と違う理由を出す点で High とした。破壊的操作と form は本 PR に無いので UX-4 / UX-5 は該当なし。UX-6 は labels.ts への集約 (AD-045) に沿っており問題なし。Critical は無い。

## Findings

### [High] 過去の会話の読み込み中・失敗のとき、地図が「まだターンがありません」「時刻の記録が無いため、活動の帯を出せません」と事実と違う理由を出す (H-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/chat/useTranscript.ts:93-98` は、選択が変わるたびに `messages` を `[]`、status を `'loading'` にする。`:130-133` と `:160-165` は取得に失敗すると status を `'failed'` にするが、messages は `[]` のままである。
  - `src/renderer/src/features/shell/CenterPane.tsx:189-206` の `PastCenter` は、status に関係なく `ConversationTimeProvider` に `transcript.messages` を渡す。`ConversationTimeProvider.tsx:52-58` は `turns=[]` の値を無条件に publish する。
  - その結果 `ConversationMapTab.tsx:58` の `value` は null にならない。`:104-112` の帯は `bandEmpty` (「時刻の記録が無いため…」) を出し、`:315-321` の一覧は `emptyNoTurns` (「まだターンがありません」) を出す。
  - 中央は読み込み中表示か失敗の再試行を出している。右のペインの地図だけが、読み込み中と失敗の両方で「まだ…ありません」と言う。
  - 公開口 (`center-conversation.ts:16-23`) は status を運ばない。地図は「読み込み中」「読み込めなかった」「本当に空」を区別できない。
- **同種事象探索**: `emptyNoTurns|bandEmpty|emptyNoConversation` で 3 種、各 1 箇所の使用 (`ConversationMapTab.tsx:60,110,318`)。status を受ける分岐は 0 件。実行中の会話では、先頭の入力を送るまで同じ表示になるが、それは正しい空の状態なので対象外。
- **リスク/影響**:
  - 読み込みに失敗した過去の会話で、地図が「まだターンがありません」と断定する。「まだ」は後で増えると読める。読み取り専用の過去ログでは誤りで、再試行の導線は中央にしか無い。
  - 読み込み中は一瞬、誤った空の表示に見える。帯の文言は「時刻の記録が無い」と原因まで断定していて、実際には記録の有無とは無関係。
  - UX-2 の「失敗種別ごとの出し分け」と UX-3 の「待ち中の feedback」を満たさない。
- **推奨アクション**:
  - 公開値に `status: 'loading' | 'failed' | 'ready'` (稼働中は常に `'ready'`) を足す。または `PastCenter` で status が `'loading'` / `'failed'` のあいだ publish しない。後者なら地図は `emptyNoConversation` に落ちるので、文言は「読み込み中」と「読み込めませんでした。中央の再試行を使ってください」に分けたほうが正確。
  - `useTranscript` が status を公開している (`useTranscript.ts:177`) ので、追加の取得は要らない。
  - 帯の空の状態は `turns.length === 0` のときは出さず、一覧の空の状態に任せる (M-001 と合わせて直す)。
  - `ConversationMapTab.test.tsx` に loading / failed のケースを足す (L-006)。
- **根拠**: UX-1 / UX-2 / UX-3。US-2 AC4 (空の状態)。ui charter。
- **scope 根拠**: 本 PR で追加した ConversationMapTab.tsx / ConversationTimeProvider.tsx / CenterPane.tsx の publish 経路で、feature の touched files 内で直せる。

### [Medium] 帯の空の状態の文言が「時刻の記録が無い」と断定するが、実際は時刻つきのメッセージが 1 つしかない場合も含む (M-001) (scope: feature)

- **観察**: `activity-bins.ts:58` は、時刻を持つ対象が 2 つ未満のときに `[]` を返す。例は、実行中の会話で利用者の入力を 1 つ送っただけの直後。このとき入力は送信の時刻を持つ。`ConversationMapTab.tsx:104-112` は `bandEmpty` = 「時刻の記録が無いため、活動の帯を出せません」を出す (labels.ts:198)。この文言は Clarifications の [ASSUMED] をそのまま使っている。
- **同種事象探索**: `bandEmpty` で labels.ts:198、ConversationMapTab.tsx:110、test:343。
- **リスク/影響**: 時刻は記録されているのに、記録が無いと言う。実行中の会話の最初の数秒は必ずこの状態になり、時刻が壊れていると誤解させうる。
- **推奨アクション**: 「活動の帯は、時刻のあるメッセージが 2 つ以上になると出ます」のように、原因を断定せず条件を言う文言にする。
- **根拠**: UX-1 (なぜ空か + 次のアクション)。
- **scope 根拠**: 本 PR の labels.ts。

### [Medium] 活動の帯が、見える利用者に時間軸も区間の説明も出さない (M-002) (scope: feature)

- **観察**: `ConversationMapTab.tsx:152-179` の区間のボタンは `aria-label` だけで、`title` も Tooltip も、始点と終点の時刻の表示も無い。濃さを説明する凡例も無い。見える手がかりは棒の高さと色だけ。US-3 は「どこで止まっていたか一目で分かる」ことを狙う。
- **同種事象探索**: `title=` を `ConversationMapTab.tsx` で検索して 0 件。中央の時刻は `MessageTimeLabel.tsx:46-55` で Tooltip を持つので、同じ機能が帯には無い。
- **リスク/影響**: マウスの利用者は、空いた区間が何時のものか分からない。地図の行を目で突き合わせる必要がある。UX-7 の「情報の過不足」と UX-9 の「同じ操作が画面ごとに違う UI」にあたる。
- **推奨アクション**: 区間の `title` か Tooltip に `binName` と同じ文を出す。帯の両端に開始と終了の時刻を小さく出す。
- **根拠**: UX-7 / UX-9 (色だけに頼らない設計は棒の高さで満たしている)。
- **scope 根拠**: 本 PR の ConversationMapTab.tsx。

### [Medium] 地図の行の副行が折り返しも省略もせず、幅 320px のペインから溢れる可能性が高い (M-003) (scope: feature)

- **観察**: `ConversationMapTab.tsx:406-414` は、時刻・所要時間・tool の数・エラーの数・境界の印を `flex min-w-0 gap-2` で並べる。`truncate` も `flex-wrap` も `overflow-hidden` も無い。行の高さは `ROW_HEIGHT = 56` で固定 (`:38`)。ペインの幅は 320px (`shell-layout.ts:13`)。境界の印の文言は `SYSTEM_EVENT_CATEGORY_LABELS` の「コンテキストの圧縮の境界」(12 文字、約 144px) などで、これに時刻・所要時間・件数が加わると行の幅を超える。
- **リスク/影響**: 溢れた分が行からはみ出して、横スクロールが出るか、隣の行や端に被る。ただしレイアウトは実行して確かめていないので、観察ではなく推定。
- **推奨アクション**: 副行を `truncate` または `flex-wrap` にして行の高さを保つ。印は 1 文字のアイコンと `title` にする方法もある。実機か component テストで幅 320px の見え方を確かめる。
- **根拠**: UX-7。
- **scope 根拠**: 本 PR の ConversationMapTab.tsx。

### [Medium] 全メッセージの時刻が `tabIndex=0` で、長い会話ではタブ移動の停止点が大量に増える (M-004) (scope: feature)

- **観察**: `MessageTimeLabel.tsx:49` の `<time ... tabIndex={0}>` は、時刻を持つすべての利用者・assistant メッセージに付く。目的は focus での Tooltip 表示。`thread.aui.tsx:953,1311` で全メッセージに置かれる。
- **リスク/影響**: キーボード利用者は、数千メッセージの会話で Tab を押すたびに時刻へ止まる。全体の書式は sr-only で既に読み上げられるので、focus で出す意味は薄い。
- **推奨アクション**: Tooltip の focus 起動をやめて hover のみにし、`tabIndex` を外す。全体の書式は sr-only と `title` で足りる。
- **根拠**: UX-9。WCAG の観点の詳細は a11y-reviewer の担当。
- **scope 根拠**: 本 PR の MessageTimeLabel.tsx。

### [Low] L-001: 短い時刻の書式に年が無い

`message-time.ts:59-68` は、今日以外を `M/D HH:mm` で出す。去年以前の過去ログは年が見えない。中央は Tooltip で全体の書式を出すが、地図の行 (`ConversationMapTab.tsx:378`) は出さず、aria-label も短い書式のまま。年が違うときだけ年を足す案がある。

### [Low] L-002: `MessageTimeLabel` の `now` が mount 時に固定される

`MessageTimeLabel.tsx:37` は `useState(() => Date.now())` で `now` を 1 回取る。0 時をまたぐ長時間の会話で、「今日」の判定が古いままになる。表示だけの影響で小さい。

### [Low] L-003: 地図の現在の行と hover の行が同じ背景色

`ConversationMapTab.tsx:396` は、`hover:bg-accent` と `aria-[current=true]:bg-accent` で同じ色を使う。現在の行が hover と区別できず、色だけの印になっている。左端の線などで区別する案がある。

### [Low] L-004: 移動できないとき、フィードバックが無い

仕様 (Edge Cases) どおり、移り先が消えていたら何も起きず、行は次の更新で消える。利用者には「押したのに動かない」だけに見える。

### [Low] L-005: 日時の書式の helper が 2 系統で並存する

`formatMessageTime` (`message-time.ts:59`) と `formatQuotaResetTime` (`shell/labels.ts:306-316`) は、同じ今日と別日の判定で、同じ `HH:mm` / `M/d HH:mm` を作る。表記は一致しているが、実装が重複している。

### [Low] L-006: 読み込み中・失敗の地図の表示を検出するテストが無い

`ConversationMapTab.test.tsx` の it は、空の 2 状態 (`:122`)、帯の空 (`:331`)、axe (`:262,348`) などを網羅する。一方、`ConversationTimeProvider` と `PastCenter` を通した status = loading / failed の経路は、どの test も通さない (`useCenterConversation` / `ConversationTimeProvider` を参照する test は 3 件で、いずれもこの経路ではない)。H-001 は現状のテストで検出されない。直すときに同時に足す。

## 同種事象探索 cascade summary

Critical は 0 件のため cascade 申告の対象外。参考として、High の同種探索を記す。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `emptyNoTurns\|bandEmpty\|emptyNoConversation` | 3 | ConversationMapTab.tsx:60,110,318 |
| M-001 | `bandEmpty` | 3 | labels.ts:198、ConversationMapTab.tsx:110、ConversationMapTab.test.tsx:343 |
| M-002 | `title=` (ConversationMapTab.tsx) | 0 | (該当なし) |

## Verdict

- Critical: 0
- High: 1
- Medium: 4
- Low: 6
- Round inheritance: N/A (Round 1)
