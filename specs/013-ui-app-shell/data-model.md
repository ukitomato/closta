# Data Model: アプリのシェル (O-7)

各規則の正本は本ファイルの節。spec / plan / tasks は節を参照する。

## §1 面の状態 (`stores/ui.ts`。永続化しない)

今の `SCREENS` / `ScreenId` / `SCREEN_LABELS` / `screen` / `setScreen` を次に置き換える。

```ts
type CenterFocus = 'none' | 'running' | 'past'
type SettingsSection = 'runtimes' | 'folders' | 'providers' | 'resolution'
type PanelTabId = 'overview'            // 後続 feature が足す

interface ShellState {
  focus: CenterFocus                    // 中央に何を出すか
  settings: { open: boolean; section: SettingsSection }
  sidebarCollapsed: boolean
  panel: { collapsed: boolean; tab: PanelTabId }   // 既定 collapsed: true
  launchOpen: boolean                   // 起動ダイアログ
}
```

### 選択の id と focus

- **選択の id は今のストアのまま持つ**: 稼働中は `running-session-store` の `selectedId`、過去は `stores/sessions.ts` の `selectedRowKey`。`focus` はどちらを中央に出すかだけを持つ。片方を選んでも、もう片方の選択は消さない (戻ったときに同じ会話に戻る)
- **focus の書き手はシェルの 1 か所** (`features/shell/useShellFocus.ts`)。session のコンポーネントは `stores/ui.ts` の面の状態を書かない (例外は ui charter の「面の状態」。実装で明記した)。シェルが 2 つのストアの選択の変化を購読して決める:

| きっかけ (どこで選択が変わるか) | 選択の変化 | focus |
|---|---|---|
| 稼働中の行の選択 (`select`) | `selectedId` が非 null に変わる | `running` |
| 起動の受け付け (`running-session-store.ts:397`) | 同上 | `running` (起動ダイアログも閉じる) |
| 承認待ちへの移動 (`selectNextAwaiting`。`RunningSessionList.tsx:159`) | 同上 | `running` |
| 過去の行の選択 (`sessions.select`) | `selectedRowKey` が非 null に変わる | `past` |
| 稼働中のセッションを閉じる (`close`。`:522`) | `selectedId` が null に変わる | `focus === 'running'` なら `none` |
| 失敗したセッションを閉じる (`close` で `launch.previousFailure` が立つ) | 同上 | `focus === 'running'` なら `none`、かつ `launchOpen = true` (X-4 US-1 AC7)。**それ以外は focus を変えず、起動ダイアログも開かない** (過去の会話を読んでいる間にサイドバーの行の「閉じる」で閉じた場合。失敗の告知は古くなるので消す。pr-gate R1 po H-001) |
| 一覧の再取得で過去の行が消える | `useTranscript` の `hasSelection` が false | `focus === 'past'` なら `none` |

- 同じ id を選び直した (値が変わらない) ときも focus をその側に移す。そのため購読は値の変化ではなく、ストアの選択の操作 (`select` / `selectNextAwaiting` / 起動の受け付け) のたびに上がる通知 (`selectionSeq` などの単調増加の値) で受ける

### 見ているセッション (`watchedId`)

```ts
watchedId = focus === 'running' && !settings.open && !launchOpen ? selectedId : null
```

- 読み上げ (`SessionAttentionAnnouncer`。今の `screen === 'launch'` の判定) と、承認待ちの件数のボタン (`nextAwaiting`。`session-view.ts:421` の「表示中を除く」) は、どちらも `watchedId` を「表示中」として使う
- **起動ダイアログを開いている間も `watchedId` は null にする** (pr-gate R1 po M-003 / a11y M-002)。起動ダイアログはモーダルで、全面の overlay が中央の会話と承認カードを覆い、外側は支援技術から隠れる (`aria-hidden`)。design の時点の「中央の会話は見えている」は誤りだった
- **起動ダイアログと設定のダイアログの通知**: 起動ダイアログを起動せずに閉じたときは、拒否と前回の失敗の告知を消す (`dismissLaunchNotice`。`lastConfig` は残す。pr-gate R1 po M-001 / ux M-004)。設定のダイアログの左の列には注意の件数の印を置く (O-1 の USER 決定「設定を開いている間も承認待ちと失敗を別々に見せる」。pr-gate R1 ux H-001)

### 選択中の強調

- サイドバーの 2 つの区画のうち、`focus` の側の行だけを選択中として強調する (`aria-current` / 太字)。もう片方の選択は保つが強調しない

### その他

- `seedFolderDraft(seed)` は `settings = { open: true, section: 'folders' }` にする (今は `screen: 'folders'`)
- テーマ (`dark` / `toggleTheme`) と `transcriptDensity` は今のまま

## §2 面の幅と畳み

| 面 | 既定の幅 | 最小の幅 | 畳んだとき | 既定の状態 |
|---|---|---|---|---|
| サイドバー | 280px | 220px | 48px の帯 (新規起動・稼働中の件数の印・設定のアイコンだけ) | 開く |
| 中央 | 残り | 480px | — | — |
| 右のペイン | 320px | 260px | 40px の帯 (タブのアイコンだけ) | **畳む** |

- 既定のウィンドウの幅 (1100px。`src/main/app/window.ts:45`) では、中央は 1100 − 280 − 40 = **780px**。composer は上限 (`--thread-max-width: 44rem` = 704px) のまま描かれ、今の基準画像 (`composer-fullwidth`) と同じ幅になる。右を開くと中央は 500px
- 幅のドラッグでの変更は**本 feature に入れない** (registry と F 節に resizable が無く、shadcn の `resizable` (react-resizable-panels) は依存の追加と本番の CSP との両立の確認が要る。research R-04)。幅は固定で、畳む / 開くだけ
- ウィンドウが狭くなり、中央が最小の幅を割るときは、右のペイン → サイドバーの順に自動で畳む。閾値は「開いている面の幅の合計 + 480px」(右を開いていれば 1080px、畳んでいれば 800px)。自動で畳むのは閾値を割った瞬間に 1 回だけで、利用者が開いたら開く (その間は中央の最小の幅を割ってよい)。自動で畳んだものは、幅が戻っても自動では開かない
- 両方を畳んでも 48 + 480 + 40 = 568px を割るときは、中央の最小の幅を割ってよい (横にスクロールさせない)。`BrowserWindow` の最小の幅は変えない

## §3 サイドバーの区画

| 順 | 区画 | 中身 | 持ち主 |
|---|---|---|---|
| 1 | 新規起動 | ボタン。`launchOpen = true` | ui (シェル) |
| 2 | 稼働中 | `RunningSessionList` (O-1)。見出しに注意の件数の印 (`SessionNavBadge` の役割)。高さの上限は、過去のセッションの区画に最小の高さ (8rem) を残した値 (実装で 50% から直した。50% では既定のウィンドウ (1100×760) で compact の 10 行が収まらず、O-1 SC-003 を壊す)。0 件のときは今の文言 (「稼働中のセッションはありません。」) を 1 行。区画の要素は `section` (今の `RunningSessionList.tsx:93` の `nav` を替える。トップレベルの `nav` はサイドバーの 1 つだけ)。`ThreadListNew` は区画の中に置かない | session |
| 3 | 過去のセッション | `SessionListScreen` の一覧の部分 (所在の絞り込み・フォルダのグループ・空の表示)。初回の取得は `listRuntimes()` の解決の後 (spec FR-016) | session |
| 4 | 設定 | ボタン。`settings.open = true` | ui (シェル) |

- 280px に収める調整の範囲 (plan RK-04): 画面の見出し (「セッション一覧」) と外枠 (`max-w-3xl`) を外す。取得の時刻・「全件を取り直す」・列挙の結果の行・絞り込みのチップは残し、折り返しで収める。行と規則は変えない
- **実装の追記 (pr-gate R1)**:
  - グループの見出しの行と「列挙の結果」の見出しの行は `flex-wrap` で操作を 2 行目に落とし、フォルダ名・パスは 1 行に切り詰める (全文は `title`)。「列挙の結果」は区画の見出し (h2) の下の h3 (ux H-003 / a11y L-001)
  - 起動の直後、`listRuntimes()` を待っている間も「取得中」(スケルトン・`aria-busy`・「全件を取り直す」は busy) にする。初回の取得の前に main が配る取得時刻 0 の索引は受けない (ux H-002 / platform-boundary L-004)
  - 取得時刻と件数の `role="status"` の通知は、常時マウントになったので起動の直後と取り直しのたびに読まれる。通知は 1 文で短いので受け入れる (a11y L-005)
  - **残した判断**: 稼働中の区画が上限まで伸びたとき、過去の区画の 8rem が常設の要素 (取得時刻・列挙の結果・絞り込み) で埋まり行が見えない (ux M-008)。「列挙の結果」を全部が成功なら 1 行に要約するか、過去の区画の最小の高さを上げるかは、過去の区画に検索を足す O-3 の design で判断する (roadmap の O-3 の行)。サイドバーではグループを region (`section`) のままにしている (a11y L-006。ランドマークの移動でグループの数だけ止まる) のも同じく O-3 で判断する

## §4 右のペインのタブ (`features/shell/panel-tabs.ts`)

```ts
interface PanelTab {
  readonly id: PanelTabId
  readonly label: string                // 文言の表から
  readonly icon: LucideIcon
  readonly availableFor: readonly CenterFocus[]   // このタブを出せる中央の状態
  readonly Content: () => React.JSX.Element
}
```

- タブの並びは表の並び。表示できないタブ (`availableFor` に今の `focus` が無い) は出さない。選んでいたタブが出せなくなったら最初のタブに戻る (テストは表を差し替えられる形にして、出せないタブを差し込んで確かめる)
- 本 feature の行は `overview` だけ (`availableFor: ['none', 'running', 'past']`。`none` では空の状態)
- **`Content` は renderer の DOM の中に描くものに限る。** 外部コンテンツ (Browser / PR の Webview) のタブはこの形で表さない。OPT-panel で種別を足し、AD-046 Decision 4 の境界に従う

## §5 「概要」の項目

中央のヘッダ (フォルダの表示名・ランタイム・開始の時刻・題) と重なる項目は出さない。

| 中央 | 項目 | 出所 (renderer が既に持つ値) | 引けないとき |
|---|---|---|---|
| running | Provider | `config.providerId` → Provider の表示名 (既存の Provider の一覧の hook)。`null` は「既定」 | 一覧の読み込み中は行を出さない。一覧にあって引けないときは「登録が解除された Provider」(X-4 の fallback の規則) |
| running | モデル | `config.modelId` (`null` は「既定」)・`effort` (ある場合) | — |
| running | 権限モード | `config.permissionMode` の文言 (X-4 の文言の表) | — |
| running | 作業フォルダの所在 | フォルダの所在 (Windows / ディストロ名)。`useFolders` の一覧から | 中央のヘッダの規則 (`SessionScreen.tsx:66-81` の `folderName` / `runtimeName`: 読み込み中は空・引けなければ `SESSION_NAME_FALLBACKS`) を共有する |
| past | フォルダ | 行が属するグループの表示 (folder → 登録フォルダの表示名、unregistered → `cwd.value ?? cwdDisplay`、unknown → `cwdDisplay`)。一覧の見出しと同じ関数を共有する | 値の無い項目は行ごと出さない |
| past | 所在 | `locationLabelOf` (`SessionListScreen.tsx:675-690`) を export して共有する | 同上 |
| past | ブランチ | `gitBranch` | 同上 |
| past | 開始 / 更新 | `createdAt` / `lastModified` | 同上 |
| past | 由来 | `targetLabel`・`worktree` の印 | 同上 |

- 会話由来・パス由来の文字列は DTO の時点で正規化済みの表示用の値 (`build.ts:48` / `dto-mapper.ts:124,134`) をテキストとして描く。HTML として解釈しない

### 中央のヘッダ

稼働中と過去で同じ部品 `CenterHeader` (`features/shell/CenterHeader.tsx`) を使う (code-gate convention M-003)。欄は題・補足・状態の 3 つで、末尾に transcript の密度の切り替え。

| 中央 | 題 | 補足 | 状態 |
|---|---|---|---|
| running | 作業フォルダの表示名 | ランタイム・開始の時刻 | 一覧の行と同じ状態のラベル |
| past | `sessionTitle()` (一覧の行と同じ題。時刻の表記は `formatSessionTime`) | フォルダ (グループの表示) | 読み取り専用 |

## §6 新しい文言 (正本。`features/shell/labels.ts`)

| キー | 文言 |
|---|---|
| `newSession` | 新規起動 |
| `runningHeading` | 稼働中 |
| `pastHeading` | 過去のセッション |
| `settings` | 設定 |
| `settingsTitle` | 設定 |
| `settingsSections` | ランタイム / 作業フォルダ / プロバイダ / 組み合わせ (今の `SCREEN_LABELS` の文言を引き継ぐ) |
| `theme` | テーマ: ライト / ダーク |
| `centerEmpty` | セッションを選ぶか、新しく起動してください。 |
| `centerEmptyNoFolders` | 作業フォルダがまだ登録されていません。設定から登録してください。 |
| `centerEmptyLaunch` | 新しいセッションを起動 (中央の空の状態のボタン。サイドバーの「新規起動」と文言を分ける) |
| `panelLabel` | セッションの詳細 |
| `overviewTab` | 概要 |
| `overviewEmpty` | セッションを選ぶと概要が出ます。 |
| `collapseSidebar` / `expandSidebar` | サイドバーを畳む / サイドバーを開く |
| `collapsePanel` / `expandPanel` | 詳細を畳む / 詳細を開く |

稼働中の区画の 0 件の文言は今の `SESSION_LIST_LABELS.empty` を短くした「稼働中のセッションはありません。」(`session/labels.ts`。「「新規起動」から起動できます。」はサイドバーの上にボタンがあるので外す)。

**実装の追記 (code-gate convention L-004)**:

- `runningHeading` は区画の見出しを描く `RunningSessionList` (session) の文言なので、`session/labels.ts` の `SESSION_LIST_LABELS.heading` に置いた。`settingsSections` は `SETTINGS_SECTION_LABELS`、`theme` は `theme` / `themeLight` / `themeDark` に分けた
- 上の表に無いキーは、ランドマーク名と補助の文言 (`appName` / `sidebar` / `settingsNav` / `close` / `centerEmptyFolders` / `center` / `pastReadOnly` / `launchDialogTitle` / `panelTabs`) と、「概要」の項目の見出し (`OVERVIEW_LABELS`。起動の軸の名前は `LAUNCH_AXIS_LABELS` から引く)。どれも `features/shell/labels.ts` が正本
- 起動ダイアログと設定の画面の中の「「作業フォルダ」画面で」などの案内は、「設定の「作業フォルダ」で」に直した (上部のタブの画面は無い)
