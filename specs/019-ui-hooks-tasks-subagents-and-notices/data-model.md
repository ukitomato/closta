# Data Model: Hook・背景の task・実行中の subagent の表示 (O-11)

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-10-17

規則の正本はこのファイル。spec の FR は本ファイルの節を参照する。SDK の行番号は 0.3.270。ソースの行番号と集合の数は main 6fa08c2 (O-9 / O-10 のマージ後) で確かめた (2026-10-18)。

**前提**: 本ファイルの規則は spec の U-1〜U-11 と AD-054 / AD-055 / AD-056 の上にある。どれも 2026-10-17 に利用者が承認した (accepted)。

**変えないもの** (SC-004): `SessionEvent` の種類 (O-10 の後の 9)・`SessionControl` の種類・`TRANSCRIPT_PART_FIELDS`・`TRANSCRIPT_MESSAGE_FIELDS`・`PermissionRequest`・`toPermissionResult`・IPC・preload・main・`Query` の呼び出し (`interrupt` だけ)・`QUERY_ESCALATION_OPTION_KEYS`・`QUERY_MUTATION_METHODS`。

---

## §1 一般の Hook (US-1 / FR-001〜FR-003)

### 1.1 query の options

| キー | 値 | 型 | 出所 |
|---|---|---|---|
| `includeHookEvents` | `true` | `true` (リテラル) | `buildQueryOptions` だけが組む。起動の入力・IPC・プリセット・Provider の設定から渡さない (AD-054 Decision 1) |
| `forwardSubagentText` | `true` | `true` (リテラル) | 同上 (§3 で使う) |

`QUERY_OPTION_KEYS` (`src/agents/session-core.ts:63-74`) は 9 → 11 キー。O-10 が先にマージされ AD-053 の `onElicitation` を足しているので、その和集合 (AD-041 (g) の 8・`onElicitation`・本 feature の 2) にする (AD-054 Decision 4)。

### 1.2 行の作り方

O-2 の `toSystemEventMessage` (011 data-model §2) をそのまま通す。本 feature で変換は変えない。

| SDK のフィールド | 行への写し | 読むか |
|---|---|---|
| `hook_id` | 行の id `hook:<hook_id>` | 読む |
| `hook_name` | `name`。`HOOK_NAME_SHAPE` に合わない・`mayCarrySecret` が真なら `''` | 読む (O-2 の規則のまま) |
| `hook_event` | `detail` (1 行) | 読む |
| `outcome` | `status` (`success` → `succeeded` / `error` → `failed` / `cancelled` → `cancelled` / 他 → `unknown`) | 読む |
| `output` / `stdout` / `stderr` / `exit_code` | — | **読まない** (DOM・`SessionEvent`・ログに出さない。SC-001 の目印) |
| `hook_progress` の全体 | — | **送らない** (今どおり) |

### 1.3 伏せた名前の見分け (renderer)

- 対象: category `hook` で `name === ''` の行
- 見出し: 「Hook ({hook_event}) {n}」。`hook_event` が空なら「Hook {n}」
- `n` (1 から): 同じターンの中で、`name === ''` かつ同じ `hook_event` の行の出現順。ターン = 直前の role `user` のメッセージ (system-event の行でないもの) から次の role `user` のメッセージの前まで。最初の user のメッセージより前は 1 つのターンとして数える
- 計算: renderer の純関数 `maskedHookOrdinals(messages) → Map<messageId, number>`。thread の context で `SystemEventRow` に渡す (O-6 の `toolResultState` の `ctx` と同じ経路)。1 つしかなくても番号を付ける (見出しの形を固定する)
- 番号は表示の位置からの導出で、DTO・ストアに持たない

### 1.4 見た目と読み上げ

| 行 | 見た目 | 読み上げ (`rowAnnouncement`) |
|---|---|---|
| Hook (`hook_event` が `SessionStart` / `Setup`) | `failed` / `cancelled` は `attention`、他は今どおり | 今どおり (`ENDED_STATUSES` のすべて) |
| Hook (それ以外。一般の Hook) | `failed` / `cancelled` は `attention`、他は今の控えめの見た目 | **`failed` / `cancelled` のときだけ** |

読み上げの文言は O-6 の Hook の行の文言 (`labels.ts`) のまま。伏せた名前の行は §1.3 の見出しを使う。1 秒に 1 回のまとめ (O-6 data-model §4) は変えない。

---

## §2 背景の task (US-2 / FR-004〜FR-006)

### 2.1 前景の task の記憶 (domain)

`src/domain/session/foreground-tasks.ts` (新設。I/O なし)。

| 項目 | 規則 |
|---|---|
| 覚える条件 | `task_started` で `task_id` の形が正しく (`isValidTaskId`)、`is_backgrounded !== true`、`ambient !== true`、`skip_transcript !== true` |
| 覚える値 | `task_type` (1 行化した文字列)・`description` (1 行化。`local_bash` 以外の行の `name` に使う)・`tool_use_id` (形が正しければ。§2.3) |
| 上限 | 256 件 ([ASSUMED])。超えたら最も古いものを忘れる |
| 忘れる条件 | 背景に移って行を開いた・`task_notification` が届いた・上限 |
| 範囲 | 実行中は 1 つのセッションスレッドに 1 つ。過去ログは 1 回の変換に 1 つ |
| 根拠 | AD-044 Decision 6 (session は通す経路だけ) を AD-056 の「読み替える箇所」が読み替える。覚えた値は行を作るためだけに使い、`SessionEvent` にそのまま運ばない。永続化しない |

### 2.2 後から背景に移った task の行

| 入力 | 行 |
|---|---|
| `task_updated` で `patch.is_backgrounded === true`、記憶にある task | 行 `task:<task_id>` を開く (`opens: true`)。category **`backgrounded-task`** (新設)。`name` と `detail` は `task_started` から作る行と同じ規則 (`local_bash` は §2.3)。`status` は `patch.status` を `toStatus` に通した値、無ければ `running`。`createdAt` は `toSystemEventMessage(raw, createdAt)` と同じく呼び出し元が渡す値 (実行中は受信時刻、過去ログはその `task_updated` の記録の時刻。AD-051 Decision 1 / 2) |
| 同上、記憶に無い task | 行を作らない (spec Edge Cases。一覧には出る) |
| 以後の `task_updated` / `task_notification` / O-4 の `task_progress` | O-2 の合成 (`mergeSystemEvent`) で同じ行に入る。category は前の行のまま |

- `SYSTEM_EVENT_CATEGORIES` (`transcript-dto.ts:68-82`) は 12 → 13 (O-10 の `elicitation` の後に足す)。`mergedDetail` の task の進み具合の分岐は `task` と `backgrounded-task` の両方に当てる
- renderer: `backgrounded-task` の行は task の行と同じ表示に「背景に移した」を添える ([ASSUMED] の UI ラベル)。`SYSTEM_EVENT_ICONS`・`systemEventDetailText`・`rowAnnouncement` (task と同じ扱い) に足す
- 実行中と過去ログで同じ関数 (記憶を持つ薄い包み。引数は `toSystemEventMessage` と同じ `raw` と `createdAt` に、§2.3 の `argsText` を足した形) を使う。規則を 2 か所に書かない

### 2.3 シェルの task のコマンドの名前

| 段 | 規則 |
|---|---|
| 規則の置き場所 | `src/domain/session/command-name.ts` (新設) の `bashCommandName(command)`。中身は今の `session-view.ts:243-265` (`SAFE_NAME` / `SECRET_PREFIX` / `UNSAFE_COMMAND_CHARS` / `ASSIGNMENT` と `pathTail`) をそのまま移す。`pathTail` は `src/domain/session/path-tail.ts` (新設) に移し、renderer の `features/chat/path-tail.ts` は re-export にする |
| 引く元 | `task_started` の `tool_use_id` が指す `Bash` の tool-call の `argsText` を JSON として読み、`command` の文字列 |
| 実行中 | `live-tool-results.ts` が覚えている根のメッセージ (§3.1) の tool-call から引く。忘れていれば取れない |
| 過去ログ | `transcript.ts` の `toolCallById` から引く |
| 行の `name` | `local_bash` の行 (category `task` / `backgrounded-task`) だけ、取れた名前を入れる。取れなければ `''`。`description` は今どおり読まない |
| renderer | `local_bash` で `name === ''` の行・一覧の行は種類のラベル (`taskTypeLabel('local_bash')` =「シェルのコマンド」) だけ。spec US-2 AC2 の「シェル」はこのラベルを指す |

`session-view.ts` の `summarizeToolInput` は domain の `bashCommandName` を使う (出力は変わらない。今のテストを通す)。

### 2.4 `meter` の種類 `background-tasks`

```ts
type BackgroundTaskType = 'local_bash' | 'local_agent' | 'local_workflow' | 'mcp_task' | 'other'
interface BackgroundTaskEntry { readonly taskId: string; readonly taskType: BackgroundTaskType }
// MeterUpdate に足す
| { readonly type: 'background-tasks'; readonly tasks: readonly BackgroundTaskEntry[] }
```

| 段 | 規則 |
|---|---|
| agents の入力 | `background_tasks_changed` (`sdk.d.ts:3422-3442`) の `tasks` |
| 除くもの | `ambient === true`・`task_id` の形の外れたもの (`isValidTaskId`)・配列でない値 |
| 写し | `taskId` = `task_id`、`taskType` = `task_type` が 4 つの列挙にあればその値、他は `other` |
| 上限 | 64 件 (`MAX_BACKGROUND_TASKS`)。65 件目以降を落とす |
| 運ばないもの | `description`・`ambient`・未知のフィールド |
| 送り方 | `send` で即時 (`meter-throttle` を通さない) |
| decoder (`decodeMeterUpdate`) | `tasks` が配列でなければ捨てる。要素は形が外れたら 1 件ずつ捨てる。65 件以上は捨てる (agents が切るので届かない)。0 件は正しい値 (全部終わった) |

`METER_UPDATE_TYPES` は 9 → 10。`receivedMessages` (O-8) には数えない (`meter` なので)。

### 2.5 renderer の保持とタブ

| 項目 | 規則 |
|---|---|
| 持ち主 | 表示 (タブ) と feature の持ち主は `ui`。値の契約 (`meter` の種類) と保持 (稼働中のストアの `meters`) は session の契約 (O-4〜O-6 の `meter` と同じ形。AD-056 Decision 2 と「読み替える箇所」) |
| 置き場所 | `SessionMeters.backgroundTasks: readonly BackgroundTaskEntry[] \| null` (`EMPTY_SESSION_METERS` では `null`)。`applyMeter` の `case 'background-tasks'` で置き換える |
| 空に戻す | セッションのプロセスの起動 (今 `EMPTY_SESSION_METERS` で `meters` を作る箇所) |
| 永続化 | しない |
| タブ | `PANEL_TABS` (`features/shell/panel-tabs.ts:35-69`) の末尾 (概要・使用量・構成・会話の地図 (O-9) の後の 5 つ目) に `{ id: 'background-tasks', label: '背景の task', ... }`。`PanelTabId` (`stores/ui.ts:31`) に `'background-tasks'` を足す。見出しに件数 (`null` のときは件数を出さない)。`availableFor` は他の 4 つと同じ `['none', 'running', 'past']` (過去・未選択ではタブを出して下の「動いていないセッション」の旨を出す)。`attention` は付けない (注意の印は出さない) |
| 行 | 届いた順 (SDK の順のまま)。名前は同じセッションの transcript の `task:<taskId>` の行の `name`、無い・空なら種類のラベル (`taskTypeLabel`) だけ。`TASK_TYPE_LABELS` (`labels.ts:300-305`) に `other: 'その他の task'` を足す (今の `taskTypeLabel` は表に無い値をそのまま返すので、`other` が英語のまま出ないようにする) |
| 動いていないセッション | 一覧を出さず「セッションは動いていません」の旨 |
| 操作 | 付けない (止める・前面に戻すは無い) |
| キーボード操作 | O-4 / O-7 のタブの表のまま (AD-046) |

---

## §3 subagent の入れ子 (US-3 / FR-007〜FR-011)

### 3.1 実行中 (agents)

`live-tool-results.ts` の追跡を広げる。

| 状態 | 中身 | 上限 |
|---|---|---|
| 根 | 主ループのメッセージ (`parent_tool_use_id === null` の assistant) の最新の DTO (子を含む) | 256 件 (`MAX_PENDING_TOOL_MESSAGES`。LRU) |
| 位置の表 | `toolUseId` → (根の id、その tool-call までの道) | 根を忘れたら一緒に忘れる |
| 取り消しの記憶 | O-6 の `retract` の記憶に、取り消した根の配下の `toolUseId` を足す | 512 件 (`MAX_RETRACTION_MEMORY`) |

| 入力 | 処理 |
|---|---|
| assistant で `parent_tool_use_id === null` | 今どおり (根として覚える) |
| assistant / user で `parent_tool_use_id` が文字列 | 本文を主ループと同じ規則で DTO にする (assistant は `toLiveAssistantMessage`。user は tool_result だけ。下の行)。位置の表で親の tool-call を引き、その `children` に足して、根を同じ id で送り直す |
| 親が表に無い | 主ループの位置に平らに送る (孤児。AD-035 Decision 5)。ただし親が取り消しの記憶にあれば送らない |
| 親が自分の tool-call | 孤児と同じ |
| 深さ (根を 0) が `MAX_SUBAGENT_DEPTH` (8) を超える | 主ループに平らに送る |
| 1 つの tool-call の子が 500 件 | 以後足さず、親の `truncated` を立てる ([ASSUMED] の数値と同じ値。U-10) |
| 根の送り直しの大きさが 1,000,000 バイト (`RESEND_RESULT_MAX_BYTES`) を超える | 子を足さず、親の `truncated` を立てる (U-10) |
| `truncated` を立てた後 | 立てた親を 1 回だけ送り直す (印を届けるため)。以後その親への子は送り直さない (送り直しの回数を増やさない)。親の tool-call の結果 (`Agent` の呼び出しの tool_result) は主ループの結果の送り直しの規則 (`withToolResults` の上限) で今どおり埋める |
| 入れ子の中の tool の結果 (user の tool_result) | 位置の表で tool-call を引き、深い位置の `result` / `isError` を埋めて根を送り直す。主ループの結果の送り直しと同じ規則 |
| 入れ子の中の user の text・画像・その他の tool_result 以外のブロック | **読まない・送らない** (主ループの「tool_result ブロックだけを読み、user の本文は送らない」(`sdk-agent-session.ts` の `case 'user'`・011 data-model §3 手順 4) と同じ。U-11)。`isSynthetic` を問わない。tool_result だけの user のメッセージは子のメッセージを作らず、結果を埋めるだけ |
| system で `parent_tool_use_id` が文字列 | `compact_boundary` だけ親の `children` に divider (`{ type: 'divider', label: 'コンテキストを圧縮' }`。過去ログと同じ値) を足す。**他は帰属の無い system と同じ経路** (主ループの行。Hook・task・知らせの行は今どおり。捨てない。U-9)。`permission_denied` はこの判定より前で今どおり扱う |
| system で帰属の無いもの | 今どおり (主ループ) |

- 子の assistant の DTO の `createdAt` は主ループと同じく `toLiveAssistantMessage(message, receivedAt)` が埋める (SDK の `timestamp`、無ければ受信時刻。AD-051 Decision 2)。根を送り直しても根の `createdAt` は最初の値のまま (同じ id の送り直しは最初の時刻を保つ)。tool_result だけの user は子のメッセージを作らないので時刻を持たない
- 入れ子の tool の経過時間は出さない (`onToolProgress` は主ループだけのまま)
- 本文の無害化は主ループと同じ (`sanitizeBody`・tool 名の `sanitizeBody`・`argsText` の上限)
- `parent_tool_use_id` は会話外の値として扱い、形が外れた (`isValidToolUseId` が偽) ら孤児

### 3.2 過去ログ (取得プロセスと domain)

`read-transcript.ts`:

1. `getSessionMessages(sessionId, { includeSystemMessages: true })` (今どおり。失敗は今どおり `transcript-read-failed`)
2. `listSubagents(sessionId)`。失敗・配列でない → subagent は 0 件
3. 先頭から 32 件 ([ASSUMED]) の agentId (文字列で、空でないもの) について `getSubagentMessages(sessionId, agentId, { limit: 500 })` ([ASSUMED])。1 件ごとに失敗を捕まえ、失敗した subagent は捨てる
4. `toTranscriptMessages(messages, { now, subagents })` で変換して frame にする (今の第 2 引数 `ToTranscriptMessagesOptions` (`transcript.ts:40-43`。O-9 の `now`) に `subagents` を足す)

`toTranscriptMessages(records, options)` の `options.subagents?: readonly (readonly SessionMessageLike[])[]` (domain。省略時は空。`now` は今どおり):

| 段 | 規則 |
|---|---|
| 主の記録 | 今どおり (孤児は top-level・深さの上限・自己参照のガード・最初の一致) |
| 見た uuid | 主の記録と既に入れた subagent の記録の uuid を覚え、同じ uuid の記録は捨てる |
| subagent の列の親 | 列の記録の `parent_tool_use_id` (SDK が meta ファイルの `toolUseId` から付ける)。列の中で最初の文字列の値を列の親とする。null・空・形が外れた → 列を捨てる |
| 入れる順 | 親が `toolCallById` にある列から入れる。入れたら列の中の tool-call が `toolCallById` に入るので、残りの列をもう一度見る。進まなくなったら止める。列挙の順番に結果が依存しない (同じ親の列が複数あるときは列挙の順で入るが、どの親に入るかは変わらない) |
| inline の子 | 親の tool-call の `children` が既に空でなければ、その列を入れない |
| 親の見つからない列 | 捨てる (top-level に出さない) |
| 列の記録の変換 | 主の記録と同じ本文の規則 (`sanitizeBody`・`redactSecrets` は system だけ・tool 名・`argsText` の上限・`readToolResult`)。時刻も同じ規則 (`parseMessageTime(rec.timestamp, now)`。AD-051 Decision 1・4)。各記録は列の親の `children` に入れる。ただし記録の `parent_tool_use_id` が列の親と違う記録は捨てる |
| 深さ | 親の tool-call の深さ + 1。`MAX_SUBAGENT_DEPTH` を超えたら列を捨てる |
| system の行 | `getSubagentMessages` は返さない (`sdk.mjs:202`)。来ても列の中の system の行は捨てる |
| user の記録 | tool_result のブロックだけを読み、同じ `tool_use_id` の tool-call (列の中で入れたもの) の `result` / `isError` を主の記録と同じ規則 (`readToolResult`) で埋める。text・画像などのブロックは読まない (実行中の §3.1 と同じ。U-11)。tool_result の無い user の記録は子のメッセージを作らない |

agentId・`parent_agent_id` は入れ子の決定に使わない (多段は `parent_tool_use_id` の連鎖で決まる)。tool の結果の文面を読まない。

### 3.3 描画 (renderer)

| 項目 | 規則 |
|---|---|
| 入れ子の tool-call | 主ループと同じ振り分け (`tool-registry.aui.tsx` の完全一致の表 → MCP → ToolFallback)。props は `convert.ts` の tool-call の part を写す共有の関数から作る |
| 依存の向き (循環 import の禁止。`.dependency-cruiser.js` の `no-circular`・AD-023 §7) | `tool-registry.aui.tsx` → `subagent.aui.tsx` の 1 方向のまま (今 `tool-registry.aui.tsx:12` が Subagent を import している)。**`subagent.aui.tsx` は `tool-registry.aui.tsx` と `thread.aui.tsx` を import しない。** 振り分けは React の context で注入する: `subagent.aui.tsx` が context (`NestedToolRendererContext`。既定値 `null`) を定義・export し、`tool-registry.aui.tsx` が Agent / Task の表示の包みで Provider を置いて振り分けの関数を渡す。値が `null` (registry の外で Subagent を描いたとき) なら今の簡易な描画。入れ子の system-event の part のラベルは今どおり `features/chat/labels.ts` から引く (`SYSTEM_EVENT_ICONS` は `thread.aui.tsx` に置いたまま。subagent は参照しない) |
| 切り詰め | 親の tool-call の `truncated` (U-10) は今の `ToolResultMarks` の切り詰めの印で出す (最上位の Agent は `isTruncatedArgs`、入れ子の tool-call は `part.truncated`)。印の文言は `TOOL_RESULT_LABELS.truncated` のまま |
| 深さ | React の context で渡す。`VISUAL_MAX_DEPTH` (3) を超えたら今の簡易な描画 (tool 名・`ToolResultMarks`・結果の `pre`) |
| 子の数 | `VISUAL_MAX_CHILDREN` (50) のまま |
| text | markdown の本文の共有の部品 (`TextMessagePartProvider` + `MarkdownText`。新設 `markdown-body.tsx`)。Agent plan も同じ部品を使う。`TextMessagePartProvider` の import の固定テストは新しい部品に移す |
| thinking | 今の Reasoning の表示 |
| divider | O-6 の TranscriptBoundary (数を省いた文言) |
| 結果待ち・結果不明 | O-6 の `toolResultState` (thread の context。主ループと同じ) |
| 既定の開閉 | 今の Subagent の表示の既定 (畳む) のまま ([ASSUMED]) |
| `TRANSCRIPT_PART_FIELDS` | 変えない (`children` は R-4 からある) |
| 時刻 (O-9) | 入れ子の子のメッセージの時刻は表示しない (今の Subagent の表示のまま。O-9 の時刻と所要時間は主ループのメッセージだけ)。O-9 の活動の帯 (`activity-bins.ts`) は主ループのメッセージの tool-call の part だけを数えるので、入れ子の tool は数えない。実行中に今まで平らに並んでいた subagent の tool が入れ子に移る分、実行中の帯の重みが下がり、過去ログ (前から入れ子) と同じになる |

---

## §4 対応表の書き換え (FR-012)

完了の PR で `docs/ui-coverage.md` をこの表のとおりに書き換える (行番号は main 6fa08c2。O-9 / O-10 が行と備考を足した後。ずれていたら要素名で引き直す)。`O-11` を含む行は 39 (O-10 の `SDKElicitationCompleteMessage` と O-9 の `Trace waterfall` の 2 行が 2026-10-17 の 37 から増えた)。

| 行 | 要素 | 書き換え |
|---|---|---|
| `:181` | general-hooks | `実装済み: SystemEventRow (実行中)`。経路は V-2 の記録による (残れば「両方」) |
| `:182` | late-backgrounded-task | `実装済み: SystemEventRow (実行中)`。経路は V-2 の記録による |
| `:183` | subagent-nesting-live | `実装済み: Subagent (両方)`。備考に `listSubagents` / `getSubagentMessages` (AD-055) |
| `:69` | SDKBackgroundTasksChangedMessage | `実装済み: 背景の task のタブ (実行中)`。備考に AD-056 Decision 2 |
| `:224` | get_hooks_listing | `表示不要: 設定の一覧は Claude Code の /hooks で見られる (AD-056 Decision 4)` |
| `:58`, `:74`, `:75`, `:76`, `:77`, `:81`, `:82`, `:92`, `:107`, `:108`, `:112` | Tier B の知らせの類・Checkpoints・server_tool_use・web_search_tool_result・user/document | `後続: O-12` |
| `:56`, `:57`, `:83` | 拒否・知らせの備考の「(行は O-11)」 | 「(行は O-12)」(O-9 / O-10 が足した備考はそのまま) |
| `:79` | SDKElicitationCompleteMessage の備考 (O-10 が足した「過去ログは O-11 の変換に従う」) | 「過去ログは O-12 の変換に従う」(AD-056 Decision 1) |
| `:59`, `:66` | hook_started / task_started の備考 | 一般の Hook・後から背景に移った task は実装済み (O-11)。過去ログの経路は V-2 の記録による |
| `:63` | SDKToolProgressMessage の備考 | 入れ子の tool は経過時間を出さない (O-11 の入れ子は結果の状態の印だけ) |
| `:99` | B 節の前書き | 照合は O-12 へ送った (AD-056 Decision 1) |
| `:120` | AgentInput の備考 | 実行中の入れ子と `getSubagentMessages` は実装済み (O-11) |
| `:145` | TaskCreateInput の備考 | 計画の一覧は作らない (AD-056 Decision 3) |
| `:209`, `:220` | rewind_files / stop_task の備考 | `:209` は O-12、`:220` は「実行中の task の一覧は O-11 で実装 (操作は付けない)」 |
| `:238` | Agent handoff | `未使用` のまま。備考: subagent は主導権を渡さない。入れ子は Subagent (AD-056 Decision 5) |
| `:246` | Background runs | `未使用` のまま。備考: 一覧は右のペインのタブ (registry の element を使わない理由は plan の Constitution Check XIII) |
| `:250`, `:275`, `:282`, `:285`, `:293`, `:305`, `:337` | Checkpoints・Document reference・File・Follow-up suggestions・Inline citation・Memory・Sources | 割当の O-11 を O-12 に |
| `:344` | Task card | 備考: 背景の task の行 (SystemEventRow) と一覧のタブで描く (O-11) |
| `:359` | Trace waterfall (O-9 が足した「再検討は O-11 の入れ子の後」) | `未使用` のまま。備考の O-11 の部分を「実行中の subagent の入れ子は O-11 で Subagent の入れ子として実装した。O-11 は tool の開始と終わりの時刻の組を運ばないので、O-9 U-6 の判断の前提は変わらない」に直す |

項目 21 の出力で割当先が O-11 の行が 0 になること (SC-005)。

---

## §5 固定する集合と値

| 対象 | 値 | テスト |
|---|---|---|
| `QUERY_OPTION_KEYS` | 今の 9 (AD-041 (g) の 8 + AD-053 の `onElicitation`) + `includeHookEvents` / `forwardSubagentText` = 11 | `src/agents/session-core.test.ts:208-226` (長さ 11・`onUserDialog` / `supportedDialogKinds` を含まない今の検査は残す) |
| `buildQueryOptions` の 2 キー | どちらも `true` | `src/agents/session-core.test.ts` |
| `AGENT_SDK_ALLOWED_CALLS` | `listSessions` / `getSessionMessages` / `query` / `listSubagents` / `getSubagentMessages` | 項目 14 と fixture |
| `AGENT_SDK_CALL_FILES` | `listSubagents` / `getSubagentMessages` → `src/agents/read-transcript.ts` | 項目 14 の fixture 4 本 (`src/agents/__rulecheck__/` で呼ぶと発火。2 つの API を外で呼ぶもの 2 本・2 つ目の import 文・許可の名前の別名。照合は import した名前で、すべての名前付き import を読む) |
| `METER_UPDATE_TYPES` | 今の 9 + `background-tasks` | `meter.test.ts:163` (長さ 10) |
| `SYSTEM_EVENT_CATEGORIES` | 今の 12 (O-10 の `elicitation` を含む) + `backgrounded-task` = 13 | `system-event.test.ts` |
| `SYSTEM_EVENT_STATUSES` | 変えない (22。O-10 の `no-fallback-retry` を含む) | 同上 |
| `PANEL_TABS` の id の並び | `overview` / `usage` / `init-report` / `conversation-map` / `background-tasks` | `panel-tabs.test.ts:74-80` |
| `background-tasks` の要素のフィールド | `taskId` / `taskType` だけ | `meter.test.ts` (キーの集合) |
| `TextMessagePartProvider` の import | `markdown-body.tsx` だけ | `agent-plan.aui.test.tsx:134` を移す |
| `@assistant-ui/react-markdown` の import | `markdown-text.tsx` だけ (変えない) | 既存 |
