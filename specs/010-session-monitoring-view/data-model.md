# Data Model: セッション監視ビュー (O-1)

本 feature は**永続化を持たず、IPC の値も変えない** (spec FR-010)。以下はすべて renderer の中の値で、X-5 のストア (`running-session-types.ts`) に足すもの、または既存の値から導く純関数の結果である。行の状態 (`SessionRowStatus`。定義は `labels.ts`) と `SessionView` (`session-view.ts`) は X-5 の定義をそのまま使う。

## 1. ストアに足す値

| 値 | 型 | 置き場 | 更新の契機 |
|---|---|---|---|
| `statusSince` | `Readonly<Record<sessionId, { status: SessionRowStatus; at: number }>>` | `RunningSessionStoreState` | ストアの更新の後で `rowStatus(viewOf(state, id))` が前の値と変わったとき (research R-01)。**1 回のストア更新 (状態通知のバッチ 1 回を含む) の中の変化は `setState` 1 回にまとめる** (同じ更新の複数の遷移を 1 つの文で読むため)。起動の受付時もその時点の `rowStatus` を評価して入れる (handshake より先に状態通知が届いていても行と食い違わない) |
| `activity` | `Readonly<Record<sessionId, Activity \| null>>` | `RunningSessionStoreState` | **購読の手前で間引いて書く** (research R-03)。`deriveActivity` の入力 (メッセージ・`pending`・行の状態) が変わりうる更新の後、つまり `statusSince` を見直すのと同じ位置 (`patch` の後・状態通知の受信の後・利用者の送信の後) で「書き込み予定」を立て、セッションごとに 500ms の間隔で `deriveActivity` の結果を書く。最後の値は必ず書く (trailing)。値が前と等しければ書かない |
| `folderLabel` | `LiveSessionState` のフィールド (`string \| null`) | 各セッション | 起動の受付時に、その時点で引けた作業フォルダの表示名を写す。引けなければ `null` (読み上げと行は固定の代替語)。App の寿命の live region が IPC を増やさずに文を組むため (research R-05) |
| `receivedMessages` | `number` | `RunningSessionStoreState` | port の `message` を受けるたびに 1 足す (全セッションの累計。会話由来の値を持たない)。実機計測の観測点 (spec FR-012)。**O-2 の後は、tool の結果の送り直しと Hook / task の行の作成・更新も数える** (O-2 data-model §6。値を比べるときは基準の変化を並べて書く) |
| `density` | `'comfortable' \| 'compact'` | `RunningSessionStoreState` | 利用者の切り替えだけ。既定 `comfortable`。永続化しない (spec FR-009) |

- `statusSince` / `activity` は行を閉じたときに消し、そのセッションの間引きのタイマも止める
- **観測点の出し方** (spec FR-012): 一覧の各行の状態の要素に `data-row-status` (行の状態の 9 値。行の Root ではなく、状態の更新で再描画される要素に付ける — 実装時の変更)、一覧の中の視覚的に隠した小さな要素に `data-received-messages` (`receivedMessages`) を出す。件数を購読するのはその要素だけにする (一覧や行を本文の到着ごとに再描画させない)。ストアを `window` などに出す口は作らない
- 時刻は `now()` (ストアに注入済みの時計)、間引きのタイマもストアに注入する。テストでは fake を渡す
- 行は `activity[id]` (値 1 つ) と `statusSince[id]` だけを選ぶ。本文の配列もメッセージのオブジェクトも選ばない (spec SC-006)

## 2. 導出 (純関数。`session-view.ts`)

### `deriveActivity(messages, pending, view): Activity | null`

入力は**各セッションの live 表示のメッセージ配列** (X-5 の `LiveSessionState.messages`) と承認要求・`SessionView`。見るのは配列の**末尾 1 件**だけで、件数に依存しない。優先順は spec FR-006 のとおり。

| 条件 | 結果 |
|---|---|
| `pending !== null` | `{ kind: 'approval', tool: pending.toolName, detail: pending.input }` |
| 行の状態が応答中で、末尾が assistant で、その最後の part が `tool-call` | `{ kind: 'tool', tool: toolName, detail: argsText }` |
| 末尾が user (送信直後) | `{ kind: 'prompt', tool: null, detail: その text }` |
| 末尾が assistant で、`text` が文字列の text の part がある | `{ kind: 'reply', tool: null, detail: それらの part を順に見て最初に得た空でない行 }` |
| それ以外 (メッセージが無い・末尾の assistant が tool の呼び出しだけで応答中でない など) | `null` |

`tool` と `detail` はどちらも `toActivityLine` を通した値とする。`reply` では part を連結せず、part ごとに `toActivityLine` を通し、最初に空でない結果が出た時点で止める (`text` が文字列でない part は飛ばす)。`approval` / `tool` は `tool` が空でなければ `detail` が空でも残す。`prompt` / `reply` は `detail` が空なら `null` にする。

### `toActivityLine(raw: unknown, budget): string`

1. 文字列でなければ `''` を返す (例外を投げない。renderer の decoder は part のフィールドの型を検証しないため)
2. LF・CR・U+2028 / U+2029 を行の区切りとして先頭から順に行を取り出す (全体を分割しない)。**走査は先頭 4,096 コードユニットまで**とし (`reply` では part をまたいで合計で数える)、そこまでに空でない行が無ければ `''` を返す。本文は 1 part で最大 `BODY_MAX_BYTES`、part は複数ありうるため、処理量をこの上界に抑える
3. 各行の先頭 1,024 コードユニットについて、タブと連続する空白を空白 1 つに畳み、前後の空白を落としてから、domain の `sanitizeBody` に通して双方向制御文字・C0 / C1 制御文字を除く (agents 側と同じ集合を再利用する)。**最初に空でなくなった行**を採る
4. **80 コードポイント**を超えたら 80 で切り、末尾に `…` を付ける (サロゲートペアを割らない)

HTML・マークダウンとして解釈しない。描画は React のテキストノードだけで行う (`dangerouslySetInnerHTML` を使わない)。

表示では kind ごとの固定の前置き (承認を求めている / 実行 / 送信 / 応答。文言は `labels.ts`) を付け、会話由来の部分は状態の文言とは別の要素に置く。

### `formatElapsed(ms): { unit: 'sec' | 'min' | 'hourMin'; ... }`

| 範囲 | 表記 (訳出は `labels.ts`) |
|---|---|
| 60 秒未満 | `N秒` |
| 60 分未満 | `N分` |
| それ以上 | `N時間M分` |

負の値 (時計の巻き戻り) は 0 秒として扱う。

### `slotUsage(state): { used: number; limit: number }`

`used = countOccupying(order.map((id) => ({ claudeAlive: state.statuses[id]?.claudeAlive !== false }))) + (state.launch.phase === 'launching' ? 1 : 0)`、`limit = MAX_CONCURRENT_SESSIONS`。数え方は main の上限判定と同じ domain の関数 (`concurrency.ts` の `countOccupying`) を使い、renderer で再実装しない。`launch.phase === 'launching'` は main の予約 (`reserved`) に当たる。生存中の `error` と、強制終了を押したがまだ生存中のものも数える。**前提**: 起動要求は UI で直列化されている (`SessionScreen` は `launching` の間ダイアログを出さない) ので、起動要求中は高々 1 件である。並行起動を許すように変えるときは、ストア内部の起動要求の件数 (`inFlight`) を state に出して足す。

### `attentionCounts(state): { awaiting: number; failed: number }`

行の状態が `awaiting` の数と `failed` の数。一覧の見出しとナビが両方を使う。

### `nextAwaiting(state): string | null`

行の状態が `awaiting` の sessionId のうち、**表示中 (`selectedId`) を除き**、`statusSince[id].at` が最も早いもの。無ければ `null` (件数のボタンは押せない)。同じ時刻なら `order` の順で先のもの。

### `announcements(prevStatusSince, nextStatusSince, watchedId, folderLabel): string | null`

`watchedId` は「見ているセッション」(spec FR-004) で、セッション画面が表示されているときだけ `selectedId`、それ以外は `null`。`watchedId` 以外のセッションのうち、行の状態が `awaiting` または `failed` に**入った**ものを集め、0 件なら `null`、1 件以上なら作業フォルダの表示名 (`folderLabel(id)`。各セッションの `folderLabel`、`null` なら固定の代替語) を並べた 1 つの文を返す (例: 「A と B が承認待ちになりました」)。引数に会話由来の値を取らない。`statusSince` の変化は 1 回のストア更新につき 1 回にまとめられている (§1) ので、同じ更新の複数の遷移は 1 つの文になる。live region は、同じ文が続いても読み上げられるように、書き込みのたびに内容を入れ替える (空にしてから書く)。

## 3. 変えないもの

- `SessionStatusUpdate` (状態通知) のフィールド・IPC のチャネル・preload の capability
- `src/main` / `src/preload` / `src/agents` / `src/domain` のコード (domain の既存の関数を使うのはよい)
- `LiveSessionState` の本文 (`messages`) の保持の仕方
- `SessionRowStatus` の 9 値と `rowStatus` / `availableActions` の判定
