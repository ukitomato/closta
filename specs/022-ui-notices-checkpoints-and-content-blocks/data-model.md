# Data Model: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

本書は本 feature の規則の正本である (spec FR-002 の「読むフィールドの正本は data-model に 1 つ置く」)。plan・tasks・コードの注記は本書の節を参照し、規則を書き写さない。

## 0. 変えないもの

| 対象 | 今の値 | 根拠 |
|---|---|---|
| `QUERY_OPTION_KEYS` (`src/agents/session-core.ts`) | 12 キー (AD-059)。`promptSuggestions` を足さない | FR-001 / U-1 |
| `SESSION_EVENT_KINDS`・`SessionControl` | 今のまま。新しい行は `message` の `SessionEvent` で運ぶ | SC-007 |
| `AGENT_SDK_ALLOWED_CALLS` | 5 (AD-055) | SC-007 |
| `METER_UPDATE_TYPES` | 10 (AD-056) | U-2 |
| `SYSTEM_EVENT_STATUSES` | 22 | research R-04 |
| IPC・preload・main (`src/main/`・`src/preload/`) | 差分 0。外部リンクは既存の `openExternalIfHttp` | FR-009 / SC-007 |
| `toSystemEventMessage` / `mergeSystemEvent` の規則 | 今のまま (呼び出し元を足すだけ) | FR-003 |
| 既存のブロックの変換 (text / thinking / redacted_thinking / tool_use / tool_result / image) | 今のまま。ただし過去ログの user の記録の `thinking` / `redacted_thinking` / `tool_use` は §2.2 の user の許可一覧の外として `unsupported-block` にする (spec U-11。Claude Code の user のメッセージに現れない組み合わせ) | research R-14 |

## 1. 知らせの行 (`src/domain/session/notice-rows.ts`。新設)

### 1.1 入口と判別子

```ts
export function toNoticeRow(
  raw: unknown,            // SDK のメッセージ (実行中) / 過去ログの記録の message (未信頼)
  createdAt: number | null,
  fallbackId: string       // 行の id の材料が無いときの代わり (実行中は randomUUID()、過去ログは記録の uuid)
): TranscriptMessageDTO | null
```

- `raw` が record でなければ `null`
- 判別子 `kind`: `raw.type === 'system'` なら `raw.subtype`、それ以外で `raw.type` が文字列なら `raw.type`。どちらでもなければ `null`
- 下の §1.3 の 12 の種類のどれでもない `kind` は `null` (呼び出し元が今の経路に戻す)
- 戻りは `toSystemEventMessage` と同じ形 (`role: 'system'`・part 1 つの `system-event`)。合成は呼び出し元が `mergeSystemEvent` で行う

**呼び出し元** (変換の関数はこれ 1 つ。FR-012):

| 経路 | 場所 | 渡し方 |
|---|---|---|
| 実行中 (`system` の subtype) | `src/agents/live-signals.ts` の `onSystem` の switch | §1.3 の `system` の 9 つの case で `toNoticeRow(record, clock.now(), randomUUID())` を呼び、`null` でなければ `{kind: 'message', message}` を送る。`model_refusal_fallback` は先に `retractIds(record.retracted_message_uuids)` を呼ぶ (今のまま) |
| 実行中 (トップレベル) | `src/agents/sdk-agent-session.ts` の stream の switch | `case 'conversation_reset'` は今の `signals.onConversationReset` (中で `toNoticeRow`)。`case 'tool_use_summary'` を足し、`signals.onNotice(message)` (新設。引数は `unknown`。中で `toNoticeRow`) を呼ぶ。`active_goal` は `SDKMessage` の union の外 (`SDKActiveGoalMessage` は `sdk.d.ts` の `StdoutMessage` にだけある) なので case を書かず (TS2678)、`default:` の中で `asRecord(message)?.type === 'active_goal'` を確かめてから `signals.onNotice(record)` を呼ぶ (型ガード。`as` の cast をしない。spec U-13)。`prompt_suggestion` は足さない (届かない。U-1) |
| 過去ログ | `src/domain/session/transcript.ts` の `role === 'system'` の分岐 (`:300-334`) | `taskRows.build(...)` が `null` のとき、`toNoticeRow(noticeRecordOf(rec.message), createdAt, rec.uuid)` を呼ぶ。結果は Hook / task の行と同じく `systemEvents` に合成する。`null` なら今の経路 (伏せ字つきの本文) |

`noticeRecordOf(message)`: `message` の record をそのまま返す。ただし `message.type` が文字列でなければ `type: 'system'` を足す (今の `{...asRecord(rec.message), type: 'system'}` は元の `type` を上書きするので、トップレベルの種類 (`conversation_reset` など) が記録の `message.type` に残っていても読めない。上書きしない形に替える)。`taskRows.build` に渡す値は今のまま。

### 1.2 共通の規則

- **本文**: `redactedBodyLine(value, max)` (`system-event.ts:50`。`sanitizeBody` → `redactSecrets` → 1 行化 → `max` コードポイントで切り詰めて `…`) を通す。`max` の既定は `SYSTEM_EVENT_NAME_MAX_CODE_POINTS` (120)。文字列でなければ空
- **id の材料**: `isValidToolUseId` (domain の `meter.ts`) を通した値だけを id に使う。外れたら `fallbackId`
- **件数**: 0 以上の整数だけを数え、文字列にして運ぶ (`countToken` と同じ。外れたら `-`)
- **名前の列** (`memory_recall` / `files_persisted`): 各項目を `redactedBodyLine(value, 120)` に通し、空を除いて改行で連ね、最大 20 件。超えた分は列の最後に `+<N>` (表示は renderer の文言)。`name` 全体の長さの上限は 20 × 121 コードポイント
- **読まないフィールド** は §1.3 の表の右端。読まないフィールドの値が DTO に入らないことを単体で固定する (SC-001 の目印の値)

### 1.3 種類ごとの規則

`opens` は 12 の種類すべて `true` (後続も行を作り直せる。O-6 の `informational` と同じ)。

| kind | id | category | name | detail | status | 読まないもの |
|---|---|---|---|---|---|---|
| `informational` (O-6) | `info:<tool_use_id>` (形を通れば) / `info:<uuid>` | `informational` | `''` | `redactedBodyLine(content)` | `prevent_continuation === true` → `prevented`、`level` が警告の段階 → `warning`、他 → `notice` (今の `live-signals.ts:676-688` のまま) | `tool_use_id` は id の材料だけ |
| `model_refusal_fallback` (O-6) | `refusal:<uuid>` (uuid が外れたら行を作らない。今のまま) | `refusal` | `fallback_model` (`isMeterModelId` を通れば) | `<direction> <scope> <category>` + 拒否の説明 (今の `:628-646` のまま) | `fallback` | `retracted_message_uuids` (実行中の取り消しにだけ使う。過去ログでは読まない) |
| `model_refusal_no_fallback` (O-6 / O-10) | `refusal:<uuid>` (同上) | `refusal` | 拒否の分類 (`refusalCategory`) | `content` と拒否の説明を改行で連ねて `redactedBodyLine` | `refused_user_message_uuid` が空でない文字列 → `no-fallback-retry`、他 → `no-fallback` (今の `:649-670` のまま) | `refused_user_message_uuid` の値 |
| `conversation_reset` (O-6) | `reset:<uuid>` (uuid が外れたら行を作らない) | `conversation-reset` | `''` | `''` | `marked` | `new_conversation_id` |
| `elicitation_complete` (O-10) | `elicitation:<elicitation_id>` (形を通れば) / `elicitation:<fallbackId>` | `elicitation` | `mcp_server_name` (`isMcpName` を通れば) | `''` | `completed` | — |
| `notification` | `notification:<key>` (`key` が `/^[A-Za-z0-9_.:-]{1,64}$/` に合えば) / `notification:<uuid>` / `notification:<fallbackId>` | `notification` | `''` | `redactedBodyLine(text)` | `priority` が `high` / `immediate` → `warning`、他 (`low` / `medium` / 不明) → `notice` | `color`・`timeout_ms` |
| `local_command_output` | `local-command:<uuid>` / `local-command:<fallbackId>` | `local-command-output` | `''` | `redactedBodyLine(content)` | `notice` | — |
| `tool_use_summary` | `summary:<uuid>` / `summary:<fallbackId>` | `tool-use-summary` | `''` | `redactedBodyLine(summary)` | `notice` | `preceding_tool_use_ids` |
| `active_goal` | `goal:<uuid>` / `goal:<fallbackId>` | `active-goal` | `''` | `value` が `null` → `''`、record → `redactedBodyLine(value.condition)` | `value === null` → `completed` (解除)、record → `notice` (設定)。`value` が無い・他の型なら行を作らない | `iterations`・`set_at`・`tokens_at_start`・`last_reason` |
| `mirror_error` | `mirror-error:<uuid>` / `mirror-error:<fallbackId>` | `mirror-error` | `''` | `redactedBodyLine(error)` | `failed` | `key` (`projectKey`・`sessionId`・`subpath`) |
| `memory_recall` | `memory:<uuid>` / `memory:<fallbackId>` | `memory-recall` | §1.4 の名前の列 | §1.4 の `detail` | `notice` | `memories[].content`・絶対パスそのもの |
| `files_persisted` | `files-persisted:<uuid>` / `files-persisted:<fallbackId>` | `files-persisted` | §1.5 の名前の列 | §1.5 の `detail` | `failed` の項目が 1 つ以上 → `failed`、他 → `completed`。`files` と `failed` がどちらも空 (配列でないものは空とみなす) なら行を作らない | `files[].file_id`・`processed_at` |

- category は `SYSTEM_EVENT_CATEGORIES` (`transcript-dto.ts:68`) の末尾 (`backgrounded-task` の後) に上の 7 つをこの順で足す (13 → 20)。固定テストを直す
- `pickKey`・`countToken`・`refusalCategory`・`isMcpName`・`WARNING_LEVELS`・`DIRECTIONS`・`SCOPES` など行に使う値と関数のうち agents にあるものは `notice-rows.ts` に移し、`live-signals.ts` は domain から import する (agents → domain の向き。Principle VII)
- 同じ `key` の `notification` が続けて届くと、`mergeSystemEvent` の規則で最初の行の位置で `detail` と `status` を書き換える (FR-003。間に別の行が挟まっても同じ)

### 1.4 `memory_recall` の `detail` と `name`

- 各項目の `path` を次の 3 つに分ける: `<synthesis:` で始まる → 要約 / `https://` で始まり URL として読める → URL / 他 → ファイル
- `name` の列: ファイルは `pathTail(path)` (O-11 の `src/domain/session/path-tail.ts`)、URL は host だけ。要約は列に入れない。§1.2 の名前の列の規則を通す
- `detail`: `<mode> <件数> <personal の数> <team の数> <organization の数> <要約の数>` (空白区切りのトークン。`mode` は `select` / `synthesize` の外なら `-`)。renderer が文言に組む
- `content` は読まない。`path` は分類と末尾の切り出しにだけ使い、`path` そのものを DTO に入れない (FR-005)

### 1.5 `files_persisted` の `detail` と `name`

- `name` の列: `files[].filename` → `failed[].filename` の順 (§1.2 の名前の列の規則)
- `detail`: `<保存の件数> <失敗の件数>` に、失敗があれば空白 1 つと `redactedBodyLine(failed[0].error, 120 - 先頭の長さ - 1)` を続ける (`model_refusal_fallback` の説明と同じ切り詰め)

### 1.6 renderer の見た目と読み上げ

| category | 見出し (`features/chat/labels.ts`) | tone | 読み上げ (`transcript-announcements.ts` の `rowAnnouncement`) |
|---|---|---|---|
| `notification` | 「通知」 | `warning` → 注意、`notice` → 控えめ | `warning` だけ |
| `local-command-output` | 「コマンドの出力」 | 控えめ | しない |
| `memory-recall` | 「メモリを読み込みました」+ 件数と scope ごとの数 (`detail` から) | 控えめ | しない |
| `mirror-error` | 「記録の同期に失敗しました」 | 注意 | する |
| `tool-use-summary` | 「tool の要約」 | 控えめ | しない |
| `active-goal` | `notice` → 「目標」、`completed` → 「目標を解除しました」 | 控えめ | しない |
| `files-persisted` | 「ファイルを保存しました」+ 保存の件数・失敗の件数 (失敗があれば失敗の理由) | `failed` → 注意、他 → 控えめ | `failed` だけ |

- `SYSTEM_EVENT_ICONS`・`systemEventDetailText`・`isWrappedCategory` (`thread.aui.tsx` の `SystemEventRow`) に 7 つを足す。名前の列 (`memory-recall` / `files-persisted`) は折り返しの対象 (`isWrappedCategory`) にし、`+<N>` は「ほか N 件」に組む
- `files-persisted` の行に操作 (巻き戻し・開く) を置かない (FR-006)
- 本文の長さの印 (`…`) は O-2 の切り詰めの印のまま

## 2. 中身のブロック

### 2.1 DTO の part の追加と変更 (`src/domain/session/transcript-dto.ts`)

```ts
| {
    readonly type: 'server-tool-call'
    readonly toolCallId: string
    readonly toolName: string           // server_tool_use の name (sanitizeBody)。対応の無い結果だけのときは ''
    readonly argsText: string           // input (sanitizeBody + TOOL_RESULT_MAX_BYTES)
    readonly truncated: boolean
    readonly result: ServerToolResultDTO | null
  }
| { readonly type: 'unsupported-block'; readonly blockType: string }
| { readonly type: 'file'; readonly filename: string; readonly mediaType: DocumentMediaType }   // text を消す

export type DocumentMediaType = 'application/pdf' | 'text/plain' | ''

export type ServerToolResultDTO =
  | { readonly kind: 'web-search'; readonly sources: readonly WebSourceDTO[]; readonly omitted: number }
  | { readonly kind: 'error'; readonly errorCode: string }
  | { readonly kind: 'unsupported'; readonly blockType: string }

export interface WebSourceDTO { readonly title: string; readonly url: string }
```

- `TRANSCRIPT_PART_FIELDS` (`:154`) に `server-tool-call: [type, toolCallId, toolName, argsText, truncated, result]`・`unsupported-block: [type, blockType]` を足し、`file` を `[type, filename, mediaType]` にする。`transcript-schema.test.ts` の集合 (`:113`) と fixture (`:34`) を同じ PR で直す
- renderer の `transcript-guard.ts` の `filterPart` に `server-tool-call` (§2.2 の形の検査。`sources` は 20 件まで、`result` の `kind` は 3 つのどれか) と `unsupported-block` (`blockType` が文字列) の case を足す。形が外れた part は捨てる

### 2.2 変換 (`src/domain/session/content-blocks.ts`。新設)

実行中 (`live-message.ts` の `toLiveAssistantMessage`) と過去ログ (`transcript.ts` の `convertBlocks`) の両方の switch から呼ぶ。

**role の規則 (正本はここ 1 箇所。spec U-11)**:

- **assistant**: 下の表のとおり。既存の 7 つ (text / thinking / redacted_thinking / tool_use / tool_result / image / document) は今の case のまま、表の新しい行の case を足し、どれにも当たらないものは `default:` で `unsupported-block`
- **user (過去ログの主ループ)**: 許可一覧は `text` / `image` / `document` / `tool_result` の 4 つ。この 4 つは今の case (`document` は表の行) を通り、**外のすべて** (`thinking`・`redacted_thinking`・`tool_use`・`server_tool_use`・表の結果のブロック・`search_result`・`container_upload` など) は switch に入る前に `unsupported-block` にする (表の `server_tool_use` / 結果のブロックの行は user には当てない)
- **system**: 今のまま (`text` だけを本文にし、他は印を出さずに飛ばす。行は §1 と FR-012 の経路)

**印を出す経路と出さない経路 (spec FR-011 / U-10。SC-004 の表の行)**:

| 経路 | 知らないブロック | 理由 |
|---|---|---|
| 実行中の assistant (主ループと subagent の入れ子) | `unsupported-block` | — |
| 過去ログの assistant (主ループと subagent) | `unsupported-block` | — |
| 過去ログの主ループの user | 許可一覧の外を `unsupported-block` | — |
| 実行中の user のメッセージ | 読まない (tool_result だけ。`live-tool-results.ts` の `applyUserMessage`) | user の本文を送らない経路 (利用者の入力は renderer の送信の値を出す) |
| 過去ログの subagent の user の記録 | 読まない (tool_result だけ。`transcript.ts:183`) | 親の `Agent` の入力の重複 (O-11 U-11) |

| ブロック (`type`) | part | 規則 |
|---|---|---|
| `server_tool_use` | `server-tool-call` (`result: null`) | `toolCallId` = `id` (文字列でなければ `''`)、`toolName` = `sanitizeBody(name).value` (空なら `''`)、`argsText` = `sanitizeBody(safeStringify(input), TOOL_RESULT_MAX_BYTES)` (tool_use と同じ)。`caller` は読まない |
| `web_search_tool_result` | 結果 (§2.3 で埋める) | `content` が配列 → `{kind: 'web-search', sources, omitted}`。各項目は `type === 'web_search_result'` のものだけを読み、`title` = `redactedBodyLine(title, 200)`、`url` = §2.2.1。先頭 20 件、超えた数を `omitted`。`encrypted_content`・`page_age` は読まない。`content` が record で `type === 'web_search_tool_result_error'` → `{kind: 'error', errorCode}` (`error_code` が `/^[a-z_]{1,64}$/` に合えばその値、外れたら `''`)。他は `{kind: 'unsupported', blockType: 'web_search_tool_result'}` |
| `web_fetch_tool_result`・`advisor_tool_result`・`code_execution_tool_result`・`bash_code_execution_tool_result`・`text_editor_code_execution_tool_result`・`tool_search_tool_result` | 結果 (§2.3) | `{kind: 'unsupported', blockType: <type>}`。中身は読まない (U-8) |
| `document` (user) | `file` | `filename` = `redactedBodyLine(title ?? source.filename, 120)` (今の `documentName` の英語の既定 `'document'` は消して `''`)。`mediaType` = `source.type` が `base64` / `url` → `'application/pdf'`、`text` → `'text/plain'`、他 → `''`。`source.data`・`context`・`citations` は読まない |
| assistant: 上の表と既存の 7 つの外のすべて (`mcp_tool_use`・`mcp_tool_result`・`container_upload`・`compaction`・`fallback` など)。user (過去ログの主ループ): 許可一覧の 4 つの外のすべて (`search_result`・`thinking`・`tool_use`・`server_tool_use`・結果のブロックなど) | `unsupported-block` | `blockType` = `type` が `/^[a-z][a-z0-9_]{0,63}$/` に合えばその値、外れたら `''`。中身は読まない (FR-011) |

- user の `unsupported-block` と `file` は過去ログの主ループだけで出る (上の「印を出す経路と出さない経路」)
- subagent の assistant の記録は主ループと同じ表を通る

#### 2.2.1 URL

- 文字列で、長さ 2048 バイト以下、制御文字と双方向制御を含まず、`/^https?:\/\//i` で始まるものだけを運ぶ。外れたら `''` (項目はタイトルだけで出す)
- domain は URL を解決・取得しない。host は renderer が `webFetchHeading` で取る (§2.4)

### 2.3 結果の対応づけ

- 結果のブロック (§2.2 の「結果」の行) の `tool_use_id` を読み、同じ id の `server-tool-call` (`result: null`) があれば、その `result` に埋めて結果のブロックからは part を作らない
- 無ければ、`{type: 'server-tool-call', toolCallId: tool_use_id, toolName: '', argsText: '', truncated: false, result}` の孤児の part を結果の位置に出す (FR-008。O-2 の孤児の結果と同じく欠落させない)。`tool_use_id` が `isValidToolUseId` に外れたら `toolCallId: ''`
- 同じ id の 2 つ目以降の結果は孤児として出す (上書きしない。tool_use の「最初の一致」と同じ)

| 経路 | 対応づけの置き場所 |
|---|---|
| 過去ログ | `transcript.ts` の 1 回の変換の中の `server-tool-call` の id の表 (`toolCallById` と別の表。最初の一致を保持)。結果のブロックが後の記録にあっても埋める |
| 実行中 | `live-tool-results.ts` の追跡に `server-tool-call` を足す: `trackAssistant` が `result: null` の `server-tool-call` を持つ主ループのメッセージを覚え (tool_use の結果待ちと同じ上限 256)、新設の `applyServerResults(message)` が、届いた assistant のメッセージの孤児の `server-tool-call` を、覚えたメッセージの同じ id の part に埋めて **送り直すメッセージの列** と **孤児を除いた届いたメッセージ** (part が残らなければ送らない) を返す。`sdk-agent-session.ts` の `case 'assistant'` で、取り消しの判定の後・`trackAssistant` の前に呼ぶ。送り直しの `result` の合計は `RESEND_RESULT_MAX_BYTES` まで (超えたら `sources` を後ろから減らし `omitted` に足す)。取り消した根は送り直さない (`retract` と同じ) |
| 実行中の subagent の中 | 対応づけをしない (`nest` で子に入ったブロックはそのまま。結果は子の中の孤児として出る)。subagent の中のサーバー側の tool は quickstart で記録する |

### 2.4 renderer への写し (`src/renderer/src/features/chat/convert.ts`)

| DTO の part | assistant-ui の part | 規則 |
|---|---|---|
| `server-tool-call` | `tool-call` | `toolCallId`・`toolName` (空なら `labels.ts` の「サーバー側の tool」)・`argsText` はそのまま。`args` = `stripInternalKeys(parseArgs(argsText))` に信頼の印 `__serverTool: {result}` と `__truncated` を足す (argsText 由来の `__` のキーは今どおり剥がす。PR-H-1)。assistant-ui の `result` は `part.result === null ? undefined : part.result` (O-6 の `toolResultState` の「結果あり」と揃う)。`isError` は `result.kind === 'error'` |
| `unsupported-block` | `data` (名前 `unsupported-block`、`data: {blockType}`) | system ロールでは使わない (assistant / user のメッセージの中だけに現れる) |
| `file` | `file` | `filename` = `filename` が空なら `labels.ts` の「名前のない文書」、`data: ''`、`mimeType` = `mediaType` (空なら `application/octet-stream`)、`sourceType: 'id'` (ダウンロードのリンクと大きさを出さない) |

- `toToolCallPartProps` (O-11 の入れ子の描画) は `server-tool-call` も受けられるよう、`server-tool-call` を写す関数を同じく export する
- `subagent.aui.tsx` の入れ子の part の switch (`:148` の `file` の case の並び) に `server-tool-call` と `unsupported-block` を足す

### 2.5 表示

| 表示 | 置き場所 | 規則 |
|---|---|---|
| ServerToolCall (新設) | `src/renderer/src/components/assistant-ui/elements/server-tool-call.aui.tsx` | `tool-registry.aui.tsx` の振り分けで、`args.__serverTool` が record のものを `TOOL_DISPLAY` の表より先にここへ送る。見出しは `toolName` と、`web_search` なら `args.query` (文字列なら 1 行・120 コードポイントで切る)。結果の状態の印は既存の `ToolResultMarks` / `useToolResultState` (結果待ち・結果不明。US-3 AC4)。既定は畳む。結果が `web-search` → Sources の一覧 / `error` → エラーの印と「検索に失敗しました ({errorCode})」/ `unsupported` → 結果の位置に UnsupportedBlockMark |
| Sources の一覧 | ServerToolCall の中 | 項目ごとにタイトル (空なら host) と host (`webFetchHeading(url)`)。`url` が `https?://` で始まるものだけ `<a href={url} target="_blank" rel="noreferrer noopener">`、他はリンクにしない。`omitted > 0` なら「ほか N 件」。renderer は URL を取得・プレビューしない (FR-009)。新しい窓の要求は main の `setWindowOpenHandler` → `openExternalIfHttp` が開く (main の変更なし) |
| UnsupportedBlockMark (新設) | `src/renderer/src/components/assistant-ui/elements/unsupported-block-mark.tsx` | 「表示に対応していないブロック ({blockType})」、`blockType` が空なら「表示に対応していないブロック」の 1 行。`thread.aui.tsx` の AssistantMessage の `case "data"` の data renderer と、UserMessage の Parts (`:1454` 付近) に data の部品を足して描く |
| File | 既存 (`components/file.tsx` の registry の File と UserMessage の `UserFilePart`) | 名前と種類 (`mimeType` から「PDF」/「テキスト」/「文書」。文言は `labels.ts`) を出す。英語の既定 "Unnamed file" / "Download" が出ないこと (`sourceType: 'id'` と名前の補い) を component テストで固定する |

- O-9 の会話の地図の tool の数・エラーの数 (`activity-bins.ts`・`turns.ts`) は `tool-call` の part だけを数えたままにする (`server-tool-call` を数えない。範囲を広げない)。対応表の備考に書く

## 3. 対応表の B 節の機械照合 (`scripts/ui-coverage/coverage.mjs`・`scripts/constitution/check.mjs` の項目 21)

### 3.1 入力

| 名前 | パス (cwd から) | 無いとき |
|---|---|---|
| `sdkDts` (既存) | `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` | 違反 (今のまま) |
| `betaMessagesDts` (新設) | `node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.mts` | 違反 |
| `messagesDts` (新設) | `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.mts` | 違反 |
| `anthropicSdkPackage` (新設) | `node_modules/@anthropic-ai/sdk/package.json` | 違反 |

### 3.2 読み方

1. `sdkDts` の import 文から、`BetaMessage` の specifier (`@anthropic-ai/sdk/resources/beta/messages/messages.mjs`) と `MessageParam` の specifier (`@anthropic-ai/sdk/resources` または `@anthropic-ai/sdk/resources/messages/messages.mjs`) を読む。`.mjs` を `.d.mts` に替えて上のパスと一致しなければ違反 (「SDK の型の参照が変わった」)。`@anthropic-ai/sdk/resources` は `resources/messages/messages.d.mts` に読み替える (re-export の追跡はしない)
2. `sdkDts` の `SDKAssistantMessage` の `message` が `BetaMessage`、`SDKUserMessage` の `message` が `MessageParam` であることを確かめる (違えば違反)
3. `interfaceBody(text, 'BetaMessage')` のトップレベルの `content` の型が `Array<X>` であること (`MessageParam` は `string | Array<X>`) を読み、`X` を得る
4. `typeAliasBody(text, X)` の union のメンバーの名前を `unionMemberNames` で読む
5. 各メンバーの `interfaceBody` のトップレベルの `type` の string literal を読む。読めないメンバーがあれば違反
6. 識別子は `assistant/<type>` / `user/<type>`

- `interfaceBody(text, name)` を新設する: `export interface <name> {` (または `export interface <name><...> {`) の開き括弧から対応する閉じ括弧までを返す。`extends` がある interface は違反 (今の型に無い。読み方の前提が崩れたことを知らせる)
- `LOWER_BOUNDS.B = 33` (assistant 17・user 16。今の実数と同じ)

### 3.3 照合

- B 節の行の識別子の集合と 3.2 の集合を比べ、足りない行・余る行を違反にする (A / C / E と同じ出力の形。`formatFailure`)
- 対応表の冒頭の `SDK: \`@anthropic-ai/sdk\` <版>` の行 (新設。`SDK: \`@anthropic-ai/claude-agent-sdk\`` の行の次) の版と `anthropicSdkPackage` の `version` が違えば違反。行が無ければ違反
- 割当の書式の検査は今のまま (全節)
- `formatCounts` の節ごとの件数の出力に B を足す (照合済みの節として)

### 3.4 テスト

- `tests/ui-coverage/coverage.test.ts`: B の行が足りない・余る・`@anthropic-ai/sdk` の版が違う・入力 (3 つのどれか) が無い・メンバーの `type` が読めない・specifier が変わった、の 6 つの fixture で違反になり、今の node_modules の形の fixture で ok
- `tests/ui-coverage/item21.test.ts`: 一時のリポジトリの形に 3 つのファイルを足し、今のテストが通ることと、1 つを消すと違反になることを確かめる

## 4. 対応表の書き換え (`docs/ui-coverage.md`。FR-014 / FR-015)

### 4.1 冒頭と凡例

- 2 行目の `SDK:` に `SDK: \`@anthropic-ai/sdk\` 0.125.0` を足す (Agent SDK の行の次)。確認日を直す
- 凡例の「機械照合」(`:13`): 「A・B・C・E 節の行の集合は SDK の型定義の名前の集合と一致すること (B 節は Agent SDK の型が参照する `@anthropic-ai/sdk` の union。AD-060)。D・F 節と A' 小節は照合の外」に
- 「SDK を上げたときの手順」(`:31-38`): 手順 2 に「B 節は `@anthropic-ai/sdk` の版の行も書き換える (Agent SDK を上げると peer の版が変わりうる)」、手順 1 の失敗の例に B 節を足す
- B 節の冒頭の文 (`:99`): 「照合の外」を「項目 21 が照合する (AD-060。AD-044 Decision 4 の読み替え)」に

### 4.2 B 節の行 (照合の後の 33 行)

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| assistant/text | `text` | A | 実装済み: MarkdownText (両方) | 両方 | 今のまま。`citations` は読まない (Inline citation は組まない。U-5) を足す |
| assistant/thinking | `thinking` | A | 今のまま | 両方 | |
| assistant/redacted_thinking | `redacted_thinking` | B | 今のまま | 両方 | |
| assistant/tool_use | `tool_use` | A | 今のまま | 両方 | |
| assistant/server_tool_use | `server_tool_use` | B | 実装済み: ServerToolCall (両方) | 両方 | O-12。名前と入力は tool_use と同じ無害化。結果待ち・結果不明の印。地図の tool の数には入れない |
| assistant/web_search_tool_result | `web_search_tool_result` | B | 実装済み: ServerToolCall / Sources (両方) | 両方 | O-12。タイトルと host、http(s) だけをリンク。`encrypted_content` は運ばない。エラーは種類だけ |
| assistant/web_fetch_tool_result | `web_fetch_tool_result` | B | 実装済み: ServerToolCall / UnsupportedBlockMark (両方) | 両方 | O-12。結果の位置に印 (U-8) |
| assistant/advisor_tool_result | `advisor_tool_result` | B | 同上 | 両方 | 同上 |
| assistant/code_execution_tool_result | `code_execution_tool_result` | B | 同上 | 両方 | 同上 |
| assistant/bash_code_execution_tool_result | `bash_code_execution_tool_result` | B | 同上 | 両方 | 同上 |
| assistant/text_editor_code_execution_tool_result | `text_editor_code_execution_tool_result` | B | 同上 | 両方 | 同上 |
| assistant/tool_search_tool_result | `tool_search_tool_result` | B | 同上 | 両方 | 同上 |
| assistant/mcp_tool_use | `mcp_tool_use` | B | 実装済み: UnsupportedBlockMark (両方) | 両方 | O-12。種類の名前だけ (U-8)。Claude Code の MCP の tool は `tool_use` (C 節) で届く |
| assistant/mcp_tool_result | `mcp_tool_result` | B | 同上 | 両方 | 同上 |
| assistant/container_upload | `container_upload` | B | 同上 | 両方 | 同上 |
| assistant/compaction | `compaction` | B | 同上 | 両方 | 同上。圧縮の境界は A 節の `compact_boundary` で出る |
| assistant/fallback | `fallback` | B | 同上 | 両方 | 同上。拒否の fallback は A 節の `model_refusal_fallback` で出る |
| user/text | `text` | A | 今のまま | 両方 | |
| user/image | `image` | B | 今のまま | 過去ログ | |
| user/document | `document` | B | 実装済み: File (過去ログ) | 過去ログ | O-12。名前と種類 (PDF / テキスト) だけ。中身は運ばない (U-6) |
| user/search_result | `search_result` | B | 実装済み: UnsupportedBlockMark (過去ログ) | 過去ログ | O-12。種類の名前だけ |
| user/thinking | `thinking` | B | 表示不要: Claude Code の user のメッセージに現れない (過去ログに届けば UnsupportedBlockMark を出す。§2.2 の user の許可一覧) | 過去ログ | O-12。U-8 / U-11 |
| user/redacted_thinking | `redacted_thinking` | B | 同上 | 過去ログ | 同上 |
| user/tool_use | `tool_use` | B | 同上 | 過去ログ | 同上 |
| user/tool_result | `tool_result` | A | 今のまま | 両方 | |
| user/server_tool_use | `server_tool_use` | B | 同上 (表示不要) | 過去ログ | 同上 |
| user/web_search_tool_result | `web_search_tool_result` | B | 同上 | 過去ログ | 同上 |
| user/web_fetch_tool_result | `web_fetch_tool_result` | B | 同上 | 過去ログ | 同上 |
| user/code_execution_tool_result | `code_execution_tool_result` | B | 同上 | 過去ログ | 同上 |
| user/bash_code_execution_tool_result | `bash_code_execution_tool_result` | B | 同上 | 過去ログ | 同上 |
| user/text_editor_code_execution_tool_result | `text_editor_code_execution_tool_result` | B | 同上 | 過去ログ | 同上 |
| user/tool_search_tool_result | `tool_search_tool_result` | B | 同上 | 過去ログ | 同上 |
| user/container_upload | `container_upload` | B | 同上 | 過去ログ | 同上 |

「同上」は実際の表ではすべて書き下す (割当の書式の検査が行ごとに読む)。行の順は SDK の union の順に揃える (assistant 17・user 16)。

### 4.3 A 節・A' 節・E 節・F 節

下の表の `(両方)` と経路の列は、§4.4 の規則で完了の PR に確定する値の上限である (実機の記録が無ければ `(実行中)` / `実行中`)。

| 行 (今の行番号) | 書き換え |
|---|---|
| A `local_command_output` (`:58`) | `実装済み: SystemEventRow (両方)`。備考の「過去ログは伏せ字つきの system の本文 (O-6)」を、判別子が読めれば行・読めなければ本文 (U-9) に |
| A `notification` (`:74`) | `実装済み: SystemEventRow (両方)`。同じ `key` を 1 行に、`high` / `immediate` は注意と読み上げ |
| A `files_persisted` (`:75`) | `実装済み: SystemEventRow (両方)`。Checkpoints (表示だけ。巻き戻し・開く操作は無い。AD-049 Decision 6)。`file_id` は出さない |
| A `tool_use_summary` (`:76`) | `実装済み: SystemEventRow (両方)` |
| A `memory_recall` (`:77`) | `実装済み: SystemEventRow (両方)`。件数・scope・ファイル名の末尾だけ。本文と絶対パスは出さない |
| A `prompt_suggestion` (`:81`) | `表示不要: \`promptSuggestions\` を渡さない (O-12 U-1。毎ターンの追加のモデルの呼び出しを伴い、判断に要る情報は増えない)` |
| A `mirror_error` (`:82`) | `実装済み: SystemEventRow (両方)`。`key` は出さない。SessionStore を使わない今の構成では届かない見込み |
| A の拒否 2 行 (`:56` / `:57`)・`elicitation_complete` (`:79`)・`informational` (`:83`)・`conversation_reset` (`:84`) | 備考の「行は O-12」「O-12 の変換に従う」を、過去ログの変換は実装済み (`notice-rows.ts`) で、経路は §4.4 に従う旨に |
| A' `active_goal` (`:92`) | `実装済み: SystemEventRow (両方)`。`null` は解除の行 |
| E `rewind_files` (`:209`) | 割当は `表示不要` のまま。備考の O-12 を「O-12 も巻き戻さない (AD-049 Decision 6)」に |
| F Checkpoints (`:250`) | 使い道を `A files_persisted` に、備考に「registry の element は使わない。巻き戻しの操作を持つため (AD-049 Decision 6)。SystemEventRow で描く」 |
| F Document reference (`:275`) | `未使用`。備考に「届く値に位置が無い (O-12 U-6)」 |
| F File (`:282`) | 使い道に `B user/document` を足す。備考に取り込んだ element への変更 (無ければ「変更なし。`sourceType: 'id'` と名前の補いで英語の既定を出さない」) |
| F Follow-up suggestions (`:285`) | `未使用`。備考に「`promptSuggestions` を渡さない (O-12 U-1)」 |
| F Inline citation (`:293`) | `未使用`。備考に「text の `citations` を MarkdownText に差し込むと AD-034 の境界に触れる (O-12 U-5)」 |
| F Memory (`:305`) | 使い道を確かめ、`memory_recall` の行は SystemEventRow で描く旨 (registry の Memory を使わない理由を備考に) |
| F Sources (`:337`) | 使い道を `B assistant/web_search_tool_result` に。取り込むか (registry の Sources) は tasks で registry と照合して決め、取り込まないなら ServerToolCall の中の一覧が代わる旨を備考に |
| F Web search (`:363`) | 今の備考の前提 (「結果は text のまま」) が本 feature で変わるので、tasks (FE-001) の候補比較の結果で書き換える。registry の Web search を ServerToolCall (`server_tool_use` の `web_search`) に使うなら使い道に `B assistant/server_tool_use` を足し、使わないなら `未使用` のまま備考の理由を「サーバー側の検索は ServerToolCall で描く (<比較の理由>)。クライアントの `WebSearch` は今どおり `WebTool`」に直す (design-gate H-007) |

### 4.4 過去ログの経路

- 過去ログの経路の値は quickstart (`quickstart-results.md`) の記録が「残る」のときだけ「両方」に直す。未実施・「残らない」なら `実行中` のまま、割当は `実装済み: SystemEventRow (両方)` と書かず `(実行中)` にし、備考に「過去ログの変換は実装済み。実データに残るかは 022 quickstart V-x」(O-2 の Hook / task の行と同じ書き方)
- 上の §4.2 / §4.3 の `(両方)` はこの規則に従って完了の PR で確定する

## 5. 記録 (完了の PR)

| 対象 | 変更 |
|---|---|
| `docs/decisions/0060-…md` (AD-060) | 本 feature の design で proposed。accepted は main が夜間の規則で行う |
| `.specify/memory/constitution.md` | **変えない** (spec U-12)。Principle XII の Verification (Automated) を「A・B・C・E 節」に改める改定 (v1.5.0。MINOR) は、改定手順 2 の人間レビューの後に別の PR で行う。roadmap の O-12 の行に持ち越しとして書く |
| `docs/domains/session/charter.md` | Related Specs に O-12 (ui) の項を O-5 / O-6 と同じ形で足す (本 domain の feature ではない。夜間の規則で推奨案を採用した U-1〜U-13 / AD-060 で、本 domain の契約を広げた: システムイベントの行の category 7 つ (`SYSTEM_EVENT_CATEGORIES` 13 → 20)・`TRANSCRIPT_PART_FIELDS` の part 2 つ (`server-tool-call` / `unsupported-block`) と `file` の part の形 (`text` を消して `mediaType`)・agents の `system` の 5 つの subtype とトップレベルの `tool_use_summary` / `active_goal` の分岐・実行中の server-tool-call の対応づけ。`SessionEvent` の種類・`METER_UPDATE_TYPES`・`QUERY_OPTION_KEYS`・`AGENT_SDK_ALLOWED_CALLS` は変えない)。「セッションスレッドの `system` の分岐」の項 (`:165-169`) の「`TRANSCRIPT_PART_FIELDS` は変えない」を、O-6 の時点の記述として残し O-12 で広げた旨を続ける |
| `docs/domains/_overview.md` (例外の項) | `:106-126` の「O-6 は `ui` のまま、session の契約を広げる」の並びに「O-12 は `ui` のまま、session の契約を広げる」の項を足す (上の session charter の内容の要約。記録は session charter) |
| `docs/glossary.md` | 「知らせの類」(Notice row)・「知らないブロックの印」(Unsupported block mark) を足す。System event row の category の列に O-12 の 7 つ (13 → 20) と過去ログの変換を、Informational notice の Counterexamples の「過去ログの変換は O-12」を結論に、`:726` / `:730` の O-12 の項を結論に |
| `docs/roadmap.md` | O-12 の行 (`:387`) に結論 (FR-016。持ち越しの Constitution v1.5.0 の改定 (U-12) を含む)、O-8 の行 (`:381`) の (c) に「O-12 の新しい行は `message` なので `receivedMessages` に数える」(FR-017) |
| `docs/domains/ui/charter.md` | frontmatter の `related_adrs` に 0060、`related_specs` に 022。`:269` の O-12 を結論に |
| `docs/domains/_overview.md` (feature の一覧) | `:70-73` の O-12 の行を結論に。`:141` は変えない |
| `docs/prompts.md` | `:228` (Checkpoints) を結論に。`:318-324` は O-12 の起動の記録のまま |
| `eslint.config.mjs` / `.specify/spec-gate/reviewers.yml` | 新設の手書きの element (`server-tool-call.aui.tsx`・`unsupported-block-mark.tsx`) を手書きの一覧 (`eslint.config.mjs:589-611`、`reviewers.yml:54-76` / `:120-141`) に |
| `src` の注記 | `live-message.ts:77` の「O-12」を結論に |
