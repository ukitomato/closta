# Data Model: アプリのシェル (O-7)

各規則の正本は本ファイルの節。spec / plan / tasks は節を参照する。

## §1 面の状態 (`stores/ui.ts`。永続化しない)

今の `SCREENS` / `ScreenId` / `screen` / `setScreen` を次に置き換える。

```ts
type CenterFocus = 'none' | 'running' | 'past'
type SettingsSection = 'runtimes' | 'folders' | 'providers' | 'resolution'
type PanelTabId = 'overview'            // 後続 feature が足す

interface ShellState {
  focus: CenterFocus                    // 中央に何を出すか
  settings: { open: boolean; section: SettingsSection }
  sidebarCollapsed: boolean
  panel: { collapsed: boolean; tab: PanelTabId }
  launchOpen: boolean                   // 起動ダイアログ
}
```

- **選択の id は今のストアのまま持つ**: 稼働中は `running-session-store` の `selectedId`、過去は `stores/sessions.ts` の `selectedRowKey`。`focus` はどちらを中央に出すかだけを持つ。稼働中の行を選ぶ → `focus = 'running'`、過去の行を選ぶ → `focus = 'past'`。片方を選んでも、もう片方の選択は消さない (戻ったときに同じ会話に戻る)
- `focus = 'running'` で `selectedId` が `null` (表示中のセッションを閉じた) → 中央は空の状態
- `seedFolderDraft(seed)` は `settings = { open: true, section: 'folders' }` にする (今は `screen: 'folders'`)
- テーマ (`dark` / `toggleTheme`) と `transcriptDensity` は今のまま

## §2 面の幅と畳み

| 面 | 既定の幅 | 最小の幅 | 畳んだとき |
|---|---|---|---|
| サイドバー | 280px | 220px | 48px の帯 (新規起動・稼働中の件数の印・設定のアイコンだけ) |
| 中央 | 残り | 480px | — |
| 右のペイン | 320px | 260px | 40px の帯 (タブのアイコンだけ) |

- 幅をドラッグで変える (サイドバーと右のペインの境界)。変えた幅は再起動で既定に戻る [ASSUMED]。element は registry の resizable を先に確かめる (Principle XIII)
- ウィンドウが狭くなり、中央が最小の幅を割るときは、右のペイン → サイドバーの順に自動で畳む。利用者が開いたら開く (その間は中央の最小の幅を割ってよい)。自動で畳んだものは、幅が戻っても自動では開かない

## §3 サイドバーの区画

| 順 | 区画 | 中身 | 持ち主 |
|---|---|---|---|
| 1 | 新規起動 | ボタン。`launchOpen = true` | ui (シェル) |
| 2 | 稼働中 | `RunningSessionList` (O-1)。見出しに注意の件数の印 (`SessionNavBadge` の役割)。高さの上限は区画の 50% | session |
| 3 | 過去のセッション | `SessionListScreen` の一覧の部分 (所在の絞り込み・フォルダのグループ・空の表示) | session |
| 4 | 設定 | ボタン。`settings.open = true` | ui (シェル) |

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

- タブの並びは表の並び。表示できないタブ (`availableFor` に今の `focus` が無い) は出さない。選んでいたタブが出せなくなったら最初のタブに戻る
- 本 feature の行は `overview` だけ (`availableFor: ['none', 'running', 'past']`。`none` では空の状態)

## §5 「概要」の項目

| 中央 | 項目 | 出所 (renderer が既に持つ値) |
|---|---|---|
| running | フォルダ | `config.folderId` → 作業フォルダの表示名 (`useFolders`) |
| running | ランタイム | `config.runtimeId` → ディストロ名 (`useRuntimes`) |
| running | Provider | `config.providerId` → Provider の表示名 (既存の Provider の一覧の hook)。`null` は「既定」 |
| running | モデル | `config.modelId` (`null` は「既定」)・`effort` (ある場合) |
| running | 権限モード | `config.permissionMode` の文言 (X-4 の文言の表) |
| running | 開始 | `startedAt` |
| past | フォルダ | `cwdDisplay` |
| past | ブランチ | `gitBranch` (あれば) |
| past | 開始 / 更新 | `createdAt` / `lastModified` (あれば) |
| past | 由来 | `targetLabel`・`worktree` の印 |

- 値の無い項目は行ごと出さない。会話由来・パス由来の文字列は一覧と同じ表示用の値 (DTO の時点で無害化済み) をテキストとして描く

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
| `panelLabel` | セッションの詳細 |
| `overviewTab` | 概要 |
| `overviewEmpty` | セッションを選ぶと概要が出ます。 |
| `collapseSidebar` / `expandSidebar` | サイドバーを畳む / サイドバーを開く |
| `collapsePanel` / `expandPanel` | 詳細を畳む / 詳細を開く |
