# Research: 計量と制限の表示 (O-4)

調べた日: 2026-10-07 (夜間の自走)。O-7 (PR #13)・O-3 (PR #14) の後の main を読んだ。行番号はすべてこの時点のもの。2026-10-04 の版は O-7 の設計段階の上で書いたので、本版で作り直した。

## R-01 今の扱い (コードの事実)

- `src/agents/sdk-agent-session.ts` (SDK を import する配線。単体は `sdk-agent-session.test.ts` が SDK と子プロセスを差し替えて見る)
  - `:513-562` SDK のメッセージの switch。`assistant` (`:514-520`) と `user` (`:521-526`) は本文の経路。`result` (`:527-542`) は `resultAction(classifyResult(subtype, is_error), closing)` で `complete` / `fail('provider-error')` (`:536`) / `ignore`。`system` (`:543-558`) は `permission_denied` と O-2 の Hook / task (`toSystemEventMessage`) だけ。`rate_limit_event` / `tool_progress` は `default:` で捨てる (`:559-561`)
  - `:267-296` `run()` の closure の状態 (`toolResults` など)。`:300-301` `emit` は `SessionEvent` を文字列にして調停役スレッドへ送る。`:342-356` `finish()` は 1 回だけ通る出口で、最後に `ended` を送る
  - `:80-84` domain の手書きの型と SDK の型の一致 (`Equal<…>`)
  - `:529` / `session-core.ts:324,333` のコメントは根拠を「V-11 / FR-030」と書くが、005 spec に FR-030 は無い。正しくは X-1 FR-020 (`005 spec:341-344`)・US-4 AC6 (`:181`)・Edge (`:207`)・data-model §6 (`005 data-model:156`)
- `src/agents/session-core.ts:324-354` — `ResultTermination` (`complete` / `provider-error`)・`classifyResult`・`resultAction`。SDK を import しない (単体あり)
- `src/agents/live-tool-results.ts` — `run()` の closure に 1 つ作る SDK 非依存の部品の先例 (O-2)。SDK のメッセージを構造だけで受ける
- `src/domain/session/agent-session.ts:26-54` — `LaunchFailureReason` (10)。`:70-79` の `SessionLaunchRejectReason` のコメントは「起動失敗 10 種」。`:167-189` — `SessionEvent` (7) と `SESSION_EVENT_KINDS`。固定テストは `agent-session.test.ts:85` (`toHaveLength(10)`) と `agent-session.kinds.test.ts:11`
- `src/domain/session/system-event.ts:103-158` — `toSystemEventMessage` (過去ログと実行中で共有。Hook / task の 5 つの subtype だけ)。`:171-190` — `mergeSystemEvent` (合成の規則の正本。`name` / `detail` は空でなければ次の値で上書き)。`:193-202` — `isTerminalSystemEventStatus`
- `src/domain/session/transcript-dto.ts:49-79` — `system-event` の part (`detail` は Hook: `hook_event` / task: `task_type`)。`SYSTEM_EVENT_CATEGORIES = ['hook', 'task']`。`:119-135` — `TRANSCRIPT_PART_FIELDS`
- renderer
  - `features/session/session-event-decoder.ts:42-89` — `kind` ごとの形の検証
  - `features/session/running-session-store.ts` (650 行) — `:129-140` システムイベントの行を `mergeSystemEvent` で合成、`:189-248` 監視ビューの派生値 (`writeActivity` / `armActivity` / `scheduleActivity` / `trackDerived`)、`:269-327` `applyEvent`、`:286-302` `message` で `receivedMessages` を数える、`:528-557` `close()` の削除の列挙
  - `features/session/running-session-types.ts:15` — ストアの型が `SessionRowStatus` を文言の表 (`./labels`) から import している。`session-view.ts:9` も `attentionAnnouncement` / `Elapsed` / `SessionRowStatus` を labels から import する
  - `features/session/labels.ts` — `:20-57` 失敗の全文 (`Record<SessionLaunchRejectReason, string>`)、`:63-78` 短い理由 (`Record<LaunchFailureReason, string>`)、`:80-83` `isReloginFailure` (`provider-error` だけ)、`:276-280` `PERMISSION_MODE_LABELS` (安全 3 値)、`:313` 「プロバイダ」
  - `features/session/RunningSessionList.tsx` (553 行) — `:310-471` 行の部品 (`RowStatusBadge` / `ElapsedTime` / `RowActivity` / `SessionRowMeta` / `RowTooltip`)、`:474-553` 行の操作 (「閉じる」は `:539-549`)、`:111` 稼働中の区画の見出し (`h2`)
  - `features/session/LivePane.tsx` — `:172-179` 承認カード、`:180-191` 「さらに表示」、`:200-202` `TranscriptSettledContext`、`:265-285` `FailureBanner`、`:338-345` キューの拒否の告知の「閉じる」、`:394-401` 「キューから削除」。`ApprovalCard.tsx:44-51` 「拒否」「許可」
  - `features/shell/` — `panel-tabs.ts:24-32` タブの表 (「概要」の 1 行)、`RightPanel.tsx:103-126` tablist (矢印キーなし。`:22-23` に「2 つ目のタブを足す feature が入れる」)、`CenterHeader.tsx:18-39` (稼働中と過去で共有。行の下に会話内検索のバー)、`CenterPane.tsx:78-111` `RunningCenter`、`OverviewTab.tsx:97-100` 権限モードの行 (起動時の値)、`labels.ts:73` 「プロバイダ」、`useFocusRescue.ts` (面の中身の切り替えでフォーカスを拾う。O-7)
  - `features/shell/AppShell.test.tsx` (1,373 行) — 共通の setup は `:43-303`。右のペインのテストは `:634-750`。`useTranscript` の `vi.mock` は `:52` (vi.mock は各テストファイルに要る)
  - `components/assistant-ui/elements/` — `thread.aui.tsx:1005-1078` `SystemEventRow` (task の `detail` は `taskTypeLabel` で訳す)、`:248-261` / `:536` viewport の footer (composer の上)、`:649-655` composer の入力、`:823-851` Reasoning の group。`tool-result-marks.tsx:28-54` tool の見出しの右端の印 (6 つの tool の表示で共有)
  - `stores/ui.ts:25-26` — `PanelTabId = 'overview'`
- `docs/ui-coverage.md` — A 節 `:48` result / `:52` status / `:53` api_retry / `:62` tool_progress / `:67` task_progress / `:69` thinking_tokens / `:77` rate_limit_event、E 節 `:195` get_context_usage / `:196` get_session_cost / `:198` get_usage、F 節 `:261` Context breakdown / `:262` Context display / `:264` Cost meter / `:288` Job progress / `:315` Quota banner。D 節 `:175` launch-failure
- 機械強制: 項目 16 は `src/agents/` (`AGENT_SDK_IMPORT_DIRECTORIES`) に `'bypassPermissions'` / `'acceptEdits'` / `'auto'` の綴りが現れたら落ちる (`check.mjs:874-880`)。domain と renderer は走査しない

## R-02 SDK の型の事実 (`@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts`)

| 事実 | 行 | 設計への効き |
|---|---|---|
| `SDKResultError.subtype` は `error_during_execution` / `error_max_turns` / `error_max_budget_usd` / `error_max_structured_output_retries`。`SDKResultSuccess` は `is_error` と `api_error_status?: number \| null` | :5276-5278 / :5333-5354 | data-model §1 |
| `total_cost_usd` と `modelUsage` は streaming-input ではセッションの累計。最新の result を読み、足し合わせない。crash / 起動時のエラーの result は 0 でありうる。再開と `/clear` で数え直す。推定で請求ではない | :5285 / :5293 | data-model §2「`turn`」 |
| result の `usage` は**主ループだけ・ターンごと** | :5289 / :5363 | コンテキストの推定に使わない |
| **`num_turns` は 1 ターンの中のモデルの往復の数** (`result_index` の説明: "Distinct from num_turns, which counts model round-trips within one turn") | :5318 / :5380 | 「ターン数」はセッションスレッドが result を数える (R-08) |
| `permission_denials: SDKPermissionDenial[]` (`tool_name` / `tool_use_id` / `tool_input`)。ターンごとか累計かは書かれていない | :5114-5118 / :5297 | R-08 |
| **`system/permission_denied` は best-effort。`result.permission_denials` が正本**。PreToolUse hook の拒否・パスの deny rule の拒否などは `permission_denied` に出ない | :5121 | R-08 |
| assistant は**完成した content block ごとに 1 メッセージ**。同じ `message.id` を共有し、`usage` は最終値ではない (入力側は API 呼び出しの開始で決まる)。`parent_tool_use_id` が非 null なら subagent の中のメッセージ | :3336-3346 | コンテキストの推定は主ループの assistant の入力側だけ (data-model §2) |
| assistant の `error?: SDKAssistantMessageError` (13 値)。ターンの最初の assistant が合成の API エラーのメッセージでありうる | :3346 / :3352 / :3411 | data-model §1 の材料 |
| `ModelUsage` は `inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens` / `costUSD` / `contextWindow` ほか | :1317-1342 | data-model §2 |
| `SDKRateLimitInfo`: `status` (`allowed` / `allowed_warning` / `rejected`)・`resetsAt?`・`rateLimitType?` (6 値)・`utilization?`・`isUsingOverage?`。**claude.ai のサブスクリプションの利用者向け**。`utilization` の値域と `resetsAt` の単位は書かれていない | :5239-5274 | data-model §2 の検証 (RK-07) |
| `SDKStatusMessage`: `status` (`compacting` / `requesting` / null)・`permissionMode?`・`compact_result?` (`success` / `failed`)・`compact_error?` | :5465-5477 | data-model §3 |
| `SDKSystemMessage` (`init`): **各ターンの最初に、そのターンの他のメッセージより先に**届く。`permissionMode` は**必須**。ほかに `cwd`・`tools`・`mcp_servers`・`model`・`slash_commands`・`plugins` (`path`)・`apiKeySource` などを持つ | :5479-5533 | 権限モードの比較に `permissionMode` だけを読む (data-model §2。`status` は省略可能なので、それだけでは起動の直後からの昇格や `status` を伴わない変化を見落とす。plan RK-09) |
| `SDKAPIRetryMessage`: `attempt` / `max_retries` / `retry_delay_ms` / `error_status: number \| null` / `error` / `no_response?` | :3317-3334 | data-model §3 |
| `SDKThinkingTokensMessage`: `estimated_tokens` は今の思考のブロックの累計。**redacted thinking の間 (API が ping だけを流す間) に届く**推定 | :5651-5665 | 思考の印は Reasoning の part が届く前に出す (R-07) |
| `SDKToolProgressMessage`: `tool_use_id` / `elapsed_time_seconds` / `parent_tool_use_id` / `heartbeat?` / `subagent_retry?` | :5667-5686 | 主ループの tool だけ (実行中の subagent の入れ子は O-6) |
| `SDKTaskProgressMessage`: `task_id` / `usage` (`total_tokens` / `tool_uses` / `duration_ms`) / `description` / `summary?` / `last_tool_name?`。**`task_type` を持たない** | :5571-5594 | R-06 |
| `PermissionMode` は 6 値 (`default` / `acceptEdits` / `bypassPermissions` / `plan` / `dontAsk` / `auto`) | :2327 | data-model §2 の `PermissionModeKey` |
| `Query.getContextUsage()` はカテゴリ別の内訳を返す制御要求 | (Query) | 呼ばない (AD-047 Decision 4) |

## R-03 計量の運び方 (U-2)

- **Decision**: `SessionEvent` に `meter` を足す (AD-047 Decision 2)。transcript の行になる出来事は O-2 のシステムイベントの行の経路 (`message`) で運ぶ (Decision 3)
- **Rationale**: 計量は「最新の値」で、行でも状態でもない。状態通知は main を経由し、X-5 FR-004 の検査の範囲を広げる
- **Alternatives**: AD-047 の Alternatives

## R-04 制御要求を呼ばない (U-3)

- **Decision**: 呼ばない (AD-047 Decision 4)。コンテキストの推定は、主ループの最後の assistant のメッセージの入力側の usage (入力 + キャッシュの読み込み + キャッシュの作成) を、主モデルの `contextWindow` (result の `modelUsage`) で割る
- **Rationale**: 1 回の API 呼び出しの入力側がその時点のコンテキストの大きさである。result の `usage` はターン内の往復の合算でありうる (R-02。2026-10-04 の design-gate R1 po H-003)。assistant の `usage` は最終値ではないが、入力側は API 呼び出しの開始で決まる
- **Trade-off**: カテゴリ別の内訳は出ない (Claude Code の `/context` で見られる)。subagent の文脈は入らない。AD-047 Decision 4 は材料の例に result の `usage` を挙げるが、決定 (制御要求を呼ばない) は変わらない。字面は AD-047 の訂正節で直す (plan の ADR 節 #1)

## R-05 高頻度のメッセージ

- **事実**: `tool_progress` は heartbeat を含み、長い Bash で毎秒届く。`thinking_tokens` は思考の delta ごと。`task_progress` は subagent の tool ごと
- **Decision**: セッションスレッドで、tool ごと・task ごと・思考ごとに 1 秒に 1 回まで (間引いた最後の値は次の 1 秒の境で送る)。セッションあたりの合計にも上限を置く (data-model §2)。O-1 の並列時の滑らかさ (10 本 × 20 件/秒の E2E) を悪くしない
- **Alternatives**: renderer で間引く — port と decoder と store の更新の回数は減らないので採らない

## R-06 task の進み具合と task の種類 (FR-013)

- **事実**: task の行の `detail` は task の種類 (`task_type`) で、renderer が `taskTypeLabel` で訳す (`thread.aui.tsx:1026`)。`task_progress` は `task_type` を持たない (R-02)。`mergeSystemEvent` は空でない `detail` で上書きする。進み具合をそのまま `detail` に入れると、task の種類が消える
- **Decision**: 進み具合だけの更新は `detail` の先頭に改行を置いた形 (`\n<total_tokens>/<tool_uses>/<duration_ms>`) にし、`mergeSystemEvent` がこの形を見たときだけ「前の行の種類 + 改行 + 新しい進み具合」に合成する (data-model §3)。`oneLine` は空白を畳むので、過去ログと開始の行の `detail` は改行を含まない。part の形 (`TRANSCRIPT_PART_FIELDS`) は変えない (AD-047 Decision 3)
- **Alternatives**:
  - `name` に入れる — task の説明 (`description`) が消える
  - セッションスレッドが task ごとに種類を覚える — AD-044 Decision 6 / FR-013 の「task の状態 (種類・実行中か・一覧) を持たない」に反する
  - part にフィールドを足す — `TRANSCRIPT_PART_FIELDS` を変える (AD-047 Decision 3 に反し、新しい ADR が要る)
  - 進み具合の行を別に作る — 行の無い task への進み具合を捨てる規則 (FR-013) を agents が判定できない (状態を持たないので)

## R-07 思考のトークン数の置き場 (FR-012 / US-4 AC4)

- **事実**: assistant は完成した content block ごとに届く (R-02)。思考のブロックが完成するまで、transcript に Reasoning の part は無い。`thinking_tokens` はその間に届く
- **Decision**: 実行中の transcript の末尾 (viewport の footer の composer の上) に、Reasoning の表示の語彙 (registry の Thinking indicator を採れればそれ。採れなければ既存の `ReasoningTrigger` の体裁) で「思考中 約 N トークン」を 1 行出す。次の主ループの assistant のメッセージ・result で消える (data-model §2 の取り消し)
- **Alternatives**: 既存の Reasoning の part の見出しに出す — part がまだ無いので出せない

## R-08 ターン数と拒否の件数の数え方 (US-3 AC1)

- **Decision (ターン数)**: セッションスレッドが result を数える (`turn.turns`)。`num_turns` は 1 ターンの往復の数なので「ターン数」に使わない。0 に倒した result (crash / 起動時のエラー) は数えない (data-model §2)
- **Decision (拒否の件数)**: 使用量のタブに 2 行を出す
  - 「聞かれずに拒否された操作」(spec の項目): このセッションの `permission-denied` の件数 (稼働中のストアの `denied` の長さ。会話の上の DeniedNotice と同じ出来事)
  - 「拒否された操作の合計 (SDK の記録)」: `result.permission_denials` の `tool_use_id` を、セッションスレッドが重複を除いて数えた数 (ターンごとでも累計でも同じ値になる)。承認カードで拒否した操作と、Hook・パスの規則による拒否を含みうる (R-02)
- **Rationale**: `permission_denials` は正本だが「聞かれずに」と言える集合ではない。`permission_denied` は best-effort。どちらか 1 つだと、spec の項目 (聞かれずに) か対応表の `permission_denials` の表示のどちらかが欠ける
- **Alternatives**: `permission_denials.length` を「聞かれずに拒否された操作」と出す — 承認カードの拒否を含みうるので誤り。ターンごとか累計かが分からないので、最新の値も合計も誤りうる

## R-09 element の照合 (Principle XIII)

`.claude/skills/elements/references/` の registry の説明で、O-4 の候補を確かめた。採るかは実装の最初の task で取り込んで決め、照合の結果 (候補名と不適合の理由) を PR の説明と F 節の備考に書く。

| 候補 (registry の名前) | 形 | 使い道の候補 | 採る条件 |
|---|---|---|---|
| Cost meter (`elements-cost-meter`) | 実行の費用・モデルごとの行・セッションの合計 | 使用量のタブ | 文言を props で日本語にできる。実行時に `<style>` を足さない。表としての構造 (`dl` / `table`) |
| Quota banner (`elements-quota-banner`) | 使用量 / 上限・解除まで・「もっと得る」の操作 | 中央のヘッダの下の帯 | `utilization` (割合) と解除の時刻で描ける。「もっと得る」の操作を出さずに使える。`role` を status / alert で切り替えられる |
| Context display (`context-display`。AUI 接続) | リング / バー / 文字。`usage` の上書きと `modelContextWindow` | 中央のヘッダの目盛り | `usage` の上書きで assistant-ui の metadata に頼らずに描ける。文言が日本語にできる。ホバーの中身が推定と分かる |
| Context breakdown (`elements-context-breakdown`) | カテゴリ別の内訳 | — | 使わない (カテゴリ別の内訳は出さない。AD-047 Decision 4) |
| Job progress (`elements-job-progress`) | 重みのある段階・残り時間・中止 | — | 使わない見込み (task の進み具合は段階も残り時間も持たない)。task の行の `detail` で出す |
| Thinking indicator (`elements-thinking-indicator`) | 今していることの 1 行と経過時間 | 思考の印 (R-07) | 文言が日本語にできる。`role="status"` を重ねて読ませない |

採らないときは既存の `Badge` / `Button` / 文字の体裁で作り、理由を F 節に書く。registry の element に手を入れたら eslint の手書きの element の一覧と reviewers.yml の a11y / ux の対象に足す (plan「機械強制の変更」)。

## R-10 押したボタンが自分ごと消えるときのフォーカス (FR-019)

- **事実**: 消えるのは 5 か所 (data-model §8)。うち 4 か所は中央の本体、1 か所 (稼働中の行の「閉じる」) はサイドバー。O-7 の `useFocusRescue` (`features/shell/`) は面の中身の切り替え (`trigger`) で拾う形で、session のコンポーネントからは使えない (本番の依存は shell → session の向き。`test-support/running-sessions-harness.tsx:12-13`)
- **Decision**: **各部品で、消える操作を呼ぶ前に行き先へ移す**。行き先を探す処理は `features/session/focus-handoff.ts` (新設) の 2 つの関数に集める。どれも固定のセレクタと DOM の兄弟の関係だけで探し、外部由来の id をセレクタに入れない
- **Rationale**: 行き先が部品ごとに違い (隣の行・composer)、どれも押した部品が自分の消え方を知っている。「さらに表示」の最後の押下も `hiddenCount <= MESSAGE_WINDOW` で分かる
- **Alternatives**: シェルの 1 か所 (`CenterPane` の `main`) で `MutationObserver` で拾う — サイドバーの「閉じる」に届かず、別の仕組みが要る。`focusout` は使えない (Chromium は要素の削除で blur を出さず、本文のクリックで `relatedTarget === null` の focusout が出る。roadmap の記録)

## R-11 稼働中のストアと監視ビューの行の切り出し (FR-018)

- **Decision**:
  - (1) `running-session-monitor.ts` (新設) に `writeActivity` / `armActivity` / `scheduleActivity` / `trackDerived` と `activityTimers` を移す。ストアは `createRunningSessionMonitor({ getState, setState, now })` の `track(ids)` / `forget(id)` を呼ぶ
  - (2) `SessionRowStatus` (と 9 値の配列) と `Elapsed` を `running-session-types.ts` に移す。`labels.ts` は `Record<SessionRowStatus, string>` で網羅を型で検査する。`session-view.ts` の `announcements` は名前の組 (`{ awaiting, failed }` か null) を返す `attentionTransitions` に替え、文は `SessionAttentionAnnouncer` が `attentionAnnouncement` で組む。`session-view.ts` は labels を import しなくなる
  - (3) `RunningSessionRow.tsx` (新設) に行の部品 (`RowStatusBadge` / `ElapsedTime` / `RowActivity` / `SessionRowMeta` / `RowTooltip`) と行の操作 (`SessionRowActions`。FR-019 の「閉じる」を足す先) と補助 (`useRowFacts` / `rowContext` / `endNoticeOf`) を移す
- **既存のテスト**: 書き換えずに通す。**例外は (2) が戻り値を変える `announcements` の単体 (`session-view.monitor.test.ts:345-380`) だけ**で、名前の組の検査と `attentionAnnouncement` の検査 (`labels.test.ts`) に分ける。読み上げの文の振る舞いは `SessionAttentionAnnouncer` を通す既存の component テスト (`AppShell.test.tsx:455-484` など) が書き換えずに守る。spec の FR-018 / SC-007 にこの例外を書き足した
- **Alternatives**: `announcements` を文を返すまま残す — `session-view.ts` が labels に依存し続け、(2) の目的 (導出が文言の表に依存しない) を満たさない

## R-12 タブのキーボード操作 (FR-017)

- **Decision**: WAI-ARIA APG の Tabs pattern の自動の選択 (フォーカスの移動で選択も移す)。←/→ は隣 (端で反対の端へ回る)、Home / End は端。選ばれたタブだけ `tabIndex=0`、他は `-1`。対象は今の中央の状態で出せるタブ (`visibleTabs`) だけ。畳んだ帯のアイコンは tablist ではないので変えない
- **Rationale**: パネルの中身はすぐ描ける (APG は手動の選択を中身の描画が重いときに勧める)
- **テストの置き場**: `AppShell.test.tsx` の共通の setup (`:59-303` の固定データ・`FakePort`・`deliverPort`・`setup()`・行の helper) を `test-support/app-shell-harness.tsx` に移す。`useTranscript` の `vi.mock` は各テストファイルに残す (vitest の制約)。タブのテストは `features/shell/RightPanel.tabs.test.tsx` (新設)。`AppShell.test.tsx` は import を替えるだけで、既存のテストの本体は変えない

## R-13 「Provider」と「プロバイダ」(FR-016)

- **事実**: glossary の `Provider` (`glossary:608-615`) は日本語表記の行を持たない。UI の文言で「プロバイダ」は `shell/labels.ts:73` (設定の項目名) と `session/labels.ts:313` (起動ダイアログの案内) の 2 か所。テストは `AppShell.test.tsx:585,587,893,1210` と `palette-commands.test.ts:133,262-263` (半角カナの正規化の例)。E2E の locator は 0 件。docs は glossary:912・ui charter:72・ui-coverage:328 (accepted の AD-014 / AD-046 は変えない)
- **Decision**: UI と docs の表記を英字の「Provider」に揃え、glossary の `Provider` に「日本語表記: Provider (英字のまま。カタカナの『プロバイダ』は使わない)」を足し、Detected synonyms に 1 行足す。`palette-commands.test.ts` の半角カナの例は「ﾗﾝﾀｲﾑ」→「設定: ランタイム」に替える (正規化の検査の意図は保つ)
- **Rationale**: 起動の軸・概要・Provider の画面 (X-3 / X-4) は既に「Provider」で、glossary の canonical も英字である

## R-14 経路を 1 本通すテストの置き場 (SC-002)

- **事実**: `sdk-agent-session.ts` は import すると副作用が走る (SDK・`main()`)。renderer の decoder とストアは renderer の project でしか動かない (`vitest.config.ts:49-77`)。`tests/**/*.test.tsx` は renderer の project (jsdom) で、相対 import で `src/agents/` の SDK 非依存のモジュールを読める
- **Decision**: SDK のメッセージの分岐・行と計量の組み立て・間引きを SDK 非依存の `src/agents/live-signals.ts` (新設) に置き、`sdk-agent-session.ts` は呼ぶだけにする。通しのテストは `tests/meter/meter-through.test.tsx` (新設) で、fixture → `live-signals` → `JSON.stringify` → 偽の port → decoder → ストア → DOM を 1 本通す
- **Alternatives**: node の project で decoder まで通す — decoder は renderer の alias (`@/`) に依る

## R-15 権限モードの表示名の置き場

- **事実**: transcript の element (`thread.aui.tsx`) が import する features は `features/chat` だけ (`chat/labels.ts:4-8`)。`chat` と `components` は `features/session` を import していない (2026-10-07 の Grep で 0 件)。起動ダイアログの安全 3 値の名前は `session/labels.ts:276-280`
- **Decision**: 7 値 (`PermissionModeKey`) の表示名の表 `PERMISSION_MODE_NAMES` を `features/chat/labels.ts` に置き、`session/labels.ts` の `PERMISSION_MODE_LABELS` はそこから安全 3 値を取る (文字列は今と同じ)。shell (概要・警告の帯) は chat の表を読む
- **Alternatives**: session と chat に別々の表 — 同じモードの名前が 2 か所に分かれる (Principle XIV)
- **AD-047 との差**: Decision 5 の字面は「昇格値のリテラルは domain だけに置く」で、本決定は renderer の文言の表に昇格値を key として置く (`src/agents/` には置かず、項目 16 に例外を足さない)。Decision 5 の字面は書き誤りとして AD-047 の訂正節で直す (2026-10-08 に利用者が決定。plan の ADR 節 #3)
- **根拠 (design-gate R3 MG-11。2026-10-08 に利用者が、記録と判断の両方を根拠に書くと決めた)**: renderer に昇格値の表示名を置くこと自体は、採択の時点の設計にあった。記録は承認の commit `c89b423` (2026-10-05。branch `014-ui-metering-and-limits-old`) の data-model.md:178 (§5 の chat の「権限モードの名前」の表。`acceptEdits` / `bypassPermissions` / `auto` を key にする) と spec.md:134 (US-4 AC1「権限モードが {モード} に変わりました」)。本節 (R-15) が決めたのは、表の置き場 (`features/chat/labels.ts`) と、session の表がそこから安全 3 値を取る形だけである。同じ版の data-model.md:76 の「domain の `meter.ts` だけ」は agents と対比した字面で、§5 の表と食い違っていた。Decision 5 の字面はこの :76 から来ている
