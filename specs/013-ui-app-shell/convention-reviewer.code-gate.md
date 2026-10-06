# convention-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05
**Reviewer**: convention-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Gate**: code-gate iteration 1 (diff `0818409..HEAD`。対象は `.code-gate-scope.txt` の 70 files)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-003: `features/shell/{AppShell,Sidebar,CenterPane}.tsx`、`RunningSessionList.tsx` (`nav` から `section` へ)
  - FR-004 / FR-006: `RunningSessionsProvider.tsx`、`running-sessions-view.ts`、`watchedIdOf` (`stores/ui.ts`)、`selectionSeq`
  - FR-005: 中央のヘッダ (`LivePane.tsx` の `SessionHeader` / `CenterPane.tsx` の `PastCenter`)
  - FR-007: `LaunchDialogHost.tsx` / `LaunchPanel`
  - FR-008 / FR-009: `SettingsDialog.tsx`、`openSettings`、`seedFolderDraft`
  - FR-010 / SC-005: `SCREENS` / `ScreenId` / `setScreen` の削除
  - FR-011 / SC-003: e2e / perf の locator
  - FR-013 / SC-006: glossary・charter・roadmap・ui-coverage と、古いコメントの書き直し
  - FR-014 / FR-015: `panel-tabs.ts` / `RightPanel.tsx` / `OverviewTab.tsx`
  - FR-016 / SC-008: `useSessions.ts`
  - SC-001 / SC-002 / SC-004 / SC-007: `AppShell.test.tsx`
- touched files に該当する charter / Confirmation:
  - ui charter: Scope「アプリのシェル」(:62-66)、Cross-domain「面の状態」(:166-168)
  - session charter: Journey 3 の O-7 の読み替え (:104-106)、Related Specs の O-7 (:201-203)
  - AD-046: Decision 6 (置き場所の語彙)、Confirmation (SC-001〜SC-005)
  - Constitution: XIII (Manual の検証者に convention-reviewer が入る)、XIV (Ubiquitous Language)、XV (識別子は英語、文言は日本語)
  - glossary: Shell (:839-854)、Monitoring view (:483-493)、同義語表 (:968)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲。本 track は命名・配置・lint hookup だけを見た
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (XSS のテストは AppShell.test.tsx にあるが、判定は security に譲る)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (charter の不変条件に触れうる配置の論点は L-008 として F で出し、判定は architecture に申し送る)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲。Principle XIII の Manual の「PR 説明に候補名と不適合理由」は PR がまだ無いので code-gate では確かめられない (research R-04 に写しがある)。pr-gate で確かめる
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:7 Low:10
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage は pr-gate だけで起動する (L-003 の文言の最終判断は ux-reviewer、M-009 の F 節の中身の判断は ui-coverage-reviewer に申し送る)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

O-7 は上部の 7 タブをやめ、サイドバー・中央・右のペインの 3 面にした。

- **新設**: `features/shell/` に 11 ファイル。session 側では `SessionScreen.tsx` を分割し、`RunningSessionsProvider.tsx` / `running-sessions-view.ts` / `LivePane.tsx` (rename) と、テスト用の `test-support/running-workspace.tsx` を作った
- **session-list**: `group-label.ts` を切り出し、`rows.ts` に `findRow` を足した
- **stores**: `stores/ui.ts` の面の状態を置き換え、2 つのストアに `selectionSeq` を足した
- **周辺**: e2e / perf の locator、`reviewers.yml` の a11y / ux の発火条件、docs (glossary / charter / roadmap / ui-coverage)

**lint (CONV-1)**: lint-agent の JSON を入力にした。7 検出器 (eslint / tsc ×4 / depcruise / check:constitution) はすべて `exit_code: 0`、`violations: []` で、lint 由来の finding は 0 件。

**lint hookup**:
- `features/shell/` は eslint-plugin-boundaries の `ui` 要素 (`src/renderer`) と depcruise の `^src/renderer/` 規則に自動で乗る
- `no-unknown-files` の対象にもなる
- vitest の renderer project の include (`src/renderer/**/*.test.{ts,tsx}`) にも入る
- depcruise の `no-circular` (error) が 350 modules で 0 件なので、循環依存のツール (madge) は追加では走らせていない

**Bash の使用**: invoker の指示どおり、read-only の `git diff` / `git ls-tree` を 1 回だけ走らせ、結果を scratchpad に書いて Read した。lint は実行していない。

## Findings

### [Medium] `LivePane.tsx` のファイル名がどの export とも一致せず、起動ダイアログの中身が同居している。"Panel"・"Dialog" の語が 3 層で衝突する (M-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/LivePane.tsx:44` は `LiveCenter`、`:67` は `LaunchPanel` を export する。名前が `LivePane` の export は無い
  - 同じファイルに、起動ダイアログの中身 (`LaunchPanel` → `NewSessionDialog` (:74) → X-4 の `LaunchDialog`、`Launching` (:104)) と、中央の本体 (`LiveCenter` → `LiveSessionPane` (:113)) が同居している
  - 起動の側は `features/shell/LaunchDialogHost.tsx` から使われる (import は :5、`<LaunchPanel />`)。結果として「LaunchDialogHost → LaunchPanel → NewSessionDialog → LaunchDialog」と、Dialog / Panel を名乗る層が 4 段に重なる
  - glossary と AD-046 Decision 6 では "Panel" は右のペイン (`PanelTab` / `RightPanel` / `panel-tabs.ts`) の語である
- **同種事象探索**: `LivePane|LiveCenter|LaunchPanel` を src で検索して 8 件 (`LivePane.tsx:44,67` / `LaunchDialogHost.tsx:5` / `CenterPane.tsx:10` / `test-support/running-workspace.tsx:1` / `draft-bridge.test.tsx:12` / `pending-queue-notice.test.tsx:8` / `RunningSessionsProvider.tsx:27` (コメント))
- **リスク/影響**: renderer の規約 (`<Name>.tsx` が主 export `<Name>` を持つ) から外れている。O-4〜O-6 が「右のペインのタブ」を足すとき、`LaunchPanel` が右のペインの部品に読める
- **推奨アクション**: 最小案は export の改名 (`LiveCenter` → `LivePane`、`LaunchPanel` → `LaunchEntry`)。次の案は起動の 3 部品を `features/session/LaunchEntry.tsx` に移す。どちらでも 8 か所の import とコメントを追随させる
- **根拠**: CONV-2 / CONV-3、Constitution XIV、AD-046 Decision 6
- **scope 根拠**: 本 PR で rename・新設したファイル

### [Medium] `RunningSessionsView` / `useRunningSessionsView` が glossary の監視ビュー (Running session list) と同じ英語に読め、`useRunningSessionStore` とも 1 文字違いで紛れる (M-002) (scope: feature)

- **観察**: `running-sessions-view.ts:12,28,30` が `RunningSessionsView` / `RunningSessionsViewContext` / `useRunningSessionsView` を定義する。中身は選択中の稼働中のセッション・本文の窓の操作・表示名の解決・フォルダの一覧・起動の関数。glossary は監視ビューのコード識別子を `RunningSessionList` と定めている (:488、同義語表 :968)。`LivePane.tsx:29` は `useRunningSessionStore` と `useRunningSessionsView` を並べて import している
- **同種事象探索**: `RunningSessionsView|useRunningSessionsView|running-sessions-view` を src で検索して 21 件
- **リスク/影響**: 後続 feature が「監視ビューに足す」と書いたとき、どちらに足すのかが文書から決まらない
- **推奨アクション**: 最小案は名前を残し、glossary の Monitoring view の Counterexamples に「`RunningSessionsView` (コード) は監視ビューではない」の 1 行を足す。次の案は改名
- **根拠**: Constitution XIV、glossary :483-493 / :968
- **scope 根拠**: 本 PR の新設ファイル

### [Medium] 中央のヘッダが 2 つの domain に別々の実装として存在し、AD-046 の置き場所の語彙が 1 つの部品に対応していない (M-003) (scope: feature)

- **観察**: 稼働中の中央のヘッダは `features/session/LivePane.tsx:279-305` (`SessionHeader`)、過去の中央のヘッダは `features/shell/CenterPane.tsx:110-127` (`PastCenter` の中に inline)。外枠の className・題の span・右寄せの状態・密度の切り替えの並びを複製している
- **同種事象探索**: `data-testid="center-header"` を renderer で検索して 2 件。`<TranscriptDensityToggle` の本番の描画は 3 件 (`LivePane.tsx:302`、`CenterPane.tsx:126`、`ChatScreen.tsx:126`)
- **リスク/影響**: O-3〜O-6 がヘッダに表示を 1 つ足すたびに 2 ファイルを直す必要があり、片方の直し忘れをテストで検出できない
- **推奨アクション**: 見た目だけの `CenterHeader` を作り、running と past の両方で描く。session → shell の import は作らない
- **根拠**: CONV-3、spec FR-005、AD-046 Decision 3・6、ui charter :62-66
- **scope 根拠**: 本 PR で新設・移動した 2 ファイル

### [Medium] 一覧の表示の規則を shell と一覧で複製しており、data-model §5 の「同じ関数を共有する」が成り立っていない (M-004) (scope: feature)

- **観察**: (a) `TIME_FORMAT` / `formatTime` が `SessionListScreen.tsx:62-72`、`CenterPane.tsx:76-86`、`OverviewTab.tsx:96-102` に同じ定義で 3 か所。(b) `group-label.ts` は「一覧の見出しの規則。中央のヘッダと概要が共有する」と書くが、一覧の見出し `SessionListScreen.tsx:95-156` (`SectionHeading`) は同じ規則を書き直している (`'登録フォルダ'` が 2 か所、pending の所在の判定が `:126` に inline)
- **同種事象探索**: `new Intl.DateTimeFormat('ja-JP'` 3 件、`登録フォルダ'` 2 件、inline の所在判定 1 件
- **リスク/影響**: 1 か所だけ直すと、サイドバーの行・中央のヘッダ・概要で同じセッションの文字列が食い違い、検出するテストが無い
- **推奨アクション**: `formatTime` を `rows.ts` から export して 3 か所で使う。`SectionHeading` の pending は `locationLabelOf` を使う。`'登録フォルダ'` は定数 1 つにする
- **根拠**: CONV-3 / CONV-5、data-model §5
- **scope 根拠**: 本 PR で新設・変更したファイル

### [Medium] 面の幅の正本が 2 つある。`SHELL_WIDTHS` は hook のファイルにあって部品から使われず、実際の幅は Tailwind の別の値で書かれている (M-005) (scope: feature)

- **観察**: `useAutoCollapse.ts:6-12` の `SHELL_WIDTHS` が「data-model §2 が正本」として export されるが、実際の幅は `Sidebar.tsx:38,82`、`RightPanel.tsx:38` に Tailwind の literal で別に書かれている。`SHELL_WIDTHS` / `shellThreshold` の参照は `useAutoCollapse.ts` の中だけ
- **同種事象探索**: features/shell で 10 件 (定数の参照 6 件は useAutoCollapse.ts の中、literal 3 か所)
- **リスク/影響**: 幅を片方だけ直すと、自動で畳む閾値と実際の幅がずれ、jsdom のテストでは検出できない
- **推奨アクション**: `features/shell/shell-layout.ts` に px と className を対で置き、Sidebar / RightPanel / useAutoCollapse がそこから取る (CSP があるので inline の width にはしない)
- **根拠**: CONV-3、CONV-5、data-model §2
- **scope 根拠**: 本 PR の新設ファイル

### [Medium] 過去ログの密度の切り替えは、テストが本番で描かれない経路を見ていて、本番の経路 (中央のヘッダ) のテストが 0 件 (M-006) (scope: feature)

- **観察**: `ChatScreen.tsx:68-75` が `densityToggle = true` を既定に持ち、本番の呼び出しは `CenterPane.tsx:129` の `<ChatScreen densityToggle={false} />` の 1 件だけ。O-2 の密度のテスト `ChatScreen.o2.test.tsx:375-452` は既定の `true` の経路を確かめている。本番の切り替え (`CenterPane.tsx:126`) のテストは無い
- **同種事象探索**: 本番の `<ChatScreen` は 1 件、`AppShell.test.tsx` の密度の参照は初期化の 1 件だけ
- **リスク/影響**: 中央のヘッダから切り替えが外れても、O-2 のテストは緑のまま
- **推奨アクション**: 最小案は AppShell.test に「過去の行 → 中央のヘッダの密度の切り替え → transcript の密度が変わる」を 1 件足す
- **根拠**: H、CONV-5
- **scope 根拠**: 本 PR で prop を足したファイルとシェルのテスト

### [Medium] roadmap / plan / session charter の「O-7 は行の部品と派生値を変えない」が観察と合わず、500 行を超える 2 ファイルがさらに伸びた (M-007) (scope: feature)

- **観察**: `docs/roadmap.md:175-176` / `:259`、`specs/013-ui-app-shell/plan.md:93`、`docs/domains/session/charter.md:202-203` が「`section` にし、`ThreadListNew` を外し、`selectionSeq` を足すだけ」と書く。実際には次も変えている:
  - 行の部品 `ThreadListItem` (`thread-list.aui.tsx:99-111, 285, 303-305, 394`): `highlightSelected` と `onSelectRow`
  - 派生値 `nextAwaiting` (`session-view.ts:419`) の引数に `watchedId`、ストアの `selectNextAwaiting(watchedId?)` (`running-session-store.ts:61, 435`)
  - 監視ビューの見出し (`MonitorSummary`) が `useUiStore` を購読し、見出しに `SessionNavBadge` が入った
  - 行数: `RunningSessionList.tsx` 531 → 550 行、`running-session-store.ts` 606 → 613 行
- **同種事象探索**: `行の部品と派生値を変え` を docs / specs で 3 件 (+ session charter の別の文言 1 件)
- **リスク/影響**: 切り出しの持ち主の規則 (USER 決定 2026-10-03) を判定する記録が事実と違う
- **推奨アクション**: 最小案は 4 か所の記述を実際の変更を列挙する形に直し、「監視ビューの行を触る」に当たるかを人間に諮る (reviewer は決めない)
- **根拠**: CONV-3、roadmap:166-176、memory「選択肢には作り変えない最小案を入れる」
- **scope 根拠**: 記述は本 PR で書いた文書。切り出しそのものは system-scope の既存項目

### [Medium] シェルのテストが 683 行の 1 ファイルに集中しており、純関数の単体テストが実装の隣に無い (M-008) (scope: feature)

- **観察**: `AppShell.test.tsx` は 683 行で FE-014 / FE-021 / FE-031 / FE-042 をまとめて持つ。純関数 `visibleTabs` / `activeTab` (`panel-tabs.ts:34-46`)、`shellThreshold`、`groupLabelOf` / `locationIndexOf`、`findRow` に隣の単体テストが無い
- **同種事象探索**: `features/shell/*` のテストは 1 件、`features/session-list/*.test.*` は 1 件
- **リスク/影響**: O-4〜O-6 がタブを足すたびに大きな共通 setup を読む必要がある。境界 (タブ 0 件で null など) は DOM のテストでは観測しにくい
- **推奨アクション**: describe 単位の分割と、`panel-tabs.test.ts` / `group-label.test.ts` / `findRow` の単体テスト
- **根拠**: CONV-3、H、vitest.config.ts:13
- **scope 根拠**: 本 PR の新設ファイル

### [Medium] `docs/ui-coverage.md` F 節で element 名が制御文字 (ESC / TAB) に化けている (M-009) (scope: feature)

- **観察**: `docs/ui-coverage.md:323` で `` `elements-settings-panel` `` の `` `e `` が ESC (0x1B) に、`:338` で `` `threadlist-sidebar` `` / `` `thread-list.aui.tsx` `` の `` `t `` が TAB (0x09) に置き換わっている。PowerShell の backtick の escape と一致する
- **同種事象探索**: 制御文字を src / e2e / perf / specs/013 / docs / .specify/spec-gate で検索して 2 行 (`ui-coverage.md:323, 338`)
- **リスク/影響**: Constitution XIII の「照合の相手は名前で引ける」が F 節で成り立たない。表示も崩れうる
- **推奨アクション**: 2 行を正しい名前に戻す。markdown は Write / Edit ツールで書く。docs の制御文字の検査は system-scope
- **根拠**: Constitution XIII、CONV-6
- **scope 根拠**: 本 PR で書き換えた行 (SH-010)

### [Low] 古い注記・テスト名が残っている (L-001) (scope: feature)

- **観察**: 「ナビ」: `session/labels.ts:165`、`session-view.ts:399`、テスト名 `RunningSessionList.monitor.test.tsx:33, 163, 227`。`shell/labels.ts:38` の「今の `SCREEN_LABELS`」。`thread-list.aui.tsx:35, 115` の `ThreadListNew` の復元の注記。`queue-behavior.test.tsx:138-139` の中断の単一の locus の帰属 (正しくはストアの interrupt)
- **同種事象探索**: 9 か所
- **推奨アクション**: 文言を「区画の見出し」「ストアの interrupt」などに直す。testid `session-nav-*` は変えなくてよい
- **根拠**: FR-013、CONV-6

### [Low] dead code: `ThreadListNew` と `SESSION_ACTION_LABELS.newSession` を使う側が 0 になった (L-002) (scope: feature / system)

- **観察**: `thread-list.aui.tsx:118` の `ThreadListNew` と `session/labels.ts:120` の `SESSION_ACTION_LABELS.newSession` の参照が 0。使われない export を検出する lint 規則が無い
- **推奨アクション**: 2 つを削除し、vendored の削りの表に書く。検出の導入は system-scope
- **根拠**: CONV-5

### [Low] UI の文言が、無くなった「画面」の遷移を案内している (L-003) (scope: feature)

- **観察**: `session/labels.ts:287, 288, 291, 392` (「「作業フォルダ」画面で登録してください」など)。`ResolutionScreen.tsx:254, 261` も同じ書き方
- **推奨アクション**: 「設定の「作業フォルダ」で登録してください」のように直す。最終判断は ux-reviewer (pr-gate)
- **根拠**: FR-013、Principle XV、AD-046 Decision 6

### [Low] data-model §6 (文言の正本) と実装の文言の置き場がずれている。概要の見出しは起動ダイアログの見出しの複製 (L-004) (scope: feature)

- **観察**: §6 は `runningHeading` を `shell/labels.ts` に定めるが、実装は `SESSION_LIST_LABELS.heading`。`SHELL_LABELS` に §6 に無いキーが 9 つ。`OVERVIEW_LABELS` の 4 キーが `LAUNCH_AXIS_LABELS` と同じ文字列。plan の Project Structure に 5 ファイルが無い
- **推奨アクション**: data-model §6 と plan を実装に合わせる。`OVERVIEW_LABELS` の 4 キーは `LAUNCH_AXIS_LABELS` から引く
- **根拠**: CONV-6、tasks.md:7、data-model §6

### [Low] `test-support/running-workspace.tsx` の名前が WorkspaceFolder / AD-025 の Workspace と紛れる (L-005) (scope: feature)

- **推奨アクション**: `RunningSessionsHarness` などに改名する
- **根拠**: Constitution XIV、CONV-2

### [Low] import の並びが同じ PR の中で揃っていない (L-006) (scope: feature / system)

- **観察**: `OverviewTab.tsx:3-8`、`SessionListScreen.tsx:39`
- **推奨アクション**: 英字順に直す。規則の導入は system-scope
- **根拠**: CONV-4

### [Low] e2e / perf で起動の入口と稼働中の行の locator を複製している (L-007) (scope: feature)

- **観察**: `perf/real-sessions.spec.ts:191-193, 205-209` が `e2e/support/launch.ts:68-79` の `openLaunchDialog` / `runningRows` と同じ locator を書き直している。`launch-dialog.spec.ts:17-20` / `multi-session.spec.ts:38-41` に中身の無い別名関数
- **推奨アクション**: perf は `openLaunchDialog` を import する
- **根拠**: CONV-5、FR-011

### [Low] session-list の部品が `openSettings('folders')` でシェルの面の状態を直接書いている (L-008) (scope: feature)

- **観察**: `SessionListScreen.tsx:730, 1042`。`stores/ui.ts:13-14` と ui charter :166-168 は例外を `seedFolderDraft` だけと書いている
- **推奨アクション**: 例外を明記するか、名前付きの受け渡しにまとめる。不変条件に当たるかの判定は architecture-reviewer に申し送る
- **根拠**: CONV-3、ui charter :166-168

### [Low] 命名の細部 (L-009) (scope: feature)

- **観察**: `SECTION_CONTENT` に `SETTINGS_` の接頭辞が無い。quickstart V-1 の grep に単語の境界が無い。`focus` と DOM のフォーカスの紛れ。`CenterPane` の "Pane"
- **推奨アクション**: `SETTINGS_SECTION_CONTENT` に改名、V-1 の grep を `\b(SCREENS|ScreenId|setScreen)\b` に、glossary の Shell に `focus` の Counterexample を 1 行
- **根拠**: CONV-2 / CONV-6、Constitution XIV

### [Low] reviewers.yml の追加は正しいが、`features/shell/*.ts` の変更では ux / a11y が発火しない (L-010) (scope: system)

- **観察**: 追加した glob が `*.tsx` なので、`labels.ts` / `panel-tabs.ts` だけを変える PR では ux-reviewer が起動しない。他の feature の `labels.ts` も同じ (既存の状態)
- **推奨アクション**: system-scope で `src/renderer/src/features/*/labels.ts` を足すかを判断する。本 PR では必須ではない
- **根拠**: AGENTS.md「reviewer の発火条件の正本は reviewers.yml」

### H の観点 (担当範囲)

- lint による regression の根拠: 7 検出器すべて exit 0。レイヤ規則・循環依存・`not-to-test` は新しい `features/shell/` にも機械的に掛かっている
- M-003 / M-004 / M-005 は今のテストでは検出できない。M-006 は本番の経路のテストが 0 件であることそのもの
- シェルは DOM の属性 (`data-focus` / `data-collapsed` / `data-section` / `data-testid="center-header"`) で状態を出しており、テストから観測できる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (lint) | lint-agent JSON `exit_code` / `violations[]` | 0 | 7 検出器すべて exit 0 |
| M-001 | `LivePane\|LiveCenter\|LaunchPanel` (src) | 8 | LivePane.tsx:44,67 ほか |
| M-002 | `RunningSessionsView\|useRunningSessionsView\|running-sessions-view` (src) | 21 | running-sessions-view.ts:12 ほか |
| M-003 | `data-testid="center-header"` (renderer) | 2 | LivePane.tsx:292 / CenterPane.tsx:114 |
| M-004 | `new Intl.DateTimeFormat('ja-JP'` + `登録フォルダ'` | 3 + 2 | SessionListScreen.tsx:62 / CenterPane.tsx:76 / OverviewTab.tsx:96 / group-label.ts:45 / SessionListScreen.tsx:111 |
| M-005 | `SHELL_WIDTHS\|shellThreshold\|w-\[280px\]\|w-80\|w-12\|w-10` | 10 | useAutoCollapse.ts / Sidebar.tsx:38,82 / RightPanel.tsx:38 |
| M-006 | `densityToggle\|<ChatScreen` + AppShell.test の密度 | 本番 1 / テスト 0 | CenterPane.tsx:129 |
| M-007 | `行の部品と派生値を変え` (docs, specs) | 3 (+1) | roadmap.md:175,259 / plan.md:93 / session charter:203 |
| M-008 | Glob `features/shell/*` | テスト 1 | AppShell.test.tsx (683 行) |
| M-009 | 制御文字 (docs) | 2 | ui-coverage.md:323,338 |
| L-001 | 古い語 (src, e2e, perf) | 9 | session/labels.ts:165 ほか |
| L-002 | `ThreadListNew\|ACTION_LABELS\.newSession` | 参照 0 | thread-list.aui.tsx:118 / session/labels.ts:120 |
| L-003 | `画面で\|画面から\|…` (features) | 6 | session/labels.ts:287,288,291,392 / ResolutionScreen.tsx:254,261 |
| L-004 | 軸の名前の文字列 (features) | 4 キー | session/labels.ts:279-282 / shell/labels.ts:49-55 |
| L-005 | `RunningWorkspace\|running-workspace` | 5 | running-workspace.tsx:12 ほか |
| L-006 | 新設ファイルの import の目視 | 2 | OverviewTab.tsx:3-8 / SessionListScreen.tsx:39 |
| L-007 | サイドバーの locator / `[data-testid="session-list"]` | 2 / 4 | e2e/support/launch.ts / perf/real-sessions.spec.ts |
| L-008 | `openSettings\(` (renderer) | shell の外 1 | SessionListScreen.tsx:730,1042 |
| L-009 | `SECTION_CONTENT` / `setFocus(` | 各 1 ファイル | SettingsDialog.tsx:16 / useShellFocus.ts |
| L-010 | reviewers.yml の `labels.ts` を含む glob | 0 | reviewers.yml:42-61,89-108 |

## Verdict

- Critical: 0 (lint-agent の 7 検出器はすべて `exit_code: 0`、`violations: []`。非ゼロ終了のコマンドは 0 件なので、CONV-1 の Critical は成立しない)
- High: 0
- Medium: 9 (F: M-001, M-002, M-003, M-004, M-005, M-007, M-009 / H: M-006, M-008)
- Low: 10 (F: L-001〜L-010)

(invoker 注: 原文の観察と推奨アクションを保存の際に要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
