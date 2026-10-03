# Implementation Plan: 計量と制限の表示 (O-4)

**Branch**: `014-ui-metering-and-limits` (今は `013-ui-app-shell` の上に積んである) | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**未承認の判断を含む** (spec の U-1〜U-4) / **proposed の ADR に依る** (AD-046 / AD-047)。本 plan は design-gate までの成果物で、利用者の承認と O-7 のマージまで実装に入らない。

## Summary

セッションスレッドで SDK の `result` / `rate_limit_event` / `status` / `api_retry` / `thinking_tokens` / `tool_progress` / `task_progress` を読み、失敗の理由のキー・`meter`・システムイベントの行に変えて renderer に届ける。renderer は稼働中のストアに最新の計量を持ち、O-7 のシェルの中央のヘッダ (Quota banner・コンテキストの目盛り・権限モード)・右のペインの「使用量」のタブ・transcript の行・tool / Reasoning / task の表示に出す。

- 失敗の理由は純関数 `classifyResultFailure` (data-model §1)。`classifyResult` は変えない
- `SessionEvent` に `meter` (data-model §2)。許可リストのフィールドだけを読み、数と列挙だけを運ぶ
- システムイベントの行に category 3 つ (data-model §3)。part の形は変えない
- 制御要求は呼ばない (AD-047 Decision 4)

## Technical Context

- **Stack**: Electron 39 / React 19 / TypeScript / zustand 5 / Vitest / assistant-ui / `@anthropic-ai/claude-agent-sdk` 0.3.270
- **レイヤ**:
  - domain: `agent-session.ts` (`LaunchFailureReason` +7、`SessionEvent` の `meter`、`SESSION_EVENT_KINDS`)、`meter.ts` (新設。`MeterUpdate` の型・検証 `isMeterUpdate`・SDK のメッセージからの純粋な変換)、`system-event.ts` / `transcript-dto.ts` (category と status の追加)
  - agents: `session-core.ts` (`classifyResultFailure`)、`sdk-agent-session.ts` (switch の `result` / `system` / `rate_limit_event` / `tool_progress` の分岐、`fail(reason)`、間引き)、`meter-throttle.ts` (新設。tool ごと・思考ごとに 1 秒に 1 回。偽の時計で単体)
  - renderer: `session-event-decoder.ts` (`meter` の検証)、`running-session-store.ts` (セッションごとの計量の保持。data-model §2)、`features/session/labels.ts` (失敗の文言)、`features/chat/labels.ts` (行・思考・経過時間)、`thread.aui.tsx` / `SystemEventRow` (category 3 つ)、tool の表示 (見出しの経過時間)、Reasoning、task の行、`features/shell/` (O-7: Quota banner・コンテキストの目盛り・使用量のタブ・権限モード)
- **既存の起点**: research R-01

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I / II / VI | N/A | パス・プラットフォーム差・子プロセスを扱わない |
| III (権限ゲート) | ✅ | 権限モードの変化を表示するだけ。選択肢は変えない。安全 3 値の外のモード (アプリの外で変更) は注意の見た目で出し、アプリから選ばせない |
| IV (SDK 経由) | ✅ | 新しい SDK の呼び出しなし (`AGENT_SDK_ALLOWED_CALLS` の差分 0)。query の options のキー (AD-041 (g)) の差分 0。既に受けているメッセージの分岐を足すだけ |
| V (資格情報非永続) | ✅ | 永続化なし。失敗の文字列・`compact_error`・`api_retry` の `error`・task の要約を運ばない (data-model §2 の許可リスト) |
| VII (supervisor Electron 非依存) | ✅ | agents の変更は分岐と純関数だけ |
| VIII (日本語環境) | ✅ | 新しい文言は `labels.ts`。数の書式は日本語のロケール。composer は変えない |
| IX (main をブロックしない) | ✅ | `meter` は port を通り main を経由しない。間引きで renderer の負荷を上げない (SC-004) |
| X (正本は Claude Code) | ✅ | 表示は SDK のメッセージから導くだけ |
| XI | ✅ | 単体・component テスト・E2E と、実機の目視 (quickstart V-3) |
| XII (ui-coverage) | ✅ | 対応表の O-4 の 10 行と F 節の 5 行を同じ PR で直す (FR-014) |
| XIII (element 優先) | ✅ | F 節の Cost meter / Context display / Quota banner / Job progress を registry で先に確かめる (tasks SH-002)。本番の CSP の下で動くこと |
| XIV / XV | ✅ | 用語を glossary に先に足す。文言は `labels.ts` |

Constitution 自体の変更なし。AD-047 (proposed) は session の契約の拡張を記録する。

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md)) — Mission: Claude Code が emit する情報のすべてに専用表示を与える。Scope: Elements / transcript / `docs/ui-coverage.md`
- 関わる他 domain: `session` (失敗の理由のキーと `SessionEvent` の持ち主。U-1)

### Related ADRs

- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — 計量と失敗の理由のキー: **proposed** (本 feature。未承認)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — シェルの 3 面: **proposed** (O-7) — 置き場所の語彙
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当と M3 の完了の条件: accepted
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) / [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 本文は port で main を経由しない: accepted
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (g) — query の options のキーの固定: accepted (変えない)
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — X-1 のライブストリーム (FR-030): accepted

### Glossary excerpt

- **ui-coverage 対応表**: 割当は実装済み / 後続 / 表示不要
- **システムイベントの行**: transcript の中で Hook / Background task を 1 行で示す表示 (O-2)。本 feature で category を足す
- 新しく足す: 計量 (meter)、Quota banner、コンテキストの使用量の推定、失敗の理由の各キー

## 上流からの申し送り

```
# 1) spec_id: rg "014-ui-metering-and-limits" → 0 件 (本 spec と AD-047 を除く)
# 2) feature ID: rg "\bO-4\b" (docs / PLAN.md / src / constitution / specs の spec・plan・data-model・research・tasks) → 67 件 / 21 ファイル。
#    本 spec・research・data-model・AD-047 と、O-7 (013) の置き場所の注記 (8 件) を除いた残りを下表に割り当てる
# 3) 実名リスト方式のルール: allowlists.mjs の AGENT_SDK_ALLOWED_CALLS / QUERY_OPTION_KEYS (session-core.ts) は変えない。
#    新設の domain/session/meter.ts と agents/meter-throttle.ts は既存のレイヤ規則に入る
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:256 (O-4 の行) | 対応表の割当の 13 項目、失敗の理由は session の契約の拡張 (持ち主の確認は O-4 の design) | **受ける** — US-1〜US-4。持ち主は U-1 / AD-047 |
| 2 | ui-coverage.md:43,47,48,57,62,64,72 | A 節の 7 行 | **受ける** — `実装済み` (FR-014) |
| 3 | ui-coverage.md:190,191,193 | E 節の 3 行 | **受ける** — `表示不要` (U-3) |
| 4 | ui-coverage.md:256,257,259,283,310 | F 節の Context breakdown / Context display / Cost meter / Job progress / Quota banner | **受ける** — 使い道を本 feature の表示に。Context breakdown は「未使用 (カテゴリ別の内訳は出さない。AD-047)」 |
| 5 | constitution:29 | 項目 21 の件数 (O-4 10) | **受ける** — 完了の PR で項目 21 の出力が変わる。Sync Impact Report の数は Constitution の改定のときに直す (本 feature では改定しない。数は検査の出力が正本) |
| 6 | prompts.md:224 | Cost meter / Quota banner / Context display → O-4 | **受ける** |
| 7 | `_overview.md`:63,96 / ui charter:183,186 / AD-044:19,103 / 004 data-model:48 / 011 の spec・plan・research・tasks | O-4 の範囲と domain `ui` | **該当なし (記録のとおり)** — 範囲は変えない。`_overview.md` の帰属の判断根拠に「session の契約の拡張を伴う (U-1)」を 1 行足す |
| 8 | 013 spec / plan / research / tasks | 右のペインのタブの候補 (Context display・Cost meter) | **受ける** — 「使用量」のタブ (FR-008) |

## 実装方針

### 失敗の理由 (US-1)

`classifyResultFailure` を `session-core.ts` に足し、`sdk-agent-session.ts` の `fail('provider-error')` を `fail(classifyResultFailure(message))` に替える。`resultAction` は変えない。renderer の文言 3 種 (全文・短い理由・読み上げ) と `isReloginFailure` を足す。

### 計量 (US-2〜US-4)

domain の `meter.ts` に SDK のメッセージ → `MeterUpdate` の純関数 (許可リストのフィールドだけを読む)。`sdk-agent-session.ts` の switch で `result` (失敗の分類の前に `turn` を emit)・`rate_limit_event`・`tool_progress`・`system` の `status` / `api_retry` / `thinking_tokens` / `task_progress` を分岐する。`thinking` / `tool-elapsed` は `meter-throttle.ts` を通す。`status` の `permissionMode` は前の値と比べて変わったときだけ `meter` と行を出す。

### renderer

decoder の `isMeterUpdate`、稼働中のストアに `meters[sessionId]` (data-model §2 の保持)。O-7 の中央のヘッダに Quota banner と目盛りと権限モード、右のペインのタブの表に `usage`。transcript の `SystemEventRow` に category 3 つ。tool の表示の見出しに経過時間、Reasoning の見出しに思考のトークン、task の行に進み具合。

### 対応表と記録

対応表 (A / E / F 節) → AD-047 は proposed のまま → glossary → session charter (失敗の理由のキーと `meter`) → ui charter → roadmap / `_overview.md`。

## ADR

**AD-047 を proposed で起こした** (本 design の成果物)。accepted は利用者が行う。O-7 の AD-046 も accepted が前提。

## 機械強制の変更

- `SESSION_EVENT_KINDS` (8) と `LAUNCH_FAILURE_REASONS` (17) の固定テスト
- `meter` の許可リストのテスト (SDK の fixture の許可リストの外のフィールドに目印の値を入れ、`SessionEvent` に 0 件)
- 項目 21 (対応表) は既存の検査がそのまま効く

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 未承認の判断 (U-1〜U-4)・AD-046 / AD-047 が覆る | design-gate で止める |
| RK-02 | `rate_limit_event` は claude.ai のサブスクリプションでだけ届き、Bedrock / API キーの Provider では Quota banner が出ない | 出ないのが正しい (制限が無い)。quickstart V-3 で Provider ごとに確かめる |
| RK-03 | `contextWindow` と主ループの `usage` からの推定が実際の使用量とずれる (subagent・圧縮) | 「推定」と明示。カテゴリ別の内訳は AD-047 の再検討の条件 |
| RK-04 | 高頻度のメッセージで renderer の負荷が上がる | 間引き (SC-004)。E2E の負荷の long task の件数を比べる (偽の supervisor は計量を流さないので、agents の単体で回数を固定する) |
| RK-05 | 失敗の理由の判定が SDK の版で変わる (subtype が増える) | 知らないものは `provider-error`。SDK を上げるときは対応表の手順で見直す |

## Project Structure

```
docs/decisions/0047-session-meter-and-failure-reasons.md   (新設。proposed)
src/domain/session/agent-session.ts (+ test) / meter.ts (+ test。新設) / system-event.ts / transcript-dto.ts
src/agents/session-core.ts (+ test) / sdk-agent-session.ts (+ test) / meter-throttle.ts (+ test。新設)
src/renderer/src/features/session/session-event-decoder.ts / running-session-store.ts / labels.ts / session-view.ts (短い理由)
src/renderer/src/features/chat/labels.ts / convert.ts
src/renderer/src/components/assistant-ui/elements/thread.aui.tsx / tool-fallback・専用表示の見出し / reasoning.aui.tsx
src/renderer/src/features/shell/ (O-7: CenterHeader・QuotaBanner・ContextMeter・UsageTab・panel-tabs)
docs/ui-coverage.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/roadmap.md
```
