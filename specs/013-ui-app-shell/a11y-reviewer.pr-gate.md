# a11y-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: a11y-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 3 (pr-gate。HEAD bcd6aa4。R2 の後の修正 = `a78a291..bcd6aa4`)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / WCAG 2.4.1: スキップリンク `AppShell.tsx:53-64,79-85`。`main` の常時の `tabIndex` を外した (`CenterPane.tsx:49-58`)
  - FR-002 / US-1 AC8: `Sidebar.tsx:85-166`。畳んでも中身を `hidden` のまま残す
  - FR-003: `CenterPane.tsx:39-47,115,123`。中央の中身が替わったときにフォーカスを拾い直す (`useFocusRescue`)
  - FR-007 / FR-008: `LaunchDialogHost.tsx:51`、`useDialogReturnFocus.ts:46-56`、`SettingsDialog.tsx:68-69`
  - FR-014: `RightPanel.tsx:45` (名前を変えただけ)、`useFocusRescue.ts:16-55`
  - SC-001 (vitest-axe の違反 0): `AppShell.test.tsx:1166` を追加
- touched files に該当する charter / Confirmation: ui charter の Scope「アプリのシェル」、AD-046 の Decision 1・2・3・5 と Confirmation (SC-001〜005 と V-3)、Constitution Principle VIII の Manual の検証者 (a11y-reviewer)。V-3b (`quickstart-results.md:73-83`) は未実施
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の Owner 範囲外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: Owner 範囲外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: Owner 範囲外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: Owner 範囲外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: Owner 範囲外 (po-reviewer)。AC に関わる a11y の点は G に入れた
- F. 命名 / module / lint hookup: 該当なし: Owner 範囲外 (convention-reviewer)
- G. optional reviewer 範囲 (a11y / WCAG 2.1 AA): Critical:0 High:0 Medium:1 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R2 の後の修正 (src・reviewers.yml・docs) をすべて読み、関係するファイルの今の中身と Tailwind v4 の preflight を確かめた。

- R2 の feature 範囲の Medium 2 件 (M-102 の中央の経路、M-103) は直っていて、テストもある
- 畳んだサイドバーの `hidden` は、preflight の `[hidden]:where(:not([hidden='until-found'])) { display: none !important; }` (`node_modules/tailwindcss/preflight.css:396-398`) があるので `.flex` に上書きされず、実ブラウザでも表示と支援技術の両方から外れる。jsdom の `toBeVisible` は属性しか見ないので、テストだけではこの根拠にならない
- 畳んだ間もマウントしたままの区画の中から、プログラムでフォーカスを移すコードは無い
- 新しい指摘は 2 件: R2 M-102 の同種事象探索の漏れ (中央の中身が替わらないまま押したボタンだけが消える経路 4 つ。前からある部品で system) と、スキップリンクの行き先に残った点

## R2 の指摘の判定

| R2 ID | R2 の severity | 判定 | 根拠 (事実) |
|---|---|---|---|
| M-101 | Medium (system) | **移送 (記録あり)** | `docs/roadmap.md:189-196` (持ち主は X-6、テストの観点も書いてある) |
| M-102 | Medium | **resolved (中央) / 移送 (行)** | `CenterPane.tsx:39-47`、`[data-center-primary]` (`:115,123`)、`useFocusRescue.ts:43,48-55`。テスト `AppShell.test.tsx:1119`。行の経路は `docs/roadmap.md:198-201`、data-model.md:39。同種事象の漏れは M-201 |
| M-103 | Medium | **resolved** (残りは L-201) | `CenterPane.tsx:49-58` に `tabIndex` が無い。`AppShell.tsx:79-85` の `focusCenter` が移す間だけ付ける。テスト `:1107`、記録 data-model.md:77。見た目は V-3b #3 |
| L-101 | Low | **受け入れ (記録あり)** | data-model.md:79。`RightPanel.tsx:71-83` と合う |
| L-102 | Low | **受け入れ (記録あり)** | data-model.md:80 |
| L-103 | Low | **resolved** (見た目は V-3b #3 待ち) | `AppShell.tsx:56`。付記の「行き先の `main` に印が無い」は残る (L-201) |
| M-006 | Low | **unresolved** | `renderTooltip` は今も `RunningSessionList.tsx:96,131` だけ。受け入れの記録も無い |
| M-007 | Low | **partially** | 足されたもの: 設定の 4 項目と過去の会話の axe (`:1166`)、スキップリンク (`:1107`)、中央の拾い直し (`:1119`) |
| L-001 | Low | **partially** | `WorkspaceFoldersScreen.tsx:363` は h2 になった。`main` の見出しは稼働中・過去の会話のとき今も無い。記録も無い |
| L-004 | Low | **unresolved** | `LivePane.tsx:97-103` は変わっていない |

## Findings

### [Medium] 中央の中身が替わらないまま押したボタンが消える経路が 4 つあり、フォーカスが body に落ちる (承認カードの「許可」「拒否」ほか) (M-201) (scope: system)

- **観察**: 承認カードの「拒否」「許可」(`ApprovalCard.tsx:45-50`) を押すと `running-session-store.ts:494-498` が同期で `pending: null` にし、`LivePane.tsx:175-182` がカードを外す。`shown` は `running` のままで、`useFocusRescue` は `trigger` が変わったときしか動かない (`useFocusRescue.ts:37-44`、`CenterPane.tsx:43-47`)。承認待ちの間も `isRunning` は true のままなので、承認の後に composer が run の開始でフォーカスを取ることも起きない。同じ形のものが他に 3 つ: `QueueRejectionNotice` の「閉じる」(`LivePane.tsx:341-348`)、`PendingQueueNotice` の「キューから削除」(`LivePane.tsx:397-404`)、「表示を増やす」(`LivePane.tsx:183-193`。最後の押下でバーごと消える)。R2 M-102 の同種事象探索で数え漏らした
- **同種事象探索**: `LivePane.tsx` / `ApprovalCard.tsx` の `onClick=` 7 件のうち 4 件。`features/session` の `.focus(` / `autoFocus` は 0 件
- **リスク/影響**: 承認は主な操作で、唯一の経路 (`ApprovalCard.tsx:6`)。キーボードで「許可」を押すたびに次の Tab が文書の先頭から始まる (WCAG 2.4.3)
- **推奨アクション**: 本 PR で直さないなら roadmap の「O-7 の pr-gate R2 が見つけた system-scope の項目」の (2) に 4 件を足す (持ち主は (2) と同じ)。直し方は (a) 各部品で消える前に composer へ移す、(b) `CenterPane` の `main` で `focusout` を受け、`relatedTarget === null` なら次の microtask で `focusLost(document.activeElement)` を見て composer か `[data-center-primary]` へ移す (`trigger` に依らず 4 件とも拾える)。テスト: 承認待ちで「許可」を押した後、composer にフォーカスがある
- **根拠**: WCAG 2.4.3、WAI-ARIA APG
- **scope 根拠**: 4 件とも X-1 / X-2 / X-5 からある session の部品で、今回の修正の差分は触れていない。(b) なら O-7 のファイルだけで直せる

### [Low] スキップリンクの後に本文をクリックすると `main` がフォーカスを持ち続け、行き先に印も無い (L-201) (scope: feature)

- **観察**: `AppShell.tsx:79-85` の `focusCenter` は `blur` のときにしか `tabindex` を外さない。`main` にフォーカスがある間に本文をクリックすると行き先は `tabindex="-1"` の `main` 自身なので、blur は起きず `tabindex` も残る。「スキップリンク → 本文をクリック → PageDown」では R2 M-103 と同じくスクロールしないおそれがある (推定・実機未確認)。行き先の `main` は `outline-none` (`CenterPane.tsx:55`) で印が無い。V-3b #3 (`quickstart-results.md:79`) は 2 つの順を 1 行にまとめている
- **同種事象探索**: `setAttribute\('tabindex'` (renderer/src) 1 件 (`AppShell.tsx:82`)
- **推奨アクション**: `focusCenter` で `pointerdown` (capture・once) のときにも `tabindex` を外す。行き先の印は `tabindex` を付けている間だけ出す (例: `[tabindex]:focus-visible` に ring)。出さないなら data-model §2 に記録する。V-3b #3 を 2 行に分ける
- **根拠**: WCAG 2.1.1 / 2.4.7

### [Low] (R2 M-006 の持ち越し) 切り詰めた全文を `title` でしか読めない箇所が増えた (M-006) (scope: feature)

- **観察**: 過去の行の題 (`thread-list.aui.tsx:308-318`) にツールチップが無い。今回の `title` もマウスでしか出ない: `SessionListScreen.tsx:137`、`:402`、`SessionNavBadge.tsx:40`
- **推奨アクション**: `SessionListScreen` からも `renderTooltip` を渡す。直さないなら data-model §3 に受け入れを記録する
- **根拠**: WCAG 1.4.13 / 2.1.1 の趣旨、Principle VIII

### [Low] (R2 L-001 の持ち越し) `main` に見出しが無い (L-001) (scope: feature)

- **観察**: 中央は空の状態 (`empty-state.tsx:26` の h2) と Welcome (`thread.aui.tsx:533` の h1) のときしか見出しを持たない。`CenterHeader` の題は見出しの要素ではない
- **推奨アクション**: `CenterHeader` の題を h2 にする。直さないなら記録する
- **根拠**: WCAG 1.3.1 / 2.4.6

### [Low] (R2 L-004 の持ち越し) 「起動中」の `role="status"` が中身と一緒にマウントされる (L-004) (scope: feature)

- **観察**: `LivePane.tsx:97-103` は変わっていない
- **推奨アクション**: R2 と同じ。または受け入れを記録する
- **根拠**: WCAG 4.1.3

### [Low] (R2 M-007 の持ち越し) a11y のテストの残りと、R2 で足した規則のテスト (M-007) (scope: feature)

- **観察**: 無いテスト: (1) 起動の受け付けの後のフォーカス (`AppShell.test.tsx:517`) (2) `useDialogReturnFocus.ts:46` の閉じた時点で別の要素がフォーカスを持っていたら動かさない (3) R2 で足した規則 (`useDialogReturnFocus.ts:49,53-56`。開いた元が `hidden` に入った・隠れた印を飛ばす) (4) data-model.md:39 の中央の過去の側 (表示中の過去の行が取り直しで消えたときの拾い直し)
- **推奨アクション**: (3) 設定を開いた後に `setSidebarCollapsed(true)` を呼び、Esc で閉じると帯の「設定」にフォーカスが移る (4) 中央のヘッダの密度の切り替えにフォーカスを置いてから索引を差し替え、空の状態の主な操作に移る (1)(2) は R2 のとおり
- **根拠**: spec SC-001、reviewer-base の H の規定

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-201 | `onClick=` (LivePane.tsx・ApprovalCard.tsx) のうち自分を含む要素が外れ `shown` が変わらないもの / `\.focus\(\|autoFocus` (features/session) | 4 / 0 | ApprovalCard.tsx:45-50 (+ running-session-store.ts:497), LivePane.tsx:341-348, :397-404, :183-193 |
| L-201 | `setAttribute\('tabindex'` (renderer/src) | 1 | AppShell.tsx:82 |
| M-006 | `renderTooltip` (src、テスト以外) / 今回の `title` | 1 / 3 | RunningSessionList.tsx:96,131 / SessionListScreen.tsx:137,402, SessionNavBadge.tsx:40 |
| L-001 | `<h[1-6]\b` (renderer/src、テスト以外) | h1 2 件 (markdown-text.tsx:91・thread.aui.tsx:533) | WorkspaceFoldersScreen.tsx:363 ほか |

## Verdict

- Critical: 0
- High: 0
- Medium: 1 (M-201。system。今回の修正が入れたものではない)
- Low: 5 (L-201 / M-006 / M-007 / L-001 / L-004)
- Round inheritance: resolved from 2: 3 / 受け入れ・移送 (記録あり): 3 / unresolved: 4 (partially 2: M-007 / L-001、そのまま 2: M-006 / L-004) / new: 2 (M-201 / L-201)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
