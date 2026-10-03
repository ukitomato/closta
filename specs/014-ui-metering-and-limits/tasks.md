# Tasks: 計量と制限の表示 (O-4)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / agents、`[FE]` renderer、`[SH]` 横断 (docs・規則・検証)。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いの正本は spec の FR / SC、理由のキー・`meter`・行・表示・文言の正本は data-model、方式の理由は research。

**着手の条件**: **O-7 (spec 013) がマージされ、AD-046 / AD-047 が accepted になり、spec の U-1〜U-4 を利用者が承認するまで /cl-implement に入らない。**

**順序の制約**: SH-001 (glossary) → コード。BE-001 (domain の型) → 他。SH-010 (対応表・記録) は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] glossary — 計量 (meter)、Quota banner、コンテキストの使用量の推定、失敗の理由の各キー
- [ ] **SH-002** [SH] element の照合 — registry の Cost meter / Context display / Quota banner / Job progress を実名で照合 (本番の CSP の下で動くこと)。結果の正本は PR の説明
- [ ] **BE-001** [BE] `agent-session.ts` (+ test) — `LaunchFailureReason` +7 (data-model §1)、`SessionEvent` の `meter`、`SESSION_EVENT_KINDS` / `LAUNCH_FAILURE_REASONS` の固定テストを直す
- [ ] **BE-002** [BE] `meter.ts` (+ test。新設) — `MeterUpdate` の型、SDK のメッセージ → `MeterUpdate` の純関数 (data-model §2 の許可リスト)、`isMeterUpdate`。テスト: 各 SDK のメッセージの fixture、許可リストの外のフィールドに目印の値を入れて出力に 0 件、数の検証 (NaN・負・Infinity)、`modelId` の文字の種類

## US-1 — ターンが失敗した理由が分かる (P1)

- [ ] **BE-010** [BE] `session-core.ts` (+ test) — `classifyResultFailure` (data-model §1 の表の各行の fixture、知らない subtype は `provider-error`)。`classifyResult` / `resultAction` は変えない (X-1 FR-030 のテストが緑のまま)
- [ ] **BE-011** [BE] `sdk-agent-session.ts` (+ test) — `fail(classifyResultFailure(message))`
- [ ] **FE-010** [FE] `features/session/labels.ts` / `session-view.ts` — 全文・短い理由・`isReloginFailure` (`auth-failed` / `provider-error`)。テスト: US-1 の AC1〜AC6 (失敗の表示・監視ビューの行の短い理由・読み上げ・再ログインの導線)

## US-2 — 制限と再試行が分かる (P1)

- [ ] **BE-020** [BE] `sdk-agent-session.ts` — `rate_limit_event` → `meter` `rate-limit`、`api_retry` → システムイベントの行 `api-retry`
- [ ] **BE-021** [BE] `system-event.ts` / `transcript-dto.ts` (+ test) — category `api-retry` / `compaction` / `permission-mode` と status の追加 (data-model §3)。`TRANSCRIPT_PART_FIELDS` は変えない
- [ ] **FE-020** [FE] decoder の `isMeterUpdate`、稼働中のストアの `meters` (data-model §2 の保持)
- [ ] **FE-021** [FE] O-7 の中央のヘッダの下の Quota banner (data-model §4)、`SystemEventRow` の `api-retry`。テスト: US-2 の AC1〜AC5 (`resetsAt` / `utilization` が無い、`rejected` の `role="alert"`、セッションごとの帯)

## US-3 — 使用量とコンテキストの余裕が分かる (P1)

- [ ] **BE-030** [BE] `sdk-agent-session.ts` — `result` で `meter` `turn` (失敗の分類の前に emit)
- [ ] **FE-030** [FE] O-7 の右のペインのタブの表に `usage` と `UsageTab`、中央のヘッダのコンテキストの目盛り (data-model §4)。テスト: US-3 の AC1〜AC5 (0 の result で上書きしない、主モデルの選び方、`contextWindow` 0、80% の注意、過去・未選択の空の状態)

## US-4 — 実行中の進み具合が分かる (P2)

- [ ] **BE-040** [BE] `meter-throttle.ts` (+ test。新設) — tool ごと・思考ごとに 1 秒に 1 回、最後の値は次の境で送る (偽の時計。SC-004)
- [ ] **BE-041** [BE] `sdk-agent-session.ts` — `status` (権限モードの変化は前の値と比べて変わったときだけ `meter` と行、圧縮の行)、`thinking_tokens`・`tool_progress` (間引き)・`task_progress` (O-2 の行がある task だけ)
- [ ] **FE-040** [FE] 権限モード (中央のヘッダ・O-7 の「概要」のタブ・安全 3 値の外の注意)、`SystemEventRow` の `compaction` / `permission-mode`、tool の表示の経過時間、Reasoning の思考のトークン、task の行の進み具合。テスト: US-4 の AC1〜AC5

## Polish / 記録

- [ ] **SH-010** [SH] 対応表と記録 (FR-014〜FR-016) — `docs/ui-coverage.md` の A 節 7 行を `実装済み`、E 節 3 行を `表示不要`、F 節 5 行の使い道。項目 21 で割当先が O-4 の行が 0。session charter (失敗の理由のキーと `meter`)、ui charter (Related Specs)、roadmap の O-4 の行、`_overview.md` の帰属の判断根拠に 1 行、`docs/prompts.md`
- [ ] **SH-011** [SH] 検証 — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。状態通知の全フィールドの走査 (X-5) の差分 0。quickstart V-1 / V-2。V-3 (実機) は利用者に残す
