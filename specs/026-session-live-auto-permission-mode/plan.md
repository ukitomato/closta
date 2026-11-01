# Implementation Plan: 権限モードの Auto (起動と実行中) (X-10)

**Branch**: `026-session-live-auto-permission-mode` (main 4f23de4 の上。025 #32 / 024 #33 / #34 マージ済み) | **Date**: 2026-10-31 (`/cl-plan`。初版 2026-10-29、載せ直し 2026-10-30) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。U-1〜U-5 は 2026-10-29 に利用者が承認した (spec の「決定済みの事項」)

本 plan は次の 5 つを正本として参照し、規則を書き写さない。
- spec
- [research.md](./research.md) (R-01〜R-13。決定 P-1〜P-13)
- [data-model.md](./data-model.md) (§0〜§11。**規則の正本**)
- [contracts/ipc-auto-permission-mode.md](./contracts/ipc-auto-permission-mode.md) (C-1〜C-7)
- [quickstart.md](./quickstart.md) (V-0〜V-5)

本 plan が足すのは 2 つである。1 つは、作業ツリーと突き合わせて決めた**置き場所と手順** (下の「実装方針」)。もう 1 つは、上流からの申し送りの棚卸しである。

## 判断の承認

- **U-1〜U-5 は利用者が 2026-10-29 に承認した** (spec の「決定済みの事項」)。**U-6 (U-4 の true の行を残し、sandbox が有効でないリスクを受け入れる) は 2026-10-31 に design-gate C-001 への回答として承認した**
- **plan の段の実装の選択** (research の P-1〜P-13) は U-1〜U-5 の範囲の中で決めた。spec が plan に預けたのは確認と帯の文言 (spec Assumptions の [ASSUMED]) で、data-model §9 で決めた
- **AGENTS.md の gated 確定事項には当たらない**
  - domain: spec の `domain_selected_by: auto` (`session`) のまま。ただし `requiresAutoModeConfirmation` と main の印の検査はゲートの方針にあたり (session charter Out of scope「権限モードのゲート → `isolation`」)、X-10 では session に暫定で置く。この責務の割り当ては AD-066 Decision 2 に書き、PR のレビューで AD-066 を accepted にすることで人間が承認する (下の Domain Context / design-gate H-001)
  - Constitution: Principle III の改定は利用者が U-3 で承認した。Principle の採否 (足す・外す) ではない
- **新しく利用者の判断を仰いで止める点は無い** (`.needs-input.md` は作っていない)
- **AD-066 を起こした (proposed)** ([docs/decisions/0066-…](../../docs/decisions/0066-auto-permission-mode-with-confirmation.md))。Constitution の改定手順 2 (architecture-reviewer を交えた人間のレビュー) を 026 の PR で受けて accepted にする (RK-01)

## Summary

- **値の集合 (FR-001〜FR-004)**: domain に `SelectablePermissionMode` (許可の 4 値) と述語・包みを足し、起動・実行中の値の検査をすべて付け替える。`assertSafePermissionMode` は消す。`SafePermissionMode` は帯と resume の init の検査のために残す (data-model §1。research P-2)
- **項目 16 (FR-004 / SC-002)**: 許可の包みを `assertSelectablePermissionMode` に替え、昇格の値のリテラルの禁止 (`auto` を含む 3 値) は残す。rule fixture を差し替え 4・新設 1 (data-model §10。research P-3)
- **確認 (FR-005 / FR-006 / FR-012)**: domain の `requiresAutoModeConfirmation(mode, autoModeAllowed)` 1 つで判定し、renderer は `AutoModeConfirmation` (その場の `role="alertdialog"`) を起動の設定と composer の左の群の両方で使う (data-model §6。research P-4 / P-8)
- **main の印の検査 (FR-007 / SC-003)**: IPC の 3 つの口に 3 つ目の引数 `autoModeAcknowledged` を足し、`session-launch-service` の 2 か所 (`startSession` の先頭・`setPermissionMode`) で `auto-mode-unconfirmed` を返す (data-model §2 / §4。contracts C-1〜C-3。research P-6)
- **帯 (FR-008 / SC-004)**: ストアに `chosenPermissionMode` を持ち、観測と選択がともに `auto` なら `AutoModeBanner` (`role="note"`。読み上げは切り替えの 1 回)、それ以外の安全 3 値の外は今の `UnsafeModeBanner` (data-model §5。research P-9)
- **再開 (AD-059 Decision 3)**: init の検査を「安全 3 値、または起動で頼んだ値」に広げ、再開の初期値は `auto` を `default` に戻す (data-model §3.2 / §7。research P-5 / P-10)
- **プリセット (FR-012)**: `schemaVersion` 2 → 3 (data-model §4.3。research P-7)
- **記録 (FR-009〜FR-011)**: AD-066、Constitution Principle III の改定 (1.5.0 → 1.6.0。MINOR)、glossary・session charter・`_overview`・roadmap・prompts・ui-coverage (data-model §8 / §11)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**:
- `@anthropic-ai/claude-agent-sdk` ^0.3.270: `PermissionMode` は `auto` を含み、起動の `permissionMode` と `Query.setPermissionMode` の両方が受ける (research R-01)。SDK の型・オプションは変えず、`allowDangerouslySkipPermissions` は渡さない (P-1)
- 新しい依存は足さない

**Storage**: `presets.json` の `schemaVersion` を 3 に (形は版 2 と同じ。AD-042 の規則)。確認の印は永続化しない

**Testing**:
- Vitest 5 (node / renderer の 2 project。#34 で renderer は環境を共有する) と vitest-axe
- Playwright の E2E (偽の capability。偽のランタイムはすべて `autoModeAllowed: false`)
- Constitution 検証 (`scripts/constitution/check.mjs`) と rule fixtures
- コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)。セッションは WSL と Win32 の両方。確認が要るのは `isAutoModeAllowed` が false のランタイム (Win32Runtime・判定中を含む)

**Project Type**: desktop-app (main / preload / renderer / agents / domain)

**Performance Goals**: 新しいプロセス・IPC の往復を足さない。確認は renderer の中だけで閉じ、main の判定は同期の関数 1 回

**Constraints** (data-model §0):
- `IPC_CHANNELS`・`SessionControl` の種類 (9)・`QUERY_MUTATION_METHODS` (20)・`QUERY_OPTION_KEYS` (16)・`SessionEvent` の種類・`SessionLaunchConfig` のキー (10)・`PresetLaunchConfig` のキー (9) は変えない
- `acceptEdits` / `bypassPermissions` への経路は 0 件のまま
- 実行中に変えた権限モードをプリセット・`lastConfig`・再開の初期値に残さない
- agents に `'auto'` の文字列を書かない (項目 16 の P1)

**Scale/Scope**:
- FR 12 / SC 5 / User Story 1 (主目的に ADR と Constitution の改定を含む。spec の位置づけ)
- 新しい IPC 0 (引数を 3 つの口に 1 つずつ)
- 新設のモジュール 2 つ: renderer の `features/session/AutoModeConfirmation.tsx`・`CenterBanners.tsx` の中の `AutoModeBanner` (新しいファイルにはしない)。domain の関数 5 つを既存の `launch-config.ts` に足す
- 拒否の理由のキー 2 つ (同名 `auto-mode-unconfirmed` を 2 つの集合に)

### レイヤごとの変更 (作業ツリー = 4f23de4 で確かめた。#34 は src を変えていないので research の行番号 (e9dcfb8) のまま)

| レイヤ | ファイル | 変更 | 正本 |
|---|---|---|---|
| domain | `src/domain/session/launch-config.ts` / `.test.ts` | `SelectablePermissionMode`・`SELECTABLE_PERMISSION_MODES`・`isSelectablePermissionMode`・`assertSelectablePermissionMode`・`isAutoPermissionMode`・`requiresAutoModeConfirmation`・`resumeInitialPermissionMode`。`assertSafePermissionMode` を消す。`hasValidBaseAxes` (`:181`) の述語 | data-model §1 |
| domain | `src/domain/session/agent-session.ts` | `LaunchPreflightReason` に `auto-mode-unconfirmed` (`:97-103`)。`LaunchQueryOptions` (`:130`)・`SessionControl` (`:360`)・`AgentSession.setPermissionMode` (`:387`) の型 | §1 / §2 |
| domain | `src/domain/session/live-settings.ts` / `.test.ts` | `LIVE_SETTING_FAILURES` の末尾に `auto-mode-unconfirmed` (11 → 12) | §2 |
| domain | `src/domain/session/launch-resolution.ts` | `LaunchDraft.permissionMode` の型 (`:26`) | §1 |
| domain | `src/domain/capability.ts` / `capability.test.ts` | `launchSession` / `resumeSession` / `setSessionPermissionMode` に 3 つ目の引数 (`:166`, `:179`, `:227`) | contracts C-7 |
| agents | `src/agents/session-core.ts` | decoder (`:557`)・`buildQueryOptions` (`:257`) と注記 (`:142`, `:223`)・型 (`:145`, `:176`) | §3.1 |
| agents | `src/agents/sdk-agent-session.ts` | `decodeLaunchOptions` (`:322`, `:348`)・`buildQueryOptions` の呼び出し (`:890`)・制御シンク (`:797`) と注記 (`:181`)・型の検査 (`:122`)・resume の init の検査 (`:986`) | §3.1 / §3.2 |
| agents | `src/agents/live-signals.ts` | 型 (`:201`, `:246`) | §1 |
| main (app) | `src/main/app/session-launch-service.ts` | 依存 `autoModeAllowed(runtimeId)`。`startSession` の先頭 (`:496` の直後) と `setPermissionMode` (`:620-626`) の印の検査。`launch` / `resume` / `setPermissionMode` の `ack` | §4.2 |
| main (app) | `src/main/app/resume-service.ts` | `ack` を `launchService.resume` に素通し | contracts C-2 |
| main (app) | `src/main/app/validate.ts` / `session-ipc.ts` / `ipc.ts` / `composition-root.ts` | `checkSetPermissionModeArgs` (`:436-443`)・3 つの handler (`:176-200`, `:226-240`, `:398-406`)・wrapper (`:154`, `:158`, `:170`)・`autoModeAllowed` の結線 (`runtimes.snapshot()` + `isAutoModeAllowed`) | §4.1 / §4.2 |
| main (app) | `src/main/app/e2e-capability.ts` | 3 つ目の引数・`autoModeAllowed` (`knownRuntimes`)・偽の起動が `permissionMode` の `meter` を 1 回流す (`:324`) | contracts C-6 |
| main (infra) | `src/main/infra/settings/preset-record.ts` / `preset-store.ts` | `PRESET_SCHEMA_VERSION = 3`・`SUPPORTED_PRESET_SCHEMA_VERSIONS = [1, 2, 3]` (`:27`, `:30`) | §4.3 |
| preload | `src/preload/index.ts` | 3 つの口の引数 | C-7 |
| renderer | `src/renderer/src/test-support/capability.ts` / `app-shell-harness.tsx` | 写しの引数 | C-6 |
| renderer | `features/session/AutoModeConfirmation.tsx` (新設) | その場の `role="alertdialog"`・取り消しに焦点・Escape (外側の Dialog を閉じない) | §6.1 |
| renderer | `features/session/LaunchDialog.tsx` | 選択肢 (`:877-890`)・`autoConfirm` / `autoAckRuntimeId` (消す時点は §6.2)・Provider の確認 (`:1088-1116`) の後に Auto の確認・`LaunchSource` の型 (`:80-97`。`launch` / `resumeSession` に必須の `ack`)・新規の起動 (`:566`) と再開のフォームの送信 (`:563`) の両方で `ack` を載せる | §6.2 / §6.4 |
| renderer | `features/session/LivePane.tsx` | `LaunchDialogContent` / `NewSessionDialog` (`:89-125`) の `onLaunch` / `onResume` の型 (FE-013 が持つ) | §6.4 |
| renderer | `features/session/LivePane.tsx` / `LiveSettingsControls.tsx` | 確認の状態と枠 (`:311-336` の並び)・`onSelectPermissionMode` の差し替え (`:197`, `:210`, `:420`, `:429`)・選択肢と disabled の範囲 (`LiveSettingsControls.tsx:37`, `:210`, `:241`, `:248`, `:272`) (FE-014 が持つ) | §6.3 |
| renderer | `features/session/running-session-store.ts` / `running-session-types.ts` / `useLiveSession.ts` / `running-sessions-view.ts` / `RunningSessionsProvider.tsx` | `chosenPermissionMode`・`launch` / `resume` / `setPermissionMode` の必須の `ack` (`:840`, `:882`, `:1016-1026`)・`RunningSessionsView.launch` / `.resume` の型 (`running-sessions-view.ts:42`, `:47`) と実装 (`RunningSessionsProvider.tsx:81-98`)・`runtimeAutoModeAllowed` (`running-sessions-view.ts:30-35` と `RunningSessionsProvider.tsx:68-74` の隣) | §5.1 / §6.3 / §6.4 / research P-4 |
| renderer | `features/session/resume-action.ts` | 再開の初期値 (`:58`) を `resumeInitialPermissionMode` に通す | §7 |
| renderer | `features/session/labels.ts` | `PERMISSION_MODE_LABELS` (`:435-439`) の型と `auto`・`LAUNCH_REJECT_LABELS`・`LIVE_SETTING_LABELS`・`AUTO_MODE_CONFIRMATION_LABELS` | §9 |
| renderer | `features/shell/CenterBanners.tsx` / `features/shell/labels.ts` | `PermissionModeBanners` (`key={sessionId}`。帯の選び方と常に mount する `AutoModeAnnouncer`)・`AutoModeBanner` (`:53-94` の隣)・`AUTO_MODE_BANNER_LABELS` (`:157` 付近。Auto の帯の隔離の文を含む) | §5.2 / §5.3 / §9 |
| scripts / tests | `scripts/constitution/allowlists.mjs` / `check.mjs`・`tests/rule-fixtures/**`・`expected.mjs` | 包みの名前・文言・fixture | §10 |
| e2e | `e2e/launch-dialog.spec.ts` (`:78-94`)・`e2e/live-session-settings.spec.ts` | Principle III の新しい Verification・実行中の切り替えと取り消し | research P-11 |
| docs | `.specify/memory/constitution.md`・`.specify/templates/plan-template.md:49`・`docs/glossary.md`・`docs/domains/session/charter.md`・`docs/domains/isolation/charter.md`・`docs/domains/_overview.md`・`docs/roadmap.md`・`docs/prompts.md`・`docs/ui-coverage.md` | 改定と記録 | §8 / §11 |

**未確定の技術事項**: なし。実機で確かめる事項 (分類器の判断・`auto` が使えない環境の失敗の出方) は契約を変えない形にしてあり、quickstart V-3 で記録する。

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` v1.5.0 に基づく。**Principle III は本 feature で改定する** (data-model §8.1)。Check は改定後の本文で判定し、改定前の本文との差は ADR と改定手順で扱う。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — N/A: パスを扱わない
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 確認の要否はランタイムの種類ではなく capability (`isAutoModeAllowed`) で分ける。Win32 / WSL の名指しを足さない
- [x] **III. 権限モードは capability に従う** — **改定する (1.5.0 → 1.6.0。MINOR。U-3)**
  - 改定後の要求: `autoModeSafe !== true` のランタイムで `bypassPermissions` を選ばせない。Auto は起動・実行中とも毎回の確認と main の印の検査を挟む
  - 判定は `isAutoModeAllowed` 1 つ (main は記述子から、renderer は DTO の `autoModeAllowed` から。どちらも同じ関数の値)。`=== false` / 生の `autoModeSafe` を使わない (FR-006)。判定中 (`unknown`) は確認を挟む
  - true のランタイムで確認を省くのは spec U-6 (2026-10-31。C-001 への利用者の回答)。true は sandbox を使えるという意味で、Closta は I-3 まで sandbox を有効にしない。Auto の帯の文は true でも隔離されていると読める文にしない (data-model §9)。改定文にも暫定の受け入れとして書く (§8.1)
  - `acceptEdits` / `bypassPermissions` の経路 0 件は項目 16・main・decoder の 3 段で保つ
  - 改定手順 1〜5 は data-model §8.1。手順 2 (人間のレビュー) は PR で受ける (RK-01)
- [x] **IV. 通信は Agent SDK 経由** — SDK の `permissionMode` と `Query.setPermissionMode` に値を渡すだけ。新しい `Query` のメソッドを呼ばない (`QUERY_MUTATION_METHODS` は 20 のまま)
- [x] **V. 長期資格情報を永続化しない** — N/A: プリセットに足すのは権限モードの値だけで、確認の印は保存しない
- [x] **VI. 永続環境を構築・変更しない** — N/A
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — agents の変更は domain の純関数の付け替えと比較 1 つ
- [x] **VIII. 日本語環境で破綻しない** — composer の入力欄と `onKeyDown` に触れない。確認の Enter / Escape は確認の枠のボタンの上だけで扱い、composer の変換中の Enter と関係しない。確認の後は composer の入力へ焦点を戻す

**Standard**

- [x] **IX. main process をブロックしない** — 印の判定は同期の関数 1 回。記述子は既存の `runtimes.snapshot()` から引く
- [x] **X. セッションの正本はアプリ外** — 観測した権限モード (`meters.permissionMode`) を正とし、`chosenPermissionMode` は表示の選び分けにだけ使う。`auto` の利用可否は Claude Code が判断する
- [x] **XI. 垂直スライス** — US-1 を起動の設定と実行中の両方で画面から観測できる。E2E は SC-001 / SC-004、実機は quickstart V-1〜V-5
- [x] **XII. 未表示情報を残さない** — `docs/ui-coverage.md` の `set_permission_mode` / `status` / `meter` / `init` の行に Auto の帯と確認を足す (data-model §11)。項目 21 が ok
- [x] **XIII. assistant-ui の element と design system を優先** — 確認は既存の Provider の確認 (`LaunchDialog.tsx:1088-1116`) と同じ「その場の alertdialog の枠」の形と design system の Button を使う。入れ子の modal (Radix AlertDialog) は焦点の罠が 2 重になるので取らない (research R-08 退けた案 A)。帯は今の `UnsafeModeBanner` の形を写す
- [x] **XIV. Ubiquitous Language** — 新しい語は「Selectable permission mode (許可の 4 値)」と「Auto mode confirmation (Auto の確認)」の 2 つ。既存の語の改め方は data-model §11
- [x] **XV. 多言語規約** — 文言は文言の表 (data-model §9)。権限モードの名前は `PERMISSION_MODE_NAMES` から取り、文に直書きしない (AD-065 Decision 3 / Constitution 1.5.0 の XV の Exceptions)

**Domain charter の整合**

- [x] `session` の In scope (「セッションの起動、…再開」「`SessionLaunchConfig` の解決」「プリセットの保存・適用」。`charter.md:69-72`) に収まる
- [x] Out of scope の「権限モードのゲート → `isolation`」(`:85`) — `requiresAutoModeConfirmation` と main の印の検査は改定後の Principle III の要求そのもので、ゲートの方針にあたる (design-gate H-004)。X-10 では **session に暫定で置き、I-3 で isolation へ移す**と決めた (data-model §1)。暫定を session charter `:85` の注記・isolation charter の In scope / 業務ルール / Journey 2 / KPI・glossary の Domain の行に書き、AD-066 の `affected_domains` に `isolation` を足した (data-model §11)
- [x] 業務ルール `:188-190` (X-4 時点では安全 3 値だけを提示) は本 feature で書き換える対象 (data-model §11)。Principle III の改定と同じ PR で直す

## Domain Context

### Charter reference

- Domain: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- Mission (`:52-58`): 複数フォルダ・複数ランタイムにまたがって存在する Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする
- 本 feature が触れる Scope
  - セッションの起動、再開 (`:69`)。起動・再開の要求に確認の印を載せ、main が検査する
  - `SessionLaunchConfig` の解決 (`:70-71`)。権限モードは独立した軸のまま、値の集合を許可の 4 値に
  - プリセットの保存・適用 (`:72`)。`auto` を保存でき、適用で確認を省かない
- 業務ルール (`:188-190`) の「権限モードの選択肢はランタイムの capability に従う (Principle III。判定は `isolation`)」を、改定後の Principle III に合わせて書き換える (data-model §11)
- 触れる他の domain
  - `isolation` / `runtime`: `isAutoModeAllowed` / `autoModeStatus` を入力に取る (data-model §0)。ゲートの方針 (Auto の確認の判定) は X-10 では session に暫定で置き、I-3 で isolation へ移す (下の `isolation` の行)
  - `ui`: 帯 (`CenterBanners.tsx`) と composer の左の群の描く場所。帯と確認の部品の判定は session の述語 (`isAutoPermissionMode` / `requiresAutoModeConfirmation`) を読む
  - `isolation`: ゲートの持ち主。Auto の確認の判定を X-10 では session に暫定で置く (上の charter の整合)。AD-066 の `affected_domains: [session, ui, isolation]`
- session charter の Related ADRs (`:246` から) に AD-066、Related Specs (`:269` から) に X-10 / 026、frontmatter の `related_adrs` / `related_specs` を完了の PR で足す

### Related ADRs

- [AD-066](../../docs/decisions/0066-auto-permission-mode-with-confirmation.md) — 権限モードの Auto を起動と実行中で選べるようにする (確認と main の印): **proposed** (本 feature で起こした。改定手順 2 を PR で受けて accepted)
- [AD-062](../../docs/decisions/0062-live-session-permission-mode-model-and-rename.md) — 実行中の権限モード・モデル・名前の変更: accepted。Decision 1 (昇格の値への実行中の経路 0 件) を AD-066 が `auto` についてだけ読み替える
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — X-4 の起動設定 (権限モード安全 3 値・`assertSafePermissionMode`): accepted。(a) の allowlist と包みを AD-066 が読み替える。(c) の前方注記 (プリセットの適用で再検証) は、`auto` については起動の時点の確認 (data-model §6.2) で満たす。`acceptEdits` / `bypassPermissions` の分は I-3 のまま
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — 単一の起動プロセスと live stream: accepted。§5 (実行時に権限モードを変えない) を AD-062 / AD-066 が読み替える
- [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) — SDK のメッセージの棚卸しと危険度表 (`auto` = 危険): accepted。表は変えない
- [AD-059](../../docs/decisions/0059-session-resume-query-option-and-conversation-id.md) — 再開 (X-9): accepted。Decision 1 (再開の権限モードは安全 3 値のまま) と Confirmation V-9、Decision 3 (再開の init の検査) を AD-066 Decision 5 が読み替える
- [AD-015](../../docs/decisions/0015-wsl-access-strategy.md) — WSL の取り扱い (§8 の bubblewrap の判定): accepted。Consequences の「判定完了まで危険な権限モードを選択不可」を、`auto` についてだけ AD-066 が読み替える (判定中は確認つき)。`autoModeSafe` が true になる条件 (sandbox が使える) は変えない
- [AD-042](../../docs/decisions/0042-provider-type-refinement-and-d4-lapse.md) — store の `schemaVersion` の規則: accepted。プリセットを版 3 に
- [AD-064](../../docs/decisions/0064-launch-config-additional-directories-limits-and-title.md) — 起動の設定の追加の軸とプリセット版 2: accepted。Decision 4 (版 1 の読み替え) は変えない
- [AD-065](../../docs/decisions/0065-live-model-list-and-claude-code-permission-mode-names.md) — 権限モードの名前 (Claude Code の表記): accepted。Decision 3 の「選べる値は変えない」を AD-066 が読み替える。名前の表の 1 か所と説明を付けない規則は変えない
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter` と権限モードの警告の帯: accepted。Decision 5 を、利用者が選んだ `auto` についてだけ AD-066 Decision 4 が読み替える
- [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) — Constitution の検証経路 (#13 `autoModeSafe` の 3 値): accepted。変えない

### Glossary excerpt

- **autoModeSafe** (`glossary.md:69-77`): 無人実行 (Auto / `bypassPermissions`) を許してよいかの capability。3 値。判定は `isAutoModeAllowed()` (`!== true`)。本 feature で「Auto は false でも確認つきで選べる (AD-066)」を足す
- **SafePermissionMode** (`:990-995`): `default` / `plan` / `dontAsk`。起動・実行中で選べる値ではなくなり、帯の条件の集合になる。新しい語 **Selectable permission mode (許可の 4 値)** を足す
- **Live session setting (実行中の設定の変更)** (`:623-630`): 権限モードは安全 3 値の中の遷移だけ → 許可の 4 値の中、`auto` は確認つき
- **Unsafe permission mode banner (権限モードの警告の帯)** (`:1412-1424`): 安全 3 値の外を観測したときの `role="alert"` の帯。利用者が選んだ `auto` は Auto の帯で、本帯は出さない
- **Launch preflight reason** (`:572-581`): `auto-mode-unconfirmed` を足す
- **SessionLaunchConfig** (`:1111`)・**LaunchInput** (`:587`)・**FailureReason** の `resume-failed` (`:426`): 型名と説明を直す (data-model §11)

## 上流からの申し送り

```text
# 2026-10-31 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
#    rg -n "026-session-live-auto-permission-mode" {docs,.specify,tests,specs}/**/*.{md,mjs,js,yaml,yml}
#    → 4 行 / 3 ファイル (plan を書く前)
# 2) feature ID (025 の plan と同じく、roadmap の申し送りに当てるため足した)
#    rg -n "\bX-10\b" {docs,.specify,tests,specs}/**/*.{md,mjs,js,yaml,yml}
#    → 12 行 / 4 ファイル (plan を書く前)
# 3) 変更するモジュール名を実名リスト方式のルールで
#    rg -n "SafePermissionMode|SelectablePermissionMode|PermissionMode|AutoModeConfirmation|AutoModeBanner|CenterBanners|LaunchDialog|LivePane|LiveSettingsControls|launch-config|preset-record|preset-store|resume-action|running-session-store|session-launch-service|requiresAutoMode|isAutoModeAllowed" \
#       .dependency-cruiser.js eslint.config.mjs scripts/constitution/allowlists.mjs .specify/spec-gate/reviewers.yml
#    → 10 行 (dep-cruiser 2・eslint 0・allowlists 5・reviewers 3)
# 3b) 項目 16 の定数
#    rg -n "PERMISSION_MODE_ESCALATION_VALUES|SANCTIONED_PERMISSION_MODE_WRAPPER" scripts/ tests/ src/ docs/ .specify/
#    → 12 行 (check.mjs 8・allowlists 2・AD-066 2)
# 4) 消す名前 `assertSafePermissionMode` を src/ scripts/ tests/ docs/ .specify/ e2e/ で
#    → 34 行 (src 12・tests 12・scripts 5・docs 5)
#    合計 72 行。全行を下の表で割り当てた
```

### 1) spec_id の 4 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | `docs/roadmap.md:356` (X-10 の行) | 範囲の正本 (起動と実行中の `auto`・Principle III の改定・I-3 に残すもの) | **受ける** — spec FR-001〜FR-012 と Out of Scope が割り当て済み。完了の PR で行に完了の記録を足す (data-model §11) |
| 2 | `docs/decisions/0066-…md:14` | AD-066 の本文から spec へのリンク | **当たらない** — 本 feature が起こした ADR |
| 3〜4 | `specs/026-…/spec.md:2`, `:15` | frontmatter と Feature Branch | **当たらない** — 自身 |

### 2) feature ID (`X-10`) の 12 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 5 | `docs/roadmap.md:356` | #1 と同じ行 | **受ける** (#1) |
| 6 | `docs/roadmap.md:422` (I-3 の行) | `auto` は X-10 に先に出した・I-3 は隔離が分かったランタイムで確認を省くかを判断し直す (今の文)・X-4 からの義務 (昇格モードの capability 連動提示・`scope: 'capability'`) | **当たらない (申し送りの文だけ直す)** — I-3 に残す範囲の記録で、本 feature は受けない (spec Out of Scope)。ただし「隔離が分かったランタイム」の読みを design-gate C-001 / spec U-6 に合わせ、「sandbox を有効にするか、確認を省き続けるかを I-3 で判断し直す」の申し送りを design-gate の修正 (2026-10-31) で書き込んだ (data-model §11)。義務の文は変えない |
| 7〜9 | `specs/026-…/spec.md:25`, `:31`, `:80` | 位置づけ・U-1・FR-011 | **当たらない** — 自身 |
| 10〜15 | `specs/026-…/data-model.md:235-240` | §11 の記録の表 | **当たらない** — 自身 (記録の正本) |
| 16 | `docs/decisions/0066-…md:14` | #2 と同じ行 | **当たらない** (#2) |

### 3) 実名リスト方式のルールの 10 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 17 | `.dependency-cruiser.js:234`, `:254` (`services-not-to-io`。`session-launch-service` を実名で列挙) | I/O をインタフェース経由で受けるクラスに `core` の import を禁じる | **当たらない** — 新しい依存 `autoModeAllowed(runtimeId)` は注入の関数で、`session-launch-service.ts` は import を増やさない (`isAutoModeAllowed` は composition-root で呼ぶ)。新しい service ファイルを作らない |
| 18 | `.specify/spec-gate/reviewers.yml:226`, `:229`, `:230` (ui-coverage の `running-session-store.ts`・`LivePane.tsx` と注記) | 変更で ui-coverage-reviewer を起動する | **当たらない** — 既に入っている。`CenterBanners.tsx` (`features/shell/**/*.tsx`) と `src/agents/**` も既存の glob に当たり、ui-coverage が pr-gate で起動する。`AutoModeConfirmation.tsx` は `features/session/` の新設で glob に当たらないが、D 節 / E 節の行を持たない (確認は Closta の UI で、SDK の emit の表示ではない)。帯の行は `CenterBanners.tsx` 側で見る |
| 19 | `scripts/constitution/allowlists.mjs:481`, `:483` (`QUERY_MUTATION_METHODS` の注記に `assertSafePermissionMode(`) | 項目 16 の注記 | **受ける** — 包みの名前を `assertSelectablePermissionMode(` に (data-model §10) |
| 20 | `allowlists.mjs:487` (`setMcpPermissionModeOverride`) | `QUERY_MUTATION_METHODS` の 1 つ | **当たらない** — 名前の部分一致。本 feature は MCP の権限モードに触れない |
| 21 | `allowlists.mjs:522` (`SANCTIONED_PERMISSION_MODE_WRAPPER`) | 許可の包みの名前 | **受ける** — `'assertSelectablePermissionMode'` に (§10。research P-3) |
| 22 | `allowlists.mjs:574` (`WSL_FREE_DIRECTORIES` の `session-launch-service.ts`) | `wsl.exe` を名指さないファイル | **当たらない** — 印の検査は capability の値だけを見る。`wsl.exe` を名指さない |

`eslint.config.mjs` は 0 件である。新設の `AutoModeConfirmation.tsx` は renderer の features の中で、実名の列 (`PROCESS_SPAWN_MODULES` / `WSL_FREE_DIRECTORIES` / `services-not-to-io` / 手書きの element の番人) の対象ではない。

### 3b) 項目 16 の定数の 12 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 23 | `scripts/constitution/check.mjs:53-54`, `:918` | import と昇格の値のリテラルの走査 | **当たらない** — 3 値のまま (research P-3)。検査の形は変えない |
| 24 | `check.mjs:943`, `:950`, `:956`, `:993`, `:999` | 包みで始まり閉じる検査と違反の文言 | **受ける** — 形は変えず、文言を「許可の 4 値 … (AD-066)」に (data-model §10)。`:950` / `:956` の「(AD-041 (a))」も AD-066 を足す |
| 25 | `allowlists.mjs:515` (`PERMISSION_MODE_ESCALATION_VALUES`) | `['bypassPermissions', 'acceptEdits', 'auto']` | **受ける (注記だけ)** — 値は変えない。注記 (`:509-514`) に「`auto` は許可の 4 値に入るが agents に直書きさせない (AD-066)」 |
| 26 | `allowlists.mjs:522` | #21 と同じ行 | **受ける** (#21) |
| 27 | `docs/decisions/0066-…md:42`, `:61` | Decision 3 と退けた案 | **当たらない** — 本 feature が起こした ADR |

### 4) `assertSafePermissionMode` の 34 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 28 | `src/domain/session/launch-config.ts:37`, `:40` | 定義 | **受ける** — 消して `assertSelectablePermissionMode` を足す (data-model §1) |
| 29 | `src/domain/session/launch-config.test.ts:4`, `:38` | 包みの単体 (`/AD-041/` の文言) | **受ける** — `assertSelectablePermissionMode` の単体に書き換え、文言の照合を AD-066 に。昇格の 2 値と不明な値で throw、4 値で通る |
| 30 | `src/agents/sdk-agent-session.ts:43`, `:181`, `:348`, `:797`, `:890` | import・注記・3 つの呼び出し | **受ける** — data-model §3.1 |
| 31 | `src/agents/session-core.ts:5`, `:223`, `:257` | import・注記・呼び出し | **受ける** — §3.1 |
| 32 | `scripts/constitution/check.mjs:925`, `:985`, `:986` | 項目 16 の注記 | **受ける** — 包みの名前を直す (§10) |
| 33 | `scripts/constitution/allowlists.mjs:483`, `:522` | #19 / #21 と同じ行 | **受ける** (#19 / #21) |
| 34 | `tests/rule-fixtures/a-direct/sdk-permission-mode-unwrapped.ts.fixture:6` | 注記 | **受ける** — 包みの名前の差し替え (§10) |
| 35 | `tests/rule-fixtures/b-equivalent/sdk-permission-mode-wrapper-chained.ts.fixture:3`, `:15` | import と包みの後に連結 | **受ける** — 同上 |
| 36 | `tests/rule-fixtures/b-equivalent/sdk-set-permission-mode-unwrapped.ts.fixture:6` | 注記 | **受ける** — 同上 |
| 37 | `tests/rule-fixtures/b-equivalent/sdk-set-permission-mode-wrapper-escape.ts.fixture:3`, `:8`, `:13` | import・注記・包みの後に `\|\|` | **受ける** — 同上 |
| 38 | `tests/rule-fixtures/expected.mjs:303`, `:362`, `:394`, `:402`, `:930` | 各 fixture の説明と `UNDETECTED_NOTES` | **受ける** — 包みの名前と説明を直し、新設 `sdk-set-permission-mode-escalation-literal` の項を足す (§10) |
| 39 | `docs/glossary.md:992` | SafePermissionMode の Definition | **受ける** — data-model §11 |
| 40 | `docs/decisions/0041-…md:41`, `:43`・`docs/decisions/0062-…md:36` | accepted の ADR の本文 | **当たらない** — accepted の ADR は直さない (AD-031)。AD-066 の「読み替える箇所」に AD-041 (a) と AD-062 Decision 1 を載せてある |
| 41 | `docs/decisions/0066-…md:30` | 読み替えの行 | **当たらない** — 本 feature が起こした ADR |

(#40 は 3 行。4) の合計は src 12 (launch-config 2・test 2・sdk-agent-session 5・session-core 3)・tests 12・scripts 5・docs 5 = 34 行)

## 実装方針

規則の正本は data-model である。ここには、ソースと突き合わせて決めた置き場所と順序だけを書く。

### domain / agents

- **型を先に広げる**: `SelectablePermissionMode` を足してから `assertSafePermissionMode` を消す。消した時点で tsc が残りの使い手 (#28〜#31) を全部示すので、grep で探さない
- **`SafePermissionMode` の使い手を分ける**: 型を広げる所 (data-model §1 の列挙) と残す所 (帯の条件・resume の init の検査・`resumeInitialPermissionMode` の戻り値) を分けて直す。`isSafePermissionMode` を `isSelectablePermissionMode` に機械的に置き換えない (帯が `auto` を見落とす。research R-02 退けた案 A)
- **resume の init の検査** (`sdk-agent-session.ts:986`): 比較は `initRecord?.permissionMode === launchOptions.permissionMode`。`'auto'` を書かない。単体で「`auto` で頼んで `auto` が戻る → 通る」「`default` で頼んで `auto` が戻る → `resume-failed`」「`auto` で頼んで `bypassPermissions` が戻る → `resume-failed`」の 3 つを固定する

### main

- **印の検査は同期で先頭に**: `startSession` の `disposing` の検査の直後、枠の予約と `prepareLaunch` の前。拒否で枠も記録も残らないことを単体で固定する (contracts C-1)
- **`autoModeAllowed` は必須の依存**: 省略可能にすると、結線漏れで「常に true」または「常に false」に倒れる経路ができる。テストの deps の組み立て (既存の helper) に既定値 `() => false` を足す
- **IPC の 3 つ目の引数の数の検査**: `checkSetPermissionModeArgs` は 2 または 3 (contracts C-3)。起動・再開の handler は今の `args.length` の検査に合わせて 3 つ目を許す (handler ごとの今の検査を読んでから直す)

### renderer

- **確認の部品は 1 つ**: `AutoModeConfirmation` は判定をしない (data-model §6.1)。起動の設定と `LivePane` が `requiresAutoModeConfirmation` を呼ぶ
- **`LaunchDialog` の 2 つの確認の順**: 既存の Provider の確認 (`:1088-1116`) の分岐の後に Auto の確認を置く。2 つの確認が同時に枠に出ることは無い
- **`LivePane` の確認の枠**: 承認カード・問いのカードの前 (`:311-336` の並びの先頭)。`liveSettingBlocker` が非 null になったら閉じる処理は `useEffect` で 1 か所
- **帯の読み上げ**: live region と前の値の `useRef` は `AutoModeBanner` ではなく、`key={sessionId}` の `PermissionModeBanners` の中で常に mount する `AutoModeAnnouncer` に置く。ref は mount 時に今の値で初期化し、同じセッションの中の非 `auto` (`null` を含む) → `auto` だけを読む (別のセッションへ切り替えて戻ったときは読まない。data-model §5.3)。#34 で renderer のテストは環境を共有するので、帯の単体は各テストで描き直し、モジュールの状態を持たない
- **選択肢の並び**: 起動の設定と composer の左の群は `SELECTABLE_PERMISSION_MODES` を読む。`'auto'` の文字列を renderer に書かない (比較は `isAutoPermissionMode`。research P-13)

### Constitution の改定

- 本文は data-model §8.1。同じ差分で frontmatter (`:3`, `:5`)・Sync Impact Report (`:9` の前)・Adoption metadata (`:467`)・Statement / Why / Examples / Verification (`:470-480`)・Amendment trail (`:1107` の後)・脚注 (`:1119`) を直す
- `.specify/templates/plan-template.md:49` の III の行も同じ PR で直す

### 実装の順

1. domain (§1 の型と述語・§2 のキー) と単体
2. agents (§3.1 の付け替え・§3.2 の resume の init の検査) と単体
3. Constitution 検証と rule fixture (§10)。ここで項目 16 を緑にしてから先に進む
4. main の app (§4.1 / §4.2)・infra のプリセット (§4.3)・IPC・preload・capability・e2e の capability の写し (contracts C-1〜C-7)
5. renderer の文言 (§9)・ストア (§5.1 / §6.4)・確認の部品 (§6.1)・起動の設定 (§6.2)・composer の左の群 (§6.3)・帯 (§5.2 / §5.3)・再開の初期値 (§7)
6. E2E (`launch-dialog.spec.ts` の Principle III の書き直し・`live-session-settings.spec.ts` の切り替えと取り消し)
7. 記録 (§8 / §11): Constitution・plan-template・AD-066 (PR のレビューの後に accepted)・glossary・session charter・`_overview`・roadmap・prompts・ui-coverage
8. 実機 (quickstart V-1〜V-5)。行えなければ「未実施」と書く。未実施はマージを止めないが、マージは AD-066 が accepted になってから (RK-01)

## 機械強制の変更

- **型**: `SessionLaunchConfig` などの `permissionMode` を `SelectablePermissionMode` に広げ、`assertSafePermissionMode` を消すことで、残りの使い手は tsc が落とす。`sdk-agent-session.ts:122` の型の検査で `SelectablePermissionMode` が SDK の `PermissionMode` の部分集合であることを固定する
- **固定テスト**: `LIVE_SETTING_FAILURES` の並び (12)・`LAUNCH_PREFLIGHT_REASONS` (4)・起動の拒否の理由の合計 (25)・`SELECTABLE_PERMISSION_MODES` の並び・`PRESET_SCHEMA_VERSION` (3)。`IPC_CHANNELS` と `SessionControl` の種類の固定は変わらない
- **単体**
  - domain: §1 の述語 (4 値で通り、昇格の 2 値と不明で落ちる)・`requiresAutoModeConfirmation` の表 (`auto` × true / false、安全 3 値 × true / false)・`resumeInitialPermissionMode`
  - agents: decoder と制御シンクが昇格の 2 値を拒否し SDK を呼ばない・resume の init の 3 つ (上)
  - main: SC-002 / SC-003 (起動・再開・実行中 × 印あり / なし / 型の違う値 × 隔離あり / なし / ランタイム不明)。拒否で `prepareLaunch` / 制御が呼ばれない
  - infra: 版 1 / 2 / 3 の読み込み・`auto` の版 3 の往復・版 4 の `schema-version-unknown`
  - renderer: 確認の出る・出ない (SC-001 の 2 操作 / 1 操作)・取り消しで何も送らない・`liveSettingBlocker` で閉じる・`chosenPermissionMode` の遷移 (§5.1)・帯の選び方の表 (§5.2)・読み上げの 1 回 (同じセッションの非 `auto` → `auto` だけ。セッションの切り替えでは読まない)・プリセットの適用の後の起動で確認が出る (前に承諾していても)・再開のフォームの `ack`・再開の初期値
- **component**: 確認の枠 (焦点が取り消しにある・Escape で取り消して外側の Dialog を閉じない・vitest-axe の違反 0)・Auto の帯 (`role="note"`)
- **E2E**: `launch-dialog.spec.ts` の Principle III (4 つ・昇格の 2 値が無い・Auto で確認が出て取り消すと前の値)・Auto で起動して帯が出る (SC-004)・`live-session-settings.spec.ts` で `default` → Auto (承諾で `set-permission-mode` が流れる・取り消しで流れない)
- **Constitution 検証**: 項目 16 (新しい包みの名前で ok・新設 fixture が発火)・項目 21 (ui-coverage の書式)

## ADR

- **AD-066 を起こした (proposed)。** 中身は 6 つの Decision で、許可の 4 値 (1)・確認と main の印 (2)・項目 16 (3)・Auto の帯 (4)・再開 (5)・プリセットの版 (6) である。理由: spec FR-009 が求めた ADR で、Principle III の改定の手順 1 に当たる
- **読み替え**: Constitution Principle III・AD-062 Decision 1・AD-036 §5 / 005 SC-006(a)・AD-041 (a)・AD-041 (c) の前方注記・AD-020 の危険度表・AD-059 Decision 1 / Confirmation V-9・AD-059 Decision 3・AD-015 Consequences・AD-042・AD-062 の `LIVE_SETTING_FAILURES`・AD-065 Decision 3・AD-047 Decision 5 の 13 か所 (AD-066 の「読み替える箇所」)。accepted の ADR の本文は直さない (AD-031)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 改定手順 2 (人間のレビュー) で利用者が Principle III の改定か AD-066 の形を覆す | AD-066 は proposed のまま PR を出し、レビューで accepted にする。**AD-066 が accepted になり、改定手順 2 のレビューの実施日が Sync Impact Report に書かれるまでマージしない** (spec FR-010。夜間の規則でもこの PR はマージしない。夜間の規則でマージしてよいとするなら、それは利用者の判断で、FR-010 を変える)。マージの前の確認は SH-012。Constitution の差分と、それに依る値の集合の変更は分けずに同じ PR に含める (Constitution を正とするので、値の集合を改定より先に main に入れない)。覆ったときは design-gate の結果を捨て、`/cl-design --from plan` から回し直す |
| RK-02 | 利用者のアカウント・モデル・設定 (`disableAutoMode`) で `auto` が使えない | Closta は事前に判定しない (spec Assumptions)。起動の失敗・`control-result` の `rejected` の今の表示に出る。実行中の失敗では `chosenPermissionMode` を戻し、帯は出ない (data-model §5.1)。V-3 で記録する |
| RK-03 | Constitution の版が他の PR (O-12 が送った Principle XII の改定) と重なる | 後にマージする方が次の MINOR (1.7.0) に振り直す。Amendment trail の行の順で読む (research P-12) |
| RK-04 | 実行中の切り替えで SDK は `auto` を適用したのに IPC の結果が期限切れになる (`control-result` の timeout) | `chosenPermissionMode` は送る前の値に戻り、観測は `auto` なので今の `UnsafeModeBanner` (原因を断定しない) が出る。利用者が選んだ文言にはならないが、状態は正しく警告される。023 の期限切れの扱いは変えない |
| RK-05 | 分類器が判断しない操作は `canUseTool` に来て承認カードが出る (research R-01) | 仕様どおり。SC-005 は「分類器が判断した操作は承認カードを出さずに」と読む (quickstart V-3)。確認の文 (data-model §9) も「分類器が許可した操作は」と書き、承認カードが 0 になるとは書かない |
| RK-06 | `auto` を保存したプリセットの後に古い版の Closta に戻すと、プリセットのファイル全体を読めない | AD-042 の規則どおりで、誤読より安全側 (AD-066 Consequences)。PR に書く |
| RK-07 | E2E の偽のランタイムに `autoModeAllowed` が true のものが無く、1 操作 (確認なし) を E2E で確かめられない | renderer の単体で確かめる (research P-11)。実機は V-5 (行えれば) |
| RK-08 | **受け入れたリスク** (spec U-6 / design-gate C-001): `isAutoModeAllowed` が true (bubblewrap のある WSL など) のランタイムでは確認なしで `auto` になるが、Closta は sandbox を有効にしていないので、そのセッションは隔離されずにディストロ (と `/mnt/c` から見えるホストのファイル) でそのまま動く | 利用者が 2026-10-31 に承知のうえで採った。手当ては文言で、Auto の帯の隔離の文 (data-model §9 の `autoModeIsolation`) は `allowed` でも「このセッションは隔離されていません」と書く。Constitution の改定文 (§8.1) と AD-066 に暫定の受け入れとして書き、roadmap の I-3 の行に「sandbox を有効にするか、確認を省き続けるかを判断し直す」を申し送る (§11) |

## Project Structure

### Documentation (this feature)

```text
specs/026-session-live-auto-permission-mode/
├── spec.md                                # status を planning に
├── plan.md                                # 本ファイル
├── research.md                            # Phase 0 (R-01〜R-13。P-1〜P-13)
├── data-model.md                          # Phase 1 (§0〜§11。規則の正本)
├── contracts/
│   └── ipc-auto-permission-mode.md        # Phase 1 (C-1〜C-7)
├── quickstart.md                          # Phase 1 (V-0〜V-5)
├── checklists/requirements.md
└── tasks.md                               # Phase 2 (/cl-tasks)
docs/decisions/0066-auto-permission-mode-with-confirmation.md   # proposed (PR のレビューで accepted)
```

### Source Code (repository root)

```text
src/domain/session/{launch-config.ts, agent-session.ts, live-settings.ts, launch-resolution.ts}
src/domain/capability.ts
src/agents/{session-core.ts, sdk-agent-session.ts, live-signals.ts}
src/main/app/{session-launch-service.ts, resume-service.ts, validate.ts, session-ipc.ts, ipc.ts, composition-root.ts, e2e-capability.ts}
src/main/infra/settings/{preset-record.ts, preset-store.ts}
src/preload/index.ts
src/renderer/src/test-support/{capability.ts, app-shell-harness.tsx}
src/renderer/src/features/session/
├── AutoModeConfirmation.tsx       # 新設
├── LaunchDialog.tsx / LivePane.tsx / LiveSettingsControls.tsx / labels.ts
├── running-session-store.ts / running-session-types.ts / useLiveSession.ts / running-sessions-view.ts
└── resume-action.ts
src/renderer/src/features/shell/{CenterBanners.tsx, labels.ts}
scripts/constitution/{allowlists.mjs, check.mjs}
tests/rule-fixtures/{a-direct, b-equivalent, expected.mjs}
e2e/{launch-dialog.spec.ts, live-session-settings.spec.ts}
.specify/memory/constitution.md
.specify/templates/plan-template.md
docs/{glossary.md, domains/session/charter.md, domains/_overview.md, roadmap.md, prompts.md, ui-coverage.md}
```

**Structure Decision**: 既存のレイヤ (domain / agents / main の app と infra / renderer) に置き、新しいディレクトリは作らない。新しいファイルは `AutoModeConfirmation.tsx` と rule fixture 1 つだけ。

## 設計後の見直し (Constitution Check の再確認)

- **025 / 024 のマージの上に載せ直した (2026-10-30)**: 初版 (2026-10-29) は main 7f6ef94 と突き合わせた。025 (AD-065) で実行中の選択が composer の左の群へ移り、名前が Claude Code の表記 (`Auto`) になった。024 (AD-064) でプリセットが版 2 になった。research の冒頭の 4 点 (置き場所・名前・プリセットの版 2 → 3・Constitution 1.5.0 → 1.6.0) を直し、U-1〜U-5 と P-1〜P-6・P-9〜P-11 の中身は変えていない。spec の位置づけの段落もこれに合わせてある
- **再開の初期値 (spec Edge Cases の 5 つ目)**: spec は「再開の初期値は起動の既定 (今の規則のまま)」とするが、今の規則は稼働中の行の再開では `config.permissionMode` を写す (`resume-action.ts:58`)。spec の意図 (前のセッションが `auto` でも初期値は既定) を、稼働中の行にも当てて `resumeInitialPermissionMode` で満たす (research P-10)。spec の文言は意図と一致しているので直さない
- **spec の Assumptions の [ASSUMED]**: 確認と帯の文言は data-model §9 で決めた (UI ラベルのポジティブリスト)
- **SC-005 の読み方**: 分類器が判断しない操作は承認カードに来る (research R-01)。SC-005 は「分類器が判断した操作は承認カードを出さずに」と読む (RK-05)
- **確かめた判断**: Principle III (改定後の本文で判定・単一の判定点)・II (ランタイムの種類で分けない)・VIII (composer の入力欄に触れない)・XIII (既存の確認の形を写す) の判断を上の Check に書いた
- **違反**: 0 件 (Principle III は改定で扱い、違反として残さない)。Complexity Tracking は空

## Complexity Tracking

なし
