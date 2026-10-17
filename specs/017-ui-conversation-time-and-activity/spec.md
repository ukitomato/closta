---
spec_id: 017-ui-conversation-time-and-activity
feature_id: O-9
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: auto
status: completed
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 会話の時間と活動の可視化 (O-9)

**Feature Branch**: `017-ui-conversation-time-and-activity` (main の 1761c32。O-3〜O-6 のマージの後)

**Created**: 2026-10-16 (夜間の自走で起案。利用者は不在。人間の承認が要る判断は推奨案で仮採用し、下の「承認の記録」に挙げた。2026-10-17 に利用者がすべてそのまま承認した)

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap M3 の順 18 の O-9 の行 — conversation map・message timing・活動の heat graph と、`docs/ui-coverage.md` の F 節で O-3 から預かった Activity graph / Heat graph / Message timing / Trace waterfall の判断。message timing の前提として、メッセージの時刻 (`createdAt`。今は過去ログ・実行中とも `null`) を agents / domain の変換で埋める (session の契約の拡張。持ち主の確認は本 design で session charter と合わせて行う)。O-3 から預かった判断: transcript の本文を横断する検索の要否と、一覧の大規模件数向けの描画最適化 (仮想化) の要否 (012 spec Out of Scope / 012 plan の申し送り #26)。

## Summary

開いている会話について、「いつ言ったか・どれだけかかったか・どこで何が起きたか」を読めるようにする。

- **メッセージの時刻 (message timing)**: 中央の本体の利用者と assistant のメッセージに時刻を出し、終わったターンに所要時間を出す。そのために、過去ログと実行中の変換でメッセージの時刻 (`createdAt`) を埋める
- **会話の地図 (conversation map)**: 右のペインの新しいタブに、会話をターン (利用者の入力 1 つ) ごとの行で並べる。行は時刻・入力の先頭・所要時間・tool の数・エラーと境界の印を持ち、選ぶと中央の transcript がそのターンへ移る
- **活動の heat graph**: 地図のタブの上端に、会話の時間を区間に分けて活動の量を濃さで示す帯を出す。区間を選ぶと中央がその区間へ移る

完了の PR で `docs/ui-coverage.md` の F 節の O-9 の 4 行 (Activity graph / Heat graph / Message timing / Trace waterfall) を U-6 のとおりに書き換え、A 節の `SDKAssistantMessage` / `SDKUserMessage` の割当に時刻と地図を書き足す。transcript の本文を横断する検索と一覧の仮想化は足さない (U-7)。

## 本 feature の位置づけ

- **範囲は分けない。** 3 つの表示はどれも「開いている会話の時間」を読む面で、同じ時刻の値 (`createdAt`) と同じ移動の経路 (O-3 の会話内検索の移動) に乗る。FR は 16 で 20 を超えない。単体で確かめられる機能は 3 つあるが、時刻を埋める変換が 3 つの共通の前提で、message timing だけを先に出すと地図と heat graph の feature が同じ変換を読み直すことになるので、1 本にする
- **ui の feature が session の契約の値を広げる (U-1)。** `TranscriptMessageDTO` の形 (`createdAt: number | null`)・`TRANSCRIPT_MESSAGE_FIELDS`・`SessionEvent` の種類は変えず、`null` だった値を埋める。O-4 (U-1 / AD-047)・O-6 (U-6 / AD-049) と同じく O-9 (ui) が持ち、session charter に記録する
- **時刻は Claude Code の記録の値で、表示だけに使う (U-2 / U-3)。** SDK は時刻を「元のホストの時計。表示だけに使い、並べ替えに使わない」と定めている (`sdk.d.ts` の `SDKAssistantMessage.timestamp`)。メッセージの順は今どおり記録の順で、時刻で並べ替えない。セッションの正本は Claude Code 側にある (Principle X) ので、アプリは時刻を永続化しない
- **過去ログの時刻は公開の型に無いフィールドから読む (U-2)。** `getSessionMessages` の返り (`SessionMessage`) の型は時刻を持たないが、SDK 0.3.270 の実装は各記録の `timestamp` (ISO 8601) を返りに含めている (`sdk.mjs` の `SessionMessage` を組む関数)。型に無い値に頼るので、無い・読めないときは `null` に倒し (今の表示と同じ)、SDK の版を上げる PR で確かめる手順を足す。決定は新しい ADR (AD-051。accepted) に記録する
- **探す操作を広げない (U-7)。** O-3 から預かった「本文の横断検索」と「一覧の仮想化」は、どちらも今は足さない。理由と再検討の条件は U-7 と FR-016 (記録) に書く
- **置き場所は O-7 の語彙で書く (AD-046)。** 時刻と所要時間は「中央の本体」、地図と heat graph は「右のペインのタブ」(AD-046 Decision 4 の「タブは 1 か所の表に登録し、後続 feature が行を足す」。O-4 の「使用量」・O-5 の「構成」に続く 4 つ目)

### 承認の記録

夜間の自走 (2026-10-16) で推奨案を仮採用し、2026-10-17 に利用者がすべてそのまま承認した (AD-051 も同日に accepted)。

| # | 判断 | 承認が要る理由 | 承認 |
|---|---|---|---|
| U-1 | `createdAt` を埋める変換の変更 (session の契約の値の拡張) を O-9 (ui) が持ち、session charter に記録する | 持ち主の domain を人に諮る項目 (roadmap の O-9 の行) | 2026-10-17 利用者 |
| U-2 | 過去ログの時刻を `getSessionMessages` の返りの、公開の型に無い `timestamp` から読む。AD-051 に記録する | ADR の採否。SDK の公開の型の外に頼る | 2026-10-17 利用者 |
| U-3 | 実行中の時刻は SDK のメッセージの `timestamp` を使い、無ければ agents の受信時刻、利用者の入力は renderer の送信時刻にする。AD-051 に同居 | ADR の採否 | 2026-10-17 利用者 |
| U-4 | 活動の heat graph の対象を「開いている会話の時間の帯」にする (セッション横断の暦にしない) | コア価値と範囲 (Phase 8 の AskUserQuestion の条件) | 2026-10-17 利用者 |
| U-5 | 会話の地図と heat graph を右のペインの新しいタブ「会話の地図」に置く | 画面構成 (AD-046 のタブの表への追加。実装の差分が 1 日を超えて変わる) | 2026-10-17 利用者 |
| U-6 | F 節の 4 element の判断 (Message timing と Heat graph は照合して使う、Activity graph と Trace waterfall は使わない) | 範囲 (Tier B の採否) | 2026-10-17 利用者 |
| U-7 | transcript の本文の横断検索・過去の一覧の仮想化・会話内検索の対象の拡大をしない | O-3 から預かった範囲の判断 (列挙と取得の経路の負荷を伴う) | 2026-10-17 利用者 |
| U-8 | 実行中のターンの所要時間は、renderer の中だけで持つ受信時刻 (ホストの時計) で両端をそろえて計算する。表示の時刻は SDK の値のまま (design-gate H-001 の修正) | 所要時間の意味 (実行中と過去ログで基準の時計が変わる) と AD-051 の Decision の追加 | 2026-10-17 利用者 |

### 義務の扱い

roadmap が O-9 に預けた義務 (O-9 の行と、O-3 の記録で O-9 に当たるもの) の扱いの正本はこの表である。

| 義務 (roadmap の記録) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| 範囲: conversation map・message timing・活動の heat graph | 入れる | US-1〜US-3 / FR-006〜FR-013 |
| 範囲: F 節の Activity graph / Heat graph / Message timing / Trace waterfall の判断 | 入れる (U-6) | FR-014 |
| message timing の前提: `createdAt` を過去ログ・実行中の変換で埋める | 入れる (U-2 / U-3) | FR-001〜FR-005 |
| `createdAt` を埋める変換の変更の持ち主の確認 (session charter と合わせて) | 入れる。O-9 (ui) が持ち、session charter に記録する (U-1。2026-10-17 承認) | FR-016 |
| O-3 から: transcript の本文を横断する検索の要否 | 判断する: 足さない (U-7。2026-10-17 承認) | U-7 / FR-016 |
| O-3 から: 一覧の大規模件数向けの描画最適化 (仮想化) の要否 (012 plan の申し送り #26) | 判断する: 足さない (U-7。2026-10-17 承認) | U-7 / FR-016 |
| 012 spec FR-004 の [ASSUMED]「会話内検索の対象を広げるかは O-9 で再検討」(**roadmap の O-9 の行には無い**) | 判断する: 広げない (U-7。2026-10-17 承認) | U-7。roadmap の行に無い預かりなので、FR-016 で O-9 の行の結論に書き足す |
| O-8 の行の (c): 観測点 `receivedMessages` の基準の変化を並べて書く (O-4〜O-6 の前例) | 入れる (記録だけ) | 本 feature は `message` の行を足さず、`receivedMessages` の数え方を変えない。地図のタブを開いている間の再描画が増えることを O-8 の行に注記する (FR-016) |
| system-scope「直近の活動の不可視文字の残り」(持ち主 = 次に `sanitizeBody` か直近の活動を触る feature) | 当たらない | 本 feature は `sanitizeBody` と直近の活動の導出を変えない。地図の入力の先頭は、変換で無害化済みの本文を切り詰めるだけ |
| system-scope の composer の 2 項目・`runtime-store.ts` の検出 (持ち主 = O-10 / X-6 / 次に触る feature) | 当たらない | 本 feature は composer と `runtime-store.ts` を変えない。稼働中のストアは `appendUser` に時刻を足すだけ (FR-003) |

## 判断 (2026-10-16 の夜間の自走で仮採用。2026-10-17 に利用者がすべて承認)

| # | 判断 | 採用した案 (推奨) | 代わりの案 |
|---|---|---|---|
| U-1 | `createdAt` を埋める変換の変更の持ち主 | **承認済み (2026-10-17 利用者)**。O-9 (ui) が持つ。DTO の形とフィールドの集合は変えず、値を埋めるだけ。変換 (`src/domain/session/transcript.ts`・`live-message.ts`・`system-event.ts`、`src/agents/` のセッションスレッド) を O-9 が直し、session charter の Key concepts と Related Specs に記録する (O-4 U-1 / O-6 U-6 と同じ形) | session の feature に切り出し、O-9 はその後に表示だけを作る (時刻が無いと 3 つの表示のどれも確かめられず、O-9 が待つだけになる) |
| U-2 | 過去ログの時刻の出所 | **承認済み (2026-10-17 利用者)**。`getSessionMessages` の返りの各記録の `timestamp` (型に無い。SDK 0.3.270 の実装が返す) を読む。`SessionMessageLike` に任意のフィールドとして足し、未信頼として検査する (FR-004)。無い・読めないときは `null`。SDK の版を上げる PR で、過去ログの fixture と実機の 1 件で値が埋まることを確かめる (`docs/ui-coverage.md` の「SDK を上げたときの手順」に 1 行足す)。決定は AD-051 (accepted) に記録する | transcript の JSONL をアプリが自分で読む (AD-034 の取得経路と Principle IV の SDK 境界を外れる) / 過去ログは時刻を出さず実行中だけにする (過去の会話を読む Journey 1 で時刻が無い) |
| U-3 | 実行中の時刻の出所 | **承認済み (2026-10-17 利用者)**。SDK のメッセージに `timestamp` があればそれを使い、無ければセッションスレッドの受信時刻 (SDK の注記「Older emitters omit it; consumers should fall back to receive time」に従う)。利用者が送った入力は SDK から本文が返らない (`sdk-agent-session.ts` は user の本文を送らない) ので、renderer の稼働中のストアが送信の時刻を入れる。同じ id の送り直し (tool の結果を埋めた assistant) は最初の時刻を保つ。AD-051 に同居 | 受信時刻だけを使う (SDK の値を捨てる。WSL と Windows の時計の差は無くなるが、supervisor の遅れが時刻に乗る) / renderer がすべての受信時刻を入れる (過去ログと実行中で出所が変わる) |
| U-4 | 活動の heat graph の対象 | **承認済み (2026-10-17 利用者)**。開いている会話 1 つ。最初と最後のメッセージの時刻のあいだを等しい幅の区間に分け、区間ごとの活動 (利用者と assistant のメッセージと tool の呼び出しの数) を濃さで示す 1 本の帯。地図と同じタブに置く | 過去のセッションを横断した暦 (日 × 時刻の格子。Activity graph の形。要約行の `createdAt` / `lastModified` だけで作れるが、session の操作 UI (過去のセッションの区画) の上に ui が載せる新しい例外になり、会話の時間とは別の面になる) / 両方 |
| U-5 | 地図と heat graph の置き場所 | **承認済み (2026-10-17 利用者)**。右のペインの新しいタブ「会話の地図」[ASSUMED: タブの名前 (UI ラベル)]。中央に出しているセッション (稼働中・過去) の会話を描く。中央に何も出していないときはタブの空の状態 | 中央の本体の右端の細い帯 (スクロールバーの印。O-3 は仮想化で描かれていない範囲の高さを知らないので位置を決められないとして外した。012 research R-04) / 中央のヘッダの開閉する欄 (中央の幅を取る) |
| U-6 | F 節の 4 element | **承認済み (2026-10-17 利用者)**。**Message timing**: registry の element を照合し (Principle XIII)、時刻と所要時間の表示に合えば使う。合わなければ (element は assistant-ui の `MessageTiming` (ストリームの開始・最初のトークン・トークン数) を前提にし、本アプリはメッセージ単位の更新でその値を持たない) 文字の体裁で作り、照合の結果を PR の説明と備考に書く。**Heat graph**: 同じく照合して heat graph の帯に使う。**Activity graph**: 使わない (暦の形は複数日の活動を前提にし、1 つの会話の時間に合わない。U-4)。**Trace waterfall**: 使わない (tool の開始と終わりの時刻の組を運ばない・並列の tool と実行中の subagent の入れ子は O-11 が持つ・tool の経過時間は O-4 の印で出ている。再検討は O-11 の入れ子の後) | 4 つとも使う / 4 つとも使わず自作する |
| U-7 | 探す操作を広げるか | **承認済み (2026-10-17 利用者)**。広げない。(a) **本文の横断検索**: 足さない。全セッションの transcript を読むと取得の経路 (AD-034。1 要求 = 1 プロセス) をセッションの数だけ起こすことになり、列挙 (R-2) の負荷も増える。要約行の Thread search と開いた会話の会話内検索で探す。再検討の条件は「利用者が要約行で見つけられない会話を報告したとき」(b) **過去の一覧の仮想化**: 足さない。(a) を足さないので一覧の件数は今のままで、件数の多さは先に検索で絞る (012 plan #26 の結論を保つ)。再検討の条件は (a) を足すとき (c) **会話内検索の対象**: 今の `text` part のままにする (閉じた要素を開かずに強調できない理由が変わっていない。012 spec FR-004) | 本文の横断検索を足す (取得の経路の ADR が要り、FR が 20 を超える。足すなら別の feature) / 会話内検索の対象を tool の入力・結果に広げる |
| U-8 | 実行中のターンの所要時間の時計 | **承認済み (2026-10-17 利用者)**。1 つのターンの両端を同じ時計にそろえる。実行中は、稼働中のストアが受け取った時点 (ホストの時計) を renderer の写しの中だけで持ち (`metadata.custom.receivedAt`。DTO は変えない)、始まり (送信の時刻) と終わり (最後に受けた時点) をその値で引く。過去ログは記録の時刻どうしで引く。表示の時刻は U-3 のまま (SDK の値)。規則の正本は data-model §1 / §2 | 既知の限界として受け入れる (ランタイム (WSL ディストロ・docker endpoint のコンテナ) の時計がホストより進んでいれば、その差が所要時間にそのまま乗り、負にならないので隠れない) / 実行中の時刻をすべて受信時刻にする (U-3 の代わりの案。SDK の値を捨てる) |

## Clarifications

### Session 2026-10-16 (夜間の自走。利用者は不在)

- Q: 時刻の出し方 → A: 今日のメッセージは `HH:mm`、それより前は `M/D HH:mm` (24 時間制。ローカルの時刻)。ポインタを重ねるかフォーカスすると年月日と秒まで出す [ASSUMED: 表示の書式 (UI ラベル・既定の表示状態)]
- Q: 時刻をいつ出すか → A: 常に小さく出す。transcript の密度 (compact / comfortable) によらず出す [ASSUMED: 既定の表示状態]
- Q: 所要時間の書式 → A: 「所要 {m}:{ss}」、1 時間以上は「所要 {h}:{mm}:{ss}」[ASSUMED: UI ラベル]
- Q: 地図の行の入力の先頭の長さ → A: 1 行にして 60 コードポイントで切り、続きは `…` [ASSUMED: 数値の既定値]
- Q: heat graph の区間の数と濃さの段階 → A: 区間は最大 48、1 区間の幅は 1 分以上。濃さは 0 と 4 段階 (区間の活動の数を会話の中の最大で割って決める) [ASSUMED: 数値の既定値]
- Q: 実行中の地図と heat graph の更新の頻度 → A: 500ms に 1 回までにまとめる [ASSUMED: 数値の既定値]
- Q: 時刻として受ける値の範囲 → A: 2020-01-01 から「受けた時点 + 1 日」まで。外れたら `null` [ASSUMED: 数値の既定値。WSL とホストの時計の差を許し、壊れた値を捨てる]
- Q: 地図は中央のスクロールに合わせて今のターンを強調するか → A: しない。最後に地図から移ったターンだけを `aria-current` で示す [ASSUMED: 既定の表示状態]
- Q: heat graph の空の状態の文言 → A: 「時刻の記録が無いため、活動の帯を出せません」[ASSUMED: UI ラベル]

## User Scenarios & Testing

### User Story 1 - いつ言ったか・どれだけかかったかが分かる (Priority: P1)

利用者は中央の本体で、各メッセージの時刻と、終わったターンの所要時間を読む。過去の会話では「どの日のどの時間の作業か」を、実行中の会話では「この応答にどれだけかかったか」を知る。

**Why this priority**: 地図と heat graph の前提 (時刻が埋まっていないと何も描けない)。過去ログでは時刻が今まったく出ていない。

**Independent Test**: 過去ログの変換 (domain の純関数) と実行中の変換 (agents) の単体、時刻と所要時間の component テスト。

**Acceptance Scenarios**:

1. **Given** `timestamp` を持つ過去ログ、**When** transcript を開く、**Then** 利用者と assistant のメッセージに時刻が出る。Hook / task の行は最初の記録の時刻を持つ (表示はしない)。subagent の入れ子の中のメッセージも時刻を持つ
2. **Given** `timestamp` を持たない・読めない値の過去ログ (古い記録・SDK の版の違い)、**When** 開く、**Then** 時刻を出さず、今と同じ表示になる (例外を出さない)
3. **Given** 実行中のセッション、**When** 利用者が入力を送り、応答が届く、**Then** 入力には送信の時刻が、応答には SDK の時刻 (無ければ受信の時刻) が出る。tool の結果で同じ id のメッセージが送り直されても時刻は変わらない
4. **Given** 終わったターン (次の入力が来た・result が届いた・過去ログ)、**When** 見る、**Then** 利用者の入力の時刻からターンの最後のメッセージの時刻までの所要時間が出る。実行中のターンには出さない
5. **Given** 時刻が前後している (元のホストの時計の戻り)、**When** 見る、**Then** メッセージの順は記録の順のままで、所要時間が負になるターンには所要時間を出さない
6. **Given** 実行中のセッションで、ランタイム (WSL ディストロ・docker endpoint のコンテナ) の時計がホストの時計とずれている、**When** ターンが終わる、**Then** 所要時間はずれを含まない (両端をホストの受信・送信の時刻で引く。U-8)。応答に出す時刻は SDK の値のまま

---

### User Story 2 - 会話の地図で目当てのターンへ移れる (Priority: P1)

利用者は右のペインの「会話の地図」で、会話をターンの一覧として見渡し、目当てのターンを選んで中央をそこへ移す。

**Why this priority**: 数千メッセージの会話では、スクロールと会話内検索だけでは「どのあたりでどの作業をしたか」が分からない。

**Independent Test**: 地図のタブの component テスト (過去ログと実行中の fixture)。

**Acceptance Scenarios**:

1. **Given** 中央に過去の会話か実行中の会話を出している、**When** 「会話の地図」のタブを開く、**Then** ターンごとに 1 行が出て、行は時刻・入力の先頭・所要時間・tool の呼び出しの数・エラーの数を持つ。圧縮・会話の作り直し・モデルの拒否 (O-6 の境界の行) があったターンには印が出る
2. **Given** 地図の行、**When** 選ぶ (クリック・Enter)、**Then** 中央の transcript がそのターンの利用者の入力へ移り、仮想化で描かれていない範囲や実行中の窓の外でも描かれて画面に入る。フォーカスは地図に残る
3. **Given** 実行中の会話、**When** 新しいターンやメッセージが届く、**Then** 地図の行が増え・更新されるが、地図のスクロールとフォーカスは奪われない
4. **Given** 中央に何も出していない・会話が空、**When** タブを開く、**Then** 空の状態が出る
5. **Given** 1,000 ターンの会話、**When** 地図を開く、**Then** 同時に描く行の数は会話の長さに依存しない
6. **Given** 中央のセッションを切り替える、**When** 地図を見る、**Then** 新しいセッションの会話に替わる

---

### User Story 3 - 会話のどの時間に活動が集まったかが分かる (Priority: P2)

利用者は地図のタブの上端の heat graph で、会話の時間のどこに活動が集まり、どこが空いたかを見て、その時間へ移る。

**Why this priority**: US-1 / US-2 が無くても成り立たないが、長い会話や放置の後に再開した会話で「どこで止まっていたか」が一目で分かる。

**Independent Test**: 区間の分け方 (純関数) の単体と、帯の component テスト。

**Acceptance Scenarios**:

1. **Given** 時刻を持つ会話、**When** タブを開く、**Then** 最初と最後のメッセージの時刻のあいだを区間に分けた帯が出て、区間ごとの活動の量が濃さで示される
2. **Given** 帯の区間、**When** 選ぶ、**Then** 中央がその区間の最初のメッセージへ移る。活動の無い区間は選べない
3. **Given** 支援技術の利用者、**When** 帯に入る、**Then** 区間を矢印キーで移れ、各区間が時刻の範囲と活動の数を名前に持つ (色だけに頼らない)
4. **Given** 時刻を持つメッセージが 2 つ未満、**When** タブを開く、**Then** 帯の代わりに空の状態の文言が出て、地図の行は出る

---

### Edge Cases

- `timestamp` が ISO 8601 でない・範囲の外 → `null` (Clarifications の範囲)。同じ会話の中で時刻があるメッセージと無いメッセージが混ざる → 時刻は持つものだけに出し、heat graph は時刻を持つものだけで組む
- ランタイム (WSL ディストロ・docker endpoint のコンテナ) の時計と Windows の時計がずれている → 時刻は記録の値をそのまま出す (補正しない)。実行中は受信時刻にした値と SDK の値が混ざって表示の時刻が前後しうるが、所要時間は 1 つの時計どうしで引くのでずれを含まない (US-1 AC6 / U-8)。同じターンを後で過去ログとして開くと、記録の時刻どうしで引くので、実行中の値と受信の遅れの分だけ違いうる
- 1 つの API のターンが同じ `message.id` の assistant を複数送る (SDK の注記) → それぞれの `uuid` のメッセージが自分の時刻を持つ。ターンの最後のメッセージは記録の順で最後のもの
- 利用者の入力が積まれて (message queue) 送られた → 送信の時刻は実際に SDK に渡した時刻 (積んだ時刻ではない)
- モデルの拒否で取り消された応答 (O-6) → ストアから外れたメッセージは地図と heat graph にも数えない
- 圧縮の後の会話 → 地図は記録に残るすべてのターンを出し、圧縮の境界の印を付ける (コンテキストに残っているかは断定しない。O-6 の境界の文言と同じ)
- 入力の先頭が空 (画像だけ・添付だけ) → 「(本文なし)」[ASSUMED: UI ラベル]
- 地図から移った先のメッセージが、実行中に取り消された・ストアの上限で外れた → 移らず、地図の行も次の更新で消える
- 右のペインが畳まれている → 地図は描かない (タブを開いたときに組む)

## Requirements

### Functional Requirements

#### メッセージの時刻 (US-1)

- **FR-001**: 過去ログの変換 (`toTranscriptMessages`) は、各記録の時刻を `createdAt` に入れなければならない (U-2)。合成した Hook / task の行は最初の記録の時刻、subagent の入れ子の中のメッセージも同じ規則。読むフィールドと検査の正本は data-model
- **FR-002**: 実行中の変換 (agents のセッションスレッド) は、assistant のメッセージ・tool の結果だけのメッセージ・システムイベントの行 (O-2 の Hook / task と O-4〜O-6 の行) に時刻を入れなければならない (U-3)。同じ id の送り直しは最初の時刻を保つ
- **FR-003**: 稼働中のストアは、利用者の入力のメッセージに SDK へ渡した時刻を入れなければならない (U-3)
- **FR-004**: 時刻は未信頼として検査し、ISO 8601 を epoch ms に直して、範囲 (Clarifications) の外・読めない値は `null` にしなければならない。メッセージを時刻で並べ替えてはならない (記録の順のまま)
- **FR-005**: `TranscriptMessageDTO` の形・`TRANSCRIPT_MESSAGE_FIELDS`・`TRANSCRIPT_PART_FIELDS`・`SessionEvent` の種類・`METER_UPDATE_TYPES`・IPC・preload を変えてはならない。SDK から新しく読むのは時刻のフィールドだけで、Agent SDK の呼び出しの許可リストと query の options のキーは変えない
- **FR-006**: 中央の本体の利用者と assistant のメッセージに時刻を出さなければならない。`createdAt` が `null` のメッセージには出さない。書式は Clarifications
- **FR-007**: 終わったターンに所要時間を出さなければならない。1 つのターンの両端は同じ時計の値で引き、時計を混ぜてはならない (U-8)。ターンの区切り・終わりの判定・時計の選び方・負のときの扱いの正本は data-model

#### 会話の地図 (US-2)

- **FR-008**: 右のペインのタブの表 (AD-046 Decision 4) に「会話の地図」のタブを足さなければならない (U-5)。対象は中央に出しているセッションの会話 (稼働中・過去)。タブの追加は O-4 のタブのキーボード操作 (WAI-ARIA の Tabs pattern) とテストの共通の setup (`test-support/`) に乗せる
- **FR-009**: 地図はターンごとに 1 行を出し、行は時刻・入力の先頭・所要時間・tool の呼び出しの数・エラーの数・境界の印 (O-6 の圧縮・会話の作り直し・モデルの拒否) を持たなければならない。行の中身の導出は renderer の純関数で行い、その正本は data-model
- **FR-010**: 地図の行を選ぶと、中央の transcript をそのターンの利用者の入力へ移さなければならない。移動は O-3 の会話内検索と同じ経路 (過去ログの仮想化の `scrollToIndex` と、実行中の窓を広げる `RunningSessionsView.revealMessage`) を使い、新しい移動の仕組みを作らない。フォーカスは地図に残す
- **FR-011**: 地図は同時に描く行の数を会話の長さに依存させてはならない (ui charter の「長大スレッドは仮想化する」)。実行中の更新は間引き (Clarifications)、地図のスクロールとフォーカスを奪ってはならない

#### 活動の heat graph (US-3)

- **FR-012**: 地図のタブの上端に、開いている会話の活動の帯を出さなければならない (U-4)。区間の分け方・活動の数え方・濃さの段階の正本は data-model (数値の既定は Clarifications)。時刻を持つメッセージが 2 つ未満なら空の状態にする
- **FR-013**: 帯の区間は、選ぶと中央をその区間の最初のメッセージへ移し (FR-010 の経路)、矢印キーで移れ、時刻の範囲と活動の数を支援技術の名前に持たなければならない。色は既存のテーマのトークンだけを使う (Principle XIII。独自のカラートークンを足さない)

#### 対応表・ADR と記録

- **FR-014**: 完了の PR で `docs/ui-coverage.md` を直さなければならない: F 節の Message timing / Heat graph を使い道 (対応表の行) に、Activity graph / Trace waterfall を `未使用` と U-6 の理由に書き換え (備考の O-9 の割当が 0 になる)、A 節の `SDKAssistantMessage` / `SDKUserMessage` の割当に時刻と地図の置き場所を書き足す (ui charter の「シェルの部品が SDK の emit を表示するときはその行に書く」)。「SDK を上げたときの手順」に過去ログの時刻の確認を 1 行足す (U-2)
- **FR-015**: 時刻の出所の決定を AD-051 (2026-10-17 に accepted) に記録しなければならない (U-2 / U-3 / U-8): 過去ログは公開の型に無い `timestamp` を読むこと・実行中の出所と受信時刻への倒し方・表示だけに使い並べ替えないこと・永続化しないこと・無いときは `null`・SDK の版を上げる PR で確かめること・所要時間は 1 つの時計どうしで引くこと
- **FR-016**: 導入した用語と判断を記録に反映しなければならない (Principle XIV): glossary (メッセージの時刻・ターンの所要時間・会話の地図・活動の帯。Thread search の Counterexamples の「本文の横断検索は O-9 で要否を判断する」を U-7 の結論に)、ui charter (Related Specs と、本文の横断検索をしない結論)、session charter (U-1 の契約の値の拡張と AD-051)、`_overview.md`、`docs/prompts.md`、roadmap (O-9 の行の結論。012 spec FR-004 の預かりの結論を含む。O-8 の行の (c) の注記)

### Key Entities

- **メッセージの時刻 (`createdAt`)**: epoch ms か `null`。Claude Code の記録の値 (無ければ受信・送信の時刻)。表示だけに使う。正本は data-model と AD-051
- **ターン**: 利用者の入力 1 つと、次の入力までのメッセージ。所要時間は入力の時刻から最後のメッセージの時刻まで。正本は data-model
- **会話の地図の行**: ターンごとの時刻・入力の先頭・所要時間・tool の数・エラーの数・境界の印。renderer の表示状態で、永続化しない
- **活動の区間**: 会話の時間を等しい幅に分けた区間と、その中の活動の数。renderer の表示状態

### Assumptions / Clarifications

- **[承認済み U-1〜U-8]** 上の「判断」の表 (2026-10-16 の夜間の仮採用。U-8 は design-gate H-001 の修正で足した。2026-10-17 に利用者が承認)
- **[ASSUMED]** Clarifications の 9 項目と Edge Cases の「(本文なし)」(どれもポジティブリストの UI ラベル・既定の表示状態・数値の既定値)、U-5 のタブの名前
- 過去ログの `timestamp` が実機の transcript に残っているか、実行中の SDK のメッセージが `timestamp` を持つかは未確認 (SDK 0.3.270 の型と実装から読んだ)。quickstart で実機の 1 件ずつを確かめ、無ければ `null` / 受信時刻に倒れることを記録する

## Success Criteria

- **SC-001**: **時刻が埋まる。** 過去ログの fixture (`timestamp` あり・無し・壊れ・範囲外・Hook / task の合成・入れ子) と実行中の各経路 (assistant・送り直し・tool の結果だけ・システムイベントの行・利用者の入力) で、`createdAt` が data-model の規則どおりになり、送り直しで変わらない。計測経路: domain の変換の単体 + agents の単体 + 稼働中のストアの単体
- **SC-002**: **時刻と所要時間が出る。** US-1 の AC1〜AC6 のとおりになる。AC6 は、表示の時刻 (SDK の値) と受信時刻に別の値を与えた 2 つの時計の fixture で確かめる。計測経路: `deriveTurns` の単体 + 中央の本体の component テスト (偽の時計)
- **SC-003**: **地図で移れる。** US-2 の AC1〜AC6 のとおりになり、1,000 ターンの fixture で同時に描く行の数が 100 ターンのときと同じ上限に収まり、vitest-axe (O-7 で導入) の違反が 0。計測経路: 地図のタブの component テスト
- **SC-004**: **活動の帯が読める。** US-3 の AC1〜AC4 のとおりになり、区間の分け方の純関数が data-model の表の各行を満たし、vitest-axe の違反が 0。計測経路: 純関数の単体 + 帯の component テスト
- **SC-005**: **境界を広げない。** FR-005 に挙げたものの差分が 0 (`TRANSCRIPT_MESSAGE_FIELDS` / `TRANSCRIPT_PART_FIELDS` / `METER_UPDATE_TYPES` の固定テストが通り、IPC・preload・main の `git diff` が 0)。計測経路: 固定テスト + `git diff` (quickstart)
- **SC-006**: **対応表と記録が追随する。** 項目 21 が通り、F 節の備考で割当先が O-9 の行が 0。AD-051 が accepted で存在する。計測経路: `node scripts/constitution/check.mjs` + quickstart の確認

## Dependencies

- **O-3** ([012](../012-ui-thread-search/spec.md)。PR #14 で完了): 会話内検索の移動の経路 (`scrollToIndex` と `RunningSessionsView.revealMessage`。012 data-model §2)、AD-045 (UI の文言を i18n リソース化しない。本 feature の文言は `labels.ts` に置く)、012 plan #26 の結論 (一覧の仮想化を足さない)
- **O-7** ([013](../013-ui-app-shell/spec.md)。PR #13 で完了): 右のペインのタブの表と置き場所の語彙、「見ているセッション」、vitest-axe (AD-046)
- **O-4** ([014](../014-ui-metering-and-limits/spec.md)。PR #15 で完了): タブのキーボード操作とテストの共通の setup、実行中の行を agents で組む形 (`live-signals.ts`)
- **O-6** ([016](../016-ui-boundaries-and-tool-displays/spec.md)。PR #19 で完了): 境界の行 (圧縮・会話の作り直し・モデルの拒否) と取り消し (`retraction`。外したメッセージは数えない)
- **O-2** ([011](../011-ui-coverage/spec.md)): システムイベントの行の経路と合成、tool の結果の送り直し (同じ id で送る)
- **R-3 / R-4** (003 / 004): transcript の仮想化とアンカリング、過去ログの変換と subagent の入れ子

## Out of Scope

- transcript の本文を横断する検索、過去のセッションの一覧の仮想化、会話内検索の対象の拡大 (U-7)
- 過去のセッションを横断した活動の暦 (Activity graph の形。U-4 の代わりの案)
- tool の開始と終わりの時刻の組と Trace waterfall (U-6。tool の経過時間は O-4 の印のまま)
- 時刻の永続化・時計のずれの補正・時刻での並べ替え
- 地図からの操作 (ターンの分岐・再開・書き出し。分岐と再開は X-6)
