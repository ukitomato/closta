# Implementation Plan: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Branch**: `016-ui-boundaries-and-tool-displays` (`014-ui-metering-and-limits` → `013-ui-app-shell` の上に積んである。実装は O-7 と O-4 のマージの後) | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**未承認の判断を含む** (spec の U-1〜U-5) / **proposed の ADR に依る** (AD-046 / AD-047 / AD-048 / AD-049)。本 plan は design-gate までの成果物で、利用者の承認と O-7 / O-4 / O-5 のマージまで実装に入らない。

## Summary

- 会話の境界と知らせ: agents (O-4 の `live-system-rows.ts`) で `compact_boundary` / `conversation_reset` / `model_refusal_*` / `informational` を O-2 のシステムイベントの行に。拒否の取り消しは `meter` の `retraction` で稼働中のストアから外す。過去ログの divider は Compaction boundary の表示に写す
- tool の専用表示: `Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` を `tool-registry.aui.tsx` に登録。Agent plan を `MarkdownText` で
- 結果の状態の純関数 (data-model §3) と `TranscriptAnnouncer`。ToolFallback の見出しの日本語化
- O-11 に分ける (AD-049)

## Technical Context

- **レイヤ**:
  - domain: `system-event.ts` (category と status)、O-4 の `meter.ts` (`retraction`)
  - agents: `sdk-agent-session.ts` / O-4 の `live-system-rows.ts` (`system` の `compact_boundary` / `model_refusal_*` / `informational` と、トップレベルの `conversation_reset` の分岐)
  - renderer: `running-session-store.ts` (取り消し)、`features/chat/convert.ts` (divider の写し)、`components/assistant-ui/elements/` (`compaction-boundary.tsx`・`file-tool.aui.tsx`・`web-tool.aui.tsx`・`task-tool.aui.tsx` を新設、`tool-registry.aui.tsx`・`agent-plan.aui.tsx`・`tool-fallback.aui.tsx`・`thread.aui.tsx` の `SystemEventRow`)、`features/chat/tool-result-state.ts` (新設)・`TranscriptAnnouncer.tsx` (新設)・`labels.ts`
- **既存の起点**: research R-01〜R-05。`transcript.ts:207` (過去ログの divider)、`transcript-dto.ts:44,134`、`tool-registry.aui.tsx:22-38`、AD-035 D6

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I (パス) | ✅ | `Read` / `Glob` / `Grep` のパスは表示用の文字列。解決しない。UNC の接頭辞を出さない (R-2 FR-042) |
| III / IV / VI / VII / IX / X | ✅ / N/A | 承認・SDK の呼び出し・options・プロセス・main を変えない。行は port で main を経由しない |
| V (資格情報非永続) | ✅ | `api_refusal_explanation`・`preserved_*` を通さない。`informational` は `mayCarrySecret` で隠す。`WebFetch` の URL の資格情報・クエリを出さない |
| VIII | ✅ | 文言は `labels.ts`。`transcript.ts:207` の日本語の label は AD-045 の例外の一覧に足す |
| XI | ✅ | 単体・component テストと実機の目視 (quickstart V-3) |
| XII | ✅ | O-6 の行を同じ PR で書き換え (data-model §5) |
| XIII | ✅ | File tree / Tool call / Web search / Compaction boundary を registry で先に確かめる |
| XIV / XV | ✅ | 用語を先に glossary に。文言は `labels.ts` |

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md)) — transcript の表示、tool 出力の専用表示、`docs/ui-coverage.md`

### Related ADRs

- [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) — O-11 への分割・取り消し・`informational`・Agent plan の markdown: **proposed** (本 feature)
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter` と行の作り方: **proposed** (O-4)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — シェル: **proposed** (O-7)
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当と M3 の完了の条件: accepted
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Tier A の tool の表示 (D6 の Trade-off を読み替える): accepted
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 本文の経路: accepted

### Glossary excerpt

- **システムイベントの行** (O-2) / **計量 (meter)** (O-4) / **Tool group**
- 新しく足す: 会話の境界、結果待ち / 結果不明、O-11

## 上流からの申し送り

```
# 1) spec_id: rg "016-ui-boundaries-and-tool-displays" → 0 件 (本 spec と AD-049 を除く)
# 2) feature ID: rg "\bO-6\b" → roadmap:258 (O-6 の行) / ui-coverage の 30 行と F 節 / constitution:29 / _overview.md / ui charter /
#    AD-044 / AD-020 / 011 一式 (spec・plan・research・tasks・data-model・quickstart-results) / 013・014 の注記 / 004 data-model:48
# 3) 実名リスト方式のルール: 変えない。新設の element と純関数は既存のレイヤ規則に入る
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:258 (O-6 の行) | 対応表の割当・O-2 の pr-gate R2 の 4 項目・V-4 の 4 項目 | **受ける / 送る** — 本 spec の範囲と O-11 (U-1) |
| 2 | ui-coverage の `後続: O-6` と F 節・A / B / C 節の備考の「O-6」 | 書き換え | **受ける** — data-model §5 |
| 3 | 011 quickstart-results V-4 | 利用者の判定と未記録の 4 項目 | **受ける / 送る** — 本 feature の 2 つは両方に耐える規則、残り 2 つは O-11 |
| 4 | 014 data-model §3 / O-4 design-gate arch M-003 | 圧縮の行 (進み具合) と境界 (区切り) の関係を O-6 が決める | **受ける** — 両方を並べて描く (FR-017) |
| 5 | AD-035 D6 Trade-off | Agent plan の markdown は将来課題 | **受ける** — AD-049 Decision 4 |
| 6 | AD-044 / AD-020 の Open Questions の「O-6」 (Hook / Background task / B 節の照合) | 持ち主 | **送る** — O-11。AD-044 (accepted) の本文は変えず、roadmap と charter に記録 |
| 7 | constitution:29 | 項目 21 の件数 | **注記** — 完了の PR で項目 21 の出力が変わる |
| 8 | ui charter の Open Questions の「実行中の task の一覧の要否は O-6」 | 持ち主 | **送る** — O-11 |
| 9 | `transcript.ts:207` | domain が日本語の label を作る | **注記** — AD-045 (proposed) の例外の一覧に足す (O-3 の AD-045 と合わせる) |

## 実装方針

- 行: O-4 の `live-system-rows.ts` に 5 つの category。`conversation_reset` はトップレベルの `type` なので `sdk-agent-session.ts` の switch に `case 'conversation_reset'` を足す。取り消しは `meter` の `retraction` → 稼働中のストアの `removeMessages(sessionId, ids)`
- 表示: `tool-registry.aui.tsx` に 9 つ。`toolResultState` を各専用表示と ToolFallback の見出しで使う。`TranscriptAnnouncer` は thread の中に 1 つで、表示中のセッションのメッセージの変化 (結果のエラー・行の終わり) を見て 1 秒に 1 回までにまとめる
- Agent plan: `agent-plan.aui.tsx` の本文を `MarkdownText` に。既存の XSS の境界のテスト (`<script>` / `javascript:`) を Agent plan にも

## ADR

**AD-049 を proposed で起こした**。O-11 の 2 つの ADR は O-11 の design の前に起こす。

## 機械強制の変更

- `meter` の `retraction` の検証 (id の形と件数) の単体
- tool の振り分けの単体 (9 つの tool が ToolFallback に落ちない)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 未承認の判断 (U-1〜U-5)・AD-046 / AD-047 / AD-048 / AD-049 が覆る | design-gate で止める |
| RK-02 | 取り消しで外したメッセージに、表示中の承認カードや結果待ちの tool が含まれる | 外したメッセージの tool の結果待ち・承認の要求は既存の経路のまま (承認の要求は agents が解決する)。表示だけを外す。テストで固定 |
| RK-03 | 読み上げが多すぎる / 少なすぎる | 1 秒に 1 回のまとめと、対象の限定 (data-model §4)。実機の目視で利用者が確かめる (quickstart V-3) |
| RK-04 | `Grep` の `output_mode` の結果の形が CLI の版で変わる | File tree への写しは `files_with_matches` だけ。それ以外は text |
| RK-05 | V-4 の未記録の項目が本 feature の前提を崩す | 両方の形に耐える規則 (data-model §3)。残りは O-11 |

## Project Structure

```
docs/decisions/0049-boundaries-retraction-and-o11-split.md   (新設。proposed)
src/domain/session/system-event.ts / meter.ts (O-4)
src/agents/sdk-agent-session.ts (+ test) / live-system-rows.ts (O-4)
src/renderer/src/features/session/running-session-store.ts (取り消し)
src/renderer/src/features/chat/convert.ts / tool-result-state.ts (新設) / TranscriptAnnouncer.tsx (新設) / labels.ts
src/renderer/src/components/assistant-ui/elements/compaction-boundary.tsx / file-tool.aui.tsx / web-tool.aui.tsx / task-tool.aui.tsx (新設) / tool-registry.aui.tsx / agent-plan.aui.tsx / tool-fallback.aui.tsx / thread.aui.tsx
docs/ui-coverage.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/roadmap.md / docs/prompts.md
```
