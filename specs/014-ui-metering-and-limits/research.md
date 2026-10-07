# Research: 計量と制限の表示 (O-4)

調べた日: 2026-10-04 (夜間の自走)

## R-01 今の扱い (コードの事実)

- `sdk-agent-session.ts:513-562` — SDK のメッセージの switch。`result` は `resultAction(classifyResult(subtype, is_error), closing)` で `complete` / `fail('provider-error')` / `ignore` (:527-542)。`system` は `permission_denied` と O-2 の Hook / task (`toSystemEventMessage`) だけ (:543-558)。`rate_limit_event` / `tool_progress` などは `default:` で捨てる (:559-561)
- `session-core.ts:326-354` — `ResultTermination` (`complete` / `provider-error`)・`classifyResult`・`resultAction`
- `agent-session.ts:26-50,167-189` — `LaunchFailureReason` (10) と `SessionEvent` (7)
- `features/session/labels.ts:16-79` — 失敗の全文・短い理由・`isReloginFailure` (`provider-error` だけ)
- `docs/ui-coverage.md:43,47,48,57,62,64,72,190,191,193` — `後続: O-4` の 10 行

## R-02 SDK の型 (0.3.270)

- `SDKResultError.subtype`: `error_during_execution` / `error_max_turns` / `error_max_budget_usd` / `error_max_structured_output_retries`。`SDKResultSuccess` は `is_error` と `api_error_status` (API エラーのとき)
- `total_cost_usd` と `modelUsage` は「streaming-input ではセッションの累計。最新の result を読み、足し合わせない。推定で請求ではない」。`usage` は主ループのターンごと
- `ModelUsage` は `contextWindow` を持つ → Context display を result から推定できる
- `SDKRateLimitInfo`: `status` (`allowed` / `allowed_warning` / `rejected`)・`resetsAt`・`rateLimitType`・`utilization`・`isUsingOverage`。claude.ai のサブスクリプションの利用者向け (API キーの Provider では届かない)
- `SDKStatusMessage`: `status` (`compacting` など)・`permissionMode`・`compact_result`・`compact_error`
- `Query.getContextUsage()` (:2786) はカテゴリ別の内訳を返す制御要求

## R-03 運び方 (U-2)

- **Decision**: `SessionEvent` に `meter` を足す (AD-047)。行になる出来事は O-2 のシステムイベントの行
- **Rationale**: 計量は「最新の値」で、行でも状態でもない。状態通知は main を経由し、X-5 FR-004 の検査の範囲を広げる
- **Alternatives**: AD-047 の Alternatives

## R-04 制御要求を呼ばない (U-3)

- **Decision**: 呼ばない。Context display は `lastTurn.usage` と主モデルの `contextWindow` の比で推定する
- **Rationale**: 項目 14 の許可リストの追加 (ADR) と呼び出しの時期の設計が要らない。毎ターンの result で値が更新される
- **Trade-off**: カテゴリ別の内訳 (system prompt・tools・messages など) は出ない。推定は最後のターンの主ループの入力で、subagent の文脈は入らない

## R-05 高頻度のメッセージ

- `tool_progress` は heartbeat を含み、長い Bash で毎秒届く。`thinking_tokens` は思考の delta ごと
- **Decision**: セッションスレッドで、tool ごと・思考ごとに 1 秒に 1 回まで (最後の値は次の境で送る)。O-1 の並列時の滑らかさ (10 本 × 20 件/秒の E2E) を悪くしない
