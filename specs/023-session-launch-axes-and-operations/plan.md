# Implementation Plan: 実行中のセッションの操作 (X-6 の最初の分割)

**Branch**: `023-session-launch-axes-and-operations` (main 1a7d8b4 の上) | **Date**: 2026-10-27 (`/cl-plan`) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) (U-1〜U-10 は採用 (2026-10-27 夜間の規則で推奨案を採用。U-9 / U-10 は design-gate round 1 の H-005 / H-002 の修正で足した))

本 plan は spec / [research.md](./research.md) / [data-model.md](./data-model.md) / [contracts/ipc-live-session-settings.md](./contracts/ipc-live-session-settings.md) / [quickstart.md](./quickstart.md) を正本として参照し、規則を書き写さない。本 plan が足すのは、2026-10-27 の作業ツリー (main 1a7d8b4) と突き合わせて決めた**置き場所と手順** (下の「実装方針」) と、上流からの申し送りの棚卸しである。

## 判断の承認

- **U-1〜U-10 は 2026-10-27 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で採用した** (spec の「判断の一覧」)。plan の段の実装の選択 P-1〜P-13 (research の各節) も採用 (2026-10-27 夜間の規則で推奨案を採用)。新しい利用者の判断として止める点は無い (`.needs-input.md` は作っていない)
- AGENTS.md の gated 確定事項 (domain の分解・Constitution Principle の採否) に当たるものは無い。domain は spec の `domain_selected_by: auto` (session)。Constitution は改めない (Principle IV が `renameSession()` を既に挙げている)
- **AD-062 を起こし、accepted にした** ([docs/decisions/0062-…](../../docs/decisions/0062-live-session-permission-mode-model-and-rename.md))。2026-10-27 に夜間の規則で推奨案を採用した (覆ったときの範囲は RK-01)

## Summary

- **権限モード (US-1)**: `SessionControl` に `set-permission-mode` を足し、main の `isSafePermissionMode`・セッションスレッドの decoder・呼び出しの直前の `assertSafePermissionMode(...)` の 3 段で安全 3 値に閉じて `Query.setPermissionMode` を呼ぶ (data-model §1 / §3)。成功は live-signals の権限モードの基準を更新して `meter` に流し、ヘッダは `meters.permissionMode` を見る (§3.3)
- **モデル (US-2)**: `set-model` を足す。main がそのセッションの Provider のカタログと起動の effort で照合し (domain の `switchableModels`。§2)、SDK の値 (`inferenceProfileId ?? id`) で `Query.setModel` を呼ぶ。effort は変えない。対象はカタログを持つ Provider のセッションだけで、Provider が既定 (null)・消えた・起動の effort を満たすモデルが 0 のセッションでは選択を理由つきで押せない (spec U-10 / US-2 AC6。既定の Provider の切り替えは X-6 の後続)
- **結果の経路**: セッションスレッド → 調停役スレッド → main に `control-result` (要求の id と成否だけ) を足し、main の起動の service が要求ごとに待つ (§4。contracts C-4)。同じセッションの変更は 1 つずつ
- **名前 (US-3)**: main が registry と退避の表から会話の id と列挙対象を決め、env (`CLAUDE_CONFIG_DIR`) を固定した短命の `utilityProcess` (`src/agents/rename-session.ts`) で `renameSession(id, name)` を `dir` なしで呼ぶ (§6。research R-06)。名前は main の registry に持ち、IPC の戻り値で renderer に返す。改名の結果までの間のプロンプトは main が保留する (§4.3。spec U-9)。改名の子は `rename-spawner.ts` が追跡し、上限と `dispose` を持つ (§6.3)
- **中央のヘッダ (U-7)**: 権限モードとモデルの選択・見出しの「名前を変更」を足す。押せる条件は domain の `liveSettingBlocker` を main と renderer で共有する (§5.1 / §8)
- **Constitution 検証**: `QUERY_MUTATION_METHODS` 22 → 20・`.setPermissionMode(` の引数の包みの検査・`AGENT_SDK_ALLOWED_CALLS` 5 → 6 (`renameSession` は 1 ファイル)・SDK の値の import と動的 import の検査・`agents-not-to-core` (§7)。対応表の E 節の 4 行と F 節の 3 行の備考 (research R-10)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (`Query.setPermissionMode` / `Query.setModel` / `renameSession`。research R-01)。assistant-ui は変えない。新しい依存は足さない

**Storage**: なし (Principle X。名前の正本は transcript の custom-title。main のメモリだけに持つ。FR-014)

**Testing**: Vitest 5 (node / renderer の 2 project)、vitest-axe、Playwright の E2E (偽の capability)、Constitution 検証 (`node scripts/constitution/check.mjs`)、rule fixtures。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)。セッションは WSL と Win32 の両方

**Project Type**: desktop-app (main / preload / renderer / agents (supervisor の Worker と短命の取得プロセス) / domain)

**Performance Goals**: 権限モード・モデルの変更は制御の 1 往復 (状態通知の窓に入れない)。改名は 1 回につき短命のプロセス 1 つ (列挙・`wsl.exe` を起こさない。本機ではプロセスの生成に 0.4〜2.4 秒かかるので、ヘッダは結果まで「変更中」を出す)

**Constraints**: data-model §0 の「変えないもの」。`IPC_CHANNELS` は 3 つ増える。`SessionControl` 8 種類・`QUERY_MUTATION_METHODS` 20・`AGENT_SDK_ALLOWED_CALLS` 6。`QUERY_OPTION_KEYS` 12・`SessionEvent` の種類・`SessionLaunchConfig` は変えない

**Scale/Scope**: FR 18 / SC 9。新しい IPC 3 つ・新設のモジュール 6 つ (domain 1・agents 1・main の app 3・rule fixture は別)

### レイヤごとの変更 (2026-10-27 の作業ツリー = main 1a7d8b4 で確かめた)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/session/agent-session.ts` | `SessionControl` の 2 種類・`AgentSession` の 2 つの操作 (data-model §1) | `SessionControl` の union |
| domain | `src/domain/session/live-settings.ts` (新設) | `LiveSettingKind`・`liveSettingBlocker`・`normalizeSessionName`・`LIVE_SETTING_FAILURES` (§5.1 / §5.3・contracts の共通の戻り値) | `run-state.ts` の `canEnd` |
| domain | `src/domain/provider/model-catalog.ts` | `switchableModels` (§2) | `launch-resolution.ts:141-149` |
| domain / preload | `src/domain/capability.ts` / `capability.test.ts` / `src/preload/*` / `src/main/app/e2e-capability.ts` / `src/renderer/src/test-support/capability.ts` | 3 つの channel と戻り値 (contracts C-1〜C-3 / C-6)。`listSessions` の注記 | `IPC_CHANNELS` の `killSession` の後 |
| agents | `src/agents/session-core.ts` | `decodeSessionControl` の 2 種類 (§1) | `:462-485` |
| agents | `src/agents/sdk-agent-session.ts` | `Query` の分類と `queryHandle` の型 (§3.1)・制御シンクの 2 種類と終了処理の中の失敗 (§3.2)・`control-result` の送出 | 分類 `:154-188`、`queryHandle` `:456`、`controlSink` `:745-805`、`post` の `conversation` `:912` |
| agents | `src/agents/live-signals.ts` | `onPermissionModeApplied` (§3.3) | `observePermissionMode` `:414` |
| agents | `src/agents/supervisor-protocol.ts` / `supervisor-core.ts` | `control-result` の 2 つの decoder と即時の中継 (contracts C-4) | `conversation` の分岐 |
| agents | `src/agents/rename-session.ts` (新設) | 改名の短命の子 (§6.2 / C-5) | `read-transcript.ts` |
| main (app) | `src/main/app/session-spawner.ts` | `SupervisorConnection.onControlResult` | `onConversation` |
| main (app) | `src/main/app/session-launch-service.ts` | `Entry` の `effort` / `name` / `changing`・`commit` の引き継ぎ・待ちの表・`setPermissionMode` / `setModel` / `setName` / `beginChange` (§4) | `Entry` `:167`、`commit` `:195`、`onThreadEnded` `:233`、`onExit` `:263`、`killAll` `:282`、登録 `:328`、`control` `:369` |
| main (app) | `src/main/app/live-transcript-target.ts` (新設) | `resume-service.ts:136-170` の `liveTranscriptTargetKey` を切り出す (振る舞いは変えない。research R-06) | `resume-service.ts:136` |
| main (app) | `src/main/app/session-rename-service.ts` (新設) | 改名の流れ (§6.1 の 2〜7)。状態を持たず I/O は注入で受ける | `resume-service.ts` |
| main (app) | `src/main/app/rename-spawner.ts` (新設) | 短命の子の起動 (C-5)。`electron` を持つ唯一の改名のモジュール | `transcript-spawner.ts` |
| main (app) | `src/main/app/validate.ts` / `session-ipc.ts` / `composition-root.ts` | 3 つの handler (述語 → service)・結線・`dispose` に改名の子の後始末を足す (data-model §6.3) | `handleInterruptSession` `session-ipc.ts:386`、`buildTranscriptEnv` の結線 `composition-root.ts:247-249`、`dispose` `composition-root.ts:507-509` |
| main (app) | `src/main/app/ipc.ts` | 3 つの channel を `handle()` wrapper で登録する (送り元の検査は wrapper。外れたら既存どおり `rejected` で throw。contracts の共通の節) | `handle()` `ipc.ts:197-205`、`handle(IPC_CHANNELS.interruptSession, …)` `ipc.ts:384` |
| renderer | `src/renderer/src/features/session/running-session-types.ts` / `running-session-store.ts` | `currentModelId` / `name` / `changing` / `settingError` (§8.1) | `LiveSessionState` |
| renderer | `src/renderer/src/features/shell/CenterHeader.tsx` / `CenterPane.tsx` | 選択と名前の編集 (§8.2)・見出し (§8.3) | `CenterHeaderLive`・`RunningCenter` |
| renderer | `src/renderer/src/features/shell/OverviewTab.tsx` / `ContextCostMeter` の呼び出し | 「現在のモデル」の行・今のモデルの id (§8.3) | `OverviewTab.tsx:109` |
| renderer | `src/renderer/src/features/session/RunningSessionRow.tsx` / `labels.ts` | 行の題 (§8.3)・文言 (§8.4) | `PERMISSION_MODE_LABELS` `labels.ts:426` |
| scripts / 設定 | `scripts/constitution/allowlists.mjs` / `check.mjs` / `.dependency-cruiser.js` / `tests/docs/query-mutation-methods.test.ts` / `tests/rule-fixtures/` | data-model §7 | `allowlists.mjs:208-253`, `:383-403`, `:461-484`, `:537-563`、`check.mjs:707-723` (項目 14)、`:945-955` (項目 16 の P3)、`.dependency-cruiser.js:254`, `:292-300` |

**未確定の技術事項**: なし。実機で確かめる事項 (ターンの実行中の `setPermissionMode` で中断しないか・Claude Code が新しいモードを報告するか・UNC 越しの custom-title の追記) は、どの結果でも契約を変えない形にしてあり、quickstart V-1〜V-5 で記録する

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — 新しいパスの組み立ては無い。改名の config ディレクトリは既存の `transcriptTarget` / `buildTranscriptEnv` の結果を env に渡すだけ。`renameSession` に `dir` を渡さない (research R-06)
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — WSL / Win32 の違いは列挙対象 (config ディレクトリの値) にだけ現れ、改名の service・子に `process.platform` の分岐を足さない
- [x] **III. 権限モードは capability に従う** — 実行中の選択肢は安全 3 値だけで、昇格の値は型・main の述語・agents の decoder と assert・項目 16 の backstop で届かない (AD-062 Decision 1)。`isAutoModeAllowed` の判定と I-3 の昇格モードには触れない。Claude Code 自身が安全 3 値の外へ移ったときは O-4 の `UnsafeModeBanner` のまま
- [x] **IV. 通信は Agent SDK 経由** — `Query` の 2 つのメソッドと `renameSession()` (Principle IV が挙げる API) だけを使う。JSONL を自前で書かない・読まない
- [x] **V. 長期資格情報を永続化しない** — 永続化するものが無い。改名の子の env は transcript の取得と同じ最小の許可リスト (`buildTranscriptEnv`)
- [x] **VI. 永続環境を構築・変更しない** — 利用者の環境を変えない。書くのは Claude Code の transcript の custom-title の 1 行だけ (AD-062 Decision 4)。`PROCESS_SPAWN_MODULES` への追加は AD-062 で行う
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — `rename-session.ts` は `process.parentPort` と SDK だけを使う (`read-transcript.ts` と同じ)。`agents-not-to-core` で標準モジュールの取得も塞ぐ (research R-11)
- [x] **VIII. 日本語環境で破綻しない** — 名前の入力は IME の変換中の Enter で確定しない (data-model §8.2)。名前の長さは `Array.from` の数で数える (§5.3)

**Standard**

- [x] **IX. main process をブロックしない** — 制御の結果は真偽 1 つ、改名の結果は `{ ok }` 1 つで、本文を main に通さない。改名の SDK の呼び出し (ファイルの走査と追記) は子のプロセスで行う
- [x] **X. セッションの正本はアプリ外** — 名前の正本は transcript。main の名前は稼働中の行の表示のためのキャッシュで、過去の一覧は列挙の再取得の値を出す (research R-13)
- [x] **XI. 垂直スライス** — US-1〜US-3 はどれもヘッダから観測できる。実機は quickstart V-1〜V-6
- [x] **XII. 未表示情報を残さない** — E 節の `後続: X-6` の 4 行を書き換え、F 節の 3 行に照合の結果を書く (FR-015 / FR-016・research R-10)
- [x] **XIII. assistant-ui の element と design system を優先** — registry の Model selector / Composer model picker / Settings は照合した上で取り込まない (起動の設定の部品と揃える。spec U-7)。照合の結果を対応表の F 節に書く
- [x] **XIV. Ubiquitous Language** — 「Live session setting (実行中の設定の変更)」「Session name (セッションの名前)」を足し、SessionControl / SafePermissionMode を直す (data-model §9)
- [x] **XV. 多言語規約** — 文言は `features/session/labels.ts` (data-model §8.4)

**Domain charter の整合**

- [x] 本 feature の domain (`session`) の In scope の「セッションの起動、応答のストリーミング、中断、再開、分岐」(`charter.md:64`)・「`SessionLaunchConfig` の解決と、軸どうしの依存関係の解決」(`:65`)・「`canUseTool` の permission 往復の配管」(`:68`) の延長に収まる。実行中のモデルの選択肢は起動の依存解決と同じ規則 (§2)
- [x] Out of scope に踏み込まない。ヘッダの部品は ui のシェルの中に置くが、操作 (選択肢・押せる条件・文言) は session が持つ (稼働中の一覧の行と同じ「session の操作 UI」。`charter.md:76-78`)

## Domain Context

### Charter reference

- Domain: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- Mission: 複数フォルダ・複数ランタイムにまたがって存在する Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする
- Scope (本 feature が触れる部分): セッションの起動とストリーミングの制御 (`:64`)・軸の依存解決 (`:65`。実行中のモデルの選択肢)・permission 往復の配管 (`:68`。実行中の権限モード)・セッション supervisor とセッションスレッド (`:69`。`control-result`)・Journey 2 の手順 3 (`:107`。モデル・権限モードの選択を実行中にも広げる)・Journey 4 の手順 2 (`:130-131`。「モデル / 権限モードは選び直せる」を止めずに行う)
- 触れる他の domain: `ui` — 中央のヘッダ (`CenterHeader.tsx`) と概要のタブに部品を足す (シェルの面の状態は変えない)。`provider` — モデルのカタログを読むだけ (`switchableModels` は provider の domain の純関数)
- session charter の Related ADRs に AD-062、Related Specs に 023、「X-6 は未着手」(`:347`)、frontmatter の `related_adrs` / `related_specs` を完了の PR で直す (FR-018・data-model §9)

### Related ADRs

- [AD-062](../../docs/decisions/0062-live-session-permission-mode-model-and-rename.md) — 実行中の権限モード・モデルの切り替えと改名 (`Query` の 2 つのメソッドと `renameSession`): **accepted** (本 feature で起こした。2026-10-27 夜間の規則で推奨案を採用)
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — §4 P3 (`Query` は `interrupt()` だけ)・§5 (実行時に権限モードを変えない): accepted。AD-062 が読み替える。P1 / P2 は変えない
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — (a) 安全 3 値と `assertSafePermissionMode`・(g) model / effort・(h) rename を X-6 に指名: accepted
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 決定 2 (env 固定の短命のプロセス)・決定 3 (書き込み系 API を許可しない): accepted。AD-062 が決定 3 を `renameSession` の分だけ読み替え、決定 2 の形を改名に使う
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) — 単一 supervisor・セッションスレッド・message の種類: accepted。AD-062 が `control-result` を足す
- [AD-059](../../docs/decisions/0059-session-resume-query-option-and-conversation-id.md) — 会話の id と退避の表: accepted。改名の対象の会話の id と列挙対象に使う
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) / [AD-048](../../docs/decisions/0048-session-config-display-and-answer-ui-split.md) / [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) — `meter` の `permission-mode`・`QUERY_MUTATION_METHODS` の追加の根拠: accepted (変えない)
- [AD-055](../../docs/decisions/0055-subagent-messages-for-past-transcripts.md) — `AGENT_SDK_CALL_FILES` (呼べるファイルの表): accepted。`renameSession` を同じ表で縛る
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — ui-coverage の割当: accepted (FR-015 / FR-016)
- [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — e2e の capability の写し: accepted (C-6)
- [AD-007](../../docs/decisions/0007-session-source-of-truth-is-claude-code.md) — セッションの正本は Claude Code: accepted (Principle X の根拠)

### Glossary excerpt

- **SafePermissionMode** (`glossary.md:972`): 起動で選べる権限モード。`default` / `plan` / `dontAsk` の 3 値。`assertSafePermissionMode` が実行時に閉じる。実行中の切り替えも同じ 3 値であることを足す
- **SessionControl** (`:1005`): `renderer → main` の制御要求。`set-permission-mode` / `set-model` を足す
- **Session** (`:979`) / **Conversation id** (`:242`): 改名の対象は会話の id (main のメモリだけ。renderer に渡さない)
- **SessionSummary** (`:1043`): `customTitle` は会話由来の逐語文字列として扱う。本 feature の名前はこの `customTitle` に出る
- **SessionLaunchConfig** (`:1077`): 起動の 6 軸。本 feature は形を変えない (実行中の変更は永続化しない)。「セッション名」の軸 (起動のときの名前) は X-6 の後続
- **Model catalog** (`:712`)・**Axis resolution** (`:70`): 実行中のモデルの選択肢はカタログと起動の effort から起動と同じ規則で解く
- **Meter** (`:674`)・**Unsafe permission mode banner** (`:1382`): 今の権限モードは `meter` の `permission-mode` を見る。安全 3 値の外の報告は今どおり帯を出す
- **SessionRunState** (`:1014`)・**claudeAlive** (`:1143`): 受け付ける状態 (data-model §5.1) の入力
- **Session thread** (`:1121`)・**Coordinator thread** (`:220`): `control-result` の送出と中継

## 上流からの申し送り

```text
# 2026-10-27 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
rg -n "023-session-launch-axes-and-operations" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 3 行 / 2 ファイル (plan を書く前)
# 2) feature ID (spec_id だけでは roadmap・charter・rule fixture の申し送りに当たらないため足した)
rg -n "\bX-6\b" docs .specify tests -g "*.{md,mjs,js,yaml,yml}"
#    → 62 行 / 12 ファイル (plan を書く前)
rg -n "\bX-6\b" specs -g "*.{md,mjs,js,yaml,yml}"
#    → 358 行 / 126 ファイル (research / data-model / quickstart を書いた後。023 の 44 行を含む)
# 3) 新設・変更のモジュール名を実名リスト方式のルールで
rg -n "renameSession|setPermissionMode|setModel|setMaxThinkingTokens|rename-session|rename-spawner|live-settings|transcript-spawner|session-launch-service|supervisor-protocol|sdk-agent-session" .dependency-cruiser.js eslint.config.mjs scripts/constitution/allowlists.mjs .specify/spec-gate/reviewers.yml
#    → 16 行 (dep-cruiser 3・eslint 1・allowlists 12・reviewers 0)
rg -n "renameSession|setPermissionMode|setModel|setMaxThinkingTokens" tests
#    → 20 行 (expected.mjs 9・fixture 3 ファイルで 8・query-mutation-methods.test.ts 3。下の #40〜#44)
```

### 1) spec_id の 3 行

| # | 出所 | 件数 | 処理 |
|---|---|---:|---|
| 1 | `specs/023/spec.md:2`, `:16` | 2 | **当たらない** — 本 spec の frontmatter と見出し |
| 2 | `docs/roadmap.md:355` (X-6 の行の「023 の範囲」) | 1 | **受ける** — 範囲の正本。spec の「義務の扱い」の表に全部割り当てた。完了の PR で結論を書く (FR-018) |

### 2) feature ID (`X-6`) — docs / .specify / tests の 62 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 3 | `docs/roadmap.md:355` | X-6 の行 (範囲と義務) | **受ける** — #2 と同じ |
| 4 | `docs/roadmap.md:200`, `:210` | composer の 2 項目の持ち主 (O-10 と X-6 の早いほう) | **当たらない** — O-10 で閉じた (018 FR-013 / FR-014)。本 feature は composer に触れない (U-7) |
| 5 | `docs/roadmap.md:383`, `:385`, `:386`, `:399` | O-5 の記録・X-8 / X-9 の行・順の振り直し | **当たらない** — X-8 の V-4 / X-9 の V-7 の申し送りは実機が未実施で中身が無い (spec の「義務の扱い」の最後から 2 行目)。行は変えない |
| 6 | `docs/ui-coverage.md:219-222` | E 節の `後続: X-6` の 4 行 | **受ける** — research R-10 (FR-015) |
| 7 | `docs/ui-coverage.md:359` | Settings の「X-6 で Model selector / Composer model picker と合わせて照合する」 | **受ける** — research R-10 (FR-016)。`:284` / `:338` にも書く |
| 8 | `docs/ui-coverage.md:86`, `:302`, `:333`, `:352` | `new_conversation_id`・Edit message・Message branches・Regenerate menu (fork) | **当たらない** — /clear の後の会話の id と fork は X-6 の後続 (spec の「義務の扱い」)。行は変えない |
| 9 | `docs/domains/_overview.md:58` | X-6 の feature の一覧の行 | **受ける** — 完了の PR で 023 の記録を足す (data-model §9)。`:72`, `:73` (X-8 / X-9 の行)・`:185` (項目 21 の条件の記録) は変えない |
| 10 | `docs/domains/session/charter.md:347` | 「X-6 は未着手」 | **受ける** — 完了の PR で直す (FR-018) |
| 11 | `docs/domains/session/charter.md:238` | 「X-6 は対応表の `後続: X-6` の行を完了の PR で書き換える」 | **受ける** — #6 と同じ |
| 12 | `docs/domains/session/charter.md:107`, `:127`, `:171`, `:349-356` | 上限の軸・分岐・/clear の後の id・X-8 / X-9 の項 | **当たらない** — どれも X-6 の後続か、切り出した feature の記録 |
| 13 | `docs/glossary.md:217`, `:936`, `:946`, `:1083` | 上限の軸・分岐・セッション名の軸は X-6 | **当たらない** — 起動の軸と分岐は X-6 の後続。`:1083` の「セッション名は X-6」は起動のときの名前で、本 feature の改名と別 (glossary に Session name を足すときにその区別を書く。data-model §9) |
| 14 | `.specify/memory/constitution.md:57` | 2026-10-03 の項目 21 の件数の記録 (`X-6 4`) | **当たらない** — 時点の記録。完了の PR の項目 21 の出力で 0 を確かめる (SC-007) |
| 15 | `docs/decisions/0041-…md:135`, `:180` | (h) の繰越先・probe の claudePath の判定 | **受ける** (`:135`) — rename のうち動いているセッションの分を AD-062「読み替える箇所」で 023 が持つ。accepted の本文は直さない (AD-031)。`:180` は claudePath の判定で **当たらない** (X-6 の後続) |
| 16 | `docs/decisions/0042-…md:57`, `:60`, `:66` | 退避の UI と schemaVersion の規則 | **当たらない** — 退避の UI は X-6 の後続。`:60` の規則 (store の形を変える feature は版を上げる) は、本 feature が store に触れない (FR-014) ので当たらない |
| 17 | `docs/decisions/0043-…md:76`・`0058-…md:43` | Worker の異常終了の孤児の観測 | **当たらない** — X-6 の後続 (spec の「義務の扱い」) |
| 18 | `docs/decisions/0059-…md:21`, `:31`, `:32`, `:36`, `:39`, `:47` | resume の切り出しの記録・fork / rename / tag / delete・/clear の後の id | **受ける** (`:32`) — rename (動いているセッション) を AD-062 で 023 が持つ。他は **当たらない** (記録か X-6 の後続) |
| 19 | `tests/rule-fixtures/expected.mjs:748-759` (`sdk-forbidden-call-alias`) | 書き込み系 API を使う X-6 の時点で項目 14 に別名の検出を足す | **受ける** — 本 feature が最初に書き込み系 API を使う。値の import と動的 import の検査を足し、サンプルを `constitution` で発火させ `UNDETECTED_NOTES` から外す (research R-08・AD-062 Decision 5) |
| 20 | `tests/rule-fixtures/expected.mjs:903-909` (`agents-builtin-via-get-builtin-module`) | agents にセッション操作のモジュールが増える X-6 の時点で `agents-not-to-core` を足す | **受ける** — `rename-session.ts` を足すので当たる。規則を足し、サンプルを `depcruise` で発火させる (research R-11) |
| 21 | `tests/rule-fixtures/expected.mjs:776-788` (`ui-path-concat`) | 追加ディレクトリのパス入力を足す X-6 | **当たらない** — パスの入力を足さない。`howToClose` に「023 で確かめた」の 1 文を足し、`nextFeature` は X-6 のまま (research R-12) |
| 22 | `tests/rule-fixtures/expected.mjs:841-846`, `:857-862` (項目 18 の 2 つ) | 調停役スレッドの import が増える X-6 | **当たらない** — `control-result` の decoder は `supervisor-protocol.ts`。`supervisor.ts` / `supervisor-core.ts` の import は増えない。#21 と同じく 1 文を足す |
| 23 | `tests/rule-fixtures/expected.mjs:882-887` (`worker-env-via-expression`) | Worker の起こし方が増える X-6 | **当たらない** — Worker を足さない。#21 と同じく 1 文を足す |

### 2') feature ID (`X-6`) — specs/ の 358 行

| # | 出所 | 処理 |
|---|---|---|
| 24 | `specs/023/` (spec 32・research 8・data-model 3・quickstart 1) | **当たらない** — 本 feature の成果物 |
| 25 | 過去の feature の gate の記録 (`*-reviewer.*.md`・`design-gate.md`・`code-gate.md`・`pr-gate.md`・`analyze*.md`。008 / 009 / 010 / 011 / 012 / 013 / 014 / 015 / 016 / 017 / 020 / 021 / 022) | **当たらない** — 指摘の時点の記録。X-6 に送った項目は各 feature の完了の PR で roadmap の X-6 の行に集めてあり (#2)、正本はそちら |
| 26 | `specs/021/spec.md:253` (「動いているセッションのモデル / effort / 権限モードの変更 (`setModel` など) — X-6」)・`:46` / `:82` (U-8) | **受ける** — 本 feature の範囲そのもの。effort は変えない (spec U-3)。021 の文書は直さない |
| 27 | `specs/018/spec.md:289` (「model picker は X-6」) | **受ける** — Composer model picker を照合して取り込まない (research R-10。U-7) |
| 28 | `specs/013/data-model.md:134` (「実行中の変化を描くのは … X-6 (`set_permission_mode` / `set_model`)」) | **受ける** — ヘッダの今の値と概要のタブの「現在の権限モード」「現在のモデル」(data-model §8.3)。「起動時の」の見出しは変えない |
| 29 | `specs/012/spec.md:359` (「Command palette からのセッションの操作 (停止・名前の変更など) → X-6」) | **当たらない** — 本 feature は操作をヘッダに置き (U-7)、Command palette にセッションの操作を足さない。roadmap の X-6 の行に「Command palette からの名前の変更」を後続の項目として残す (完了の PR) |
| 30 | `specs/008/`・`specs/009/`・`specs/005/`・`specs/010/`・`specs/020/`・`specs/016/`・`specs/017/`・`specs/014/`・`specs/015/`・`specs/011/`・`specs/019/` の spec / plan / research / tasks / quickstart(-results) / data-model の残り | **当たらない** — 繰り越しの記録で、中身 (追加ディレクトリ・上限・退避の UI・Win32 の直接起動 (X-8 で済み)・fork・/clear の後の id・孤児の観測・項目 21 の件数) は roadmap の X-6 の行 (#2) に集まっている。本 feature の範囲外の項目は spec の「義務の扱い」で X-6 の後続に残した |

### 3) 実名リスト方式のルール

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 31 | `scripts/constitution/allowlists.mjs:208-253` (`PROCESS_SPAWN_MODULES`。`:231`, `:235`, `:252` が当たった) | 子プロセスを起こすモジュールの実名の列 | **受ける** — `src/main/app/rename-spawner.ts` を足す (AD-062 Decision 4。コメントに寿命と transcript-spawner と別にする理由を書く) |
| 32 | `scripts/constitution/allowlists.mjs:374`, `:377` (`AGENT_SDK_ALLOWED_CALLS` の注記「書き込み系 API は許可しない — transcript は読み取り専用 (FR-001)」) | 許可の名前の列 | **受ける** — `renameSession` を足し、注記を AD-062 の読み替えに直す (data-model §7) |
| 33 | `scripts/constitution/allowlists.mjs:458`, `:462`, `:466`, `:467` (`QUERY_MUTATION_METHODS`) | 変更系のメソッドの列。「外すには ADR が要る」 | **受ける** — `setPermissionMode` / `setModel` を外す (AD-062 Decision 3)。`setMaxThinkingTokens` は残す。注記に AD-062 を足す |
| 34 | `scripts/constitution/allowlists.mjs:537-563` (`WSL_FREE_DIRECTORIES`。`:549`, `:551` が当たった) | app の起動系のモジュールの実名の列 | **受ける** — `session-rename-service.ts` / `rename-spawner.ts` / `live-transcript-target.ts` を足す (`wsl.exe` を名指さない) |
| 35 | `scripts/constitution/allowlists.mjs:278` (`COORDINATOR_THREAD_DECODER_MODULES`) | 調停役スレッドの decoder の置き場 | **当たらない** — `control-result` の decoder も `supervisor-protocol.ts` に置く |
| 36 | `.dependency-cruiser.js:234`, `:254` (`services-not-to-io` の実名の列) | 状態を持つ調停の service → I/O の直接依存の禁止 | **受ける** — `session-rename-service` を足す (I/O を注入で受ける)。`live-transcript-target` は純粋な関数で I/O を持たないので足さない (注入で受けた値だけを見る) |
| 37 | `.dependency-cruiser.js:298` (`worker-threads-only-from-entry`) | `worker_threads` の 2 ファイル | **当たらない** — 変えない。新しい `agents-not-to-core` は `worker_threads` / `child_process` を除いた標準モジュールを見る (#20) |
| 38 | `eslint.config.mjs:110` (`AGENT_SESSION_SPAWN_FILE`) | セッションスレッドの spawn の例外 | **当たらない** — `rename-session.ts` は spawn も標準モジュールも使わない。ESLint の `boundaries/dependencies` の agents の禁止がそのまま効く |
| 39 | `.specify/spec-gate/reviewers.yml` | 0 件 | **当たらない** — 既存の glob (`src/agents/**`・`src/main/app/**`・`scripts/constitution/**` など) が変更のファイルを含む |
| 40 | `tests/rule-fixtures/expected.mjs:242`・`a-direct/sdk-forbidden-call.ts.fixture` | `renameSession` を禁止の例に使う | **受ける** — `tagSession` に差し替える (data-model §7) |
| 41 | `tests/rule-fixtures/expected.mjs:460-465`・`a-direct/sdk-forbidden-call-alias.ts.fixture` | `renameSession` の別名 | **受ける** — `tagSession` の別名に差し替え、#19 のとおり発火させる |
| 42 | `tests/rule-fixtures/expected.mjs:384`・`b-equivalent/sdk-query-mutation-method.ts.fixture` | `setPermissionMode('default')` を P3 の例に使う | **受ける** — `setMaxThinkingTokens(null)` に差し替える。包みの検査のサンプルを 2 つ足す (data-model §7) |
| 43 | `tests/docs/query-mutation-methods.test.ts:21`, `:25`, `:26`, `:66-69` | 22 の固定と union の一致 | **受ける** — 20 にする |
| 44 | `tests/rule-fixtures/expected.mjs:740-757`, `:939-946` (`UNDETECTED_NOTES` の本文の綴り) | 項目 14 の限界・P3 の間接呼び出しの記録 | **受ける** (`:740-757`) — #19 で項目を外す。`:939-946` (`sdk-query-method-indirect`) は「呼ぶのは `interrupt()` だけ」を「`interrupt()` と実行中の設定の 2 つ (AD-062)」に直す (項目自体は残る) |

## 実装方針

規則の正本は data-model。ここには 2026-10-27 のソースと突き合わせて決めた置き場所と順序だけを書く。行番号は main 1a7d8b4 のもの。

### Constitution 検証 (先に赤にする)

- `tests/docs/query-mutation-methods.test.ts` を 20 に直し、`sdk-agent-session.ts` の union と `allowlists.mjs` を直して緑にする。続けて rule fixture (data-model §7 の表) を足し・差し替えてから `check.mjs` の項目 14 / 16 を直す (fixture が先に赤になることを確かめる)
- 項目 16 の包みの検査は、今の `permissionMode:` の値の検査 (`SANCTIONED_PERMISSION_MODE_WRAPPER` と `wrapperCallCompletes`) の関数を `.setPermissionMode(` の引数の位置にも当てる。P3 のループ (`check.mjs:945-955`) は `QUERY_MUTATION_METHODS` を回すだけなので変えない
- 項目 14 の値の import の検査は、今の `bindings` の組み立て (`check.mjs:694-705`) で `type` の接頭辞を外す前に「`type` か」を持たせ、値の import だけを判定する。動的 import は `src.code.includes(AGENT_SDK_PACKAGE)` の分岐の中で `import\s*\(` / `require\s*\(` の引数にパッケージ名があるかを見る
- `.dependency-cruiser.js` の `agents-not-to-core` は `worker-threads-only-from-entry` (`:292-300`) の後に置く

### agents (US-1 / US-2 / US-3)

- 制御シンク (`:745`) の先頭の `closing` の早期 return の前に、`set-*` なら `control-result` の失敗を送る分岐を置く (今の `interrupt` の `.then` / `.catch` と同じ形で SDK の Promise を扱う)
- `queryHandle` の `Pick` を 3 つに広げる。`setModel` の呼び出しは必ず引数を渡す (型は `model?: string` なので tsc は省略を許す。単体テストで「引数あり」を確かめる)
- `rename-session.ts` は `read-transcript.ts` の受け取り (`process.parentPort` の 1 通) の形に揃え、port を使わない

### main (US-1〜US-3)

- `session-launch-service.ts` の `commit` を `{ ...prev, ...status, threadAlive }` にして、足した値の引き継ぎ漏れを無くす (既存の単体テストが変更なしで通ることを最初に確かめる)
- 待ちの表の解決は `onThreadEnded` / `onExit` / `killAll` の既存の処理の中で、そのセッション (世代) の待ちをまとめて `session-ended` で解く
- `live-transcript-target.ts` は `resume-service.ts:136-170` をそのまま移し、`resume-service` の既存のテストが変更なしで通ることを確かめる
- `session-rename-service.ts` は `resume-service.ts` と同じく状態を持たず、`session-launch-service` の `beginChange` / `setName` / `endChange` を注入で受ける
- IPC の handler は `session-ipc.ts` の既存の形 (述語 → service。`event` を受け取らない) にし、戻り値を返す (今の制御の handler は `void`。新しい 3 つだけが結果を返す)。登録は `ipc.ts` の `handle()` wrapper で行い、送り元の検査は wrapper に任せる (`ipcMain.handle` を直接書かない)
- 改名の間のプロンプトの保留 (data-model §4.3) は `session-launch-service.ts` の `control` と `endChange` に置く。`sendPrompt` の handler (`session-ipc.ts:312`) と composer は変えない
- `rename-spawner.ts` は `transcript-service.ts` の `active` / `dispose` の形で動いている子を持ち、`composition-root.ts` の `dispose` の合計に足す (data-model §6.3)

### renderer (US-1〜US-3)

- 押せる形と理由は domain の `liveSettingBlocker` を renderer のストアの値 (状態・`claudeAlive`・`resumable`・`changing`) から呼ぶ。`resumable` (X-9) が「会話の id がある」に当たる
- ヘッダの部品は `CenterHeader.tsx` の中で小さな部品 (`LiveSettingsControls` など。名前は tasks) に切り出し、SC-005 のコンポーネントテストを表で回す
- 名前の入力は `features/chat` の composer の IME の扱い (`isComposing`) と同じ判定を使う

### 実装の順

1. Constitution 検証の固定テストと rule fixture (赤) → `allowlists.mjs` / `check.mjs` / `.dependency-cruiser.js` (緑)
2. domain (`SessionControl`・`live-settings.ts`・`switchableModels`) と固定テスト (`LIVE_SETTING_FAILURES`)
3. agents (decoder・制御シンク・live-signals・supervisor の protocol・`rename-session.ts`)
4. main の app (`session-spawner.ts`・`session-launch-service.ts`・`live-transcript-target.ts`・`session-rename-service.ts`・`rename-spawner.ts`・`validate.ts`)
5. IPC・preload・capability (3 つの channel)・e2e の capability の写し
6. renderer (ストア・ヘッダ・概要のタブ・行の題・文言)
7. 記録 (`ui-coverage.md`・glossary・session charter・`_overview.md`・rule fixture の `UNDETECTED_NOTES`・roadmap)
8. 実機 (quickstart V-0〜V-6)。行えなければ「未実施」と書いてマージする (spec の「合否の扱い」)

## 機械強制の変更

- **固定テスト**: `QUERY_MUTATION_METHODS` 20 と union の一致 (`query-mutation-methods.test.ts`)、`IPC_CHANNELS` の並び (`capability.test.ts`)、`LIVE_SETTING_FAILURES` の並び、`SessionControl` の種類 (decoder の表)
- **往復**: main の述語を通った権限モード・モデルの値がセッションスレッドの decoder を通り、安全 3 値の外・文字種の外・UUID でない `requestId` が main と decoder のどちらでも拒否される (SC-001 / SC-003)
- **単体**: data-model §2 (`switchableModels` の表)・§3.2 (制御シンクの表。偽の `Query` で呼び出しの有無と引数)・§3.3 (基準の更新と二重に出ないこと)・§4.2 (待ちの解き方の表)・§5.1 (blocker の表。SC-004)・§5.3 (名前の規則の表)・§6.1 (改名の流れ。WSL / Win32 の列挙対象と env)・contracts C-4 (2 つの decoder)
- **component**: ヘッダの選択と名前の編集 (SC-005)。vitest-axe の違反 0
- **E2E**: 偽の capability で 3 つの変更を流し、ヘッダと稼働中の行に反映される (SC-006)
- **Constitution 検証 / lint**: 項目 14 (許可 6・`renameSession` の呼べるファイル・値の import・動的 import)・項目 16 (20・`.setPermissionMode(` の包み)・項目 7 / 15 の実名の列・`agents-not-to-core`・`services-not-to-io` の実名の列 (data-model §7)。rule fixture の新しい 3 つと差し替えた 3 つが発火し、`UNDETECTED_NOTES` から 2 つが外れる

## ADR

- **AD-062 を起こした (accepted。2026-10-27 夜間の規則で推奨案を採用)。** 権限モードの実行時の変更 (Decision 1)・モデルの実行時の変更 (Decision 2)・`QUERY_MUTATION_METHODS` 22 → 20 (Decision 3)・`renameSession` の許可と改名の短命のプロセス (Decision 4)・書き込み系 API の別名と動的 import の検査 (Decision 5)・`control-result` (Decision 6) を 1 つにまとめた。理由: どれも「AD-036 §4 P3 / AD-034 決定 3 の正の構成を、実行中の操作の分だけ広げる」1 つの判断で、片方だけを承認しても E 節の 4 行を閉じられない
- 読み替えは AD-036 §4 P3 / §5・005 SC-006(a)・AD-034 決定 3・003 FR-001・AD-041 (h) の rename・AD-043 の message の種類。どれも accepted の本文は直さない (AD-031)
- 利用者が後で覆したときの範囲は RK-01。session charter への記録は完了の PR で行う (FR-018)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 夜間の規則で採用した U-1〜U-10・P-1〜P-13・AD-062 を利用者が後で覆す | 覆ったときの範囲: U-2 (権限モード) → data-model §1 / §3 と項目 16 の包みの検査を外し、`QUERY_MUTATION_METHODS` を 21 にする。U-5 (改名) → §6・contracts C-3 / C-5・`AGENT_SDK_ALLOWED_CALLS` を外す (項目 14 の値の import の検査は残してよい)。U-7 (置き場) → §8.2 だけ。design-gate の結果を捨てて `/cl-design --from plan` から回し直す |
| RK-02 | ターンの実行中の `setPermissionMode` / `setModel` が SDK で拒否される・ターンを中断する | 拒否なら `rejected` で表示を戻す (契約は変わらない)。中断するなら受け付ける状態から `running` / `awaiting_permission` を外す (§5.1 の表の 1 行)。V-1 の 5 で確かめる |
| RK-03 | `renameSession` の追記が `claude` の追記と重なって JSONL が壊れる (特に UNC 越し) | ターンの実行中は受けない (§5.1)。受け付けた後に届いたプロンプトは結果まで保留する (§4.3)。V-5 で確かめ、壊れたら利用者に返す (受け付けを「`claude` の終了の後」に狭めるかの判断) |
| RK-04 | `setPermissionMode` の後に Claude Code が新しいモードを報告しない・別の値を報告する | 成功を `meter` に流す (§3.3) ので表示は成り立つ。別の値の報告はそれを出す (Claude Code を正。Principle X)。V-1 の 6 で記録する |
| RK-05 | 改名の列挙対象が決まらない (Provider の config ディレクトリが列挙対象に無い・既定の対象が 2 つ以上) | `write-failed` で失敗を出す (§6.1 の 3)。再開のそれまでの会話の読み取りと同じ条件なので、X-9 で読めた行は改名もできる |
| RK-06 | 名前の変更が過去の一覧に出るまでに列挙の再取得が要る | 過去の一覧は今の列挙の更新 (`sessionsChanged`) で出る。終了の後に出なければ V-3 で記録し、改名の後に列挙の更新を 1 回求めるかを判断する (契約は変わらない) |
| RK-07 | 項目 14 の値の import の検査が、後続の feature が SDK の値 (例外の class など) を import する形を違反にする | 許可の名前の列に足すか、値の import の許可の列を別に持つかをその feature の ADR で決める (AD-062 Decision 5 の範囲) |

## Project Structure

### Documentation (this feature)

```text
specs/023-session-launch-axes-and-operations/
├── spec.md                              # status を planning に
├── plan.md                              # 本ファイル
├── research.md                          # Phase 0 (R-01〜R-13)
├── data-model.md                        # Phase 1 (§0〜§9。規則の正本)
├── contracts/
│   └── ipc-live-session-settings.md     # Phase 1 (C-1〜C-6)
├── quickstart.md                        # Phase 1 (V-0〜V-6)
└── tasks.md                             # Phase 2 (/cl-tasks)
docs/decisions/0062-live-session-permission-mode-model-and-rename.md   # accepted (2026-10-27)
```

### Source Code (repository root)

```text
src/domain/session/
├── live-settings.ts         # 新設
└── agent-session.ts         # SessionControl の 2 種類
src/domain/provider/model-catalog.ts   # switchableModels
src/domain/capability.ts     # 3 つの channel
src/agents/
├── rename-session.ts        # 新設
├── session-core.ts / sdk-agent-session.ts / live-signals.ts
└── supervisor-protocol.ts / supervisor-core.ts
src/main/app/
├── live-transcript-target.ts   # 新設 (resume-service から切り出し)
├── session-rename-service.ts   # 新設
├── rename-spawner.ts           # 新設
├── session-launch-service.ts / session-spawner.ts / resume-service.ts
├── validate.ts / session-ipc.ts / composition-root.ts
└── e2e-capability.ts
src/preload/ / src/renderer/src/test-support/capability.ts
src/renderer/src/features/session/{running-session-types.ts, running-session-store.ts, RunningSessionRow.tsx, labels.ts}
src/renderer/src/features/shell/{CenterHeader.tsx, CenterPane.tsx, OverviewTab.tsx}
scripts/constitution/{allowlists.mjs, check.mjs} / .dependency-cruiser.js
tests/docs/query-mutation-methods.test.ts / tests/rule-fixtures/
docs/glossary.md / docs/domains/session/charter.md / docs/domains/_overview.md / docs/ui-coverage.md / docs/roadmap.md
```

**Structure Decision**: 既存のレイヤ (domain / agents / main の app / renderer) に置く。新しいディレクトリは作らない。main の infra は変えない (改名は既存の `transcriptTarget` / `buildTranscriptEnv` を使うだけ)。

## 設計後の見直し (Constitution Check の再確認)

- Phase 1 の成果物をソースと突き合わせて、spec との食い違いが 4 つ見つかり、spec を直した:
  1. **FR-011 / SC-004 の `{ dir }`**: `renameSession` の `dir` はホストのプロジェクトのパス (`sdk.d.ts:2983`) で、WSL の作業ディレクトリを表せない。`dir` を渡さず、config ディレクトリを env で固定する形にした (research R-06)
  2. **FR-003 の表示の優先**: 「報告があればそれを、無ければ成功の値」では、報告の後の成功が表示に出ない。成功を live-signals の基準に入れて `meter` に流し、「報告と成功の新しい方」にした (research R-02)
  3. **Key Entities の registry**: main は名前と判定の値だけを持ち、今の権限モード・モデルは renderer のストアに持つ (research R-07)
  4. **「判断の一覧」の ADR の行と位置づけの「R-2 FR-001」**: transcript の読み取り専用を定めたのは R-3 (003 spec) の FR-001 (R-2 は 002 FR-003 で自分の範囲を読み取り専用にした)。「R-3 FR-001」に直した
- spec が plan に預けた 1 点は次のとおり決めた: 実行中の変更の要求は `SessionControl` に種類を足す (権限モード・モデル)。名前は `SessionControl` に入れず別の IPC と短命のプロセス (data-model §1 / §6)
- Principle III (安全 3 値の 4 重の閉じ方)・VI (書き込みは custom-title の 1 行)・XIII (element を照合して取り込まない) の判断を上の Check に書いた
- 違反は 0 件。Complexity Tracking は空

## Complexity Tracking

なし
