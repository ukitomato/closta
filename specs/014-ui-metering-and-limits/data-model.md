# Data Model: 計量と制限の表示 (O-4)

各規則の正本は本ファイルの節。spec / plan / tasks は節を参照する。SDK の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts` (`SDKResultSuccess` / `SDKResultError` :5276-5380、`SDKAssistantMessageError` :3411 と assistant の `error` :3346、`SDKRateLimitEvent` / `SDKRateLimitInfo` :5239-5274、`SDKAPIRetryMessage` :3317、`SDKStatusMessage` :5467、`SDKTaskProgressMessage` :5571、`SDKThinkingTokensMessage` :5654、`SDKToolProgressMessage` :5667、`ModelUsage` :1317)。

**読み替える先行の決定**: X-1 (005) の FR-020 / US-4 AC6 / data-model §6 は「未ログイン・認証切れ・クレジット不足・rate limit・API 到達不可を `provider-error` に保つ」と定めた (コードの注記では V-11)。本 feature はこれを §1 の表に分ける。終わり方 (失敗にする・黙って完了にしない) は変えない。読み替えの記録は AD-047。

## §1 失敗の理由のキー (`LaunchFailureReason` の拡張。**再ログインの導線の規則の正本もここ**)

`classifyResult(subtype, isError)` は変えない (完了か失敗か)。失敗のとき、`classifyResultFailure(result, lastAssistantError)` (agents の純関数。`session-core.ts`) が理由のキーを決める。`lastAssistantError` は同じターンの最後の assistant のメッセージの `error` (`SDKAssistantMessageError` の列挙。文字列を含まない) で、セッションスレッドが `run()` の closure に持ち、result で消す。

| 条件 (上から順に評価) | キー | 再ログインの導線 |
|---|---|---|
| `lastAssistantError` が `authentication_failed` / `oauth_org_not_allowed` / `verification_required` / `cloud_credential_error`、または `api_error_status` が 401 | `auth-failed` | **あり** |
| `lastAssistantError` が `billing_error` / `account_on_hold` | `billing` | なし (請求とアカウントを確かめる案内) |
| `lastAssistantError` が `rate_limit`、または `api_error_status` が 429 | `rate-limited` | なし |
| `api_error_status` が 403 | `auth-failed` (403 は組織のポリシーや地域でも返るので、文言は「認証または権限」とする) | **あり** |
| `subtype === 'error_max_turns'` | `max-turns` | なし |
| `subtype === 'error_max_budget_usd'` | `max-budget` | なし |
| `subtype === 'error_max_structured_output_retries'` | `structured-output-retries` | なし |
| `subtype === 'error_during_execution'` | `execution-error` | なし。文言に「ログイン状態も確かめる」を添える (実機の形を確かめるまで。RK-06) |
| `api_error_status` が数 (それ以外) | `api-error` | なし。文言に「ログイン状態も確かめる」を添える |
| それ以外 (状態が無い・知らない subtype・`lastAssistantError` がそれ以外) | `provider-error` (既存) | **あり** (今と同じ) |

- 再ログインの導線 (`isReloginFailure`) は `auth-failed` と `provider-error`。spec の FR-002 / SC-001 はこの表を参照する
- `errors` / `result` (文字列) は運ばない (U-5)。HTTP の状態は文言に入れない (`failure` は理由のキーだけを運び、起動ダイアログに戻ったときも同じ文言で出せるように)
- `LAUNCH_FAILURE_REASONS` は 10 → 18 (`max-turns` / `max-budget` / `structured-output-retries` / `execution-error` / `auth-failed` / `billing` / `rate-limited` / `api-error`)。固定テストを直す。`SessionLaunchRejectReason` (`LaunchFailureReason` を含む) と状態通知の `reasonKey` の値の集合も広がる (フィールドは変わらない。`isLaunchFailureReason` が追随する)

## §2 `meter` (`SessionEvent` の新しい種類)

```ts
| { readonly kind: 'meter'; readonly meter: MeterUpdate }

type MeterUpdate =
  | { readonly type: 'turn'; readonly costUsd: number; readonly numTurns: number;
      readonly models: readonly ModelMeter[]; readonly permissionDenials: number }
  | { readonly type: 'context'; readonly usedTokens: number }   // 最後の assistant のメッセージの usage
  | { readonly type: 'rate-limit'; readonly status: RateLimitStatus;
      readonly limitType: RateLimitType | null; readonly utilization: number | null;
      readonly resetsAtSec: number | null; readonly usingOverage: boolean }
  | { readonly type: 'permission-mode'; readonly mode: PermissionModeKey }
  | { readonly type: 'thinking'; readonly estimatedTokens: number }
  | { readonly type: 'tool-elapsed'; readonly toolUseId: string; readonly elapsedSeconds: number }

interface ModelMeter { modelId: string; input: number; output: number; cacheRead: number;
                       cacheCreation: number; costUsd: number; contextWindow: number }
```

### 変換の入力 (SDK のフィールドの許可リスト。**これが正本**)

| SDK のメッセージ | 読むフィールド | 読まないフィールド | 出すもの |
|---|---|---|---|
| `assistant` | `message.usage` の `input_tokens`・`cache_read_input_tokens`・`cache_creation_input_tokens`、`error` (列挙) | 本文ほか (本文は既存の `message` の経路) | `meter` `context` (1 回の API 呼び出しの入力 = その時点のコンテキストの大きさ)。`error` は §1 の分類にだけ使う |
| `result` (成功・失敗とも) | `total_cost_usd`・`num_turns`・`modelUsage` の各モデルの数と `contextWindow`・`permission_denials` の件数・`api_error_status`・`subtype`・`is_error` | `result`・`errors`・`usage` (主ループのターンの合算でコンテキストの推定に使えない)・`stop_reason`・`permission_denials` の中身・`user_message_uuid(s)`・`resume_reason`・`terminal_reason`・タイミングの数・`origin` ほか | `meter` `turn` + §1 |
| `rate_limit_event` | `rate_limit_info` の `status`・`rateLimitType`・`utilization`・`resetsAt`・`isUsingOverage` | `overageDisabledReason`・`limitScope`・`errorCode`・購入の可否ほか | `meter` `rate-limit` |
| `system` / `status` | `permissionMode`・`status` (`compacting` か)・`compact_result` | `compact_error` | `meter` `permission-mode` (変わったとき) + §3 の行 |
| `system` / `api_retry` | `attempt`・`max_retries`・`retry_delay_ms`・`error_status` | `error`・`no_response` | §3 の行 |
| `system` / `thinking_tokens` | `estimated_tokens` | `user_message_uuid` | `meter` `thinking` (間引く) |
| `tool_progress` | `tool_use_id`・`elapsed_time_seconds` | `tool_name`・`subagent_*`・`task_id` | `meter` `tool-elapsed` (間引く) |
| `system` / `task_progress` | `task_id`・`usage` の 3 つの数 | `description`・`summary`・`last_tool_name`・`subagent_type` | §3 の task の行の更新 (`opens: false`。状態を持たない) |

### 値の検証 (agents の変換と renderer の decoder で同じ定数。domain の `meter.ts`)

| 値 | 規則 | 外れたとき |
|---|---|---|
| 数 (トークン・回数・秒・ms) | `Number.isSafeInteger(n) && n >= 0` | 0 |
| 費用 | `Number.isFinite(x) && 0 <= x <= 1e6` | 0 |
| `utilization` | `Number.isFinite(x)`。SDK の値域を実データで確かめるまで、0〜1 なら百分率に直し、1〜100 ならそのまま、それ以外は null (RK-07) | null |
| `resetsAtSec` | epoch 秒。`Number.isFinite(x) && 1e9 <= x <= 1e11` (ms で届いたら 1000 で割って同じ範囲に入るか確かめる) | null |
| `contextWindow` | `Number.isSafeInteger(n) && 0 < n <= 1e8` | 0 (目盛りを出さない) |
| `toolUseId` | `^[A-Za-z0-9_-]{1,128}$` | `meter` を出さない |
| `modelId` | `^[A-Za-z0-9._:@/-]{1,128}$` かつ `//` を含まず、`mayCarrySecret` (O-2 の `system-event.ts`) が false | その行を内訳から落とす |
| `models` の件数 | 16 まで | 17 件目以降を落とす |
| 列挙 (`type`・`status`・`limitType`・`mode`・`lastAssistantError`) | `transcript-guard.ts` の `enumTable` / `inEnum` の方式 (`Object.create(null)` と `Object.hasOwn`) | 知らない値は null / `unknown` |

- 文言の表も `Object.hasOwn` で引く。id をキーにする保持は `Map` に限る
- `PermissionModeKey`: SDK の `PermissionMode` の値の列挙 (6 値) と `unknown`。**昇格値のリテラルは domain の `meter.ts` だけに置き**、agents は `message.permissionMode` を domain の関数に渡すだけにする (Constitution 検証の項目 16 に例外を足さない)。`sdk-agent-session.ts` で `Equal<…>` (既存の :80-84 の型) により `PermissionModeKey` (`unknown` を除く)・`RateLimitType`・`RateLimitStatus`・`SDKAssistantMessageError` の値域を SDK の型と固定する

### 間引きと後始末 (`meter-throttle.ts`。セッションスレッドの `run()` の closure に 1 つ)

- `thinking` は 1 秒に 1 回、`tool-elapsed` は tool ごとに 1 秒に 1 回、task の行の更新 (task_progress) は task ごとに 1 秒に 1 回。間引いた最後の値は次の 1 秒の境で送る
- セッションあたりの `meter` と間引きの対象の行の合計は 1 秒に 20 件まで (超えた分は捨てる。最新の値は次の境で送る)
- 同時に追う tool / task は 64 まで
- 取り消し: tool の結果 (`user` の tool_result) → その tool の保留を捨てる。assistant のメッセージ → `thinking` の保留を捨てる。`finish()` → 全部の保留と timer を捨ててから `ended` を送る (`ended` の後に `event` を送らない)

### 連番と比較の基準 (`run()` の closure)

- 行の id の連番 (`retry` / `compact` / `mode`) と権限モードの比較の基準は `run()` の closure に持つ (module スコープに置かない)。基準の初期値は起動の設定の権限モード (`launchOptions.permissionMode`)。domain の関数は連番と基準を引数で受ける純関数
- `api-retry` の連番は result で増やす (同じターンの再試行は同じ行)

### renderer の保持 (稼働中のストアの `meters`。永続化しない。session の操作 UI の変更。U-1)

| 値 | 更新 |
|---|---|
| `lastTurn` | `turn` の最新。ただし `costUsd === 0` かつ `numTurns === 0` (起動時のエラーの result) は前の値を上書きしない |
| `contextUsed` | `context` の最新 |
| `rateLimit` | `rate-limit` の最新 |
| `permissionMode` | `permission-mode` の最新。**`config` / `lastConfig` / プリセットに書き戻さない** |
| `thinkingTokens` | `thinking` の最新。assistant のメッセージが届いたら消す |
| `toolElapsed` | `Map<toolUseId, seconds>`。tool の結果が届いたら消す |

- `close()` の削除の列挙に `meters` を足す。閉じた id への `meter` は捨てる (`sessions[id]` が無いときは捨てる、を保つ)
- `meter` は観測点 `receivedMessages` (O-1) に数えない。§3 の行は `message` なので数える (O-3 → O-8 の比較の基準の変化として roadmap に注記する)

## §3 システムイベントの行の追加 (O-2 の `system-event` の category)

`category` に 3 つを足し、task の行の `detail` に進み具合を足す。part の形 (`type` / `category` / `opens` / `name` / `detail` / `status`) は変えない (`TRANSCRIPT_PART_FIELDS` は変わらない)。**行の組み立ては agents (`sdk-agent-session.ts` か新設の `live-system-rows.ts`) に置き、過去ログと共有の `toSystemEventMessage` には足さない** (経路は実行中だけ。`transcript.ts` が `status` / `api_retry` / `task_progress` から行を作らないことを回帰テストで固定する)。

| category | 行の id | 作る (opens) | `detail` | `status` |
|---|---|---|---|---|
| `api-retry` | `retry:<連番>` | `api_retry` | `<attempt>/<max_retries>`、`error_status` が整数なら ` HTTP <n>`、` <retry_delay_ms>ms` (整数だけで組む) | `retrying` → 次の assistant のメッセージか result で `succeeded` (result が失敗なら `failed`) |
| `compaction` | `compact:<連番>` | `status` が `compacting` | '' | `compacting` → `compact_result` の `succeeded` / `failed` |
| `permission-mode` | `mode:<連番>` | `permissionMode` が基準と変わった | モードのキー | `changed` |
| `task` (既存) の更新 | `task:<task_id>` (既存) | false (`task_progress`。行の無い task は `mergeSystemEvent` が捨てる) | `<total_tokens> tokens / <tool_uses> tools / <duration_ms>ms` (整数だけ) | null (前の値を保つ) |

- `name` は常に ''。会話由来の文字列を入れない
- `SystemEventStatus` に `retrying` / `compacting` / `changed` を足す。終わりを表す値 (`isTerminalSystemEventStatus`。`system-event.ts:193`) に `changed` を足す (`succeeded` / `failed` は既存)。`retrying` / `compacting` のまま終わった行は O-2 の「結果不明」の規則に従う
- 合成は O-2 の `mergeSystemEvent` のまま
- **O-6 との関係**: O-4 の `compaction` の行は「圧縮の進み具合 (中・成功・失敗)」、O-6 の `compact_boundary` の element は「会話の区切り」。O-6 は実行中の境界の element を足すときに、この行と統合するか並べるかを決める (roadmap の O-6 の行に書く)

## §4 表示

### Quota banner (中央のヘッダの下)

| `rateLimit.status` | 見た目 | 文言 |
|---|---|---|
| `allowed` / 無い | 出さない | — |
| `allowed_warning` | 注意 (`role="status"`) | {種類}の利用が {utilization}% に達しました。{resetsAt} にリセットされます |
| `rejected` | 警告 (`role="alert"`) | {種類}の上限に達しました。{resetsAt} まで待ってください |

- `limitType` の文言: `five_hour` → 5 時間、`seven_day` → 7 日、`seven_day_opus` → 7 日 (Opus)、`seven_day_sonnet` → 7 日 (Sonnet)、`seven_day_overage_included` → 7 日 (超過分を含む)、`overage` → 超過分、知らない値 → 利用枠
- `resetsAt` の書式: 今日なら `HH:mm`、別の日なら `M/d HH:mm` (ローカル)。`new Date(sec * 1000)` が Invalid Date (`Number.isNaN(getTime())`) なら「しばらく待ってから」。`utilization` が無い → 割合を出さない。`usingOverage` → 「超過分を使っています」を添える
- 帯はセッションごと (アカウントの制限を他のセッションに出さない。届いた event はそのセッションのもので、他のセッションに当てはまるかを renderer は知らない)

### 権限モード

- 「概要」のタブ (O-7 data-model §5) の権限モードの出所を `meters[id].permissionMode ?? config.permissionMode` にする。中央のヘッダには常設しない (O-7 §5 の「中央のヘッダと重ねない」を保つ)
- 今のモードが安全 3 値 (`isSafePermissionMode`。`launch-config.ts`) の外のとき、中央のヘッダの下に警告の帯 (`role="alert"`) を出す: 「アプリが選んでいない権限モード ({モード名}) で動いています。承認なしで操作が走ることがあります。」(原因を断定しない)。判定の関数は domain (`launch-config.ts` の `isSafePermissionMode`) を使い、ui は見た目だけを持つ。ランタイムの `autoModeAllowed` が false / 判定中なら文言に「このランタイムには隔離がありません」を足す (U-6)
- 強制 (中断・失敗にする) はしない (U-6)。持ち主は I-3 (権限モードのゲート。roadmap の I-3 の行に注記する)

### 使用量のタブ (右のペイン。O-7 のタブの表に `usage` を 1 行。`availableFor: ['running', 'past', 'none']`)

| 項目 | 導出 |
|---|---|
| このセッションの費用の累計 (推定) | `lastTurn.costUsd` を USD で小数 4 桁。「推定。請求額ではありません。再開・/clear で 0 から数え直します」を添える |
| このセッションのトークンの累計 | `lastTurn.models` の合計の入力 / 出力 / キャッシュの読み込み / キャッシュの作成 |
| ターン数 | `lastTurn.numTurns` |
| モデルごとの内訳 | `models` の各行 (モデルの id・トークン・費用) |
| 聞かれずに拒否された操作 | `lastTurn.permissionDenials` の件数 (中身は X-1 の DeniedNotice に出ている) |

- 過去 → 「実行中のセッションだけ」、未選択 → O-7 の空の状態、`lastTurn` が無い → 「最初の応答の後に出ます」

### コンテキストと費用の目盛り (中央のヘッダ)

- 主モデル: 起動の設定のモデル id に一致する `models` の行。無ければ出力トークンの最も多い行
- `ratio = contextUsed / main.contextWindow`。`contextWindow` が 0 → 出さない。`ratio >= 0.8` → 注意の見た目。`ratio > 1` → 「100% 以上」と出す (数を出さない)
- 表示: 「コンテキスト 約 {ratio}%」と「費用 約 ${costUsd}」を並べる (右のペインを畳んでいても費用が見える)。`aria-label` に「推定」を含める

### 進み具合

- tool の経過時間: tool の表示の見出しに「{n} 秒」(`toolElapsed`)
- 思考: Reasoning の見出しに「思考中 約 {n} トークン」(`thinkingTokens`)
- task の行: O-2 の行の `detail` の進み具合を文言に組む

## §5 新しい文言 (正本。`labels.ts`)

| 置き場 | キー | 文言 |
|---|---|---|
| session | `max-turns` | ターン数の上限に達したため止まりました。 |
| session | `max-budget` | 費用の上限に達したため止まりました。 |
| session | `structured-output-retries` | 構造化出力の再試行の上限に達したため止まりました。 |
| session | `execution-error` | 実行中にエラーが起きました。ログイン状態を確かめてから、起動し直してください。 |
| session | `auth-failed` | 認証または権限のエラーです。ログイン状態や API キー、組織の設定を確かめてください。 |
| session | `billing` | 請求またはアカウントの問題で止まりました。クレジットとアカウントの状態を確かめてください。 |
| session | `rate-limited` | レート制限のため止まりました。しばらく待ってから起動し直してください。 |
| session | `api-error` | API がエラーを返しました。ログイン状態を確かめ、しばらく待ってから起動し直してください。 |
| session | 短い理由 | ターン上限 / 費用上限 / 出力再試行上限 / 実行エラー / 認証エラー / 請求エラー / レート制限 / API エラー |
| chat | システムイベントの行 | API を再試行中 ({detail}) / 再試行しました / 再試行に失敗しました / コンテキストを圧縮中 / 圧縮しました / 圧縮に失敗しました / 権限モードが {mode} に変わりました |
| chat | 権限モードの名前 | `default` 既定 / `plan` 計画 / `dontAsk` 聞かずに拒否 / `acceptEdits` 編集を自動で許可 / `bypassPermissions` すべて許可 / `auto` 自動 / `unknown` 不明なモード |
| shell | `usageTab` | 使用量 |
| shell | `usageEstimateNote` | 推定。請求額ではありません。再開・/clear で 0 から数え直します |
| shell | `usageLiveOnly` | 実行中のセッションだけ出ます。 |
| shell | `usageAwaitFirst` | 最初の応答の後に出ます。 |
| shell | `contextMeter` / `contextOver` | コンテキスト 約 {n}% / コンテキスト 100% 以上 |
| shell | `costMeter` | 費用 約 ${n} |
| shell | `unsafeModeBanner` | アプリが選んでいない権限モード ({mode}) で動いています。承認なしで操作が走ることがあります。 |
| shell | `unsafeModeNoIsolation` | このランタイムには隔離がありません。 |
| chat | `thinkingTokens` | 思考中 約 {n} トークン |
| chat | `toolElapsed` | {n} 秒 |
