# Implementation Plan: MCP・プラグイン・コマンドの表示 (O-5)

**Branch**: `015-ui-mcp-elicitation-commands` (2026-10-09 に main (faafe91。O-7 / O-3 / O-4 のマージの後) から切り直した) | **Date**: 2026-10-09 (/cl-plan で作り直した。旧版は 2026-10-04) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。U-1〜U-7 と AD-048 は 2026-10-05 に利用者が承認した。spec の「未承認」の 3 点 (`.needs-input.md` Q1〜Q3) は推奨案 A を仮採用したまま本 plan も書く (A 以外の回答なら、各節の「Q1〜Q3」の印の箇所を直す)。

## Summary

- MCP の tool (`mcp__*` と組み込みの 4 tool) を `McpToolCall` で、`AskUserQuestion` を読み取り専用の表示で描く (過去ログ・実行中)。振り分けは完全一致の表 (`Object.hasOwn`) → `mcp__` の判定 → ToolFallback の 2 段 (AD-048 Decision 5)。承認カードは MCP の生の名前を切り詰めずに出し、`AskUserQuestion` に暫定の注記。過去ログの tool 名を `sanitizeBody` に揃える
- `init` / `commands_changed` を O-4 の `meter` の `init-report` / `commands` で運び、右のペインの 3 つ目のタブ「構成」と畳んだ帯の注意の印に出す。送るかは変換後の値の全体で決め、送ったときだけ基準を更新し、`meter` の間引きに掛けない
- `auth_status` (最上位の型) / `plugin_install` をシステムイベントの行 (category `auth` / `plugin`) に
- 項目 16 の P3 の `QUERY_MUTATION_METHODS` を 13 広げ (AD-048 Decision 2 の 11 と AD-036 §4 P3 の 2)、集合の pin テスト・`keyof Query` の型の網羅・違反の fixture で固定する
- 応答の UI と composer の候補を O-10 に分け、roadmap・対応表・charter・glossary に記録する (AD-048)

## Technical Context

**Language/Version**: TypeScript (strict)。Electron の renderer は React 19 + assistant-ui `^0.15.19`、supervisor は Node の `worker_threads`

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` ^0.3.270 (型だけ。新しい呼び出しなし)、assistant-ui (`ToolCallMessagePartComponent`)、lucide-react (タブと注意のアイコン)

**Storage**: N/A (構成は稼働中のストアの `meters` に持ち、永続化しない)

**Testing**: Vitest (domain / agents / renderer の単体と component、`tests/meter/meter-through.test.tsx` の通し、`tests/docs/` の pin)、`scripts/rules` の違反の fixture、`node scripts/constitution/check.mjs` (項目 16 / 21)。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 + WSL の claude (アプリの対象のまま。本 feature はプラットフォーム分岐を足さない)

**Project Type**: desktop-app (Electron。main / supervisor (agents) / renderer)

**Performance Goals**: `init-report` はターンに 1 回、`commands` は変化のときだけ。同じ内容は送らない。MCP の表示はサーバー名の購読を `useSyncExternalStore` で自分の値だけにする (経過時間と同じ。research R-05)

**Constraints**: `meter` 1 件 64KB 以下・件数の上限 (data-model §2)。SDK の呼び出し・options のキー・承認の応答の形・`TRANSCRIPT_PART_FIELDS`・`SESSION_EVENT_KINDS`・IPC・preload・main の差分 0 (SC-005)

**Scale/Scope**: FR 15 / SC 5。新しいモジュール 6 (domain 1・renderer 5)。変える既存のモジュールは下の Project Structure

## Constitution Check

`.specify/memory/constitution.md` に基づく。設計の後に見直した結果も同じ。

**NON-NEGOTIABLE**

- [x] **I. パス操作** — N/A: パスを扱わない。`cwd`・プラグインの `path` は読まない (data-model §2)。URI は WHATWG URL で読むだけで解決しない
- [x] **II. プラットフォーム分岐** — N/A: 分岐を足さない
- [x] **III. 権限モード / 権限ゲート** — 承認の応答 (`toPermissionResult`) を変えない。承認カードは MCP の tool の生の名前を必ず出す (承認の判断の正本の識別子)。`AskUserQuestion` は注記だけで回答を送らない (O-10)。`init.permissionMode` の比較は O-4 のまま
- [x] **IV. Agent SDK 経由** — 新しい SDK の呼び出しなし。`Query` のメソッドは `interrupt` だけ (AD-036 §4 P3)。項目 16 の P3 を広げ、pin テストと fixture で固定する (research R-06)。`AGENT_SDK_ALLOWED_CALLS`・`QUERY_OPTION_KEYS` の差分 0。SDK の import 文は 1 つに保つ (`sdk-agent-session.ts:4-13`)
- [x] **V. 資格情報を永続化しない** — `apiKeySource`・`auth_status` の `output` / `error`・`plugin_install` の `error` を通さない。名前は allowlist、URI は userinfo / query / hash と、秘密の形の末尾を捨てる (data-model §1。research R-07)。構成は永続化しない
- [x] **VI. 永続環境** — N/A
- [x] **VII. supervisor は Electron 非依存** — `live-signals.ts` / `sdk-agent-session.ts` に足すのは domain の純関数の呼び出しだけ。Electron・renderer を import しない
- [x] **VIII. 日本語** — composer を変えない (spec Q2)。文言は日本語で `labels.ts`。名前は 1 行で切り詰め、承認カードの生の名前は切り詰めず折り返す (`break-all`)

**Standard**

- [x] **IX. main をブロックしない** — 変換はセッションスレッド、検証は renderer の decoder。main を経由しない
- [x] **X. 正本はアプリ外** — 構成はキャッシュ (最新の値)。閉じたら捨てる
- [x] **XI. 垂直スライス** — US-1〜US-3 はどれも画面で観測できる (承認カード・transcript・構成のタブ・行)
- [x] **XII. 未表示を残さない** — 対応表の `後続: O-5` の 21 行を同じ PR で書き換える (data-model §5)。項目 21 で O-5 が 0、O-10 が 4
- [x] **XIII. element 優先** — registry の MCP の tool / MCP server panel / Question flow の element を実装の最初に照合し、採らないなら理由を PR に書く (research R-03)。承認カードは既存の自作 (`ApprovalPrimitive` は当該版に無い)
- [x] **XIV. Ubiquitous Language** — `SessionInitReport` (Claude Code の報告) と `SessionLaunchConfig` (選んだ設定) を分け、glossary に先に足す。Meter の定義 (種類 6 → 8、運ぶ値) を直す
- [x] **XV. 多言語** — 新しい文言は `features/{shell,chat,session}/labels.ts` (data-model §6)。`ApprovalCard.tsx` の既存の直書きは増やさない (注記は `session/labels.ts` から取る)

**Domain charter の整合**

- [x] ui charter の In scope (tool 出力の専用表示・対応表の維持・右のペインのタブ) に収まる。composer の slash commands (In scope) の持ち主を O-10 に書き換える (U-6)
- [x] Out of scope に踏み込まない。session の契約 (`meter` の種類) を広げるのは O-4 と同じ形の例外で、AD-048 で承認済み。session charter と `_overview.md` の帰属の判断根拠に記録する

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements / Tool UI の実装、tool 出力の専用表示、composer (slash commands を含む)、`docs/ui-coverage.md` の維持、アプリのシェル (右のペインのタブの表)。セッションの起動ロジックと状態遷移は `session` (ui は表示する)
- 関わる他 domain: `session` ([charter](../../docs/domains/session/charter.md)) — `meter` の種類の追加と未信頼の文字列の区分、過去ログの tool 名の無害化、O-10 の domain

### Related ADRs

- [AD-048](../../docs/decisions/0048-session-config-display-and-answer-ui-split.md) — 構成を `meter` で運び、MCP・プラグイン・スキルを操作せず、問いに答える UI を O-10 に分ける: **accepted** — 本 feature の決定の正本 (Decision 1〜5)
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — 計量 (`meter`) と失敗の理由: **accepted** (O-4) — Decision 2 の運ぶ値を AD-048 Decision 3 が読み替える。AD-048 への参照の訂正節を足す (spec FR-014。Q1)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — アプリのシェル: **accepted** (O-7) — タブは 1 か所の表に登録する。本 feature は `PanelTab` に `attention` を足す
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) Decision 4 / §4 P3 — 承認の応答の正の構成と `Query` のメソッドの制約: **accepted** — 変えない。P3 を MCP・プラグインに当てはめる
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (e)(g) — env の転送禁止と options のキー: **accepted** — 変えない (`plugin_install` が通常届かない理由)
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) Decision 1 — tool の登録と ToolFallback: **accepted** — AD-048 Decision 5 が 2 段に読み替える
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当と M3 の完了の条件: **accepted** — `後続` は roadmap に実在する未完了の ID に限る (O-10 を同じ PR で登録する)
- [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 1 — accepted の ADR の訂正の規則: accepted — AD-047 の訂正節の形

### Glossary excerpt

- **Approval card**: `canUseTool` の permission 要求に応答する UI。単発承認と capability 付与を区別する
- **Meter (計量)**: 実行中のセッションの最新の値。`SessionEvent` の `meter` で届き、稼働中のストアの `meters` に持つ。種類は今 6 つ。運ぶのは数・真偽・列挙・モデルの id・形を検証した tool の id だけ (本 feature で種類と運ぶ値の記述を直す)
- **System event row (システムイベントの行)**: transcript の中で出来事を 1 つにつき 1 行で示す表示。同じ出来事の後続は同じ行に合成する (`mergeSystemEvent`)。O-4 の行の組み立ては agents に置き、過去ログの変換には足さない
- **SessionLaunchConfig**: セッション起動時に選択される設定の組 (起動時のモデルを含む)。本 feature の `SessionInitReport` (Claude Code が報告した構成) とは別物
- **Shell / Panel tab (右のペインのタブ)**: 右の面のタブ。1 か所の表 (`panel-tabs.ts`) に登録する。既定で畳む
- **ui-coverage 対応表**: 割当は `実装済み` / `後続` (roadmap に実在し、完了していない feature の ID) / `表示不要`。M3 の完了の条件は Tier A の後続のうち割当先が M3 の行が 0
- **Composer**: `ComposerPrimitive.Input` を用いる入力欄 (本 feature は変えない)
- 新しく足す: MCP の tool の表示、セッションの構成 (`SessionInitReport`)、O-10 の範囲

## 上流からの申し送り

実行したコマンド (Grep ツール。ripgrep):

```
# 1) spec_id (frontmatter の spec_id: 015-ui-mcp-elicitation-commands)
rg -n "015-ui-mcp-elicitation-commands" docs/ .specify/ tests/ specs/ -g "*.{md,mjs,js,yaml,yml}"
#    → 15 件。本 spec のディレクトリ 12 件 (spec / 旧 plan / R1 の reviewer の出力)・AD-048:15・
#      specs/016 の design-gate R2 の出力 2 ファイル 4 件 (security:87,257 / platform-boundary:130,237)
# 2) feature ID (frontmatter の feature_id: O-5)
rg -n "\bO-5\b" docs/ .specify/ tests/ scripts/ src/ -g "*.{md,mjs,js,ts,tsx,yaml,yml}"   → 54 件 / 12 ファイル
rg -n "\bO-5\b" specs/                                                                → 97 件 / 31 ファイル (本 spec のディレクトリ 60 件は自己参照)
# 3) 新設するモジュール名
rg -n "session-init-report|SessionInitReport|mcp-tool-name|mcp-tool-call|McpToolCall|ask-user-question|ConfigTab|init-report" \
   docs/ .specify/ tests/ scripts/ src/ .dependency-cruiser.js eslint.config.mjs              → 1 件 (AD-048:36)
# 4) 実名リスト方式のルール (research R-08)
#    eslint.config.mjs:588-594 (手書きの element) / .specify/spec-gate/reviewers.yml:54-64,107-117,183-188 /
#    allowlists.mjs:420-427 (QUERY_MUTATION_METHODS) / .dependency-cruiser.js (renderer の実名 0 件)
```

総ヒット 151 件 (1) と自己参照を除く。2) の docs 以下と specs の他 spec を下に束ねた) と 3) の 1 件・4) の実名リストに、次の処理を割り当てた。

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:362 (O-5 の行) | 対応表の割当の範囲、操作画面を含めない、応答を session の control 経路で返す、右のペインのタブの候補 Server panel | **受ける / 送る** — 表示は US-1〜US-3、Server panel は「構成」のタブ (FR-009)。応答と composer の候補は O-10 (U-1 / U-6)。操作は行わない (U-2)。行の依存に O-4 を足し、題から Elicitation を外す (FR-015) |
| 2 | ui-coverage.md:49,61,63,72,78,129-134,139,195-223 (21 行) と F 節 :244,256,266,268,273,297,298,315,346 | `後続: O-5` の行と F 節の備考 | **受ける** — data-model §5 の書き換え先。項目 21 で O-5 が 0、O-10 が 4 |
| 3 | 014 ui-coverage-reviewer pr-gate:86-91 | `init` の行 (:49) の経路が `なし` のまま、`permissionMode` は O-4 が実行中に表示している。O-5 が書き換えるときに経路を落とさない | **受ける** — §5 の `init` の行は経路 `実行中`、備考に `permissionMode` の O-4 の記述を残す |
| 4 | ui charter:50 / :253-254 / :234 | composer の slash commands (In scope)、Tier C の転用 (O-5 で判断)、Related Specs の残り | **受ける / 送る** — slash commands の持ち主を O-10 に、Open Questions の答えを「転用しない (AD-048 Decision 4)」に、Related Specs に O-5 を足す (FR-015) |
| 5 | _overview.md:65 / :100-101 | Feature 帰属の表 (O-5 の題に Elicitation)、O-4〜O-6 は `ui` | **受ける** — O-5 の題、O-10 の行 (domain `session`)、帰属の判断根拠に「O-5 は `ui` のまま session の契約 (`meter` の種類) を広げる」と O-10 の domain (FR-015) |
| 6 | prompts.md:224 / AD-044:19,88,103 / 004 data-model:48 / 011 一式 (spec / plan / research / tasks / reviewer) | O-2 が O-5 に割り当てた記録 (履歴) | **該当なし (履歴)** — 割当の出所の記録で、新しい義務を課さない。prompts.md には O-10 のプロンプトを足す (FR-015)。AD-044 は accepted で変えない |
| 7 | constitution:57 | 項目 21 の件数の記録 (O-5 21) | **注記** — 完了の PR で項目 21 の出力が変わる (O-5 0 / O-10 4)。Constitution は改めない (件数は版の記録) |
| 8 | roadmap:189-194 / :196-204 / 012 plan RK-08 / 012 spec:358 / 013 arch pr-gate:86-87 / 014 spec:58 | composer の英語の名前と、ターンの開始でのフォーカスの奪取 (持ち主 = O-5 と X-6 の早いほう) | **送る** [Q2。未承認] — 持ち主を「O-10 と X-6 の早いほう」に付け替える (FR-015)。O-5 は composer とその E2E・基準画像に触れない |
| 9 | 013 data-model §4 (`PanelTab`) / panel-tabs.ts:11 / stores/ui.ts:26 | 後続 feature がタブの表に行を足す | **広げる** — `config` の行と `PanelTab.attention` (data-model §3)。2 つのファイルの注記の「O-5 の Server panel」を実装に合わせる |
| 10 | 013 data-model:134 / OverviewTab.tsx:86 / shell labels.ts:85 | 実行中のモデルの変化を描くのは O-5 (`init` の `model`) | **受ける** — 「構成」のタブの「Claude Code が報告したモデル」。「概要」の「起動時のモデル」は変えない (spec Clarifications)。2 つの注記を「構成のタブ」に合わせる |
| 11 | 014 data-model §2 / AD-047 / glossary Meter / session charter:134-137 | `meter` の許可リストと上限、権限モードの比較、「運ぶのは数・真偽・列挙…」 | **読み替える / 足す** — AD-048 の読み替え。`init-report` / `commands` は間引きに掛けない。`init.permissionMode` は O-4 のまま。glossary と session charter の記述を直す (FR-015) |
| 12 | AD-048:28 (読み替える箇所) / AD-047:40-48 | AD-047 に AD-048 への参照を足すはずが、参照の無いまま accepted | **受ける** [Q1。未承認] — AD-047 に日付つきの訂正節 (AD-031 Decision 1) で参照だけを足す (FR-014)。本文は変えない |
| 13 | O-4 design-gate security M-001 / O-5 R1 security M-002 | `tool-registry.aui.tsx:36`・`system-event.ts:118` の `??` の照合 / 過去ログの tool 名 (`transcript.ts:233`) | **受ける** — 同じファイルを触るので直す (FR-001 / FR-003 / data-model §4) |
| 14 | spec FR-014 「`METER_UPDATE_TYPES` の固定テストを直す」 | 固定テストは今無い (`meter.test.ts` に集合の検査なし) | **読み替える** — 「足す」と読む (data-model §2)。spec の字面の誤りで、決定は変わらない |
| 15 | AD-036 §4 P3 / allowlists.mjs:419-427 / check.mjs:917-924 / specs/016 platform-boundary R2:120-139 (M-102) | `Query` のメソッドは `interrupt` だけ。denylist は漏れる。fixture は項目の単位で照合し、既存の fixture は昇格値でも発火する。集合の pin テストが無い | **受ける (一部) / 送る** — 13 を足し (AD-048 の 11 と P3 の `reloadOutputStyles` / `backgroundTasks`)、集合の pin テスト・`keyof Query` の型の網羅・1 本の fixture・既存の fixture の引数の差し替え (research R-06)。正の形 (`interrupt` 以外を違反、`queryHandle` の型を絞る) は項目 16 の持ち主へ (system scope。roadmap に記録) |
| 16 | specs/016 security R2:77-98 (M-001) | URI の要約の「最後のパスの要素」は webhook などの秘密を出す。O-5 の同じ規則を名指し | **受ける** — 最後の要素はファイル名らしい形のときだけ (data-model §1。research R-07)。Q3 (a) を狭める向き |
| 17 | eslint.config.mjs:588-594 | 手書きの element の一覧 (`GENERATED_FILES` の緩めた lint を戻す) | **足す** — `mcp-tool-call.aui.tsx` / `ask-user-question.aui.tsx` |
| 18 | reviewers.yml:52-64 / :105-117 / :183-188 | a11y / ux の手書きの element の一覧 (「足したらここにも足す」)、ui-coverage の SDK 変換の domain のモジュール | **足す** — 同じ 2 つの element を a11y / ux に、`src/domain/session/session-init-report*.ts` を ui-coverage に |
| 19 | O-5 R1 platform-boundary M-003 | 項目 14 は最初の `import {…}` しか読まない | **送る (system scope)** — 項目 14 の持ち主へ。本 feature は SDK の import 文を 1 つに保つ |
| 20 | roadmap:364 (O-8 の行の (c)) | 観測点 `receivedMessages` の基準の変化を並べて書く | **注記** — `auth` / `plugin` の行は `message` なので数え、`init-report` / `commands` は `meter` なので数えない (FR-015) |
| 21 | roadmap の system-scope: `runtime-store.ts` の single-flight / 直近の活動の不可視文字 / `running-session-store.ts` の切り出し・消えるボタン・Provider の表記 | 持ち主 = 次に触る feature | **当たらない** — spec「義務の扱い」の表のとおり。`sanitizeBody` は呼ぶだけで集合を変えない |

## 実装方針

1. **domain** — `session-init-report.ts` (新設): `init-report` / `commands` の型、読むフィールドだけの入力型 (`SessionInitReportInput` / `CommandsChangedInput` / `AuthStatusInput` / `PluginInstallInput`)、形の検査の定数、変換 (SDK → 値) と decoder (未信頼 → 値)、送るかの判定に使う決まった順の直列化。`meter.ts` は `MeterUpdate` / `METER_UPDATE_TYPES` に 2 種類を足し、`decodeMeterUpdate` の switch から新しい decoder を呼ぶ。`system-event.ts` / `transcript-dto.ts` に category と status。`transcript.ts:233` の無害化
2. **agents** — `live-signals.ts`: `onSystem` の `init` で構成を読み足す (権限モードの扱いは変えない)・`commands_changed`・`plugin_install`、新しい `onAuthStatus`。送るかの判定の基準と `auth` / `plugin` の行の連番は closure。`sdk-agent-session.ts`: `case 'auth_status'` を足し、入力型の代入可能性と `McpStatusKey` の `Equal<…>`、`keyof Query` の網羅 (research R-06 (2)) を `:91-108` の並びに足す
3. **renderer の経路** — `session-event-decoder.ts` は変えない (`decodeMeterUpdate` が新しい種類を通す)。`running-session-types.ts` の `SessionMeters` に `initReport` / `commands` / スラッシュコマンドの名前の集合の出所、`running-session-store.ts` の `applyMeter` に 2 つの枝 (合流の規則は data-model §2「renderer の保持」。`slashCommands` の変わらない `init-report` は出所を変えず、説明と hint は最新の `commands` から引く)
4. **MCP の表示** — `features/chat/mcp-tool-name.ts` (純関数と URI の要約) → `tool-registry.aui.tsx` の 2 段 → `mcp-tool-call.aui.tsx`。サーバー名は `transcript-context.ts` の `LiveProgressSource.mcpServerNames()` (research R-05)。`ask-user-question.aui.tsx` を表に登録
5. **承認カード** — `ApprovalCard.tsx` に `mcpServerNames` の props、MCP なら生の名前 + 補助の見出し、`AskUserQuestion` なら注記 (`session/labels.ts`)。`LivePane.tsx` が渡す
6. **シェル** — `stores/ui.ts` の `PanelTabId` に `config`、`panel-tabs.ts` に行と `attention`、`ConfigTab.tsx` (新設)、`RightPanel.tsx` の畳んだ帯のアイコンに印。テストは `RightPanel.tabs.test.tsx` と `ConfigTab.test.tsx`
7. **検査と記録** — `allowlists.mjs`・pin テスト・fixture (research R-06)、実名リスト (#17 / #18)、docs (FR-012〜FR-015。対応表は data-model §5)

## ADR

- **AD-048 は accepted。本文は変えない** (FR-014)
- **AD-047 に訂正節を足す** [Q1。未承認]: 見出し「訂正: AD-048 への参照 (2026-10-xx / O-5)」。中身は「Decision 2 の運ぶ値は AD-048 Decision 3 が読み替える (形の検査を通った未信頼の名前と説明)。AD-048 の『読み替える箇所』が proposed のうちに足すとしていた参照を、accepted の後に訂正として足す」だけ。Decision・Consequences は書き換えない。Q1 が B なら足さず、spec FR-014 の該当の文を消す
- 新しい ADR は起こさない。O-10 の 2 つの ADR (AD-036 Decision 4 と AD-041 (g) の読み替え) は O-10 の design の前に起こす (roadmap の O-10 の行に書く)

## 機械強制の変更

- 項目 16 の P3: `QUERY_MUTATION_METHODS` に 13 (AD-048 Decision 2 の 11 と、AD-036 §4 P3 を根拠に `reloadOutputStyles` / `backgroundTasks`。ADR 不要)。集合の pin テスト (`tests/docs/`。19 個。「外すには ADR」)、`sdk-agent-session.ts` の `keyof Query` の網羅 (`Equal<Exclude<…>, never>`)、違反の fixture 1 本 (`tests/rule-fixtures/b-equivalent/sdk-query-mcp-control.ts.fixture`。`.reconnectMcpServer(` だけ) と期待表、既存の fixture の引数を `'default'` に (research R-06)
- tsc: 入力型の代入可能性と `McpStatusKey` の `Equal<…>` (`sdk-agent-session.ts`)。`Record<SystemEventCategory | SystemEventStatus, …>` の表が漏れを落とす
- 固定テスト: `METER_UPDATE_TYPES` (新設。8)、`SYSTEM_EVENT_CATEGORIES` (5 → 7)・`SYSTEM_EVENT_STATUSES` (14 → 15)。`SESSION_EVENT_KINDS`・`QUERY_OPTION_KEYS`・`TRANSCRIPT_PART_FIELDS` は変えない
- 振り分けのテスト: 既存の 8 つの名前の回帰、非 MCP の名前 (`mcp_x`・`MCP__a__b`・`xmcp__a__b`) と prototype のキー (`constructor`・`__proto__`・`toString`) が ToolFallback
- lint と reviewer の発火: #17 / #18

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | `.needs-input.md` Q1〜Q3 の回答が A 以外 | 各箇所に Q の印を付けた (spec・本 plan・data-model §1)。B / C なら該当の FR・data-model の節・tasks を直す。O-5 は design-gate で止める (`.needs-input.md` の回答欄) |
| RK-02 | MCP のサーバー名に `__` を含み、見出しのサーバー名を取り違える | 構成のサーバー名の最長一致、推定の印、承認カードは生の名前 (data-model §1) |
| RK-03 | `AskUserQuestion` を承認カードで許可しても回答が届かない (今の不具合のまま) | 暫定の注記 (US-1 AC8)。O-10 が直す |
| RK-04 | `init` の `mcp_servers` の `status` が既知の値以外 | `unknown` に倒し、注意の印を付けない |
| RK-05 | `needs-auth` の案内に従っても直らない (Provider が `CLAUDE_CONFIG_DIR` を指定している場合) | 案内に `CLAUDE_CONFIG_DIR` を添える。実機で確かめる (quickstart V-3) |
| RK-06 | 項目 16 の P3 は denylist のままで、将来の `Query` のメソッドを漏らす | pin テストで集合の退行は止める。正の形は項目 16 の持ち主に送る (roadmap の system scope に記録) |
| RK-07 | URI の末尾を落とす規則で、resource の見出しの情報が減る | 中身 (閉じた入力の JSON) には URI 全体が残る (O-2 の無害化と上限)。見出しは識別の補助 |
| RK-08 | 旧 `tasks.md` (2026-10-04) と旧 R1 の reviewer の出力が残っている | `/cl-tasks` が本 plan から tasks.md を作り直す。R1 の出力は記録として残す |

## Project Structure

### Documentation (this feature)

```text
specs/015-ui-mcp-elicitation-commands/
├── plan.md          # 本ファイル
├── research.md      # R-01〜R-08
├── data-model.md    # §1〜§6 (規則の正本)
├── quickstart.md    # 自動で見ない確認
└── tasks.md         # /cl-tasks が作り直す
```

contracts/ は作らない。外部に出す interface は無く、`meter` の形 (supervisor と renderer の間の内部の契約) の正本は data-model §2。

### Source Code (repository root)

```text
src/domain/session/
├── session-init-report.ts (+ test)   # 新設
├── meter.ts (+ test)                 # MeterUpdate / METER_UPDATE_TYPES / decodeMeterUpdate
├── system-event.ts (+ test)          # Object.hasOwn・固定テスト
├── transcript-dto.ts                 # category auth / plugin・status authenticating
└── transcript.ts (+ test)            # :233 の無害化
src/agents/
├── live-signals.ts (+ test)          # init / commands_changed / plugin_install / onAuthStatus
└── sdk-agent-session.ts (+ test)     # case 'auth_status'・Equal<…>
src/renderer/src/
├── features/chat/
│   ├── mcp-tool-name.ts (+ test)     # 新設
│   ├── transcript-context.ts         # mcpServerNames / useLiveMcpServerNames
│   └── labels.ts                     # 行・MCP・問いの文言
├── components/assistant-ui/elements/
│   ├── mcp-tool-call.aui.tsx (+ test)        # 新設
│   ├── ask-user-question.aui.tsx (+ test)    # 新設
│   ├── tool-registry.aui.tsx (+ test 新設)   # 2 段・Object.hasOwn
│   └── thread.aui.tsx                # SYSTEM_EVENT_ICONS の 2 行だけ
├── features/session/
│   ├── ApprovalCard.tsx (+ test)
│   ├── LivePane.tsx                  # 購読元と承認カードに名前を渡す
│   ├── running-session-types.ts / running-session-store.ts (+ test)
│   └── labels.ts                     # askUserQuestionNotice
├── features/shell/
│   ├── ConfigTab.tsx (+ test)        # 新設
│   ├── panel-tabs.ts / RightPanel.tsx (+ RightPanel.tabs.test.tsx)
│   └── labels.ts
└── stores/ui.ts                      # PanelTabId
tests/meter/meter-through.test.tsx    # init / commands_changed の通し
tests/docs/                           # QUERY_MUTATION_METHODS の pin (新設)
tests/rule-fixtures/                  # b-equivalent の fixture 1 本・既存の引数・expected.mjs
scripts/constitution/allowlists.mjs
eslint.config.mjs / .specify/spec-gate/reviewers.yml
docs/ui-coverage.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md /
docs/roadmap.md / docs/prompts.md / docs/decisions/0047-session-meter-and-failure-reasons.md (Q1)
```

**Structure Decision**: 既存のレイヤ (domain / agents / renderer の features と elements) にそのまま載せる。新しいディレクトリは作らない。

## Complexity Tracking

違反なし。
