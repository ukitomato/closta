# ux-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: ux-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 2 (pr-gate。HEAD bb6f547 / base origin/main。R1 の後の修正の差分は `git diff 7d46352..bb6f547`)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-003 / FR-005: サイドバー・中央・空の状態 (`Sidebar.tsx` / `CenterPane.tsx` / `labels.ts`)
  - FR-006: 設定のダイアログの中の件数の印 (`SettingsDialog.tsx:65-68`)、`watchedIdOf` に `launchOpen` を足した変更
  - FR-007: 起動ダイアログ (`LaunchDialogHost.tsx`)、`dismissLaunchNotice`、失敗した close の遷移 (`useShellFocus.ts`)
  - FR-008: 設定のダイアログ (外側の押下・テーマ・`key={section}`)
  - FR-014 / FR-015: 右のペイン・「概要」(`OverviewTab.tsx`)
  - FR-016 / SC-008: 待っている間の取得中 (`useSessions.ts:83`、取得時刻 0 の通知を捨てる処理 :92-95)
  - SC-001 / SC-002 / SC-004 / SC-007
- touched files に当たる charter / Confirmation:
  - ui charter の Scope「アプリのシェル」、業務ルール「日本語で破綻しない」(Principle VIII)、Cross-domain の「面の状態」
  - AD-046 Decision 1〜6 と Confirmation (V-3 は利用者が 2026-10-05 に全項目 OK。quickstart-results:50-64)、AD-046 の訂正の節
  - O-1 の USER 決定「過去の会話や設定を開いている間も、承認待ちと失敗を別々に見せる」(`SessionNavBadge.tsx:17`)
  - data-model §1 / §3 / §5 / §6 (§6 は `features/shell/labels.ts:5` が文言の正本と書いている節)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:6 Low:7
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R1 の High 3 件はどれも直っていて、申告どおりテストもある。R1 の Medium / Low は 12 件が解消、6 件が一部だけ解消、1 件が未対応 (L-005)。申告の中に 1 か所事実と違うところがある。H-003 の「フォルダ名とパスは 1 行に切り詰め (全文は title)」のうち、未登録グループのパスには `title` が無い。修正で切り詰めが実際に効くようになったので、パスの末尾が見えなくなった (M-102)。

修正で新しく出た UX の問題は 3 件 (M-101 / M-102 / L-102)。R1 で見落としていたのは 2 件 (M-103 / M-104)。

## Round 1 の指摘の判定

| R1 ID | 判定 | 確かめた事実 |
|---|---|---|
| H-001 | resolved | `SettingsDialog.tsx:65-68`。テストは `AppShell.test.tsx:813`。文脈が無いという新しい問題 → M-101 |
| H-002 | resolved | `useSessions.ts:83`、スケルトン (`SessionListScreen.tsx:940-944`)・`aria-busy` (:861)・busy のボタン (:921-925)、取得時刻 0 の除外 (:92-95)。状態の行の文言は残る → L-102 |
| H-003 | resolved (横あふれ) | :233 / :240 を `flex-wrap`、フォルダ名は `min-w-0 truncate` + `title` (:101-106)、「列挙の結果」は h3 (:577)。**パスの title は誤り** (:134) → M-102 |
| M-001 | resolved | `CenterPane.tsx:99-114` |
| M-002 | partially | 同じ文と同じ名前のボタンが中央 (`CenterPane.tsx:103-107`) とサイドバー (`SessionListScreen.tsx:1037-1046`) に出る。Low に下げて持ち越す |
| M-003 | partially | `noProviders` (:295) と `probeFailed` (:396) が残る。Low に下げて持ち越す |
| M-004 | partially | 選択していない失敗したセッションを行の「閉じる」で外した場合に告知が残る。Medium で持ち越す |
| M-005 | resolved | `useShellFocus.ts:39-47`。テスト `AppShell.test.tsx:770` |
| M-006 | resolved | `OverviewTab.tsx:80-98`。テスト :932。見出しの書式は L-103 |
| M-007 | resolved (テストなし) | `SettingsDialog.tsx:60`。起動ダイアログ側は M-104 |
| M-008 | partially (延期) | data-model.md:86、roadmap.md:294 の O-3 の義務 (i)。scope を system にして持ち越す |
| M-009 | resolved | `useAutoCollapse.ts`。テスト :908 |
| M-010 | resolved | `Sidebar.tsx:96` |
| M-011 | partially | M-007 / L-003 / L-004 / M-010 のテストが無い。Low で持ち越す |
| L-001 | resolved | `labels.ts:33` / :23 |
| L-002 | partially | `noProviders` (:295) の「Provider」と「プロバイダ」の混在 |
| L-003 | resolved (テストなし) | `SettingsDialog.tsx:88-111` |
| L-004 | resolved (テストなし) | `SettingsDialog.tsx:114` |
| L-005 | unresolved | `running-sessions-view.ts:23` |

## Findings

### [Medium] 選択していない失敗したセッションを行の「閉じる」で外すと、次の「新規起動」でまだ古い失敗の告知が出る (M-004 持ち越し) (scope: feature)

- **観察**: `running-session-store.ts:548-556` の `close()` は選択にかかわらず `previousFailure` を立て `lastConfig` を上書きする。`useShellFocus.ts:37` は `prev.selectedId !== null && next.selectedId === null` のときだけ判断する。B を出したまま A の行の「閉じる」を押すと消去は走らず、次の「新規起動」で `LaunchDialog.tsx:401-405` が `role="alert"` で読み上げ、A の設定が初期値になる
- **同種事象探索**: `previousFailure` を書く箇所 3 件 (`running-session-store.ts:363`・`:446`・`:554`)、消去 2 件 (`LaunchDialogHost.tsx:39`、`useShellFocus.ts:42`)
- **推奨アクション**: running の購読で「失敗したセッションを閉じた」を先に判定し、中央に出していたものを `focus==='running'` で閉じたときだけ起動ダイアログを開く。それ以外は `dismissLaunchNotice()`。テストを足す
- **根拠**: UX-2 / UX-9 / X-4 US-1 AC7 / data-model §1:35・:48
- **scope 根拠**: `useShellFocus.ts` は本 PR で直したファイル

### [Medium] 設定のダイアログの件数の印が「設定」の題の横にあり、何の件数かが見て分からない (M-101) (scope: feature)

- **観察**: `SettingsDialog.tsx:65-68`。見える中身はアイコンと数字だけで、件数の説明は `sr-only` (`SessionNavBadge.tsx:40-49`)。`title` も無い。サイドバーでは「稼働中」の h2 の中 (`RunningSessionList.tsx:111-113`)
- **同種事象探索**: `<SessionNavBadge` 非テスト 3 件 (`RunningSessionList.tsx:113`、`Sidebar.tsx:96`、`SettingsDialog.tsx:67`)。文脈なしは SettingsDialog の 1 件
- **推奨アクション**: 印の前に見える「稼働中」を添える。`SessionNavBadge` の容器に `title` を付ける (畳んだ帯にも効く)
- **根拠**: UX-8 / UX-7 / O-1 USER 決定

### [Medium] 未登録グループの見出しのパスが末尾で切られ、全文を見る手段が無い (M-102) (scope: feature)

- **観察**: `SessionListScreen.tsx:134-136` は `min-w-0 truncate` で `title` が無い。data-model.md:83 は「全文は `title`」と書いていて食い違う
- **同種事象探索**: `truncate` 3 件 (:102 title あり、:134 / :398 title なし)
- **推奨アクション**: :134 に `title` を付ける。テストを足す。:398 を同じ扱いにするかを決める
- **根拠**: UX-7 / Principle VIII / data-model §3:83

### [Medium] サイドバーを畳んで開くと、過去の区画の絞り込みと開いた未登録グループが失われる (自動の畳みでも起きる) (M-103) (scope: feature)

- **観察**: `Sidebar.tsx:83-110` は畳んだ状態で中身を unmount する。絞り込み (`SessionListScreen.tsx:728-729`) と開閉 (`:200`) は `useState`。開くたびに `useSessions.ts:83-89` の取得が走り直す
- **同種事象探索**: 3 件 (:200, :728, :729)。`RunningSessionList.tsx` は 0
- **推奨アクション**: 畳んだ間もマウントしたまま `hidden` で隠す。テストを足す
- **根拠**: UX-7 / spec US-1 AC8 / data-model §2

### [Medium] 起動ダイアログは外側の押下で閉じ、選びかけの起動の設定を捨てる (M-104) (scope: feature)

- **観察**: `LaunchDialogHost.tsx:50-52` は起動中だけ止める。下書き (`LaunchDialog.tsx:178`) は閉じると捨てられる。設定のダイアログとそろっていない
- **同種事象探索**: `onInteractOutside` 2 件 (`SettingsDialog.tsx:60` 常に止める、`LaunchDialogHost.tsx:50` 起動中だけ)
- **推奨アクション**: 常に `preventDefault` する。2 つのダイアログでテストを 1 本
- **根拠**: UX-5 / UX-9

### [Medium] 稼働中の区画が上限まで伸びると、過去の区画の 8rem が常設の要素で埋まる (M-008 持ち越し・O-3 に送付済み) (scope: system)

- **観察**: `Sidebar.tsx:131` の `max-h-[calc(100%-8rem)]`。data-model.md:86、roadmap.md:294 の O-3 の義務 (i)
- **推奨アクション**: O-3 の design で判断する。本 PR では追加の作業は要らない

### [Low] 初回の空の状態の文とボタンが中央とサイドバーに 2 組出る (M-002 持ち越し) (scope: feature)

- **推奨アクション**: 中央が空の状態のときはサイドバーの no-folders の通知をボタンなしの 1 行に縮める

### [Low] 起動ダイアログの中の残りの案内 2 件がモーダルの下の「設定」を指したまま (M-003 持ち越し) (scope: feature)

- **観察**: `session/labels.ts:295` (`noProviders`)、`:396` (`probeFailed`)。:290 / :292 の「→」は「右矢印」と読まれる
- **推奨アクション**: 「このダイアログを閉じて、サイドバーの「設定」の「…」で」にそろえ、「→」は「の」にする

### [Low] 「Provider」と「プロバイダ」の表記揺れ (L-002 持ち越し) (scope: feature)

- **観察**: `session/labels.ts:295`、`shell/labels.ts:49`、`LAUNCH_AXIS_LABELS.provider`
- **推奨アクション**: glossary で決める (system)。最小として :295 の 1 文をそろえる

### [Low] 中央の空の状態が、登録フォルダの一覧の取得の失敗を読み込み中と区別しない (L-005 持ち越し) (scope: feature)

- **観察**: `running-sessions-view.ts:23`、`CenterPane.tsx:94`
- **推奨アクション**: R1 のとおり

### [Low] 文言の正本 (data-model §6) と spec が、変えた文言に追いついていない (L-101) (scope: feature)

- **観察**: data-model.md:143 の `centerEmptyNoFolders` が旧文言、:157 が実装と違う、spec.md:79 / :168 が「設定 → 作業フォルダ」、`skipToCenter` が §6 に無い
- **同種事象探索**: `設定 → 作業フォルダ` spec.md 3 件 (:60 は経緯、:79、:168)、src 0 件
- **推奨アクション**: §6 を `labels.ts` に合わせ、spec :79 / :168 を直す

### [Low] 待っている間、状態の行が「未取得」のまま (L-102) (scope: feature)

- **観察**: `SessionListScreen.tsx:901-903`
- **推奨アクション**: `loading && index === null` のときは「取得しています…」

### [Low] 「概要」の起動の軸の見出しの書式が不揃いで、読み込み中はモデルの生の ID が出る (L-103) (scope: feature)

- **観察**: `shell/labels.ts:59-65`、`OverviewTab.tsx:66-69` / `:80-86` / `:72`
- **推奨アクション**: 見出しをそろえるか小見出しを置く。読み込み中はモデルの行も出さない

### [Low] H: R1 の指摘の一部と R2 の新規の指摘を検出するテストが無い (M-011 持ち越し) (scope: feature)

- **観察**: M-007 / L-003 / L-004 / M-010 と、R2 の M-004 / M-102 / M-103 / M-104 のテストが無い。regression の根拠は vitest 1960 passed、E2E 11 passed (composer は本機の 1px の差)、V-3 の 9 項目 OK
- **推奨アクション**: 各指摘の推奨のテストを足す。M-007 と M-104 は 1 本にまとめられる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-004 | `previousFailure` を書く箇所 / `dismissLaunchNotice\(` | 3 / 2 | running-session-store.ts:363, :446, :554 / LaunchDialogHost.tsx:39, useShellFocus.ts:42 |
| M-101 | `<SessionNavBadge` (非テスト) | 3 (文脈なしは 1) | RunningSessionList.tsx:113, Sidebar.tsx:96, SettingsDialog.tsx:67 |
| M-102 | `truncate` (SessionListScreen.tsx) | 3 (title なし 2) | SessionListScreen.tsx:102, :134, :398 |
| M-103 | 畳むと外れる中身の `useState` | 3 | SessionListScreen.tsx:200, :728, :729 |
| M-104 | `onInteractOutside` (renderer の非テスト) | 2 | SettingsDialog.tsx:60, LaunchDialogHost.tsx:50 |
| M-003 | `設定の「` (renderer の非テスト) | 3 | session/labels.ts:295, :396, SessionListScreen.tsx:865 (対象外) |
| L-101 | `設定 → 作業フォルダ` (spec.md / src) | 3 / 0 | spec.md:60, :79, :168 |

## Verdict

- Critical: 0
- High: 0
- Medium: 6 (G 6: M-004, M-008, M-101, M-102, M-103, M-104)
- Low: 8 (G 7: M-002, M-003, L-002, L-005, L-101, L-102, L-103 / H 1: M-011)
- Round inheritance: resolved from 1: 12 / partially: 6 (M-002, M-003, M-004, M-008, M-011, L-002) / unresolved: 1 (L-005) / new: 7 (M-101, M-102, M-103, M-104, L-101, L-102, L-103)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
