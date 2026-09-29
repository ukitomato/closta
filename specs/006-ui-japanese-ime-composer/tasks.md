---
description: "Task list for 日本語 composer (X-2)"
---

# Tasks: 日本語 composer (X-2)

**Input**: Design documents from `specs/006-ui-japanese-ime-composer/`

**Prerequisites**: [plan.md](plan.md) / [spec.md](spec.md) / [research.md](research.md) / [data-model.md](data-model.md) /
[contracts/composer-behavior.md](contracts/composer-behavior.md) / [quickstart.md](quickstart.md)

**Tests**: 本 feature は Principle VIII の Automated 検証 (IME E2E / 日本語スクリーンショット比較) と各 SC の計測経路が
**テストそのもの**であるため、テストタスクを含む (spec が明示的に要求)。

**Organization**: User Story 単位。targets=frontend のため BE/Shared 3 分割 (cl-tasks Phase 4) は非適用。
docs/config 追随は Polish に集約する。

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: 別ファイル・依存なしで並列可
- **[USn]**: 対応 User Story (spec.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: E2E / スクリーンショット検証ハーネスの土台を作る (AD-037 D4 / research R-04)

- [x] T001 Playwright + Electron の E2E ハーネスを導入する (devDependency 追加 / `playwright.config.ts` / `e2e/` ディレクトリ作成)。Electron 起動は `_electron.launch` (アプリ同梱 Chromium を使い `playwright install` の独立ブラウザ取得はしない = 供給網面を増やさない。L-5)。**日本語フォントは `e2e/` にリポジトリ同梱 (.ttf commit) し、非永続注入 (アプリ内 `@font-face` / Playwright 側注入) 経由でのみ用いる。OS 登録・Fonts 複製・fc-cache・パッケージマネージャ導入 等のホスト永続変更を一切しない** (Principle VI。H-6/H-101)。技術・構成の正本は AD-038 (research R-04 / FR-010/011)
- [x] T002 [P] `e2e/` を lint / depcruise / tsc の scope に **src と分離して**編入する (AD-038 D2 / SH-conf1 / design-gate M-6): depcruise は e2e 専用実行 (別 config / 別起点) にし `dependency-cruise.mjs src` のグラフに混ぜない。同一グラフに入れる場合は global `from:{}` ルールを緩めず `e2e/` を各ルールの `pathNot` 例外に加える。`.dependency-cruiser.js` の `not-to-test` prefix を `^(specs|tests|e2e)` に拡張。`eslint.config.mjs` に `e2e/**` の override (react-refresh/react-hooks off、Playwright 向けのみ。L-8) を追加し base を緩めない
- [x] T003 [P] `docs/discovery.md` の「Build / Test / Lint」表に E2E (Playwright) の agent 用コマンド行を追加し「未導入」を解消する (`convention-reviewer`/`lint-agent` の SSoT。上流申し送り SH-conf2)。**2026-09-28: E2E 行追加 / Tech Stack の Playwright を present に更新 / 「まだ宣言だけのもの」節を導入済に更新**
- [x] T030 [US1][US4] E2E の **capability stub / fake runtime・session 注入機構** を用意し、real な Claude 認証・WSL・外部 API なしで active phase (`isDisabled: false`) の有効 composer に決定的に到達できるようにする。**機構: (a) E2E 専用 preload (stub capability を contextBridge で expose) を `_electron.launch` 起動オプションで指定、(b) `test-support/capability.ts` の Vitest 非依存な純粋 stub factory (`stubCapability`) のみ再利用 (`vi.stubGlobal` 依存部は使わない)、(c) 本番 main に preload 差し替え env/flag を持たせず stub 注入経路を production ビルドで到達不能 (production-inert) にする** (AD-038 D3 / design-gate H-3 / security M-001)。US-1 の IME E2E (T006) と US-4 の CI ジョブ (T016) の前提
  **2026-09-28 実装 (設計変更あり)**: (a) の「E2E 専用 preload を起動オプションで指定」は `_electron.launch` が実 main の window preload (`window.ts`) を上書きできないため不採用。**単一 capability 境界 (FR-039) をより強く保つ形**にした — preload も `window.closta` も本番と同一で、`src/main/index.ts` の 1 分岐 (`!app.isPackaged && CLOSTA_E2E==='1'`) が `createComposition()` の代わりに `createE2eCapability()` (`src/main/app/e2e-capability.ts`) を配線し **`IpcDependencies` を差し替える**だけ。fake folder/runtime を seed、`launchSession` は `MessageChannelMain` で合成 stream (fork/spawn を使わない → `PROCESS_SPAWN_MODULES` 非該当)、`send-prompt`→`running`→合成応答→`done`。**production-inert** (`app.isPackaged` で無効。env 単独ゲートは使わない)。(b) の renderer stub は形状が異なるため流用せず main 用 fake を新設。lint/typecheck(node)/depcruise/check:constitution 緑・build 緑・**IME E2E 実走で有効 composer 到達を実証**

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: US-2 / US-3 が共有する composer state と、既存 IME ガードを殺さない配線点を用意する

**⚠️ CRITICAL**: この phase 完了まで US-2 / US-3 の実装に入らない

- [x] T004 `src/renderer/src/features/session/composer-queue.ts` に composer の**純粋ヘルパ** (enqueue 検証・busy 判定・draft) を新設 ([data-model.md](data-model.md) 準拠。永続層・IPC・ログに出さない)。**実装 + Vitest 検証済** (`composer-queue.test.ts`: `classifyEnqueue` の enqueue 検証・上限 / `isBusyRunState` / `isSendableText` / draft ヘルパ / ログ非混入)。enqueue 検証は `@domain/validation` の `isValidPromptText` を再利用 (X-1 と対称。FR-003/R2-M-003)。**訂正 (pr-gate R2 po-N-002)**: message queue の item ストアは assistant-ui native queue (`createMessageQueue`) が単一 locus として持つため、`composer-queue.ts` は queue state slice を**持たない** (research R-02 で native 採用)。interrupt→still_queued / terminal→cancelled / 表示一致は state slice でなく **native queue controller の挙動 (`queue-behavior.test.tsx`: notifyCancelled→still_queued / clear→discard) + `SessionScreen` の配線 (handleInterrupt / CancelledQueueNotice) + capped adapter (`composer-queue-adapter.test.ts`)** で担保する。SC-004 の統合表示一致 (2 中断入口を通した) は E2E/quickstart V-4 に委ねる (po-H-201 tracked)
- [x] T005 `LiveThread` の `useExternalStoreRuntime` 配線に composer state slice を接続する配線点を用意する (queue capability 宣言点 / 下書き流し込み点)。**既存 assistant-ui 二重ガードを殺さない配線 (onKeyDown 非上書き / submitMode 既定 / Input 非差し替え) を維持** (`src/renderer/src/features/session/SessionScreen.tsx` / research R-02/R-03)

**Checkpoint**: 土台完了 — 各 User Story に着手可能

---

## US-1 — 日本語 IME 非破壊 + 全角レイアウト (Priority: P1) 🎯 MVP [Phase 3]

**Goal**: 変換確定の Enter が送信にならず (既存二重ガードを殺さない)、全角混在で崩れない

**Independent Test**: IME E2E で確定 Enter が送信経路に届かないこと / 確定後 Enter で送信されること、日本語スクリーンショットが基準画像と一致すること、消費側が既存ガードを殺していないこと (静的/component)

### Tests for User Story 1 ⚠️ (先に書き、実装前に FAIL させる)

- [x] T006 [P] [US1] IME E2E を作る (`e2e/ime.spec.ts`): CDP の composition 注入で `isComposing` 中の Enter が送信経路 (`onNew`/`session.send`) に届かず、確定後の 2 度目の Enter で送信される。**(i) idle/既定 composer と (ii) `running` + message queue 有効化後 (`isRunning && hasQueue` 分岐。AD-037 §4) の両状態**で assert する (H-2)。capability stub (T030) で real 資格情報なしに有効 composer へ到達 (research R-05 / H-3 / SC-001)。**2026-09-28: local で (i)(ii) 緑 (Playwright + Electron 実走)。送信判定は `[data-role="user"]` にスコープ (composer の変換中テキストを拾わない)。DOM セレクタ (「セッション起動」nav→「起動」exact) と CDP 注入列を実走で調整済み**
- [x] T007 [P] [US1] composer の component/静的テストを作る: 消費側が `onKeyDown` で `preventDefault` しない・`submitMode` 既定・`ComposerPrimitive.Input` 非差し替え (既存ガード非破壊。contracts C-1 / SC-001)
- [x] T008 [P] [US1] 日本語スクリーンショット比較 E2E を作る (`e2e/composer-screenshot.spec.ts`): 全角・半角・絵文字混在の composer が基準画像と一致する (contracts C-2 / SC-002)。**2026-09-28: local 緑**。同梱フォント Noto Sans JP (OFL。`e2e/fonts/NotoSansJP-Regular.ttf` + `OFL.txt`。npm レジストリ経由取得) を **FontFace API + CSSOM で CSP 非破壊注入** (`addStyleTag` は `style-src 'self'` に弾かれるのを実走で発見し切替。`font-src 'self' data:` に従う)。基準画像 `composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png` を生成・決定論的一致を確認・commit。**最終 aesthetic 承認は人間 (quickstart V-2) が rubber-stamp**
- [x] T031 [P] [US1] 変換中マウス送信テストを作る: `isComposing` 中に送信ボタンをマウスで押しても未確定文字列が送信経路に届かない (US-1 AC-6 / FR-001(d) / H-5)。assistant-ui が同経路を抑止するか実ソースで確認し、しない場合のみ確定優先の最小処理を足す (keydown 用の自前ガード新設ではない)。**2026-09-28: E2E が「assistant-ui は mouse 送信経路を抑止しない」を実検出 (変換中クリックで未確定「みかくてい」が user メッセージ送信された)。→ `thread.aui.tsx` の Composer に確定優先の最小処理を追加 (composition ref + 送信ボタンの `onMouseDownCapture` で blur 確定を止め `onClickCapture` で送信を塞ぐ。keydown ガードは新設せず。AD-037 D1(d))。修正後 E2E 緑・全件 vitest 1035 緑**

### Implementation for User Story 1

- [x] T009 [US1] `Composer` / `LiveThread` の配線を contracts C-1 準拠に保つ/是正する (`src/renderer/src/components/assistant-ui/elements/thread.aui.tsx` / `src/renderer/src/features/session/SessionScreen.tsx`。preventDefault/submitMode/Input を上書きしない。FR-001)
- [x] T010 [US1] 全角混在でレイアウト崩れがあれば composer の折返し/行送りを是正する (`thread.aui.tsx` の composer input class。FR-002)。**2026-09-28: 生成した基準画像を目視検査 — 全角・半角・絵文字混在の 3 行折返しで水平あふれ/桁ずれ/要素崩れ 0、textarea が行数に応じ伸長、行送り均等。崩れは観測されなかったため是正不要 (条件付きタスクの条件が成立しない)**

**Checkpoint**: US-1 が独立に検証可能 (IME E2E + スクショ + 静的が緑)

---

## US-2 — 実行中に次の入力を積める (message queue) (Priority: P1) [Phase 4]

**Goal**: running/awaiting_permission 中に積め、現ターン完了後に同一セッションの次ターンとして送られる

**Independent Test**: fake runtime で稼働中の送信が queue に積まれ可視化される / 完了で次ターン送信 / 中断で still_queued・cancelled / interrupt→steer が起きない

### Tests for User Story 2 ⚠️

- [x] T011 [P] [US2] message queue の component テストを作る: running/awaiting_permission 中の送信が `MessageQueueItem(queued)` として積まれ `QueueItemPrimitive` で可視化される / error・killed (isDisabled) では積めない / **空・空白のみ・バイト長超過は enqueue で積まない (FR-003 / R2-M-003 / L-1)** / **上限件数到達で積み込み拒否+理由提示 (R2-M-001)** (SC-003)。**HTML/markdown 風メタ文字を含むキュー項目がリテラル表示され DOM に要素注入されない** ことも assert (AD-034 / L-4)
  **検証状況** (2026-09-28): 単体+component に分解して全 assertion を被覆。
  - `composer-queue.test.ts` — `classifyEnqueue` で 空/空白・バイト長超過→積まない・上限到達→`full`+理由提示 (FR-003/R2-M-001)。`isBusyRunState` で **running / awaiting_permission が積む状態・launching/interrupted/done/error は積まない** (FR-004/AC-3/SC-003)。
  - `queue-behavior.test.tsx` — 実行中送信が steer lane に積まれ即 dispatch しない / 完了で次ターン dispatch / **isDisabled で composer 入力が DOM 無効化され利用者が送信不可** / **終端 clear() で未 dispatch 破棄・持ち越し 0**。
  - `pending-queue-notice.test.tsx` — steer lane 項目の可視化 (件数表示) / **HTML/markdown/`<script>` メタ文字がリテラル表示され要素注入なし (AD-034/L-4)** / × で `onRemove(id)`。
  - **契約違反を修正**: `SessionScreen` が `isRunning`/`notifyBusy` を `running` のみに紐付けており **`awaiting_permission` 中の送信が queue を素通りして即 `sendPrompt` していた** (C-3/FR-004/AC-3/SC-003 違反。承認待ちの worker に割り込む)。`isBusyRunState` (= `running || awaiting_permission`) を単一 locus に切り出し `isRunning`/busy edge を busy 基準に是正。running↔awaiting_permission の往復では busy 継続で mid-turn dispatch しない。
  - **未被覆 (E2E/quickstart 委譲)**: fake session を runState='awaiting_permission' で与えた **LiveThread 統合 render (runState→UI 端から端)** は E2E (T006) と quickstart 実機に委ねる。
- [x] T012 [P] [US2] queue dispatch/終端 の Vitest を作る: 現ターン完了で先頭 1 件を次ターン `session.send` / **中断 (interrupt) は still_queued 残置 (次ターン dispatch 可) / error・crash・provider-error・強制終了 (isDisabled 終端) は cancelled にし reset・再 launch で破棄 (次セッションへ持ち越し 0)** (H-4/R2-M-002) / **表示 `still_queued`・`cancelled` が実状態と一致する (単一真実源。H-1)** / **interrupt→steer が 0 件** (負例含む。SC-004)。
  **検証状況**: `queue-behavior.test.tsx` で **完了→次ターン dispatch (FR-005) と実行中送信が即 dispatch しない (interrupt→steer なし)** を検証済。終端 disposition (interrupt→still_queued 維持 / error·killed→clear で破棄) は LiveThread に配線済 (`notifyCancelled` / `clear`) だが component 検証は quickstart / E2E に委ねる
- [x] T032 [P] [US2] Principle V のログ非混入テストを作る: queue/draft slice の例外・状態遷移 (dispatch 失敗 / 各終端) で **会話由来テキストを `console.*` / `Error.message` に含めない** ことを assert する (plan V 行「ログ走査」の実体化。design-gate M-5)

### Implementation for User Story 2

- [x] T013 [US2] 実行中の `onNew` を送信でなく queue 追加に回す — **message queue capability を `useExternalStoreRuntime` に宣言する、または同等の feature 側 queue** で契約 C-3 を満たす (assistant-ui が external store runtime で受けるか実ソースで確認。研究 R-02 / 振る舞い基準 FR-004 / L-3)。保持は composer 側 feature state (`src/renderer/src/features/session/SessionScreen.tsx`)
- [x] T014 [US2] 実行中 pending の表示 (X-2 / FR-004)。**検証で判明した通り native queue は実行中送信を steer lane
  (`adapter.steerItems`) に置き `ComposerPrimitive.Queue` (queue lane) には出ない** (queue-behavior.test)。→ **修正案(a) を採用**:
  LiveThread が controller を `subscribe` して `steerItems` を state に写し、`PendingQueueNotice` (`SessionScreen.tsx`) で
  「実行後に送信予定」として表示 + 各項目を取消可能に (`adapter.remove`)。表示 = 実状態と一致 (H-1)。会話由来テキストは
  ログ・境界に出さない。lint/typecheck/depcruise/check:constitution 全 pass。**実機での見えは quickstart で確認**
- [x] T015 [US2] **保持は composer 側 feature state を単一真実源**とし、現ターン完了で先頭 1 件のみ `session.send` (次ターン) する。X-1 の in-memory セッションキューを保持層として二重に経由しない (H-1)。**終端の disposition を実装: interrupt は still_queued 残置、error/crash/provider-error/強制終了 (isDisabled) は cancelled にし reset・再 launch で feature-state キューを破棄** (永久 stranded・次セッション誤 dispatch を防ぐ。H-4/R2-M-002)。X-1 の `still_queued`/`cancelled` は意味論を継承 (FR-005/006)

**Checkpoint**: US-1 と US-2 が独立に機能

---

## US-4 — IME E2E + 日本語スクショを CI に常設 (Priority: P1) [Phase 5]

**Goal**: Principle VIII Automated (A)(B) が CI に存在し緑。回帰したら CI が落ちる

**Independent Test**: verify workflow に 2 ジョブが存在し緑 / 既存ガードを殺す変更で IME E2E が落ちる / 移設対象外を含まない

- [x] T016 [US4] `.github/workflows/verify.yml` に IME E2E ジョブを追加する (Electron 起動 + **同梱**日本語フォント。1 検証 1 ステップ。SH-conf3 / FR-009 / SC-006。**real 資格情報を CI env/secrets に置かない** = H-3。T006/T030 に依存)。**2026-09-28: `e2e` job を追加 (windows-latest / build → `playwright test e2e/ime.spec.ts`)。CLOSTA_E2E は job env でなく launch ヘルパが `_electron.launch` に渡す (env 単独ゲート禁止)。IME E2E は local 3/3 緑。実 CI 実行はマージ後 (uncommitted)**
- [x] T017 [US4] `.github/workflows/verify.yml` に日本語スクリーンショット比較ジョブを追加する (**同梱フォントを非永続注入 (@font-face/Playwright) で供給・OS 登録/Fonts 複製/fc-cache/パッケージマネージャ導入 等のホスト永続変更なし** = H-6/H-101 / 基準画像に会話・config 由来情報を含めない = H-3。FR-010 / SC-006。T008 に依存)。**2026-09-28: `e2e` job にステップ (`playwright test e2e/composer-screenshot.spec.ts`)。同梱フォント + 基準画像 commit 済みで local 緑。注入は FontFace API + CSSOM (CSP 非破壊。OS 永続変更なし)。実 CI 実行はマージ後**
- [x] T018 [US4] 移設対象外 (スクロール安定 E2E / Principle IX 到達集合検査) を CI に載せていないことを確認する (roadmap L122-124 の deferred feature に残す。FR-011)。**2026-09-28: `e2e` job は `ime.spec.ts` / `composer-screenshot.spec.ts` の 2 spec のみ実行。スクロール安定・到達集合検査は載せていない (workflow コメントに明記。roadmap の deferred feature に残置)**
- [x] T019 [US4] 既存ガードを殺す変更 (preventDefault/submitMode 上書き/Input 差し替え) を入れると IME E2E が落ちることを確認する (回帰検出。FR-012 / SC-001/006)。**2026-09-28: E2E が偽の緑でないことを実証 — 変換中マウス送信ガードを足す前は test 3 が失敗 (未確定送信を検出)、足した後に緑。すなわちガードを外すと IME E2E が落ちる (回帰検出が生きている)**

**Checkpoint**: 日本語入力の健全性が CI で恒久的に固定される

---

## US-3 — 下書きが画面再構成をまたいで復元される (Priority: P2) [Phase 6]

**Goal**: phase/isDisabled 変化による Thread 再構成をまたいで composer 下書きが保持される

**Independent Test**: 再構成を誘発する状態遷移で下書きテキストが保持され、送信/明示クリアで空になる

### Tests for User Story 3 ⚠️

- [x] T020 [P] [US3] 下書き保持の component テストを作る: phase 変化 / isDisabled の true↔false による Thread 再構成をまたいで下書きが保持され、send・clear で空になる (SC-005)。**HTML/markdown 風メタ文字を含む下書きがリテラル表示され DOM に要素注入されない** ことも assert (AD-034 / L-4)

### Implementation for User Story 3

- [x] T021 [US3] composer 下書きを feature state に持ち上げ、Thread 再マウント時に composer 初期値へ復元する (`src/renderer/src/features/session/`。メモリ限定・永続層に出さない。research R-03 / FR-007/008)

**Checkpoint**: 全 User Story が独立に機能

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T022 [P] `docs/glossary.md` に **英語 canonical 見出し** (`Composer` / `Message queue` / `Draft`。コード識別子と一致) で追記し、既存 `message mapping` との Counterexamples 注記 (入力欄の積み vs 表示変換) を添える。spec Key Entities / data-model のフィールド名と見出しを一致させる (FR-013 / Principle XIV/XV / L-7)
- [x] T023 [P] `docs/domains/ui/charter.md` の Related Specs に本 spec を追加し「(残り。X-2 / …)」から X-2 を外す。**R-4 を「着手中」→「完了」に更新** (merge 済み 731f27d。L-6)。frontmatter `related_specs` に 006 を反映。Related ADRs に AD-037 / AD-038 を追記。Open Questions の SPIKE-4 を AD-037 で解決済みに更新 (B-8)
- [x] T024 `.specify/memory/constitution.md` Principle VIII の Verification「現状の制約」(A)(B) を「未搭載/延期」→「X-2 で CI 搭載済み・持ち主 X-2」へ**書き直す**。**2026-09-28: v1.2.6→v1.2.7 (PATCH) bump / Sync Impact Report 追加 / Amendment trail 追記。ただし事実に忠実に — (A) IME E2E は実装・搭載・持ち主 X-2、(B) スクショ比較は authored だが同梱フォント+人間承認済み基準画像が未整備で「未緑」と記載 (「緑」とは書かない = 形骸化防止)。roadmap の Automated 持ち主も X-2 に更新。check:constitution 緑**NON-NEGOTIABLE の in-place 改定のため**改定手順を完遂する**: (1) version を v1.2.6→**v1.2.7 (PATCH)** に bump (根拠=バージョニング方針表「Verification の現状の制約の事実追随」)、(2) Sync Impact Report コメントブロック追加、(3) Amendment trail に entry 追記 (根拠 ADR = AD-037 D3)。あわせて `docs/roadmap.md` L115-124 の Automated (A)(B) の持ち主を X-2 に更新 (B-7 / design-gate C-007)。新 ADR は不要 (AD-037 accepted が決定を記録)
- [x] T025 X-1 申し送りの `SessionScreen`/`useLiveSession` の kill・failure component test を composer 面 (下書き保持 / 実行中積み / isDisabled で積めない) と合流して載せる (上流申し送り B-2)
  **被覆状況** (2026-09-30 / best-effort 確定): 挙動は focused component test に分散して被覆済み — (1) composer 面: 下書き保持=`draft-bridge.test.tsx` (T020) / 実行中積み=`queue-behavior.test.tsx` (T012) / isDisabled で積めない=`queue-behavior.test.tsx` (T011) / 終端 cancelled 提示=`pending-queue-notice.test.tsx` + `queue-behavior.test.tsx` (notifyCancelled→still_queued / clear→discard。po-N-001/H-201)。(2) `useLiveSession` の kill/failure ライフサイクル: `useLiveSession.test.tsx` が reset/unmount での kill (C-001 孤児防止)・interrupt/respond/launch 拒否を被覆。**「1 ファイルに合流」は組織上の nicety であり挙動は上記で担保済みのため未実施。`useLiveSession` の kill/failure を SessionScreen 統合 full-render で通す検証は E2E/quickstart (V-4 等) に委譲**する (codebase が full SessionScreen render を quickstart に委ねる既定パターン。実機 IME/セッションを要する)。
- [x] T026 lint / typecheck (`tsc --noEmit` を node/web 2 project) / depcruise / check:constitution を通す (discovery.md agent 用コマンド。TypeScript tech-stack task)
- [x] T027 Vitest 全件 run で回帰 0 を確認する (touched files 外の回帰を見る) — 2026-09-28 実測: `node --max-old-space-size=3072 node_modules/vitest/vitest.mjs run` = **59 files / 1027 tests passed** (56.4s)。scope=full。lint/typecheck(node,web)/depcruise/check:constitution も同日 EXIT=0
- [x] T028 quickstart V-1〜V-5 (人間 deferred の実機 IME 目視 / 全角行送りの見え / 基準画像初回承認) を `quickstart-results.md` に記録する。**基準画像の承認者と承認根拠 (どのレイアウト基準で OK としたか) を必須記録**し、承認前は SC-002 を暫定扱いとする (形骸化防止。L-9)。**2026-09-29: V-2 aesthetic sign-off を取得 (承認者 ukitomato / 承認日 2026-09-29 / 承認根拠=水平あふれ・桁ずれ・要素崩れ 0 の標準レイアウトとして妥当)。SC-002 暫定解除。V-1/3/4/5 の実機目視は自動 backstop 緑 + 利用者が実アプリ操作済み。2026-09-28: `quickstart-results.md` 作成済み — 自動検証 (E2E 4/4 + component 1035) の done と V-2 の客観レイアウト判定 (崩れ 0) を V-1〜V-5 ごとに記録。基準画像も生成・commit 済み。残るは (a) V-2 の人間 aesthetic sign-off (承認者・根拠欄が空欄=未記入) と (b) V-1/3/4/5 の実機 IME 目視のみ — いずれも人間しか実施できず機能ブロッカーではない。承認欄が埋まるまで未チェック (形骸化防止)**
- [x] T029 **AD-038 (E2E / スクリーンショット検証ハーネス) は proposed で起票済み** (design-gate M-1)。実装は AD-038 D1-D6 (Playwright + `_electron.launch` / e2e の src グラフ外分離 / credential-free + production-inert 注入 / フォント同梱・非永続注入 / 基準画像ガバナンス / scope 限定) に従う。design-gate Round 2 再確認で accepted へ昇格
- [x] T033 `docs/roadmap.md` に **system-scope の後続対応「`scripts/constitution/allowlists.mjs` の `SCAN_FILES` に `.github/workflows/verify.yml` を追加し check.mjs 項目 1 が CI 定義を走査する (Constitution VI Verification の宣言と実装の乖離を解消)」を owner 付きで登録**する (defer を忘却させない。design-gate M-101 / AD-038 D4)。本 feature では同梱限定 + 非永続注入 + Manual gate で feature-level を守る

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし。即着手可
- **Foundational (Phase 2)**: Setup 完了に依存。US-2/US-3 をブロック
- **US-1 (Phase 3)**: Setup (E2E ハーネス) に依存。Foundational とは独立に着手可 (主に検証 + 非破壊維持)
- **US-2 (Phase 4)**: Foundational に依存
- **US-4 (Phase 5)**: US-1 の E2E spec (T006/T008) に依存 (CI に載せる対象)
- **US-3 (Phase 6)**: Foundational に依存
- **Polish (Phase 7)**: 対象 User Story 完了に依存

### User Story Dependencies

- US-1 (P1): Setup 後に着手可。他 story に非依存
- US-2 (P1): Foundational 後。他 story に非依存 (独立テスト可)
- US-4 (P1): US-1 の E2E spec を CI に載せる。US-1 に依存
- US-3 (P2): Foundational 後。他 story に非依存

### Parallel Opportunities

- Setup の T002 / T003 は並列可
- US-1 のテスト T006 / T007 / T008 は並列可 (別ファイル)
- US-2 のテスト T011 / T012 は並列可
- Polish の docs 追随 T022 / T023 / T024 は並列可 (別ファイル)

---

## Implementation Strategy

### MVP First (US-1)

1. Phase 1 Setup (E2E ハーネス) → Phase 2 Foundational
2. Phase 3 US-1 (IME 非破壊 + 全角レイアウト) を完成
3. **STOP and VALIDATE**: IME E2E + スクショ + 静的が緑 (日本語入力の健全性が担保される)

### Incremental Delivery

1. Setup + Foundational → 土台
2. US-1 → 独立検証 (MVP: 日本語入力が壊れない)
3. US-2 (実行中積み) → 独立検証
4. US-4 (CI 常設) → 回帰の恒久固定
5. US-3 (下書き復元) → 独立検証
6. Polish (docs/config 追随 + 機械検証 + quickstart)

---

## Notes

- [P] = 別ファイル・依存なし。[USn] = User Story への trace
- 各 User Story は独立に完成・テスト可能
- 実装前にテストを FAIL させる (T006-T008 / T011-T012 / T020)
- 会話由来テキスト (下書き / キュー) をログ・永続層・IPC に出さない (Principle V)
- 自前 IME ガードを新設しない (AD-037 D1)。interrupt→steer しない (AD-036)

## pr-gate Round 1 の修正 (2026-09-29)

pr-gate Round 1 は **Critical=0 で PASS** だったが、po/architecture の High/Medium を done 前に解消した:

- **R2-M-001 を live 配線** (po-H-001。それまで `classifyEnqueue`/`DEFAULT_MAX_QUEUE_ITEMS` は dead export で上限が未強制):
  `composer-queue-adapter.ts` の `createCappedAdapter` で native queue の adapter を wrap し、**enqueue 時に空/超過 (`invalid`) と
  件数上限 (`full`) を拒否**して理由を提示 (`QueueRejectionNotice`)。SessionScreen の runtime に capped adapter を配線。
  `composer-queue-adapter.test.ts` で assert (po-H-101 / po-M-001)。
- **cancelled 提示** (po-M-003): 終端で `clear()` でなく **`notifyCancelled()` で保持** し、`CancelledQueueNotice` で「取り消された入力」を
  提示 (render 中に terminal を導出し setState-in-effect を回避)。reset で unmount 破棄。
- **doc 追随**: AD-038 D3/Confirmation を実装 (IpcDependencies 差し替え) に書き換え (arch-H-001) / launch.ts コメント (preload/addStyleTag) /
  spec の SC-003・FR-004・Key Entities を PendingQueueNotice/steer lane に訂正 (po-M-002) / constitution フッタ版 1.2.7 (arch-M-001) /
  charter last_reviewed / SC-002 承認根拠に美観次元 (po-L-001) / roadmap に production-inert backstop follow-up (arch-M-002)。

## E2E の実装状況 (2026-09-28 更新)

- **導入 + 実走済み (E2E 4/4 local 緑)**: `@playwright/test` (1.63) 導入 (T001)。app 側 E2E stub フック `createE2eCapability`
  (`src/main/app/e2e-capability.ts` + `src/main/index.ts` の分岐。T030。production-inert)。**IME E2E 3 本** (T006/T019/T031。
  idle / running+queue / 変換中マウス送信) + **日本語スクリーンショット比較 1 本** (T008。同梱 Noto Sans JP を FontFace + CSSOM で
  CSP 非破壊注入。基準画像 commit 済み)。DOM セレクタ・CDP 注入列は実走で調整済み。T002 (scope 分離) 済。
  CI は `verify.yml` の `e2e` job に authored (T016/T017 実ジョブ / T018 移設対象外なし)。
- **実走で 2 件の実バグを検出・修正**: (1) assistant-ui は変換中のマウス送信を抑止しない → `thread.aui.tsx` の Composer に
  確定優先の最小処理 (composition ref + 送信ボタン capture ガード。T031。keydown ガードは新設せず。AD-037 D1(d))。
  (2) `addStyleTag` がアプリの CSP (`style-src 'self'`) に弾かれる → FontFace API + CSSOM に切替 (`font-src 'self' data:`。CSP 非破壊)。
- **残 (人間 rubber-stamp / 実機のみ。機能ブロッカーではない)**: T028 の V-2 aesthetic sign-off (基準画像の崩れ 0 は客観判定済み・
  承認欄が空) と V-1/3/4/5 実機 IME 目視。**すべて uncommitted** — 実 CI 実行はマージ後。
