# Tasks: 計量と制限の表示 (O-4)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md) / [quickstart.md](./quickstart.md)

**記法**: `[BE]` domain / agents、`[FE]` renderer、`[SH]` 横断 (docs・規則・通しのテスト・検証)。main と preload は変えない (SC-006)。行末の `[P]` は、同じ節 (`##` / `###`) の中で、それより前の `[P]` の無いタスクが済んでいれば他の `[P]` と並行に進めてよいもの (主に別のファイルで、互いに依らない。implementer は `[P]` でも直列に進める)。targets=both の Backend / Frontend / Shared の区分はタグと末尾の索引 (`Backend Tasks (index)` ほか) で示す (User Story ごとの節を保つため)。

**規則の正本**: 振る舞いの正本は spec の FR / SC。理由のキーと再ログインの導線・`meter` の形と許可リスト・値の検証・間引きと取り消し・renderer の保持・行・表示・文言・タブのキー操作・切り出し・フォーカスの行き先の正本は data-model (§1〜§8)、方式の理由は research (R-01〜R-15)。本書は作業単位とテストの観点だけを書く。テストは spec の SC が計測経路として名指すので各タスクに含める。行番号は research R-01 (2026-10-07 の main) のもので、前のタスクでずれていたら Grep で引き直す。

**着手の条件**: design-gate の PASS (status `implementing`)。AD-047 の accepted と spec の U-1〜U-6 の承認 (2026-10-05)、O-7 (PR #13)・O-3 (PR #14) のマージは済み。実機の確認 (quickstart V-4。認証切れの形・`rate_limit_event` の単位など) は利用者の作業で、実装を止めない (plan RK-06 / RK-07 の手当てで、実機の形を待たずに作る)。

**順序の制約**: SH-001 (glossary) → コード。SH-002 (element の照合) → FE-020 / FE-031 / FE-032 / FE-044。土台 1 (FE-001〜FE-003。FR-018 の切り出し) → 土台 2 (`meters`)。BE-001 → BE-002 → BE-004 / FE-004。FE-005 (中央のヘッダの口) → FE-020 / FE-032 / FE-040。US-4 は AC1a (BE-040 / FE-040) を先に。SH-010〜SH-013 は US-1〜US-4 と預かった義務の後、SH-014 (検証) が最後。

## 先行

- [ ] **SH-001** [SH] **glossary を追随させる** (Principle XIV。spec FR-016。plan「記録の追随」): `docs/glossary.md` に 計量 (meter)・Quota banner・コンテキストの使用量の推定・失敗の理由の各キー (data-model §1 の 8 つ)・権限モードの警告の帯 (隔離の文言はセッションの隔離状態ではなく、ランタイムの `autoModeStatus` から導く暫定のものと 1 行。data-model §4) を足す。「FailureReason (起動系)」を「起動とターンの失敗」(18 種) に改める。「システムイベントの行」(System event row) の定義に 3 つの category (API の再試行・コンテキストの圧縮・権限モード) と task の進み具合を足し、Ref に data-model §3。`Provider` に日本語表記の行 (英字のまま。カタカナの「プロバイダ」は使わない) と Detected synonyms の 1 行を足し、`:912` の「プロバイダ」を直す (research R-13)。大きいファイルなので足す位置を Grep で決めてから Read する [P]
- [ ] **SH-002** [SH] **element を取り込んで照合する** (Principle XIII。research R-09 / plan RK-12): registry の Cost meter (`elements-cost-meter`)・Quota banner (`elements-quota-banner`)・Context display (`context-display`)・Thinking indicator (`elements-thinking-indicator`) を `npx assistant-ui@latest add …` で取り込み (O-3 の SH-003 と同じ方法)、R-09 の「採る条件」で照合する。観点に、本番の CSP (`style-src 'self'`) の下で動くこと (実行時に `<style>` を足さない)・文言を日本語の props にできること・新しい npm の依存を足さないこと。Context breakdown と Job progress は取り込まず、使わない理由だけを記録する [P]
  - 採るなら `components/assistant-ui/elements/` に置く (手を入れたら SH-011 で eslint と reviewers.yml の一覧に足す)。採らないなら取り込んだファイルを消し、表示は既存の `Badge` / `Button` / 文字の体裁で作る。FE-020 / FE-031 / FE-032 / FE-044 はこの結論で作り方を決める
  - 照合の結果 (候補名と採る・採らないの理由) の正本は PR の説明。research R-09 と対応表の F 節の備考 (SH-012) は写し

## 土台 1 — 稼働中のストアと監視ビューの行の切り出し (FR-018。振る舞いを変えない)

**Goal**: roadmap の system-scope の記録 (1)〜(3) のとおりに分け、`meters` (FE-004) と失敗の短い理由 (FE-011)・フォーカス (FE-050) を切り出した後の部品に足せるようにする (data-model §7 / research R-11)。

**Independent Test**: 既存のテストが書き換えずに通る (例外は `announcements` の単体だけ。SC-007 / plan RK-11)。

- [ ] **FE-001** [FE] **派生値の追跡を切り出す** (FR-018 (1)): `features/session/running-session-store.ts:173-248` の `writeActivity` / `armActivity` / `scheduleActivity` / `trackDerived` と `activityTimers` を `running-session-monitor.ts` (新設。`createRunningSessionMonitor({ getState, setState, now })` の `track(ids)` / `forget(id)`) に移し、ストアはそれを呼ぶだけにする。`running-session-store.test.ts` / `running-session-store.monitor.test.ts` / `RunningSessionList.monitor.test.tsx` が書き換えずに通る [P]
- [ ] **FE-002** [FE] **行の状態の型を文言の表から出す** (FR-018 (2)): `SessionRowStatus` (と 9 値の配列)・`Elapsed` を `features/session/labels.ts:109-123,225-230` から `running-session-types.ts` に移し、`labels.ts` は `Record<SessionRowStatus, string>` で網羅を型で検査する。`session-view.ts` の `announcements` (`:440-457`) を、名前の組 (`{ awaiting, failed }` か null) を返す `attentionTransitions` に替え、文は `SessionAttentionAnnouncer.tsx` が `attentionAnnouncement` で組む。`session-view.ts` と `running-session-types.ts` は `./labels` を import しなくなる [P]
  - テスト: 書き換えてよいのは `session-view.monitor.test.ts:342-380` (`announcements`) だけ。名前の組の検査と、`labels.test.ts` の `attentionAnnouncement` の検査に分ける。読み上げの文は `AppShell.test.tsx:455-484` などの既存の component テストが書き換えずに守る
- [ ] **FE-003** [FE] **監視ビューの行の部品を切り出す** (FR-018 (3)): `features/session/RunningSessionList.tsx:248-553` の行の部品 (`RowStatusBadge` / `ElapsedTime` / `RowActivity` / `SessionRowMeta` / `RowTooltip`)・行の操作 (`SessionRowActions`。「閉じる」は `:539-549`)・補助 (`useRowFacts` / `rowContext` / `endNoticeOf`) を `RunningSessionRow.tsx` (新設) に移す。DOM と見た目は変えない (サイドバーの基準画像を取り直さない。plan 申し送り #9)。`RunningSessionList.test.tsx` / `RunningSessionList.monitor.test.tsx` が書き換えずに通る
  - 節の最後に `node node_modules/vitest/vitest.mjs related --run <切り出した 3 つのモジュール>` と型検査 2 本を流して緑を確かめ、切り出した後の `running-session-store.ts` / `RunningSessionList.tsx` / `RunningSessionRow.tsx` / `running-session-monitor.ts` の行数を控える (SH-013 で roadmap に書く)

## 土台 2 — 計量の契約と経路 (domain・agents・renderer)

**Goal**: `meter` の型と検証、行の category と合成、`live-signals` の土台と `sdk-agent-session.ts` の配線、renderer の受け口 (FR-003〜FR-005。data-model §2 / §3)。この節の終わりで振る舞いは今のまま (失敗は `provider-error`、計量は送らない)。

**Independent Test**: domain の単体 (検証と合成)、decoder とストアの単体、既存の agents のテストが書き換えずに通る。

- [ ] **BE-001** [BE] `src/domain/session/meter.ts` (+ `meter.test.ts`。新設) — data-model §2「形」「値の検証」: `MeterUpdate` (`type` で判別する 6 種)・`ModelMeter`・`PermissionModeKey` (6 値 + `unknown`)・`RateLimitStatus`・`RateLimitType`・`AssistantErrorKey` (13 値) と列挙の表 (`Object.create(null)` + `Object.hasOwn`。`transcript-guard.ts:29-40` の方式)。検証と正規化の純関数 (`toPermissionModeKey` / `toAssistantErrorKey` / `toRateLimitStatus` / `toRateLimitType` / 割合 (`utilizationPct`) と時刻 (`resetsAtSec`) / `toModelMeters` (16 件まで・`modelId` は domain の `isValidModelId` (`src/domain/provider/model-catalog.ts:28`) を import して通し、その上に `//`・scheme の無い userinfo の形 (`/^[^/]*:[^/]*@/`)・`mayCarrySecret` (`system-event.ts:47`) の 3 条件だけを足す。文字種の規則を `meter.ts` に別に書かない) / `contextTokensOf`) と、decoder と共有の `decodeMeterUpdate(unknown): MeterUpdate | null` (検証を通した値だけで新しい object を組む)。SDK を import しない。昇格値の綴りはここに置く (Constitution 検証の項目 16 の走査範囲の外) [P]
  - テスト: 数 (NaN・負・Infinity・`MAX_SAFE_INTEGER` 超・秒の `Math.floor`)、費用の範囲、`utilization` の 0〜1 / 1〜100 / 1e9、`resetsAt` の秒 / ms / `1e300`、`contextWindow` の 0 と 1e8 超、`toolUseId` の形 (129 文字・空白・`/`)、`modelId` (落とす: `https://u:p@h/m`・`u:p@h/m`・`//`・129 文字・`-` 始まり・`mayCarrySecret` が真。落とさない: `claude-sonnet-4-5[1m]`・`_` を含む id・Bedrock の ARN (`arn:aws:bedrock:…:inference-profile/…`)・Vertex の `model@date`)、`models` 17 件で 16 件、列挙の `__proto__` / `constructor` / `toString` で `unknown` / null、知らない `type` で null、余分なキーが出力に残らない。どれも例外を出さない (SC-002)
- [ ] **BE-003** [BE] `src/domain/session/transcript-dto.ts` / `system-event.ts` (+ `system-event.test.ts` / `transcript.system-event.test.ts`) — data-model §3: `SYSTEM_EVENT_CATEGORIES` に `api-retry` / `compaction` / `permission-mode` (2 → 5)、`SYSTEM_EVENT_STATUSES` に `retrying` / `compacting` / `changed` (→ 14)、`isTerminalSystemEventStatus` に `changed`。`mergeSystemEvent` (`:171-190`) に task の進み具合の合成の規則 (§3「合成の規則の追加」) を足し、`detail` の符号化と復号の純関数 (`encodeRetryDetail` / `decodeRetryDetail` / `encodeTaskProgress` / `splitTaskDetail`) を足す。`TRANSCRIPT_PART_FIELDS` と `toSystemEventMessage` (過去ログと共有) は変えない [P]
  - テスト: category と status の集合の固定テスト (無ければ足す)、task の行に進み具合が合成されて種類が残る、進み具合だけが続けて来ても種類が残り進み具合は最新、行の無い task への更新は今のまま捨てる、Hook と他の category の合成が今のまま (`detail` が改行で始まらない)、復号できない `detail` で進み具合が null、符号化と復号の往復、`error_status` が null で `-`。回帰: `transcript.ts` (過去ログ) が `status` / `api_retry` / `task_progress` / `thinking_tokens` から行を作らない (plan RK-10)
- [ ] **FE-005** [FE] **中央のヘッダに稼働中だけの口を開ける** (data-model §4 の冒頭。plan「中央のヘッダ」): `features/shell/CenterHeader.tsx` に省略可能な `live` の props (`sessionId`・`runtimeId`・起動の設定のモデル id) を足し、`CenterPane.tsx:78-111` の `RunningCenter` だけが渡す (`PastCenter` は渡さない。稼働中と過去で別々に直さない `CenterHeader.tsx:15` の規則)。部品の描画 (行の右の目盛り、行と会話内検索のバーの間の帯) は FE-020 / FE-032 / FE-040 が足す。既存の `AppShell.test.tsx` の中央のヘッダの観点が書き換えずに通る [P]
- [ ] **BE-002** [BE] `src/domain/session/agent-session.ts` (+ `agent-session.kinds.test.ts`) — `SessionEvent` に `{ kind: 'meter'; meter: MeterUpdate }` を足し、`SESSION_EVENT_KINDS` を 7 → 8 に。固定テスト (`agent-session.kinds.test.ts:11`) を値で直す (FR-015 / SC-006)。`LaunchFailureReason` は US-1 (BE-010) で広げる
- [ ] **BE-004** [BE] `src/agents/live-signals.ts` (+ `live-signals.test.ts`。新設) / `sdk-agent-session.ts` (+ test) — **分岐の集約の土台** (research R-14 / data-model §2「セッションスレッドの状態」): `createLiveSignals({ launchPermissionMode, emit, clock })` を `run()` の closure (`:267-296`) に 1 つ作り (module スコープに置かない)、`onAssistant` / `onUser` / `onResult` / `onSystem` / `onRateLimit` / `onToolProgress` / `dispose` を持たせる。この時点の `onResult` は今と同じ `provider-error` を返し、他は何も送らない (振る舞いは US-1〜US-4 で足す)。SDK も Electron も import せず、SDK のメッセージは構造だけで受ける (`live-tool-results.ts` と同じ構え) [P]
  - `sdk-agent-session.ts` の switch (`:513-562`) の `assistant` / `user` / `result` / `system` の分岐から呼び、`rate_limit_event` / `tool_progress` の分岐を足す (今は `default:` で捨てている)。`case 'fail'` は `onResult` の返す理由で `fail()` する (`:536`)。`finish()` (`:342-356`) の最初で `dispose()`。`emit` は既存の `emit` (`:300-301`) を注入する
  - `Equal<…>` (`:80-84` の型) で `Exclude<PermissionModeKey, 'unknown'>`・`RateLimitStatus`・`RateLimitType`・`AssistantErrorKey`・失敗の subtype の値域を SDK の型と固定する (data-model §2 / plan RK-05)
  - 項目 16: `src/agents/` の非テストのファイルに昇格値の綴りを書かない。`permissionMode` を値位置のキー・shorthand・分割代入で書かない (`scripts/constitution/check.mjs:892-915`。基準は `launchPermissionMode` の名前で受け、SDK のメッセージは `message.permissionMode` の参照で読む)
  - テスト: 既存の `sdk-agent-session.test.ts` / `session-core.test.ts` が書き換えずに通る (成功の result で完了・エラーの result で `provider-error` のまま)。`rate_limit_event` と `tool_progress` を流しても例外も `event` も出ない
- [ ] **FE-004** [FE] **計量の受け口** — `features/session/session-event-decoder.ts` (+ test) / `running-session-types.ts` / `running-session-store.ts` (+ test) / `useSessionMeters.ts` (新設) — data-model §2「renderer の保持」: decoder の `case 'meter'` は `decodeMeterUpdate` を通し、外れたら捨てる。`RunningSessionStoreState` に `meters` の枝 (`SessionMeters`: `lastTurn` / `contextUsed` / `rateLimit` / `permissionMode` / `thinkingTokens` / `toolElapsed`) を足し、`meter` は `patch()` を通さずに書く。`useSessionMeters(sessionId, selector)` で 1 セッションの値を selector で読む [P]
  - 規則: `sessions[id]` が無い (閉じた id を含む) `meter` は捨てる、`close()` の削除の列挙 (`:528-557`) に `meters` を足す、`config` / `lastConfig` / プリセットに書き戻さない、`thinkingTokens` はそのセッションの主ループの assistant の `message` (role が assistant でシステムイベントでない) と `turn` で null、`toolElapsed` は `ReadonlyMap` で `turn` で空・64 を超えたら古いものから落とす、`meter` は `receivedMessages` に数えない (`:286-302`)、終了・失敗の後も `close()` までは最後の値が残る
  - テスト: decoder (`meter` の各 `type`・知らない `type`・`__proto__` のキー・余分なキーを運ばない)、ストア (上の各規則、`meter` の更新で `sessions` の参照が変わらない、2 つのセッションの値が混ざらない、閉じた後の `meters[id]` が undefined)

## US-1 — ターンが失敗した理由が分かる (P1)

**Goal**: 失敗の理由のキーと文言、再ログインの導線の出し分け (spec FR-001 / FR-002)。

**Independent Test**: 分類の純関数の単体 (SDK の result の fixture → 理由のキー) と、失敗の表示の component テスト (SC-001)。

- [ ] **BE-010** [BE] `src/domain/session/agent-session.ts` (+ `agent-session.test.ts`) — `LaunchFailureReason` に data-model §1 の 8 つ (`max-turns` / `max-budget` / `structured-output-retries` / `execution-error` / `auth-failed` / `billing` / `rate-limited` / `api-error`) を足し (10 → 18)、`SessionLaunchRejectReason` のコメントの件数 (16 → 24) と `:26-54` の注記を直す。固定テスト (`agent-session.test.ts:85` の `toHaveLength(10)`) を 18 と値の集合で直す (FR-015)。状態通知の `reasonKey` は `isLaunchFailureReason` が追随し、`status-update.ts` と main の差分は 0 (data-model §1)。renderer の `Record<…>` の足りないキーは同じ節の FE-010 で埋める
- [ ] **BE-011** [BE] `src/agents/session-core.ts` (+ `session-core.test.ts`) — `classifyResultFailure({ subtype, apiErrorStatus, lastAssistantError })` (data-model §1 の表を上から順に評価)。`classifyResult` / `resultAction` は変えない。`session-core.ts:324,333` と `sdk-agent-session.ts:529` のコメントの根拠「V-11 / FR-030」を「X-1 FR-020 / US-4 AC6」に直す (plan 申し送り #20) [P]
  - テスト (SC-001): 表の各行の fixture (401・403・429、`authentication_failed` / `oauth_org_not_allowed` / `verification_required` / `cloud_credential_error`、`billing_error` / `account_on_hold`、`rate_limit`、4 つの subtype、5xx、状態が無い、知らない subtype、知らない列挙)。評価の順 (`billing_error` と 401 で `auth-failed`、`rate_limit` と `error_max_turns` で `rate-limited`、`error_during_execution` と 500 で `execution-error`)。`apiErrorStatus` が 1000・-1・小数なら `provider-error`。X-1 FR-020 / US-4 AC6 の既存のテスト (どの失敗も完了にならない) が緑のまま
- [ ] **FE-010** [FE] `features/session/labels.ts` (+ `labels.test.ts`) — data-model §5 の session の行: 8 つの理由の全文 (`LAUNCH_REJECT_LABELS`)・短い理由 (`LAUNCH_FAILURE_SHORT_LABELS`)、`isReloginFailure` を `auth-failed` と `provider-error` に (data-model §1)。`provider-error` の文言は変えない。テスト: 全理由に全文と短い理由がある (`:40` の網羅)、`isReloginFailure` の 18 理由の真偽、`previousFailureLabel` が新しい理由で同じ全文を出す [P]
- [ ] **BE-012** [BE] `src/agents/live-signals.ts` / `sdk-agent-session.ts` (+ tests) — data-model §1 の材料: `onAssistant` が主ループ (`parent_tool_use_id === null`) の assistant の `error` を `toAssistantErrorKey` で `lastAssistantError` に覚え、`onResult` が `subtype`・`api_error_status` と合わせて `classifyResultFailure` の理由を返し、`lastAssistantError` を消す。`errors` / `result` の文字列を読まない (U-5)
  - テスト: `live-signals.test.ts` (subagent の中の assistant の `error` を使わない・result で消えて次のターンに持ち越さない)、`sdk-agent-session.test.ts` (配線: `api_error_status: 429` の失敗で `failure` が `rate-limited`、同じターンの assistant の `billing_error` で `billing`、知らない形で `provider-error`、成功の result で完了のまま)
- [ ] **FE-011** [FE] **失敗の理由を出す** — `features/session/LivePane.tsx` の `FailureBanner` (`:265-285`)・`RunningSessionRow.tsx` (FE-003) の短い理由とツールチップ・`SessionAttentionAnnouncer.tsx` の読み上げが FE-010 の表から引くようにし、再ログインの導線 (「閉じて起動し直す」) を `isReloginFailure` で出し分ける (data-model §1)。HTTP の状態や `errors` の文字列を出さない
  - テスト (component。vitest-axe。US-1 AC1〜AC6 と AC3a): 401 / 403 で「認証または権限」と再ログインの導線、429 で待つ案内と導線なし (Quota banner が無くても同じ文言。帯を参照しない)、5xx で「API がエラー」、`billing` で請求とアカウントの案内、4 つの subtype が区別される、知らない subtype で `provider-error` と導線、どれも完了の表示にならない、監視ビューの行の短い理由・ツールチップ・読み上げが同じ理由、起動ダイアログに戻ったときの `previousFailureLabel` が同じ全文

## US-2 — 制限と再試行が分かる (P1)

**Goal**: Quota banner と API の再試行の行 (spec FR-003 / FR-004 / FR-006 / FR-007)。

**Independent Test**: agents の変換の単体と、Quota banner・再試行の行の component テスト。

- [ ] **BE-020** [BE] `src/agents/live-signals.ts` / `sdk-agent-session.ts` (+ tests) — `onRateLimit` が `rate_limit_info` の許可リストのフィールド (data-model §2 の表) だけを読み、`meter` の `rate-limit` を送る (間引かない)。`onSystem` の `api_retry` が再試行の行 (data-model §3 の `api-retry`。`retry:<turnSeq>`・`encodeRetryDetail`・`retrying`・`name` は '') を既存の `message` の経路で作り、同じターンの続きは同じ行 (`opens: false`) に合成する。次の主ループの assistant で `succeeded`、result で成功なら `succeeded`・失敗なら `failed` (開いた行があるときだけ)。result で `turnSeq` を +1 し `openRetryRowId` を消す [P]
  - テスト: 許可リストの外 (`overage*`・`limitScope`・`errorCode`・`surpassedThreshold`、`api_retry` の `error`・`no_response`) に目印の文字列を入れ、`emit` した `SessionEvent` の文字列に 0 件。`utilization` / `resetsAt` が無い・範囲外で null。再試行の行の開閉の順、次のターンの再試行が別の id
- [ ] **FE-020** [FE] **Quota banner** — `features/shell/CenterBanners.tsx` (+ `CenterBanners.test.tsx`。新設) / `CenterHeader.tsx` / `labels.ts` — data-model §4「Quota banner」と §5 の shell の `quota*`・`RATE_LIMIT_TYPE_LABELS`: 表示中のセッションの `meters.rateLimit` を `useSessionMeters` で読み、FE-005 の `live` があるときだけ中央のヘッダの行と会話内検索のバーの間に描く。SH-002 で Quota banner を採ったならその部品で描く [P]
  - テスト (component。vitest-axe。US-2 AC1〜AC3 / AC5): `allowed_warning` で注意 (`role="status"`)・種類・割合・解除の時刻、`rejected` で `role="alert"` と待つ案内、`allowed` で消える、別のセッションの帯が出ない (切り替えるとそのセッションの帯)、過去のセッションで出ない、`resetsAtSec` が null で「しばらく待ってから」、`utilizationPct` が null で割合なし、`usingOverage` の文言、今日なら `HH:mm`・別の日なら `M/d HH:mm`、`limitType` の 6 値 (`seven_day_overage_included` を含む) と null・知らない値で「利用枠」、Invalid Date で例外が出ない
- [ ] **FE-021** [FE] **再試行の行** — `components/assistant-ui/elements/thread.aui.tsx` の `SystemEventRow` (`:1005-1078`) / `features/chat/labels.ts` — data-model §5 の chat の行: category `api-retry` のアイコンと文言、status `retrying` / `succeeded` / `failed`、`detail` を `decodeRetryDetail` で `retryDetail` の文言にする (status が `-` なら HTTP の部分を出さない。復号できなければ detail を出さない)。テスト (`LivePane.o2.test.tsx`。US-2 AC4): 同じターンの再試行が同じ行で書き換わる、エラーの中身が DOM に出ない、vitest-axe [P]

## US-3 — 使用量とコンテキストの余裕が分かる (P1)

**Goal**: 使用量のタブ・中央のヘッダの目盛り・タブのキーボード操作とテストの分割 (spec FR-005 / FR-008 / FR-009 / FR-017)。

**Independent Test**: 計量の導出の単体と、右のペインのタブ・中央のヘッダの目盛りの component テスト (SC-003 / SC-007)。

- [ ] **BE-030** [BE] `src/agents/live-signals.ts` (+ test) — data-model §2: `onAssistant` が主ループの assistant の `message.usage` の入力側 3 つの和 (`contextTokensOf`) を `meter` の `context` で送る (前に送った値と同じなら送らない)。`onResult` が `turn` (`costUsd`・`turns`・`models` (`toModelMeters`)・`permissionDenials`) を送る。0 に倒した result (`num_turns === 0 && total_cost_usd === 0`) は送らず `turns` も増やさない。`deniedIds` (1,024 まで) に `permission_denials` の `tool_use_id` を重複を除いて足す。`turn` と再試行の行の閉じは理由を返す前に送る (`fail()` の `ended` より前に届く) [P]
  - テスト (SC-002): result と assistant の許可リストの外 (`result`・`errors`・`usage`・`stop_reason`・`tool_name` / `tool_input`・`modelUsage` の他のフィールド・assistant の本文と出力側の usage) に目印の値を入れ、emit の文字列に 0 件。subagent の中の assistant を使わない、同じ値の `context` を 2 回送らない、0 に倒した result、`turns` が result ごとに +1 (`num_turns` を使わない。research R-08)、拒否の重複を除く数と 1,024 の上限、`/clear` 相当で費用が 0 に戻ってもそのまま送る
- [ ] **FE-030** [FE] **タブのキーボード操作とテストの分割** (FR-017。data-model §6 / research R-12): `features/shell/AppShell.test.tsx` の共通の setup (`:43-303` の固定データ・`FakePort`・`deliverPort`・`setup()`・行の helper) を `src/renderer/src/test-support/app-shell-harness.tsx` (新設) に移し、`AppShell.test.tsx` は import を替えるだけにする (`useTranscript` の `vi.mock` (`:52`) は各テストファイルに残す。テストの本体は変えない)。`RightPanel.tsx` (`:103-126`) の tablist に `onKeyDown` (←/→ で `visibleTabs` の隣・端で反対の端・Home / End で端。移った先を `setPanelTab` で選び、その button にフォーカスを移す) と roving tabindex (選ばれたタブだけ `tabIndex=0`) を入れ、`:22-23` のコメントを済んだ形に直す [P]
  - テスト: `features/shell/RightPanel.tabs.test.tsx` (新設。タブの表を差し替えて 3 つのタブで ←/→・Home / End・端の回り込み・`tabIndex`・出せないタブを飛ばす・vitest-axe)。`AppShell.test.tsx` の既存のテストが通る
- [ ] **FE-032** [FE] **コンテキストと費用の目盛り** — `features/shell/ContextCostMeter.tsx` (+ `ContextCostMeter.test.tsx`。新設) / `CenterHeader.tsx` / `labels.ts` — data-model §4「コンテキストと費用の目盛り」と §5 の `contextMeter` / `contextOver` / `contextMeterLabel` / `costMeter` / `costMeterLabel`: FE-005 の `live` があるときだけ中央のヘッダの行の右に描く。主モデルは起動の設定のモデル id に一致する行、無ければ出力トークンの最も多い行。推定であることを `aria-label` と `title` で伝え、live region にしない。SH-002 で Context display を採ったなら `usage` の上書きで描く [P]
  - テスト (component。vitest-axe。US-3 AC2 / AC4): 割合と費用、80% で注意の見た目、100% 超で `contextOver` (数を出さない)、`contextWindow` が 0・`contextUsed` が null でコンテキストの目盛りなし、`lastTurn` も `contextUsed` も無いと何も出ない、右のペインを畳んでいても出る、過去の会話で出ない、主モデルの照合の 3 段 (data-model §4: 完全一致・末尾の `[1m]` を外して一致 (起動の設定が `…[1m]` でキーが付かない形とその逆)・alias などで一致しないとき出力トークン最多。最多の行が subagent のモデルでも、一致する行があればそちらの `contextWindow` で割る)、別のセッションに切り替えるとそのセッションの値
- [ ] **FE-031** [FE] **使用量のタブ** — `features/shell/panel-tabs.ts` / `src/renderer/src/stores/ui.ts` / `UsageTab.tsx` (+ `UsageTab.test.tsx`。新設) / `labels.ts` — data-model §4「使用量のタブ」と §5 の `usageTab` / `usage*`: タブの表に `usage` を 1 行 (`availableFor: ['none', 'running', 'past']`)、`PanelTabId` に `usage`、`panel-tabs.ts:9` と `ui.ts:25` のコメントを済んだ形に。項目は表示中の稼働中のセッションの `meters.lastTurn` と稼働中のストアの `denied` から出す。表の構造は `dl` か `table` (SH-002 で Cost meter を採ったならその構造)。モデルの id と数はテキストとして描く。費用は `ja-JP` の書式で小数 4 桁まで
  - テスト (component。vitest-axe。US-3 AC1 / AC3〜AC5): 費用・トークンの合計・ターン数・モデルごとの内訳・拒否の 2 行 (聞かれずに・SDK の記録。1,024 で「1,024 件以上」) と `usageEstimateNote`、`lastTurn` が無いと `usageAwaitFirst`、過去で `usageLiveOnly`、未選択で `usageEmpty`、2 つのセッションを切り替えて値が混ざらない、`RightPanel.tabs.test.tsx` の観点が 2 つの本物のタブ (概要・使用量) でも通る

## US-4 — 実行中の進み具合が分かる (P2。AC1a は P1)

**Goal**: 権限モードの変化と警告の帯・圧縮・tool の経過時間・思考のトークン・task の進み具合 (spec FR-010〜FR-013)。

**Independent Test**: agents の変換と間引きの単体 (偽の時計。SC-004) と component テスト。

### AC1a — 安全 3 値の外の権限モード (P1。Principle III。US-4 の他より先に)

- [ ] **BE-040** [BE] `src/agents/live-signals.ts` / `sdk-agent-session.ts` (+ tests) — `onSystem` の `status` と `init` (各ターンの最初に届く。data-model §2 の許可リストの `init` の行。読むのは `permissionMode` だけ) の `permissionMode` を domain の `toPermissionModeKey` に渡し、`modeBaseline` (初期値は起動の設定の権限モード。`launchPermissionMode` で受ける) と違えば `meter` の `permission-mode` と権限モードの行 (data-model §3 の `permission-mode`。`mode:<modeSeq>`・`detail` は鍵・`changed`) を送って基準を更新する。強制 (中断・失敗にする) はしない (U-6) [P]
  - テスト: `plan` で起動し ExitPlanMode の後の `status` が `default` (安全 3 値のまま。AD-041) で `meter` と行が 1 つずつ、同じモードが続けて来ても送らない、昇格値 3 つと知らない値 (→ `unknown`) で `meter` と行 (昇格値の綴りはテストのファイルの中だけ。項目 16 はテストを走査しない)、`permissionMode` の無い `status` で何も送らない。`init`: 起動の設定と同じモードなら何も送らない、昇格値なら `meter` と行が 1 つずつ (起動の直後からの昇格)、`status` で変わった直後に同じモードの `init` が来ても重複しない、`status` を伴わずに次のターンの `init` だけでモードが変わっても `meter` と行が出る。`init` の `permissionMode` 以外 (`cwd`・`tools`・`mcp_servers`・`model`・`slash_commands`・`plugins[].path`・`agents`・`skills` ほか) に目印の値を入れ、emit した `SessionEvent` の文字列に 0 件 (SC-002)
- [ ] **FE-040** [FE] **権限モードの警告の帯** (U-6。data-model §4「権限モード」/ research R-15): `features/chat/labels.ts` に `PERMISSION_MODE_NAMES` (7 値。§5) を置き、`features/session/labels.ts` の `PERMISSION_MODE_LABELS` (`:276-280`) は安全 3 値をそこから取る (文字列は今と同じ)。`features/session/running-sessions-view.ts` / `RunningSessionsProvider.tsx` に `runtimeAutoMode(runtimeId)` (ランタイムの一覧の `autoModeStatus`。読み込み中・引けないは `undetermined`) を足す。`features/shell/CenterBanners.tsx` (FE-020) に、`meters.permissionMode` が null でなく `isSafePermissionMode` (domain `launch-config.ts:27`) が false のときの `unsafeModeBanner` (`role="alert"`) を Quota banner の前に描き、`autoModeStatus` が `unavailable` なら `unsafeModeNoIsolation`、`allowed` と `undetermined` なら `unsafeModeIsolationUnverified` (このセッションの隔離をアプリは確かめていない。data-model §4) を添える。`autoModeAllowed` を表示に使わない [P]
  - テスト (component。vitest-axe。US-4 AC1a): 安全 3 値で出ない、昇格値 3 つと `unknown` で出てモードの名前が入る、隔離の文言 (`unavailable` で「隔離がありません」、`allowed` と `undetermined` で「確かめていません」。`allowed` で隔離されていると読める文言が出ない)、帯の並び (警告の帯 → Quota banner → 会話内検索のバー)、過去のセッションで出ない、起動の設定とプリセットの権限モードが変わらない

### AC1〜AC5 — 権限モードの変化・圧縮・経過時間・思考・task

- [ ] **BE-041** [BE] `src/agents/meter-throttle.ts` (+ `meter-throttle.test.ts`。新設) — data-model §2「間引きと後始末」: 鍵ごと (`thinking`・`tool:<toolUseId>`・`task:<taskId>`) に 1 秒に 1 回 (間隔の中は最後の値だけを持ち、次の 1 秒の境で送る)、セッションあたり直近 1 秒に 20 件まで (超えた分は保留して最新を送る)、同時に追う鍵は 64 まで (超えた新しい鍵は捨てる)、取り消し (tool の鍵 1 つ・`thinking`・全部の tool の鍵・全部と timer)。時計と timer は注入。SDK を import しない [P]
  - テスト (偽の時計。SC-004): 鍵ごと 1 秒に 1 件以下で最後の値が送られる、並列の tool N 個の合計が 1 秒に 20 件以下、65 個目の鍵を捨てる、取り消した鍵の保留を送らない、全部を取り消した後に何も送らず timer が残らない
- [ ] **FE-041** [FE] **「概要」の現在の権限モード** (FR-010。data-model §4「権限モード」): `features/shell/OverviewTab.tsx` (`:97-100`) / `labels.ts` — 「起動時の権限モード」の行は起動時の値のまま、`meters.permissionMode` が null でなく起動時と違うときだけ、その下に `OVERVIEW_LABELS.currentPermissionMode` の行を足す (名前は `PERMISSION_MODE_NAMES`)。中央のヘッダには常設しない。`OverviewTab.tsx:82` と `labels.ts:80` のコメントを済んだ形に。テスト (US-4 AC1): 起動時と同じなら行なし、変わったら行が出て起動時の行は変わらない、過去のセッションで出ない、vitest-axe [P]
- [ ] **FE-042** [FE] **権限モード・圧縮・task の進み具合の行** — `thread.aui.tsx` の `SystemEventRow` / `features/chat/labels.ts` — data-model §3 / §4「進み具合」/ §5 の chat の行: `permission-mode` (`permissionModeChanged` と `PERMISSION_MODE_NAMES`。`detail` の鍵は `Object.hasOwn` で引き、知らない鍵は `unknown` の名前)、`compaction` (`compacting` → `succeeded` / `failed`)、task の行は `splitTaskDetail` の種類 (今の `taskTypeLabel`) の後ろに `taskProgress` の文言を並べ、進み具合が null なら種類だけ [P]
  - テスト (`LivePane.o2.test.tsx`。US-4 AC1 / AC2 / AC5): 3 つの category の文言とアイコン、圧縮の行が成功 / 失敗に書き換わる、task の行に種類が残ったまま進み具合が更新される、task の要約・説明が DOM に出ない、vitest-axe
- [ ] **FE-043** [FE] **tool の経過時間** — `features/chat/transcript-context.ts` / `features/session/LivePane.tsx` / `components/assistant-ui/elements/tool-result-marks.tsx` と呼び出し側の 6 ファイル (`terminal-block` / `code-diff` / `todo-list` / `subagent` (`:83` と `:175` の 2 か所) / `agent-plan` / `tool-fallback` の `.aui.tsx`) / `features/chat/labels.ts` — data-model §4「進み具合」: `LiveSessionPane` がストアの購読から作る安定した値 (tool の id ごとの経過時間と思考のトークンを引き、購読できるもの) を `transcript-context.ts` の context で Thread に渡す (`TranscriptSettledContext` と同じ形。chat は session を import しない)。`ToolResultMarks` は `toolCallId` と結果待ちかを受け、結果待ちの間だけ自分の tool の値を `useSyncExternalStore` で購読して `toolElapsed` の文言で出す。過去ログには context が無いので出ない
  - テスト (US-4 AC3): 経過時間が出て更新される、結果が届くと消える、他の tool の更新で描き直さない (描画の回数)、過去の transcript で出ない、vitest-axe
- [ ] **BE-042** [BE] `src/agents/live-signals.ts` / `sdk-agent-session.ts` (+ tests) — **間引く進み具合と圧縮の行** (data-model §2 / §3): `status` の `compacting` と `compact_result` で圧縮の行 (`compact:<compactSeq>`。開いた行が無いまま結果が来たら結果の状態で作る。`compact_error` を読まない)、`thinking_tokens` の `estimated_tokens` → `thinking`、主ループの `tool_progress` → `tool-elapsed` (`toolUseId` の形を検証)、`task_progress` → 既存の task の行の更新 (`task:<task_id>`・`opens: false`・`encodeTaskProgress`。task ごとの状態を持たない。AD-044 Decision 6)。間引きは BE-041 に任せる。取り消し: `onUser` の `tool_result` でその tool、主ループの assistant と result で `thinking`、result で全部の tool、`dispose()` (`finish()` の最初) で全部
  - テスト (偽の時計。SC-002 / SC-004): 許可リストの外 (`compact_error`・`estimated_tokens_delta`・`tool_name`・`heartbeat`・`subagent_*`・`description`・`summary`・`last_tool_name`) に目印の値を入れて emit の文字列に 0 件、subagent の中の `tool_progress` を捨てる、tool の結果・assistant・result の後に保留の送信が 0 件、`sdk-agent-session.test.ts` で `ended` の後の `event` が 0 件 (終了の後に timer が発火しない)
- [ ] **FE-044** [FE] **思考の印** — `thread.aui.tsx` の 2 つの viewport の footer (`:248-261` / `:536`) の composer の上 / `features/chat/labels.ts` — data-model §4「進み具合」/ research R-07: FE-043 の context から思考のトークンを購読し、`thinkingTokens` の文言 (「思考中 約 N トークン」) を Reasoning の表示の語彙で 1 行出す (SH-002 で Thinking indicator を採ったならその部品)。`role="status"` を重ねて毎秒読ませない。過去ログでは出ない
  - テスト (US-4 AC4): 値が出て更新される、主ループの assistant のメッセージと `turn` で消える、仮想 (41 件以上) と非仮想の両方の footer で出る、読み上げの領域が増えない、vitest-axe

## 預かった義務 — 消えるボタンのフォーカスと Provider の表記 (FR-019 / FR-016)

**Goal**: spec「義務の扱い」の表で O-4 が入れた system-scope の 2 項目を閉じる (FR-017 は US-3、FR-018 は土台 1)。

**Independent Test**: 各部品の component テストのフォーカスの行き先と、文言の表の Grep (SC-007)。

- [ ] **FE-050** [FE] **押したボタンが自分ごと消えるときのフォーカス** (FR-019。data-model §8 / research R-10): `features/session/focus-handoff.ts` (新設) に 2 つの関数 (行を閉じた後の行き先・composer) を置き、5 つの押下の処理が、消える操作の**前**に呼ぶ (押した要素かその部品の中にフォーカスがあるときだけ)。対象: サイドバーの稼働中の行の「閉じる」(`RunningSessionRow.tsx`)、承認カードの「許可」「拒否」(`LivePane.tsx` の `onDecision`)、`QueueRejectionNotice` の「閉じる」、`PendingQueueNotice` の「キューから削除」、「さらに表示」の最後の押下 (`hiddenCount <= MESSAGE_WINDOW`)。composer の入力 (`thread.aui.tsx:649-655`) に `data-composer-input`、`LiveSessionPane` の根に `data-live-pane`、稼働中の区画の見出し (`RunningSessionList.tsx:111` の `h2`) に `tabIndex={-1}` を足す。セレクタは固定の文字列だけ (外部由来の id を入れない)。composer が無効なら移さない。`useFocusRescue` (O-7) は変えない [P]
  - テスト (SC-007): 各行き先で、押した後の `document.activeElement` が body でなく行き先 (「承認待ちで『許可』を押した後、composer にフォーカスがある」を含む)、閉じた行が最後なら前の行・1 行だけなら見出し、フォーカスが別の場所にあるときは動かさない。置き場は各部品の既存のテスト (`RunningSessionList.test.tsx`・`LivePane.test.tsx`・`pending-queue-notice.test.tsx`)
- [ ] **FE-051** [FE] **「Provider」の表記を揃える** (FR-016。research R-13): `features/shell/labels.ts:73` (`SETTINGS_SECTION_LABELS.providers`) と `features/session/labels.ts:313` (`LAUNCH_EMPTY_STATE_LABELS.noProviders`) の「プロバイダ」を「Provider」に。テストの期待値 (`AppShell.test.tsx:585,587,893,1210`。FE-030 の後は行番号が変わる) を同じタスクで直し、`palette-commands.test.ts:133,262-263` の半角カナの例は「ﾗﾝﾀｲﾑ」→「設定: ランタイム」に替える (正規化の検査の意図を保つ)。E2E の locator は 0 件 (先に `e2e/` を Grep して確かめる)。完了の条件: `プロバイダ` が `src/renderer` と `e2e` に 0 件 (quickstart V-3) [P]

## Polish / 記録

- [ ] **SH-010** [SH] **経路を 1 本通すテスト** (SC-002。research R-14) — `tests/meter/meter-through.test.tsx` (新設。renderer の project): SDK のメッセージの fixture (assistant・result・`rate_limit_event`・`status`・`api_retry`・`thinking_tokens`・`tool_progress`・`task_progress`) → `live-signals` → `JSON.stringify` → 偽の port → decoder → 稼働中のストア → DOM (使用量のタブ・中央のヘッダの目盛りと帯・transcript の行) を通す。偽の port は `test-support/running-sessions-harness.tsx` の形を使えるなら使う [P]
  - 観点: 許可リストの外のフィールドに入れた目印の値が `SessionEvent` の文字列と DOM に 0 件、2 つのセッションの値が混ざらない、値の検証の外れ (`__proto__`・長い id・URL の資格情報の形の `modelId`・`resetsAt: 1e300`) で例外が出ない、状態通知 (`SessionStatusUpdate`) のフィールドの差分 0 (X-5 の全フィールドの走査が通る)
- [ ] **SH-011** [SH] **実名リストの規則を追随させる** (plan「機械強制の変更」): `eslint.config.mjs:582-589` の手書きの element の一覧に `tool-result-marks.tsx` (FE-043 で hooks を足す) を足す。SH-002 で取り込んで手を入れた registry の element は同じ一覧か `:605-614` の一覧に足す。`.specify/spec-gate/reviewers.yml` の ui-coverage-reviewer の `auto_invoke_patterns` (`:173-199`) に `src/domain/session/meter*.ts` を足す。取り込んだ registry の element は、手を入れたら a11y / ux の `auto_invoke_patterns` (`:54-64` / `:104-114`) に、入れなければ `exclude_patterns` に実名で足す。`scripts/constitution/allowlists.mjs` と `.dependency-cruiser.js` は変えない (新しい agents のモジュールは `supervisor` で始めず、`worker_threads` を import しない。plan 申し送り #30) [P]
- [ ] **SH-012** [SH] **対応表を書き換える** (FR-014 / SC-005。Principle XII) — `docs/ui-coverage.md` [P]
  - A 節の 7 行 (`:48` result / `:52` status / `:53` api_retry / `:62` tool_progress / `:67` task_progress / `:69` thinking_tokens / `:77` rate_limit_event) を `実装済み: <element> (実行中)`・経路「実行中」に。`result` の備考に「`errors` は出さない (U-5)」「`num_turns` (1 ターンの往復の数) は出さない」「`permission_denials` は件数」
  - E 節の 3 行 (`:195` get_context_usage / `:196` get_session_cost / `:198` get_usage) を `表示不要: <理由>` に (U-3)。Tier A の `get_context_usage` の備考に「Context display は assistant の usage と result の contextWindow の推定で実装済み (経路: 実行中)」「カテゴリ別の内訳は出さない」「AD-047 Decision 4」
  - F 節の 5 行 (`:261` Context breakdown / `:262` Context display / `:264` Cost meter / `:288` Job progress / `:315` Quota banner) と `:340` Thinking indicator の使い道を SH-002 の結論で書く (Context breakdown / Job progress は `未使用` と理由)。D 節に `meter` の行を足し (`SessionEvent` の種類と D 節の行を 1:1 に)、`:175` launch-failure の備考に理由のキーが 18 になったことを書く。A 節の `init` の行 (`:49`。割当は `後続: O-5` のまま) の備考に「`permissionMode` は O-4 が権限モードの比較に使う (表示は権限モードの行と警告の帯)」を足す。`:328` の「プロバイダ」を Provider に
  - `node scripts/constitution/check.mjs` の項目 21 が ok で、出力に割当先が O-4 の行が 0
- [ ] **SH-013** [SH] **charter・roadmap ほかを追随させる** (FR-016。plan の「上流からの申し送り」表の「処理」列と「記録の追随」のとおり) [P]
  - `docs/domains/session/charter.md`: 失敗の理由のキー (再ログインの導線は data-model §1)・`meter` (運ぶ値の範囲は data-model §2)・稼働中のストアの `meters` (永続化しない)。Related Specs に「O-4 (ui)」(U-1 の範囲・FR-018 の切り出し・KPI の計測には使わない)
  - `docs/domains/ui/charter.md`: Related Specs に O-4、`:72` の「プロバイダ」を Provider に (申し送り #17)
  - `docs/roadmap.md`: O-4 の行 (#1。`ResultTermination` は広げず理由のキーを足した・`errors` は運ばない・FR-030 は FR-020 の誤り・Context display は中央のヘッダの目盛り・Cost meter は使用量のタブ。SH-014 の時点で確かめられていない quickstart V-4 の項目と、本番で知らない形を観測する点を足すかの判断 (plan RK-14))、O-6 の行 (#7。圧縮の行と境界の element を統合するか並べるかの判断)、O-8 の (c) (#6。`meter` は `receivedMessages` に数えず、本 feature の新しい行は数える)、I-3 の行 (#8。昇格を観測したときの強制の要否。U-6 / AD-047 Decision 5)、I-2 と I-3 の行 (「O-4 の警告の帯の隔離の文言は暫定で、ランタイムの `autoModeStatus` から導く (`unavailable` 以外は『このセッションの隔離をアプリは確かめていません』)。セッションの隔離状態 (隔離バッジ) が定義されたら置き換える」。data-model §4)、system-scope の 3 項目に「O-4 が持った」と結論 (#2 切り出しと FE-003 で控えた行数・#3 各部品で先に移す・#4 Provider の表記)
  - `docs/domains/_overview.md` の帰属の判断根拠に「O-4 は session の契約の拡張を伴う (U-1 / AD-047)」の 1 行 (#16)。`docs/prompts.md` (#15)
  - `specs/005-session-launch-and-streaming/spec.md` の FR-020 / US-4 AC6 / Edge と `data-model.md` §6 に AD-047 への参照を置く (005 の他は変えない。#20)
  - `docs/decisions/0047-session-meter-and-failure-reasons.md`: 日付つきの「訂正」節を 1 つ足す (AD-031 Decision 1。2026-10-08 に利用者が訂正として扱うと決めた)。中身は plan の ADR 節の #1〜#3 (Context display の材料・運ぶ値の tool の id・昇格値の綴りの置き場) と「決定は変えない」。発見の経緯に design-gate R2 HG-01 / HG-04 を書く。Decision と Consequences の本文は書き換えない
  - AD-046 (accepted) の本文は変えない
- [ ] **SH-014** [SH] **検証** — `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で、lint・型検査 2 本 (`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false` / `… -p tsconfig.web.json …`)・E2E の型検査 (`-p e2e/tsconfig.json`)・依存グラフ・Constitution 検証 (項目 14 / 16 / 21 を含む)・Vitest の全件を通す。E2E (要ビルド) と基準画像は CI の e2e job で通す (基準画像を取り直さない)。quickstart V-1 (境界の差分)・V-2 (対応表)・V-3 (表記) を確かめて `quickstart-results.md` に記録する。V-4 (実機の目視。本番ビルド) は利用者に残す。V-4 の結果 (形は quickstart の「形の控え方」でアプリの外の CLI から数と列挙だけを控える) の直し先は次のとおりで、直すかは利用者の確認の後に決める
  - #1 (失敗の形) → data-model §1 の表と暫定の文言 (plan RK-06)
  - #2 (`modelUsage` のキーの形) → data-model §2 の `modelId` と §4 の主モデルの照合 (plan RK-15)
  - #3 (`/context` との差が ±10% を超えた) → data-model §2 の `contextTokensOf` と §4 の主モデルの照合 (plan RK-08)
  - #4 (`utilization` / `resetsAt` の単位) → data-model §2 の値の検証 (plan RK-07)
  - #5 (`status` と `init` の順) → data-model §2 / §3 の権限モードの比較 (plan RK-09)
  - 結果は `quickstart-results.md` に書く。完了の PR までに確かめられなかった項目は roadmap の O-4 の行に残す (SH-013)

## Backend Tasks (index)

domain / agents に属するタスク: BE-001〜BE-004 (`meter` の型と検証・行の category と合成・`SessionEvent` の種類・`live-signals` の土台と配線) / BE-010〜BE-012 (失敗の理由のキー・分類・材料) / BE-020 (レート制限と再試行の行) / BE-030 (コンテキストとターン) / BE-040〜BE-042 (権限モード・間引き・進み具合と圧縮)。main と preload は変えない (SC-006)。DB migration は無い (計量は永続化しない)。

## Frontend Tasks (index)

renderer に属するタスク: FE-001〜FE-003 (FR-018 の切り出し) / FE-004〜FE-005 (計量の受け口・中央のヘッダの口) / FE-010〜FE-011 (失敗の文言と表示) / FE-020〜FE-021 (Quota banner・再試行の行) / FE-030〜FE-032 (タブのキーボード操作・使用量のタブ・目盛り) / FE-040〜FE-044 (警告の帯・概要・行・経過時間・思考) / FE-050〜FE-051 (フォーカス・Provider の表記)。

## Shared Tasks (index)

docs・規則・通しのテスト・検証: SH-001〜SH-002 (先行) / SH-010 (経路を 1 本通すテスト。API contract に相当するのは `SessionEvent` の種類 `meter` 1 つで、形の正本は data-model §2。contracts/ は作らない) / SH-011〜SH-014 (規則・記録・検証)。E2E は足さない (計量を流す偽の supervisor を作らない。plan のテスト節)。

## 依存と順序

1. **先行** (SH-001 / SH-002) → **土台 1** (FE-001 / FE-002 → FE-003。振る舞いを変えない切り出しを `meters` より前に。plan RK-11) → **土台 2** (BE-001 / BE-003 / FE-005 → BE-002 → BE-004 / FE-004)
2. **US-1〜US-4** は土台の後ならどの順でもよいが、本書の順 (P1 → P2) に進める
   - US-1: BE-010 → BE-011 / FE-010 → BE-012 → FE-011 (BE-010 の型の拡張で落ちる renderer の `Record<…>` は FE-010 が埋める。節の終わりで型検査が通る)
   - US-2: BE-020 / FE-020 / FE-021 は互いに依らない (renderer は FE-004 のストアを読む)
   - US-3: FE-031 は FE-030 (タブのキー操作) の後
   - US-4: AC1a (BE-040 / FE-040。P1 扱い) を先に。FE-040 は FE-020 の `CenterBanners.tsx` に足し、FE-041 / FE-042 は FE-040 の `PERMISSION_MODE_NAMES` を使う。BE-041 → BE-042、FE-043 → FE-044 (context を共有)
3. **預かった義務** (FE-050 / FE-051) は FE-003 (行の部品) の後ならいつでもよい。FE-051 のテストの期待値は FE-030 で移した後のファイルで直す
4. **Polish**: SH-010 は US-1〜US-4 の後。SH-011 / SH-012 は SH-002 の結論を使い、SH-013 の roadmap は FE-003 で控えた行数を使う。SH-014 が最後
5. 節の中の並行の例 (`[P]`): 先行 = SH-001 / SH-002、土台 1 = FE-001 / FE-002、土台 2 = BE-001 / BE-003 / FE-005 と (BE-002 の後) BE-004 / FE-004、US-1 = BE-011 / FE-010、US-2 = BE-020 / FE-020 / FE-021、US-3 = BE-030 / FE-030 / FE-032、US-4 = BE-040 / FE-040 と BE-041 / FE-041 / FE-042、預かった義務 = FE-050 / FE-051、Polish = SH-010〜SH-013

## 実装の進め方

- 本 feature は 1 つの PR で出す (FR-014 の対応表・FR-016 の記録・SC-007 が同じ PR を求める)。節ごとに止めて、節の Independent Test が緑であることを確かめてから次へ進む
- 最初の区切りは 先行 + 土台 1 (既存のテストが書き換えずに緑) + 土台 2 + US-1 (失敗の理由。今いちばん大きい誤案内 (レート制限でも再ログインを案内する) を直す)。次に US-2・US-3、US-4 (AC1a を先に)、預かった義務、Polish の順に積む
