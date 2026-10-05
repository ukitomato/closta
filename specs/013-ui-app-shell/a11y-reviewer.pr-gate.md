# a11y-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: a11y-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 2 (pr-gate。HEAD bb6f547、R1 の後の修正 = `git diff 7d46352..bb6f547`)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 (ランドマーク): `AppShell.tsx` のスキップリンク、`CenterPane.tsx` の `main` の `tabIndex={-1}`
  - FR-002 / FR-003: `Sidebar.tsx` (開閉のボタンを 1 つの要素にした)、`CenterPane.tsx` (空の状態の CTA の順)
  - FR-005: `CenterHeader.tsx` の `title`
  - FR-006 (`watchedId`): `stores/ui.ts` の `watchedIdOf` に `launchOpen` を追加、`SessionAttentionAnnouncer.tsx:28`、`RunningSessionList.tsx:153-157`
  - FR-007 / FR-008: `LaunchDialogHost.tsx` / `SettingsDialog.tsx` / `useDialogReturnFocus.ts`
  - FR-014: `RightPanel.tsx` / `useCollapseFocus.ts` / `useAutoCollapse.ts`
  - SC-001 (vitest-axe の違反 0)、SC-007、spec Edge Cases の「キーボードだけの操作」(spec.md:147) と「focus の側の行だけを強調する」
- touched files に該当する charter / Confirmation:
  - ui charter の Scope「アプリのシェル」、AD-046 Decision 1・5 と Confirmation
  - Constitution Principle VIII の Manual の検証者 (a11y-reviewer)。V-3 #8 (quickstart-results.md:63) は利用者が OK にした
  - vendored の部品 (reviewers.yml の exclude_patterns) は根拠として読んだだけ。`thread.aui.tsx` / `thread-list.aui.tsx` は手で直したコピーで除外の対象ではない
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の Owner 範囲外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: Owner 範囲外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: Owner 範囲外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: Owner 範囲外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: Owner 範囲外 (po-reviewer)。a11y が AC に触れる点は G に入れた
- F. 命名 / module / lint hookup: 該当なし: Owner 範囲外 (convention-reviewer)
- G. optional reviewer 範囲 (a11y / WCAG 2.1 AA): Critical:0 High:0 Medium:3 Low:6
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R1 の後の修正の src 側をすべて読み、関係するファイルの今の中身とライブラリ (Radix の FocusScope / Dialog、`ThreadListItemRoot.js`、`ComposerInput.js`、`external-store-thread-runtime-core.js`、Tailwind v4 の `not-sr-only`) を確かめた。R1 の High 2 件は両方とも直っていて、テストもある。新しい指摘は 3 系統: (1) `main` の `tabIndex={-1}` がクリックの後のキーボードでのスクロールを止めるおそれ (推定)、(2) R1 で見落としていた、フォーカスがシェルの外から動かされる経路 2 つ、(3) 開閉のボタンとスキップリンクの細かい点。

## Round 1 の指摘の判定

| R1 ID | R1 の severity | 判定 | 根拠 (事実) |
|---|---|---|---|
| H-001 | High | **resolved** | `useDialogReturnFocus.ts:24-53`、`LaunchDialogHost.tsx:32,53`、印 (`Sidebar.tsx:92,105,119,157`)。テスト `AppShell.test.tsx:823` / `:833` |
| H-002 | High | **resolved** | `Sidebar.tsx:70-81`、`RightPanel.tsx:71-83`、`useCollapseFocus.ts:13-45`、`RightPanel.tsx:45-50,94`。テスト `:887` / `:898` / `:908`。細かい点は L-101 / L-102 |
| M-001 | Medium | **resolved** | `thread-list.aui.tsx:351`。テスト `:924` |
| M-002 | Medium | **resolved** | `watchedIdOf` の `!ui.launchOpen`。テスト `ui.test.ts` と `AppShell.test.tsx:802` |
| M-003 | Medium | **resolved** | `SettingsDialog.tsx:45,61`。テスト `:848` |
| M-004 | Medium | **resolved (最小案)** | `RightPanel.tsx:22-23`、`:102-129`、roadmap.md:295 |
| M-005 | Medium | **resolved (最小案)** | `AppShell.tsx:53-63`、`CenterPane.tsx:40-44`。V-3 #8 OK。自動テストは無い (M-007)。新しく M-103 / L-103 |
| M-006 | Medium | **partially → Low** | 過去の行の題 (`thread-list.aui.tsx:308-318`) にツールチップが無い |
| M-007 | Medium | **partially → Low** | 設定のダイアログと focus=past に axe が無い。スキップリンクと起動の受け付け後のフォーカスのテストが無い |
| L-001 | Low | **partially** | `WorkspaceFoldersScreen.tsx:363` の h1、`main` に見出しが無い |
| L-002 | Low | **resolved** | `LaunchDialogHost.tsx:60-62`、`labels.ts:33` |
| L-003 | Low | **resolved** | `SettingsDialog.tsx:88-111` |
| L-004 | Low | **partially** | `LivePane.tsx:97-103` の `role="status"` が中身と一緒にマウントされる |
| L-005 | Low | **resolved (受け入れを記録)** | data-model.md:85 |
| L-006 | Low | **移送 (O-3)** | roadmap.md:294 (ii) |
| L-007 | Low | **移送 (O-3、system)** | roadmap.md:179 (7) |

## Findings

### [Medium] `main` を常にフォーカスできるようにしたので、会話の本文をクリックした後に矢印 / PageDown / Space で transcript がスクロールしなくなるおそれがある (M-103) (scope: feature)

- **観察**: `CenterPane.tsx:42` の `tabIndex={-1}` で `main` はクリックでフォーカスを受ける。transcript のスクロールの容器 (`thread.aui.tsx:214-216`、`:442`) は `tabIndex` を持たない。本文をクリックするとフォーカスは `main` に移る。Chromium のキーボードでのスクロールはフォーカスのある要素から祖先へたどってスクロールの容器を探す。`main` は `overflow-hidden` (`:44`) で、祖先にスクロールできる容器は無い。**実機では確かめていない。ブラウザの振る舞いからの推定**
- **同種事象探索**: `tabIndex=\{-1\}` (renderer/src) 1 件 (`CenterPane.tsx:42`)
- **リスク/影響**: 本文をクリックして PageDown で読み進める操作が効かなくなる (WCAG 2.1.1 の趣旨。今回の修正による退行)
- **推奨アクション**: `main` の先頭に `tabIndex={-1}` の sr-only の見出しを置き、スキップリンクはそこへ移す (L-001 の残りも解消)。または押したときだけ `tabindex="-1"` を付けて blur で外す。V-3 に「本文をクリックして PageDown でスクロールする」を足す
- **根拠**: WCAG 2.1.1 / 2.4.1、M-005 の修正 (R1)

### [Medium] 表示中のセッションを中央の「閉じる」で閉じると、押したボタンが消えてフォーカスが body に落ちる (サイドバーの行の「閉じる」も同じ) (M-102) (scope: feature)

- **観察**: `LivePane.tsx:145-156,304-308` → `running-session-store.ts:548` → `useShellFocus.ts:37-48` で中央が `CenterEmpty` に替わり、押した「閉じる」が unmount される。シェルでフォーカスを動かすのは `AppShell.tsx:59`、`useCollapseFocus.ts:42`、`useDialogReturnFocus.ts:49,52` だけ。行の「閉じる」(`RunningSessionList.tsx:538-549`) と、取り直しで表示中の過去の行が消える経路 (`useShellFocus.ts:67-69`) も同じ
- **同種事象探索**: 自分が消えるボタン 2 か所、中央の中身が消える経路 1 か所。`\.focus\(` は features/session (テスト以外) で 0 件
- **推奨アクション**: 中央の経路 (O-7): `focus` が `running` から `none` に変わり `document.activeElement` が body なら、中央の空の状態の主な CTA へフォーカスを移す。テストを足す。行の経路 (session feature): 隣の行か見出しへ。本 PR で直さないなら roadmap の system-scope に送る
- **根拠**: WCAG 2.4.3、APG
- **scope 根拠**: 中央の切り替えの書き手 `useShellFocus.ts` は本 PR で新設。行の経路は X-5 から前からあり、system

### [Medium] 表示中のセッションのターンが始まるたびに、composer がシェルのどこからでもフォーカスを奪う (M-101) (scope: system)

- **観察**: `thread.aui.tsx:579-592` の `ComposerPrimitive.Input` は `autoFocus` (既定 true。`LivePane.tsx:204`) で、`unstable_focusOnRunStart` / `unstable_focusOnThreadSwitched` を上書きしていない (src に 0 件)。ライブラリの既定は true (`ComposerInput.js:51`) で、`thread.runStart` を受けると `textarea.focus()` を呼ぶ (`:123-130,134-149`)。外部ストアの runtime は `isRunning` が false→true のたびに出す (`external-store-thread-runtime-core.js:107-111,259-260`)。`isRunning` は `running` と `awaiting_permission` で true (`RunningSessionsProvider.tsx:149`)。キューに積んだ入力が送られると、利用者がサイドバー・右のペイン・中央のヘッダにいてもフォーカスが composer に移る
- **同種事象探索**: `unstable_focusOn` (src) 0 件、composer の利用 1 か所
- **推奨アクション**: `LivePane` の composer で `unstable_focusOnRunStart={false}`。`unstable_focusOnThreadSwitched` は判断して記録する。テストを足す
- **根拠**: WCAG 2.4.3 / 3.2 系の趣旨
- **scope 根拠**: composer の設定は X-2 / X-5 から前からある。本 PR が `thread.aui.tsx` で変えたのはコメントだけ。roadmap の system-scope へ

### [Low] 右のペインを開いた状態で、開閉のボタンが見た目では右端なのに Tab 順ではタブより先に来る (L-101) (scope: feature)

- **観察**: `RightPanel.tsx:71-83`、`order-last` (`:76`)
- **推奨アクション**: `order-last` を外し、開いた状態でもボタンを左端 (中央に面した側) に置く
- **根拠**: WCAG 2.4.3 / 1.3.2

### [Low] 開閉のボタンの名前と `aria-expanded` が同時に変わり、状態を 2 重に伝える (L-102) (scope: feature)

- **観察**: `Sidebar.tsx:75-77`、`RightPanel.tsx:77-79`
- **推奨アクション**: `aria-label` は固定にして `aria-expanded` で状態を伝える。今の形を残すなら data-model §2 に記録する
- **根拠**: WAI-ARIA APG の Disclosure、WCAG 4.1.2

### [Low] スキップリンクにフォーカスしたとき `px-3 py-2` が効かず、余白 0 で表示される (L-103) (scope: feature)

- **観察**: `AppShell.tsx:55` の `focus:not-sr-only` は `padding: 0` を含む。付記: 移った後の `main` は `outline-none` (`CenterPane.tsx:44`) で印が無い
- **推奨アクション**: `focus:px-3 focus:py-2` を足す
- **根拠**: WCAG 2.4.7

### [Low] (R1 M-006 の持ち越し) サイドバーの過去の行の題は、切り詰めた後の全文をキーボードでは見られない (M-006) (scope: feature)

- **観察**: `thread-list.aui.tsx:308-318`。`renderTooltip` は `RunningSessionList.tsx:96,131` だけ
- **推奨アクション**: `SessionListScreen` からも `renderTooltip` を渡す
- **根拠**: WCAG 1.4.13 / 2.1.1 の趣旨、Principle VIII

### [Low] (R1 L-001 の持ち越し) 設定のダイアログの中の h1 と、`main` の見出しが残っている (L-001) (scope: feature)

- **観察**: `WorkspaceFoldersScreen.tsx:363` の h1。ほかの 3 画面は h2
- **推奨アクション**: 4 画面の見出しを h3 にそろえる (少なくとも h1 を外す)。`main` の見出しは M-103 でまとめて足す

### [Low] (R1 L-004 の持ち越し) 「起動中」の `role="status"` が中身と一緒にマウントされ、読まれない支援技術がある (L-004) (scope: feature)

- **観察**: `LivePane.tsx:59`、`:97-103`
- **推奨アクション**: `LaunchDialogHost` の中に開いている間ずっとマウントしておく `role="status"` の sr-only の要素を置く
- **根拠**: WCAG 4.1.3

### [Low] (R1 M-007 の持ち越し) a11y の自動テストの残り (M-007) (scope: feature)

- **観察**: 設定のダイアログと focus=past に axe が無い。スキップリンク、`useDialogReturnFocus` の 3 つ目の規則、起動の受け付けの後のフォーカス (`:513-531`)、M-101〜M-103 のテストが無い
- **推奨アクション**: 各項目で axe を流す。スキップリンクのテスト、起動の受け付けの後のフォーカスのテスト、M-102 のテスト
- **根拠**: spec SC-001、reviewer-base の H の規定

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-103 | `tabIndex=\{-1\}` (renderer/src) | 1 | CenterPane.tsx:42 |
| M-102 | `\.focus\(` (features/shell・features/session、テスト以外) / 自分が消えるボタン / 中央の中身が消える経路 | shell 4 / session 0 / 2 / 1 | AppShell.tsx:59, useCollapseFocus.ts:42, useDialogReturnFocus.ts:49,52 / LivePane.tsx:304-308, RunningSessionList.tsx:538-549 / useShellFocus.ts:67-69 |
| M-101 | `unstable_focusOn` (src) / composer の利用 | 0 / 1 | thread.aui.tsx:579-592 |
| L-101 | `order-last\|order-first` (renderer/src) | 1 | RightPanel.tsx:76 |
| L-102 | 状態ごとに変わる `aria-label` と `aria-expanded` | 2 | Sidebar.tsx:75-77, RightPanel.tsx:77-79 |
| L-103 | `not-sr-only` (renderer/src) | 1 | AppShell.tsx:55 |
| M-006 | `renderTooltip` (src、テスト以外) | 1 | RunningSessionList.tsx:96,131 |
| L-001 | `<h[1-6]` (features、テスト以外) | h1 1 | WorkspaceFoldersScreen.tsx:363 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3 (M-101 system / M-102 feature / M-103 feature)
- Low: 7 (M-006 / M-007 / L-001 / L-004 / L-101 / L-102 / L-103)
- Round inheritance: resolved from 1: 10 / unresolved (partially): 4 (M-006 / M-007 / L-001 / L-004) / 移送: 2 (L-006 / L-007) / new: 6 (M-101 / M-102 / M-103 / L-101 / L-102 / L-103)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
