# Implementation Plan: MCP・プラグイン・コマンドの表示 (O-5)

**Branch**: `015-ui-mcp-elicitation-commands` (O-4 の `meter` に依るので `014-ui-metering-and-limits` (その下に `013-ui-app-shell`) の上に積んである。実装は O-7 と O-4 のマージの後) | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**未承認の判断を含む** (spec の U-1〜U-5) / **proposed の ADR に依る** (AD-046 / AD-047 / AD-048)。本 plan は design-gate までの成果物で、利用者の承認と O-7 / O-4 のマージまで実装に入らない。

## Summary

- MCP の tool (`mcp__*` と MCP の組み込みの 4 tool) を専用の `McpToolCall` で描く (過去ログ・実行中)。名前の純関数で振り分け、表の照合を `Object.hasOwn` に直す
- `init` / `commands_changed` を O-4 の `meter` の `config` / `commands` で運び、右のペインの「構成」のタブに出す
- `auth_status` / `plugin_install` をシステムイベントの行に
- 応答の UI を O-10 に分け、MCP の制御要求を呼ばない (AD-048)

## Technical Context

- **レイヤ**:
  - domain: `session-config.ts` (新設。`config` / `commands` の型・形の検査の定数・SDK のメッセージからの純粋な変換)、O-4 の `meter.ts` (`MeterUpdate` に 2 種類)、`system-event.ts` (category `auth` / `plugin` と status)
  - agents: `sdk-agent-session.ts` (`system` の `init` / `commands_changed` / `plugin_install` と `auth_status` の分岐、前回の構成との比較 (closure)、`Equal<…>` で MCP の状態の値域を固定)、O-4 の `live-system-rows.ts` (`auth` / `plugin` の行)
  - renderer: `features/chat/mcp-tool-name.ts` (新設)、`components/assistant-ui/elements/mcp-tool-call.aui.tsx` (新設) と `tool-registry.aui.tsx` (振り分け・`Object.hasOwn`)、`features/session/ApprovalCard.tsx` (見出し)、`session-event-decoder.ts` (2 種類の検証)、`running-session-store.ts` (`meters` の `config` / `commands`)、`features/shell/` (O-7: 構成のタブ・帯の印)、`features/chat/labels.ts` / `features/shell/labels.ts`
- **既存の起点**: research R-01〜R-04。`tool-registry.aui.tsx:22-38`、`ApprovalCard.tsx:30`、`sdk-agent-session.ts:543-558` (`system` の分岐)

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I / II / VI / VII / IX / X | ✅ / N/A | パス (`cwd`・`path`) を通さない。新しいプロセス・永続化なし。構成は port で main を経由しない |
| III (権限ゲート) | ✅ | 承認の応答の形 (`toPermissionResult`) を変えない。`AskUserQuestion` の回答は O-10 |
| IV (SDK 経由) | ✅ | 新しい SDK の呼び出しなし (`AGENT_SDK_ALLOWED_CALLS`・`QUERY_OPTION_KEYS` の差分 0)。MCP の制御要求を呼ばない |
| V (資格情報非永続) | ✅ | MCP サーバーの `error`・`auth_status` の `output` / `error`・`apiKeySource` を通さない。名前に `mayCarrySecret` |
| VIII | ✅ | 文言は `labels.ts`。名前は 1 行で切り詰め |
| XII (ui-coverage) | ✅ | O-5 の行を同じ PR で書き換え (data-model §5) |
| XIII (element 優先) | ✅ | registry の MCP の tool の element を先に確かめる (tasks SH-002) |
| XIV / XV | ✅ | 用語を先に glossary に。文言は `labels.ts` |

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md)) — Claude Code が emit する情報のすべてに専用表示を与える。Out of scope: 他 domain の操作 UI (MCP サーバーの操作はどの domain でも本 feature では行わない)
- 関わる他 domain: `session` (`meter` の種類の追加。AD-048)

### Related ADRs

- [AD-048](../../docs/decisions/0048-session-config-display-and-answer-ui-split.md) — 構成の運び方・MCP を操作しない・O-10 の分割: **proposed** (本 feature)
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter`: **proposed** (O-4)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — シェル: **proposed** (O-7)
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) Decision 4 — 承認の応答の正の構成: accepted (変えない。O-10 が読み替える)
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (g) — options のキーの固定: accepted (変えない)
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当: accepted
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Tier A の tool の表示: accepted

### Glossary excerpt

- **ui-coverage 対応表** / **システムイベントの行** / **計量 (meter)** (O-4)
- 新しく足す: MCP の tool の表示、セッションの構成、O-10 (Claude Code からの問いに答える UI)

## 上流からの申し送り

```
# 1) spec_id: rg "015-ui-mcp-elicitation-commands" → 0 件 (本 spec と AD-048 を除く)
# 2) feature ID: rg "\bO-5\b" (docs / PLAN.md / src / constitution / specs の spec・plan・data-model・research・tasks)
#    → roadmap:257 (O-5 の行)、ui-coverage の 31 行 (A/C/E/F 節)、_overview.md:64,96、prompts.md:224、ui charter:183,186・:205、
#      constitution:29、AD-044:19,103、004 data-model:48、011 の spec・plan・research・tasks、013 / 014 の注記
# 3) 実名リスト方式のルール: AGENT_SDK_ALLOWED_CALLS / QUERY_OPTION_KEYS は変えない。新設の domain/session/session-config.ts と
#    renderer の mcp-tool-name.ts / mcp-tool-call.aui.tsx は既存のレイヤ規則に入る
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:257 (O-5 の行) | 対応表の割当の範囲、操作画面を含めない、応答を session の control 経路で返す | **受ける / 送る** — 表示は US-1〜US-3。応答は O-10 (U-1)。操作は行わない (U-2) |
| 2 | ui-coverage の `後続: O-5` の行と F 節 | 書き換え | **受ける** — data-model §5 |
| 3 | ui charter:205 (Open Questions) | Tier C の転用は O-5 で判断 | **受ける (閉じる)** — 転用しない (U-5)。charter の Open Questions を閉じる |
| 4 | constitution:29 | 項目 21 の件数 (O-5 21) | **注記** — 完了の PR で項目 21 の出力が変わる (Constitution は改めない) |
| 5 | `_overview.md`:64,96 / prompts.md:224 / AD-044:19,103 / 004 data-model:48 / 011 一式 | O-5 の範囲と domain `ui` | **受ける** — `_overview.md` の Feature 帰属の表に O-10、prompts に O-10 |
| 6 | 013 spec / plan | 右のペインのタブの候補 (Server panel) | **受ける** — 構成のタブ |
| 7 | 014 data-model §2 / AD-047 | `meter` の許可リスト (数・列挙・モデルの id) | **読み替える** — AD-048 Decision 3 |
| 8 | O-4 design-gate security M-001 | `tool-registry.aui.tsx:36` の表の照合 (`??`) | **受ける** — 本 feature が同じファイルを触るので `Object.hasOwn` に直す |

## 実装方針

- MCP の表示: `mcp-tool-name.ts` (純関数) → `tool-registry.aui.tsx` の振り分け (`Object.hasOwn` の表、無ければ MCP の判定、無ければ ToolFallback) → `McpToolCall` (見出し・閉じた入力・結果・印)。承認カードの見出しも同じ関数
- 構成: `session-config.ts` の変換 (許可リストと形の検査) → `sdk-agent-session.ts` の `system` の分岐 (`init` / `commands_changed`、前回と同じなら送らない) → `meter` → decoder → `meters` → 構成のタブと帯の印
- 行: O-4 の `live-system-rows.ts` に `auth` / `plugin`

## ADR

**AD-048 を proposed で起こした**。O-10 の 2 つの ADR (AD-036 Decision 4 と AD-041 (g) の読み替え) は O-10 の design の前に起こす (本 feature では起こさない)。

## 機械強制の変更

- `Equal<…>` で `McpStatusKey` と SDK の `McpServerStatus['status']` を固定
- 構成の許可リストのテスト (通さないフィールドに目印の値を入れて出力に 0 件)
- `tool-registry` の振り分けのテスト (`constructor` / `toString` / `__proto__` の名前で ToolFallback)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 未承認の判断 (U-1〜U-5)・AD-046 / AD-047 / AD-048 が覆る (とくに O-10 への分割) | design-gate で止める |
| RK-02 | O-4 の `meter` が変わる・O-4 が後回しになる | 依存を明記 (Dependencies)。O-4 が覆ったら U-3 を見直す |
| RK-03 | MCP の tool の名前の形がサーバーの命名で崩れる | 分けられない名前は全体を tool 名に (data-model §1) |
| RK-04 | `AskUserQuestion` を承認カードで許可しても回答が届かない (今の不具合のまま) | O-10 が直す。対応表の備考と O-10 の行に書く |
| RK-05 | `init` の `mcp_servers` の `status` が `McpServerStatus` 以外の値を運ぶ | `unknown` に倒す。`Equal` で既知の値域を固定 |

## Project Structure

```
docs/decisions/0048-session-config-display-and-answer-ui-split.md   (新設。proposed)
src/domain/session/session-config.ts (+ test。新設) / meter.ts (O-4) / system-event.ts
src/agents/sdk-agent-session.ts (+ test) / live-system-rows.ts (O-4)
src/renderer/src/features/chat/mcp-tool-name.ts (+ test。新設) / labels.ts
src/renderer/src/components/assistant-ui/elements/mcp-tool-call.aui.tsx (+ test。新設) / tool-registry.aui.tsx
src/renderer/src/features/session/ApprovalCard.tsx / session-event-decoder.ts / running-session-store.ts
src/renderer/src/features/shell/ (O-7: ConfigTab・panel-tabs・帯の印・labels)
docs/ui-coverage.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/roadmap.md / docs/prompts.md
```
