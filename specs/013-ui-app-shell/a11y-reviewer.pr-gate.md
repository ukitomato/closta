# a11y-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05
**Reviewer**: a11y-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: pr-gate Round 1

## 初回読了 viewpoint

- FR/SC:
  - FR-001 (ランドマーク): `Sidebar.tsx` / `CenterPane.tsx` / `RightPanel.tsx`
  - FR-002 (サイドバーの区画・見出し・件数の印): `Sidebar.tsx` / `RunningSessionList.tsx` / `SessionNavBadge.tsx` / `SessionListScreen.tsx`
  - FR-003 / FR-005: `CenterPane.tsx` / `CenterHeader.tsx`
  - FR-006 (読み上げと `watchedId`): `SessionAttentionAnnouncer.tsx` / `stores/ui.ts`
  - FR-007 (起動ダイアログ): `LaunchDialogHost.tsx` / `LivePane.tsx`
  - FR-008 / FR-009 (設定のダイアログ): `SettingsDialog.tsx`
  - FR-014 / FR-015: `RightPanel.tsx` / `panel-tabs.ts` / `OverviewTab.tsx` / `useAutoCollapse.ts`
  - SC-001 / SC-002 / SC-004 / SC-007、US-1 AC6・AC8 / US-2 AC3・AC5 / US-3 AC2 / US-4 AC4、Edge Cases の「キーボードだけの操作」と「focus の側の行だけを選択中として強調する」
- touched files に該当する charter / Confirmation:
  - ui charter の Scope「アプリのシェル」と業務ルール「assistant-ui の design system に乗る」「日本語で破綻しない」
  - AD-046 Decision 1・Decision 5、Confirmation
  - Constitution Principle VIII の Manual の検証者 (a11y-reviewer)
  - vendored の部品 (`components/ui/**` と assistant-ui registry の複製) は指摘していない。挙動の根拠としてだけ読んだ
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の Owner 範囲外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: Owner 範囲外。US-4 AC5 の HTML 注入は security-reviewer が見る
- C. 業務不変条件 / Charter drift: 該当なし: Owner 範囲外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: Owner 範囲外
- E. User Story / SC / AC / UX: 該当なし: Owner 範囲外 (po-reviewer)。a11y が AC に触れる点は G に入れた
- F. 命名 / module / lint hookup: 該当なし: Owner 範囲外 (convention-reviewer)
- G. optional reviewer 範囲 (a11y / WCAG 2.1 AA): Critical:0 High:2 Medium:6 Low:7
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

a11y の観点で新しく入ったのは、面の開閉 (畳む / 開く・自動の畳み)、ダイアログのフォーカスの出入り、2 つの一覧の片方だけを強調する扱い (`highlightSelected`)、常時マウントの live region。確かめた: ランドマークの数と名前、見出しの段、`aria-current` / `aria-expanded` / tablist の ARIA、フォーカスの戻り、Radix の `hideOthers` と live region の関係、新しい文字色のコントラスト (light / dark とも 4.5:1 以上)、motion、`lang`。

## Findings

### [High] 起動ダイアログを閉じても、開いた元の要素にフォーカスが戻らない (H-001) (scope: feature)

- **観察**: `LaunchDialogHost.tsx:24-42` は `DialogTrigger` を使わず `open` を store で制御し、`onCloseAutoFocus` も渡していない。Radix の modal の `DialogContent` は閉じたときに既定の戻り先を打ち消し `DialogTrigger` の ref にだけ戻す (`@radix-ui/react-dialog/dist/index.mjs:154-157`)。本番のコードに `DialogTrigger` は無いので、閉じると `document.activeElement` は `body` になる。`SettingsDialog.tsx:43-53,68-74` は開いた元を覚えて戻しているが起動ダイアログには無い。経路 (a) サイドバー・畳んだ帯・中央の空の状態から開いて起動せずに閉じる、(b)「閉じて起動し直す」(押したボタンが先に消える)。起動が受け付けられた経路では composer の autoFocus が先に当たる。テスト `AppShell.test.tsx:473-493` は閉じた後のフォーカスを見ていない
- **同種事象探索**: Dialog 4 件 / `onCloseAutoFocus` 1 件 / `DialogTrigger` 1 件 (vendored)。戻り先を持たない Dialog は `LaunchDialogHost.tsx:24` と `WorkspaceFoldersScreen.tsx:160` (登録解除の確認。仮実装)
- **リスク/影響**: キーボードとスクリーンリーダの利用者は起動ダイアログを閉じるたびに位置を失う。主な入口なので毎回起きる
- **推奨アクション**: `SettingsDialog` の開いた元の記録を共通の hook に切り出し `LaunchDialogHost` にも当てる。元が消えているときはサイドバーの「新規起動」(畳んでいれば帯の「新規起動」) に戻す。起動が受け付けられて閉じたときは `activeElement` が body のときだけ戻す。テストを足す。`WorkspaceFoldersScreen.tsx:160` は別の spec (system) で扱う
- **根拠**: WCAG 2.1 SC 2.4.3、WAI-ARIA APG の Dialog (Modal) pattern、spec FR-007
- **scope 根拠**: `LaunchDialogHost.tsx` は本 PR で新設

### [High] サイドバーと右のペインの畳む / 開くボタンが押した瞬間に unmount され、フォーカスと `aria-expanded` の変化が失われる (H-002) (scope: feature)

- **観察**: `Sidebar.tsx:35-81` (帯) と `:83-157` (開いた状態)、`RightPanel.tsx:46-75` (帯) と `:77-125` (開いた状態) は別の木を描き、押したボタンが消える。`features/shell` でフォーカスを動かすのは `SettingsDialog.tsx:72` の 1 か所だけで、押した後は body になる。`useAutoCollapse.ts:29,33` の自動の畳みも同じ。`aria-expanded` は 2 つの別々のボタンに固定の値で付き、状態の変化が支援技術に伝わらない。テストは押した後のフォーカスを見ていない
- **同種事象探索**: フォーカスを動かすのは 1 件。押すと自分が消えるボタンは 5 か所 (`Sidebar.tsx:46`、`:95`、`RightPanel.tsx:48`、`:60`、`:103`)。自動の畳み 2 か所
- **リスク/影響**: US-1 AC8 と US-4 AC4 の操作のたびにキーボードの位置が失われ、結果も読まれない。Edge Cases「キーボードだけの操作」を満たさない
- **推奨アクション**: (a) 最小案: 状態が変わった後に対になるボタンへフォーカスを移す (押したボタンがフォーカスを持っていたか、activeElement が body のときだけ)。帯のタブのアイコンから開いたときは該当する `role="tab"` へ。(b) 望ましい案: 開閉のボタンを 1 つにし同じ位置に描き続け、`aria-expanded={!collapsed}` と `aria-controls` を当てる。`useAutoCollapse` は畳む面の中にフォーカスがあれば開くボタンへ移す。テストを足す
- **根拠**: WCAG 2.4.3、4.1.2、APG の Disclosure pattern
- **scope 根拠**: `Sidebar.tsx` / `RightPanel.tsx` / `useAutoCollapse.ts` は本 PR で新設

### [Medium] 中央に出していない側の一覧でも、選択中の行の listitem に `aria-current="true"` が残る (M-001) (scope: feature)

- **観察**: `thread-list.aui.tsx:264-266,282` は `highlightSelected` が false なら Trigger の `aria-current` を外すが、primitive の `ThreadListItemPrimitive.Root` は選択中の行に無条件で `"aria-current": "true"` を付ける (`@assistant-ui/react/dist/primitives/threadListItem/ThreadListItemRoot.js:45-48`)。`thread-list.aui.tsx:341-379` の Root は打ち消していない。テストは Trigger しか見ていない
- **リスク/影響**: 強調していない側の行も「現在」と読まれ、見た目と食い違う。強調している側では Root と Trigger で二重に読まれる (以前からの重複)
- **推奨アクション**: Root に `aria-current={undefined}` を渡し選択の状態は Trigger だけに持たせる。テストで Root に `aria-current` が無いことを確かめる
- **根拠**: WCAG 1.3.1 / 4.1.2、data-model §1

### [Medium] 起動ダイアログを開いている間、見ているセッションの承認待ちが支援技術に届かない (M-002) (scope: feature)

- **観察**: `watchedIdOf` (`stores/ui.ts:118-123`) は `launchOpen` を見ない。起動ダイアログは modal で `hideOthers` が `main` を含むシェル全体を `aria-hidden="true"` にし、`ApprovalCard` (`role="alertdialog"`) は隠れた木の中にある。`SessionAttentionAnnouncer` はそのセッションを「見ている」として読み上げから外す
- **推奨アクション**: `watchedIdOf` に `!ui.launchOpen` を足し、data-model §1 :47 の理由を直す。テストを足す
- **根拠**: WCAG 4.1.3、spec FR-006 / US-1 AC6

### [Medium] 設定のダイアログを開いた元が、ダイアログの中の操作 (登録の成功) で消えると、閉じたときにフォーカスが失われる (M-003) (scope: feature)

- **観察**: `SettingsDialog.tsx:68-74` は開いた元が `isConnected` のときだけ戻し、それ以外は body になる (H-001 と同じ理由)。開いた元が消える経路が 3 つ (`CenterPane.tsx:102-106`、`SessionListScreen.tsx:1028`、`SessionListScreen.tsx:232-242`)
- **推奨アクション**: 開いた元が消えているときはサイドバーの「設定」(畳んでいれば帯の「設定」) に戻す。テストを足す
- **根拠**: WCAG 2.4.3、spec US-3 AC2

### [Medium] 右のペインのタブに矢印キーの操作が無い (M-004) (scope: feature)

- **観察**: `RightPanel.tsx:79-101` は tablist の ARIA を付けるが、矢印キー・Home/End と roving tabindex が無い。今はタブが 1 つなので害は無いが、後続がこの表に行を足す。`visibleTabs` が空のとき子の無い tablist になる
- **推奨アクション**: 最小案: `panel-tabs.ts` の注記と roadmap の O-4 の行に「2 つ目のタブを足す feature が矢印キーと roving tabindex を入れる」を記録する。`visibleTabs` が空のときは tablist を描かない
- **根拠**: WAI-ARIA APG の Tabs pattern、WCAG 4.1.2

### [Medium] サイドバーの過去の行がすべて Tab 順に並び、中央・「設定」に届くまでの Tab の回数が行の数に比例する (M-005) (scope: feature)

- **観察**: DOM の順は「新規起動」→ 稼働中の区画 → 過去の区画 → 「設定」→ `main` → `aside`。行の Trigger はすべて tab で止まる (primitive は矢印の移動だけ)。過去の行を選んでもフォーカスはサイドバーに残る
- **同種事象探索**: スキップリンク・`href="#` は 0 件
- **リスク/影響**: 晴眼のキーボードの利用者は過去の会話を開くたびに多数の Tab を押すことになる
- **推奨アクション**: 最小案: `App.tsx` の先頭にフォーカスしたときだけ見えるスキップリンク (「会話へ移動」→ `main`。`main` に `tabIndex={-1}`)。望ましい案: 選択中の行の Trigger だけを `tabIndex={0}` にする
- **根拠**: WCAG 2.4.1 / 2.1.1、spec Edge Cases「キーボードだけの操作」

### [Medium] 長い題・フォルダ名を切り詰めた後、全文を見る手段が無い (中央のヘッダ・280px のサイドバーの過去の行) (M-006) (scope: feature)

- **観察**: `CenterHeader.tsx:32-37` は題と補足を `truncate` で切り詰め、代わりの経路を持たない。「概要」は中央のヘッダと重なる項目を出さないので題の全文はどこにも出ない。サイドバーの過去の行も `truncate` で、ツールチップは稼働中の compact の行にしか無い。FE-014 の切り詰めのテストが無い
- **推奨アクション**: 最小案: `CenterHeader` の題と補足に `title` を付け、過去の会話の「概要」に題の全文を足す。FE-014 の切り詰めのテストを足す (ux-reviewer の指摘と重なりうる)
- **根拠**: WCAG 1.4.4 (F69)、Constitution Principle VIII

### [Medium] a11y の自動テストが既定の 1 状態にしか当たらず、本 PR の a11y の振る舞いの多くを検出しない (M-007) (scope: feature)

- **観察**: vitest-axe は既定の状態の `h.container` に 1 回だけ。ダイアログは `document.body` 直下に portal されるので入らない。右のペインを開いた状態・畳んだサイドバー・中央が running / past の状態にも当たっていない。H-001 / H-002 / M-003 のフォーカス、M-001 の Root の `aria-current` を見るテストが無い。読み上げは `aria-hidden` のライブラリが `[aria-live]` を隠さない例外に頼っている
- **推奨アクション**: `axe(document.body, …)` をダイアログ・右のペイン・畳んだサイドバー・focus が running / past の状態で流す。フォーカスの戻りと Root の確認のテストを足す。ダイアログを開いた状態で読み上げの領域が `aria-hidden` の木の外にあることを確かめる
- **根拠**: spec SC-001、reviewer-base の H の規定

### [Low] 見出しの段がシェルの構成と合っていない (L-001) (scope: feature)

- **観察**: 過去の区画の見出し「過去のセッション」は h2 だが一覧の「列挙の結果」も h2 (`SessionListScreen.tsx:562`)。設定のダイアログの題 (h2) の中に作業フォルダの画面の h1 (`WorkspaceFoldersScreen.tsx:363`) とほかの画面の h2 が混ざる。`main` に会話を示す見出しが無い
- **推奨アクション**: サイドバーの中の「列挙の結果」を h3 に。設定の 4 画面の見出しを h3 にそろえる (少なくとも h1 を外す)。中央のヘッダの題を見出しにする
- **根拠**: WCAG 1.3.1 / 2.4.6

### [Low] 起動ダイアログの名前 (sr-only の「新しいセッション」) と見える見出し (「セッションを起動」) が食い違い、h2 が 2 つある (L-002) (scope: feature)

- **推奨アクション**: `SHELL_LABELS.launchDialogTitle` を「セッションを起動」にそろえる。望ましいのは見える h2 を題にする (`aria-labelledby`)
- **根拠**: WCAG 2.5.3 の趣旨 / 1.3.1

### [Low] テーマの切り替えボタンの名前が「ライト」「ダーク」だけで、今の状態か切り替え先かが分からない (L-003) (scope: feature)

- **観察**: `SettingsDialog.tsx:97-101`
- **推奨アクション**: `aria-pressed` のボタンの組 (`role="group" aria-label="テーマ"`) にする。最小案は名前を「ダークテーマにする」にする
- **根拠**: WCAG 2.4.6 / 4.1.2

### [Low] 起動中の表示が live region ではなく、modal の中で「起動中」になったことが読まれない (L-004) (scope: feature)

- **観察**: `LivePane.tsx:93-99` の `Launching` は `role="status"` を持たない
- **推奨アクション**: `Launching` の外枠に `role="status"` を付ける
- **根拠**: WCAG 4.1.3

### [Low] 常時マウントになった過去の区画の live region が、会話の最中や設定のダイアログの中でも読み上げられる (L-005) (scope: feature)

- **観察**: `SessionListScreen.tsx:860-901` の `role="status" aria-live="polite"` (取得時刻・件数) は O-7 でサイドバーに常時マウントされる
- **推奨アクション**: 受け入れるなら data-model §3 に明記する。抑えるなら通知は利用者が取り直したときに限る
- **根拠**: WCAG 4.1.3、2.2.4 の趣旨

### [Low] 過去の区画のフォルダのグループが、それぞれ名前付きの region になり、ランドマークの移動でグループの数だけ止まる (L-006) (scope: feature)

- **観察**: `SessionListScreen.tsx:213-222` の `<section aria-labelledby>` (R-2 a11y H-004)。O-7 で `nav` の中の `main` より前に常時置かれた
- **推奨アクション**: サイドバーではグループを `role="group"` + `aria-labelledby` にする
- **根拠**: WCAG 2.4.1 / 1.3.1

### [Low] composer の名前と placeholder が英語で、`lang="ja"` の文書の中で言語の指定が無い (L-007) (scope: system)

- **観察**: `thread.aui.tsx:580-585` の `placeholder="Send a message..."` / `aria-label="Message input"`。文言は以前からある
- **推奨アクション**: 文言を日本語にする (Principle XV)。e2e の locator を同時に直すので別 spec で扱う
- **根拠**: WCAG 3.1.2

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `<Dialog\b\|onCloseAutoFocus\|DialogTrigger` (components/ui を除く) | Dialog 4 / onCloseAutoFocus 1 / DialogTrigger 1 (vendored)。戻り先の無い Dialog 2 | LaunchDialogHost.tsx:24, WorkspaceFoldersScreen.tsx:160 |
| H-002 | `\.focus\(\|autoFocus\|onCloseAutoFocus` (features/shell) | 1 | SettingsDialog.tsx:72。消えるボタン: Sidebar.tsx:46, :95, RightPanel.tsx:48, :60, :103。自動の畳み: useAutoCollapse.ts:29,33 |
| M-001 | `aria-current\|highlightSelected\|data-active` + primitive の Root | Trigger 側 1 / Root 側の打ち消し 0 | thread-list.aui.tsx:282, ThreadListItemRoot.js:45-48 |
| M-002 | `watchedIdOf` | 2 | SessionAttentionAnnouncer.tsx:28, RunningSessionList.tsx:153-155 |
| M-003 | 開いた元が消える経路 | 3 | CenterPane.tsx:102-106, SessionListScreen.tsx:1028, :232-242 |
| M-005 | `tabIndex` (primitives/thread*) / `skip\|href="#` | 0 / 0 | ThreadListItemRoot.js:26-32 |
| M-007 | `axe\(` (renderer) / `axe\|toHaveFocus` (e2e) | 1 / 0 | AppShell.test.tsx:310 |

## Verdict

- Critical: 0
- High: 2
- Medium: 7
- Low: 7

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
