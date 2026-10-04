# Data Model: 会話の境界と tool の専用表示の第 2 弾 (O-6)

各規則の正本は本ファイルの節。SDK の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 (`SDKCompactBoundaryMessage` `sdk.d.ts:3457`、`SDKConversationResetMessage` :4749、`SDKInformationalMessage` :4855、`SDKModelRefusalFallbackMessage` :5022、`SDKModelRefusalNoFallbackMessage` :5059、`sdk-tools.d.ts` の `FileReadInput` :812・`GlobInput` :840・`GrepInput` :850・`WebFetchInput` :1034・`WebSearchInput` :1044・`TaskCreateInput` :2724・`TaskGetInput` :2744・`TaskUpdateInput` :2750・`TaskListInput` :2790)。

## §1 会話の境界と知らせの行 (O-2 の `system-event` の category。O-4 data-model §3 の作り方)

| category | 行の id | 読むフィールド | 読まないフィールド | `name` | `detail` | `status` |
|---|---|---|---|---|---|---|
| `compact-boundary` | `compact-boundary:<uuid>` | `compact_metadata.trigger`・`pre_tokens`・`post_tokens` | `preserved_segment`・`preserved_messages`・`duration_ms` | '' | `<trigger> <pre>→<post>` (列挙と整数だけ) | `marked` |
| `conversation-reset` | `reset:<uuid>` | (なし) | `new_conversation_id` | '' | '' | `marked` |
| `refusal` | `refusal:<uuid>` | `direction`・`scope`・`fallback_model`・`api_refusal_category`・`retracted_message_uuids` の件数 | `api_refusal_explanation`・`request_id`・`refused_user_message_uuid`・`original_model` | fallback のモデル (O-4 の `modelId` の形の検査。外れたら '') | `<direction> <scope> <category> retracted=<n>` (category は `^[a-z_-]{1,32}$` のときだけ) | `fallback` |
| `refusal` (no fallback) | `refusal:<uuid>` | `content`・`api_refusal_category` | `api_refusal_explanation`・`original_model`・`request_id` | '' | `content` を U-3 の規則で | `no-fallback` |
| `informational` | `info:<tool_use_id>` (あれば) / `info:<uuid>` | `content`・`level`・`prevent_continuation`・`tool_use_id` | — | '' | `content` を U-3 の規則 (下) で | `level` の値 (`info` / `notice` / `suggestion` / `warning`)。`prevent_continuation` なら `stopped` |

- **`content` の規則 (U-3)**: `sanitizeBody` (O-2) → 1 行に正規化 → 300 コードポイントで切り詰め。`mayCarrySecret` が true なら '' (renderer は「理由は Claude Code のログを見てください」)
- 過去ログの圧縮: `transcript.ts:207` の `{ type: 'divider', label: 'コンテキストを圧縮' }` はそのまま (DTO を変えない) にし、renderer が divider を Compaction boundary の表示に写す (数は出さない)。domain が日本語の label を作っている点は AD-045 (i18n) の例外の一覧に足す
- **取り消し (U-2)**: agents は `refusal` の行とは別に、O-4 の `meter` に種類 `retraction` (`{ type: 'retraction'; messageIds: readonly string[] }`) を足して送る。`messageIds` は `retracted_message_uuids` のうち `^[A-Za-z0-9-]{1,64}$` のものだけ、128 件まで (O-2 の行の `detail` は 120 コードポイントで切り詰めるので id の列を運べない)。renderer の稼働中のストアは受けたら同じセッションの `messages` から該当の id を外す (冪等。知らない id は無視。閉じたセッションには書かない)。O-4 data-model §2 の値の検証の表に `messageIds` の行を足す
- 終わりを表す値 (`isTerminalSystemEventStatus`) に `marked` / `fallback` / `no-fallback` / `stopped` と `level` の 4 値を足す (いずれも 1 回の出来事)
- `SystemEventStatus` の追加は上の値。part の形と `TRANSCRIPT_PART_FIELDS` は変えない

### 見た目

| category | 見た目 |
|---|---|
| `compact-boundary` / `conversation-reset` | 横いっぱいの区切り (Compaction boundary の element)。文言は §4 |
| `refusal` | 注意の行 |
| `informational` | `warning` / `suggestion` / `stopped` は注意の行、`info` / `notice` は控えめの行 |

## §2 tool の専用表示

| tool | 見出し | 中身 |
|---|---|---|
| `Read` | ファイル名 (パスの末尾) と範囲 (`offset`〜`offset+limit` の行、`pages`) | 全体のパス (R-2 の表示の規則で UNC の接頭辞を出さない)、結果 (行番号つきの text をコードとして) |
| `Glob` | `pattern` と対象のパス (`path` があれば末尾) | 結果のファイルの一覧を File tree (200 件まで。超えた数を「ほか N 件」) |
| `Grep` | `pattern`・`glob`・対象のパス | 結果。`output_mode` が `files_with_matches` (既定) なら File tree、それ以外は text |
| `WebFetch` | URL のドメインとパス (WHATWG URL で読み、`username` / `password` / `search` / `hash` を落とす。読めなければ「URL」) | `prompt` (無害化・切り詰め)、結果の text |
| `WebSearch` | `query` と `allowed_domains` / `blocked_domains` (あれば件数) | 結果の text |
| `TaskCreate` | 「タスクを追加」と `subject` | TodoList の 1 項目 (`subject`・`activeForm`・状態は未着手) |
| `TaskUpdate` | 「タスクを更新」と `taskId` | TodoList の 1 項目 (`subject` があれば・状態 (下)) |
| `TaskGet` / `TaskList` | 「タスクを確認」/「タスクの一覧」 | 結果の text |

- 状態の対応: `pending` → 未着手、`in_progress` → 進行中、`completed` → 完了、`deleted` → 削除、知らない値 → 不明
- 入力の文字列は既存の tool の表示と同じく O-2 の無害化を通った値。見出しは 1 行・80 コードポイントで切り詰め
- 振り分けは `tool-registry.aui.tsx` の表 (`Object.hasOwn` の照合。O-5 data-model §1) に足す
- File tree は registry の element を先に確かめる (Principle XIII)

## §3 tool の結果の状態 (renderer の純関数 `toolResultState(part, sessionState, pendingApproval)`)

| 条件 (上から) | 状態 | 印 |
|---|---|---|
| `result` がある (エラー・切り詰めの印は既存) | 結果あり | なし |
| 承認待ち (表示中のセッションの承認の要求の `toolUseId` が一致) | 承認待ち | 「承認待ち」 |
| 実行中のセッションで、セッションの状態が終わり (終了・失敗) でない | 結果待ち | 「結果待ち」(動く印。`aria-busy`) |
| それ以外 (終わったセッション・過去ログ) | 結果不明 | 「結果不明」 |

- 並列の tool の結果が 1 つずつ届くか、まとめて届くか (V-4 未記録) に依らない (tool の part ごとに判定する)

## §4 読み上げと文言 (正本。`labels.ts`)

### 読み上げ (`TranscriptAnnouncer`。表示中のセッションの thread の中に 1 つ)

| きっかけ | 文言 |
|---|---|
| tool の結果がエラー | 「{tool 名} がエラーになりました」(同じ 1 秒の間に複数なら「{n} 件の tool がエラーになりました」) |
| Hook / task の行が終わり (`succeeded` / `failed` / `completed` / `killed` / `stopped`、結果不明) | 「{Hook / task} が {状態の文言}」 |
| 圧縮・会話の作り直し・拒否・`stopped` の知らせ | §1 の行の文言 |

- `aria-live="polite"`、1 秒に 1 回までにまとめる。承認待ちと失敗は既存の `SessionAttentionAnnouncer` が読むので重ねない

### 文言

| キー | 文言 |
|---|---|
| 圧縮の境界 | ここでコンテキストを圧縮しました ({手動 / 自動}、{pre} → {post} トークン) / 数が無ければ括弧を省く |
| 会話の作り直し | ここから新しい会話です。これより上の内容は Claude のコンテキストにありません |
| 拒否 (fallback) | モデルが応答を拒否したため {model} に切り替えました ({scope が local なら「この応答だけ」})。{n} 件のメッセージを取り消しました |
| 拒否 (no fallback) | モデルが応答を拒否しました |
| 知らせ | Claude Code からの知らせ / ここで止まりました / 理由は Claude Code のログを見てください |
| 結果の状態 | 結果待ち / 結果不明 / 承認待ち |
| ToolFallback の見出し | {tool 名} を実行 |
| tool の見出し | タスクを追加 / タスクを更新 / タスクを確認 / タスクの一覧 / 未着手 / 進行中 / 完了 / 削除 / 不明 / ほか {n} 件 |

## §5 対応表の書き換え先 (正本。完了の PR で)

| 節 | 行 | 書き換え先 |
|---|---|---|
| A | `compact_boundary` (Tier A) | `実装済み: CompactionBoundary (両方)` |
| A | `model_refusal_fallback` / `model_refusal_no_fallback` (Tier A) | `実装済み: SystemEventRow (実行中)` |
| A | `informational` (Tier A) | `実装済み: SystemEventRow (実行中)` |
| A | `conversation_reset` (Tier A) | `実装済み: CompactionBoundary (実行中)` |
| A | `local_command_output` / `notification` / `files_persisted` / `tool_use_summary` / `memory_recall` / `prompt_suggestion` / `mirror_error` / `background_tasks_changed` / `active_goal` | `後続: O-11` |
| A | `hook_started` / `task_started` などの備考の「O-6」 | 「O-11」に |
| B | `server_tool_use` / `web_search_tool_result` / `user/document` | `後続: O-11` |
| B | `user/tool_result` の備考の「結果待ち・結果不明の印と読み上げは O-6」 | 「実装済み (O-6)」に |
| C | `Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` (Tier A) | `実装済み: <element> (両方)` |
| C | `Agent` の備考の「実行中の入れ子と getSubagentMessages は O-6」 | 「O-11」に。`ExitPlanMode` の備考の「markdown は O-6」は「実装済み (O-6)」に |
| E | `rewind_files` / `stop_task` / `background_tasks` / `get_hooks_listing` | `後続: O-11` |
| F | Checkpoints / Document reference / File / Follow-up suggestions / Memory / Background runs / Task card / Agent handoff | 備考の「O-6」を「O-11」に |
| F | File tree / Tool call / Web search | 使い道を本 feature の表示に |
| F | Inline citation / Sources | `未使用`、備考 `WebSearch の結果から組まない (O-6 U-5)` |
