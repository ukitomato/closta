# Implementation Plan: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Branch**: `016-ui-boundaries-and-tool-displays` (main 791f72d の上) | **Date**: 2026-10-13 (`/cl-plan` で作り直した。2026-10-04 の版は O-7 の設計段階の上で書いたもの) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) (2026-10-13 の載せ直しの後。U-1〜U-7 と AD-049 は 2026-10-05 に承認済み、載せ直しで残った 3 点は 2026-10-13 に回答済み)

本 plan は spec / [research.md](./research.md) / [data-model.md](./data-model.md) / [quickstart.md](./quickstart.md) を正本として参照し、規則を書き写さない。本 plan が足すのは、2026-10-13 の main のソースと突き合わせて決めた**置き場所と手順** (下の「実装方針」) と、上流からの申し送りの棚卸しである。

## Summary

- **会話の境界と知らせ (US-1)**: agents の O-4 の `live-signals.ts` の `onSystem` に `compact_boundary` / `model_refusal_*` / `informational` を、`sdk-agent-session.ts` の `message.type` の switch に最上位の `conversation_reset` を足し、O-2 のシステムイベントの行 (`message`) で送る。本文は `redactSecrets` (新設) を通す。拒否の取り消しは `meter` の新しい種類 `retraction` で送り、agents の tool の結果の追跡と renderer の稼働中のストアの両方で覚えて戻さない。過去ログの divider を同じ境界の表示に写し、過去ログの `system` の本文にも伏せ字を当てる
- **tool の専用表示 (US-2)**: `Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` を `tool-registry.aui.tsx` の完全一致の表に足す (3 つの新しい表示)。Agent plan を `TextMessagePartProvider` + 既存の `MarkdownText` で描く
- **結果の状態と読み上げ (US-3)**: renderer の純関数 `toolResultState` を全部の tool の表示の状態のアイコンと O-4 の `ToolResultMarks` の `pending` の入力にし、`TranscriptAnnouncer` を足す。ToolFallback の見出しを日本語にする
- **記録と機械強制**: 対応表の書き換え (data-model §5)、roadmap に O-11 を登録、項目 16 の禁止に `readFile` を足す (FR-018)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (型の行番号は data-model の冒頭)、`@assistant-ui/react` 0.15.19 (`TextMessagePartProvider` を export している。`dist/index.d.ts`)、`@assistant-ui/react-markdown` 0.14.15 (今の import は `markdown-text.tsx` だけ)

**Storage**: N/A (取り消した id の記憶はメモリの上限つきの集合。永続化しない)

**Testing**: Vitest 5 (node / renderer の 2 project)、vitest-axe (O-7 で導入)、Constitution 検証 (`node scripts/constitution/check.mjs`)。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)。tool のパスは WSL / Windows / UNC のどの形も本文として出す

**Project Type**: desktop-app (main / preload / renderer / agents (supervisor の Worker) / domain)

**Performance Goals**: 読み上げは 1 秒に 1 回まで (data-model §4)。`redactSecrets` は 4 KB の敵対的な入力で 50 ms 以内 (data-model §1)

**Constraints**: `SessionEvent` の種類・`TRANSCRIPT_PART_FIELDS`・Agent SDK の呼び出しの許可リスト・query の options のキー・`PermissionRequest`・`toPermissionResult`・IPC・preload・main を変えない (SC-005)。`MeterUpdate` の種類は 8 → 9

**Scale/Scope**: FR 18 / SC 5。新しい表示 4 つ (TranscriptBoundary・FileTool・WebTool・TaskTool) と写して変えた File tree

### レイヤごとの変更 (2026-10-13 の main で確かめた起点)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/session/transcript-dto.ts` | category 7 → 11 (`compact-boundary` / `conversation-reset` / `refusal` / `informational`)、status 15 → 21 (`marked` / `fallback` / `no-fallback` / `prevented` / `warning` / `notice`)。`SystemEventStatus` の説明を直す。divider の注記の「O-6」を消す | `:43-44`, `:68-97` |
| domain | `src/domain/session/system-event.ts` | `isTerminalSystemEventStatus` に新しい 6 つの status を終わりとして足す | `:208` |
| domain | `src/domain/session/secret-redaction.ts` (新設) | `redactSecrets` (data-model §1 の表。import を持たない) | — |
| domain | `src/domain/session/meter.ts` | `METER_UPDATE_TYPES` に `retraction`、`MeterUpdate` に `{ type: 'retraction'; messageIds }`、`decodeMeterUpdate` に検証 (配列でない・0 件・129 件以上は捨て、形の合わない id は 1 件ずつ捨てる) | `:75-85`, `:100-121`, `:345` |
| domain | `src/domain/session/transcript.ts` | `system` の記録の text の part に `redactSecrets` (`sanitizeBody` の後)。divider の生成は 1 か所のまま | `:181-216` (`:207` の divider、`:214-216` の text) |
| agents | `src/agents/live-signals.ts` | `onSystem` の switch に 3 つの subtype (`compact_boundary` / `model_refusal_fallback` / `model_refusal_no_fallback` / `informational`)。最上位の `conversation_reset` を受ける関数を足す (`onAuthStatus` と同じ形)。取り消しを `send` で即時に送る関数。`:635` の注記の「O-6」を「O-11」に | `:198-211` (interface), `:217` (`send`), `:578-607` (`onSystem`) |
| agents | `src/agents/sdk-agent-session.ts` | `case 'assistant'` で `trackAssistant` と `emit` の**前**に `supersedes` の取り消し、`case 'conversation_reset'`、`readFile` を `QueryUnusedReadMethod` から `QueryMutationMethod` に、`queryHandle` の型を `interrupt` と非同期の反復だけに絞る | `:144-173`, `:373`, `:540-543`, `:615-628`, `:681-684` |
| agents | `src/agents/live-tool-results.ts` | `retract(messageIds)` を足す (覚えたメッセージを忘れ、その結果待ちの `toolUseId` を上限 512 で覚えて後の結果を捨てる) | `:29-36`, `:61-131` |
| renderer | `src/renderer/src/features/session/running-session-store.ts` | `case 'meter'` で `retraction` だけを先に分け、`messages` から外して id を覚え (上限 512)、`toolElapsed` から外し、`monitor.track([sessionId])` を呼ぶ。`message` の受け口 (`applyMessage`) で覚えた id を足さない。`close()` で記憶を消す | `:345-364`, `:388-398`, `:601` |
| renderer | `src/renderer/src/features/chat/convert.ts` | divider を text (`── label ──`) ではなく、境界の表示に回る part に写す (下の「実装方針」) | `:76-78` |
| renderer | `src/renderer/src/features/chat/` | `tool-result-state.ts`・`path-tail.ts`・`TranscriptAnnouncer.tsx` を新設、`labels.ts` に文言 (data-model §4)。`SYSTEM_EVENT_STATUS_LABELS` に新しい 6 つの status | `labels.ts:182` (`TOOL_RESULT_LABELS`) |
| renderer | `src/renderer/src/features/session/session-view.ts` | `pathTail` を `path-tail.ts` から使う (`bashCommandName` も使う) | `:256-269` |
| renderer | `src/renderer/src/components/assistant-ui/elements/` | 新設: `transcript-boundary.tsx`・`file-tool.aui.tsx`・`web-tool.aui.tsx`・`task-tool.aui.tsx`・写して変えたファイルの一覧。変更: `tool-registry.aui.tsx` (表に 9 つ)、`agent-plan.aui.tsx` (markdown と「原文」)、`tool-fallback.aui.tsx` (見出し・状態のアイコンの入力)、`tool-result-marks.tsx` (結果待ち・結果不明の印)、`thread.aui.tsx` (`SystemEventRow` の category の分岐・`SYSTEM_EVENT_ICONS`・`systemEventDetailText`・`truncate` を本 feature の category で外す・Announcer の置き場所) と、`pending={result === undefined}` を持つ表示 8 つ | `tool-registry.aui.tsx:30-48`、`tool-fallback.aui.tsx:94-99` / `:134-163` / `:178` / `:706-712` / `:750`、`tool-result-marks.tsx:34-72`、`thread.aui.tsx:1009-1031` / `:1051-1099` / `:1120`、`agent-plan.aui.tsx:25-53`、`markdown-text.tsx:41-61`、`file-tree.tsx:18` |
| scripts / tests | `scripts/constitution/allowlists.mjs`・`tests/docs/query-mutation-methods.test.ts`・`tests/rule-fixtures/b-equivalent/` | `QUERY_MUTATION_METHODS` に `readFile` (21 → 22)、固定テストの数、メソッドごとの違反の fixture (`readFile` / `backgroundTasks` / `reloadOutputStyles`) と期待表 | `allowlists.mjs:434-456`、`query-mutation-methods.test.ts:64-66` |
| 設定 | `eslint.config.mjs`・`.specify/spec-gate/reviewers.yml` | 新設の手書きの element を手書きの一覧に足す (下の申し送り #3) | `eslint.config.mjs:588-598`、`reviewers.yml:54-67` / `:110-123` |

**未確定の技術事項**: なし (spec の [ASSUMED] は読み上げの文言と数値の既定値・`new_conversation_id` を読まないこと・過去ログに取り消しの印が無いことの 3 つで、どれも V-3 で記録して確かめる前提の仮定。plan で埋めるものは無い)

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — tool の入力と結果のパスは会話由来の本文で、アプリのパスの値ではない (AD-049 Decision 5。research R-08)。解決しない・UNC を判定しない・`path-api` / `node:path` を import しない。見出しの末尾は renderer の表示用の文字列の切り出し (`path-tail.ts`。`/` と `\` の両方で切り、ホスト OS で分けない) で、切った値を IPC・port に戻さず、本文のパスに操作を付けない
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 区切りをホスト OS やランタイムで選ばない。`process.platform` を使わない
- [x] **III. 権限モードは capability に従う** — 権限モードの選択と承認の応答の形 (`toPermissionResult`) を変えない。承認の要求は取り消しで消さない (data-model §1「戻らない仕組み」)
- [x] **IV. 通信は Agent SDK 経由** — SDK の型のメッセージを読むだけ。`Query` のメソッドの呼び出しは `interrupt` だけで、項目 16 の禁止に `readFile` を足す (FR-018)
- [x] **V. 長期資格情報を永続化しない** — `informational`・拒否の `content`・`api_refusal_explanation`・見出しの自由文・WebFetch の中身の URL・過去ログの `system` の本文に `redactSecrets` を通す。伏せ字の前の本文を agents のログに書かない。`preserved_*` を読まない。WebFetch の見出しは host だけ
- [x] **VI. 永続環境を構築・変更しない** — N/A: プロセス・コンテナ・設定を作らない
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — agents が足す import は domain (`secret-redaction.ts`・`meter.ts`・`transcript-dto.ts`) だけ
- [x] **VIII. 日本語環境で破綻しない** — composer を変えない。見出しは 1 行・80 コードポイントで切り詰め、日本語のファイル名・全角の検索語で崩れないことを component テストで固定する

**Standard**

- [x] **IX. main process をブロックしない** — 変換は agents (supervisor の Worker) と renderer。main の差分 0
- [x] **X. セッションの正本はアプリ外** — 取り消しは稼働中のストアのキャッシュから外すだけ。過去ログは SDK の記録のまま
- [x] **XI. 垂直スライス** — US-1〜US-3 の受け入れ条件はどれも transcript で観測できる。実機の目視は quickstart V-3
- [x] **XII. 未表示情報を残さない** — 完了の PR で `docs/ui-coverage.md` を data-model §5 のとおりに書き換え (30 行。Tier A 14)、D 節に O-11 の Tier A 3 行を立て、O-11 を roadmap に登録する (FR-014 / FR-015)。項目 21 が ok
- [x] **XIII. assistant-ui の element と design system を優先** — Tool call / Web search / Todo list / File tree を registry で先に確かめる。区切りの element は registry に無い (Day separator は日付の区切りで意味が違う) ので TranscriptBoundary を作り、File tree は差分の要約なので写して変える (research R-05)。Inline citation / Sources は使わない (U-5)
- [x] **XIV. Ubiquitous Language** — 用語 (会話の境界・取り消し・結果待ち / 結果不明・知らせ・O-11) を先に glossary に足し、System event row・Meter・Hook の定義を直す (FR-017)
- [x] **XV. 多言語規約** — 文言は `features/chat/labels.ts` に置く (AD-045 Decision 2)。`transcript.ts:207` の domain の日本語の label は表示に使わない (renderer が divider を境界の表示に写し、`labels.ts` の文言を出す)。DTO を変えないので残す

**Domain charter の整合**

- [x] 本 feature の domain (`ui`) の In scope (tool 出力の専用表示・transcript の表示・`docs/ui-coverage.md` の維持) に収まっている
- [x] Out of scope (他 domain の操作 UI) には、session の契約 (agents の分岐・`meter` の `retraction`・稼働中のストアからの削除) に触れる点で踏み込む。O-4 U-1 と同じく spec U-6 で承認済みで、session charter に記録する (FR-017)

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements / Tool UI の実装、transcript の表示、tool 出力の専用表示 (Terminal block / Code diff / Todo / Subagent / Agent plan ほか)、`docs/ui-coverage.md` の維持、アプリのシェル (右のペインのタブを含む。本 feature はタブを足さない)
- 触れる他の domain: `session` ([charter](../../docs/domains/session/charter.md)) — agents の分岐・`meter` の `retraction`・稼働中のストアからのメッセージの削除・項目 16 の禁止 (U-6)。session charter に記録する
- charter の frontmatter の `related_specs` に 016 が、`related_adrs` に AD-047 / AD-048 / AD-049 が無い — FR-017 の記録の更新で足す

### Related ADRs

- [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) — 会話の境界の表示・拒否の取り消し・Agent plan の markdown・tool のパスと O-11 への分割: **accepted** (本 feature で起こし 2026-10-05 に承認。本文は変えない)
- [AD-048](../../docs/decisions/0048-session-config-display-and-answer-ui-split.md) — tool の登録の 2 段・`QUERY_MUTATION_METHODS` の拡張・`meter` の上限に掛けない種類の前例: accepted (O-5)
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter` と行を agents で組む形。D2 (`meter` が運ぶ値) を AD-049 が読み替える: accepted (O-4)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — シェルと `watchedId`、右のペインのタブの候補: accepted (O-7)
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — UI の文言を i18n リソース化せず `labels.ts` に置く: accepted (O-3)
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当と M3 の完了の条件。D4 / D6 の持ち主を AD-049 が O-11 に移す: accepted
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — options のキーの pin。(g) の読み替え (`includeHookEvents`) は O-11 の義務: accepted
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — §4 P3 (`Query` のメソッドは `interrupt` だけ): accepted
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Tier A の tool の表示。D6 (Agent plan は plain text) を AD-049 Decision 4 が読み替える。D3 は O-11 の義務: accepted
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 本文の経路 (tool のパスは会話由来の本文): accepted
- [AD-032](../../docs/decisions/0032-unc-shape-classification-by-separator-count.md) / [AD-029](../../docs/decisions/0029-session-cwd-origin-classification.md) — UNC の判定の唯一の入口 (本 feature は当てない。範囲の確認): accepted
- [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) / [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) — SDK のメッセージと element の棚卸し (Inline citation は Tier A のまま `未使用`。data-model §5): accepted
- [AD-050](../../docs/decisions/0050-gate-finding-handling-and-round-limit.md) — gate の Medium / Low の扱いと round の上限: proposed (AGENTS.md の gate の原則に入っている。本 feature の design-gate はパイロット)

### Glossary excerpt

- **System event row (システムイベントの行)**: transcript の中で Hook / Background task などの出来事を 1 つにつき 1 行で示す表示 (O-2)。O-4 / O-5 が実行中だけの category を足した。終わりの来ない行は「結果不明」。本 feature が 4 つの category を足す (定義の更新は FR-017)
- **Meter (計量)**: 実行中のセッションの最新の値 (O-4)。種類は 8 つ。運ぶのは数・真偽・列挙・モデルの id など。本 feature が `retraction` (message の id の列。最新の値ではなく 1 回限りの指示) を足す (定義の更新は FR-017)
- **Hook (フック)**: セッションのイベントに合わせて走るコマンド。O-2 は出力本文を出さない。一般の Hook の表示は O-11 に送る (今の Counterexamples の「O-6」を直す)
- **Shell / 見ているセッション (`watchedId`)**: 読み上げ (`TranscriptAnnouncer`) は見ているセッションだけ (O-7)
- **Tool group**: 連続する tool のまとまり (O-2 の密度の切り替え)。本 feature の表示もこの中に入る
- 本 feature で足す語: 会話の境界・取り消し (retraction)・結果待ち / 結果不明 (tool の結果の状態)・知らせ (`informational`)・O-11

## 上流からの申し送り

```text
# 2026-10-13 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
rg -n "016-ui-boundaries-and-tool-displays" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 29 件 / 13 ファイル (この plan を書き直す前の数)
# 2) feature ID (spec_id だけでは roadmap・対応表・charter の申し送りに当たらないため足した)
rg -n "\bO-6\b" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 435 件 / 100 ファイル
# 3) 新設のモジュール名を実名リスト方式のルールで
rg -n "secret-redaction|redactSecrets|path-tail|pathTail|TranscriptBoundary|TranscriptAnnouncer|toolResultState|tool-result-state|file-tool|web-tool|task-tool|retraction|readFile" .dependency-cruiser.js eslint.config.mjs scripts/constitution/*.mjs
#    → 4 件 (どれも check.mjs / scan.mjs の readFileSync)
#    加えて、手書きの element の実名リストを持つ 2 ファイルを読んだ (eslint.config.mjs:588-598、reviewers.yml:54-67 / :110-123)
# 参考 (棚卸しの範囲の外): rg -n "\bO-6\b" src → 8 件、tests → 7 件 (tests/ は上の 435 件に含む)
```

### 1) spec_id の 29 件

| # | 出所 | 件数 | 処理 |
|---|---|---:|---|
| 1 | `specs/016/spec.md:2`, `:16` | 2 | **当たらない** — 本 spec の frontmatter と見出し |
| 2 | `specs/016/plan.md:3`, `:69` (書き直す前の版) | 2 | **当たらない** — 本ファイル (この版で置き換えた) |
| 3 | `specs/016/` の design-gate の出力 (R1 / R2 の reviewer 7 本・`analyze*.md` 2 本・`design-gate.md`) | 24 | **当たらない** — O-7 の設計段階の上の古い版への指摘の記録。2026-10-13 の載せ直しで spec / research / data-model に反映済み (research の冒頭)。次の design-gate はこの plan の版で新しく回す |
| 4 | `docs/decisions/0049-boundaries-retraction-and-o11-split.md:15` | 1 | **受ける** — AD-049 の Context。本文は変えない (FR-016) |

### 2) feature ID (`O-6`) の 435 件

本 spec の中の 139 件 (spec 14・data-model 13・research 6・quickstart 2・tasks 6・この plan の前の版 10・gate の出力 88) は **当たらない** (#1〜#3 と同じ理由)。残りの 296 件を出所ごとに割り当てる。

| # | 出所 | 件数 | 内容 | 処理 |
|---|---|---:|---|---|
| 5 | `docs/roadmap.md:380` (O-6 の行) | 1 | 対応表の割当・O-2 の pr-gate R2 の 4 項目・V-4 の 4 項目・O-7 のタブの候補・O-4 から | **受ける / 送る** — spec の「義務の扱い」の表が正本。完了の PR で行を本 feature の範囲と結論に直し、依存を O-2 / O-7 / O-4 / O-5 にする (FR-015) |
| 6 | `docs/roadmap.md:141`, `:376`, `:385`, `:391`, `:430` | 5 | 「O-4〜O-6」「O-3〜O-6」の並び・M3 の完了 (O-4〜O-6)・OPT-panel の着手の目安 | **受ける** — 完了の PR で O-11 を順 20 に置き、M4 / M5 の順を振り直す。`:385` の M3 の完了の並びに O-11 を足す (FR-015)。`:141` / `:430` は「O-6 の後」の意味のままで、O-11 を足すかを同じ PR で決める (書き換えるなら「O-3〜O-6・O-11」) |
| 7 | `docs/roadmap.md:375` (O-2 の行) | 1 | 「表示の実装の残りは O-4 / O-5 / O-6 に割り当てた」 | **当たらない** — O-2 の完了の記録 |
| 8 | `docs/ui-coverage.md` | 50 | `後続: O-6` の 30 行 (Tier A 14。2026-10-13 に数え直した) と備考の 20 か所 | **受ける** — data-model §5 が正本。完了の PR で書き換える (FR-014) |
| 9 | `.specify/memory/constitution.md:57` | 1 | 項目 21 の出力の記録 (O-6 30) | **注記** — 完了の PR で項目 21 の出力が変わる。この行は O-2 の時点の記録なので書き換えるかは完了の PR の SH で決める (書き換えるなら O-6 を消し O-11 を足す) |
| 10 | `.specify/spec-gate/reviewers.yml:52`, `:108`, `:209` | 3 | 「後続の表示 feature (O-4〜O-6) はここだけで完結しうるので明示で入れる。新しい手書きの element を足したらここにも足す」 | **受ける** — 新設の手書きの element (`transcript-boundary.tsx`・`file-tool.aui.tsx`・`web-tool.aui.tsx`・`task-tool.aui.tsx`・写して変えたファイルの一覧) を a11y-reviewer / ux-reviewer の `auto_invoke_patterns` に足す。`:209` (ui-coverage-reviewer) は `features/shell` の話で、本 feature はシェルを変えない |
| 11 | `docs/glossary.md:89`, `:422` | 2 | 「実行中の task の一覧は O-6 で要否を判断」「一般の Hook の表示は O-6」 | **送る** — O-11。完了の PR で O-11 に直す (FR-017) |
| 12 | `docs/domains/_overview.md:66`, `:99`, `:101`, `:116` | 4 | feature の一覧の O-6 の行・task の一覧の要否・O-4〜O-6 は `ui`・O-3〜O-6 の置き場所 | **受ける / 送る** — `:66` は題と範囲を本 feature に直し、O-11 の行を足す。`:99` は O-11 に。`:101` に O-11 を足す。`:116` は O-7 の記録のまま (FR-017) |
| 13 | `docs/domains/ui/charter.md:79`, `:220`, `:242`, `:253` | 4 | 右のペインのタブ (O-4〜O-6)・O-2 の割当・残りの feature・Open Questions の task の一覧 | **受ける / 送る** — `:242` に O-11 を足し、`:253` を O-11 に。`:79` / `:220` は記録のまま (FR-017) |
| 14 | `docs/prompts.md:228`, `:251` | 2 | 「Checkpoints / Web search → O-6」「O-3〜O-6 の置き場所」 | **受ける / 送る** — `:228` を「Web search → O-6、Checkpoints → O-11」に。`:251` は記録のまま (FR-017) |
| 15 | `docs/ai-workflow/PLAN.md:83`, `:258` | 2 | 016 の載せ直しの手順と状態 | **当たらない** — ワークフローの進め方の記録。載せ直しは完了しており、本 plan はその「`--from plan` で再開」の段 |
| 16 | `docs/decisions/0044-…md:19`, `:66`, `:84`, `:103` | 4 | 後続 feature の割当・B 節の照合は O-6・task の一覧の要否は O-6・後続を roadmap に登録 | **送る** — `:66` / `:84` は O-11 (AD-049 の「読み替える箇所」が名指す。AD-044 の本文は変えない)。`:103` は O-11 を roadmap に登録する根拠 (FR-015)。`:19` は記録 |
| 17 | `docs/decisions/0046-…md:19`, `:43`, `:48` | 3 | O-4〜O-6 の表示の候補は右のペインのタブになりうる | **送る** — TodoList・Background task のタブは O-11 (U-1)。本 feature はタブを足さない |
| 18 | `docs/decisions/0049-…md` | 6 | 本 feature の ADR | **受ける** — 本文は変えない |
| 19 | `docs/decisions/0050-…md:19`, `:51` | 2 | 016 の design-gate で round の数と PASS 後の修正のコミットを確かめる | **受ける** — 本 feature の design-gate は 3 round まで、Medium / Low を直さない (AGENTS.md の gate の原則) |
| 20 | `specs/011-ui-coverage/` (spec・plan・research・data-model・tasks・quickstart-results・gate の出力) | 117 | O-2 が O-6 に回した割当と宿題 | **受ける / 送る** — roadmap の O-6 の行 (#5) に集約されている。個別の扱いは下の #20a〜#20e |
| 20a | 011 pr-gate M-201 | — | Tier A の備考の残り (5 行) を M3 の件数が数えない | **受ける** — 2 行は本 feature で解消、3 行は D 節に `後続: O-11` (data-model §5) |
| 20b | 011 pr-gate po H-001 | — | TodoList と Task 系のエラーの印のテスト | **受ける** (2026-10-13 に承認。spec Clarifications) |
| 20c | 011 pr-gate a11y M-003 | — | Hook・task の状態の変化と tool のエラーの読み上げ | **受ける** — data-model §4 |
| 20d | 011 pr-gate a11y L-001 / L-201 / L-202、ux L-101 / L-103 / L-104 | — | Low | **扱わない** — O-2 の gate の出力に残し、M3 の終わりの棚卸しで扱う (2026-10-13 に承認。AD-050 Decision 3) |
| 20e | 011 pr-gate ux L-102 / arch L-201、quickstart-results V-4 | — | 伏せた Hook 名の見分け・O-11 の domain 間の依存・V-4 の未記録の 4 項目 | **送る / 受ける** — L-102 / L-201 は O-11。V-4 は 2 つを両方の形に耐える規則 (data-model §3)、2 つを O-11 |
| 21 | `specs/014-ui-metering-and-limits/` | 27 | O-4 が O-6 に預けた圧縮の行と境界の関係・`tool_progress` の入れ子・data-model §2 の検証の表 | **受ける** — 並べる (research R-07。2026-10-13 に承認)。014 data-model §2 の検証の表に `messageIds` の行を足す (AD-049 Decision 2)。入れ子は O-11 |
| 22 | `specs/015-ui-mcp-elicitation-commands/` | 7 | O-5 の `QUERY_MUTATION_METHODS` の拡張 (2 つは済み)・MCP の URI の要約 | **受ける** — 残りの `readFile` だけ (FR-018)。URI の要約は O-5 が最後の要素を秘密の形の検査に通す形で実装したので見直しは無い (data-model §2) |
| 23 | `specs/013-ui-app-shell/` | 24 | 右のペインのタブの候補 (TodoList・Background task) と置き場所の語彙 | **送る** — タブは O-11。置き場所の語彙は spec の「本 feature の位置づけ」で使った |
| 24 | `specs/012-ui-thread-search/` | 30 | O-3〜O-6 の順と、F 節の付け替えの記録、data-model §2 の検索の範囲 (`:99`。圧縮の境界は描かれる本文なので対象) | **受ける** — `:99` の契約を保つ。過去ログの divider を data part に写すと `toSearchableMessage` (`conversation-search.ts:56-65`) の `type: 'text'` から外れるので、走査が圧縮の境界の data part から描かれる見出しを読む (実装方針「過去ログの境界」。design-gate R3 H-01)。012 の文書は変えない (範囲は同じで、`convert.ts` の行の参照だけが古くなる)。他の行は O-3 の記録で、本 feature の F 節の書き換え (data-model §5) は O-3 の付け替えた行に触れない |
| 25 | `specs/004-ui-tier-a-tool-display/data-model.md` | 1 | Agent plan の markdown を後続に | **受ける** — AD-049 Decision 4 (U-4) |

### 3) 実名リスト方式のルール

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 26 | `scripts/constitution/allowlists.mjs:434-456` (`QUERY_MUTATION_METHODS`) | 21 個。`readFile` は無い (`sdk-agent-session.ts:171` で `QueryUnusedReadMethod`) | **受ける** — FR-018 |
| 27 | `eslint.config.mjs:588-598` (手書きの Tier A 表示の一覧。`GENERATED_FILES` の緩和を戻す) | `elements/` の手書きの表示を 1 つずつ並べる。新しいファイルは載せないと CLI 生成物として緩和される | **受ける** — `transcript-boundary.tsx`・`file-tool.aui.tsx`・`web-tool.aui.tsx`・`task-tool.aui.tsx`・写して変えたファイルの一覧を足す (component でない関数を export するファイルは `:564-567` の hooks だけの一覧に入れる。O-4 の `tool-result-marks.tsx` の前例) |
| 28 | `.specify/spec-gate/reviewers.yml:54-67` / `:110-123` / `:78-90` (exclude) | a11y / ux の `auto_invoke_patterns` の手書きの element の一覧と、registry の複製の除外 (`file-tree.tsx` を含む) | **受ける** — #10 と同じ。`file-tree.tsx` は写して変えた別ファイルを作るので除外のまま |
| 29 | `.dependency-cruiser.js` | 新設のモジュール名で 0 件。新設のファイルは既存のレイヤ規則 (domain / agents / renderer) に入る | **当たらない** |
| 30 | `src/domain/session/system-event.test.ts:299`, `:311` (category と status の集合の固定テスト) | 7 / 15 | **受ける** — 11 / 21 に直す (実名リストではないが、集合を固定するテスト) |

### 4) 参考: `src` / `tests` の `O-6` の注記 (棚卸しの範囲の外)

| # | 出所 | 処理 |
|---|---|---|
| 31 | `src/domain/session/transcript-dto.ts:43`・`transcript.ts:205`・`features/chat/convert.ts:77`・`elements/thread.aui.tsx:1013` (「専用 element は対応表 A 節の割当 (O-6)」) | **受ける** — 本 feature で実装するので注記を消す |
| 32 | `src/agents/live-signals.ts:635`・`src/domain/session/live-message.ts:71` (subagent の入れ子・`server_tool_use` は O-6) | **送る** — 注記を O-11 に |
| 33 | `src/renderer/src/stores/ui.ts:28`・`features/shell/panel-tabs.ts:15` (右のペインのタブを O-6 が足す) | **送る** — 注記を O-11 に |
| 34 | `tests/ui-coverage/coverage.test.ts` の 7 件 | **当たらない** — 項目 21 の照合の合成の fixture |

### 5) system-scope の持ち主の記録

spec の「義務の扱い」の表の最後の 4 行が正本 (直近の活動の不可視文字・`runtime-store.ts` の検出・`running-session-store.ts` の切り出し・O-2 の pr-gate の Low)。どれも当たらないか扱わない。本 plan で足すものは無い。

## 実装方針

規則の正本は data-model。ここには 2026-10-13 のソースと突き合わせて決めた置き場所と順序だけを書く。

### 行 (US-1)

- `onSystem` (`live-signals.ts:578-607`) の switch に `compact_boundary` / `model_refusal_fallback` / `model_refusal_no_fallback` / `informational` を足す。値の照合は `Object.hasOwn` の表 (data-model §1「値の照合」)。行は O-4 / O-5 の行と同じく `send({ kind: 'message', ... })` で送る
- `conversation_reset` は `system` ではなく最上位の `type` (`sdk.d.ts:4750`) なので、`sdk-agent-session.ts` の switch (`:621-688`) に `case 'conversation_reset'` を足し、`live-signals` の新しい関数 (`onConversationReset`) を呼ぶ (`:681-684` の `auth_status` と同じ形)
- 本文の規則 (data-model §1「本文の規則」) は domain の純関数にまとめ、agents から呼ぶ。`redactSecrets` は `src/domain/session/secret-redaction.ts`
- `secret-scan.ts` の `SECRET_PREFIX_PATTERNS` は export されていない。「本表に含まれる」の固定テスト (data-model §1) は、各パターンに当たる代表の値を `looksLikeSecret` と `redactSecrets` の両方に通して、前者が真なら後者が伏せることを見る形にし、`secret-scan.ts` を変えない
- 新しい category が 4 つ増えると、renderer の網羅の表 (`thread.aui.tsx` の `SYSTEM_EVENT_ICONS` `:1091-1099`・`systemEventDetailText` の switch `:1051-1078`) と `labels.ts` の `SYSTEM_EVENT_STATUS_LABELS` が型で落ちる。`compact-boundary` / `conversation-reset` は `SystemEventRow` (`:1120`) の入口で TranscriptBoundary に分け、`refusal` / `informational` は `SystemEventRow` のまま `detail` を折り返す (`truncate` を外す。data-model §1)

### 過去ログの境界

- 今の `convert.ts:76-78` は divider を text の part (`── コンテキストを圧縮 ──`) にし、`SystemMessage` (`thread.aui.tsx:1019-1031`) が中央寄せの text で出す。**divider を system-event の data part (category `compact-boundary`・`name` / `detail` は空・`status` は `marked`) に写し**、実行中の境界と同じ `SystemEventRow` → TranscriptBoundary の経路に乗せる (FR-001 の「同じ専用の表示」。`detail` が空なので数を省いた文言になる)。domain の DTO (`divider`) は変えない
- **O-3 のスレッド内検索の範囲を保つ** (012 data-model §2 `:99` は圧縮の境界を「描かれる本文」として対象に入れる)。divider が text の part でなくなると `toSearchableMessage` (`conversation-search.ts:56-65`) の `type: 'text'` から外れるので、走査は system-event の data part のうち category `compact-boundary` で、メッセージが `isSystemEventMessage` でない (= 過去ログの divider から写したもの) ときだけ、TranscriptBoundary が描く見出しの文言 (`labels.ts`。data-model §4 の「圧縮の境界」の数を省いた形) を本文の 1 つとして取る。見出しの文言は TranscriptBoundary と同じ関数から取り、走査に文字列を書かない。それ以外の data part と、実行中の行 (`isSystemEventMessage`) は今どおり対象の外 (O-3 spec FR-004)
- 同じメッセージの残りの text の part の扱いは今の `AssistantOrSystemEvent` の振り分け (先頭の part で決める) のままにし、実装の最初に過去ログの fixture で、境界の後に圧縮の要約の本文が重ねて出ないことを確かめる (出るなら変換で境界のメッセージを分ける。DTO は変えない)
- `system` の記録の text の part (`transcript.ts:214-216`) に `redactSecrets` を当てるのは role が `system` のときだけ (assistant / user の本文は今のまま)

### 取り消し (US-1 AC3)

- **agents**: `sdk-agent-session.ts:622-628` の `case 'assistant'` で、`toLiveAssistantMessage` の後・`toolResults.trackAssistant(dto)` と `emit` の前に `supersedes` を読み、`signals` の取り消しの関数 (形の検査・128 件ごとに分けて `send` で即時に送る。`meter-throttle` と O-5 の合流を通さない) と `toolResults.retract(ids)` を呼ぶ。`model_refusal_fallback` の `retracted_message_uuids` は `onSystem` から同じ関数に渡す
- **agents の追跡**: `live-tool-results.ts` に `retract` を足す。`forget` (`:66-74`) で覚えたメッセージを外し、外したメッセージの結果待ちの `toolUseId` を上限 512 で覚え、`applyUserMessage` (`:90-125`) で送り直しにも結果だけのメッセージ (`orphanMessage`) にもしない。取り消した id の assistant を後で受けたら送らない (上限 512)
- **renderer**: `decodeMeterUpdate` (`meter.ts:345`。`session-event-decoder.ts:88-91` が呼ぶ) で検証する。`running-session-store.ts` の `case 'meter'` (`:388-398`) は今「`meters` の枝だけを書き、`sessions` の参照を変えない」が、`retraction` だけはこの規則の例外にして先に分け、同じ `setState` で `messages` から外し、`toolElapsed` から取り消した `toolUseId` を外し、外した id を覚える。その後 `syncQueue` は呼ばず `monitor.track([sessionId])` だけを呼ぶ (直近の活動の見直し)。`receivedMessages` に数えない。`case 'message'` (`:345-364`) の `applyMessage` の前に覚えた id を見て足さない。`close()` (`:601`) で記憶を消す
- 隠れた古いメッセージの件数 (`hiddenCount`) は `session-view.ts:486-488` が `messages` の長さから導くので、`messages` から外せば直る (別に持たない)

### tool の専用表示と結果の状態 (US-2 / US-3)

- `tool-registry.aui.tsx:30-48` の完全一致の表に 9 つを足す (`Read` / `Glob` / `Grep` → FileTool、`WebFetch` / `WebSearch` → WebTool、`Task*` 4 つ → TaskTool)。`Task` (subagent の旧名) は Subagent のまま
- `toolResultState` (`features/chat/tool-result-state.ts`) の `ctx` は thread の context で渡す (data-model §3)。結果の無い tool の状態の出所は、今 8 か所の `pending={result === undefined}` (`terminal-block` / `code-diff` / `todo-list` / `subagent` / `agent-plan` / `mcp-tool-call` / `ask-user-question` / `tool-fallback`) と、`statusWithError(runtimeStatus, …)` (`tool-fallback.aui.tsx:706-712`。`mcp-tool-call` / `ask-user-question` も使う) の 2 つ。両方を `toolResultState` から作る 1 つの hook にまとめ、9 つの表示と新しい 3 つが同じ hook を呼ぶ (表示ごとに判定を書かない)
- ToolFallback の見出し (`tool-fallback.aui.tsx:178` の `Used tool` / `Cancelled tool`) を `labels.ts` の「{tool 名} を実行」にする。状態のアイコン (`:94-99` の対応) は assistant-ui の part の状態ではなく `toolResultState` と `isError` から決める (data-model §3)
- Agent plan (`agent-plan.aui.tsx:45-49`) の本文を `TextMessagePartProvider` (`text` / `isRunning={false}`) + `MarkdownText` に替え、「原文」の切り替えを付ける。**実装の最初に** provider の中で `MarkdownText` (`markdown-text.tsx:41-61`。props で本文を受けず text part の context から描く) が描け、`safeUrlTransform` が効くことを R-3 の XSS の fixture 一式で確かめる (RK-06)
- File tree は registry の `file-tree.tsx` (`:18`) を写して別のファイルにし、元は変えない (registry の複製の除外のまま。申し送り #28)
- `pathTail` を `features/chat/path-tail.ts` に移し、`session-view.ts` は import する。`session-view.ts` の中では `bashCommandName` (`:262-269`) も使うので、末尾が区切りの値 (`./bin/` など) でコマンド名の出力が変わる点も `session-view` のテストで固定する (data-model §2 の「末尾が区切りのパスだけ」に含まれる)

### 読み上げ

- `TranscriptAnnouncer` は見ているセッション (`watchedId`) の thread の中に 1 つ。O-7 の `SessionAttentionAnnouncer` (見ていないセッション)・`SessionScreen` の `role="alert"`・`ApprovalCard` の `alertdialog`・O-4 の権限モードの帯と重ねない (data-model §4)

### 実装の順

1. domain (列挙・`redactSecrets`・`meter` の `retraction`・過去ログの伏せ字) と固定テスト
2. agents (行・取り消し・`retract`・`readFile` と `queryHandle` の型) と項目 16
3. renderer のストアと decoder (取り消し)
4. 境界と行の表示 (TranscriptBoundary・`SystemEventRow`・過去ログの divider)
5. `toolResultState` と印、ToolFallback の見出し、Announcer
6. 9 つの tool の表示と Agent plan
7. 記録 (対応表・roadmap・glossary・charter・`_overview.md`・`prompts.md`・014 data-model §2・AD-047 の参照・eslint / reviewers.yml の一覧・src の注記)

## 機械強制の変更

- **項目 16**: `QUERY_MUTATION_METHODS` に `readFile` (21 → 22)。`sdk-agent-session.ts` の `QueryMutationMethod` に移す。`tests/docs/query-mutation-methods.test.ts:64-66` の数を 22 に。メソッドごとの違反の fixture 3 本 (`sdk-query-read-file` / `sdk-query-background-tasks` / `sdk-query-reload-output-styles`) と期待表。`queryHandle` (`:373`) の型を `interrupt` と `AsyncIterable<SDKMessage>` だけに絞る (ブラケット・参照の形を型で塞ぐ)
- **固定テスト**: `METER_UPDATE_TYPES` (9)、`SYSTEM_EVENT_CATEGORIES` (11) / `SYSTEM_EVENT_STATUSES` (21) (`system-event.test.ts:299` / `:311`)、`PermissionRequest` のフィールドの集合、`toPermissionResult` の出力の形、`@assistant-ui/react-markdown` の import が `markdown-text.tsx` だけ・`TextMessagePartProvider` の import が `agent-plan.aui.tsx` だけ、domain の divider の生成が 1 か所、`redactSecrets` の計算量 (4 KB で 50 ms)
- **単体**: `retraction` の検証 (domain)、`redactSecrets` の fixture (data-model §1 の正本)、tool の振り分け (9 つの tool が ToolFallback に落ちない)、`toolResultState` の表、取り消しの後に結果・同じ id のメッセージが届いても戻らない (agents と renderer の両方)
- **lint**: 新設の手書きの element を `eslint.config.mjs` の手書きの一覧に (申し送り #27)

## ADR

AD-049 は 2026-10-05 に accepted。本文は変えない (FR-016)。Decision 6 の 3 つのメソッドのうち 2 つは O-5 が先に足したので、本 feature は `readFile` を足す (実施の順の違いで、読み替えではない)。AD-047 の Consequences に AD-049 への参照を足すのは FR-017 の記録の更新 (accepted の ADR の本文の決定は変えない。参照の追記は AD-048 のときと同じ節)。O-11 の ADR (`includeHookEvents`・`getSubagentMessages`・`get_hooks_listing` を呼ぶなら AD-036 §4 P3) は O-11 の design の前に起こす。本 feature で新しい ADR は起こさない。

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 承認済みの判断 (U-1〜U-7・AD-049) が実装の途中で覆る | 2026-10-05 に承認、載せ直しの 3 点は 2026-10-13 に回答済み。覆る兆しがあれば実装を止めて利用者に返す |
| RK-02 | 取り消したメッセージに結果待ちの tool や承認カードが含まれる | agents の追跡から外し後の結果を捨てる。ストアも外した id を覚える。承認の要求 (`pending`) は消さない。拒否のときに承認待ちが残るかは V-3 で記録する |
| RK-03 | 読み上げが多すぎる / 少なすぎる | 新しく届いた出来事だけ・1 秒に 1 回のまとめ・対象の限定 (data-model §4)。V-3 で利用者が確かめる |
| RK-04 | `Glob` / `Grep` の結果の形が CLI の版で変わる | 注記の形以外の行を項目にし、0 件なら text に倒す (data-model §2)。V-3 で実際の結果を記録して fixture にする |
| RK-05 | V-4 の未記録の項目が前提を崩す | 両方の形に耐える規則 (data-model §3)。残りは O-11 |
| RK-06 | `TextMessagePartProvider` の中で `MarkdownText` が描けない、または `safeUrlTransform` が効かない | 実装の順の 6 の最初に確かめる。描けなければ実装を止めて利用者に返す (U-4 を plain text に戻すと accepted の AD-049 Decision 4 を取り下げることになり、新しい ADR が要る) |
| RK-07 | 伏せ字の取りこぼし・伏せすぎ | data-model §1 の fixture の正本 (伏せる / 変えない / 伏せすぎを受け入れる) を固定する。漏れの型が見つかれば data-model §1 に足す |
| RK-08 | `retraction` で `meter` の「`sessions` の参照を変えない」の規則に例外ができ、O-4 の再描画の前提が崩れる | 例外は `retraction` の 1 種類だけで、`case 'meter'` の先頭で分ける。取り消しは拒否のときだけ届く低頻度の指示。ストアの単体で他の 8 種類が `sessions` の参照を変えないことを固定したまま保つ |
| RK-09 | 項目 16 の `readFile` の綴りが、SDK を持つディレクトリ (`AGENT_SDK_IMPORT_DIRECTORIES` = `src/agents/`) の `fs.readFile(` に当たる | 今の `src/agents` に `.readFile(` は 0 件。将来当たったら `Query` の値に限る形を項目 16 の持ち主と決める |
| RK-10 | 過去ログの divider を data part に写すと、同じメッセージの残りの本文の出方が変わる。O-3 のスレッド内検索から境界が外れる (design-gate R3 H-01) | 実装方針「過去ログの境界」の確認を最初に行う。走査が境界の data part の見出しを読む (同節)。DTO は変えない |
| RK-11 | 8 か所の `pending={result === undefined}` を 1 つの hook に寄せる変更が、O-4 の経過時間の印の購読 (`useLiveToolElapsed`) を壊す | 購読そのものは変えず、`pending` の値の出所だけを替える。O-4 の経過時間のテストをそのまま通す |

## Project Structure

### Documentation (this feature)

```text
specs/016-ui-boundaries-and-tool-displays/
├── plan.md              # 本ファイル
├── research.md          # Phase 0 (R-01〜R-14。2026-10-13 に main と突き合わせ済み)
├── data-model.md        # Phase 1 (§1〜§5。規則の正本)
├── quickstart.md        # Phase 1 (V-1〜V-3)
└── tasks.md             # Phase 2 (/cl-tasks で作り直す。今のファイルは古い版)
```

contracts/ は作らない: IPC・preload・port の契約を変えない (`SessionEvent` の種類は不変、`meter` の値の契約は data-model §1 と 014 data-model §2 に足す)。

### Source Code (repository root)

```text
src/domain/session/
├── transcript-dto.ts        # category / status の列挙
├── system-event.ts          # 終わりの判定
├── secret-redaction.ts      # 新設 (redactSecrets)
├── meter.ts                 # retraction と decodeMeterUpdate
└── transcript.ts            # 過去ログの system の本文の伏せ字
src/agents/
├── sdk-agent-session.ts     # conversation_reset・supersedes・readFile・queryHandle の型
├── live-signals.ts          # onSystem の 4 つの subtype・取り消しの送信
└── live-tool-results.ts     # retract
src/renderer/src/features/
├── session/running-session-store.ts   # 取り消し
├── session/session-view.ts            # pathTail を path-tail.ts から
└── chat/{convert.ts, conversation-search.ts, labels.ts, tool-result-state.ts (新設), path-tail.ts (新設), TranscriptAnnouncer.tsx (新設)}
src/renderer/src/components/assistant-ui/elements/
├── transcript-boundary.tsx  # 新設
├── file-tool.aui.tsx        # 新設 (Read / Glob / Grep)
├── web-tool.aui.tsx         # 新設 (WebFetch / WebSearch。URL の見出しの純関数を隣に)
├── task-tool.aui.tsx        # 新設 (Task* 4 つ)
├── (ファイルの一覧)          # 新設 (file-tree.tsx を写して変える。名前は tasks で決める)
└── tool-registry.aui.tsx / agent-plan.aui.tsx / tool-fallback.aui.tsx / tool-result-marks.tsx / thread.aui.tsx
    と pending を持つ表示 (terminal-block / code-diff / todo-list / subagent / mcp-tool-call / ask-user-question)
scripts/constitution/allowlists.mjs
tests/docs/query-mutation-methods.test.ts
tests/rule-fixtures/b-equivalent/sdk-query-{read-file,background-tasks,reload-output-styles}.ts.fixture (新設) と期待表
eslint.config.mjs / .specify/spec-gate/reviewers.yml                     # 手書きの element の一覧
docs/ui-coverage.md / docs/roadmap.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/prompts.md
specs/014-ui-metering-and-limits/data-model.md (§2 の検証の表) / docs/decisions/0047-session-meter-and-failure-reasons.md (Consequences の参照)
```

**Structure Decision**: 既存のレイヤ (domain / agents / renderer) に置く。新しいディレクトリは作らない。

## 設計後の見直し (Constitution Check の再確認)

- Phase 1 の成果物 (research / data-model / quickstart) は 2026-10-13 に main と突き合わせ済みで、本 plan の確認で食い違いは 2 つ見つかった: (1) `retraction` の検証の置き場所は `session-event-decoder.ts` ではなく domain の `decodeMeterUpdate` (前の版の plan の記述の誤り。data-model はファイルを名指していないので直さない)、(2) 過去ログの divider は今 text の part に写されていて、境界の表示に回す経路が決まっていなかった (上の「過去ログの境界」で決めた)。どちらも Constitution の判定を変えない
- 違反は 0 件。Complexity Tracking は空

## Complexity Tracking

なし
