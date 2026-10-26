# Implementation Plan: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Branch**: `022-ui-notices-checkpoints-and-content-blocks` (main e79a694 の上) | **Date**: 2026-10-22 (`/cl-plan`。夜間の自走。利用者は不在) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) (U-1〜U-9 は 2026-10-22 の夜間の規則で推奨案を採用。AD-060 は本 plan で proposed として起こした)

本 plan は spec / [research.md](./research.md) / [data-model.md](./data-model.md) / [quickstart.md](./quickstart.md) を正本として参照し、規則を書き写さない。本 plan が足すのは、2026-10-22 の作業ツリーと突き合わせて決めた**置き場所と手順** (下の「実装方針」) と、上流からの申し送りの棚卸しである。

## 判断の承認

- spec の U-1〜U-9 は 2026-10-22 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で採用された (spec「判断の一覧」)。本 plan はそれを前提にし、新しい判断を足さない
- **AD-060 は proposed で起こした** ([docs/decisions/0060-content-block-verification-and-unsupported-block-mark.md](../../docs/decisions/0060-content-block-verification-and-unsupported-block-mark.md))。accepted にするのは `/cl-design` (main) で、designer は承認しない
- AGENTS.md の gated 確定事項に当たるもの: なし。domain は spec の `ui` のまま (agents・domain・scripts に触れるが持ち主を変えない。O-11 の U-6 と同じ形)。Constitution Principle の採否は変えない。XII の Verification の字面を B 節に追随させる改定 (v1.5.0。MINOR) は本 feature の PR に入れず、人間レビューの後の別の PR に送る (spec U-12。下の「ADR」)
- design-gate (2026-10-22) の High 7 件の修正で、spec に U-10〜U-13 を足した (夜間の規則で推奨案を採用)
- design で確かめた結果、spec と食い違う点は無い。spec が plan に預けた 2 点は次のとおり決めた: (1) DTO の part を足す (`server-tool-call`・`unsupported-block`。research R-08 / R-12)、(2) `@anthropic-ai/sdk` の型は hoisted の `node_modules/@anthropic-ai/sdk/` から読む (research R-01)

## Summary

- **知らせの類 (US-1 / US-2)**: domain に `notice-rows.ts` を新設し、`toNoticeRow` 1 つで FR-002 の 7 つと O-6 / O-10 の 5 つの行を作る。実行中は `live-signals.ts` (system の subtype) と `sdk-agent-session.ts` (トップレベルの `tool_use_summary` / `active_goal` / `conversation_reset`) が、過去ログは `transcript.ts` の system の分岐が同じ関数を呼ぶ。category は 13 → 20、status は 22 のまま
- **中身のブロック (US-2 / US-3)**: domain に `content-blocks.ts` を新設し、`server_tool_use` → `server-tool-call` の part、結果のブロック → 同じ id の `result` (Sources・エラー・印)、`document` → `file` (名前と種類)、他のすべて → `unsupported-block` (種類の名前だけ) にする。renderer は ServerToolCall (Sources の一覧) と UnsupportedBlockMark を足し、File を名前と種類で出す。リンクは既存の `openExternalIfHttp` の経路
- **機械照合 (FR-013 / FR-014)**: 項目 21 が B 節を `BetaContentBlock` / `ContentBlockParam` の `type` の集合 (33) と `@anthropic-ai/sdk` の版で照合する (AD-060)
- **変えないもの**: `QUERY_OPTION_KEYS`・`SessionEvent` の種類・`AGENT_SDK_ALLOWED_CALLS`・`METER_UPDATE_TYPES`・IPC・preload・main (data-model §0)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270、`@anthropic-ai/sdk` 0.125.0 (Agent SDK の peer。型の読み取りだけ。依存に足さない)、`@assistant-ui/react` 0.15.19 (`FileMessagePart` の `sourceType: 'id'`・data part)

**Storage**: N/A (実行中の server-tool-call の対応づけはメモリの上限 256。永続化しない)

**Testing**: Vitest 5 (node / renderer の 2 project)、vitest-axe、Constitution 検証 (`node scripts/constitution/check.mjs`)、`tests/ui-coverage/`。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)

**Project Type**: desktop-app (main / preload / renderer / agents (supervisor の Worker) / domain)

**Performance Goals**: 送り直しの `result` は 1 回 1,000,000 バイトまで (`RESEND_RESULT_MAX_BYTES`)。Sources は 20 件・名前の列は 20 件まで (data-model §1.2 / §2.2)

**Constraints**: data-model §0。`SYSTEM_EVENT_CATEGORIES` 13 → 20、`TRANSCRIPT_PART_FIELDS` の種類 7 → 9 (file のフィールドを変える)、`LOWER_BOUNDS` に B (33)

**Scale/Scope**: FR 17 / SC 9。新しい表示 2 つ (ServerToolCall・UnsupportedBlockMark)、domain の新設 2 つ

### レイヤごとの変更 (2026-10-22 の作業ツリーで確かめた)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/session/transcript-dto.ts` | category 7 つ (13 → 20)・`server-tool-call` / `unsupported-block` の part・`file` の `mediaType` (`text` を消す)・`TRANSCRIPT_PART_FIELDS` | `:42` (file)、`:68` (categories)、`:154` (fields) |
| domain | `src/domain/session/notice-rows.ts` (新設) | `toNoticeRow` と行に使う小さな関数 (data-model §1) | `live-signals.ts:594-701` から移す |
| domain | `src/domain/session/content-blocks.ts` (新設) | 足すブロックの part の組み立て (data-model §2.2) | — |
| domain | `src/domain/session/live-message.ts` | `toLiveAssistantMessage` の switch に `server_tool_use`・結果のブロック・`default:` の印 | `:76-77` |
| domain | `src/domain/session/transcript.ts` | system の分岐で `toNoticeRow` (`noticeRecordOf`)・`convertBlocks` の新しい case と `default:` の印・server-tool-call の id の表・`documentName` を消す | `:129-134`、`:169-253`、`:300-334` |
| agents | `src/agents/live-signals.ts` | O-6 / O-10 の行を `toNoticeRow` に、`onSystem` の switch に 5 つの subtype、`onNotice` (トップレベル)、`onConversationReset` を `toNoticeRow` に | `:628-701`、`:770-812`、`:839` |
| agents | `src/agents/sdk-agent-session.ts` | `case 'tool_use_summary'` → `signals.onNotice`、`default:` の中の型ガードで `active_goal` → `signals.onNotice` (RK-11)、`case 'assistant'` で `toolResults.applyServerResults` | `:838-858`、`:954-960` |
| agents | `src/agents/live-tool-results.ts` | `server-tool-call` の結果待ちの記憶と `applyServerResults` (data-model §2.3) | `:40-66` (interface) |
| renderer | `src/renderer/src/features/chat/convert.ts` | `server-tool-call` → tool-call (`__serverTool`)、`unsupported-block` → data part、`file` → File (`sourceType: 'id'`) | `:44-91` |
| renderer | `src/renderer/src/features/chat/transcript-guard.ts` | `filterPart` に 2 つの case | `:78-97` |
| renderer | `src/renderer/src/features/chat/labels.ts`・`transcript-announcements.ts` | 7 つの category の見出し・Sources・印・文書の種類の文言、読み上げ (data-model §1.6) | `rowAnnouncement` |
| renderer | `src/renderer/src/components/assistant-ui/elements/` | `server-tool-call.aui.tsx` (新設)・`unsupported-block-mark.tsx` (新設)・`tool-registry.aui.tsx` (`__serverTool` の振り分けを先に)・`thread.aui.tsx` (`SystemEventRow` の表・AssistantMessage の data・UserMessage の Parts)・`subagent.aui.tsx` (入れ子の part の switch) | `thread.aui.tsx:957` (file)・`:1197` 付近 (`SystemEventRow`)・`:1454` 付近 (UserMessage)、`subagent.aui.tsx:148` |
| scripts / tests | `scripts/ui-coverage/coverage.mjs`・`scripts/constitution/check.mjs`・`tests/ui-coverage/` | `interfaceBody`・B 節の照合・版の行・入力 3 つ・`LOWER_BOUNDS.B`・fixture (data-model §3) | `check.mjs:1329-1389` |
| 設定 | `eslint.config.mjs`・`.specify/spec-gate/reviewers.yml` | 新設の手書きの element を一覧に、ui-coverage-reviewer の発火に新設の domain の 2 つ (申し送り #14 / #15) | `eslint.config.mjs:589-611`、`reviewers.yml:54-76` / `:120-141` / `:203-237` |

**未確定の技術事項**: `active_goal` が `query()` の反復で実行時に届くか (型は `SDKMessage` の外。RK-11)。ほかの実データで確かめる事項 (知らせの類・`files_persisted`・`server_tool_use` が届くか、過去ログに行が残るか、文書が残るか) は、どれも両方の形に耐える規則にしてあり、quickstart V-1〜V-5 で記録する

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — `memory_recall` の `path` の末尾は O-11 の `pathTail` で、会話由来の文字列の切り出し (AD-049 Decision 5)。アプリのパスの値ではなく、IPC・port の入力に戻さない。`node:path` を import しない。coverage.mjs の入力のパスは既存の項目 21 と同じ cwd からの相対 (scripts は対象外)
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 分岐を足さない
- [x] **III. 権限モードは capability に従う** — query の options・承認の経路を変えない
- [x] **IV. 通信は Agent SDK 経由** — stream のメッセージと `getSessionMessages` の記録を読むだけ。`@anthropic-ai/sdk` は型の照合 (scripts) だけで、実行時に import しない
- [x] **V. 長期資格情報を永続化しない** — 本文は `redactSecrets` を通す (U-3)。`memory_recall` の本文・絶対パス、`mirror_error` の `key`、`file_id`、`encrypted_content`、文書の中身を運ばない (data-model §1.3 / §2.2)
- [x] **VI. 永続環境を構築・変更しない** — N/A
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — agents が足す import は domain (`notice-rows.ts`・`content-blocks.ts`) だけ。行の規則を domain に移すのはこのため
- [x] **VIII. 日本語環境で破綻しない** — 文言は `labels.ts`。File の英語の既定 ("Unnamed file" / "Download") を出さない (data-model §2.4 / §2.5)。名前の列は折り返す

**Standard**

- [x] **IX. main process をブロックしない** — 変換は agents と取得プロセス、表示は renderer。main の差分 0
- [x] **X. セッションの正本はアプリ外** — 過去ログは SDK の記録のまま。対応づけの記憶は永続化しない
- [x] **XI. 垂直スライス** — US-1〜US-4 はどれも transcript で観測できる。実機は quickstart V-1〜V-5
- [x] **XII. 未表示情報を残さない** — B 節を機械照合に入れ (AD-060)、知らないブロックを捨てずに印にする。完了の PR で `後続: O-12` の行を 0 にする (data-model §4)。Verification の字面 (A・C・E 節) は本 PR で変えない。項目 21 は字面より多くを照合するが字面に反しない。字面の改定 (v1.5.0) は別の PR (spec U-12)。知らないブロックの印を出さない 2 つの経路は user の content を読まない経路で、理由を data-model §2.2 に書いた (spec U-10)
- [x] **XIII. assistant-ui の element と design system を優先** — File は registry の File (`sourceType: 'id'`)。自作の ServerToolCall・Sources の一覧・UnsupportedBlockMark は、tasks (FE-001) で候補 (registry の Sources・Web search・Tool fallback と、取り込み済みの element) と比べて決め、比べた候補と理由を完了の PR の説明に載せる (Principle XIII の Exceptions。SH-010)。F 節の Sources と Web search の備考は比較の結果で書き換える (data-model §4.3)。Checkpoints / Document reference / Inline citation / Follow-up suggestions / Memory の element は使わない (理由は spec U-1 / U-4 / U-5 / U-6 と data-model §4.3)
- [x] **XIV. Ubiquitous Language** — 「知らせの類」「知らないブロックの印」を glossary に足し、System event row の category の列を直す (FR-017。data-model §5)
- [x] **XV. 多言語規約** — 文言は `features/chat/labels.ts` (AD-045 Decision 2)。domain は文言を持たない (トークンと件数だけ)

**Domain charter の整合**

- [x] 本 feature の domain (`ui`) の In scope (transcript の表示・tool 出力の専用表示・`docs/ui-coverage.md` の維持) に収まる。Mission「Claude Code が emit する情報のすべてに専用表示を与え」の残り (Tier B の知らせ・中身のブロック) を埋める
- [x] Out of scope (他 domain の操作 UI) に踏み込まない。agents の変換に触れるが、session の契約 (`SessionEvent`・`meter`・query の options・SDK の許可リスト) は変えない (spec「本 feature の位置づけ」)

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements / Tool UI の実装 (Tier A 必須、Tier B は体験向上)、transcript の表示、tool 出力の専用表示、`docs/ui-coverage.md` の維持 (`charter.md:62-71`)
- 触れる他の domain: `session` — agents の変換 (`live-signals.ts`・`sdk-agent-session.ts`・`live-tool-results.ts`) と domain の `transcript.ts`。`SessionEvent` の種類・`meter`・query の options・SDK の許可リストは変えないが、`SYSTEM_EVENT_CATEGORIES` (13 → 20)・`TRANSCRIPT_PART_FIELDS` (part 2 つ。`file` の `text` を消す互換の変更)・agents の subtype の分岐を広げるので、O-5 / O-6 と同じく session charter の Related Specs と「セッションスレッドの `system` の分岐」の項、`_overview.md` の例外の項に記録する (data-model §5。design-gate H-005)
- charter の frontmatter の `related_adrs` (0057 まで) に AD-060 が、`related_specs` (019 まで) に 022 が無い — 完了の PR で足す (FR-016。data-model §5)

### Related ADRs

- [AD-060](../../docs/decisions/0060-content-block-verification-and-unsupported-block-mark.md) — B 節の機械照合と知らないブロックの印 (AD-044 Decision 4 の読み替え): **proposed** (本 plan で起こした。accepted は `/cl-design`)
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当・機械照合する節 (Decision 4 を AD-060 が読み替える): accepted
- [AD-056](../../docs/decisions/0056-o11-scope-background-task-list-and-o12-split.md) — Decision 1 で O-12 を O-11 から分けた: accepted
- [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) — Decision 3 (`informational` の本文の伏せ字の例外。U-3 の形)・Decision 6 (チェックポイント・task を操作しない。U-4)・取り消し (Decision 2): accepted
- [AD-059](../../docs/decisions/0059-session-resume-query-option-and-conversation-id.md) — `QUERY_OPTION_KEYS` の 12 キー (本 feature は変えない): accepted
- [AD-053](../../docs/decisions/0053-elicitation-callback-and-user-dialog.md) — Decision 6 (`elicitation_complete` の行): accepted
- [AD-051](../../docs/decisions/0051-message-time-source-and-display-only.md) — 行の `createdAt` の出所: accepted
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — 文言は feature ごとの表 (`labels.ts`): accepted
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — (g) options のキーの pin (U-1 で読み替えない): accepted
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — §4 P1 (options の正の構成)・P3 (`Query` は `interrupt` だけ): accepted
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — tool の表示と入れ子 (ServerToolCall は registry の振り分けに入る): accepted
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 取得プロセスの境界と markdown の XSS の境界 (Inline citation を組まない理由。U-5): accepted
- [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) — SDK の emit の分母 (B 節を照合に入れても分母は Agent SDK の emit のまま): accepted
- [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) — element の Tier (F 節の Sources / File / Checkpoints ほか): accepted
- [AD-050](../../docs/decisions/0050-gate-finding-handling-and-round-limit.md) — gate の Medium / Low の扱いと round の上限: proposed (AGENTS.md の gate の原則に入っている)

### Glossary excerpt

- **System event row (システムイベントの行)** (`glossary.md:1176`): 出来事を 1 つにつき 1 行で示す表示 (O-2)。category は O-11 で 13。本 feature で 7 つ (20) を足し、O-6 / O-10 の行の過去ログの変換を足す
- **Informational notice (知らせ)** (`glossary.md:514`): `informational` の行 (O-6)。本 feature で過去ログの変換を足す。「知らせの類」は本 feature が足す語 (知らせ (`informational`) を含む、Claude Code からのモデルの応答でない通知の行の総称)
- **O-12** (`glossary.md:726` / `:730`): 範囲を本 feature の結論に直す
- 新しく足す語: 知らせの類 (Notice row)・知らないブロックの印 (Unsupported block mark) (data-model §5)

## 上流からの申し送り

```text
# 2026-10-22 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
rg -n "022-ui-notices-checkpoints-and-content-blocks" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 2 件 / 1 ファイル (plan を書く前)
# 2) feature ID (spec_id だけでは roadmap・対応表・charter の申し送りに当たらないため足した)
rg -n "\bO-12\b" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 133 件 / 25 ファイル (plan を書く前)
# 3) 新設・変更のモジュール名を実名リスト方式のルールで
rg -n "notice-rows|content-blocks|server-tool|unsupported-block|path-tail|live-signals|web-tool\.aui" .dependency-cruiser.js eslint.config.mjs scripts/constitution/*.mjs .specify/spec-gate/reviewers.yml tests/rule-fixtures/expected.mjs
#    → 3 件 (eslint.config.mjs:607、reviewers.yml:73 / :138。どれも web-tool.aui.tsx の手書きの一覧の位置。新設の名前は 0 件)
rg -n "live-message|transcript-dto|system-event|tool-registry|thread\.aui|convert\.ts|coverage\.mjs|file\.tsx" (同じ 5 ファイル)
#    → 13 件 (eslint.config.mjs:568 / :580 / :591 / :598 / :626、check.mjs:7 / :80 / :1332、reviewers.yml:59 / :60 / :125 / :126 / :209 / :210)
rg -n "ui-coverage/|foreground-tasks|path-tail" .specify/spec-gate/reviewers.yml
#    → 1 件 (:237 の scripts/ui-coverage/**)
```

### 1) spec_id の 2 件

| # | 出所 | 件数 | 処理 |
|---|---|---:|---|
| 1 | `specs/022/spec.md:2`, `:16` | 2 | **当たらない** — 本 spec の frontmatter と見出し |

### 2) feature ID (`O-12`) の 133 件

本 spec の中の 11 件と O-11 (019) の成果物の中の件数 (spec 15・plan 15・tasks 9・data-model 6・research 3・gate の出力) は O-11 が O-12 に送った記録で、roadmap の O-12 の行 (#3) と spec の「義務の扱い」の表に集約されている。残りを出所ごとに割り当てる。

| # | 出所 | 件数 | 内容 | 処理 |
|---|---|---:|---|---|
| 2 | `docs/ui-coverage.md` | 7 (`後続: O-12`: A `:58` / `:74` / `:75` / `:76` / `:77` / `:81` / `:82`) + 1 (A' `:92`) + 3 (B `:107` / `:108` / `:112`) + 備考 (A `:56` / `:57` / `:79` / `:83`、E `:209`) + F 節 (`:250` / `:275` / `:282` / `:285` / `:293` / `:305` / `:337`) | 割当と備考 | **受ける** — data-model §4 が正本。完了の PR で書き換える (FR-014 / FR-015)。B 節の冒頭の文 `:99` の「O-12 に送った」も直す |
| 3 | `docs/roadmap.md:387` (O-12 の行)・`:381` (O-8 の (c))・`:397` (分割の記録)・`:440` (OPT-panel) | 4 | 範囲と義務・O-8 の数え方・分割の記録・着手の目安 | **受ける** — 義務の扱いは spec の表が正本。完了の PR で `:387` に結論、`:381` の (c) に「O-12 の新しい行は `message` なので `receivedMessages` に数える」(FR-016 / FR-017)。`:397` は記録のまま。`:440` は OPT-panel の着手の目安で、O-12 の完了を前提にしない (**当たらない**) |
| 4 | `docs/glossary.md:726`, `:730` | 2 | O-11 の項の「O-12 に送った」・O-12 の項 | **受ける** — 完了の PR で結論に (FR-017。data-model §5) |
| 5 | `docs/prompts.md:228`, `:318`, `:320`, `:324` | 4 | Checkpoints の割当・O-12 の起動文 | **受ける** — `:228` を結論に。`:318-324` は O-12 の起動の記録のまま (**当たらない**) |
| 6 | `docs/domains/_overview.md:70`, `:71`, `:72`, `:73`, `:141` | 5 | feature の一覧の O-12 の範囲・M3 の範囲 | **受ける** — 完了の PR で範囲を結論に。`:141` の「O-12 は M3 の完了の条件に数えない」は変えない |
| 7 | `docs/domains/ui/charter.md:269` | 1 | 残りの feature | **受ける** — 完了の PR で結論に (FR-016) |
| 8 | `docs/decisions/0056-…md:11`, `:27`, `:35`, `:43` | 4 | O-12 への分割 (Decision 1) | **受ける** — 本文は変えない (accepted)。B 節の照合の読み替えは AD-060 が AD-044 Decision 4 を名指す。AD-056 Decision 1 の範囲 (Tier B の知らせの類・Checkpoints・`user/document`・`server_tool_use`・B 節の照合・O-6 / O-10 の過去ログの変換) は spec の「義務の扱い」の 9 行と一致する |

### 3) 実名リスト方式のルール

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 9 | `scripts/constitution/check.mjs:1329-1389` (項目 21) | 入力 5 つ・cwd からの相対 | **受ける** — 入力 3 つを足す (data-model §3.1) |
| 10 | `scripts/ui-coverage/coverage.mjs` の `LOWER_BOUNDS` | `{A:39, C:45, E:38}` | **受ける** — `B: 33` |
| 11 | `tests/ui-coverage/item21.test.ts` | 一時のリポジトリの形 | **受ける** — 3 つのファイルを足す (data-model §3.4) |
| 12 | `src/domain/session/transcript-schema.test.ts:34`, `:113` | part の種類の集合 (7) と file の fixture | **受ける** — 9 種類、file は `{filename, mediaType}` |
| 13 | `system-event.test.ts` の category の集合の固定 | 13 | **受ける** — 20 |
| 14 | `eslint.config.mjs:589-611`・`reviewers.yml:54-76` / `:120-141` | 手書きの element の一覧 (`web-tool.aui.tsx`・`tool-registry.aui.tsx`・`thread.aui.tsx` が載っている) | **受ける** — `server-tool-call.aui.tsx`・`unsupported-block-mark.tsx` を足す。`file.tsx` を変えるなら載っているか確かめて足す |
| 15 | `reviewers.yml:203-237` (ui-coverage-reviewer の発火) | `transcript*`・`live-message*`・`system-event*`・`tool-result*` は載っている。O-11 の `foreground-tasks.ts`・`path-tail.ts` は載っていない | **受ける** — `src/domain/session/notice-rows*.ts`・`content-blocks*.ts` を足す (SDK のメッセージを行・part に変換するモジュール。今の並びの理由と同じ)。`foreground-tasks.ts` の漏れは O-11 の範囲で、本 feature では足さない (**当たらない**。gate の出力に残すなら Medium) |
| 16 | `.dependency-cruiser.js` | 新設の名前で 0 件。新設のファイルは既存のレイヤ規則 (domain / agents / renderer) に入る | **当たらない** — `server-tool-call.aui.tsx` は `tool-registry.aui.tsx` から import され、registry と thread を import しない (O-11 の `no-circular` の注意と同じ。`unsupported-block-mark.tsx` も elements の葉) |
| 17 | `tests/rule-fixtures/expected.mjs` | 新設の名前・`live-message`・`system-event` で 0 件 | **当たらない** |
| 18 | `src/agents/session-core.test.ts` の `QUERY_OPTION_KEYS` の pin | 12 キー | **当たらない** — 変えない (FR-001 / SC-001。V-6 で差分 0 を確かめる) |

### 4) 参考: `src` の `O-12` の注記 (棚卸しの範囲の外)

| # | 出所 | 処理 |
|---|---|---|
| 19 | `src/domain/session/live-message.ts:77` (`server_tool_use` など専用表示を持たないブロックは落とす。O-12) | **受ける** — 本 feature で `default:` を印に替え、注記を直す |

## 実装方針

規則の正本は data-model。ここには 2026-10-22 のソースと突き合わせて決めた置き場所と順序だけを書く。

### 知らせの類 (US-1 / US-2 / US-4)

- `notice-rows.ts` の `toNoticeRow` は `live-signals.ts:628-701` の 4 つの関数の本体を移して表 (data-model §1.3) に揃える。**移した後の `live-signals.ts` の単体テストは今の期待のまま通ること** (O-6 / O-10 の行の形を変えない) を最初に確かめる
- `live-signals.ts` の `buildRowEvent` (`:105`) は `createdAt` に `clock.now()` を使う。`toNoticeRow` の `createdAt` も同じ値を渡す (AD-051)
- `transcript.ts:301-302` の `{ ...asRecord(rec.message), type: 'system' }` は `taskRows.build` に渡すまま残し、`toNoticeRow` には `noticeRecordOf(rec.message)` を渡す (data-model §1.1)。`toNoticeRow` の行も `systemEvents` / `systemEventIndex` に入れ、同じ `notification:<key>` を合成する
- トップレベルの `tool_use_summary` は `sdk-agent-session.ts:958` の `default:` の前に case を足す。`active_goal` は `SDKMessage` の外なので case を書かず、`default:` の中で `asRecord(message)?.type === 'active_goal'` の型ガードで `signals.onNotice` に渡す (cast しない。RK-11 / spec U-13)。`prompt_suggestion` は足さない (`default:` のまま。U-1)

### 中身のブロック (US-2 / US-3)

- `content-blocks.ts` は `sanitizeBody`・`safeStringify`・`TOOL_RESULT_MAX_BYTES`・`redactedBodyLine` を既存のモジュールから import する (`transcript.ts` の `safeStringify` が module の中だけなら `content-blocks.ts` に移して両方から使う)
- `live-message.ts` の `toLiveAssistantMessage` は `server_tool_use` と結果のブロックを part にする (同じメッセージの中の対応づけは `content-blocks.ts` の関数で)。メッセージをまたぐ対応づけは `live-tool-results.ts` の `applyServerResults`
- `live-tool-results.ts` の `walkToolCalls` / `updateToolCall` は `tool-call` の part だけを辿る。`server-tool-call` は主ループのメッセージの直下だけを見る (入れ子は辿らない。data-model §2.3) ので、別の小さな走査にする
- renderer の振り分けは `tool-registry.aui.tsx` の先頭で `args.__serverTool` を見る。`TOOL_DISPLAY` の完全一致の表に server tool の名前 (`web_search` など) を入れない (クライアントの `WebSearch` と混ぜない)
- `thread.aui.tsx` の UserMessage の Parts (`:1454` 付近の `{Text, File: UserFilePart, Image}`) に data の部品を足す。assistant-ui core は user ロールの data part を受ける (thread-message-like)。描けなければ RK-04

### 機械照合 (FR-013 / FR-014)

- coverage.mjs の今の関数 (`typeAliasBody`・`objectTopLevelText`・`unionMemberNames`) は変えず、`interfaceBody` と B 節の読み取り・照合の関数を足す。`checkCoverage` の入力のオブジェクトに 3 つを足し、項目 21 が読んで渡す
- 対応表の B 節の書き換え (data-model §4.2) は照合の実装と同じ PR で行う (照合が先に入ると CI が落ちる)

### 実装の順

1. domain の DTO (category・part・fields) と固定テスト
2. `notice-rows.ts` (O-6 / O-10 の移設を先に、今のテストを通す → 7 つの種類) と `transcript.ts` の system の分岐
3. `content-blocks.ts` と `live-message.ts` / `transcript.ts` のブロックの変換
4. agents (`live-signals.ts`・`sdk-agent-session.ts`・`live-tool-results.ts`)
5. renderer (`convert.ts`・`transcript-guard.ts`・ラベルと読み上げ・`SystemEventRow`・ServerToolCall・UnsupportedBlockMark・File・入れ子)
6. scripts (coverage.mjs・項目 21・fixture) と対応表の B 節
7. 記録 (対応表の残り・roadmap・glossary・ui charter・session charter・`_overview.md`・`prompts.md`・AD-060 の status・eslint / reviewers.yml の一覧・src の注記・PR の説明の候補比較)。Constitution は変えない (spec U-12)

## 機械強制の変更

- **項目 21**: B 節の照合・`@anthropic-ai/sdk` の版・入力 3 つ・`LOWER_BOUNDS.B` (data-model §3)。fixture 6 つと item21 の一時のリポジトリ
- **固定テスト**: `SYSTEM_EVENT_CATEGORIES` (20)、`TRANSCRIPT_PART_FIELDS` (9 種類・file のフィールド)、`QUERY_OPTION_KEYS` (12 のまま)
- **単体**: data-model §1.3 の表の 12 の種類 (実行中と過去ログの両方で同じ行になる・読まないフィールドの目印の値が DTO に 0 件)、§1.4 / §1.5 (名前の列・件数・上限)、§2.2 の表 (B 節の 33 行のブロックを role の規則と経路の表 (印を出す 3 経路・出さない 2 経路) で流して、印を出す経路ではどれも専用の part か `unsupported-block` になり、出さない経路では tool_result だけが part になる。SC-004)、§2.3 (対応づけ: 同じメッセージ・別のメッセージ・対応なし・2 つ目の結果・取り消した根)、過去ログの判別子のある記録と無い記録 (SC-005)
- **component**: 7 つの category の行 (見出し・tone・読み上げ)、ServerToolCall (Sources・http(s) だけのリンク・エラー・印・結果待ち / 結果不明。vitest-axe の違反 0)、UnsupportedBlockMark (assistant と user)、File (名前と種類・英語の既定が出ない)
- **lint**: 新設の手書きの element を `eslint.config.mjs` の一覧に (申し送り #14)

## ADR

- **AD-060 を proposed で起こした** (B 節の照合の基準・`@anthropic-ai/sdk` の版・知らないブロックの印・`表示不要` の行の扱い)。accepted は `/cl-design` (main) が夜間の規則で行う
- **Constitution は本 feature の PR で変えない** (spec U-12。design-gate H-003 / H-004)。Principle XII の Verification (Automated) の「A・C・E 節」を「A・B・C・E 節」に改め、B 節の型の出所を足す改定は、照合の範囲を広げるのでバージョニング方針表の「Principle の追加、指針の実質的な拡張 = MINOR」(`constitution.md:1052`) に当たり v1.5.0 とする (「Verification の『現状の制約』を事実に追随させる = PATCH」(`:1055`) は制約の記述を事実に合わせる改定で、範囲を広げる改定ではない)。改定手順 2 (`architecture-reviewer` の owner を交えた人間レビュー。`constitution.md:352`) は夜間の自走で満たせないので、利用者のレビューの後に別の PR で行い、roadmap の O-12 の行に持ち越しとして書く (SH-010)。それまで項目 21 は字面より多く (B 節) を照合するが、字面の「A・C・E 節が一致すること」に反しない
- 他の ADR は起こさない。U-1 (`promptSuggestions` を渡さない) は AD-041 (g) の読み替えにならない (キーを足さない)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 夜間の規則で採った U-1〜U-9 と AD-060 が利用者の確認で覆る | 覆ったときの影響の範囲: U-1 (渡す) → AD-041 (g) の読み替えの ADR と `QUERY_OPTION_KEYS` 13、composer の上の候補の表示を足して /cl-plan からやり直す / U-2 (右のペイン) → `METER_UPDATE_TYPES` とタブを足し、§1 の行は残す / U-5 (Inline citation も) → AD-034 の境界の ADR が要る / U-7 (照合しない) → §3 と AD-060 Decision 1 / 2 を外す / U-8 (捨てる) → `unsupported-block` を外し B 節の 23 行を `表示不要` にする。どの場合も design-gate の結果を捨てて `/cl-design --from plan` から回し直す |
| RK-02 | O-6 / O-10 の行を domain に移すと実行中の行の形が変わる | 実装の順の 2 で、移す前の `live-signals.test.ts` の期待を変えずに通すことを最初に確かめる。変わったら移設をやめて呼び出しを包む形にする |
| RK-03 | pnpm の配置が変わり `node_modules/@anthropic-ai/sdk` が無くなる (hoisted でなくなる・Agent SDK が依存を外す) | 項目 21 が「入力が無い」で落ちる (気づける)。そのときは読む経路を Agent SDK の配下 (`node_modules/@anthropic-ai/claude-agent-sdk/node_modules/@anthropic-ai/sdk`) に替える分岐を足すか、AD-060 を見直す |
| RK-04 | assistant-ui の user ロールで data part が描けない (UserMessage の Parts が data を受けない) | 実装の順の 5 で最初に component テストで確かめる。描けなければ user の `unsupported-block` を `convert.ts` で text の part (印の文言) に写す (DTO は変えない) |
| RK-05 | `server_tool_use` と結果のブロックが別のメッセージで届き、実行中の対応づけで送り直しが増える | 送り直しは結果のブロック 1 つにつき 1 回、大きさは `RESEND_RESULT_MAX_BYTES` まで (data-model §2.3)。単体で回数を固定する。V-3 で届き方を記録する |
| RK-06 | 知らせの類の行が多すぎて transcript が読みにくい (`notification`・`tool_use_summary`・`active_goal` が毎ターン届く) | 控えめの見た目・読み上げない (data-model §1.6)。V-1 で記録し、多ければ利用者に返す (まとめる規則を足すかは spec の範囲の外) |
| RK-07 | 過去ログの記録の形が想定と違い (トップレベルの種類が残らない・`subtype` が別の場所)、行にならない | 判別子が読めなければ今の本文のまま (U-9。今より悪くならない)。V-4 で形を記録し、対応表の経路は記録どおりに書く (data-model §4.4) |
| RK-08 | category の追加で renderer の網羅の表が型で落ちる | 意図した失敗 (research R-15)。`SYSTEM_EVENT_ICONS`・`systemEventDetailText`・ラベル・読み上げに足す。`category === '...'` で判定している箇所を Grep で洗う |
| RK-09 | `file` の part の `text` を消すと、`text` を読んでいる箇所 (検索・テスト) が壊れる | `'file'` の Grep の結果 (2026-10-22): `transcript-dto.ts:42`・`transcript.ts:245`・`convert.ts:74`・`subagent.aui.tsx:148`・`thread.aui.tsx:957`・fixture の `transcript-schema.test.ts:34` と `conversation-search.test.ts:227`。どれも本 feature で触れる。O-9 の検索が file の part のどのフィールドを読むかを tasks で確かめ、fixture を直す |
| RK-10 | registry の Sources / Web search を取り込むかで F 節の割当と表示が変わる | tasks の最初に registry の Sources・Web search と既存の element を候補として照合する (Principle XIII。FE-001)。外部リンクの経路 (http(s) だけ・`openExternalIfHttp`) に合わなければ取り込まず、F 節の備考と PR の説明に理由を書く |
| RK-11 | `active_goal` (`SDKActiveGoalMessage`) は `SDKMessage` の union の外 (`sdk.d.ts:8820` の `StdoutMessage` にだけある)。stream の switch に `case 'active_goal'` を書くと TS2678 になり、`query()` の反復が実行時に返すかも確かめていない | 型: `default:` の中で `asRecord(message)?.type === 'active_goal'` を確かめる型ガードで受け、`signals.onNotice` の引数は `unknown` (`as` の cast をしない。Principle IV)。BE-012 の単体で偽の `active_goal` を流して行になることを、SH-013 の型検査 (`tsconfig.node.json`) で cast が無く通ることを確かめる。実行時: quickstart V-1 の 5 で「届いた / 届かない」を記録する。届かなくても割当は `実装済み` のまま (spec Assumptions)。対応表の A' `active_goal` の経路は data-model §4.4 に従い、届かなければ備考に「実行中に届くかは 022 quickstart V-1 で未確認 / 届かない」と書く |

## Project Structure

### Documentation (this feature)

```text
specs/022-ui-notices-checkpoints-and-content-blocks/
├── spec.md              # status: planning
├── plan.md              # 本ファイル
├── research.md          # Phase 0 (R-01〜R-15)
├── data-model.md        # Phase 1 (§0〜§5。規則の正本)
├── quickstart.md        # Phase 1 (V-0〜V-6)
└── tasks.md             # Phase 2 (/cl-tasks)
docs/decisions/0060-content-block-verification-and-unsupported-block-mark.md   # AD-060 (proposed)
```

contracts/ は作らない: IPC・preload・port の契約を変えない (`SessionEvent` の種類は不変。DTO の part の追加は domain の型と `TRANSCRIPT_PART_FIELDS` の固定テストが正本で、data-model §2.1 に書いた)。

### Source Code (repository root)

```text
src/domain/session/
├── transcript-dto.ts        # category・part・fields
├── notice-rows.ts           # 新設 (toNoticeRow)
├── content-blocks.ts        # 新設 (server-tool-call・document・unsupported-block)
├── live-message.ts          # ブロックの switch
└── transcript.ts            # system の分岐・ブロックの switch・対応づけ
src/agents/
├── live-signals.ts          # O-6 / O-10 の行を domain に・5 つの subtype・onNotice
├── sdk-agent-session.ts     # tool_use_summary / active_goal・applyServerResults
└── live-tool-results.ts     # server-tool-call の記憶と applyServerResults
src/renderer/src/features/chat/{convert.ts, transcript-guard.ts, labels.ts, transcript-announcements.ts}
src/renderer/src/components/assistant-ui/elements/
├── server-tool-call.aui.tsx # 新設
├── unsupported-block-mark.tsx # 新設
└── tool-registry.aui.tsx / thread.aui.tsx / subagent.aui.tsx
scripts/ui-coverage/coverage.mjs / scripts/constitution/check.mjs
tests/ui-coverage/{coverage.test.ts, item21.test.ts}
eslint.config.mjs / .specify/spec-gate/reviewers.yml
docs/ui-coverage.md / docs/roadmap.md / docs/glossary.md / docs/domains/ui/charter.md / docs/domains/_overview.md / docs/prompts.md
docs/domains/session/charter.md / docs/decisions/0060 (status)
# .specify/memory/constitution.md は変えない (v1.5.0 は別の PR。spec U-12)
```

**Structure Decision**: 既存のレイヤ (domain / agents / renderer / scripts) に置く。新しいディレクトリは作らない。

## 設計後の見直し (Constitution Check の再確認)

- Phase 1 の成果物 (research / data-model / quickstart) をソースと突き合わせ、spec との食い違いは無かった。spec が plan に預けた 2 点 (DTO の part を足すか・`@anthropic-ai/sdk` の読む経路) は「判断の承認」に書いたとおり決めた。どちらも Constitution の判定を変えない
- 見直しで足したもの: (1) 過去ログの system の記録は今 `type` を `'system'` で上書きしているので、トップレベルの種類を読めるよう `noticeRecordOf` を足した (data-model §1.1)、(2) Constitution XII の Verification の字面が「A・C・E 節」で AD-060 より狭い。design では v1.4.1 (PATCH) を足したが、design-gate H-003 / H-004 で v1.5.0 (MINOR) の別の PR に改めた (spec U-12)、(3) ui-coverage-reviewer の発火に新設の domain の 2 つを足す (申し送り #15)
- XIII は registry の Sources の取り込みを tasks で照合する (RK-10)。決めるのは element の選択で、Principle の採否ではない

## Complexity Tracking

Constitution Check に違反は無い。記録する複雑さ:

| 追加 | 必要な理由 | 退けた単純な案 |
|---|---|---|
| DTO の part を 2 つ足す (`server-tool-call`・`unsupported-block`) | Sources と印を型で縛り、信頼の印を argsText / result の名前空間から分ける (research R-08 / R-12) | tool-call の `result` に JSON の文字列で Sources を入れる (信頼の印が会話由来の値と混ざる。PR-H-1 と同じ問題) |
| 実行中の server-tool-call の対応づけ (`applyServerResults`) | Claude Code はブロックを別のメッセージで送るので、同じメッセージの中だけでは結果が埋まらない (research R-08) | 対応づけをせず結果を単独で出す (US-3 AC1「1 つの tool の表示に出る」を満たさない) |
