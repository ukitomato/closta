# Tasks: アプリのシェル (O-7)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[FE]` renderer、`[SH]` 横断 (docs・E2E・検証)。targets=frontend なので Backend の節は無い。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いの正本は spec の FR / SC、状態・幅・タブ・概要の項目・文言の正本は data-model、方式の理由は research。本書は作業単位とテストの観点だけを書く。

**着手の条件**: **AD-046 が accepted になり、spec の U-1〜U-5 を利用者が承認するまで /cl-implement に入らない。**

**順序の制約**: SH-001 (glossary) → コード。SH-002 (element の照合) → FE-010 / FE-030 / FE-040。FE-001 (面の状態) → 他の FE。FE-002 (provider の持ち上げ) → FE-010 / FE-020。SH-010 (roadmap ほか) は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] **glossary を追随させる** (Principle XIV。FR-013): シェル、サイドバー (面の名前として定義し直す。:485 / :949)、中央のヘッダ、中央の本体、右のペイン (タブの表)、設定のダイアログ
- [ ] **SH-002** [SH] **element の照合を記録する** (Principle XIII。research R-04): registry の `thread-list-sidebar` / `Settings` / `Empty state` / resizable (と shadcn の `resizable`) を実名で照合し、採否と理由を research に追記する。取り込むなら `docs/discovery.md` の element の取り込みの手順に従い、足す依存を plan に書く
- [ ] **SH-003** [SH] **実名リストのルールを確かめる** (plan の上流からの申し送り 3): `eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/allowlists.mjs` を Grep し、`App.tsx` / `stores/ui.ts` / `features/session/SessionScreen.tsx` の名指しがあれば新しいモジュールに合わせる

## 土台

- [ ] **FE-001** [FE] `stores/ui.ts` — data-model §1 の面の状態に置き換える (`SCREENS` / `ScreenId` / `SCREEN_LABELS` / `screen` / `setScreen` を消す)。`seedFolderDraft` は設定を「作業フォルダ」で開く。単体テスト: focus の切り替えで 2 つのストアの選択を消さない、`seedFolderDraft`、既定値
- [ ] **FE-002** [FE] `features/session/RunningSessionsProvider.tsx` — `SessionScreen` の `AssistantRuntimeProvider` (稼働中の thread list の runtime) を切り出す。`LivePane.tsx` に `LiveSessionPane` / `Launching` / 起動ダイアログの面 (`NewSessionDialog`) を移す。`SessionScreen.tsx` を消し、既存の `SessionScreen.test.tsx` / `SessionScreen.o2.test.tsx` を新しい置き場所に合わせて移す (観点は変えない)

## US-1 — サイドバーでセッションを選び、中央で会話を読む・続ける (P1)

**Goal**: 3 面のシェルと、サイドバーの 4 区画、中央の切り替え (spec FR-001〜FR-006)。

**Independent Test**: シェルの component テスト + 既存の E2E。

- [ ] **FE-010** [FE] `features/shell/AppShell.tsx` / `Sidebar.tsx` / `CenterPane.tsx` / `labels.ts` — 3 面の配置とランドマーク、サイドバーの区画 (data-model §3)、中央の focus ごとの中身と中央のヘッダ (`SessionHeader` と密度の切り替え)、空の状態 (フォルダ未登録の案内を含む)。`SessionNavBadge` を稼働中の区画の見出しへ
- [ ] **FE-011** [FE] `features/session-list/SessionListScreen.tsx` — 一覧の部分をサイドバーで使える形にする (画面の見出しと外枠を外す)。行の選択 → `focus = 'past'`、フォルダ未登録の空の表示 → 設定を「作業フォルダ」で開く。既存のテストを直す
- [ ] **FE-012** [FE] `features/session/RunningSessionList.tsx` — 行の選択で `focus = 'running'`。`ThreadListNew` (今の「新規起動」) はサイドバーの上の「新規起動」に一本化する (区画の中には置かない)
- [ ] **FE-013** [FE] `App.tsx` — `AppShell` を描くだけにする。`useRunningSessionStoreWiring()` と `SessionAttentionAnnouncer` は App に残す (FR-004 / FR-006)。注記を O-7 / AD-046 に直す
- [ ] **FE-014** [FE] `features/shell/AppShell.test.tsx` — 観点 (SC-001 / SC-002):
  - 起動直後: タブのボタンが 0、`nav` / `main` / `complementary` が 1 つずつ、中央は空の状態 (US-1 AC1 / AC5)
  - 稼働中の行 → 中央に実行中の Chat、過去の行 → transcript、戻ると稼働中の下書き・キューが保たれる (AC2〜AC4)
  - 承認待ちの件数の印と読み上げが、過去の会話・設定のダイアログを表示中でも出る (AC6 / FR-006)
  - 入れ子の provider: 外側に稼働中の provider がある形で、過去の一覧と transcript の既存の観点が通る (plan RK-02)
  - vitest-axe の違反 0。長い日本語の題で 1 行に切り詰める

## US-2 — サイドバーから新しいセッションを起動する (P1)

**Goal**: 起動の入口を 1 つにする (spec FR-007)。

- [ ] **FE-020** [FE] `features/shell/` — 「新規起動」で `launchOpen` のダイアログに起動の面 (FE-002 の `NewSessionDialog`) を出す。起動中は `Launching`、受け付けで閉じて `focus = 'running'`、閉じたら元の面
- [ ] **FE-021** [FE] テスト — US-2 の AC1〜AC3 (どの面からでも開く・受け付けで閉じて中央に出る・閉じたら元の面)
- [ ] **SH-020** [SH] E2E — `e2e/support/launch.ts:47` と `e2e/launch-dialog.spec.ts:18` の nav の「セッション起動」をサイドバーの「新規起動」に直す。`multi-session.spec.ts:29` の「新規起動」が新しい位置で一意になることを確かめる。基準画像は変えない (変わったら理由を記録。SC-003)

## US-3 — 設定の画面をダイアログで開く (P2)

**Goal**: 設定の 4 画面とテーマを全面のダイアログに (spec FR-008 / FR-009)。

- [ ] **FE-030** [FE] `features/shell/SettingsDialog.tsx` — 左に 4 項目とテーマ、右に今の 4 画面。Esc と閉じるボタン、フォーカスの戻り、開いた項目を覚える
- [ ] **FE-031** [FE] テスト — US-3 の AC1〜AC4 (`seedFolderDraft` で「作業フォルダ」が開き初期値が入る、登録の後にサイドバーへ反映)。設定の 4 画面の既存の component テストが、ダイアログの中に置いた形で通る (SC-004)

## US-4 — 右のペインで表示中のセッションの概要を見る (P2)

**Goal**: 右のペインの枠・タブの表・「概要」(spec FR-014 / FR-015)。

- [ ] **FE-040** [FE] `features/shell/RightPanel.tsx` / `panel-tabs.ts` / `OverviewTab.tsx` — タブの表 (data-model §4)、畳み、「概要」の項目 (§5)。新しい IPC を足さない
- [ ] **FE-041** [FE] `AppShell.tsx` — 幅と畳み (data-model §2)。ドラッグで幅を変える、狭いときに右 → 左の順に 1 回だけ自動で畳む
- [ ] **FE-042** [FE] テスト — US-4 の AC1〜AC5、§2 の自動の畳み (幅の変化を `ResizeObserver` の stub で与える)、出せないタブを選んでいたら最初のタブに戻る

## Polish / 記録

- [ ] **SH-010** [SH] **記録を追随させる** (FR-013): roadmap (M3 に O-7 を O-3 の前に・O-3〜O-6 の依存に O-7・O-4〜O-6 に右のペインのタブの候補・Optional scope に OPT-panel・E2E / 検証基盤の項目に Principle VIII (B) の延期条件の注記)、`_overview.md` (Feature 帰属の表・M3 の範囲)、ui charter (Scope にシェル・Journey 4 と O-1 の読み替え・Related Specs)、session charter (監視ビューの位置)、`docs/ui-coverage.md` F 節 (Thread list sidebar / Settings / Empty state と、Assistant sidebar / Chat panel の備考)、`docs/prompts.md` (O-7 と OPT-panel のプロンプト)
- [ ] **SH-011** [SH] **検証** — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。quickstart V-1 (画面の ID の残り 0) と V-2。V-3 (実機の目視) は利用者に残す
