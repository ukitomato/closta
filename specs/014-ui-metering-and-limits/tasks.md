# Tasks: 計量と制限の表示 (O-4)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / agents、`[FE]` renderer、`[SH]` 横断 (docs・規則・検証)。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いの正本は spec の FR / SC、理由のキー・再ログインの導線・`meter`・値の検証・間引き・行・表示・文言の正本は data-model、方式の理由は research。

**着手の条件**: **O-7 (spec 013) がマージされるまで /cl-implement に入らない。** AD-046 / AD-047 の accepted と spec の U-1〜U-6 の承認は 2026-10-05 に済み。 実装の最初に SH-000 (利用者の実機の作業) を済ませる。

**順序の制約**: SH-000 → BE-010。SH-001 (glossary) → コード。BE-001 / BE-002 (domain) → 他。SH-010 (対応表・記録) は最後。

## Shared Tasks (先行)

- [ ] **SH-000** [SH] **認証切れ・課金のエラーの実機の形を採る** (plan RK-06。**利用者の実機の操作**): 認証が切れた状態 (と可能ならクレジット不足) で 1 回送り、result と同じターンの assistant のメッセージ (`error`) を、秘密を消して fixture にする。data-model §1 の表を実際の形に合わせて見直す
- [ ] **SH-001** [SH] glossary — 計量 (meter)、Quota banner、コンテキストの使用量の推定、失敗の理由の各キー、「FailureReason (起動系)」→「起動とターンの失敗」(件数)、「システムイベントの行」の定義に category
- [ ] **SH-002** [SH] [P] element の照合 — registry の Cost meter / Context display / Quota banner / Job progress を実名で照合 (本番の CSP の下で動くこと)。結果の正本は PR の説明
- [ ] **BE-001** [BE] `agent-session.ts` (+ test) — `LaunchFailureReason` +8 (data-model §1)、`SessionEvent` の `meter`、`SESSION_EVENT_KINDS` / `LAUNCH_FAILURE_REASONS` の固定テストを直す
- [ ] **BE-002** [BE] `meter.ts` (+ test。新設) — `MeterUpdate` の型、SDK のメッセージ → `MeterUpdate` の純関数 (data-model §2 の許可リスト)、値の検証の定数と `isMeterUpdate` (agents と decoder で共有)、昇格値のリテラルの置き場。テスト: 各 SDK のメッセージの fixture、許可リストの外のフィールドに目印の値を入れて出力に 0 件、数 (NaN・負・Infinity・`MAX_SAFE_INTEGER` 超・`resetsAt: 1e300`・ms で届いた `resetsAt`・`utilization` の 0〜1 と 0〜100 と 1e9)、id の形 (長すぎる・空白・`/`・`@`)、`modelId` (`https://u:p@h/m`・`mayCarrySecret`)、`models` 17 件、列挙の `__proto__` / `constructor` / `toString`

## US-1 — ターンが失敗した理由が分かる (P1)

- [ ] **BE-010** [BE] `session-core.ts` (+ test) — `classifyResultFailure(result, lastAssistantError)` (data-model §1 の表の各行の fixture。SH-000 の実機の fixture を含む。知らない subtype・列挙は `provider-error`)。`classifyResult` / `resultAction` は変えない (X-1 FR-020 / US-4 AC6 の既存のテストが緑のまま)
- [ ] **BE-011** [BE] `sdk-agent-session.ts` (+ test) — `lastAssistantError` を `run()` の closure に持ち result で消す、`fail(classifyResultFailure(...))`。`Equal<…>` で `SDKAssistantMessageError` の値域を固定
- [ ] **FE-010** [FE] `features/session/labels.ts` / `session-view.ts` — 全文・短い理由・`isReloginFailure` (data-model §1)。テスト: US-1 の AC1〜AC6 と AC3a (失敗の表示・監視ビューの行の短い理由・読み上げ・再ログインの導線・請求の案内)

## US-2 — 制限と再試行が分かる (P1)

- [ ] **BE-020** [BE] `sdk-agent-session.ts` / `live-system-rows.ts` (新設) — `rate_limit_event` → `meter` `rate-limit`、`api_retry` → 行 `api-retry` (連番は closure、result で増やす、次の assistant / result で `succeeded` / `failed`)
- [ ] **BE-021** [BE] `system-event.ts` / `transcript-dto.ts` (+ test) — category と status の追加、`isTerminalSystemEventStatus` に `changed`。`TRANSCRIPT_PART_FIELDS` は変えない。`toSystemEventMessage` には足さない。回帰テスト: `transcript.ts` (過去ログ) が `status` / `api_retry` / `task_progress` から行を作らない
- [ ] **FE-020** [FE] decoder の `isMeterUpdate`、稼働中のストアの `meters` (data-model §2 の保持。`close()` の削除の列挙に入れる、閉じた id には書かない、`config` / `lastConfig` に書き戻さない)。テスト: 閉じた後の `meters[id]` が undefined
- [ ] **FE-021** [FE] O-7 の中央のヘッダの下の Quota banner (data-model §4)、`SystemEventRow` の `api-retry`。テスト: US-2 の AC1〜AC5 (`resetsAt` / `utilization` が無い・Invalid Date で例外が出ない、`rejected` の `role="alert"`、セッションごとの帯、`seven_day_overage_included`)

## US-3 — 使用量とコンテキストの余裕が分かる (P1)

- [ ] **BE-030** [BE] `sdk-agent-session.ts` — `assistant` で `meter` `context`、`result` で `meter` `turn` (失敗の分類の前に emit)
- [ ] **FE-030** [FE] O-7 の右のペインのタブの表に `usage` と `UsageTab`、中央のヘッダのコンテキストと費用の目盛り (data-model §4)。テスト: US-3 の AC1〜AC5 (0 の result で上書きしない、主モデルの選び方、`contextWindow` 0、80% の注意、100% 以上、過去・未選択の空の状態)
- [ ] **FE-031** [FE] **経路の通しのテスト** — SDK の fixture → `meter` の文字列 → decoder → 稼働中のストア → DOM を 1 本通し、2 つのセッションの値が混ざらないこと、許可リストの外の目印の値が DOM に 0 件 (SC-002)

## US-4 — 実行中の進み具合が分かる (P2。AC1a は P1)

- [ ] **BE-040** [BE] [P] `meter-throttle.ts` (+ test。新設) — data-model §2 の間引き・上限・取り消し (`cancel(toolUseId)` / `cancelThinking()` / `dispose()`)。偽の時計のテスト: 1 秒に 1 件、セッションあたり 20 件、並列の tool N 個の合計、結果・assistant の後に保留の送信が 0、`dispose()` の後 (`ended` の後) の `event` が 0、追う tool の数の上限
- [ ] **BE-041** [BE] `sdk-agent-session.ts` / `live-system-rows.ts` — `status` (権限モードの変化は closure の基準 (起動の設定の権限モード) と比べて変わったときだけ `meter` と行。圧縮の行)、`thinking_tokens`・`tool_progress` (間引き)、`task_progress` → 既存の task の行の更新 (`opens: false`。task ごとの状態を持たない)、`finish()` で `dispose()`。テスト: `plan` で ExitPlanMode を承認した後の `status` が安全 3 値のまま (AD-041) の fixture、`bypassPermissions` が届いたら `meter` `permission-mode` と行
- [ ] **FE-040** [FE] 「概要」のタブの権限モードの出所 (`meters ?? config`)、昇格の警告の帯 (`isSafePermissionMode` と `autoModeAllowed`。文言は原因を断定しない)、`SystemEventRow` の `compaction` / `permission-mode`、tool の表示の経過時間、Reasoning の思考のトークン、task の行の進み具合。テスト: US-4 の AC1・AC1a・AC2〜AC5

## Polish / 記録

- [ ] **SH-010** [SH] 対応表と記録 (FR-014〜FR-016) — `docs/ui-coverage.md` の A 節 7 行を `実装済み`、E 節 3 行を `表示不要` (Tier A の `get_context_usage` と `result` の備考)、F 節 5 行の使い道。項目 21 で割当先が O-4 の行が 0。session charter (U-1 の範囲)、ui charter、roadmap (O-4 / O-6 / O-3 (O-8) の義務 (c) / I-3 の行)、`_overview.md` の帰属の判断根拠に 1 行、005 の正本に AD-047 への参照、`docs/prompts.md`
- [ ] **SH-011** [SH] 検証 — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。状態通知の全フィールドの走査 (X-5) の差分 0。quickstart V-1 / V-2。V-3 (実機) は利用者に残す
