# Data Model: 計量と制限の表示 (O-4)

各規則の正本は本ファイルの節。spec / plan / tasks は節を参照する。SDK の型の行番号は research R-02。2026-10-04 の版を O-7・O-3 の後の main に合わせて作り直した。

**読み替える先行の決定**: X-1 (005) の FR-020 / US-4 AC6 / data-model §6 は「未ログイン・認証切れ・クレジット不足・rate limit・API 到達不可を `provider-error` に保つ」と定めた (コードの注記では V-11。注記の「FR-030」は 005 に無く、FR-020 の誤り)。本 feature はこれを §1 の表に分ける。終わり方 (失敗にする・黙って完了にしない) は変えない。読み替えの記録は AD-047。

## §1 失敗の理由のキー (`LaunchFailureReason` の拡張。**再ログインの導線の規則の正本もここ**)

`classifyResult(subtype, isError)` は変えない (完了か失敗か)。失敗のとき、`classifyResultFailure(input)` (agents の純関数。`session-core.ts`) が理由のキーを決める。入力は `{ subtype, apiErrorStatus, lastAssistantError }` で、`lastAssistantError` は同じターンの**主ループの** assistant のメッセージ (`parent_tool_use_id === null`) の最後の `error` (`AssistantErrorKey`。13 値の列挙。文字列を含まない)。セッションスレッドの `live-signals` が覚え、result で消す。

| 条件 (上から順に評価) | キー | 再ログインの導線 |
|---|---|---|
| `lastAssistantError` が `authentication_failed` / `oauth_org_not_allowed` / `verification_required` / `cloud_credential_error`、または `apiErrorStatus` が 401 | `auth-failed` | **あり** |
| `lastAssistantError` が `billing_error` / `account_on_hold` | `billing` | なし (請求とアカウントを確かめる案内) |
| `lastAssistantError` が `rate_limit`、または `apiErrorStatus` が 429 | `rate-limited` | なし |
| `apiErrorStatus` が 403 | `auth-failed` (403 は組織のポリシーや地域でも返るので、文言は「認証または権限」) | **あり** |
| `subtype === 'error_max_turns'` | `max-turns` | なし |
| `subtype === 'error_max_budget_usd'` | `max-budget` | なし |
| `subtype === 'error_max_structured_output_retries'` | `structured-output-retries` | なし |
| `subtype === 'error_during_execution'` | `execution-error` | なし。文言に「ログイン状態も確かめる」を添える (実機の形を確かめるまで。plan RK-06) |
| `apiErrorStatus` が 0〜999 の整数 (それ以外) | `api-error` | なし。文言に「ログイン状態も確かめる」を添える |
| それ以外 (状態が無い・知らない subtype・`lastAssistantError` がそれ以外) | `provider-error` (既存) | **あり** (今と同じ) |

- 再ログインの導線 (`isReloginFailure`) は `auth-failed` と `provider-error`。spec の FR-002 / SC-001 はこの表を参照する
- 表の条件は SDK の型から組んだもので、認証切れ・課金のエラーが実機でどの形で届くかは誰も観察していない (plan RK-06)。quickstart V-4 #1 の手順 (アプリの外の CLI で、数と列挙だけを控える) で確かめ、違えばこの表を直す (tasks SH-014)
- `errors` / `result` (文字列) は運ばない (U-5)。HTTP の状態は文言に入れない (`failure` は理由のキーだけを運び、起動ダイアログに戻ったとき (`previousFailureLabel`) も同じ文言で出す)
- `LAUNCH_FAILURE_REASONS` は 10 → 18 (`max-turns` / `max-budget` / `structured-output-retries` / `execution-error` / `auth-failed` / `billing` / `rate-limited` / `api-error`)。`SessionLaunchRejectReason` は 16 → 24 (コメントの件数も直す)。状態通知の `reasonKey` の値の集合も広がる (フィールドは変わらない。`isLaunchFailureReason` が追随し、main のコードの差分は 0)

## §2 `meter` (`SessionEvent` の新しい種類)

### 形 (domain `src/domain/session/meter.ts`。SDK を import しない)

```ts
| { readonly kind: 'meter'; readonly meter: MeterUpdate }       // SessionEvent に足す (SESSION_EVENT_KINDS 7 → 8)

type MeterUpdate =
  | { readonly type: 'turn'; readonly costUsd: number; readonly turns: number;
      readonly models: readonly ModelMeter[]; readonly permissionDenials: number }
  | { readonly type: 'context'; readonly usedTokens: number }
  | { readonly type: 'rate-limit'; readonly status: RateLimitStatus; readonly limitType: RateLimitType | null;
      readonly utilizationPct: number | null; readonly resetsAtSec: number | null; readonly usingOverage: boolean }
  | { readonly type: 'permission-mode'; readonly mode: PermissionModeKey }
  | { readonly type: 'thinking'; readonly estimatedTokens: number }
  | { readonly type: 'tool-elapsed'; readonly toolUseId: string; readonly elapsedSeconds: number }

interface ModelMeter { readonly modelId: string; readonly input: number; readonly output: number;
  readonly cacheRead: number; readonly cacheCreation: number; readonly costUsd: number; readonly contextWindow: number }

type PermissionModeKey = SDK の PermissionMode の 6 値 | 'unknown'
type RateLimitStatus = 'allowed' | 'allowed_warning' | 'rejected'
type RateLimitType = SDK の rateLimitType の 6 値
type AssistantErrorKey = SDK の SDKAssistantMessageError の 13 値
```

- 運ぶ値は数・真偽・列挙・モデルの id と、形を検証した tool の id (`tool-elapsed` の `toolUseId`。規則は下の「値の検証」) だけ。AD-047 Decision 2 の字面 (数・真偽・列挙・モデルの id) は、tool の id を含むと AD-047 の訂正節で直す (plan の ADR 節 #2)
- `type` で判別する union にし、decoder は知らない `type` を捨てる (後続 feature が種類を足せる形。O-6 の旧版の design は `retraction` を足す前提だった)
- `sdk-agent-session.ts` の `Equal<…>` (`:80-84` の型) で `PermissionModeKey` (`unknown` を除く)・`RateLimitStatus`・`RateLimitType`・`AssistantErrorKey`・失敗の subtype の値域を SDK の型と固定する。SDK を上げて値域が変わったら tsc が落ちる
- **昇格値の綴り (`bypassPermissions` / `acceptEdits` / `auto`) を `src/agents/` に置かない** (Constitution 検証の項目 16 の走査範囲)。値域は domain の `meter.ts`、表示名は renderer の文言の表 (§5)。agents は `message.permissionMode` を domain の `toPermissionModeKey` に渡すだけ

### 変換の入力 (SDK のフィールドの許可リスト。**これが正本**)

| SDK のメッセージ | 読むフィールド | 読まないフィールド | 出すもの |
|---|---|---|---|
| `assistant` (`parent_tool_use_id === null` のときだけ) | `message.usage` の `input_tokens`・`cache_read_input_tokens`・`cache_creation_input_tokens`、`error` (列挙) | 本文 (既存の `message` の経路)・`usage` の出力側・他のすべて | `context` (3 つの和。前に送った値と同じなら送らない)。`error` は §1 の分類にだけ使う |
| `result` (成功・失敗とも) | `total_cost_usd`・`num_turns` (0 に倒した result の判定にだけ)・`modelUsage` の各モデルの 4 つのトークン数と `costUSD` と `contextWindow`・`permission_denials` の各要素の `tool_use_id`・`api_error_status`・`subtype`・`is_error` | `result`・`errors`・`usage`・`stop_reason`・`permission_denials` の `tool_name` / `tool_input`・`user_message_uuid(s)`・`resume_reason`・`terminal_reason`・タイミングの数・`origin`・`modelUsage` の他のフィールド ほか | `turn` + §1 + §3 (再試行の行を閉じる) |
| `rate_limit_event` | `rate_limit_info` の `status`・`rateLimitType`・`utilization`・`resetsAt`・`isUsingOverage` | `overage*`・`limitScope`・`errorCode`・購入の可否・`surpassedThreshold` ほか | `rate-limit` |
| `system` / `init` (各ターンの最初に届き、`permissionMode` は必須。research R-02) | `permissionMode` だけ | `cwd`・`tools`・`mcp_servers`・`model`・`slash_commands`・`terminal_slash_commands`・`plugins` (`path` を含む)・`agents`・`skills`・`apiKeySource`・`betas`・`claude_code_version`・`output_style`・`effort`・`fast_mode_*`・`capabilities` ほか全部 (パスと会話の構成を運ばない) | `permissionMode` が基準と変わったら `permission-mode` と §3 の行 (`status` と同じ比較) |
| `system` / `status` | `status` (`compacting` か)・`compact_result`・`permissionMode` | `compact_error` | §3 の行。`permissionMode` が基準と変わったら `permission-mode` |
| `system` / `api_retry` | `attempt`・`max_retries`・`retry_delay_ms`・`error_status` | `error`・`no_response` | §3 の行 |
| `system` / `thinking_tokens` | `estimated_tokens` | `estimated_tokens_delta`・`user_message_uuid` | `thinking` (間引く) |
| `tool_progress` (`parent_tool_use_id === null` のときだけ) | `tool_use_id`・`elapsed_time_seconds` | `tool_name`・`heartbeat`・`subagent_*`・`task_id` | `tool-elapsed` (間引く) |
| `system` / `task_progress` | `task_id`・`usage` の 3 つの数 | `description`・`summary`・`last_tool_name`・`subagent_type`・`tool_use_id` | §3 の task の行の更新 (間引く) |
| `user` | `tool_result` ブロックの `tool_use_id` だけ (既存の `readToolResult`) | 本文 | 取り消し (下記) |

### 値の検証 (agents の組み立てと renderer の decoder で同じ関数・同じ定数。domain の `meter.ts`)

| 値 | 規則 | 外れたとき |
|---|---|---|
| 数 (トークン・回数・秒・ms) | `Number.isSafeInteger(n) && 0 <= n`。秒は `Math.floor` してから | 0 |
| 費用 (USD) | `Number.isFinite(x) && 0 <= x <= 1e6` | 0 |
| `utilizationPct` | `Number.isFinite(x)` で、`0 <= x <= 1` なら ×100、`1 < x <= 100` ならそのまま、それ以外は null (値域を実データで確かめるまで。plan RK-07) | null |
| `resetsAtSec` | epoch 秒で `1e9 <= x <= 1e11`。超えたら ms とみなして 1000 で割り、同じ範囲に入るか確かめる | null |
| `contextWindow` | `Number.isSafeInteger(n) && 0 < n <= 1e8` | 0 (目盛りを出さない) |
| `toolUseId` | `^[A-Za-z0-9_-]{1,128}$` | `tool-elapsed` を出さない |
| `taskId` (`task_progress` の `task_id`。agents だけで使う。行の更新は `message` の経路なので decoder を通らない) | `toolUseId` と同じ述語 (`^[A-Za-z0-9_-]{1,128}$`) | task の行の更新を送らない (間引きの鍵も作らない) |
| `modelId` | 文字種と長さの正本は domain の `isValidModelId` (`src/domain/provider/model-catalog.ts:28`。英数と `._:/@-[]`・先頭は英数・128 文字まで。起動の設定とモデルカタログと同じ述語なので、`[1m]` 付き・`_` を含む id・Bedrock の ARN も通る)。`meter.ts` はその上に 3 つだけを足す: `//` を含まない、`:` の後ろに `@` がある形 (`/^[^/]*:[^/]*@/`。scheme の無い userinfo `u:p@h/m`) でない、`mayCarrySecret` (`system-event.ts:47`) が false。Vertex の `model@date` (`:` が無い) と Bedrock の ARN (`@` が無い) は通る | その行を内訳から落とす |
| `models` の件数 | 16 まで | 17 件目以降を落とす |
| 列挙 (`type`・`status`・`limitType`・`mode`・`AssistantErrorKey`) | `Object.create(null)` の表と `Object.hasOwn` (`transcript-guard.ts:29-40` の方式) | `mode` は `unknown`、他は null / 送らない |

- decoder は検証を通した値だけで新しい object を組む (余分なキーを運ばない)。`resetsAt: 1e300`・`__proto__` のキー・長い id・URL の資格情報の形の `modelId` で例外を出さない (SC-002)
- 文言の表も `Object.hasOwn` で引く。外部由来の id をキーにする保持は `Map` に限る

### セッションスレッドの状態 (`src/agents/live-signals.ts`。`run()` の closure に 1 つ作る。module スコープに置かない)

| 状態 | 初期値 | 更新 |
|---|---|---|
| `lastAssistantError` | null | 主ループの assistant の `error` で書き、result で消す |
| `lastContextTokens` | null | `context` を送ったとき |
| `turns` | 0 | 0 に倒していない result で +1 |
| `deniedIds` (`Set`。1,024 まで) | 空 | result の `permission_denials` の `tool_use_id` (形は `toolUseId` と同じ規則) を足す。上限に達したら足さない (件数は「1,024 件以上」と出す) |
| `turnSeq` / `compactSeq` / `modeSeq` (行の id の連番) | 0 | §3 |
| `openRetryRowId` / `openCompactRowId` | null | §3 |
| `modeBaseline` (権限モードの比較の基準) | 起動の設定の権限モード (`launchOptions.permissionMode`) | `permission-mode` を送ったとき |
| 間引き (`meter-throttle.ts`) | — | 下記 |

- **0 に倒した result**: `num_turns === 0 && total_cost_usd === 0`。`turn` を送らず、`turns` も増やさない (前の値を上書きしない。spec Edge Cases の正本)。§1 の分類は行う
- `/clear`・再開で費用とトークンが 0 から数え直される → そのまま送る (`turns` はセッションスレッドが数えるので減らない)

### 間引きと後始末 (`src/agents/meter-throttle.ts`。時計と timer は注入。偽の時計で単体)

- 鍵ごとに 1 秒に 1 回: `thinking` (1 つ)・`tool:<toolUseId>`・`task:<taskId>`。間隔の中の値は最後の 1 つだけを持ち、次の 1 秒の境で送る
- セッションあたり、間引きの対象 (`thinking` / `tool-elapsed` / task の行の更新) の合計は直近 1 秒に 20 件まで。超えた分は保留し、次の境で最新の値を送る
- **保留から送る順**: 鍵ごとの間隔が明けた鍵のうち、保留になった時刻の古い順に、20 件の枠まで送る。保留の値を上書きしても順は変えない。枠で送れなかった鍵は、保留と順を保ったまま次の境に回す。枠のために待っている保留があるときは、新しく来た値もすぐには送らず列の末尾に並べる (列を追い越さない)。保留のある鍵は多くても 65 (`thinking` と下の上限の 64) なので、どの鍵の保留も 4 秒以内に送られる (20 件を超えても飢える鍵が無い)
- **鍵の寿命 (tool と task)**: 鍵が持つのは保留の値・保留になった時刻・最後に送った時刻だけ。追うのは「保留がある」か「最後に送ってから 1 秒たっていない」鍵だけで、保留が無く、最後に送ってから 1 秒を過ぎた鍵は外す。外した鍵に後から更新が来たら新しい鍵として受ける (1 秒を過ぎているので、鍵ごとに 1 秒に 1 回を破らない)。外す判定は、新しい鍵を受ける前 (下の上限の判定の前) に行えば足りる (外すためだけの timer を置かない)
- **同時に追う鍵の上限**: tool と task の鍵を合わせて 64 まで (上の寿命で外した後の数)。埋まっているときに来た新しい鍵の更新は捨てる (覚えない。枠が空いた後の更新は受ける)。古い鍵を追い出さないのは、動いている tool / task の値を途切れさせないため
- **行の無い task**: 前景の subagent の task など、transcript に行の無い task の `task_progress` も、鍵と 20 件の枠を使う。agents は行の有無を知らない (task の状態を持たない) ため。行の無い task への更新は `mergeSystemEvent` が捨てる (§3)。`task_id` の形が外れた更新は、鍵を作らずに捨てる (上の「値の検証」)
- 取り消し: `user` の `tool_result` → その tool の鍵を保留ごと外す。主ループの assistant のメッセージと result → `thinking` の保留を捨てる。result → 全部の tool の鍵を保留ごと外す (task の鍵は残す。背景の task はターンをまたいで続き、上の寿命で外れる)。`finish()` の最初 → 全部の鍵・保留・timer を捨てる (`ended` の後に `event` を送らない)
- 鍵は task の状態 (種類・実行中か・一覧) ではない。持つのは 1 秒の間引きのための値と時刻だけで、保留が無ければ 1 秒を過ぎた時点で外れる (spec FR-013 / AD-044 Decision 6)
- 間引かないもの: `turn` / `context` / `rate-limit` / `permission-mode` と §3 の再試行・圧縮・権限モードの行 (どれも低頻度)

### renderer の保持 (稼働中のストアの `meters`。永続化しない。session の操作 UI の変更。U-1)

`RunningSessionStoreState` に `meters: Readonly<Record<sessionId, SessionMeters>>` を足す (`sessions` とは別の枝 — 計量の更新で `sessions` の参照を変えず、表示中の Thread を描き直さない)。

| 値 | 更新 |
|---|---|
| `lastTurn` | `turn` の最新 |
| `contextUsed` | `context` の最新 |
| `rateLimit` | `rate-limit` の最新 (表示中のセッションの最新の event で決める。FR-006) |
| `permissionMode` | `permission-mode` の最新。**`config` / `lastConfig` / プリセットに書き戻さない** |
| `thinkingTokens` | `thinking` の最新。そのセッションの主ループの assistant の `message` (role が assistant でシステムイベントでない) と `turn` で null に戻す |
| `toolElapsed` | `ReadonlyMap<toolUseId, seconds>`。`turn` で空にする。64 を超えたら、更新の古いものから落とす (更新のたびにその id を末尾に移す) |

- `toolElapsed` の上限は、agents の間引きの上限 (§2「間引きと後始末」。新しい鍵を捨てる) と向きが違う。数えるものが違うためである。agents が数えるのは今動いている鍵だけで、休んだ鍵と結果の届いた tool の鍵は外れる。renderer の Map には、結果の届いた tool の値も `turn` まで残る。更新の古いものほど結果が届いている見込みが高い。結果のある tool には経過時間を出さない (§4「進み具合」) ので、落としても見え方は変わらない
- `sessions[id]` が無いときの `meter` は捨てる (閉じた id を含む)。`close()` の削除の列挙に `meters` を足す
- `meter` は `patch()` を通さない (キューの同期と監視ビューの派生値の見直しを起こさない)
- `meter` は観測点 `receivedMessages` (O-1) に数えない。§3 の行は `message` なので数える (O-8 の比較の基準の変化として roadmap に書く)

## §3 システムイベントの行の追加 (O-2 の `system-event` の category)

`SYSTEM_EVENT_CATEGORIES` に 3 つを足し、task の行の `detail` に進み具合を足す。part の形 (`TRANSCRIPT_PART_FIELDS`) は変えない。**行の組み立て (いつ・どの id で作るか) は agents (`live-signals.ts`) に置き、過去ログと共有の `toSystemEventMessage` には足さない** (経路は実行中だけ)。`detail` の符号化と復号は domain (`system-event.ts`) の純関数。

| category | 行の id | 作る (`opens: true`) | 更新 (`opens: false`) | `detail` | `status` |
|---|---|---|---|---|---|
| `api-retry` | `retry:<turnSeq>` | `api_retry` (同じターンの続きは同じ行に合成) | 次の主ループの assistant → `succeeded`。result → 成功なら `succeeded`、失敗なら `failed`。どちらも開いた行があるときだけ | `<attempt>/<max_retries>/<error_status>/<retry_delay_ms>` (各整数。`error_status` が null・整数でなければ `-`) | `retrying` → `succeeded` / `failed` |
| `compaction` | `compact:<compactSeq>` | `status === 'compacting'` で、開いた行が無いとき。開いた行が無いまま `compact_result` が来たら、結果の状態で作る | `compact_result` → `succeeded` / `failed` | '' | `compacting` → `succeeded` / `failed` |
| `permission-mode` | `mode:<modeSeq>` | `status` か `init` の `permissionMode` の鍵が `modeBaseline` と違う (どちらで先に観測しても 1 回。基準を更新するので、もう一方で同じモードが届いても作らない) | — | `PermissionModeKey` | `changed` |
| `task` (既存) の更新 | `task:<task_id>` (既存の行は、空でない文字列の `task_id` で作られる。進み具合の更新を送るのは、`task_id` が §2「値の検証」の `taskId` の形のときだけ) | — (行の無い task への更新は `mergeSystemEvent` が捨てる) | `task_progress` (間引く) | `\n<total_tokens>/<tool_uses>/<duration_ms>` (先頭の改行 = 進み具合だけの更新) | null (前の値を保つ) |

- `turnSeq` は result で +1 し、`openRetryRowId` を消す。`compactSeq` は行を作るたびに +1 し、結果で `openCompactRowId` を消す
- `name` は常に ''。会話由来の文字列を入れない
- `SYSTEM_EVENT_STATUSES` に `retrying` / `compacting` / `changed` を足す。`isTerminalSystemEventStatus` に `changed` を足す (`succeeded` / `failed` は既存)。`retrying` / `compacting` のまま終わった行は O-2 の「結果不明」の規則に従う
- **合成の規則の追加 (`mergeSystemEvent`。正本はここ)**: 前の行がある task の行で、次の `detail` が改行で始まるときは、`detail` = (前の `detail` の最初の改行より前) + `\n` + (次の `detail` の改行より後)。それ以外は今のまま (空でなければ次の値)。`oneLine` は空白を畳むので、開始の行と過去ログの `detail` は改行を含まない (research R-06)
- 復号: `splitTaskDetail(detail) → { taskType, progress: { tokens, tools, durationMs } | null }`・`decodeRetryDetail(detail)`。形が合わなければ進み具合は null (種類だけを描く)
- `transcript.ts` (過去ログ) が `status` / `api_retry` / `task_progress` / `thinking_tokens` から行を作らないことを回帰テストで固定する
- **O-6 との関係**: `compaction` の行は「圧縮の進み具合 (中・成功・失敗)」、O-6 の `compact_boundary` の element は「会話の区切り」。O-6 が実行中の境界の element を足すときに、この行と統合するか並べるかを決める (roadmap の O-6 の行に書く)

## §4 表示

置き場所は AD-046 Decision 6 の語。中央のヘッダの下の帯は、ヘッダの行と会話内検索のバーの間に置く (順: ヘッダの行 → 権限モードの警告の帯 → Quota banner → 会話内検索のバー → 本体)。どれも稼働中のセッションだけで、過去のセッションには出さない。

### Quota banner (中央のヘッダの下。**表示の条件と文の組み合わせの正本はここ**)

出すかの判定と文の組み立ては純関数 `quotaBannerView(rateLimit, { terminal, nowMs })` (`features/shell/quota-banner.ts`) に置く。部品 (`CenterBanners.tsx`) は結果を描くだけにする。`terminal` は表示中のセッションの `LiveSession.terminal` である。意味は「送信できない終端」(失敗・終了済み・強制終了・終了処理中。`session-view.ts` の `deriveSessionView`) で、`RunningCenter` が `CenterHeaderLive` に足して渡す (session のコードは変えない)。

**出すか** (上から順に評価)

| 条件 | 帯 |
|---|---|
| `rateLimit` が null、または `status` が `allowed` | 出さない |
| `resetsAtSec` が null でなく `nowMs >= resetsAtSec * 1000` (解除の時刻を過ぎた) | 出さない [ASSUMED] |
| それ以外 (`allowed_warning` / `rejected`) | 出す (下の表) |

**見た目と文** (文は左の列から順に 1 つの段落に並べる。キーは §5)

| `status` | `terminal` | 見た目 | 状態の文 | 超過分 | `resetsAtSec` あり | `resetsAtSec` なし |
|---|---|---|---|---|---|---|
| `allowed_warning` | どちらでも | 注意 (`role="status"`) | `quotaWarning`。`utilizationPct` が null なら `quotaWarningNoPct` | `usingOverage` なら `quotaOverage` | `quotaReset` | なし |
| `rejected` | false | 警告 (`role="alert"`) | `quotaRejected` | 同上 | `quotaWaitUntil` | `quotaWait` |
| `rejected` | true | 警告の見た目のまま `role="status"` | `quotaRejected` | 同上 | `quotaReset` | なし |

- **待つ案内** (`quotaWait` / `quotaWaitUntil`) は「送ってください」と案内する文である。そのため、まだ送れるセッション (`terminal` が false) の `rejected` にだけ出す (US-2 AC2)
  - `allowed_warning` はまだ送れる状態なので、時刻の有無によらず待つ案内を出さない
  - `terminal` のセッションでは、失敗の表示 (`rate-limited` の「起動し直してください」) や終わり方の通知と逆の操作を案内しない。そのため時刻だけを出す。`role` も `status` に下げる。失敗の表示が既に `role="alert"` で読まれるので、警告を重ねて読ませない [ASSUMED]
- **解除の時刻を過ぎた後**: 待機中のセッションには event が来ない。そのため、次の event を待たずに描画の側で帯を消す。ストアの `rateLimit` は書き換えない (§2「renderer の保持」の最新の値のまま)。消えた帯は、次の `rate_limit_event` (`allowed_warning` / `rejected`) で再び出る [ASSUMED。「解除の時刻を過ぎました」に替える案は採らない。時刻を過ぎた後の状態をアプリは知らないので、過去の値を出し続けない方を採る]
  - 再判定は部品の timer 1 つで行う。帯を出している間、`resetsAtSec * 1000 - Date.now()` ms の後に 1 回だけ判定し直す
  - 遅延は `2 ** 31 - 1` ms で頭打ちにする。それを超える値を `setTimeout` に渡すと、すぐに発火するためである。発火した時点で時刻の前なら掛け直す
  - `rateLimit` か `terminal` が変わったとき、部品が外れたときに timer を解く
  - 判定はローカルの時計で行い、サーバの時計とは比べない。時計のずれで早く消えても、次の要求で event が来れば戻る
- `limitType` の文言は §5。null・知らない値 → 「利用枠」
- `{時刻}`: 今日なら `HH:mm`、別の日なら `M/d HH:mm` (ローカル。「今日」は描画した時点で決める)。`resetsAtSec` は §2 の検証を通った値なので Invalid Date にならないが、書式の関数は例外を出さない
- 帯はセッションごと (届いた event はそのセッションのもので、他のセッションに当てはまるかを renderer は知らない)
- 429 で失敗したが `rate_limit_event` が届かない Provider (API キー・Bedrock) では帯は出ない。失敗の文言 (`rate-limited`) は帯を参照しない

### 権限モード

- 「概要」のタブ (O-7 data-model §5): 「起動時の権限モード」の行は起動時の値のまま。`meters.permissionMode` が null でなく起動時の値と違うときだけ、その下に「現在の権限モード」の行を足す (FR-010)。中央のヘッダには常設しない (O-7 data-model §5 の「重ねない」を保つ)
- **警告の帯**: `meters.permissionMode` が null でなく `isSafePermissionMode` (domain `launch-config.ts:27`) が false (`unknown` を含む) のとき、中央のヘッダの下に `role="alert"` で `unsafeModeBanner` を出す。原因を断定しない。隔離の文言はランタイムの `autoModeStatus` (表示用の 3 値。`domain/runtime/dto.ts:57`) から次のとおり添える (U-6)。`autoModeAllowed` (ゲート用) は表示に使わない
  - `unavailable` → `unsafeModeNoIsolation` (ランタイムに隔離の仕組みが無い)
  - `allowed` / `undetermined` (一覧の読み込み中・引けない を含む) → `unsafeModeIsolationUnverified` (このセッションの隔離をアプリは確かめていない)
  - `allowed` は「ランタイムに隔離の仕組み (bubblewrap) がある」ことしか意味しない (`domain/runtime/capabilities.ts`)。アプリはセッションで Claude Code の sandbox を有効にする経路を持たない (`session-core.ts:46-55` の `QUERY_OPTION_KEYS` に `sandbox` が無い)。そのため `allowed` でも隔離されていると読める文言にしない (isolation charter :119「隔離されているかを利用者が推測する必要があってはならない」/ runtime charter :113-114「確認していないことを `true` に丸めない」)
  - この文言はセッションの隔離状態ではなく暫定である。セッションの隔離状態 (I-2 の隔離バッジ) が定義されたら置き換える (roadmap の I-2 / I-3 の行に書く。tasks SH-013)
- 強制 (中断・失敗にする) はしない (U-6)。持ち主は I-3 (roadmap の I-3 の行に書く)

### 使用量のタブ (右のペイン。O-7 のタブの表に `usage` を 1 行。`availableFor: ['none', 'running', 'past']`)

| 項目 | 導出 |
|---|---|
| 費用の累計 (推定) | `lastTurn.costUsd` (USD。小数 4 桁まで。`ja-JP` の書式) と `usageEstimateNote` |
| トークンの累計 | `lastTurn.models` の合計の入力 / 出力 / キャッシュの読み込み / キャッシュの作成 |
| ターン数 | `lastTurn.turns` (このアプリが受けたターン。research R-08) |
| モデルごとの内訳 | `models` の各行 (モデルの id・4 つのトークン数・費用) |
| 聞かれずに拒否された操作 | 稼働中のストアの `denied` の長さ (会話の上の DeniedNotice と同じ出来事) |
| 拒否された操作の合計 (SDK の記録) | `lastTurn.permissionDenials` (1,024 に達したら「1,024 件以上」) |

- 過去 → `usageLiveOnly`、未選択 → `usageEmpty`、`lastTurn` が無い → `usageAwaitFirst`
- モデルの id・数はテキストとして描く。表の構造は `dl` か `table` (registry の Cost meter を採るならその構造。research R-09)

### コンテキストと費用の目盛り (中央のヘッダの行)

- 主モデル: 起動の設定のモデル id と `models` の行のモデルの id (`modelUsage` のキー) を次の順で照合する
  1. 完全一致
  2. 両方の末尾の `[…]` (`[1m]` などの context の指定) を外して一致
  3. どれも一致しない (alias の `sonnet` などで起動した・起動の設定にモデルが無い) → 出力トークンの最も多い行

  `modelUsage` のキーに `[1m]` が付くか・alias が解決された id になるかは誰も観察していない。quickstart V-4 #2 / #3 でキーの形を控え、違えばこの規則を直す (tasks SH-014)
- `ratio = contextUsed / main.contextWindow`。`contextWindow` が 0・`contextUsed` が null → コンテキストの目盛りを出さない。`ratio >= 0.8` → 注意の見た目。`ratio > 1` → `contextOver` (数を出さない)
- 費用は `lastTurn` があれば出す (右のペインを畳んでいても見える)。`lastTurn` も `contextUsed` も無ければ何も出さない (ヘッダに空の印を置かない)
- 推定であることを `aria-label` と `title` で伝える。live region にしない (ターンごとに読み上げない)

### 進み具合

- tool の経過時間: tool の表示の見出しの右端の印 (`ToolResultMarks`) に `toolElapsed` を出す。出すのは結果がまだ無い tool の呼び出しだけ。値は実行中の Thread の外側の context から tool の id ごとに購読し、他の tool の更新で描き直さない
- 思考: 実行中の transcript の末尾 (viewport の footer の composer の上) に `thinkingTokens` を出す (research R-07)。`role="status"` を重ねて毎秒読ませない (見た目だけを更新し、読み上げは出たときの 1 回)
- task の行: `splitTaskDetail` の進み具合を `taskProgress` の文言で組み、種類の後ろに並べる
- 過去ログでは context が無いので、どれも出ない

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
| session | 短い理由 (8) | ターン上限 / 費用上限 / 出力再試行上限 / 実行エラー / 認証エラー / 請求エラー / レート制限 / API エラー |
| session | 失敗の読み上げ (`attentionAnnouncement`。spec US-1 AC5) | {名前}: 失敗しました ({短い理由})。 — 短い理由は監視ビューの行と同じ表 (`LAUNCH_FAILURE_SHORT_LABELS`)。理由が無い・汎用の `provider-error` は今の「{名前}: 失敗しました。」のまま。同じ更新で同じ理由のものは名前を「、」でつないで 1 文にし、違う理由は最初に出た順の別の文にして 1 回で読む |
| session | `provider-error` (既存) | 変えない (既に「Provider」の表記。再ログインの導線を出す汎用の理由として残る) |
| session | `noProviders` (既存) | 「プロバイダ」→「Provider」 |
| shell | `SETTINGS_SECTION_LABELS.providers` (既存) | プロバイダ → Provider |
| chat | category | `api-retry` API の再試行 / `compaction` コンテキストの圧縮 / `permission-mode` 権限モード |
| chat | status | `retrying` 再試行中 / `compacting` 圧縮中 / `changed` 変更 |
| chat | `retryDetail` | {attempt}/{max} 回目・HTTP {status}・{秒} 秒後 (status が `-` なら HTTP の部分を出さない) |
| chat | `permissionModeChanged` | 権限モードが「{name}」に変わりました |
| chat | `PERMISSION_MODE_NAMES` | `default` / `plan` / `dontAsk` は今の `PERMISSION_MODE_LABELS` と同じ文字列。`acceptEdits` 編集を自動で許可 / `bypassPermissions` すべて許可 / `auto` 自動で判断 / `unknown` 不明なモード |
| chat | `taskProgress` | 約 {tokens} トークン・tool {n} 回・{秒} 秒 |
| chat | `thinkingTokens` | 思考中 約 {n} トークン |
| chat | `toolElapsed` | {n}秒 / {m}分{s}秒 |
| shell | `usageTab` | 使用量 |
| shell | `usageCost` / `usageTokens` / `usageTurns` / `usageModels` / `usageDeniedAuto` / `usageDeniedTotal` | 費用の累計 (推定) / トークンの累計 / ターン数 / モデルごとの内訳 / 聞かれずに拒否された操作 / 拒否された操作の合計 (SDK の記録) |
| shell | `usageEstimateNote` | 推定です。請求額ではありません。再開と /clear で 0 から数え直します。 |
| shell | `usageLiveOnly` / `usageAwaitFirst` / `usageEmpty` | 実行中のセッションだけ出ます。 / 最初の応答の後に出ます。 / セッションを選ぶと使用量が出ます。 |
| shell | `contextMeter` / `contextOver` / `contextMeterLabel` | コンテキスト 約 {n}% / コンテキスト 100% 以上 / コンテキストの使用量 (推定) |
| shell | `costMeter` / `costMeterLabel` | 費用 約 ${n} / 費用の累計 (推定) |
| shell | `quotaWarning` / `quotaWarningNoPct` / `quotaRejected` / `quotaReset` / `quotaWaitUntil` / `quotaWait` / `quotaOverage` | {種類}の利用が {n}% に達しました。 / {種類}の上限に近づいています。 / {種類}の上限に達しました。 / {時刻} にリセットされます。 / {時刻} のリセットまで待ってから送ってください。 / しばらく待ってから送ってください。 / 超過分を使っています。 (並べ方は §4「Quota banner」の表。`quotaWarningNoPct` と `quotaWaitUntil` は [ASSUMED]) |
| shell | `RATE_LIMIT_TYPE_LABELS` | `five_hour` 5 時間 / `seven_day` 7 日 / `seven_day_opus` 7 日 (Opus) / `seven_day_sonnet` 7 日 (Sonnet) / `seven_day_overage_included` 7 日 (超過分を含む) / `overage` 超過分 / 知らない値 利用枠 |
| shell | `unsafeModeBanner` | アプリが選んでいない権限モード (「{name}」) で動いています。承認なしで操作が走ることがあります。 |
| shell | `unsafeModeNoIsolation` / `unsafeModeIsolationUnverified` | このランタイムには隔離がありません。 / このセッションの隔離をアプリは確かめていません。 |
| shell | `OVERVIEW_LABELS.currentPermissionMode` | 現在の権限モード |

- 「Provider」の表記は glossary の `Provider` (英字のまま) に揃える (research R-13)

## §6 右のペインのタブのキーボード操作 (FR-017)

- tablist (`RightPanel.tsx`) の `onKeyDown`: ← / → で `visibleTabs` の隣 (端で反対の端へ)、Home / End で端。移った先のタブを選び (`setPanelTab`)、そのタブの button にフォーカスを移す
- 選ばれているタブだけ `tabIndex=0`、他は `-1`。`aria-selected` / `aria-controls` / `aria-labelledby` は今のまま
- 出せないタブ (`availableFor` の外) は並びに入らない (今の `visibleTabs`)。選んでいたタブが出せなくなったら最初のタブに戻る (今の `activeTab`)
- 畳んだ帯のアイコンは tablist ではないので変えない
- テスト: `features/shell/RightPanel.tabs.test.tsx` (新設。タブの表を差し替えて 3 つのタブで ←/→・Home / End・端の回り込み・`tabIndex`・出せないタブの飛ばし・vitest-axe)。共通の setup は `test-support/app-shell-harness.tsx` (research R-12)

## §7 稼働中のストアと監視ビューの行の切り出し (FR-018)

research R-11 のとおり。`meters` を足すより前のコミットで行い、既存のテストを書き換えずに通す (例外は `announcements` の単体だけ)。切り出した後の行数を roadmap の system-scope の記録に書く (O-7・O-3 と同じ書き方)。

| 移すもの | 移す前 | 移した後 |
|---|---|---|
| 派生値の追跡と間引き | `running-session-store.ts:173-248` | `running-session-monitor.ts` (`createRunningSessionMonitor`) |
| `SessionRowStatus` (と 9 値の配列)・`Elapsed` | `labels.ts:109-123,225-230` | `running-session-types.ts`。labels は `Record<SessionRowStatus, string>` |
| `announcements` (文) | `session-view.ts:440-457` | `attentionTransitions` (名前の組)。文は `SessionAttentionAnnouncer` が `attentionAnnouncement` で組む |
| 行の部品と行の操作 | `RunningSessionList.tsx:248-553` | `RunningSessionRow.tsx` |

## §8 押したボタンが自分ごと消えるときの行き先 (FR-019)

各部品が、消える操作を呼ぶ**前**にフォーカスを移す (research R-10)。移すのは、押した要素 (またはその部品の中) にフォーカスがあるときだけ。行き先の探し方は `features/session/focus-handoff.ts` (新設) の 2 つの関数。

| 押すもの | 置き場 | 行き先 | 探し方 |
|---|---|---|---|
| サイドバーの稼働中の行の「閉じる」 | `RunningSessionRow.tsx` の行の操作 | 次の行の Trigger → 無ければ前の行の Trigger → 無ければ稼働中の区画の見出し (`h2`。`tabIndex={-1}` を足す) | `closest('[data-slot="aui_thread-list-item"]')` の兄弟の行の中の `[data-slot="aui_thread-list-item-trigger"]`。見出しは `RunningSessionList` の `section` の中の固定の印 |
| 承認カードの「許可」「拒否」 | `LivePane.tsx` (`onDecision`) | composer | `closest('[data-live-pane]')` の中の `[data-composer-input]` (composer の入力に印を足す) |
| キューの拒否の告知の「閉じる」 | `LivePane.tsx` の `QueueRejectionNotice` | composer | 同上 |
| 積んだ入力の「キューから削除」 | `LivePane.tsx` の `PendingQueueNotice` | composer | 同上 |
| 「さらに表示」の最後の押下 (`hiddenCount <= MESSAGE_WINDOW`) | `LivePane.tsx` | composer | 同上 |

- composer が無効 (終了済みなど) なら移さない (今のまま)
- セレクタは固定の文字列だけ。外部由来の id をセレクタに入れない (O-3 の `findMessageElement` と同じ規則)
- O-7 の `useFocusRescue` (中央の中身の切り替え) は変えない。中央の「閉じる」(FailureBanner / EndNotice) は今のまま `useFocusRescue` が拾う
- テスト: 各部品の component テストで、押した後の `document.activeElement` が body でなく行き先であること (「承認待ちで『許可』を押した後、composer にフォーカスがある」を含む)
