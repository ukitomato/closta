# Implementation Plan: MCP・プラグイン・コマンドの表示 (O-5)

**Branch**: `015-ui-mcp-elicitation-commands` (O-4 の `meter` に依るので `014-ui-metering-and-limits` (その下に `013-ui-app-shell`) の上に積んである。実装は O-7 と O-4 のマージの後) | **Date**: 2026-10-04 (design-gate R1 の後に手当て) | **Spec**: [spec.md](./spec.md)

spec の U-1〜U-7 と AD-046 / AD-047 / AD-048 は 2026-10-05 に利用者が承認した。O-7 / O-4 のマージの後に実装する。

## Summary

- MCP の tool (`mcp__*` と組み込みの 4 tool) を `McpToolCall` で、`AskUserQuestion` を読み取り専用の表示で描く (過去ログ・実行中)。振り分けは完全一致の表 → `mcp__` の判定 → ToolFallback の 2 段 (AD-048 Decision 5)。承認カードは MCP の生の名前を切り詰めずに出し、`AskUserQuestion` に暫定の注記
- `init` / `commands_changed` を O-4 の `meter` の `init-report` / `commands` で運び、右のペインの「構成」のタブに出す (送るかの判定は値の全体、送ったときだけ基準を更新、`meter` の上限に掛けない)。`init` の `permissionMode` を O-4 の比較に渡す
- `auth_status` (最上位の型) / `plugin_install` をシステムイベントの行に
- 項目 16 の P3 の検査を広げる (MCP・プラグイン・スキルの `Query` のメソッド)。過去ログの tool 名を無害化に揃える
- 応答の UI と composer の候補を O-10 に分ける (AD-048)

## Technical Context

- **レイヤ**:
  - domain: `session-init-report.ts` (新設。`init-report` / `commands` の型・読むフィールドだけの入力型・形の検査の定数・純粋な変換)、O-4 の `meter.ts` (`MeterUpdate` に 2 種類、権限モードの比較に `init` を足す)、`system-event.ts` (category `auth` / `plugin`、status `authenticating`、`HOOK_OUTCOMES` の照合を `Object.hasOwn` に)、`transcript.ts` (過去ログの tool 名の無害化。:233)
  - agents: `sdk-agent-session.ts` (`system` の `init` / `commands_changed` / `plugin_install` と、最上位の `auth_status` の分岐。送るかの判定と基準 (closure)。入力型の代入可能性と `McpStatusKey` の `Equal<…>`。SDK の import 文は 1 つ)、O-4 の `live-system-rows.ts` (`auth` / `plugin` の行)
  - renderer: `features/chat/mcp-tool-name.ts` (新設)、`components/assistant-ui/elements/mcp-tool-call.aui.tsx` / `ask-user-question.aui.tsx` (新設) と `tool-registry.aui.tsx` (2 段の振り分け・`Object.hasOwn`)、`features/session/ApprovalCard.tsx` (生の名前・補助の見出し・注記)、`session-event-decoder.ts` (2 種類の検証)、`running-session-store.ts` (`meters` の `initReport` / `commands`・後勝ち)、`features/shell/` (O-7: 構成のタブ・`PanelTab.attention`・帯の印)、`labels.ts`
  - scripts: `scripts/constitution/allowlists.mjs` (`QUERY_MUTATION_METHODS` を 11 足す)、`tests/rule-fixtures/` (違反の fixture と期待表)
- **既存の起点**: research R-01〜R-04。`tool-registry.aui.tsx:22-38`、`ApprovalCard.tsx:30`、`sdk-agent-session.ts:80-82,513-561`、`transcript.ts:233`、`system-event.ts:117`、`allowlists.mjs:419-427`、`check.mjs:917-924`

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I / II / VI / VII / IX / X | ✅ / N/A | パス (`cwd`・`path`) を通さない。URI は要約だけで解決しない。新しいプロセス・永続化なし。構成は port で main を経由しない。`meter` 1 件のバイト数に上限 |
| III (権限ゲート) | ✅ | 承認の応答の形 (`toPermissionResult`) を変えない。承認カードは生の名前を必ず出す。`AskUserQuestion` の回答は O-10 で、今は暫定の注記だけ。`init` の `permissionMode` も昇格の観測に使う |
| IV (SDK 経由) | ✅ | 新しい SDK の呼び出しなし。`Query` のメソッドは `interrupt` だけ (AD-036 §4 P3)。項目 16 の P3 を広げて機械で守る。`AGENT_SDK_ALLOWED_CALLS`・`QUERY_OPTION_KEYS` の差分 0 |
| V (資格情報非永続) | ✅ | `apiKeySource`・auth の `output` / `error` を通さない。名前は allowlist、URI は userinfo / query を捨てる |
| VIII | ✅ | 文言は `labels.ts`。名前は 1 行で切り詰め (承認カードは切り詰めず折り返す)。composer は変えない |
| XII (ui-coverage) | ✅ | O-5 の行を同じ PR で書き換え (data-model §5) |
| XIII (element 優先) | ✅ | registry の MCP の tool / MCP server panel / Question flow の element を先に確かめる (tasks SH-002)。照合の結果で F 節の使い道を決める |
| XIV / XV | ✅ | 用語 (`SessionInitReport` と `SessionLaunchConfig` の区別) を先に glossary に。文言は `labels.ts` |

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md)) — Claude Code が emit する情報のすべてに専用表示を与える。In scope の composer の slash commands は O-10 に送る (U-6)
- 関わる他 domain: `session` (`meter` の種類の追加と未信頼の文字列の区分、過去ログの tool 名の無害化、O-10 の domain の候補。AD-048)

### Related ADRs

- [AD-048](../../docs/decisions/0048-session-config-display-and-answer-ui-split.md) — 構成の運び方・MCP を操作しない・O-10 の分割・tool の登録の 2 段: **accepted** (本 feature で起こし、2026-10-05 に承認)
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter`: **accepted** (O-4。2026-10-05 に承認)。Decision 2 を読み替える
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — シェル: **accepted** (O-7。2026-10-05 に承認)。タブの表に `attention` を足す
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) Decision 4 / §4 P3 — 承認の応答の正の構成と `Query` のメソッドの制約: accepted (変えない。P3 を MCP に当てはめる)
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (e)(f)(g) — env の転送と options のキー: accepted (変えない)
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) Decision 1 — tool の登録: accepted (2 段に読み替える)
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当: accepted

### Glossary excerpt

- **ui-coverage 対応表** / **システムイベントの行** / **計量 (meter)** (O-4) / **SessionLaunchConfig** (選んだ起動の設定)
- 新しく足す: MCP の tool の表示、セッションの構成 (`SessionInitReport`。Claude Code の報告)、O-10

## 上流からの申し送り

```
# 1) spec_id: rg "015-ui-mcp-elicitation-commands" → 0 件 (本 spec と AD-048 を除く)
# 2) feature ID: rg "\bO-5\b" → roadmap:257、ui-coverage の 31 行、_overview.md:64,96,108、prompts.md:224、ui charter:46,183,186,205、
#    constitution:29、AD-044:19,103、004 data-model:48、006 spec:406 (slash commands)、011 一式、013 / 014 の注記
# 3) 実名リスト方式のルール: AGENT_SDK_ALLOWED_CALLS / QUERY_OPTION_KEYS は変えない。QUERY_MUTATION_METHODS は広げる (AD-048)。
#    新設のモジュールは既存のレイヤ規則に入る
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:257 (O-5 の行) | 対応表の割当の範囲、操作画面を含めない、応答を session の control 経路で返す | **受ける / 送る** — 表示は US-1〜US-3。応答と composer の候補は O-10 (U-1 / U-6)。操作は行わない (U-2) |
| 2 | ui-coverage の `後続: O-5` の行と F 節 | 書き換え | **受ける** — data-model §5 |
| 3 | ui charter:205 (Open Questions。既に閉じた形) | Tier C の転用は O-5 で判断 | **受ける** — 答えを「転用しない (AD-048)」に更新 |
| 4 | ui charter:46 / 006 spec:406 / PLAN.md:359 | composer の slash commands (In scope) | **送る** — O-10 (U-6)。charter に持ち主を書く |
| 5 | constitution:29 | 項目 21 の件数 (O-5 21) | **注記** — 完了の PR で項目 21 の出力が変わる (Constitution は改めない) |
| 6 | `_overview.md`:64,96,108 / prompts.md:224 / AD-044:19,103 / 004 data-model:48 / 011 一式 | O-5 の範囲と domain `ui`、M3 の列 | **受ける** — Feature 帰属の表と M3 の列に O-10、帰属の判断根拠に O-10 の domain |
| 7 | 013 data-model §4 (`PanelTab`) | タブの表の形 | **広げる** — `attention` を足す (data-model §3) |
| 8 | 014 data-model §2 / AD-047 | `meter` の許可リストと上限、権限モードの比較 | **読み替える / 足す** — AD-048 の「読み替える箇所」。`init-report` / `commands` は上限に掛けない。`init.permissionMode` を比較に渡す |
| 9 | O-4 design-gate security M-001 / O-5 security M-002 | `tool-registry.aui.tsx:36`・`system-event.ts:117` の `??` / 過去ログの tool 名 (`transcript.ts:233`) | **受ける** — 同じファイルを触るので直す |
| 10 | AD-036 §4 P3 / `allowlists.mjs:372,419-427` | `Query` のメソッドは `interrupt` だけ。denylist は漏れる | **受ける (一部)** — denylist を広げる。正の形への置き換えは項目 16 の持ち主へ (system scope) |
| 11 | O-5 pb M-003 | 項目 14 は最初の `import {…}` しか読まない | **送る (system scope)** — 項目 14 の持ち主へ。本 feature は SDK の import 文を 1 つに保つ |
| 12 | roadmap の O-3 (O-8) の義務 (c) | 観測点 `receivedMessages` の基準 | **注記** — `auth` / `plugin` の行は数え、`init-report` / `commands` は数えない |

## 実装方針

- MCP の表示: `mcp-tool-name.ts` (純関数。`knownServers` は表示中のセッションの `initReport`) → `tool-registry.aui.tsx` の 2 段の振り分け → `McpToolCall` (見出し・閉じた入力・平文の結果)。承認カードは生の名前 + 補助の見出し
- `AskUserQuestion`: 表に登録し `ask-user-question.aui.tsx` で読み取り専用。承認カードに注記
- 構成: `session-init-report.ts` の変換 → `sdk-agent-session.ts` の分岐 (送るかの判定と基準は closure、送ったときだけ更新) → `meter` → decoder → `meters` (後勝ち) → 構成のタブと帯の印 (`PanelTab.attention`)
- 行: O-4 の `live-system-rows.ts` に `auth` (最上位の型) / `plugin`
- 検査: `QUERY_MUTATION_METHODS` に 11 足し、`sdk-query-mcp-control.ts.fixture` (`.setMcpServers(` / `.mcpServerStatus(`) を `tests/rule-fixtures/` に置き期待表に足す

## ADR

**AD-048 を proposed で起こした** (design-gate R1 の後に、AD-036 §4 P3 の適用・未信頼の文字列の区分・読み替える箇所・tool の登録の 2 段を足した)。O-10 の 2 つの ADR は O-10 の design の前に起こす。

## 機械強制の変更

- 項目 16 の P3 の `QUERY_MUTATION_METHODS` を広げ、違反の fixture (AD-048 が根拠)
- 入力型の代入可能性と `McpStatusKey` の `Equal<…>`
- 構成の許可リストのテスト、送るかの判定のテスト、`tool-registry` の振り分けのテスト (既存の 8 つの名前の回帰と非 MCP の名前の負例と prototype のキー)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 仮採用した判断 (U-1〜U-7)・AD-046 / AD-047 / AD-048 が覆る (とくに O-10 への分割と domain) | 2026-10-05 に利用者が推奨案どおり承認した |
| RK-02 | O-4 の `meter` が変わる・O-4 が後回しになる | 依存を明記。O-4 が覆ったら U-3 を見直す |
| RK-03 | MCP のサーバー名に `__` を含み、見出しのサーバー名を取り違える | 構成のサーバー名の最長一致、推定の印、承認カードは生の名前 (data-model §1) |
| RK-04 | `AskUserQuestion` を承認カードで許可しても回答が届かない (今の不具合のまま) | 暫定の注記で利用者に伝える (US-1 AC9)。O-10 が直す |
| RK-05 | `init` の `mcp_servers` の `status` が既知の値以外を運ぶ | `unknown` に倒し、注意の印を付けない |
| RK-06 | `needs-auth` の案内に従っても直らない (Provider が `CLAUDE_CONFIG_DIR` を指定している場合) | 案内に `CLAUDE_CONFIG_DIR` を添える。実機で確かめる (quickstart V-3) |
| RK-07 | 項目 16 の P3 は denylist のままで、将来の `Query` のメソッドを漏らす | 正の形への置き換えを項目 16 の持ち主に送る (system scope の記録に残す) |

## Project Structure

```
docs/decisions/0048-session-config-display-and-answer-ui-split.md   (新設。proposed)
src/domain/session/session-init-report.ts (+ test。新設) / meter.ts (O-4) / system-event.ts / transcript.ts (:233)
src/agents/sdk-agent-session.ts (+ test) / live-system-rows.ts (O-4)
src/renderer/src/features/chat/mcp-tool-name.ts (+ test。新設) / labels.ts
src/renderer/src/components/assistant-ui/elements/mcp-tool-call.aui.tsx / ask-user-question.aui.tsx (+ test。新設) / tool-registry.aui.tsx (+ test。新設)
src/renderer/src/features/session/ApprovalCard.tsx (+ test) / session-event-decoder.ts / running-session-store.ts / labels.ts
src/renderer/src/features/shell/ (O-7: ConfigTab・panel-tabs の attention・帯の印・labels)
scripts/constitution/allowlists.mjs / tests/rule-fixtures/ (sdk-query-mcp-control.ts.fixture・expected.mjs)
docs/ui-coverage.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/roadmap.md / docs/prompts.md
```
