# po-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: po-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 2 (pr-gate)

## 初回読了 viewpoint

- FR/SC (R1 の後の修正が触ったもの): FR-006 / US-1 AC6 (`watchedIdOf`)、FR-007 / US-2 AC3〜AC5 (`useShellFocus`・`LaunchDialogHost`・`dismissLaunchNotice`)、FR-008 / US-3 AC2 (`useDialogReturnFocus`・`SettingsDialog`)、FR-016 / SC-008 (`useSessions`・V-3)、FR-002 / US-1 AC8 (`Sidebar`・`useAutoCollapse`)、SC-002 / SC-004 / SC-006・AD-046 Confirmation (記録)
- touched files に該当する charter / Confirmation: ui charter の「面の状態」・Principle「見た目の判断を先送りしない」(V-3)、session charter の Cross-domain・KPI「列挙の網羅」、AD-046 Confirmation と訂正の節
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (L-103 は architecture の指摘と重なれば dedup してよい)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:1 Low:5
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当 (L-102 は ux R1 M-007 と同じ種類)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

R1 の後の修正は 53 files。R1 の自分の指摘 11 件のうち 8 件は直り、3 件は一部だけ (記録・テストの残り)。新しく見つけた主な穴は 1 つ: H-001 の修正は「閉じた失敗したセッションが `selectedId` だった」ときだけ働き、中央に出していない別の失敗したセッションをサイドバーで閉じると、古い失敗の告知が残り次の起動の初期値が上書きされる (M-101)。そのほかは Low。

## R1 の指摘の判定

| R1 ID | R1 severity | 判定 | 確かめた事実 |
|---|---|---|---|
| H-001 | High | **resolved** | `useShellFocus.ts:39-44`、data-model.md:35、テスト `AppShell.test.tsx:770-782`。同じ種類の経路 (選んでいないセッションを閉じる) は M-101 |
| M-001 | Medium | **resolved** | `LaunchDialogHost.tsx:37-41` と `dismissLaunchNotice`。テスト `:784-800` / `:833-846` |
| M-002 | Medium | **resolved** | `useSessions.ts:83`、`:92-95`。テスト `SessionListScreen.test.tsx:1154-1188`。検出には上限があり (`wsl-cli.ts:75,78`)、取得中のまま止まらない |
| M-003 | Medium | **resolved** (古い文面が残る → L-103) | `stores/ui.ts:119` ほか。`hideOthers` は `[aria-live]` を隠さないことも確かめた |
| M-004 | Medium | **partially** → Low | 実装とテストはある。spec US-3 AC2 は元が消えたときの戻り先を書いていない |
| M-005 | Medium | **partially** → Medium | 切り詰め・秘密の開き直し・過去ログの composer は足した。U+202E・FE-031 の AC4・SC-004・入れ子のダイアログの Esc・SC-002 の設定の開閉は無く、tasks は `[x]` のまま |
| M-006 | Medium | **resolved** | V-3 の 9 項目すべて OK。CI の e2e は roadmap に completed の前の条件 |
| L-001 | Low | **resolved** | plan.md:85 の引き継ぎの表に 1 か所残るが design の時点の表なので持ち越さない |
| L-002 | Low | **resolved** | `useAutoCollapse.ts:48-56` |
| L-003 | Low | **resolved** | roadmap の O-3 の義務 (2)(c) |
| L-004 | Low | **partially** → Low | 起動ダイアログの案内は直った。spec の Edge Cases にランタイム 0 件の初回が無い |

## Findings

### [Medium] 中央に出していない失敗したセッションをサイドバーの行の「閉じる」で閉じると、次の「新規起動」に古い失敗の告知が出て、初期値がそのセッションの設定に置き換わる。H-001 の修正は `selectedId` だったときにしか働かない (M-101) (scope: feature)

- **観察**: 行の「閉じる」は終了した行ならどれでも押せる。`running-session-store.ts:548-556` の `close` は失敗したセッションなら選んでいるかにかかわらず `previousFailure` を立て `lastConfig` を上書きするが、`selectedId` は選択中のときだけ null にする。`useShellFocus.ts:37` の分岐は `selectedId` が null に変わるときだけ動くので、(a) B を選んで見ている間に失敗した A を閉じた (b) 選択が無い状態で A を閉じた、では `dismissLaunchNotice` が呼ばれない。次に「新規起動」を押すと `role="alert"` で古い告知が出て、初期値は A の設定になる。H-001 の経路でも `lastConfig` は失敗した A のものが残り、理由は消える
- **同種事象探索**: close の経路は 2 つ (`LivePane.tsx:143,154` と `RunningSessionList.tsx:545`)。選んでいないセッションを閉じるテストは 0 件
- **リスク/影響**: H-001 の修正が自分で書いた理由と食い違う。古い alert が支援技術に読まれ、直前に使った起動の設定が黙って置き換わる
- **推奨アクション**: (1) 「中央に出していない失敗したセッションを閉じた」の判定を `selectedId` の変化から切り離す (`previousFailure` が新しく立ち、かつ閉じたセッションが中央に出していたものでなければ `dismissLaunchNotice`)。あるいは `close` に「起動ダイアログを開くか」を渡す (2) 中央に出していない close で `lastConfig` を閉じたセッションの設定にするかを決め data-model §1 に書く (理由を消すなら設定も前に戻すのが一貫する) (3) data-model §1 の表に「選択中でない失敗したセッションを閉じる」の行を足す (4) テストを足す
- **根拠**: PO-4 / PO-6、spec FR-007・US-2 AC3、data-model §1、R1 H-001 / M-001

### [Medium] (H) tasks で完了にしたテストの観点のうち、まだ実在しないものがあり、tasks / SC を直していない (M-005。R1 から持ち越し) (scope: feature)

- **観察**: 残るもの: FE-042 の U+202E、FE-031 の「登録の後にサイドバーへ反映」(US-3 AC4)、SC-004「設定の 4 画面の既存の component テストが、ダイアログの中に置いた形で通る」、Edge Cases の入れ子のダイアログの Esc、SC-002「設定のダイアログを開閉した後も稼働中の状態が保たれる」。tasks の `[x]` と SC の計測経路は変わっていない
- **リスク/影響**: AD-046 Confirmation の 1 つ目は「SC-001〜SC-005」なので、SC-004 の計測経路が満たされないまま Confirmation が満たされたように読める
- **推奨アクション**: テストを足すか、tasks.md の FE-031 / FE-042 と spec の SC-002 / SC-004 の計測経路を実際の観点に合わせて直す。U+202E は 1 本足すのが安い
- **根拠**: PO-3、reviewer-base の H 規則、AD-046 Confirmation、Principle VIII

### [Low] US-3 AC2 が、開いた元が消えたときのフォーカスの戻り先を書いていない (M-004。R1 の Medium から下げて持ち越し) (scope: feature)

- **推奨アクション**: US-3 AC2 に「元が消えていたらサイドバーの「設定」」を足す。FR-007 に起動ダイアログの戻り先を 1 行足す (正本は `useDialogReturnFocus.ts` の表の参照でよい)

### [Low] ランタイムが 0 件の初回の扱いが spec の Edge Cases にまだ無い (L-004。R1 から持ち越し) (scope: feature)

- **推奨アクション**: Edge Cases に「ランタイムが検出できない初回 → 起動ダイアログの blocker の案内に任せる」を 1 行足す

### [Low] サイドバーを畳む (手でも自動でも) と過去の区画が unmount され、所在・フォルダの絞り込みとグループの開閉が既定に戻る (L-101) (scope: feature)

- **観察**: `Sidebar.tsx` は畳んだときに `SessionListScreen` を描かない。絞り込みとグループの開閉はローカルの state (`SessionListScreen.tsx:200,728,729`)。自動の畳みは利用者の操作なしでこれを起こす
- **推奨アクション**: (a) 畳んだときもマウントしたまま隠す (b) 絞り込みを `stores/sessions.ts` に上げる (c) 「畳むと絞り込みは既定に戻る」を Edge Cases に書く、のどれか。(a) か (b) ならテストを 1 本
- **根拠**: PO-4 / PO-6、spec US-1 AC8・FR-002、data-model §2

### [Low] 起動ダイアログは、外側の押下で閉じて入力中の起動の設定を捨てる。同じ理由で設定のダイアログは閉じないように直した (L-102) (scope: feature)

- **観察**: `LaunchDialogHost.tsx:50-52` は起動中でなければ外側の押下で閉じる。起動の設定はローカルの state で unmount で消える。`SettingsDialog` は同じ PR で外側の押下を止めた
- **推奨アクション**: 起動ダイアログも `onInteractOutside` で常に `preventDefault` する (Esc と閉じるボタンは残す)。または US-2 AC3 に「外側の押下で閉じたら入力は捨てる」と書く
- **根拠**: PO-4、spec US-2 AC3・FR-007

### [Low] 「見ているセッション」の定義の古い文面が glossary とコメントに残る (L-103) (scope: feature)

- **観察**: glossary.md:855-856、`session-view.ts:434-435`、`SessionAttentionAnnouncer.tsx:13`
- **推奨アクション**: 3 か所に「起動ダイアログも開いていない」を足す。glossary は data-model §1 の参照の形でもよい

### [Low] (H) quickstart-results の E2E の計測値の記録で、「閾値を割った」が超えたことを指し、`SC-003` が 013 の SC-003 ではなく X-5 の SC-003 を指す (L-104) (scope: feature)

- **推奨アクション**: :21 を「閾値を超えた 1 回」に、:14 / :24 は「X-5 SC-003」と spec の接頭辞を付ける
- **根拠**: PO-2、roadmap の O-3 の義務 (2)(c)

## H の確認

- 今回の指摘を検出できるテスト: M-101 / L-101 / L-102 は 0 件。L-103 / L-104 は文面
- 既存の振る舞いの regression: `vitest run` 1960 passed、E2E 11 passed / 1 failed (composer は本機の 1px の差。CI 待ち)。`useSessions` の呼び出し元は 1 つだけで、`setLoading(true)` の波及は過去の区画に限られる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `\.close\(` (本番) / `previousFailure` (AppShell.test.tsx) | 2 経路 / 3 (どれも選択中を閉じる) | LivePane.tsx:143,154; RunningSessionList.tsx:545 / AppShell.test.tsx:551,780,845 |
| M-005 | 双方向制御文字 (features/shell) / `SettingsDialog\|settings-dialog` (*.test.tsx) | 0 / 1 file | — / AppShell.test.tsx |
| M-004 | `戻り先\|フォーカスを戻\|フォーカスが戻` (spec / plan / data-model / tasks) | 4 (fallback の記述 0) | spec.md:114,198; plan.md:115; tasks.md:57 |
| L-101 | `useState\(` (SessionListScreen.tsx / RunningSessionList.tsx) | 3 / 0 | SessionListScreen.tsx:200,728,729 |
| L-102 | `onInteractOutside` (features/shell) | 2 | SettingsDialog.tsx:60; LaunchDialogHost.tsx:50 |
| L-103 | `watchedId` (docs) + コメント | 3 | glossary.md:855-856; session-view.ts:434-435; SessionAttentionAnnouncer.tsx:13 |
| L-104 | `閾値` (quickstart-results.md) | 2 | quickstart-results.md:21,24 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2 (M-101 新規 / M-005 持ち越し)
- Low: 6 (M-004・L-004 持ち越し / L-101・L-102・L-103・L-104 新規)
- Round inheritance: resolved from 1: 8 / unresolved: 3 (M-004・M-005・L-004 は一部だけ直った) / new: 5 (M-101 / L-101 / L-102 / L-103 / L-104)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
