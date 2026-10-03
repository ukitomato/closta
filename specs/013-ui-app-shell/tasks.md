# Tasks: アプリのシェル (O-7)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[FE]` renderer、`[SH]` 横断 (docs・E2E・検証)。targets=frontend なので Backend の節は無い。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いの正本は spec の FR / SC、状態・focus の書き手・幅・タブ・概要の項目・文言の正本は data-model、方式の理由は research。本書は作業単位とテストの観点だけを書く。

**着手の条件**: **AD-046 が accepted になり、spec の U-1〜U-5 を利用者が承認するまで /cl-implement に入らない。**

**順序の制約**: SH-001 (glossary) → コード。SH-002 (element の照合) → FE-010 / FE-030 / FE-040。FE-001 (面の状態と focus の書き手) → 他の FE。FE-002 (provider の持ち上げ) → FE-010 / FE-020。SH-010 (roadmap ほか) は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] **glossary を追随させる** (Principle XIV。FR-013): 語の正本は AD-046 Decision 6 (シェル・サイドバー・中央のヘッダ・中央の本体・右のペインのタブ・設定のダイアログ) と稼働中の区画・過去のセッションの区画。サイドバー (:485 / :949)、没入ビュー (:389-390)、`AgentRuntime` の Counterexamples に「assistant-ui の runtime ではない」
- [ ] **SH-002** [SH] **element の照合を記録する** (Principle XIII。research R-04): registry の `thread-list-sidebar` / `Settings` を実名で照合する。観点に「本番の CSP (`style-src 'self'`。inline の `<style>` を足さない) の下で動くこと」を入れる。照合の結果の正本は PR の説明 (Constitution XIII)、research と F 節の備考は写し。幅のドラッグの部品は入れない (data-model §2)
- [ ] **SH-003** [SH] **実名リストのルールを確かめる** (plan の上流からの申し送り 3): `eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/allowlists.mjs` を Grep し、`App.tsx` / `stores/ui.ts` / `features/session/SessionScreen.tsx` の名指しがあれば新しいモジュールに合わせる (design-gate R1 で 0 件と確認済み。実装の時点で再確認)

## 土台

- [ ] **FE-001** [FE] `stores/ui.ts` と `features/shell/useShellFocus.ts` — data-model §1 の面の状態に置き換える (`SCREENS` / `ScreenId` / `SCREEN_LABELS` / `screen` / `setScreen` を消す)。`running-session-store` に選択の操作の通知 (`selectionSeq`) を足す。focus の書き手 (§1 の表の 7 行) と `watchedId`。`SessionAttentionAnnouncer.tsx:28` と `nextAwaiting` (`session-view.ts:421`) を `watchedId` に替える。`RunningSessionList.monitor.test.tsx:244-291` の `screen` の参照を直す。単体テスト: §1 の表の各行 (起動の受け付け・`selectNextAwaiting`・close・失敗の close で `launchOpen`・過去の行の消失)、同じ id の選び直し、`watchedId` (設定のダイアログを開いている間は null)、`seedFolderDraft`、既定値 (右は畳む)
- [ ] **FE-002** [FE] `features/session/RunningSessionsProvider.tsx` — `SessionScreen` の `AssistantRuntimeProvider` (稼働中の thread list の assistant-ui の runtime) を切り出す。`LivePane.tsx` に `LiveSessionPane` / `Launching` / 起動ダイアログの面 (`NewSessionDialog`) を移す。`SessionScreen.tsx` を消し、既存の `SessionScreen.test.tsx` / `SessionScreen.o2.test.tsx` を新しい置き場所に合わせて移す (観点は変えない)

## US-1 — サイドバーでセッションを選び、中央で会話を読む・続ける (P1)

**Goal**: 3 面のシェルと、サイドバーの 4 区画、中央の切り替え (spec FR-001〜FR-006 / FR-016)。

**Independent Test**: シェルの component テスト + 既存の E2E。

- [ ] **FE-010** [FE] `features/shell/AppShell.tsx` / `Sidebar.tsx` / `CenterPane.tsx` / `labels.ts` — 3 面の配置とランドマーク (トップレベルの `nav` は 1 つ)、サイドバーの区画 (data-model §3)、中央の focus ごとの中身と中央のヘッダ (§5 の中央のヘッダ。密度の切り替え)、空の状態 (フォルダ未登録の案内。ボタンの文言はサイドバーの「新規起動」と分ける。§6)。`SessionNavBadge` を稼働中の区画の見出しへ。`focus` の側の行だけを強調する
- [ ] **FE-011** [FE] `features/session-list/` — `SessionListScreen.tsx` の一覧の部分をサイドバーで使える形にする (§3 の調整の範囲)。フォルダ未登録の空の表示 → 設定を「作業フォルダ」で開く。`useSessions.ts` の初回の取得を `listRuntimes()` の解決の後にし (FR-016)、`:71-76` と `src/main/index.ts:192-196` のコメントを新しい前提に直す。`locationLabelOf` とグループの表示の関数を export する。テスト: 初回の `listSessions` が `listRuntimes` の解決の前に呼ばれない (SC-008)、既存のテストを直す
- [ ] **FE-012** [FE] `features/session/RunningSessionList.tsx` — 区画の要素を `nav` から `section` に (§3)。`ThreadListNew` を外し、サイドバーの上の「新規起動」に一本化する。0 件の文言を短くする (§6)
- [ ] **FE-013** [FE] `App.tsx` — `AppShell` を描くだけにする。`useRunningSessionStoreWiring()` と `SessionAttentionAnnouncer` は App に残す (FR-004 / FR-006)。注記を O-7 / AD-046 に直す
- [ ] **FE-014** [FE] `features/shell/AppShell.test.tsx` — 観点 (SC-001 / SC-002 / SC-007):
  - 起動直後: タブのボタンが 0、トップレベルの `nav` / `main` / `complementary` が 1 つずつ、中央は空の状態、右は畳んだ帯、稼働中の区画の 0 件の文言 (US-1 AC1 / AC5)
  - 稼働中の行 → 中央に実行中の Chat、過去の行 → transcript、戻ると稼働中の接続・transcript・下書き・キューが保たれ、下端に追従する (AC2〜AC4)
  - 承認待ちの件数の印と読み上げが、過去の会話・設定のダイアログを表示中でも出る。過去の会話を表示中に件数のボタンを押すと中央が稼働中に切り替わる (AC6 / AC7 / FR-006)
  - サイドバーを畳む・開く (AC8)。`focus` の側の行だけが強調される
  - 稼働中の会話・過去の会話・起動ダイアログ・設定に 1 回の操作で届く (SC-007)
  - 入れ子の provider: 外側に稼働中の provider がある形で、過去の一覧と transcript の既存の観点が通る (plan RK-02)
  - 中央のヘッダの題に `<img src=x onerror=...>` を含む値で `img` 要素が 0
  - vitest-axe の違反 0。長い日本語の題・フォルダ名で 1 行に切り詰める

## US-2 — サイドバーから新しいセッションを起動する (P1)

**Goal**: 起動の入口を 1 つにする (spec FR-007)。

- [ ] **FE-020** [FE] `features/shell/` — 「新規起動」で `launchOpen` のダイアログに起動の面 (FE-002 の `NewSessionDialog`) を出す。起動中は `Launching` で閉じられない。受け付けで閉じて `focus = 'running'`。閉じたら元の面。失敗したセッションの close で `launchOpen = true` (前回の設定と理由)
- [ ] **FE-021** [FE] テスト — US-2 の AC1〜AC5: どの面からでも開く・受け付けで閉じて中央に出る・閉じたら元の面・**失敗したセッションを「閉じて起動し直す」→ ダイアログが前回の設定と理由つきで開く (X-4 US-1 AC7)**・起動中は閉じられない・拒否 (上限) と失敗はダイアログを閉じずに理由を出す
- [ ] **SH-020** [SH] E2E と perf — `e2e/support/launch.ts:47` / `e2e/launch-dialog.spec.ts:18` / `perf/real-sessions.spec.ts:189,191` の nav の「セッション起動」をサイドバーの「新規起動」に直す。locator はサイドバー (`nav`) に限る (中央の空の状態のボタンと分ける)。`multi-session.spec.ts:29` の「新規起動」を同じ locator に。`e2e/README.md:46` の記述を直す。基準画像は変えない。**`composer-fullwidth` が変わったら、撮り直した理由と人間の見た目の承認を quickstart-results に記録する (SC-003)**。perf は実行しない

## US-3 — 設定の画面をダイアログで開く (P1)

**Goal**: 設定の 4 画面とテーマを全面のダイアログに (spec FR-008 / FR-009)。

- [ ] **FE-030** [FE] `features/shell/SettingsDialog.tsx` — 左に 4 項目とテーマ、右に今の 4 画面。Esc と閉じるボタン、開いた元の要素へのフォーカスの戻り、閉じたら中を unmount、項目の id を覚える。`WorkspaceFoldersScreen.tsx:249` の注記を直す
- [ ] **FE-031** [FE] テスト — US-3 の AC1〜AC4 (`seedFolderDraft` で「作業フォルダ」が開き初期値が入る、「登録」から開いたら「登録」のボタンにフォーカスが戻る、登録の後にサイドバーへ反映、**閉じて開き直すと Provider の秘密の入力欄が空**)。設定の 4 画面の既存の component テストが、ダイアログの中に置いた形で通る (SC-004)

## US-4 — 右のペインで表示中のセッションの概要を見る (P2)

**Goal**: 右のペインの枠・タブの表・「概要」(spec FR-014 / FR-015)。

- [ ] **FE-040** [FE] `features/shell/RightPanel.tsx` / `panel-tabs.ts` / `OverviewTab.tsx` — タブの表 (data-model §4)、畳み (既定で畳む)、「概要」の項目と出所 (§5。グループの表示・`locationLabelOf`・`folderName` / `runtimeName` の規則を共有)。新しい IPC を足さない
- [ ] **FE-041** [FE] `AppShell.tsx` — 固定の幅と畳み (data-model §2)。狭いときに右 → 左の順に 1 回だけ自動で畳む
- [ ] **FE-042** [FE] テスト — US-4 の AC1〜AC5:
  - 登録フォルダの配下の過去の行でもフォルダと所在が出る。登録が解除された Provider は fallback の文言
  - `<img src=x onerror=...>` を含むブランチ名・フォルダ名で `img` 要素が 0。U+202E を含む値が正規化済みの値で出る
  - §2 の自動の畳み (幅の変化を `ResizeObserver` の stub で与える)
  - 出せないタブを選んでいたら最初のタブに戻る (テスト用のタブを表に差し込む)

## Polish / 記録

- [ ] **SH-010** [SH] **記録を追随させる** (FR-013): roadmap (M3 に O-7 を O-3 の前に・O-3〜O-6 の依存に O-7・O-3 の義務 (2)(c) の基準の注記・O-4〜O-6 に右のペインのタブの候補・Optional scope に OPT-panel (Terminal は OPT-pty)・E2E / 検証基盤の項目に Principle VIII (B) の延期条件の注記・store / 一覧の切り出しに「O-7 は当たらない」)、`_overview.md` (Feature 帰属の表・帰属の判断根拠・M3 の範囲)、ui charter (Scope にシェル・XII の対象外・Cross-domain の面の状態・Journey 4 と O-1 の読み替え・Related Specs)、session charter (:99 / :101 / :194)、`docs/ui-coverage.md` F 節 (Thread list sidebar / Settings / Empty state と、Assistant sidebar / Chat panel の備考)、`docs/prompts.md` (O-7 と OPT-panel のプロンプト)、`SessionNavBadge.tsx:12` の注記
- [ ] **SH-011** [SH] **検証** — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。quickstart V-1 (画面の ID と nav の手順の残り 0。`src` / `e2e` / `perf`) と V-2。V-3 (実機の目視・WSL の所在の順序) は利用者に残す
