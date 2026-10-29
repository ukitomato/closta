# Implementation Plan: 起動中のセッションの UI の手直し (O-13)

**Branch**: `025-ui-live-session-fixes` (main 7f6ef94 の上) | **Date**: 2026-10-29 (`/cl-plan`) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。U-1〜U-7 と ADR の行は、2026-10-29 に利用者が対話で回答した (spec の「判断の一覧」)

本 plan は次の 5 つを正本として参照し、規則を書き写さない。
- spec
- [research.md](./research.md)
- [data-model.md](./data-model.md)
- [contracts/ipc-live-models.md](./contracts/ipc-live-models.md)
- [quickstart.md](./quickstart.md)

本 plan が足すのは 2 つである。1 つは、2026-10-29 の作業ツリー (main 7f6ef94) と突き合わせて決めた**置き場所と手順** (下の「実装方針」)。もう 1 つは、上流からの申し送りの棚卸しである。

## 判断の承認

- **U-1〜U-7 は利用者が 2026-10-29 に回答した** (spec の「判断の一覧」と Clarifications)
- **plan の段の実装の選択** (research の R-01〜R-12) は、spec が plan に預けた範囲の中で決めた。預けられたのは次の 4 点である
  - 停止ボタンの variant (R-05: `outline`)
  - タブの形 (R-07: 横スクロール、省略しない)
  - registry の element の照合 (R-11: 取り込まない)
  - Constitution の改定の要否 (下の ADR の節: 改める)

  新しく利用者の判断を仰いで止める点は無い (`.needs-input.md` は作っていない)
- **AGENTS.md の gated 確定事項には当たらない**
  - domain: spec の `domain_selected_by: auto` (ui) のまま
  - Constitution: Principle XV の Exceptions に 1 項を足す。これは利用者が spec の U-4 で例外そのものを承認し、本文を改めるかどうかを plan に任せた範囲である。Principle の採否 (Principle を足す・外す) ではない
  - 改定手順 2 の人間のレビューは O-13 の PR で受ける (AD-045 の先例)
- **AD-065 を起こし、accepted にした** ([docs/decisions/0065-…](../../docs/decisions/0065-live-model-list-and-claude-code-permission-mode-names.md))。中身は U-3 と U-4 の利用者の決定を ADR の形にしたもので、覆ったときの範囲は RK-01

## Summary

- **composer の周りの選択 (US-1)**
  - `ComposerExtensions` に `settings` の口を足し、`ComposerAction` の左の群に `LiveSettingsControls` を描く (data-model §6。research R-06)
  - 中央のヘッダからは選択を外す。名前の変更と直前の失敗の 1 行は残す
  - 部品と押せる条件・確定の規則 (023) は変えずに移す。確定の後は composer の入力にフォーカスを戻す
- **既定の Provider のモデル (US-2)**
  - IPC `listSessionModels` → `SessionControl` の `list-models` → セッションスレッドの `Query.supportedModels()` → `models-result` → main の `Entry.liveModels` の経路を足す (contracts C-7〜C-9。research R-01 / R-02)
  - `setModel` は、既定の Provider の行では最後に受け取った一覧を起動の effort で絞った集合と照合する (data-model §3.3)
  - `LIVE_SETTING_FAILURES` は変えない
- **権限モードの名前 (US-1)**
  - `PERMISSION_MODE_NAMES` の 6 値を Claude Code 2.1.312 の表記にし、照合した版の定数を足す (data-model §5。research R-03)
  - 起動ダイアログの説明 (`PERMISSION_MODE_DESCRIPTIONS`) を外す
  - Claude Code の版を上げるときの見直しの項目を `docs/ui-coverage.md` の手順に足す
- **停止 (US-3)**
  - 停止ボタンを `variant="outline"` にする
  - Esc で止める処理は assistant-ui の `cancelOnEscape` に任せ、単体と E2E で固定する (research R-04 / R-05)。ライブラリで止まらないと分かったときだけ、最小の `onKeyDown` を足す
- **右のパネル (US-4)**: タブの並びを横スクロールにし、選んだタブを見える位置に寄せる。使用量の格子は値の列を縮めない形にする (data-model §8。research R-07 / R-08)
- **`/resume` (US-5)**
  - アプリのコマンドの純関数 (`app-commands.ts`) で候補を合成する
  - 送信を queue adapter の `intercept` で横取りし、選ぶ画面 (`ResumePickerDialog`) を開く
  - 選んだ後は `PastResumeBar` と共有する `startPastResume` で X-9 の再開ダイアログに進む (data-model §7。research R-09 / R-10)
- **Constitution**: Principle XV の Exceptions に権限モードの名前の項を足す (AD-065 Decision 4。次の MINOR)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**:
- `@anthropic-ai/claude-agent-sdk` 0.3.270: `Query.supportedModels()`。research R-01
- `@assistant-ui/react` 0.15.x: `ComposerPrimitive.Input` の `cancelOnEscape`・`Unstable_TriggerPopover`。research R-04 / R-09
- 照合した Claude Code の CLI は 2.1.312。新しい依存は足さない

**Storage**: なし。一覧は main のメモリ (`Entry.liveModels`) にだけ持つ。Principle X

**Testing**:
- Vitest 5 (node / renderer の 2 project) と vitest-axe
- Playwright の E2E (偽の capability)
- Constitution 検証 (`node scripts/constitution/check.mjs`) と rule fixtures
- コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)。セッションは WSL と Win32 の両方

**Project Type**: desktop-app (main / preload / renderer / agents / domain)

**Performance Goals**:
- 一覧の取得は、既定の Provider のセッションごとに最初の応答の後の 1 回 (失敗の後はフォーカスで 1 回)。期限は 10 秒で、023 の `CONTROL_RESULT_TIMEOUT_MS` を共用する
- 新しいプロセスは起こさない

**Constraints**:
- `IPC_CHANNELS` は 1 つ増える
- `SessionControl` は 9 種類になる
- supervisor の message の種類は 1 つ増える
- `QUERY_MUTATION_METHODS` 20・`LIVE_SETTING_FAILURES`・`SessionLaunchConfig`・`SessionEvent` の種類・選べる権限モード (安全 3 値)・右のペインの幅 (320px) は変えない
- AD-037 の「`onKeyDown` 未上書き」と 018 FR-014 の focus の扱いを保つ

**Scale/Scope**:
- FR 18 / SC 7 / User Story 5
- 新しい IPC 1 つ
- 新設のモジュール 4 つ: renderer の `app-commands.ts` / `past-resume.ts` / `ResumePickerDialog.tsx`、domain の関数 2 つ (`normalizeLiveModels` / `normalizeLiveModelEntries`) を既存のファイルに足す
- 移すファイル 1 つ: `LiveSettingsControls.tsx` を shell から session へ

### レイヤごとの変更 (2026-10-29 の作業ツリー = main 7f6ef94 で確かめた)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/session/agent-session.ts` | `SessionControl` の `list-models` (contracts C-8) | `:326` の `set-model` の後 |
| domain | `src/domain/session/live-settings.ts` | `LiveModelsResult` / `LiveModelOption` (C-7) | `RenameResult` `:69` の後 |
| domain | `src/domain/provider/model-catalog.ts` | `normalizeLiveModels` (セッションスレッド用。data-model §1.2) / `normalizeLiveModelEntries` (main の再検査用。§1.3) | `isValidModelEntry` / `MAX_CATALOG_MODELS` |
| domain / preload | `src/domain/capability.ts` / `capability.test.ts` / `src/preload/index.ts` / `src/main/app/e2e-capability.ts` / `src/renderer/src/test-support/capability.ts` / `app-shell-harness.tsx` | `listSessionModels` の channel と戻り値 (C-7) | `setSessionModel` (`capability.ts:225`, `:329`、`preload/index.ts:87`、`e2e-capability.ts:702`、`capability.ts` (test-support) `:68`、harness `:230`) |
| agents | `src/agents/session-core.ts` | `decodeSessionControl` の `list-models` | 023 の `set-model` の分岐 |
| agents | `src/agents/sdk-agent-session.ts` | 次の 3 点 (data-model §4) | 分類 `:145-190`、`queryHandle` `:458`、`controlSink` `:749` |
| | | - `Query` の分類に `QueryLiveReadMethod` を立てる | |
| | | - `queryHandle` の `Pick` に `supportedModels` を足す | |
| | | - 制御シンクに `list-models` を足す | |
| agents | `src/agents/supervisor-protocol.ts` / `supervisor-core.ts` | `models-result` の 2 つのデコーダと即時の中継 (C-9) | `control-result` の分岐 |
| main (app) | `src/main/app/session-spawner.ts` | `SupervisorConnection.onModelsResult` | `onControlResult` |
| main (app) | `src/main/app/session-launch-service.ts` | 次の 3 点 (data-model §2 / §3) | `Entry`、`onControlResult` `:345`、`requestControl` `:524`、`setModel` `:550` |
| | | - `Entry.liveModels` と一覧の待ちの表 | |
| | | - `listModels` を足す | |
| | | - `setModel` に既定の Provider の分岐を足す | |
| main (app) | `src/main/app/validate.ts` / `session-ipc.ts` / `ipc.ts` / `composition-root.ts` | 述語 `checkListModelsArgs` → handler → `handle()` の wrapper → 結線 | `checkSetModelArgs` `validate.ts:444`、`session-ipc.ts:408`、`ipc.ts:403`、`composition-root.ts:467` |
| renderer | `src/renderer/src/features/chat/labels.ts` | `PERMISSION_MODE_NAMES` の 6 値と照合の版の定数 (data-model §5)・`APP_COMMAND_LABELS` | `:373` |
| renderer | `src/renderer/src/features/chat/app-commands.ts` (新設) | `parseAppCommand` / `mergeCommandCandidates` (§7) | `slash-commands.ts` |
| renderer | `src/renderer/src/features/chat/composer-extensions-context.ts` | `settings?: ReactNode` (§6.1) | `ComposerExtensions` `:16` |
| renderer | `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx` | `ComposerAction` の左の群に `settings` を描く・停止ボタンを `outline` に (§6.1。R-05) | `ComposerAction`、停止 `:853` |
| renderer | `src/renderer/src/features/session/LiveSettingsControls.tsx` (`features/shell/` から移す) | 置き場所の注記・既定の Provider の一覧の状態の表示 (§6.3)・確定の後のフォーカス (§6.2) | `features/shell/LiveSettingsControls.tsx` |
| renderer | `src/renderer/src/features/session/LivePane.tsx` | `composerExtensions` に `settings` と合成した `commands` を渡す・`ResumePickerDialog` を描く | `composerExtensions` `:171` |
| renderer | `src/renderer/src/features/session/running-session-store.ts` / `running-session-types.ts` | セッションごとの `liveModels` の状態 (§6.3)・`resumePicker` (§7.2)・`createQueue` の `intercept` (§7.1)・`listModels` の操作 | `createQueue` `:645`、`setModel` `:1005` |
| renderer | `src/renderer/src/features/session/composer-queue-adapter.ts` | `createCappedAdapter` の第 4 引数 `intercept` (§7.1) | `:23` |
| renderer | `src/renderer/src/features/session/RunningSessionsProvider.tsx` | `onNew` の先頭で `intercept` (§7.1) | `:218` |
| renderer | `src/renderer/src/features/session/past-resume.ts` (新設) / `PastResumeBar.tsx` | `startPastResume` を抜き出して共有する (§7.4) | `PastResumeBar.tsx:47` |
| renderer | `src/renderer/src/features/session/ResumePickerDialog.tsx` (新設) | 選ぶ画面 (§7.3 / §7.4) | `features/shell/CommandPalette.tsx` |
| renderer | `src/renderer/src/features/session/labels.ts` / `LaunchDialog.tsx` | `PERMISSION_MODE_DESCRIPTIONS` と描く段落を消す。`LIVE_SETTING_LABELS` の 2 つと `RESUME_PICKER_LABELS` を足す (§9) | `labels.ts:435`, `:461`、`LaunchDialog.tsx:765` |
| renderer | `src/renderer/src/features/shell/CenterHeader.tsx` / `CenterPane.tsx` | `LiveSettingsSlot` と選択だけのフィールドを外す (§6.4) | `CenterHeader.tsx:111`, `:181`、`CenterPane.tsx:113` |
| renderer | `src/renderer/src/features/shell/RightPanel.tsx` / `UsageTab.tsx` | タブの横スクロール・寄せ・使用量の格子 (§8) | tablist `RightPanel.tsx:143`、`Items` `UsageTab.tsx:58` |
| docs | `docs/ui-coverage.md` | 手順に権限モードの名前の見直しを足す (FR-010)。E 節 `:219` / `:220` / `:227`、F 節 `:284` / `:338` / `:359` / `:285` | 「SDK を上げたときの手順」`:33-40` |
| docs | `.specify/memory/constitution.md` | Principle XV の Exceptions・Sync Impact Report・Amendment trail・版 (AD-065 Decision 4) | `:885-893`、`:1064`、`:1093` |

**未確定の技術事項**: なし。実機で確かめる事項は 2 つあり、どちらも結果によって契約を変えない形にしてある。quickstart V-1 / V-2 / V-4 で記録する。
- `supportedModels()` が既定の Provider でどの値を返すか
- Esc の実機の挙動

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` v1.4.0 に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — N/A: パスを扱わない
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — N/A: WSL / Win32 で違う処理を足さない。一覧の取得は動いているセッションに聞くだけ
- [x] **III. 権限モードは capability に従う** — 選べる値は安全 3 値のまま。変えるのは名前の表記と置き場所だけ (spec 本 feature の位置づけ)。昇格の値の名前は帯と transcript の行で読むためにある。`isAutoModeAllowed` と I-3 には触れない
- [x] **IV. 通信は Agent SDK 経由** — `Query.supportedModels()` (SDK の API) だけを足す。呼べるのは `queryHandle` 1 つ (AD-065 Decision 1)
- [x] **V. 長期資格情報を永続化しない** — N/A: 永続化するものが無い。一覧の値はログに出さない (件数だけ)
- [x] **VI. 永続環境を構築・変更しない** — N/A: 利用者の環境に書かない
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — セッションスレッドの変更は SDK と domain の純関数 (`normalizeLiveModels`) だけを使う
- [x] **VIII. 日本語環境で破綻しない**
  - 変換中の Esc では止めない (ライブラリの `isComposing` の判定。research R-04)
  - composer の入力欄と `onKeyDown` に触れない (AD-037)
  - `/resume` の横取りは送信の後なので、変換中の Enter とは関係しない
  - 選択の確定の後は composer にフォーカスを戻す (FR-003)
  - IME の E2E と基準画像を SC-007 で回す

**Standard**

- [x] **IX. main process をブロックしない** — 一覧は構造化複製の値で、main は検査と保持だけをする。stream の JSON を main で解かない
- [x] **X. セッションの正本はアプリ外** — 一覧の正本は動いている Claude Code の答えで、main はそのセッションの間のキャッシュとして持つ
- [x] **XI. 垂直スライス** — US-1〜US-5 はどれも画面で観測できる。E2E は SC-001 / SC-004〜SC-006、実機は quickstart V-1〜V-9
- [x] **XII. 未表示情報を残さない** — E 節の `list_models` を `実装済み` に書き直す。`set_permission_mode` / `set_model` は置き場所の文言を直す。F 節の 3 行の置き場所の文言を直す (FR-004)。項目 21 が ok
- [x] **XIII. assistant-ui の element と design system を優先**
  - 新しい element は取り込まない。registry の Composer model picker / Model selector / Settings を照合した結果である (research R-11)
  - 停止は registry の Button の variant、選ぶ画面は O-3 が取った `CommandPalette` の表示と `Dialog` を使う
  - 選択は 023 の native `<select>` のまま。理由は PR に書く
- [x] **XIV. Ubiquitous Language** — 「Live session setting」の定義に既定の Provider の一覧を足し、「SessionControl」を 9 種類に、「Slash command candidates」にアプリのコマンドを足す (下の「実装の順」7)。新しい語は「アプリのコマンド」(App command) 1 つ
- [x] **XV. 多言語規約**
  - 足す文言は文言の表に置く (data-model §9)
  - 権限モードの名前の英語は、Exceptions に足す項 (AD-065 Decision 4) で扱う
  - 囲む文と Closta の「不明なモード」は日本語のまま

**Domain charter の整合**

- [x] 本 feature の domain (`ui`) の In scope に収まる
  - composer (`charter.md:68`)
  - `docs/ui-coverage.md` の維持 (`:74`)
  - アプリのシェルの中央のヘッダと右のペインのタブの表 (`:93-100`)
- [x] Out of scope に踏み込まない
  - 選択の部品と選ぶ画面は session の操作 UI (`charter.md:110`「他 domain の操作 UI」) で、置き場所は `features/session/` にする。ui は composer の口 (`settings`) と描く場所だけを持つ。023 が「ヘッダの部品は ui のシェルの中に置くが、操作は session が持つ」とした形と同じである
  - main / agents の一覧の経路は session の制御の配管 (023 と同じ置き場所) で、charter の改定は要らない

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission (`:46`): Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- 本 feature が触れる Scope
  - composer (日本語 IME・message queue・slash commands。`:68`)。選択の口・停止ボタン・Esc・`/resume` の候補と横取り
  - `docs/ui-coverage.md` の維持 (`:74`)。E 節 3 行と F 節 3〜4 行の文言
  - アプリのシェル (`:93-100`)。中央のヘッダから選択を外す。右のペインのタブの表の見た目
- 不変条件 (`:170-179`) のうち「隔離状態は一目で分かること」は変えない (中央のヘッダの隔離の表示に触れない)
- KPI「日本語の健全性」(`:186`): composer の IME の E2E が通ることを SC-007 で確かめる
- 触れる他の domain
  - `session`: 選択の部品・選ぶ画面・一覧の制御の経路 (session の操作 UI と制御の配管)。session charter の In scope の「セッションの起動、応答のストリーミング、中断、再開、分岐」の延長
  - `provider`: `switchableModels` / `isValidModelEntry` (provider の domain の純関数) を読むだけ。`normalizeLiveModels` を同じファイルに足す
- ui charter の Related ADRs (`:215`) に AD-065 を、Related Specs (`:223`) に 025 を、frontmatter の `related_adrs` / `related_specs` に同じものを、完了の PR で足す

### Related ADRs

- [AD-065](../../docs/decisions/0065-live-model-list-and-claude-code-permission-mode-names.md) — 既定の Provider のモデルの一覧 (`supportedModels`) と、権限モードの名前の Claude Code の表記: **accepted** (本 feature で起こした。U-3 / U-4 は 2026-10-29 に利用者が回答)
- [AD-062](../../docs/decisions/0062-live-session-permission-mode-model-and-rename.md) — 実行中の権限モード・モデルの切り替えと改名: accepted。Decision 1〜3 (呼ぶメソッド) と Decision 2 (カタログに閉じる) を AD-065 が読み替える。Decision 6 (`control-result`) の形に `models-result` を揃える
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — §4 P3 (`Query` のメソッドの許可): accepted。AD-062 と AD-065 が読み替える
- [AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md) — 日本語 IME の composer の挙動 (`onKeyDown` 未上書き・`useEscapeKeydown` の `isComposing` 無視): accepted。Esc の判断の根拠 (research R-04)
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — UI の文言を i18n リソース化しない・Principle XV の Exceptions の先例: accepted。改定の手順の先例
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — ui-coverage の割当: accepted (FR-004 / E 節の `list_models`)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — アプリのシェル (中央のヘッダ・右のペインのタブの表): accepted。置き場所の語の正本
- [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) / [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) — element の棚卸しと取り込みのコスト: accepted (Principle XIII の照合。research R-11)
- [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — E2E のスクリーンショットの harness と capability の写し: accepted (基準画像・`e2e-capability.ts`)
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter` の `permission-mode` と、表示名を renderer の文言の表に置く規則 (`:79`): accepted (変えない)
- [AD-059](../../docs/decisions/0059-session-resume-query-option-and-conversation-id.md) — 再開 (X-9)・会話の id は main だけが持つ: accepted (`/resume` の先の流れ)
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) — 単一 supervisor・セッションスレッド・message の種類: accepted。`models-result` を足す

### Glossary excerpt

- **Composer** (`glossary.md:184`): `ComposerPrimitive.Input` を用い、変換確定の Enter を送信にしない。自前ガードを新設しない。本 feature は入力欄に触れず、左の群に選択を、送信の後にアプリのコマンドの横取りを足す
- **Live session setting（実行中の設定の変更）** (`:613`): 動いているセッションの権限モード・モデル・名前を止めずに変える操作 (023)。「モデルはそのセッションの Provider のカタログのうち起動の effort が効くもの」に、既定の Provider では「Claude Code が答えた一覧のうち起動の effort が効くもの」を足す
- **Model catalog** (`:720`): Provider ごとのモデルの集合。既定の Provider の一覧はカタログではない (Provider に属さない)。検査の規則だけを共有する
- **SafePermissionMode** (`:980`): `default` / `plan` / `dontAsk`。実行中の切り替えも同じ 3 値。名前の表記だけが変わる
- **SessionControl** (`:1013`): 8 種類 → 9 種類 (`list-models`)
- **Slash command candidates（コマンドの候補）** (`:857`): 選ぶと `/{name} ` が入り送らない。アプリのコマンド (`/resume`) を足す
- **Resume（再開）** (`:937`) / **Resume dialog** (`:948`): `/resume` の選ぶ画面の先は、この流れとダイアログのまま
- **Unsafe permission mode banner** (`:1398`): 帯の権限モードの名前も同じ表から読む (US-1 AC6)

## 上流からの申し送り

```text
# 2026-10-29 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
#    rg -n "025-ui-live-session-fixes" {docs,.specify,tests,specs}/**/*.{md,mjs,js,yaml,yml}
#    → 3 行 / 2 ファイル (plan を書く前)
# 2) feature ID (023 の plan と同じく、roadmap の申し送りに当てるため足した)
#    rg -n "\bO-13\b" {docs,.specify,tests,specs}/**/*.{md,mjs,js,yaml,yml}
#    → 9 行 / 2 ファイル (plan を書く前)
# 3) 新設・変更のモジュール名を実名リスト方式のルールで
#    rg -n "supportedModels|LiveSettingsControls|composer-queue-adapter|CenterHeader|live-settings|thread\.aui|slash-commands|RightPanel|UsageTab|labels|ResumePicker|app-command|listSessionModels|models-result" \
#       .dependency-cruiser.js eslint.config.mjs scripts/constitution/allowlists.mjs .specify/spec-gate/reviewers.yml
#    → 10 行 (dep-cruiser 0・allowlists 0・eslint 4・reviewers 6)
# 4) 変える名前 (`supportedModels` / `QueryUnusedReadMethod` / `PERMISSION_MODE_NAMES` / `PERMISSION_MODE_DESCRIPTIONS`) を scripts/ tests/ src/ docs/ .specify/ で
#    → 44 行 (src 35・tests 7 (expected.mjs 2・meter-through.test.tsx 5)・docs 2)。下の #18〜#26
#    合計 66 行。全行を下の表で割り当てた
```

### 1) spec_id の 3 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | `docs/roadmap.md:388` (O-13 の行) | 範囲の正本 (6 項目と範囲外) | **受ける** — spec の「義務の扱い」が 6 項目と範囲外を割り当て済み。完了の PR で行に「結論」を足す (下の「実装の順」7) |
| 2 | `specs/025-…/spec.md:2` | frontmatter の `spec_id` | **当たらない** — 自身 |
| 3 | `specs/025-…/spec.md:16` | Feature Branch | **当たらない** — 自身 |

### 2) feature ID (`O-13`) の 9 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 4 | `docs/roadmap.md:388` | #1 と同じ行 | **受ける** (#1) |
| 5 | `docs/roadmap.md:402` | O-13 を足した経緯と、「既定の Provider のセッションでのモデルの切り替え」(023 U-10) の持ち主が O-13 であること | **受ける** — US-2 / AD-065 Decision 1〜2 で閉じる。完了の PR で、X-6 の後続の項目から外れたことを roadmap の O-13 の行の結論に書く (X-6 の行は 024 の枝が書き換え中なので、O-13 の側に書く) |
| 6〜10 | `specs/025-…/spec.md:3`, `:14`, `:22`, `:39`, `:57` | 自身の frontmatter・題・Input・U-1・Clarifications | **当たらない** — 自身 |
| 11〜12 | `specs/025-…/spec.md:68`, `:77` | 「義務の扱い」の見出しと範囲外の行 | **当たらない** — 自身 (範囲外の 2 項目は spec が扱わないと決めた) |

(#11〜12 は 2 行。2) の合計は 9 行)

### 3) 実名リスト方式のルールの 10 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 13 | `.specify/spec-gate/reviewers.yml:49`, `:117` (a11y / ux の `features/shell/labels.ts`) | シェルの文言の表を対象に入れる | **当たらない** — 本 feature は `features/shell/labels.ts` を変えない見込み。変えても既存の glob が当たる |
| 14 | `.specify/spec-gate/reviewers.yml:60`, `:128` (a11y / ux の `thread.aui.tsx`) | 手書きの element を対象に入れる | **当たらない** — 既に入っている。`ComposerAction` と停止ボタンの変更で a11y / ux が起動する |
| 15 | `.specify/spec-gate/reviewers.yml:231`, `:242` (ui-coverage の注記と `features/shell/labels.ts`) | `session/labels.ts` は文言だけの変更でも起動するので入れない、という注記 | **当たらない** — `session/labels.ts` の変更は既存の方針どおり ui-coverage を起動しない。対応表は `docs/ui-coverage.md` を直接直す (FR-004 / FR-010) |
| 16 | `eslint.config.mjs:568`, `:580`, `:591` (`thread.aui.tsx` に意味論の番人を戻す block と、同方針を引く注記 2 つ) | 手書きの element の hooks の番人 | **当たらない** — `thread.aui.tsx` は既に入っている。新しい element ファイルを足さない |
| 17 | `eslint.config.mjs:629` (`command-palette.tsx` に手を入れた注記) | O-3 が手を入れた registry の element | **当たらない** — `ResumePickerDialog` は `command-palette.tsx` を変えずに使う。変える必要が出たら同じ block の規則のまま |

`.dependency-cruiser.js` と `scripts/constitution/allowlists.mjs` は 0 件である。新設の `app-commands.ts` / `past-resume.ts` / `ResumePickerDialog.tsx` は renderer の features の中で、実名の列 (`PROCESS_SPAWN_MODULES` / `WSL_FREE_DIRECTORIES` / `services-not-to-io` など) の対象ではない。`supportedModels` は `QUERY_MUTATION_METHODS` に入っていないので、`allowlists.mjs` は変えない。

### 4) 変える名前の参照

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 18 | `tests/rule-fixtures/expected.mjs:949-956` (`sdk-query-method-indirect` の `mitigatedBy`) | 「呼ぶのは `interrupt()` と実行中の設定の 2 つ」「`QueryUnusedReadMethod` の 7 個の呼び出しは項目 16 の対象外」 | **受ける** — 「`interrupt()`・実行中の設定の 2 つ・一覧の読み取り `supportedModels` (AD-065)」に直す。「7 個」は今の union の 6 とも食い違っているので、移した後の実数 5 に直す |
| 19 | `src/agents/sdk-agent-session.ts:145-190` (分類のコメントと union) | `supportedModels` は「呼ばない読み取り」 | **受ける** — `QueryLiveReadMethod` に移し、コメントに AD-065 を足す (data-model §4) |
| 20 | `src/renderer/src/features/chat/labels.ts:373-390` | 名前の表 | **受ける** — data-model §5 |
| 21 | `src/renderer/src/features/session/labels.ts:10`, `:424-430` (import と、`PERMISSION_MODE_LABELS` は名前の表から取る) | 派生の表 | **当たらない** — 値は表から取るので変えない。注記だけ AD-065 を足す |
| 22 | `src/renderer/src/features/session/labels.ts:461`・`LaunchDialog.tsx:44`, `:765` | 説明の表と描く段落 | **受ける** — 消す (FR-008) |
| 23 | `src/renderer/src/features/shell/CenterBanners.tsx:7`, `:94`・`OverviewTab.tsx:3`, `:108`, `:112`・`LiveSettingsControls.tsx:17`, `:232`・`features/shell/labels.ts:157` | 名前の表を読む側 | **当たらない** — 読む側は変えない (FR-009 を満たしている)。`OverviewTab.tsx:108` の注記「中央のヘッダには常設しない」は、composer の周りに選択が出たことに合わせて直す |
| 24 | `src/renderer/src/features/shell/CenterBanners.test.tsx:13`, `:473`, `:487`・`OverviewTab.test.tsx:9`, `:112-151`・`LivePane.o2.test.tsx:12`, `:561`・`tests/meter/meter-through.test.tsx:20`, `:466-632` | 名前の表を参照して期待値を作るテスト | **当たらない** — 表を参照しているので値の変更で落ちない。名前の表の値を固定する単体を新しく足す (AD-065 Confirmation) |
| 25 | `docs/domains/session/charter.md:305` | `PERMISSION_MODE_LABELS` を chat の `PERMISSION_MODE_NAMES` から取る形の記録 | **当たらない** — 形は変わらない |
| 26 | `docs/decisions/0047-…md:79` | 表示名は renderer の文言の表に置く | **当たらない** — 置き場所は変わらない (accepted の ADR は直さない) |

## 実装方針

規則の正本は data-model である。ここには、2026-10-29 のソースと突き合わせて決めた置き場所と順序だけを書く。行番号は main 7f6ef94 のもの。

### agents / main (US-2)

- **制御シンク** (`sdk-agent-session.ts:749`)
  - `list-models` の分岐は、023 の `set-*` の分岐と同じく、`closing` / ハンドル無しの失敗を先に返す
  - `supportedModels()` の Promise は `.then` / `.catch` で扱い、例外の文言を運ばない
- **一覧の待ちの表**: 023 の `pending` と別の `Map` に持つ。`onThreadEnded` / `onExit` / `killAll` の既存の解決の中で、同じセッション (世代) の待ちを `session-ended` で解く
- **`setModel` の分岐**: 既存の `providerId === null` の早期 return (`:558`) を data-model §3.3 の分岐に置き換える。Provider のある行の処理は変えない
- **`commit` の引き継ぎ**: 023 で `{ ...prev, ...status, threadAlive }` にしてある。`liveModels` を足しても引き継ぎ漏れは起きない (既存の単体が変更なしで通ることを確かめる)

### renderer (US-1 / US-3 / US-4)

- **ファイルの移動**: `LiveSettingsControls.tsx` とその単体 (`LiveSettingsControls.test.tsx`) を `features/session/` に移す
  - 理由: `features/session` は今 `features/shell` を import していない。逆向き (shell → session) は既にある (`CenterHeader.tsx:12`)。LivePane から shell を読むと向きが増える
  - `CenterHeader.tsx` は `EditableSessionTitle` / `LiveSettingError` を session から読む
- **`ComposerAction` の左の群**: `flex min-w-0 items-center gap-1` にして、`settings` を `ComposerAddAttachment` の右に置く。右の群 (送信・停止) は `shrink-0` で押し出されない形にする。選択の `max-w-48` (今の値) は composer の幅に合わせて tasks で詰める
- **フォーカスを戻す**: `LiveSettingsControls` の `onSelect*` の呼び出し側 (LivePane) で、確定の後に `handOffFocusToComposer` を呼ぶ。blur の確定では呼ばない (data-model §6.2)
- **Esc の単体**: `Thread` を実行中の偽の runtime で描き、次の 3 つを固定する
  - textarea に Esc を送ると `onCancel` が 1 回呼ばれる
  - `compositionstart` の後の Esc (`isComposing: true`) では呼ばれない
  - 実行中でないときは呼ばれず、入力も消えない

  落ちたときだけ、research R-04 の代替の最小案に進む
- **右のパネル**: `scrollIntoView` は jsdom に無い。単体では呼び出しを spy で確かめ、見た目 (1 行に収まる) は E2E (SC-005) で確かめる

### renderer (US-5)

- **`intercept` の置き場所**: `createQueue` (`running-session-store.ts:645`) で組み、`createCappedAdapter` の第 4 引数に渡す。`RunningSessionsProvider.tsx:218` の `onNew` も同じ関数を読む (queue を渡す限り `onNew` は呼ばれないが、fallback の経路を塞ぐ)
- **候補の合成**: `LivePane.tsx:171` の `composerExtensions` で `mergeCommandCandidates(slashCommandEntries(meters))` にする。`sessionMeters` が無いときも、アプリのコマンドだけの候補を渡す
- **`startPastResume`**: `PastResumeBar.tsx` の ok の分岐から抜き出す。`PastResumeBar` の既存の単体が変更なしで通ることを最初に確かめる
- **`ResumePickerDialog`**: `features/shell/CommandPalette.tsx` の Dialog・`useDialogReturnFocus`・`CommandPalette` の表示の組み方を写す。閉じたときの戻り先は composer の入力 (`handOffFocusToComposer`) にする

### Constitution の改定

- Principle XV の Exceptions に 1 項を足す
  - 見出し: `**Exceptions** (AD-065 Decision 3)`
  - 本文: 権限モードの名前は Claude Code の CLI の表記をそのまま使い、説明を付けない。名前の表は `features/chat/labels.ts` の `PERMISSION_MODE_NAMES` 1 か所。照合の版は同じファイルの定数。版を上げるときは `docs/ui-coverage.md` の手順で見直す
- Sync Impact Report を先頭に足す。中身は版 1.4.0 → 1.5.0 (O-12 の持ち越しが先なら 1.6.0)、MINOR の理由、改定手順 1〜5、既存違反の enumeration (XV: 0 件。基準線の数え方は AD-045 Confirmation のまま。英語の名前は文言の表の中で、直書きを増やさない)
- Amendment trail の行と、末尾の `Version` / `Last Amended` を同じ差分で直す

### 実装の順

1. domain (`SessionControl`・`LiveModelsResult`・`normalizeLiveModels`) と単体
2. agents (decoder・分類と `queryHandle`・制御シンク・supervisor の protocol と中継)
3. main の app (`session-spawner.ts`・`session-launch-service.ts`・`validate.ts`・`session-ipc.ts`・`ipc.ts`・`composition-root.ts`)
4. IPC・preload・capability・e2e の capability の写し (`e2e-capability.ts` の既定の Provider のセッションは固定の 2 件の一覧を返す)
5. renderer の US-1 / US-2
   - 名前の表と説明の削除
   - `LiveSettingsControls` の移動と一覧の状態
   - `ComposerExtensions.settings`
   - 中央のヘッダから外す
6. renderer の US-3 / US-4 / US-5
   - 停止と Esc の単体
   - 右のパネル
   - `app-commands.ts`・`intercept`・`past-resume.ts`・`ResumePickerDialog`
7. 記録
   - `docs/ui-coverage.md` (手順・E 節・F 節)
   - Constitution の改定 (上の節)
   - glossary (Composer・Live session setting・SessionControl・Slash command candidates・新しい語「App command (アプリのコマンド)」)
   - ui charter の Related ADRs / Specs と frontmatter
   - `tests/rule-fixtures/expected.mjs` の `sdk-query-method-indirect` (#18)
   - roadmap の O-13 の行の結論
8. E2E (SC-001 / SC-004〜SC-007) と基準画像 (CI の artifact から取る)
9. 実機 (quickstart V-1〜V-9)。行えなければ「未実施」と書いてマージする (夜間の規則)

## 機械強制の変更

- **型**: `queryMethodsAreClassified` / `queryClassifiedMethodsExist` が新しい分類 (`QueryLiveReadMethod`) を含んで通る。SDK の版上げで `supportedModels` が消えれば tsc が落ちる
- **固定テスト**: `IPC_CHANNELS` の並び (`capability.test.ts`) に 1 つ足す。`SessionControl` の種類 (decoder の表) に 1 つ足す。名前の表の 6 値と照合の版の定数を固定する。`QUERY_MUTATION_METHODS` の 20 (`query-mutation-methods.test.ts`) は変わらない
- **単体**
  - data-model §1.2 (正規化の 5 規則)・§3.1 (判定の表)・§3.2 (結果の表)・§3.3 (`setModel` の 3 分岐)・§4 (制御シンク)
  - §6.3 (一覧の状態の遷移)・§7 (`parseAppCommand` の表・合成・横取りの 2 つの入口)
  - Esc の 3 つ
  - contracts の「テストの観点」
- **component**: composer の周りの選択 (SC-001 の component 版)・選ぶ画面 (キーボードだけで選べる・空・読み込み中・失敗の理由)・右のパネルのタブ。vitest-axe の違反 0
- **E2E**
  - `live-session-settings.spec.ts` を composer の領域に向ける (SC-001)
  - 既定の Provider の一覧から切り替える (SC-002 の E2E 版。偽の capability)
  - Esc (`ime.spec.ts` に足す。SC-004)
  - 右のパネル (SC-005)
  - `/resume` (SC-006)
- **Constitution 検証**: 項目 21 (E 節と F 節の行)。項目 16 は変わらない

## ADR

- **AD-065 を起こした (accepted)。** 中身は 4 つの Decision で、`supportedModels` の許可 (1)、既定の Provider のモデルの閉じ方 (2)、権限モードの名前 (3)、Principle XV の Exceptions の改定 (4) である。理由: どれも spec が「plan で起こす」とした ADR の行の (a) と (b) で、(b) の改定の要否を plan で決めた
- **改定の判断**: Constitution の Exceptions は改める (AD-065 Decision 4)。改めないと Principle XV の本文と食い違ったまま残り、ux-reviewer の i18n の観点が毎回この名前を指摘する。先例 2 件 (AD-024 #12・AD-045 Decision 3) も本文の Exceptions に足した
- **読み替え**: 読み替えるのは AD-036 §4 P3・AD-062 Decision 1〜3・`docs/ui-coverage.md` E 節 `list_models`・Constitution Principle XV の UI labels の 4 つ。accepted の ADR の本文は直さない (AD-031)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 利用者が AD-065 の形 (pull・main の保持・Exceptions の改定) を覆す | 覆ったときの範囲は次のとおり。design-gate の結果を捨てて `/cl-design --from plan` から回し直す<br>- pull → push: contracts C-7 と data-model §6.3 を外し、セッションスレッドが `init` の後に送る形にする<br>- 改定しない: Constitution の差分を外し、PR に例外の理由を書く |
| RK-02 | `supportedModels()` が既定の Provider で空を返す・失敗する・Provider の設定と違う値を返す | 空と失敗は理由つきで押せない (FR-007)。値の妥当性は Claude Code を正とする (Principle X)。V-1 で記録し、空なら利用者に返す |
| RK-03 | `supportedModels()` の値を `setModel` に渡すと拒否される (例: `default` の扱い) | `rejected` で表示を戻す (023 の契約のまま)。V-2 で記録し、拒否される値の型が分かれば `normalizeLiveModels` で除く (契約は変わらない) |
| RK-04 | ライブラリの `cancelOnEscape` では止まらない (実機で効いていなかった原因が別にある) | Esc の単体を先に書く。落ちたら research R-04 の代替の最小案 (`onKeyDown` で `isComposing` を見て `interrupt`) に進む。AD-037 の「ライブラリのガードを殺さない」は `composeEventHandlers` で保たれる |
| RK-05 | composer の左の群に選択が入って、狭い幅で送信ボタンや入力欄が崩れる | 右の群を `shrink-0` に、選択を `min-w-0` / `truncate` にする。基準画像と E2E の狭い幅 (CI の画面) で確かめる |
| RK-06 | 基準画像 (`composer-screenshot.spec.ts`) が変わる | 理由を PR に書き、CI の artifact から取る (SC-007。memory「CI red on main」) |
| RK-07 | O-12 が持ち越した Principle XII の改定 (v1.5.0) と版が衝突する | 先にマージされた方が 1.5.0 で、後の方が 1.6.0 にする。Amendment trail の行の順で読む |
| RK-08 | 夜間の規則で PR をマージすると、改定手順 2 (人間のレビュー) を満たせない | 利用者の決定 (2026-10-29 の夜間の指示) で、Constitution の差分 (SH-011) と**それに依る名前の表の変更 (FE-010)** は分けず、この PR に含めてマージする。人間のレビューはマージ後に利用者が朝に行い、覆すときは別の PR で直す。RK-08 の本質 (Governance「Constitution を正とする」により、名前の表を Constitution の改定より先に main に入れない) は同じ PR なので満たす。テストは名前を文字列で書かずに `PERMISSION_MODE_NAMES` を参照する |
| RK-09 | `/resume` の選ぶ画面に今のセッション自身が出る | renderer は会話の id を持たないので除けない (AD-059)。選べば `resolvePastResume` の判定に任せる。V-7 で記録し、紛らわしければ後続で main に除外の問い合わせを足す |

## Project Structure

### Documentation (this feature)

```text
specs/025-ui-live-session-fixes/
├── spec.md                       # status を planning に
├── plan.md                       # 本ファイル
├── research.md                   # Phase 0 (R-01〜R-12)
├── data-model.md                 # Phase 1 (§1〜§9。規則の正本)
├── contracts/
│   └── ipc-live-models.md        # Phase 1 (C-7〜C-9 と C-2 の追加)
├── quickstart.md                 # Phase 1 (V-1〜V-9)
└── tasks.md                      # Phase 2 (/cl-tasks)
docs/decisions/0065-live-model-list-and-claude-code-permission-mode-names.md   # accepted (2026-10-29)
```

### Source Code (repository root)

```text
src/domain/session/{agent-session.ts, live-settings.ts}
src/domain/provider/model-catalog.ts            # normalizeLiveModels
src/domain/capability.ts                        # listSessionModels
src/agents/{session-core.ts, sdk-agent-session.ts, supervisor-protocol.ts, supervisor-core.ts}
src/main/app/{session-spawner.ts, session-launch-service.ts, validate.ts, session-ipc.ts, ipc.ts, composition-root.ts, e2e-capability.ts}
src/preload/index.ts
src/renderer/src/test-support/{capability.ts, app-shell-harness.tsx}
src/renderer/src/components/assistant-ui/elements/thread.aui.tsx
src/renderer/src/features/chat/
├── app-commands.ts               # 新設
├── composer-extensions-context.ts
└── labels.ts
src/renderer/src/features/session/
├── LiveSettingsControls.tsx      # features/shell/ から移す
├── ResumePickerDialog.tsx        # 新設
├── past-resume.ts                # 新設
├── LivePane.tsx / PastResumeBar.tsx / LaunchDialog.tsx / labels.ts
├── running-session-store.ts / running-session-types.ts / RunningSessionsProvider.tsx
└── composer-queue-adapter.ts
src/renderer/src/features/shell/{CenterHeader.tsx, CenterPane.tsx, RightPanel.tsx, UsageTab.tsx, OverviewTab.tsx}
e2e/{live-session-settings.spec.ts, ime.spec.ts, composer-screenshot.spec.ts, <新設の /resume と右のパネルの spec>}
.specify/memory/constitution.md
docs/{ui-coverage.md, glossary.md, domains/ui/charter.md, roadmap.md}
tests/rule-fixtures/expected.mjs
```

**Structure Decision**: 既存のレイヤ (domain / agents / main の app / renderer) に置き、新しいディレクトリは作らない。main の infra と `scripts/constitution/` は変えない。

## 設計後の見直し (Constitution Check の再確認)

- **spec との食い違い**: Phase 1 の成果物をソースと突き合わせて、spec を直す必要のある食い違いは見つからなかった。spec の Assumptions の [ASSUMED] 3 つは次のとおり決めた
  1. **停止ボタンの variant**: `outline` (research R-05)
  2. **右のパネルのタブ**: 横スクロールで、省略しない (research R-07)。US-4 AC3 (省略された名前) は、省略しないので当たらない。FR-014 の条件つきの要求として満たす
  3. **選ぶ画面の並び**: 過去の一覧と同じグループの順 (新しい順。data-model §7.3)
- **spec が plan に預けた 2 点**
  - (FR-004) registry の element は取り込まない (research R-11)
  - (ADR の行 (b)) Constitution の Exceptions を改める (AD-065 Decision 4)
- **plan で足した前提**: spec の Assumptions の「`supportedModels()` は現行版で呼べる」は、`sdk.d.ts:2763` の型と `QueryUnusedReadMethod` の分類で確かめた。返り値の形は research R-01 に書いた
- **確かめた判断**: Principle III (選べる値は変えない)・VIII (`onKeyDown` に触れない・変換中の Esc)・XIII (element を照合して取り込まない)・XV (Exceptions の改定) の判断を上の Check に書いた
- **違反**: 0 件。Complexity Tracking は空

## Complexity Tracking

なし
