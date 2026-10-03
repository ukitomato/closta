# Data Model: ui-coverage 対応表の確立 (O-2)

**Spec**: [spec.md](./spec.md) / **Research**: [research.md](./research.md)

値と形の正本は本書。振る舞いの正本は spec の FR、方式の理由は research。

## §1 `docs/ui-coverage.md` の形

### 冒頭

- `SDK: @anthropic-ai/claude-agent-sdk <version>` の 1 行 (検査は `node_modules/@anthropic-ai/claude-agent-sdk/package.json` の `version` と比べる)
- 凡例: 割当の 3 種類、Tier、経路の書き方、対象外にしたもの (`SDKSessionInfo` など) と理由

### 各節の表 (A〜E)

| 列 | 値 | 検査 |
|---|---|---|
| 識別子 | A: SDK の型名 (`SDKHookStartedMessage`)、B: `assistant/<block type>` / `user/<block type>`、C: 入力型の名前 (`FileEditInput`)、D: 経路の名前 (`permission-request` など)、E: `control_request` の subtype | A / C / E は SDK の型定義の集合と一致すること |
| 判別子 | A: `type` / `subtype`、C: 実行時の tool 名 (`Edit`) | 書式のみ |
| Tier | `A` / `B` / `C` | 3 値のどれか |
| 割当 | `実装済み: <element> (<経路>)` / `後続: <feature ID>` / `表示不要: <理由>` | 3 種類のどれか。`後続` の ID は roadmap の表の ID 列にあること。`実装済み` で element が `ToolFallback` だけの行は Tier B / C であること |
| 経路 | `実行中` / `過去ログ` / `両方` / `—` (表示不要の行) | 書式のみ |
| 備考 | 自由 | — |

- **割当ではないもの**: 空、`未割当`、`TBD`、`—` だけ (Constitution XII の `bad_pattern_grep` と同じ語)
- 経路の列の `—` は「表示不要」の行でだけ許す (割当の列の `—` とは別の列)

### F 節 (element の分類)

| 列 | 値 |
|---|---|
| element | registry の名前 |
| Tier | `A` / `B` / `C` |
| 使い道 | 対応表の行 (A〜E の識別子) か、`未使用` |
| 備考 | Tier C の転用の判断など |

F 節は表示の割当の対象ではないので、FR-003 の照合の対象外 (Tier の値だけを検査する)。

## §2 `TranscriptPartDTO` の `event` (domain/session/transcript-dto.ts)

```ts
| {
    readonly type: 'event'
    readonly category: 'hook' | 'task'
    /** Hook: hook_name / task: description。sanitizeBody + 1 行に正規化 + 120 コードポイントで切り詰め。 */
    readonly name: string
    /** Hook: hook_event (PreToolUse など) / task: task_type。無ければ ''。同じ正規化。 */
    readonly detail: string
    readonly status: EventStatus
  }
```

- `EventStatus` (理由キー。訳は renderer の `labels`):
  - Hook: `started` (hook_started) / `succeeded` / `failed` / `cancelled` (hook_response の `outcome`)
  - task: `pending` / `running` / `completed` / `failed` / `killed` / `paused` / `stopped` (task_started は `running`、task_updated の `patch.status`、task_notification の `status`)
  - 知らない値は捨てずに `unknown` に倒す
- `TRANSCRIPT_PART_FIELDS.event = ['type', 'category', 'name', 'detail', 'status']` (SC-009 の台帳。増えたら検査が落ちる)
- 変換の入力 (SDK のフィールドの許可リスト):

  | subtype | 読むフィールド | 読まないフィールド |
  |---|---|---|
  | `hook_started` | `hook_id` (行の id)、`hook_name`、`hook_event` | — |
  | `hook_response` | `hook_id`、`hook_name`、`hook_event`、`outcome` | `output`、`stdout`、`stderr`、`exit_code` |
  | `task_started` | `task_id`、`description`、`task_type`、`skip_transcript` | `prompt`、`workflow_name` |
  | `task_updated` | `task_id`、`patch.status`、`patch.description` | `patch.error`、`patch.end_time` ほか |
  | `task_notification` | `task_id`、`status`、`skip_transcript` | `summary`、`output_file`、`usage`、`resource_links` |

- メッセージ: `{ id: 'hook:<hook_id>' | 'task:<task_id>', role: 'system', parts: [event], createdAt }`。`skip_transcript: true` の task は変換しない (`null`)
- 同じ id の後続は、`status` と (task_updated に description があれば) `name` を書き換えた同じ形

## §3 実行中の tool の結果の対応 (agents のセッションスレッドの中)

- `pendingToolCalls: Map<toolUseId, messageId>` と `lastMessages: Map<messageId, TranscriptMessageDTO>` (結果待ちの tool_use を含むメッセージだけ)
- `user` メッセージの `tool_result` ブロックごとに:
  1. `toolUseId` で `messageId` を引く。あれば domain の純関数 `withToolResult(dto, toolUseId, block)` で part を埋めた DTO を作り、`message` で送り直す。結果待ちが 0 になったメッセージは両方の Map から消す
  2. 無ければ、結果だけの tool-call (過去ログの「(tool result)」と同じ形) のメッセージを新しい id (`result:<toolUseId>`) で送る
- 上限: 結果待ち 256 件 [ASSUMED]。超えたら古いメッセージから捨てる
- 結果の本文: 過去ログと同じ取り出し (`text` ブロックの連結、`content` が文字列ならそのまま) + `sanitizeBody` (`BODY_MAX_BYTES`)。`is_error` → `isError`

## §4 直近の活動の tool ごとの要点 (`summarizeToolInput`)

| tool (実行時の名前) | 出すもの | 入力のフィールド |
|---|---|---|
| `Read` / `Edit` / `Write` / `MultiEdit` | ファイル名 (パスの末尾) | `file_path` |
| `NotebookEdit` | ファイル名 | `notebook_path` |
| `Bash` | コマンドの最初の語 (先頭の `NAME=value` を飛ばす) | `command` |
| `Glob` / `Grep` | 出さない (tool 名だけ) | — (検索語は会話の内容そのものなので出さない) |
| `Agent` / `Task` | subagent の種類 | `subagent_type` |
| 上記以外・読めない | 出さない (tool 名だけ) | — |

- 出力: `{ tool, detail }` の `detail` に上の値 (無ければ `''`)。既存の `toActivityLine` (1 行化と 80 コードポイントの切り詰め) を通す

## §5 transcript の情報密度

- `stores/ui` の `transcriptDensity: 'comfortable' | 'compact'` (既定 `comfortable`)、`setTranscriptDensity`。永続化しない
- 監視ビューの行の密度 (`running-session-store` の `density`) とは別の値
