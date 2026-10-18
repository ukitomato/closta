# Implementation Plan: Hook・背景の task・実行中の subagent の表示 (O-11)

**Branch**: `019-ui-hooks-tasks-subagents-and-notices` (main 1761c32 の上で起こし、2026-10-18 に main 6fa08c2 (O-9 #20 / O-10 #23 のマージ後) に rebase) | **Date**: 2026-10-17 (`/cl-plan`。夜間の自走。利用者は不在) / 2026-10-18 (承認の記録と main との突き合わせ) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) (U-1〜U-11 と AD-054 / AD-055 / AD-056 は **2026-10-17 に利用者が承認** (accepted)。`.needs-input.md` の Q1 / Q2 は main が夜間の方針で回答し、spec と AD-055 に反映して消した)

本 plan は spec / [research.md](./research.md) / [data-model.md](./data-model.md) / [quickstart.md](./quickstart.md) を正本として参照し、規則を書き写さない。本 plan が足すのは、2026-10-17 の作業ツリーと突き合わせて決めた**置き場所と手順** (下の「実装方針」) と、上流からの申し送りの棚卸しである。

## 判断の承認 (design-gate H-02 の解消)

- **2026-10-17 に利用者が U-1〜U-11 と AD-054 / AD-055 / AD-056 を承認した。** 3 つの ADR は accepted にした。U-9〜U-11 は design-gate (round 1) の H-03 / H-04 / H-09 の修正で足したもので、同じ承認に含まれる。夜間の自走では推奨案を仮採用して design-gate まで進め、実装 (`/cl-implement`) は承認を待った
- AGENTS.md の gated 確定事項に当たるもの: **U-3** (背景の task の一覧の持ち主の domain を `ui` にする = domain の分解) と **U-7** (Principle XIII の Agent handoff の element を使わない = Constitution Principle の採否)。どちらも承認済み
- U-8 は design で SDK 0.3.270 を確かめた結果の書き直し (`.needs-input.md` の Q1 の回答 A)。AD-055 は proposed の間に Decision 1 / 2 を書き直し、その後に承認された
- 承認の記録の前に、main にマージされた O-9 / O-10 との突き合わせで AD-054 (キーの数を `onElicitation` との和集合に) と AD-056 (Decision 1 に O-10 の `elicitation_complete` の過去ログの変換、Consequences にタブの数) を直した。突き合わせの全体は下の「上流からの申し送り」の 5)

## Summary

- **一般の Hook (US-1)**: `buildQueryOptions` に `includeHookEvents: true` を足す。行は O-2 の変換のまま。renderer は名前を伏せた行に「Hook ({hook_event}) {n}」の通し番号を付け、失敗・取り消しの Hook を注意の見た目にし、一般の Hook は失敗・取り消しだけを読む
- **背景の task (US-2)**: domain の前景の task の記憶で、`task_updated` の `patch.is_backgrounded` が true になった task の行を category `backgrounded-task` で開く (実行中と過去ログ)。シェルの task の行の名前に、起動した `Bash` の呼び出しのコマンドの名前 (O-1 の規則を domain に移す) を入れる。`background_tasks_changed` を `meter` の種類 `background-tasks` で送り、右のペインのタブ「背景の task」に出す
- **subagent の入れ子 (US-3)**: `forwardSubagentText: true` を足し、agents の `live-tool-results.ts` が `parent_tool_use_id` 付きのメッセージを親の tool-call の `children` に入れて根を送り直す。過去ログは `read-transcript.ts` が `listSubagents` / `getSubagentMessages` で読み、domain が `parent_tool_use_id` で入れ子にする。入れ子の tool は主ループと同じ registry の表示で描く
- **記録と機械強制**: 項目 14 に呼び出しごとのファイルの制限 (`AGENT_SDK_CALL_FILES`)、対応表の書き換え (data-model §4)、roadmap に O-12

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (型の行番号は research の各節)、`@assistant-ui/react` 0.15.19 (`TextMessagePartProvider`)、`@assistant-ui/react-markdown` 0.14.15 (import は `markdown-text.tsx` だけのまま)

**Storage**: N/A (前景の task の記憶・根の DTO・背景の task の一覧はメモリの上限つき。永続化しない)

**Testing**: Vitest 5 (node / renderer の 2 project)、vitest-axe、Constitution 検証 (`node scripts/constitution/check.mjs`)、rule fixtures (`tests/rule-fixtures/`)。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)

**Project Type**: desktop-app (main / preload / renderer / agents (supervisor の Worker) / domain)

**Performance Goals**: 根の送り直しは 1 回 1,000,000 バイトまで (data-model §3.1)。過去ログの取得は subagent 32 件 × 500 メッセージまで (取得プロセスで走るので main は塞がない。Principle IX)

**Constraints**: data-model の冒頭の「変えないもの」。`MeterUpdate` の種類は 9 → 10、`SYSTEM_EVENT_CATEGORIES` は 12 → 13 (O-10 の `elicitation` の後)、`QUERY_OPTION_KEYS` は 9 → 11 (AD-053 の `onElicitation` との和集合)、`AGENT_SDK_ALLOWED_CALLS` は 3 → 5、`PANEL_TABS` は 4 → 5 (O-9 の会話の地図の後)

**Scale/Scope**: FR 16 / SC 5。新しい表示 1 つ (背景の task のタブ) と共有の部品 1 つ (markdown の本文)

### レイヤごとの変更 (2026-10-17 の作業ツリーで確かめ、2026-10-18 に main 6fa08c2 で起点を引き直した)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/session/transcript-dto.ts` | `SYSTEM_EVENT_CATEGORIES` に `backgrounded-task` (12 → 13) | `:68-82` |
| domain | `src/domain/session/system-event.ts` | 後から背景に移った task の行 (記憶を受ける形。`toSystemEventMessage(raw, createdAt)` (`:124-127`。O-9 が `createdAt` を足した) と同じ引数に `argsText` を足す)・`mergedDetail` の分岐 | `:124-205` (Grep で引き直す) |
| domain | `src/domain/session/foreground-tasks.ts` (新設) | 前景の task の記憶 (data-model §2.1) | — |
| domain | `src/domain/session/command-name.ts` / `path-tail.ts` (新設) | `bashCommandName` と `pathTail` を renderer から移す (data-model §2.3) | renderer `session-view.ts:243-265`、`features/chat/path-tail.ts` |
| domain | `src/domain/session/meter.ts` | `background-tasks` の型・定数 (`MAX_BACKGROUND_TASKS = 64`)・`decodeMeterUpdate` の case | `:75-85`, `:101-124`, `:351-404` |
| domain | `src/domain/session/transcript.ts` | `toTranscriptMessages(records, options)` の `options` (O-9 の `ToTranscriptMessagesOptions`。今は `now`) に `subagents` を足す・前景の task の記憶・シェルの task の名前 | `:40-43` (options)、`:173-333` (`:197-224` の system、`:310-330` の入れ子) |
| agents | `src/agents/session-core.ts` | `QUERY_OPTION_KEYS` に 2 キー (9 → 11。AD-053 の `onElicitation` の後)、`buildQueryOptions` と `BuiltQueryOptions` | `:63-74`、`:119-` |
| agents | `src/agents/sdk-agent-session.ts` | `case 'assistant'` / `case 'user'` で `parent_tool_use_id` 付きを入れ子の経路へ、`case 'system'` で帰属つきの system の振り分けと前景の task の記憶・`background_tasks_changed`。受信時刻 `receivedAt` (`:653`。O-9) を子の DTO と task の行にも渡す | `:658-728` |
| agents | `src/agents/live-tool-results.ts` | 根の DTO と位置の表・深い位置への子と結果・取り消しの配下・`Bash` の呼び出しの引き当て (data-model §3.1 / §2.3)。`applyUserMessage(raw, receivedAt)` (O-9 の第 2 引数) は変えない | `:27-182` |
| agents | `src/agents/live-signals.ts` | `background-tasks` の `meter` を `send` で即時に送る関数。`:836` の注記の「O-11」を直す | `:269` (`send`)、`onSystem` (Grep で引く)、`:836` |
| agents | `src/agents/read-transcript.ts` | `listSubagents` / `getSubagentMessages` (data-model §3.2)。冒頭の表の「`getSessionMessages()` のみ」を直す | `:3`, `:11`, `:70-74` |
| renderer | `src/renderer/src/features/session/running-session-types.ts` / `running-session-store.ts` | `SessionMeters.backgroundTasks`・`applyMeter` の case | types `:111-147` / `EMPTY_SESSION_METERS` `:145`、store `applyMeter` `:193` / `case 'meter'` `:487` |
| renderer | `src/renderer/src/stores/ui.ts` / `src/renderer/src/features/shell/panel-tabs.ts` と新設のタブの中身 | `PanelTabId` (`ui.ts:31`。今は 4 つ) に `'background-tasks'`、`PANEL_TABS` (`:35-69`) の末尾 (O-9 の `conversation-map` の後) に「背景の task」のタブ。`ui.ts:28-29` と `panel-tabs.ts:16` の注記を直す | `PANEL_TABS` |
| renderer | `src/renderer/src/features/chat/` | `labels.ts` (「背景に移した」・伏せた Hook の見出し・`other` の種類・タブの文言)・`transcript-announcements.ts` (一般の Hook)・伏せた Hook の番号の純関数 (新設)・`convert.ts` (tool-call の props の共有の関数を export)・`path-tail.ts` (re-export) | `labels.ts:300-312`、`transcript-announcements.ts` の `rowAnnouncement` |
| renderer | `src/renderer/src/features/session/session-view.ts` | `bashCommandName` を domain から | `:243-265` |
| renderer | `src/renderer/src/components/assistant-ui/elements/` | `subagent.aui.tsx` (入れ子の tool を registry で・text を markdown で・深さの context)・`markdown-body.tsx` (新設)・`agent-plan.aui.tsx` (共有の部品を使う)・`thread.aui.tsx` (`SystemEventRow` の tone・`SYSTEM_EVENT_ICONS`・`systemEventDetailText`・伏せた Hook の見出し) | `subagent.aui.tsx` の `VISUAL_MAX_DEPTH`、`agent-plan.aui.tsx:93-95`、`thread.aui.tsx` の `SystemEventRow` |
| scripts / tests | `scripts/constitution/allowlists.mjs`・`check.mjs`・`tests/rule-fixtures/` | `AGENT_SDK_ALLOWED_CALLS` (5)・`AGENT_SDK_CALL_FILES`・項目 14 のファイルの制限・fixture 2 本・`UNDETECTED_NOTES` の文言 | `allowlists.mjs:365-379`、`check.mjs:702-716`、`expected.mjs:239-240` / `:695-703` |
| 設定 | `eslint.config.mjs`・`.specify/spec-gate/reviewers.yml` | 新設の手書きの element (`markdown-body.tsx`・タブの中身) を手書きの一覧に (申し送り #22) | `eslint.config.mjs:590-608`、`reviewers.yml:54-76` / `:119-140` |

**未確定の技術事項**: なし。実データで確かめる事項 (`hook_name` の形・過去ログに Hook / task の行が残るか・subagent の text の届き方・subagent の system の帰属・入れ子の subagent のファイルの列挙) は、どれも両方の形に耐える規則にしてあり、quickstart V-1〜V-6 で記録する

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — `pathTail` を domain に移すが、会話由来の本文 (`Bash` の `command`) の文字列の切り出しで、アプリのパスの値ではない (AD-049 Decision 5。research R-05)。`node:path` / `path-api` を import しない。切った値を IPC・port の入力に戻さない。`listSubagents` / `getSubagentMessages` の `dir` は渡さない (SDK の既定の解決のまま)
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 分岐を足さない
- [x] **III. 権限モードは capability に従う** — 2 キーは escalation-neutral (AD-054 Decision 2)。`permission_denied` の扱い・承認の経路を変えない (帰属つきの system の判定より前で扱う。data-model §3.1)
- [x] **IV. 通信は Agent SDK 経由** — 過去ログの subagent は SDK の `listSubagents` / `getSubagentMessages` で読み、JSONL を自前で読まない (Principle IV の Statement に合う)。許可リストの追加は AD-055。`Query` の呼び出しは `interrupt` だけ (`background_tasks_changed` は stream のメッセージを読むだけで、`Query.backgroundTasks` は禁止のまま。O-6 の fixture `sdk-query-background-tasks`)
- [x] **V. 長期資格情報を永続化しない** — Hook の出力本文・終了コードを読まない。`local_bash` の `description` を読まず、コマンドの名前は秘密の形を弾く規則 (`SAFE_NAME` / `SECRET_PREFIX` / 不安全な文字) を通す。subagent の本文は主ループと同じ無害化。`background-tasks` は id と種類だけ
- [x] **VI. 永続環境を構築・変更しない** — N/A
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — agents が足す import は domain (`foreground-tasks.ts`・`command-name.ts`・`meter.ts`・`transcript.ts`) と SDK だけ。コマンドの名前の規則を domain に移すのはこのため
- [x] **VIII. 日本語環境で破綻しない** — composer を変えない。新しい文言は `labels.ts`。入れ子の text の markdown は O-6 の `MarkdownText` (日本語の折り返しは O-6 で確かめ済み)

**Standard**

- [x] **IX. main process をブロックしない** — 変換は agents と取得プロセス、表示は renderer。main の差分 0
- [x] **X. セッションの正本はアプリ外** — 一覧は稼働中のストアのキャッシュで永続化しない。過去ログは SDK の記録のまま
- [x] **XI. 垂直スライス** — US-1〜US-3 はどれも transcript と右のペインで観測できる。実機は quickstart V-1〜V-6
- [x] **XII. 未表示情報を残さない** — 完了の PR で対応表を data-model §4 のとおりに書き換え、D 節の Tier A 3 行が `実装済み` になる。Tier B の残りは O-12 を roadmap に登録して割り当てる (FR-012 / FR-014)。項目 21 が ok
- [x] **XIII. assistant-ui の element と design system を優先** — 入れ子は registry の Subagent の表示 (AD-035) と既存の tool の表示を使う。markdown は O-6 の `MarkdownText`。**Agent handoff は使わない (U-7。2026-10-17 に承認)**: Claude Code の subagent は親に結果を返すだけで主導権を渡さない。**Background runs は使わない**: registry の element は実行の履歴と操作の一覧で、本 feature の一覧は操作を持たない置き換えの最新値。右のペインのタブの既存の枠 (O-4 / O-5 / O-9 のタブ) で描く。Task card は背景の task の行 (SystemEventRow) と一覧で描く (O-2 の判断のまま)
- [x] **XIV. Ubiquitous Language** — 用語 (一般の Hook・背景の task の一覧・後から背景に移った task・O-12) を先に glossary に足し、System event row・Meter・Hook・Background task の定義を直す (FR-016)
- [x] **XV. 多言語規約** — 文言は `features/chat/labels.ts` (AD-045 Decision 2)。domain の divider の label は過去ログと同じ値を使い、表示は TranscriptBoundary の文言

**Domain charter の整合**

- [x] 本 feature の domain (`ui`) の In scope (tool 出力の専用表示・Subagent・transcript の表示・`docs/ui-coverage.md` の維持・右のペインのタブ) に収まる
- [x] Out of scope (他 domain の操作 UI) には、session の契約 (query の options・SDK の許可リスト・agents の入れ子・`meter` の種類) に触れる点で踏み込む。O-4 U-1・O-6 U-6 と同じく spec U-6 で扱い (2026-10-17 に承認)、session charter に記録する (FR-015)
- [x] 一覧の持ち主の domain (U-3) は AD-044 Decision 6 (session に Hook / task の責務を持たせない) と整合する (AD-056 の読み替え)。**gated 確定事項で、2026-10-17 に承認**

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements / Tool UI の実装、transcript の表示、tool 出力の専用表示 (Subagent ほか)、`docs/ui-coverage.md` の維持、アプリのシェル (右のペインのタブを含む。本 feature はタブを 1 つ足す)
- 触れる他の domain: `session` ([charter](../../docs/domains/session/charter.md)) — query の options (AD-054)・Agent SDK の呼び出しの許可リスト (AD-055)・agents のセッションスレッドの入れ子・`meter` の種類 `background-tasks` (AD-056)。session charter の O-11 の項 (`:310-313`) に記録する (FR-015)
- charter の frontmatter の `related_adrs` に AD-054 / AD-055 / AD-056 が、`related_specs` に 019 が無い — FR-015 / FR-016 の記録の更新で足す (SH-002)

### Related ADRs

- [AD-054](../../docs/decisions/0054-query-options-hook-events-and-subagent-text.md) — query の options に `includeHookEvents` / `forwardSubagentText` (AD-041 (g) の読み替え。AD-053 の `onElicitation` との和集合で 11 キー): **accepted** (本 feature で起こした。2026-10-17 に承認)
- [AD-055](../../docs/decisions/0055-subagent-messages-for-past-transcripts.md) — 過去ログの subagent を `listSubagents` / `getSubagentMessages` で読む (AD-035 Decision 3 の読み替えと許可リストの追加): **accepted** (本 feature で起こし、design で Decision 1 / 2 を書き直した。U-8。2026-10-17 に承認)
- [AD-056](../../docs/decisions/0056-o11-scope-background-task-list-and-o12-split.md) — 背景の task の一覧・Hook の一覧と計画の一覧を作らないこと・O-12 への分割: **accepted** (2026-10-17 に承認)
- [AD-053](../../docs/decisions/0053-elicitation-callback-and-user-dialog.md) — O-10 が `QUERY_OPTION_KEYS` に `onElicitation` を足した (AD-041 (g) の読み替え)。本 feature の pin はその和集合: accepted
- [AD-051](../../docs/decisions/0051-message-time-source-and-display-only.md) — メッセージの時刻 `createdAt` の出所 (O-9)。入れ子の子のメッセージと task の行も同じ規則で埋める: accepted
- [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) — O-11 への分割 (Decision 1)・task / チェックポイントを操作しない (Decision 6)・取り消し: accepted
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter` と行を agents で組む形。Decision 2 (運ぶ値) を AD-056 が読み替える: accepted
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — 右のペインのタブの表とキーボード操作: accepted
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当・M3 の完了の条件・Decision 6 (Hook / task の状態を session に持たせない): accepted
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — options のキーの pin。(g) を AD-054 が読み替える: accepted
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — §4 P1 (options の正の構成)・P3 (`Query` は `interrupt` だけ。読み替えない): accepted
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Subagent の表示と入れ子の健全性 (Decision 4 / 5 / 6)。Decision 3 を AD-055 が読み替える: accepted
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 取得プロセスの境界 (`read-transcript.ts`): accepted
- [AD-050](../../docs/decisions/0050-gate-finding-handling-and-round-limit.md) — gate の Medium / Low の扱いと round の上限: proposed (AGENTS.md の gate の原則に入っている)

### Glossary excerpt

- **Hook (フック)**: セッションのイベントに合わせて走るコマンド。O-2 は出力本文を出さない。一般の Hook の表示は O-11 (`glossary.md:442` / `:472`)。本 feature で「一般の Hook」を足し、O-11 の注記を直す
- **Background task (背景の task)**: 背景で動く task (subagent・シェルのコマンド)。実行中の task の一覧の要否は O-11 で判断する (`glossary.md:99`)。本 feature で「背景の task の一覧」「後から背景に移った task」を足す
- **System event row (システムイベントの行)**: Hook / Background task などの出来事を 1 つにつき 1 行で示す表示 (O-2)。本 feature が category `backgrounded-task` を足す
- **Meter (計量)**: 実行中のセッションの最新の値 (O-4)。本 feature が `background-tasks` (task の id と種類の列) を足す
- **Informational notice (知らせ)**: O-6 の `informational` の行。本 feature では変えない (過去ログの変換は O-12)
- **O-11** (`glossary.md:669`): 範囲を本 feature に直し、O-12 を足す

## 上流からの申し送り

```text
# 2026-10-17 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
rg -n "019-ui-hooks-tasks-subagents-and-notices" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 7 件 / 5 ファイル (plan を書く前。.needs-input.md は回答を反映して消した)
# 2) feature ID (spec_id だけでは roadmap・対応表・charter の申し送りに当たらないため足した)
rg -n "\bO-11\b" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 285 件 / 38 ファイル (plan を書く前)
# 3) 新設・変更のモジュール名を実名リスト方式のルールで
rg -n "foreground-tasks|command-name|markdown-body|background-tasks|backgrounded-task|listSubagents|getSubagentMessages|AGENT_SDK_CALL_FILES|includeHookEvents|forwardSubagentText" .dependency-cruiser.js eslint.config.mjs scripts/constitution/*.mjs .specify/spec-gate/reviewers.yml tests/rule-fixtures/expected.mjs
#    → 2 件 (expected.mjs:377-378 の O-6 の fixture `sdk-query-background-tasks`。Query.backgroundTasks の禁止で、本 feature は呼ばない)
rg -n "read-transcript|AGENT_SDK_ALLOWED_CALLS|session-view|path-tail|subagent\.aui|panel-tabs" (同じ 4 ファイル)
#    → 9 件 (eslint.config.mjs:594、reviewers.yml:50 / :57 / :115 / :122 / :222 / :228、allowlists.mjs:360 / :369 / :379)
# 参考 (棚卸しの範囲の外): rg -n "\bO-11\b" src → 4 件
```

### 1) spec_id の 7 件

| # | 出所 | 件数 | 処理 |
|---|---|---:|---|
| 1 | `specs/019/spec.md:2`, `:16` | 2 | **当たらない** — 本 spec の frontmatter と見出し |
| 2 | `specs/019/.needs-input.md:6`, `:21` | 2 | **受ける** — Q1 / Q2 の回答を spec (U-8・FR-010 / FR-013 / FR-015・SC-003 / SC-004・US-3 AC3 / AC4・Assumptions) と AD-055 に反映し、ファイルを消した |
| 3 | `docs/decisions/0054-…md:13`・`0055-…md:13`・`0056-…md:13` | 3 | **受ける** — 本 feature の ADR。AD-055 は U-8 で書き直した。3 つとも 2026-10-17 の承認で accepted にした |

### 2) feature ID (`O-11`) の 285 件

本 spec の中の 17 件 (spec) と O-6 (016) の成果物の中の件数 (spec・plan・research・data-model・quickstart・tasks・quickstart-results・gate の出力) は O-6 が O-11 に送った記録で、roadmap の O-11 の行 (#5) に集約されている。残りを出所ごとに割り当てる。

| # | 出所 | 件数 | 内容 | 処理 |
|---|---|---:|---|---|
| 4 | `docs/ui-coverage.md` | 37 (main 6fa08c2 で 39) | `後続: O-11` の行と備考 | **受ける** — data-model §4 が正本。完了の PR で書き換える (FR-012) |
| 5 | `docs/roadmap.md:380`, `:384`, `:386`, `:392`, `:433` | 5 | O-11 の行 (範囲と義務)・M3 の完了の並び・順の振り直しの記録・OPT-panel の着手の目安 | **受ける / 送る** — 義務の扱いは spec の「義務の扱い」の表が正本。完了の PR で O-11 の行を本 feature の範囲と結論に直し、O-12 の行 (順 21) を足し、M4 / M5 の順を振り直す (FR-014)。`:386` / `:392` は記録のまま、O-12 の追加の記録を足す |
| 6 | `docs/glossary.md:99`, `:442`, `:472`, `:669` (main 6fa08c2 の行) | 4 | task の一覧の要否・一般の Hook の表示・O-11 の項 | **受ける** — 完了の PR で結論 (実装済み・O-12) に直す (FR-016) |
| 7 | `docs/prompts.md:228`, `:308`, `:310`, `:314` | 4 | Checkpoints の割当・O-11 の起動文 | **受ける / 送る** — `:228` の Checkpoints を O-12 に。O-12 の起動文を足す (FR-016)。`:308-314` は O-11 の起動の記録のまま |
| 8 | `docs/domains/_overview.md:66`, `:70`, `:100`, `:102`, `:116`, `:118`, `:137` (main 6fa08c2 の行) | 7 | feature の一覧・task の一覧の要否と持ち主・O-11 は `ui`・ADR の記録先・M3 の範囲 | **受ける** — `:70` を本 feature の範囲に直し O-12 の行を足す。`:100` に結論 (一覧を作る・持ち主は `ui`。U-3 は 2026-10-17 に承認)。`:137` の M3 を O-1〜O-12 に (O-12 は M3 の完了の条件に数えない旨) (FR-016) |
| 9 | `docs/domains/ui/charter.md:259`, `:265`, `:276` (main 6fa08c2 の行) | 3 | 残りの feature・Open Questions の task の一覧 | **受ける** — `:265` に O-12 を足し、`:276` を結論に (FR-015 / FR-016) |
| 10 | `docs/domains/session/charter.md:243`, `:310`, `:313` (main 6fa08c2 の行) | 3 | AD-049 の記録・O-11 の項 (「O-11 の ADR は本 charter にも記録する。未着手」) | **受ける** — `:310-313` に AD-054 / AD-055 / AD-056 と、本 domain の契約を広げた点 (U-6) を記録する (FR-015。承認済み) |
| 11 | `docs/decisions/0049-…md` | 7 | O-11 への分割 | **受ける** — 本文は変えない。O-12 への分割は AD-056 Decision 1 が「読み替える箇所」で名指す |
| 12 | `docs/decisions/0054-…md` / `0055-…md` / `0056-…md` | 12 | 本 feature の ADR | **受ける** — 2026-10-17 の承認で accepted にした (FR-015) |

### 3) 実名リスト方式のルール

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 13 | `scripts/constitution/allowlists.mjs:365-379` (`AGENT_SDK_ALLOWED_CALLS`) | 3 つ。注記に「`getSessionMessages` を呼ぶのは `read-transcript.ts`」 | **受ける** — 5 つにし、`AGENT_SDK_CALL_FILES` を足し、注記に 2 つの API と AD-055 を書く (FR-013) |
| 14 | `scripts/constitution/check.mjs:702-716` (項目 14) | binding の名前だけを見る | **受ける** — 呼び出しごとのファイルの制限 (research R-12) |
| 15 | `tests/rule-fixtures/expected.mjs:239-240` / `:695-703` | `sdk-forbidden-call` と `UNDETECTED_NOTES['sdk-forbidden-call-alias']` の「3 件」 | **受ける** — fixture 2 本と期待表の行を足し、注記の数を 5 件に直す |
| 16 | `tests/rule-fixtures/expected.mjs:377-378` | O-6 の `sdk-query-background-tasks` | **当たらない** — `Query.backgroundTasks` の禁止のまま。本 feature は stream のメッセージを読むだけ |
| 17 | `src/agents/session-core.ts:63-74` と `session-core.test.ts:208-226` | `QUERY_OPTION_KEYS` の 9 キー (AD-053 の `onElicitation` を含む) と pin | **受ける** — 11 キー (O-10 と和集合。AD-054 Decision 4) |
| 18 | `src/domain/session/meter.ts:75-85` と `meter.test.ts:163` | `METER_UPDATE_TYPES` の 9 と長さの固定 | **受ける** — 10 |
| 19 | `src/domain/session/transcript-dto.ts:68-82` と `system-event.test.ts` の集合の固定 | category 12 (O-10 の `elicitation` の後) | **受ける** — 13 |
| 20 | `src/agents/sdk-agent-session.test.ts:518` / `live-signals.test.ts:87` | 「`background_tasks_changed` は送らない」 | **受ける** — `background-tasks` の `meter` を送るに直す |
| 21 | `src/renderer/src/components/assistant-ui/elements/agent-plan.aui.test.tsx:134` | `TextMessagePartProvider` の import は `agent-plan.aui.tsx` だけ | **受ける** — `markdown-body.tsx` だけに移す (data-model §5) |
| 22 | `eslint.config.mjs:590-608`・`.specify/spec-gate/reviewers.yml:54-76` / `:119-140` | 手書きの element の一覧 (`subagent.aui.tsx` は載っている) | **受ける** — `markdown-body.tsx` を足す。タブの中身は `features/shell/**/*.tsx` に置けば既存の glob に入る (置かないなら足す) |
| 23 | `.specify/spec-gate/reviewers.yml:222`, `:228` | ui-coverage-reviewer の `panel-tabs.ts` と `session-view.ts` の注記 | **当たらない** — 既に対象 (`panel-tabs.ts`)・対象外の理由 (`session-view.ts`) のまま。`src/domain/session/command-name.ts` は ui-coverage-reviewer の glob の外で、規則の移動だけなので足さない |
| 24 | `.dependency-cruiser.js` (`:77-81` の `no-circular`。AD-023 §7) | 新設のモジュール名で 0 件。新設のファイルは既存のレイヤ規則 (domain / agents / renderer) に入る。ただし入れ子の描画で `subagent.aui.tsx` が registry の振り分けや `thread.aui.tsx` の表を import すると、`tool-registry.aui.tsx:12` (registry → subagent) と `thread.aui.tsx:20` (thread → registry) との間に循環ができる (design-gate H-06) | **当たる** — 振り分けは context で注入し、`subagent.aui.tsx` は registry と thread を import しない (「実装方針」の描画・data-model §3.3)。FE-031 で依存グラフの検証を通す |

### 4) 参考: `src` の `O-11` の注記 (棚卸しの範囲の外)

| # | 出所 | 処理 |
|---|---|---|
| 25 | `src/agents/live-signals.ts:836` (subagent の中の tool の入れ子は O-11) | **受ける** — 入れ子は実装済み、経過時間は主ループだけの旨に直す |
| 26 | `src/domain/session/live-message.ts:77` (`server_tool_use` は O-11) | **送る** — O-12 に直す |
| 27 | `src/renderer/src/stores/ui.ts:29`・`features/shell/panel-tabs.ts:16` (タブを O-11 が足す) | **受ける** — 背景の task のタブを (O-9 の会話の地図の後に) 足した旨に、TodoList は作らない (AD-056 Decision 3) 旨に直す |

### 5) main との突き合わせ (2026-10-18。main 6fa08c2 = O-9 #20・O-10 #23 のマージの後)

| 差分 | 019 の設計への反映 |
|---|---|
| O-10 が `QUERY_OPTION_KEYS` に `onElicitation` を足した (AD-053。9 キー) | pin は和集合の 11 キー (AD-054 Decision 4 を accepted の前に直した)。`onUserDialog` / `supportedDialogKinds` の既存の検査は残す (research R-13) |
| O-10 が category `elicitation`・status `no-fallback-retry`・`SESSION_EVENT_KINDS` の `elicitation-request`・`SessionControl` の `respond-elicitation` を足した | category は 12 → 13、status は 22 のまま、`SESSION_EVENT_KINDS` (9) と `SessionControl` は「変えないもの」(data-model 冒頭)。O-10 の `elicitation_complete` の過去ログの変換は O-12 に送る (AD-056 Decision 1・spec の「義務の扱い」・対応表 `:79`) |
| O-9 が `PANEL_TABS` に `conversation-map` を足した (4 つ) | 背景の task のタブは 5 つ目 (末尾)。`PanelTabId` は `ui.ts:31` (data-model §2.5) |
| O-9 がメッセージの時刻 `createdAt` を足した (AD-051)。`toSystemEventMessage(raw, createdAt)`・`toTranscriptMessages(records, options)` | task の行の包みは `build(raw, createdAt, argsText)`。過去ログの subagent は `options.subagents` で渡す。入れ子の子の時刻は AD-051 の規則で埋めて表示しない。会話の地図の活動の帯は主ループの tool だけを数える (data-model §3.3) |
| 行番号の移動 | 上の表・「レイヤごとの変更」・data-model §4 / §5・research を main 6fa08c2 の行に直した |

新しい ADR は要らない (AD-058 は使わない)。

## 実装方針

規則の正本は data-model。ここには 2026-10-17 のソースと突き合わせて決めた置き場所と順序だけを書く。**U-1〜U-11 と 3 つの ADR は 2026-10-17 に承認済み (RK-01 は解消)。** 行番号は main 6fa08c2 のもの。

### 一般の Hook (US-1)

- `buildQueryOptions` (`session-core.ts`) の戻りのオブジェクトリテラルに 2 キーを足す。`BuiltQueryOptions` の型を `true` に閉じる
- 伏せた Hook の番号は renderer の純関数 (`features/chat/masked-hook-ordinals.ts` など。名前は tasks で決める) にし、thread の context で `SystemEventRow` に渡す。`toolResultState` の `ctx` を作っている箇所で一緒に作る (メッセージ列の 1 回の走査)
- `SystemEventRow` の `attention` の tone の条件に「category `hook` で status が `failed` / `cancelled`」を足す
- `rowAnnouncement` (`transcript-announcements.ts`) の hook の分岐に `hook_event` (`detail`) の判定を足す

### 背景の task (US-2)

- 前景の task の記憶は domain の小さな LRU。`toSystemEventMessage` の引数に記憶を足すと O-2 / O-4 / O-6 の呼び出し元が全部変わるので、**記憶を持つ薄い包み** (`createTaskRowBuilder(memory)` の `build(raw, createdAt, argsText)` が、`task_started` / `task_updated` / `task_notification` のときだけ記憶を見て、他は `toSystemEventMessage(raw, createdAt)` に任せる。`createdAt` は AD-051 の規則で呼び出し元が渡す) にし、`sdk-agent-session.ts` の `case 'system'` と `transcript.ts:197-224` の両方がこれを呼ぶ
- シェルの task の名前の引き当ては包みの外 (呼び出し元) で `tool_use_id` → `argsText` を渡す形にし、domain の包みは `argsText` を受けて `bashCommandName` を当てる。実行中は `live-tool-results.ts` に `toolCallArgs(toolUseId)` を足す
- `background_tasks_changed` は `case 'system'` の今の「送らない」(`sdk-agent-session.test.ts:518`) を、`live-signals` の新しい関数 (`onBackgroundTasks`。`send` で即時) に替える
- タブの中身は `features/shell/` に置く (`PANEL_TABS` の他のタブの中身と同じ置き場所。申し送り #22)。transcript の行の名前は稼働中のストアの `messages` から `task:<id>` を引く selector で取る

### subagent の入れ子 (US-3)

- `sdk-agent-session.ts` の `case 'assistant'` は、O-6 の取り消しの後に `parent_tool_use_id` を見て、null なら今どおり、文字列なら `toolResults.nest(dto, parentToolUseId)` の結果 (送り直す根、または孤児としてそのまま送るメッセージ、または送らない) を emit する。`case 'user'` の `applyUserMessage` は深い位置の結果も埋める
- `live-tool-results.ts` の根の DTO は readonly なので、深い位置の更新は根から道に沿って写し直す (道の長さは 8 まで)
- `case 'system'` の先頭 (permission_denied の後) に「`parent_tool_use_id` が文字列で subtype が `compact_boundary` なら入れ子の divider の経路へ」を足す。他の subtype は帰属があっても今どおりの経路 (主ループの行。U-9)。型の上では来ないので、`asRecord` で読む
- `case 'user'` で `parent_tool_use_id` が文字列のときは tool_result のブロックだけを読む (主ループの `applyUserMessage` と同じ。user の text は送らない。U-11)
- `read-transcript.ts` は `getSessionMessages` の後に `listSubagents` と `getSubagentMessages` を順に呼ぶ (32 件を直列。並列にすると取得プロセスの I/O が一度に増える。過去ログを開く操作 1 回に 1 回だけ)。`toTranscriptMessages` の第 2 引数 (O-9 の options) に `{ now, subagents }` で渡す
- `toTranscriptMessages` の 1 件の記録の処理 (`:187-330` のループの本体) を内部の関数に切り出し、主の記録と subagent の記録で共有する。subagent の記録は親を列の親に固定して呼ぶ
- 描画: `subagent.aui.tsx` の入れ子の tool-call の描画を、主ループと同じ振り分け (今の `ToolDisplay` の表) で描く。**依存の向きは `tool-registry.aui.tsx` → `subagent.aui.tsx` の 1 方向のまま** (今 `tool-registry.aui.tsx:12` が Subagent を import し、`thread.aui.tsx:20` が registry を import している。逆向きを足すと `.dependency-cruiser.js:77-81` の `no-circular` で落ちる)。`subagent.aui.tsx` は振り分けの関数を受ける context (`NestedToolRendererContext`。既定値 `null` = 今の簡易な描画) を定義・export し、`tool-registry.aui.tsx` が Agent / Task の表示の包みで Provider を置いて振り分けの関数を渡す。`subagent.aui.tsx` は `tool-registry.aui.tsx` と `thread.aui.tsx` を import しない (system-event の part のラベルは `features/chat/labels.ts`、divider は `transcript-boundary.tsx`、markdown は `markdown-body.tsx`)。props は `convert.ts` の tool-call の part を写す関数を export して作る (`convert.ts` は elements を import しない)。深さの context も `subagent.aui.tsx` に置く。**最初に** registry の表示と Reasoning が入れ子の中で描けることを component テストで確かめる (RK-05)

### 機械強制

- 項目 14 の import の読み方を直す (design-gate H-10): 今の `check.mjs:687-700` は 'g' フラグなしの `exec` で**1 つ目の**名前付き import しか読まず、`as` の後の**ローカルの別名**で許可リストと照合する。これを (1) `matchAll` でファイル中の**すべての**名前付き import を集め、(2) 各 specifier から (import した名前, ローカル名) の組を作り、(3) `AGENT_SDK_ALLOWED_CALLS` と `AGENT_SDK_CALL_FILES` の照合は **import した名前**で、呼び出し形の検査は**ローカル名**で行う形にする。そのうえで、`AGENT_SDK_ALLOWED_CALLS.includes(imported)` の前に `AGENT_SDK_CALL_FILES` を見る (名前が載っていて、ファイルが列に無く、ローカル名の呼び出し形が当たれば違反)。fixture の target (`src/agents/__rulecheck__/…`) は `read-transcript.ts` でないので発火する。既存の 3 ファイル (`enumerate-sessions.ts`・`read-transcript.ts`・`sdk-agent-session.ts`) の SDK の import は 1 文ずつで、別名は `sdk-agent-session.ts:6` / `:9` の型の import (`type EffortLevel as SdkEffortLevel` など。呼び出し形が無い) だけなので、今の `src` の結果は変わらない (BE-040 の確かめ)

### 実装の順

1. domain (category・記憶・コマンドの名前の移動・`background-tasks`・`QUERY_OPTION_KEYS`・`toTranscriptMessages` の subagent) と固定テスト
2. scripts (項目 14・fixture)
3. agents (2 キー・task の行の包み・`background-tasks`・入れ子・`read-transcript.ts`)
4. renderer のストアとタブ
5. Hook の見た目・番号・読み上げ、後から背景に移った task の表示
6. 入れ子の描画 (markdown の本文の部品・registry の振り分け)
7. 記録 (対応表・roadmap・glossary・charter・`_overview.md`・`prompts.md`・ADR の status・eslint / reviewers.yml の一覧・src の注記・O-8 の行の (c))

## 機械強制の変更

- **項目 14**: `AGENT_SDK_ALLOWED_CALLS` を 5 つ、`AGENT_SDK_CALL_FILES` (2 つの API → `src/agents/read-transcript.ts`)、すべての名前付き import を import した名前で照合する読み方 (H-10)。fixture 4 本 (2 つの API を外で呼ぶもの 2 本と、2 つ目の import 文で呼ぶもの・許可の名前の別名で呼ぶもの 2 本。名前は tasks) と期待表、`UNDETECTED_NOTES` の注記の数と、塞がない形 (再束縛・動的 import) に 2 つの API も入る旨
- **固定テスト**: `QUERY_OPTION_KEYS` (11)、`METER_UPDATE_TYPES` (10)、`SYSTEM_EVENT_CATEGORIES` (13)、`PANEL_TABS` の順 (5。末尾に `background-tasks`)、`background-tasks` の要素のキーの集合、`TextMessagePartProvider` の import が `markdown-body.tsx` だけ、`buildQueryOptions` の 2 キーが `true`
- **単体**: data-model §1〜§3 の各表 (伏せた Hook の番号・後から背景に移った task・コマンドの名前・`background-tasks` の写しと decoder・実行中の入れ子 (孤児・深さ・子の上限・取り消しの配下・system の帰属)・過去ログの合成 (列挙の順の入れ替えで結果が同じ・inline の子と重ねない・親の無い列を捨てる・失敗した subagent))
- **component**: タブ (vitest-axe の違反 0)・入れ子の tool が registry の表示で出る・Hook の行の tone と読み上げ
- **lint**: `markdown-body.tsx` を `eslint.config.mjs` の手書きの一覧に (申し送り #22)

## ADR

- **AD-054 / AD-055 / AD-056 は 2026-10-17 の承認で accepted にした。** session charter と ui charter への記録は完了の PR で行う (FR-015)
- **accepted の前に main との突き合わせで直した** (2026-10-18): AD-054 はキーの数を AD-053 の `onElicitation` との和集合 (11) に、AD-056 は Decision 1 に O-10 の `elicitation_complete` の過去ログの変換 (O-12 へ) を、Consequences にタブの数 (4 → 5) を足した。決定の中身は承認されたものと同じ
- **AD-055 は design で書き直した** (U-8): Decision 1 に `listSubagents` を足し、Decision 2 を「`listSubagents` で列挙し `getSubagentMessages` の `parent_tool_use_id` で結ぶ」に替えた。Alternatives に最初の版の Decision 2 (構造の agentId だけ) を退けた理由を足し、「列挙の順番で結ぶ」を退けた理由は残した (proposed の間に直した)
- **AD-056 は design-gate (round 1) で直した** (proposed の間に直した): Decision 2 の括弧書きを「`local_bash` は説明を出さず、起動した `Bash` の呼び出しのコマンドの名前だけを出す」に (H-01。FR-005 と揃える)、Decision 2 の見出しと Alternatives を「表示と feature の持ち主は `ui`、保持は session の契約」に (H-07)、「読み替える箇所」に AD-044 Decision 6 の 2 行 (「session の責務に含めない」側と、agents の前景の task の記憶) を足した (H-07 / H-08)
- 新しい ADR は起こさない (main との突き合わせでも要らない。AD-058 は使わない)。項目 14 の呼び出しごとのファイルの制限は AD-055 Decision 1 の機械強制で、別の ADR は要らない

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | **判断 (U-1〜U-11)・ADR が承認で覆る** | **解消 — 2026-10-17 に全部が承認された。** 以下は承認の前に書いた、覆ったときの影響の範囲の記録 (Q2 の回答 A)。覆ったときの影響の範囲: U-1 (分けない) → spec に Tier B の FR を足して /cl-plan からやり直す / U-2・U-5 (option を渡さない) → FR-001 / FR-007 と §1.1 を外し、該当の US を「今どおり」に縮める / **U-3 (持ち主を `session` にする・一覧を作らない)** → §2.4〜§2.5 と FR-006 を外すか session の feature に送る。§2.1〜§2.3 (行) は残る / U-4 (TodoList のタブを作る) → 新しい FR とタブを足す / U-6 (session の feature に切り出す) → agents と scripts の変更を別の spec に分け、本 feature は表示だけにする / **U-7 (Agent handoff を使う)** → §3.3 の見出しの element を差し替える (入れ子の規則は変わらない) / U-8 (B または C) → §3.2 と項目 14 の変更を外す (B) か、呼ばれない経路だけを残す (C) / U-9 (入れ子に system の行を描く) → §3.1 の system の行と BE-031 に入れ子の中の合成を足す / U-10 (最新の子を残す) → §3.1 の上限の行と BE-030 を直す / U-11 (user の text を出す) → §3.1 / §3.2 の user の行に `isSynthetic` の判定と無害化を足す。どの場合も design-gate の結果を捨てて /cl-design --from plan から回し直す |
| RK-02 | `hook_name` がコマンドの文字列で、`HOOK_NAME_SHAPE` に合ってしまう (例: `npm`) | 合う名前は単語の形で、秘密の形は `mayCarrySecret` が弾く (O-2 の判断)。V-1 で実際の値を記録し、コマンドが入るなら全部を伏せる規則に替える (data-model §1.2 を直す) |
| RK-03 | 一般の Hook で行が多すぎ、transcript が読みにくい | 成功は控えめの見た目・読み上げない (§1.4)。O-2 の Tool group の密度の切り替えに入るかは V-1 で確かめる。まとめる規則は Edge Cases で退けたので、要るなら利用者に返す |
| RK-04 | 根の送り直しで IPC の量が増える (子が増えるたびに根全体を送る) | 子の数 500・送り直しの大きさ 1 MB・根 256 件の上限 (§3.1)。上限に当たったときの見え方は spec US-3 AC6 / U-10 (切り詰めの印。以後の子は足さない)。BE-030 の単体で送り直しの回数 (子 1 件につき 1 回、`truncated` の後は 0 回) と 1 回の大きさ (1 MB 以下) を固定する。V-4 で長い subagent の送り直しの回数と体感を記録し、SH-013 で判断する: 重いと記録されたら完了の PR の前に送り直しの間引き (O-4 の `meter-throttle` の形) を足すかを利用者に返す |
| RK-05 | registry の表示・Reasoning が入れ子 (message の part の context の外) で描けない | 実装の順の 6 の最初に確かめる。描けない表示は今の簡易な描画に倒す (§3.3)。全部が描けなければ AC1 の「主ループと同じ表示」を text と tool 名・結果の印に縮め、利用者に返す |
| RK-06 | `task_updated` の `patch.is_backgrounded` が実データで届かない | V-3 で記録する。**V-3 の記録が「届いた」であることを late-backgrounded-task を `実装済み` にする条件にする** (spec FR-012 / SC-005。V-1 と general-hooks、V-4 と subagent-nesting-live も同じ)。未記録・届かなければ `実装済み` にせず (`表示不要` にもしない)、`後続: O-11` のまま完了の PR を出さずに、SDK の版の待ちとして利用者に返す (M3 の完了の条件に関わる) |
| RK-07 | `listSubagents` が入れ子の subagent のファイルを列挙しない | 多段の subagent の本文は過去ログで欠ける (今どおり Task のカードだけ)。V-6 で記録し、欠けるなら対応表の備考に書く |
| RK-08 | O-10 と `QUERY_OPTION_KEYS` の pin が衝突する | **解消 — O-10 は #23 で先にマージされた。** AD-054 Decision 4 のとおり、後にマージする本 feature が和集合の 11 キーで固定する (BE-002) |
| RK-09 | 過去ログの取得で subagent を 32 件読む時間が延びる | 取得プロセス (AD-034) で走り main を塞がない。V-6 で 10 件以上の subagent のセッションの開く時間を記録する |
| RK-10 | category の追加 (`backgrounded-task`) で renderer の網羅の表が型で落ちる | 意図した失敗。`SYSTEM_EVENT_ICONS`・`systemEventDetailText`・ラベル・読み上げに足す。task の行を category で判定している箇所 (`category === 'task'`) を grep で洗い、両方を見る形にする |
| RK-11 | subagent の system の行が帰属つきで来ず、入れ子の divider が出ない | 型の上では来ない (research R-09)。規則は来たときのためで、来なければ AC3 は実行中も成り立たない。V-5 で記録し、spec の AC3 を直すかを利用者に返す。V-5 は subagent-nesting-live を `実装済み` にする条件にしない (条件は V-4。AC3 は届いたときの規則で、届かなくても入れ子は成り立つ。FR-012)。帰属つきの system のうち `compact_boundary` 以外は主ループの行のまま (U-9) |

## Project Structure

### Documentation (this feature)

```text
specs/019-ui-hooks-tasks-subagents-and-notices/
├── spec.md              # U-8 を足した (Q1)
├── plan.md              # 本ファイル
├── research.md          # Phase 0 (R-01〜R-15)
├── data-model.md        # Phase 1 (§1〜§5。規則の正本)
├── quickstart.md        # Phase 1 (V-0〜V-7)
└── tasks.md             # Phase 2 (/cl-tasks)
```

contracts/ は作らない: IPC・preload・port の契約を変えない (`SessionEvent` の種類は不変。`meter` の値の契約は data-model §2.4 と 014 data-model §2 に足す。過去ログの frame の形は変えない)。

### Source Code (repository root)

```text
src/domain/session/
├── transcript-dto.ts        # category
├── system-event.ts          # mergedDetail
├── foreground-tasks.ts      # 新設 (前景の task の記憶と task の行の包み)
├── command-name.ts          # 新設 (bashCommandName)
├── path-tail.ts             # 新設 (renderer から移す)
├── meter.ts                 # background-tasks
└── transcript.ts            # subagent の合成・task の行
src/agents/
├── session-core.ts          # QUERY_OPTION_KEYS
├── sdk-agent-session.ts     # 入れ子の振り分け・task の行の包み・background_tasks_changed
├── live-tool-results.ts     # 根と位置の表・toolCallArgs
├── live-signals.ts          # onBackgroundTasks
└── read-transcript.ts       # listSubagents / getSubagentMessages
src/renderer/src/features/
├── session/{running-session-types.ts, running-session-store.ts, session-view.ts}
├── shell/{panel-tabs.ts, (背景の task のタブの中身。新設)}
└── chat/{labels.ts, transcript-announcements.ts, convert.ts, path-tail.ts, (伏せた Hook の番号。新設)}
src/renderer/src/components/assistant-ui/elements/
├── markdown-body.tsx        # 新設
└── subagent.aui.tsx / agent-plan.aui.tsx / tool-registry.aui.tsx / thread.aui.tsx
scripts/constitution/{allowlists.mjs, check.mjs}
tests/rule-fixtures/a-direct/ (fixture 2 本。新設) と expected.mjs
eslint.config.mjs / .specify/spec-gate/reviewers.yml
docs/ui-coverage.md / docs/roadmap.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/prompts.md
docs/decisions/0054〜0056 (status) / specs/014-ui-metering-and-limits/data-model.md (§2 の検証の表に background-tasks)
```

**Structure Decision**: 既存のレイヤ (domain / agents / renderer) に置く。新しいディレクトリは作らない。

## 設計後の見直し (Constitution Check の再確認)

- Phase 1 の成果物 (research / data-model / quickstart) をソースと突き合わせて、spec との食い違いが 3 つ見つかった: (1) 過去ログの経路に agentId の構造が無い (Q1 → U-8。spec と AD-055 を直した)、(2) subagent の system のメッセージは SDK 0.3.270 で帰属を持たない (US-3 AC3 を「実行中に届いたら」に直し、過去ログでは出ない旨を足した。RK-11)、(3) spec の「シェル」は既存の種類のラベル「シェルのコマンド」を指す (data-model §2.3 に書いた)。どれも Constitution の判定を変えない
- Principle I (`pathTail` の domain への移動) と XIII (Agent handoff・Background runs を使わない) の判断を上の Check に書いた。XIII の Agent handoff は U-7 で 2026-10-17 に承認
- 違反は 0 件。Complexity Tracking は空

## Complexity Tracking

なし
