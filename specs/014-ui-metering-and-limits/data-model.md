# Data Model: 計量と制限の表示 (O-4)

各規則の正本は本ファイルの節。spec / plan / tasks は節を参照する。SDK の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts` (`SDKResultSuccess` / `SDKResultError` :5276-5380、`SDKRateLimitEvent` / `SDKRateLimitInfo` :5239-5274、`SDKAPIRetryMessage` :3317、`SDKStatusMessage` :5467、`SDKTaskProgressMessage` :5571、`SDKThinkingTokensMessage` :5654、`SDKToolProgressMessage` :5667、`ModelUsage` :1317)。

## §1 失敗の理由のキー (`LaunchFailureReason` の拡張)

`classifyResult(subtype, isError)` は変えない (完了か失敗か。X-1 FR-030)。失敗のとき、`classifyResultFailure(result)` (agents の純関数。`session-core.ts`) が理由のキーを決める。

| 条件 (上から順に評価) | キー | 全文 (renderer) の要旨 | 再ログインの導線 |
|---|---|---|---|
| `subtype === 'error_max_turns'` | `max-turns` | ターン数の上限に達した | なし |
| `subtype === 'error_max_budget_usd'` | `max-budget` | 費用の上限に達した | なし |
| `subtype === 'error_max_structured_output_retries'` | `structured-output-retries` | 構造化出力の再試行の上限 | なし |
| `subtype === 'error_during_execution'` | `execution-error` | 実行中にエラー。起動し直すか、Claude Code のログを確かめる | なし |
| `api_error_status` が 401 / 403 | `auth-failed` | 認証に失敗した。ログイン状態・API キーを確かめる | **あり** |
| `api_error_status` が 429 | `rate-limited` | レート制限。解除の時刻まで待つ (Quota banner を見る) | なし |
| `api_error_status` が数 (それ以外) | `api-error` | API がエラーを返した (HTTP の状態を添える) | なし |
| それ以外 (知らない subtype・状態が無い) | `provider-error` (既存) | 今の文言 (Provider の認証/接続) | **あり** (今と同じ) |

- `api_error_status` は `SDKResultSuccess` にだけある (`is_error: true` の API エラー)。HTTP の状態は数だけを `meter` の `lastApiErrorStatus` で運ぶ (文言に添える)
- `errors` / `result` (文字列) は運ばない
- `LAUNCH_FAILURE_REASONS` は 10 → 17。固定テスト (`agent-session.test.ts` の 10 件) を直す。`isReloginFailure` は `auth-failed` と `provider-error`

## §2 `meter` (`SessionEvent` の新しい種類)

```ts
| { readonly kind: 'meter'; readonly meter: MeterUpdate }

type MeterUpdate =
  | { readonly type: 'turn'; readonly costUsd: number; readonly numTurns: number;
      readonly usage: TokenUsage; readonly models: readonly ModelMeter[];
      readonly permissionDenials: number; readonly lastApiErrorStatus: number | null }
  | { readonly type: 'rate-limit'; readonly status: 'allowed' | 'allowed_warning' | 'rejected';
      readonly limitType: RateLimitType | null; readonly utilization: number | null;
      readonly resetsAt: number | null; readonly usingOverage: boolean }
  | { readonly type: 'permission-mode'; readonly mode: PermissionModeKey }
  | { readonly type: 'thinking'; readonly estimatedTokens: number }
  | { readonly type: 'tool-elapsed'; readonly toolUseId: string; readonly elapsedSeconds: number }
  | { readonly type: 'task-progress'; readonly taskId: string; readonly totalTokens: number;
      readonly toolUses: number; readonly durationMs: number }

interface TokenUsage { input: number; output: number; cacheRead: number; cacheCreation: number }
interface ModelMeter { modelId: string; input: number; output: number; cacheRead: number;
                       cacheCreation: number; costUsd: number; contextWindow: number }
```

### 変換の入力 (SDK のフィールドの許可リスト。**これが正本**)

| SDK のメッセージ | 読むフィールド | 読まないフィールド | 出すもの |
|---|---|---|---|
| `result` (成功・失敗とも) | `total_cost_usd`・`num_turns`・`usage` の 4 つの数・`modelUsage` の各モデルの数と `contextWindow`・`permission_denials` の件数・`api_error_status` | `result`・`errors`・`stop_reason`・`permission_denials` の中身・`user_message_uuid(s)`・`resume_reason`・`terminal_reason`・タイミングの数・`origin` ほか | `meter` `turn` |
| `rate_limit_event` | `rate_limit_info` の `status`・`rateLimitType`・`utilization`・`resetsAt`・`isUsingOverage` | `overageDisabledReason`・`limitScope`・`errorCode`・購入の可否ほか | `meter` `rate-limit` |
| `system` / `status` | `permissionMode`・`status` (`compacting` か)・`compact_result` | `compact_error` | `meter` `permission-mode` (変わったとき) + §3 の行 |
| `system` / `api_retry` | `attempt`・`max_retries`・`retry_delay_ms`・`error_status` | `error`・`no_response` | §3 の行 |
| `system` / `thinking_tokens` | `estimated_tokens` | `user_message_uuid` | `meter` `thinking` (間引く) |
| `tool_progress` | `tool_use_id`・`elapsed_time_seconds` | `tool_name`・`subagent_*`・`task_id` | `meter` `tool-elapsed` (間引く) |
| `system` / `task_progress` | `task_id`・`usage` の 3 つの数 | `description`・`summary`・`last_tool_name`・`subagent_type` | `meter` `task-progress` (O-2 の行がある task だけ) |

- 数は `Number.isFinite` で 0 以上のものだけ (外れたら 0 か null)。`modelId` は `modelUsage` のキーで、英数・`-` `.` `_` `:` `/` `@` だけの 128 文字以内に限る (外れたモデルは内訳から落とす)
- `PermissionModeKey`: SDK の `PermissionMode` の値の列挙。知らない値は `unknown`
- 間引き: `thinking` は 1 秒に 1 回、`tool-elapsed` は tool ごとに 1 秒に 1 回。間引いた最後の値は次の 1 秒の境で送る (止まった後の値を落とさない)
- 状態通知 (`SessionStatusUpdate`) には載せない。port の `SessionEvent` だけ

### renderer の検証

`isMeterUpdate` (decoder)。`type` の列挙は `Object.hasOwn`、数は `Number.isFinite`、文字列 (`modelId` / `toolUseId` / `taskId`) は長さと文字の種類。外れたものは落とす。

### renderer の保持 (稼働中のストア。永続化しない)

| 値 | 更新 |
|---|---|
| `lastTurn` | `turn` の最新。ただし `costUsd === 0` かつ `numTurns === 0` は前の値を上書きしない |
| `rateLimit` | `rate-limit` の最新 |
| `permissionMode` | `permission-mode` の最新 (無ければ起動の設定の権限モード) |
| `thinkingTokens` | `thinking` の最新。assistant のメッセージが届いたら消す |
| `toolElapsed` | `toolUseId` ごとの最新。tool の結果が届いたら消す |
| `taskProgress` | `taskId` ごとの最新 |

## §3 システムイベントの行の追加 (O-2 の `system-event` の category)

`category` に 3 つを足す。part の形 (`type` / `category` / `opens` / `name` / `detail` / `status`) は変えない (`TRANSCRIPT_PART_FIELDS` は変わらない)。

| category | 行の id | 作る (opens) | `detail` | `status` |
|---|---|---|---|---|
| `api-retry` | `retry:<turn の連番>` (同じターンの再試行は同じ行) | `api_retry` | `<attempt>/<max_retries> HTTP <error_status> <retry_delay_ms>ms` (数だけで組む) | `retrying` |
| `compaction` | `compact:<連番>` | `status` が `compacting` | '' | `compacting` → `compact_result` の `succeeded` / `failed` |
| `permission-mode` | `mode:<連番>` | `permissionMode` が前と変わった | モードのキー | `changed` |

- `name` は常に ''。会話由来の文字列を入れない
- `SystemEventStatus` に `retrying` / `compacting` / `succeeded` (既存) / `failed` (既存) / `changed` を足す。終わりを表す値は `succeeded` / `failed` / `changed`。`retrying` / `compacting` のまま終わった行は O-2 の「結果不明」の規則に従う
- 合成は O-2 の `mergeSystemEvent` のまま

## §4 表示

### Quota banner (中央のヘッダの下)

| `rateLimit.status` | 見た目 | 文言 |
|---|---|---|
| `allowed` / 無い | 出さない | — |
| `allowed_warning` | 注意 | {種類} の利用が {utilization}% に達しました。{resetsAt} にリセットされます |
| `rejected` | 警告 | {種類} の上限に達しました。{resetsAt} まで待ってください |

- `limitType` の文言: `five_hour` → 5 時間、`seven_day` → 7 日、`seven_day_opus` → 7 日 (Opus)、`seven_day_sonnet` → 7 日 (Sonnet)、`overage` → 超過分、その他 → 利用枠
- `resetsAt` が無い → 「しばらく待ってから」。`utilization` が無い → 割合を出さない。`usingOverage` → 「超過分を使っています」を添える
- 帯は `role="status"` (rejected は `role="alert"`)

### 使用量のタブ (右のペイン。O-7 のタブの表に `usage` を 1 行。`availableFor: ['running', 'past', 'none']`)

| 項目 | 導出 |
|---|---|
| 費用 (推定) | `lastTurn.costUsd` を USD で小数 4 桁。「推定。請求額ではありません」を添える |
| トークン | `lastTurn.models` の合計の入力 / 出力 / キャッシュの読み込み / キャッシュの作成 |
| ターン数 | `lastTurn.numTurns` |
| モデルごとの内訳 | `models` の各行 (モデルの id・トークン・費用) |
| 聞かれずに拒否された操作 | `lastTurn.permissionDenials` の件数 (中身は X-1 の DeniedNotice に出ている) |

- 過去 → 「実行中のセッションだけ」、未選択 → O-7 の空の状態、`lastTurn` が無い → 「最初の応答の後に出ます」

### コンテキストの目盛り (中央のヘッダ)

- 主モデル: 起動の設定のモデル id に一致する `models` の行。無ければ出力トークンの最も多い行
- `used = usage.input + usage.cacheRead + usage.cacheCreation` (最後のターンの主ループの値。`lastTurn.usage`)、`ratio = used / main.contextWindow`
- `contextWindow` が 0 か無い → 出さない。`ratio >= 0.8` → 注意の見た目
- 表示: 「コンテキスト 約 {ratio}%」。`aria-label` に「推定」を含める

### 進み具合

- tool の経過時間: tool の表示の見出しに「{n} 秒」(`toolElapsed`)
- 思考: Reasoning の見出しに「思考中 約 {n} トークン」(`thinkingTokens`)
- task の行: O-2 の行に「{totalTokens} トークン・tool {toolUses} 回・{duration}」
- 権限モード: 中央のヘッダと「概要」のタブ (O-7 data-model §5) は `permissionMode` を出す。安全 3 値 (`default` / `plan` / `dontAsk`) の外は「{モード名} (アプリの外で変更)」で注意の見た目

## §5 新しい文言 (正本。`labels.ts`)

| 置き場 | キー | 文言 |
|---|---|---|
| session | 失敗の全文 `max-turns` | ターン数の上限に達したため止まりました。 |
| session | `max-budget` | 費用の上限に達したため止まりました。 |
| session | `structured-output-retries` | 構造化出力の再試行の上限に達したため止まりました。 |
| session | `execution-error` | 実行中にエラーが起きました。起動し直すか、Claude Code のログを確かめてください。 |
| session | `auth-failed` | 認証に失敗しました。ログイン状態や API キーを確かめてください。 |
| session | `rate-limited` | レート制限のため止まりました。解除の時刻まで待ってから起動し直してください。 |
| session | `api-error` | API がエラーを返しました (HTTP {status})。しばらく待ってから起動し直してください。 |
| session | 短い理由 | ターン上限 / 費用上限 / 出力再試行上限 / 実行エラー / 認証失敗 / レート制限 / API エラー |
| chat | システムイベントの行 | API を再試行中 ({detail}) / コンテキストを圧縮中 / 圧縮しました / 圧縮に失敗しました / 権限モードが {mode} に変わりました |
| shell | `usageTab` | 使用量 |
| shell | `usageEstimateNote` | 推定。請求額ではありません |
| shell | `usageLiveOnly` | 実行中のセッションだけ出ます。 |
| shell | `usageAwaitFirst` | 最初の応答の後に出ます。 |
| shell | `contextMeter` | コンテキスト 約 {n}% |
| chat | `thinkingTokens` | 思考中 約 {n} トークン |
| chat | `toolElapsed` | {n} 秒 |
| chat | `taskProgress` | {tokens} トークン・tool {uses} 回・{duration} |
