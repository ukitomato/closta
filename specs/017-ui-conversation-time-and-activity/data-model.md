# Data Model: 会話の時間と活動の可視化 (O-9)

**Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

本書は spec が「正本は data-model」と言う規則の正本である。SDK の型の行は `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts`、assistant-ui は `@assistant-ui/react` 0.15.19 (core を含む) で読んだ。

| 参照 | 場所 |
|---|---|
| `SDKAssistantMessage.timestamp?: string` | `sdk.d.ts:3386-3388` |
| `SDKUserMessage.timestamp?` / `SDKUserMessageReplay.timestamp?` (読まない) | `sdk.d.ts:5745-5747` / `:5821-5823` |
| `SessionMessage` (時刻のフィールドが無い) | `sdk.d.ts:5903-5916` |
| `SessionMessage` を組む関数 (`timestamp` を返りに入れる) | `sdk.mjs:134` |
| `createdAt ?? new Date()` | `@assistant-ui/core` `thread-message-like.ts:115` |

## §1 メッセージの時刻 (`createdAt`)

### 値の形

- DTO の `createdAt: number | null` (epoch ms) のまま。`TranscriptMessageDTO` の形と `TRANSCRIPT_MESSAGE_FIELDS` は変えない (FR-005)
- 表示だけに使う。メッセージの順は記録の順で、時刻で並べ替えない (FR-004)。永続化しない (Principle X)

### 検査 (`parseMessageTime(raw, now)`。`src/domain/session/transcript-time.ts`)

上から順に当て、最初に当たった行の結果を返す。

| # | 入力 | 結果 |
|---|---|---|
| 1 | 文字列でない (`undefined`・`null`・数・object) | `null` |
| 2 | 長さが 40 文字を超える | `null` |
| 3 | `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z\|[+-]\d{2}:\d{2})$` に合わない (タイムゾーンの無い形・日付だけ・前後の空白を含む) | `null` |
| 4 | `Date.parse` が `NaN` (存在しない日付 `2026-02-30T…` を含む) | `null` |
| 5 | `1577836800000` (2020-01-01T00:00:00Z) より前 | `null` |
| 6 | `now + 86_400_000` (受けた時点 + 1 日) より後 | `null` |
| 7 | それ以外 | `Date.parse` の値 (ms) |

- `now` は呼ぶ側が渡す (過去ログは取得の時点、実行中は受信の時点)。関数は時計を読まない
- #4 の存在しない日付は `NaN` だけでは捕まらない (V8 は `2026-02-30` を 3 月に繰り上げうる)。`Date.parse` の値に入力のオフセット (`Z` は 0) を足した時刻の UTC の年・月・日・時・分が、入力の値と一致しなければ `null` にする
- 固定テストの fixture: `2026-10-16T01:23:45.678Z`・`2026-10-16T10:23:45+09:00`・`2026-10-16T01:23Z`・`2026-10-16T01:23:45.123456789Z` (受ける)。`2026-10-16`・`2026-10-16T01:23:45`・` 2026-10-16T01:23:45Z`・`2019-12-31T23:59:59Z`・`now + 1 日 + 1 ms`・`1760000000000` (数)・41 文字の文字列 (捨てる)

### 経路ごとの出所

| 経路 | メッセージ | `createdAt` | 変更する場所 |
|---|---|---|---|
| 過去ログ | user / assistant の記録 (subagent の入れ子の中を含む) | `parseMessageTime(rec.timestamp, now)` | `transcript.ts:286`。`SessionMessageLike` に `timestamp?: unknown` |
| 過去ログ | Hook / task の行 (合成) | 最初の記録の `parseMessageTime(rec.timestamp, now)` (`mergeSystemEvent` は `...prev` で最初の値を保つ) | `transcript.ts:195`。`toSystemEventMessage(…, createdAt)` に渡す |
| 過去ログ | 圧縮の境界 (divider) と `system` の本文 | その記録の時刻 (`:286` と同じ) | — |
| 過去ログ | `toTranscriptMessages(records, { now })` | `now` は `read-transcript.ts:70-75` が `Date.now()` で渡す。省略時は `Date.now()` | `transcript.ts:161-163` |
| 実行中 | assistant | `parseMessageTime(msg.timestamp, receivedAt) ?? receivedAt` | `live-message.ts:76`。`LiveAssistantMessage` に `timestamp?: unknown`、`toLiveAssistantMessage(msg, receivedAt)` |
| 実行中 | tool の結果を埋めた送り直し | 追跡が持つ最後に送った DTO の値 (最初の時刻) | 変更なし (`live-tool-results.ts` の `lastMessages`) |
| 実行中 | tool の結果だけのメッセージ | `receivedAt` | `live-tool-results.ts:74-81`。`applyUserMessage(raw, receivedAt)` |
| 実行中 | O-2 の Hook / task の行 | `receivedAt` (合成は最初の値を保つ) | `sdk-agent-session.ts:678` の `toSystemEventMessage(message, null)` |
| 実行中 | O-4〜O-6 の行 (`rowEvent`) | `clock.now()` | `live-signals.ts:117` |
| 実行中 | 利用者の入力 | ストアの `now()` (SDK に渡す時点) | `running-session-store.ts:620-630` (`appendUser`) |

- `receivedAt` は `sdk-agent-session.ts` の `for await` で 1 件を受けた時点に 1 回だけ取る (`Date.now()`。signals の時計 `:407-411` と同じ時計)。同じ SDK のメッセージから作る DTO は同じ値を持つ
- 稼働中のストアの `upsertMessage` (`running-session-store.ts:120-129`) は、同じ id のメッセージを置き換えるとき、前のメッセージが時刻を持ち新しいメッセージが持たなければ前の値を残す (送り直しの保険。agents が保つので通常は当たらない)

### renderer の写し

- `toThreadMessage` (`convert.ts:155-174`) と `appendUser` は、`createdAt` が数のとき `createdAt: new Date(ms)` と `metadata.custom.createdAt: ms` の両方を入れる。`metadata.custom` の既存のキー (`systemEvent`) と同じ object に入れる
- 表示とターンの導出は `metadata.custom.createdAt` だけを読む (`readMessageTime(message): number | null`。`features/chat/message-time.ts`)。`Number.isFinite` でない値は `null`。assistant-ui の `createdAt` は読まない (既定値が「今」。research R-04)
- `fromSystemEventData` (`convert.ts:143`) は `readMessageTime` で読む

### renderer の受信時刻 (`receivedAt`。所要時間の時計。U-8)

表示の時刻 (`createdAt`) とは別に、稼働中のストアが renderer の中だけで持つ値。DTO・IPC には載せない (FR-005)。

- 稼働中のストアが port の `message` を取り込む時点 (`running-session-store.ts:403-411` の `applyMessage`) でストアの `now()` を 1 回取り、変換した `ThreadMessageLike` の `metadata.custom.receivedAt` に入れる。同じ id の差し替え (送り直し・行の合成) では新しい値で上書きする (最後に受けた時点)
- `appendUser` は `createdAt` と同じ `now()` の値を `metadata.custom.receivedAt` にも入れる
- 過去ログ (`useTranscript`) のメッセージは `receivedAt` を持たない
- 読むのは `readReceivedAt(message): number | null` (`features/chat/message-time.ts`。`Number.isFinite` でなければ `null`) だけで、使うのは §2 の所要時間だけ。表示の時刻・活動の帯 (§4) は `readMessageTime` のまま
- 理由: 実行中のターンの始まり (送信の時刻) はホストの時計、SDK の `timestamp` はランタイム (WSL ディストロ・docker endpoint のコンテナ) の時計で、引き算に両者の差が乗る。所要時間の両端を同じ時計 (ホスト) にそろえる (design-gate H-001)

## §2 ターンと所要時間 (`deriveTurns`。`features/chat/turns.ts`)

### 入力

- `messages: readonly ThreadMessageLike[]` — 記録の順。過去ログは `useTranscript().messages`、稼働中はストアの全件 (窓で切る前)
- `lastTurnOpen: boolean` — 稼働中で、runtime が `busy` (`RunningSessionsProvider.tsx:183-192` の判定を `isRunBusy(state, terminal)` に出して両方で使う)。過去ログは常に `false`

### ターンの区切り

- **ターンの始まり**: `role === 'user'` で、システムイベントの行でなく (`metadata.custom.systemEvent !== true`)、`content` に `tool-call` でない part (text・image・file) を 1 つ以上持つメッセージ
  - 過去ログの孤児の tool の結果 (user の記録に tool-call の part だけ) は始まりにしない。直前のターンに入る
- **ターンの中身**: 始まりのメッセージから、次の始まりの直前のメッセージまで
- **最初の始まりより前のメッセージ** (Hook の行など) はどのターンにも入れない。活動の帯 (§4) には数える
- 取り消された応答 (O-6) はストアから外れているので数えない

### ターンの値

| 値 | 規則 |
|---|---|
| `id` | 始まりのメッセージの `id` (地図の行の key と移り先) |
| `ordinal` | 1 から数えた番号 |
| `startedAt` | 始まりのメッセージの時刻 (`readMessageTime`。表示用)。無ければ `null` |
| `clock` | ターンの所要時間の時計。始まりのメッセージが `readReceivedAt` で値を持てば `'received'` (実行中)、持たなければ `'record'` (過去ログ) |
| `endedAt` | ターンの中で、始まりのメッセージを除き、記録の順で最後の「`clock` の時計の値を持つ」メッセージの値。`'received'` は `readReceivedAt`、`'record'` は `readMessageTime`。無ければ `null` |
| `durationMs` | `clock` の時計の始まりの値 (`'received'` は始まりの `readReceivedAt`、`'record'` は `startedAt`) を `begin` として、次のどれかなら `null`: `begin` か `endedAt` が `null`・最後のターンで `lastTurnOpen`・`endedAt - begin < 0`。それ以外は `endedAt - begin` (0 を含む)。1 つのターンの両端は必ず同じ時計の値で、時計を混ぜて引かない |
| `head` | §3 |
| `toolCount` | ターンの中のメッセージの最上位の `tool-call` の part の数 (孤児の結果を含む。subagent の入れ子の中は数えない) |
| `errorCount` | そのうち `isError === true` の数 |
| `marks` | ターンの中のメッセージが持つ system-event の data part (`name === SYSTEM_EVENT_DATA_NAME`) の category のうち `compact-boundary` / `conversation-reset` / `refusal` の集合 (表の順で重複なし)。過去ログの divider は `convert.ts` が `compact-boundary` の data part に写すので同じ規則で当たる |

- 1 つの API のターンが同じ `message.id` の assistant を複数送っても、それぞれが別のメッセージなので、最後のものが `endedAt` を決める (spec Edge case)
- 実行中で最後のターンが閉じる (runtime が `busy` でなくなる) と、`durationMs` が初めて値を持つ
- 同じターンでも、実行中 (`'received'`。ホストの受信の遅れを含む) と、後で過去ログとして開いたとき (`'record'`。ランタイムの記録の時刻) で値が少し違いうる。どちらもその中では 1 つの時計なので、時計のずれは乗らない (AD-051 Consequences)
- 固定テスト (時計が 2 つ): 始まりの `receivedAt` = 1,000、`createdAt` = 1,000。終わりの assistant の `createdAt` = 1,000 + 300,000 (ランタイムの時計が 5 分進んでいる)、`receivedAt` = 1,000 + 4,000 → `durationMs` = 4,000。逆向き (`createdAt` が 5 分遅れ) でも 4,000 で、`null` にならない

### 中央への所要時間の渡し方

- `ConversationTimeProvider` (`features/chat/ConversationTimeProvider.tsx`) が `deriveTurns` を `useMemo` で 1 回だけ走らせ、`Map<始まりの id, durationMs>` (値のあるものだけ) を context で配る
- 新しい Map が前の Map と同じ中身なら前の参照を返す (利用者のメッセージの再描画を、所要時間が変わったときだけにする)
- provider は `RunningCenter` / `PastCenter` の `ConversationSearchProvider` の内側に置き、同じ `turns` を中央の会話の公開口 (§6) にも publish する

## §3 会話の地図の行

| 列 | 中身 | 無いとき |
|---|---|---|
| 時刻 | `startedAt` を §5 の短い書式で | 出さない |
| 入力の先頭 | 始まりのメッセージの最初の text part を、改行とタブと連続する空白を 1 つの空白にして前後を削り、先頭 60 コードポイントで切る。切ったら末尾に `…` | text part が無い・空 → 「(本文なし)」 |
| 所要時間 | `durationMs` を §5 の書式で | 出さない (実行中のターン・時刻が無い・負。負は 1 つの時計の戻りで起きる) |
| tool の数 | `toolCount` | 0 なら出さない |
| エラーの数 | `errorCount` | 0 なら出さない |
| 境界の印 | `marks` を `SYSTEM_EVENT_CATEGORY_LABELS` (`labels.ts:18-33`。O-6 の語) で | 出さない |

- 入力の先頭は React の text として描く (HTML として解釈しない)。利用者の入力は中央の `UserMessage` も同じ文字列を text で出している
- 行は永続化しない。中央を切り替えると作り直す

## §4 活動の区間 (`activityBins`。`features/chat/activity-bins.ts`)

### 入力と数え方

- 対象: `role` が `user` か `assistant` で、システムイベントの行でなく (§2 と同じ判定)、時刻 (`readMessageTime`) を持つメッセージ。`role === 'assistant'` で data part だけのメッセージ (過去ログの divider) は対象にしない
- 重み: 1 + そのメッセージの最上位の `tool-call` の part の数
- 対象が 2 つ未満 → 区間を作らない (空の状態)

### 区間の分け方

- `min` / `max` = 対象の時刻の最小と最大 (記録の順の最初と最後ではない。research R-09)
- `span = max - min`
- `width = max(60_000, ceil(span / 48))`
- `count = max(1, ceil(span / width))`
- メッセージの区間の番号 = `min(count - 1, floor((t - min) / width))`
- 区間 `i` の範囲は `[min + i·width, min + (i+1)·width)`。最後の区間だけ `max` を含む
- 区間の活動 = 区間に入るメッセージの重みの和。`peak` = 区間の活動の最大
- 濃さ = 活動が 0 なら 0、それ以外は `ceil(4 · 活動 / peak)` (1〜4)
- 区間の移り先 = 区間に入るメッセージのうち、記録の順で最初のものの `id`。活動が 0 の区間は移り先を持たない

### 表 (純関数の単体の正本。SC-004)

| # | 入力 (時刻は min からの分、重み) | 期待 |
|---|---|---|
| 1 | 時刻を持つものが 0 / 1 つ | 区間なし (空の状態) |
| 2 | 0 分 (1)・0 分 (1) (同じ時刻) | `span` 0 → 区間 1 つ、活動 2、濃さ 4 |
| 3 | 0 分 (1)・30 分 (1) | `width` 60,000 → 区間 30、両端に活動 1 (濃さ 4)、中の 28 は 0 |
| 4 | 0 分・47 分・48 分 (各 1) | `width` 60,000、`count` 48。48 分は最後の区間 (番号 47) に入り、その区間の活動 2 |
| 5 | 0 分〜480 分 (8 時間) に 10 件 | `width` 600,000 (10 分)、`count` 48 |
| 6 | 0 分〜3 日 | `width` = `ceil(span / 48)`、`count` 48 |
| 7 | 時計の戻り: 記録の順で 10 分・0 分・20 分 | `min` 0・`max` 20。各メッセージは自分の時刻の区間に入る。移り先は区間の中で記録の順の最初 |
| 8 | 時刻の無いメッセージが混ざる | 時刻の無いものは数えない。時刻を持つものが 2 つ以上なら区間を作る |
| 9 | assistant 1 件に tool-call の part 3 つ | そのメッセージの重み 4 |
| 10 | 活動 1・2・8 の区間 (`peak` 8) | 濃さ 1・1・4 |
| 11 | システムイベントの行・divider だけが時刻を持つ | 対象 0 → 空の状態 |

## §5 書式と文言

文言は `features/chat/labels.ts` (中央の時刻・所要時間) と `features/shell/labels.ts` (タブの名前・地図・帯) に置く (AD-045 / Principle XV)。書式の関数は `features/chat/message-time.ts` に置き、中央と地図と帯が同じ関数を使う。

| 関数 / 文言 | 規則 | 出所 |
|---|---|---|
| `formatMessageTime(ms, now)` | `now` と同じローカルの日付なら `HH:mm`、違えば `M/D HH:mm` (月と日は 0 で埋めない)。24 時間制 | spec Clarifications |
| `formatMessageTimeFull(ms)` | `YYYY/MM/DD HH:mm:ss` (ローカル。`Intl.DateTimeFormat('ja-JP', …)` で 2 桁にそろえる) | spec Clarifications |
| `formatTurnDuration(ms)` | 秒 = `floor(ms / 1000)`。3,600 秒未満は `所要 {m}:{ss}`、以上は `所要 {h}:{mm}:{ss}` | spec Clarifications |
| 入力の先頭が空 | 「(本文なし)」 | spec Edge case [ASSUMED] |
| タブの名前 | 「会話の地図」 | spec U-5 [ASSUMED] |
| 帯の空の状態 | 「時刻の記録が無いため、活動の帯を出せません」 | spec Clarifications [ASSUMED] |
| 地図の空の状態 (中央に何も出していない) | 「中央に会話を開くと、ターンの一覧が出ます」 | 本書 [ASSUMED: UI ラベル] |
| 地図の空の状態 (会話にターンが無い) | 「まだターンがありません」 | 本書 [ASSUMED: UI ラベル] |
| 地図の一覧の名前 | 「ターンの一覧」 | 本書 [ASSUMED: UI ラベル] |
| 帯の名前 | 「活動の帯」 | 本書 [ASSUMED: UI ラベル] |
| 行の tool の数 / エラーの数 | 「tool {n}」/「エラー {n}」 | 本書 [ASSUMED: UI ラベル]。「エラー」は O-6 の結果の印の語 (`labels.ts:300`) |
| 帯の区間の名前 | 「{開始}〜{終わり}、活動 {n}」(`formatMessageTime`) | 本書 [ASSUMED: UI ラベル] |

- `now` は表示の時点で 1 回だけ取る (コンポーネントの描画ごとに時計を読まない。テストは偽の時計で固定する)。日付をまたいでも開いたままの画面は書き直さない (次の再描画で直る)
- 数は `COUNT_FORMAT` (`labels.ts:15`) で書く

## §6 置き場所・キー操作・支援技術

### 中央の時刻と所要時間 (US-1)

- `MessageTimeLabel` (`features/chat/MessageTimeLabel.tsx`。registry の照合の結果で `elements-message-timing` の写しに替わりうる。research R-10) を `thread.aui.tsx` の `UserMessage` (`:1284-1317`) と `AssistantMessage` (`:828-962`) に置く
  - 利用者のメッセージ: 吹き出しの下の右寄せに「{時刻} · {所要時間}」
  - assistant のメッセージ: 本文の下に時刻だけ。ActionBar の autohide の外に置き、常に出す
  - 密度 (compact / comfortable) によらず出す
- システムイベントの行 (`AssistantOrSystemEvent` が行に振り分けるもの) と過去ログの divider には出さない
- `<time dateTime={ISO}>` に短い書式を出し、`tabIndex={0}` で Tooltip (`components/ui/tooltip.tsx`) を hover と focus で開いて全体の書式を出す。支援技術の名前は全体の書式 (sr-only の文で持たせ、短い書式を二重に読ませない)
- 時刻が無ければ何も描かない (要素も作らない。今と同じ表示)

### 中央の会話の公開口 (`features/chat/center-conversation.ts`)

| 値 | 中身 |
|---|---|
| `conversationKey` | 稼働中は `sessionId`、過去は `selectedRowKey` |
| `messages` | `deriveTurns` に渡したのと同じ列 |
| `turns` | `deriveTurns` の結果 |
| `navigateTo(messageId)` | `ConversationSearchProvider` の `navigateTo` (research R-07) |

- `ShellLayout` で store を 1 つ作り context で配る。`ConversationTimeProvider` が effect で `publish`、unmount で `clear` (同じ `conversationKey` のときだけ消す。切り替えの順で新しい値を消さない)

### 地図のタブ (US-2)

- `PANEL_TABS` (`panel-tabs.ts:34-60`) の最後に `{ id: 'conversation-map', label: 「会話の地図」, icon: MapIcon, availableFor: ['none', 'running', 'past'], Content: ConversationMapTab }`。`PanelTabId` (`stores/ui.ts:30`) に `'conversation-map'`。`attention` は持たない
- タブの切り替えのキー操作と描画の有無は O-7 / O-4 の `RightPanel` のまま (畳んだら `Content` を描かない。spec Edge case)
- 一覧: `<ol aria-label="ターンの一覧">`。各行 `<li aria-setsize={全行数} aria-posinset={番号}>` の中に `<button>`。ボタンの名前は §3 の列を順に並べた文
- roving tabindex: 一覧に入るとフォーカスは最後にフォーカスのあった行 (無ければ `aria-current` の行、それも無ければ最初の行)
  - ↑ / ↓ で 1 行、PageUp / PageDown で見えている行数ぶん、Home / End で先頭と末尾
  - Enter / Space / クリックで `navigateTo(ターンの id)`。フォーカスは地図に残る
  - IME の変換中のキー (`isComposing` / 229) は無視する (Principle VIII)
- `aria-current="true"` は最後に地図から移った行だけ。中央のスクロールには合わせない (spec Clarifications)。中央を切り替えると消す
- フォーカスとスクロールの位置は行の `id` で覚え、行が増えても動かさない (US-2 AC3)。覚えた行が消えたら (取り消し) 同じ番号か直前の行に移す
- 仮想化: `@tanstack/react-virtual`。overscan は 8 行。`rangeExtractor` でフォーカスのある行を常に描く。SC-003 は 100 ターンと 1,000 ターンで描く `<li>` の数が同じ上限 (見えている行 + overscan × 2 + 1) に収まることを見る
- 間引き: 購読した値を前縁と後縁で 500ms に 1 回まで (research R-12)

### 活動の帯 (US-3)

- 地図のタブの上端、一覧の上。`role="toolbar"` `aria-label="活動の帯"` `aria-orientation="horizontal"` の中に区間ごとの `<button>`
- roving tabindex: ← / → で 1 区間、Home / End で両端。活動が 0 の区間もフォーカスは止まり、`aria-disabled="true"` で押しても移らない (US-3 AC2)
- 区間の名前は §5。濃さはテーマのトークンの不透明度 (`bg-primary/25`・`/50`・`/75`・`bg-primary`。活動 0 は `bg-muted`) と棒の高さの 4 段で示す。独自のカラートークンを足さない (FR-013 / Principle XIII)
- 押すと区間の移り先へ `navigateTo`
- 区間が無いときは帯の代わりに空の状態の文言 (§5) を出し、一覧は出す (US-3 AC4)

## §7 記録の書き換え (完了の PR)

### `docs/ui-coverage.md` (FR-014)

| 節 | 行 | 書き換え |
|---|---|---|
| A | `SDKAssistantMessage` (`:45`) | 割当に `/ MessageTimeLabel / ConversationMapTab (両方)` を足す。備考に「O-9: 時刻 (`timestamp`。無ければ受信時刻。過去ログは `getSessionMessages` の返りの `timestamp`。AD-051) を中央の本体に出し、右のペインのタブ『会話の地図』の行と活動の帯に使う」 |
| A | `SDKUserMessage` (`:46`) | 割当に `/ MessageTimeLabel / ConversationMapTab (両方)` を足す。備考に「O-9: 実行中の入力の時刻は SDK に渡した時刻 (renderer)、過去ログは記録の `timestamp`。ターン (入力 1 つ) を地図の行にし、所要時間を出す」 |
| F | `Message timing` (`:309`) | 使い道 `A SDKAssistantMessage / A SDKUserMessage`。備考に O-9 と照合の結果の写し (research R-10。正本は PR の説明) |
| F | `Heat graph` (`:287`) | 使い道 `A SDKAssistantMessage / A SDKUserMessage`。備考に O-9 (右のペインのタブの活動の帯) と照合の結果の写し |
| F | `Activity graph` (`:235`) | `未使用`。備考「O-9 で使わないと決めた (U-6)。暦の形は複数日の活動を前提にし、1 つの会話の時間に合わない」 |
| F | `Trace waterfall` (`:357`) | `未使用`。備考「O-9 で使わないと決めた (U-6)。tool の開始と終わりの時刻の組を運ばない。並列の tool と実行中の subagent の入れ子は O-11。再検討は O-11 の入れ子の後」 |
| F | `Conversation map` (新しい行。名前の順に挿入) | Tier B。使い道 `A SDKAssistantMessage / A SDKUserMessage`。備考に「O-9 で registry に増えた名前を足した (Principle XIII の Exceptions)」と照合の結果の写し |
| F | 冒頭 (`:231`) | 「2026-10-16 に `Conversation map` を足した (128)」を足す |
| 手順 | 「SDK を上げたときの手順」(`:31-37`) | 4 として「過去ログの fixture と実機の 1 件で、`getSessionMessages` の返りの `timestamp` から `createdAt` が埋まることを確かめる (型に無い値。AD-051)。消えていれば AD-051 の Confirmation に従う」 |

- 書き換えた後、F 節の備考で割当先が O-9 の行は 0 (SC-006)。項目 21 は A・C・E 節の行の集合を変えないので通る

### そのほか (FR-016)

| 文書 | 書き換え |
|---|---|
| `docs/glossary.md` | 足す語: メッセージの時刻・ターン・ターンの所要時間・会話の地図・活動の帯。Thread search の Counterexamples (`:1083`) の「本文の横断検索は O-9 で要否を判断する」を「本文の横断検索はしない (O-9 の U-7)」に。frontmatter の `total_terms` と `last_updated` |
| `docs/domains/ui/charter.md` | `related_specs` に 017、`related_adrs` に AD-051 を足す。`:65` の「本文の横断検索の要否は O-9」を結論 (しない) に。Related Specs に O-9 の行。`:251` の残りから O-9 を外す |
| `docs/domains/session/charter.md` | Key concepts (`:121-160`) に「メッセージの時刻の値を埋めた (O-9 / AD-051。DTO の形は同じ)」、Related ADRs (`:226-238`) に AD-051、Related Specs (`:240-305`) に O-9 の行 (O-4 / O-6 の前例の「ui の feature が本 domain の契約の値を広げた」) |
| `docs/domains/_overview.md` | `:68` の O-9 の行の範囲を結論に |
| `docs/prompts.md` | `:291-296` の O-9 のプロンプトに完了の注記。`:317-318` の targets の注に O-9 は `both` で決めたと書く |
| `docs/roadmap.md` | `:382` の O-9 の行に結論 (U-1〜U-8・012 spec FR-004 の預かりの結論)。`:381` の O-8 の行の (c) に「O-9 は `message` の数え方を変えない。地図のタブを開いている間は右のペインの再描画が 500ms に 1 回まで増える」 |
