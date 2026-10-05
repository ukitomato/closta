# ux-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05
**Reviewer**: ux-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: pr-gate Round 1

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-003 / FR-005 — サイドバー・中央・中央のヘッダ・空の状態 (`features/shell/*`)
  - FR-004 / FR-006 — focus の書き手、`watchedId`、読み上げと件数の印
  - FR-007 — 起動ダイアログ (`LaunchDialogHost.tsx` / `LivePane.tsx`)
  - FR-008 / FR-009 — 設定のダイアログ (`SettingsDialog.tsx`)、`seedFolderDraft`
  - FR-014 / FR-015 — 右のペインと「概要」
  - FR-016 — 過去の区画の初回の取得の順序 (`useSessions.ts`)
  - FR-011 — E2E の入口
  - SC-001 / SC-002 / SC-003 / SC-004 / SC-007 / SC-008
- touched files に当たる charter / Confirmation:
  - ui charter の Scope「アプリのシェル」、Cross-domain の「面の状態」、業務ルール「日本語で破綻しない」(Principle VIII)
  - AD-046 Decision 1〜6 と Confirmation (**V-3 は未実施**)
  - O-1 の USER 決定 (design-gate H-04 / R2 M-05): 「過去の会話や設定を開いている間も、承認待ちと失敗を別々に見せる」(`SessionNavBadge.tsx:17`)
  - Principle XV。シェルの文言は `features/shell/labels.ts` に集まっていて、shell の tsx に直書きは 0 件
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:3 Medium:10 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

各画面の中身は作り直していないので、以前は 768px の中央に描かれ上部のタブが常に見えていた前提のまま、280px のサイドバーとモーダルの中に置かれている。UX の指摘はほぼすべてその前提が崩れたところから出ている。code-gate の申し送り (L-003 の文言) の判断は M-003、「新規起動」と「新しいセッションを起動」の分け方の判断は L-001。

## Findings

### [High] 設定のダイアログを開いている間、承認待ち・失敗の印がどこにも見えない (O-1 の USER 決定の退行) (H-001) (scope: feature)

- **観察**: 設定のダイアログ (`SettingsDialog.tsx:67`) は全面で下に overlay。左の列 (`:77-103`) は題・4 項目・テーマだけで注意の印を持たない。`SessionNavBadge` を描くのは `Sidebar.tsx:67` と `RunningSessionList.tsx:113` の 2 か所でどちらもダイアログの下に隠れる。`SessionNavBadge.tsx:17` の規則は「過去の会話や設定を開いている間も、承認待ちと失敗を別々に見せる」(USER 決定 2026-10-02)。`watchedIdOf` は設定を開いている間は見ていないと定めている
- **同種事象探索**: `<SessionNavBadge` で 2 件。`SettingsDialog.tsx` の中は 0 件
- **リスク/影響**: 晴眼の利用者が設定を触っている間に承認待ちになると、気付く手段が無い。読み上げは働くので支援技術の利用者だけに知らせる非対称
- **推奨アクション**: 最小: `SettingsDialog.tsx:78` の `DialogTitle` の横に `<SessionNavBadge />` を置く。より良い: 「承認待ち N 件」のボタン (押すと設定を閉じて `selectNextAwaiting(null)`)。テストを足す
- **根拠**: UX-8 / O-1 USER 決定 / O-7 FR-006 / spec Edge Cases
- **scope 根拠**: 本 PR の新設ファイル

### [High] 起動の直後、過去の区画が「未取得」のまま読み込み中の表示を出さず、押せる「全件を取り直す」が FR-016 の順序を迂回する (H-002) (scope: feature)

- **観察**: `useSessions.ts:79-85` は `listRuntimes()` を待ってから `load()` (`setLoading(true)` はその中) を呼び、待ちの間 `loading` は `false`。区画は「未取得」だけで、スケルトンは出ず、「全件を取り直す」は押せる (`SessionListScreen.tsx:886-911,925-929`)。押すと main は検出前に WSL の所在 0 件で列挙し `loaded = true` でキャッシュし (`session-service.ts:405-407,505`)、初回の `listSessions()` はそのキャッシュを返す (`:632`)
- **同種事象探索**: `setLoading\(true\)` は 4 件、どれも `listRuntimes` の待ちの前には立たない
- **リスク/影響**: 起動の直後の数秒は区画が止まって見え、押すと FR-016 が防ぐはずの状態が再現する
- **推奨アクション**: 最小: `listRuntimes()` の前で `setLoading(true)` する (既存のスケルトンと busy の守りが効く)。テストを足す
- **根拠**: UX-3 / spec FR-016 / SC-008 / plan RK-06

### [High] 280px のサイドバーで過去の区画の見出しの行が折り返さず、未登録フォルダの区画の見出しが潰れて横にあふれる (H-003) (scope: feature)

- **観察**: 区画の見出しの行 (`SessionListScreen.tsx:223`) は `flex items-center justify-between gap-2` で折り返さず、右の群 (`:230`) は `shrink-0`。未登録の区画の右の群 (件数・「作業フォルダとして登録」・「開く」) は ≒ 278px で、使える幅 ≒ 237px を超える。左の見出しは幅 0 に潰れ、横スクロールが出る。フォルダの区画の名前 (`:100`) は `truncate` も `min-w-0` も持たない。「列挙の結果」の見出しの行 (`:561`) も折り返さない
- **同種事象探索**: 該当の className で 3 件 (`:223`, `:230`, `:561`)。truncate の無いフォルダ名は `:100` の 1 件
- **リスク/影響**: 未登録の区画はほぼすべての利用者に出る。サイドバーの主な導線でグループ名が読めず横スクロールが出る。data-model §3 は「折り返しで収める」と書いている
- **推奨アクション**: `:223` と `:561` に `flex-wrap` を足し右の群を 2 行目に落とせる形にする (`:230` の `shrink-0` を外す)。`:100` に `min-w-0 truncate`。直した後に V-3 (1100×760) で目視する
- **根拠**: UX-7 / Principle VIII / data-model §3 / plan RK-04 / spec Edge Cases

### [Medium] フォルダ未登録の初回、中央の空の状態の主ボタンが起動できないダイアログに向き、見出しも状態に合わない (M-001) (scope: feature)

- **観察**: フォルダが 0 件のとき `CenterPane.tsx:93-107` は「セッションを選ぶか、新しく起動してください。」と主ボタン「新しいセッションを起動」を出し、副ボタンが「設定 → 作業フォルダ」。主ボタンの起動ダイアログは起動できない
- **推奨アクション**: `noFolders` のときは見出しを `centerEmptyNoFolders` に、主ボタンを「作業フォルダを登録する」に、起動のボタンは outline に下げるか出さない
- **根拠**: UX-1 / UX-7

### [Medium] 「作業フォルダを登録する」という同じ操作が 4 通りの文言で、初回は同じ文が画面に 2 回出る (M-002) (scope: feature)

- **観察**: 「設定 → 作業フォルダ」(`shell/labels.ts:24`)、「作業フォルダを登録する」(`SessionListScreen.tsx:1029`)、「設定の「作業フォルダ」で登録してください。」(`session/labels.ts:286`)、「設定から登録してください。」(`shell/labels.ts:21`)。初回は中央とサイドバーに「作業フォルダがまだ登録されていません。」が同時に出る。「設定 → 作業フォルダ」は動詞を持たず、矢印は「右矢印」と読まれる
- **推奨アクション**: ボタンは「作業フォルダを登録する」にそろえる。中央に案内を出すときはサイドバーの通知を 1 行に縮める
- **根拠**: UX-9 / UX-7

### [Medium] L-003 の文言の判断: 文言は正しいが、モーダルの起動ダイアログの中では行動に移せない (M-003) (scope: feature)

- **観察**: `session/labels.ts:286,287` の「設定の「作業フォルダ」で」「設定の「ランタイム」で」は設定のダイアログの題と項目名に一致し、消えた「画面」の語も残っていない。ただし起動ダイアログはモーダルで、サイドバーの「設定」に手が届かず、移るには 3 回の操作が要る (設定は前回の項目で開く)。`noProviders` (`:290`) は「Provider」と「プロバイダ」が混ざる (L-002)。`ResolutionScreen.tsx:254,261` は設定の中から自分を指している
- **推奨アクション**: 判断は「文言は採用。ただし案内には操作を添える」。最小: `noFolders` を「このダイアログを閉じて、サイドバーの「設定」→「作業フォルダ」で登録してください。」にする。推奨: `LaunchDialog` に任意の prop `onOpenSettings?: (section) => void` を足し、`LaunchDialogHost` が「起動ダイアログを閉じて設定を指定の項目で開く」関数を渡す (シェルが面の状態を書くので charter を破らない)。`ResolutionScreen` は「左の「作業フォルダ」で…」にしてよい
- **根拠**: UX-1 / UX-2 / UX-6

### [Medium] 起動の拒否と前回の失敗の告知が、ダイアログを閉じて開き直しても残る (M-004) (scope: feature)

- **観察**: 拒否 (`launch.phase = 'rejected'` / `rejectReason`) と `previousFailure` は次の起動の時まで残り (`running-session-store.ts:355-376,403`)、`LaunchDialog.tsx:692-694` と `:401-405` は `role="alert"` で出す。上限の拒否の文言は「一覧で終了・強制終了すると枠が空く」と案内するが一覧はモーダルの下にある
- **リスク/影響**: 閉じて枠を空けて開き直すと、もう当たらない「10 件までです」が再び読み上げられる。失敗したセッションを行の「閉じる」で外した後の「新規起動」でも「前回のセッションは失敗しました」が出る
- **推奨アクション**: 起動せずに閉じたときに拒否と前回の失敗を消す store の操作 (例: `dismissLaunchNotice()`。`lastConfig` は残す) をシェルから呼ぶ
- **根拠**: UX-2 / X-4 US-1 AC7 / O-7 US-2 AC5

### [Medium] 失敗したセッションを閉じると、過去の会話を読んでいても中央が空になり、起動ダイアログが割り込む (行の「閉じる」でも起きる) (M-005) (scope: feature)

- **観察**: `useShellFocus.ts:37-44` は選択中の失敗したセッションが閉じられると `ui.focus` に関係なく `setFocus('none')` と `setLaunchOpen(true)`。サイドバーの失敗の行の「閉じる」を押すだけで、過去の transcript が空の状態に替わりモーダルが開く
- **推奨アクション**: 起動ダイアログを開くのは `ui.focus === 'running'` のときだけにし、それ以外は focus を変えない。data-model §1 の該当の行を直し、テストを足す
- **根拠**: UX-7 / spec US-2 AC3 / X-4 US-1 AC7

### [Medium] 「概要」のモデルと effort が生の ID / enum を出し、起動ダイアログの表示と食い違う (M-006) (scope: feature)

- **観察**: `OverviewTab.tsx:77` はモデルに `config.modelId`、`:79` は effort に `config.effort` (例 `high`) をそのまま出す。起動ダイアログはモデルを `displayName`、effort を `EFFORT_LABELS` (「高」など) で出す。稼働中の「作業フォルダの所在」は引けないとき「登録が解除された作業フォルダ」に倒れる (`:89-90`)
- **推奨アクション**: effort は `EFFORT_LABELS[config.effort]`、モデルは `useProviders()` のモデルカタログから `displayName` を引き、引けなければ ID に倒す。所在が引けないときは行ごと出さない。data-model §5 とテストを直す
- **根拠**: UX-6 / UX-9 / Principle XV / FR-015

### [Medium] 設定のダイアログが Esc と外側の押下で閉じ、入力中の登録や Provider のフォームを確認なしに捨てる (M-007) (scope: feature)

- **観察**: `SettingsDialog.tsx:58-75` は Radix の既定のまま Esc と overlay の押下で閉じ、中の画面は unmount される (`ProviderScreen.tsx:87-93`、`WorkspaceFoldersScreen.tsx:243,325` の入力が消える)
- **推奨アクション**: 最小: `onInteractOutside={(e) => e.preventDefault()}`。入力中の Esc の確認は別にしてよい。FR-008 の unmount は変えない
- **根拠**: UX-5 / FR-008

### [Medium] 稼働中の区画が上限まで伸びると、過去の区画の 8rem は常設の要素で埋まり、行が 1 行も見えない (M-008) (scope: feature)

- **観察**: `Sidebar.tsx:125` の上限 `calc(100%-8rem)` で過去の区画に残る 128px に、区画の見出し・取得時刻と「全件を取り直す」・「列挙の結果」のカード・絞り込みのチップが先に並ぶ
- **推奨アクション**: サイドバーの中では「列挙の結果」を全部が成功なら 1 行の要約にするか、過去の区画の最小の高さを常設の要素 + 行 3 本ぶんにする。data-model §3 に高さの条件を足す
- **根拠**: UX-7 / spec Edge Cases / data-model §3

### [Medium] 自動の畳み: 右を自動で畳んだ直後に幅が 800px を一気に割ると、サイドバーが畳まれない (M-009) (scope: feature)

- **観察**: `useAutoCollapse.ts:25,36` は畳む前の閾値で計算した `below` を `belowRef` に入れる。1100 → 1000 で右を畳み `belowRef = true`、次の通知で 700 になってもサイドバーは畳まれない (中央 380px)
- **推奨アクション**: 畳んだ後の状態で計算し直す。テストに resize(1100) → (1000) → (700) を足す
- **根拠**: UX-7 / spec Edge Cases / data-model §2

### [Medium] 畳んだサイドバーの帯 (48px) に承認待ちと失敗の印が並ぶと幅を超えてあふれ、押しても何も起きない (M-010) (scope: feature)

- **観察**: `Sidebar.tsx:67` は帯の中に `SessionNavBadge` を置く。印は横並びで両方出ると ≒ 84px になり 48px の帯からあふれる。印は表示だけ
- **推奨アクション**: 帯では印を縦に積む (帯の文脈だけの class を prop で渡す)。帯の印を押すとサイドバーを開くボタンにする
- **根拠**: UX-8 / UX-7 / spec US-1 AC8

### [Medium] H: 上の指摘を検出するテストが無く、レイアウトの崩れを検出できる唯一の V-3 が未実施 (M-011) (scope: feature)

- **観察**: H-001 / H-002 / M-005 / M-006 / M-009 のテストが無い。H-003 / M-010 は jsdom で測れず、plan RK-04 の「長い日本語のフォルダ名を流す component テスト」も無い (FE-014 は [x])。V-3 は未実施。E2E は `listSessions` が空を返すので過去の区画の描画を通らない
- **推奨アクション**: 各指摘のテストを足す。H-003 / M-010 は直した後に V-3 の目視を quickstart-results に記録する。E2E の stub の `listSessions` に未登録のグループを 1 つ返させれば過去の区画の横あふれを CI で見られる
- **根拠**: reviewer-base の H の規則 / plan RK-04・RK-06 / AD-046 Confirmation

### [Low] 「新規起動」と「新しいセッションを起動」の分け方: 分けてよいが、理由を E2E ではなく UX で書き、起動ダイアログの名前をそろえる (L-001) (scope: feature)

- **観察**: `shell/labels.ts:22-23` は分ける理由を「E2E の locator がぶつからない」と書くが、E2E はサイドバーと完全一致で絞っている。起動ダイアログの名前が 4 つある (「新規起動」/ sr-only の「新しいセッション」/ 見える見出し「セッションを起動」/「起動」)
- **推奨アクション**: 判断: どちらの文言も妥当。注記を「空の状態の CTA は次の一手を説明的に書く」に直し、`launchDialogTitle` を「セッションを起動」にそろえる
- **根拠**: UX-9

### [Low] 表記揺れ: 「Provider」と「プロバイダ」、「セッション一覧」と「過去のセッション」(L-002) (scope: feature)

- **観察**: 設定の項目は「プロバイダ」、概要・起動ダイアログは「Provider」、`session/labels.ts:290` は 1 文の中で混ぜる。過去の区画の失敗の題は「セッション一覧を取得できませんでした」(`SessionListScreen.tsx:916`)
- **推奨アクション**: glossary の Provider に日本語表記を 1 つ決めてそろえる。失敗の題を「過去のセッションを取得できませんでした」にする
- **根拠**: UX-9 / Principle XIV

### [Low] テーマの切り替えが「テーマ [ダーク]」で、今の値か切り替え先か読めない (L-003) (scope: feature)

- **推奨アクション**: ライト / ダークの 2 つのボタンの組 (`aria-pressed`) にする
- **根拠**: UX-4 / UX-9

### [Low] 設定の項目を切り替えても、右のスクロールの位置が前の項目のまま残る (L-004) (scope: feature)

- **推奨アクション**: スクロール要素に `key={section}` を付ける
- **根拠**: UX-7

### [Low] 中央の空の状態が、登録フォルダの一覧の取得の失敗を読み込み中と区別しない (L-005) (scope: feature)

- **観察**: `running-sessions-view.ts:23` は `folders.list` だけを渡し `failed` を渡さない。起動ダイアログには失敗と再試行が出るので回復の手段は残っている
- **推奨アクション**: view に `foldersFailed` を足し、中央に失敗の文言と「再試行」を出す
- **根拠**: UX-2

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `<SessionNavBadge` (renderer の非テスト) | 2 (SettingsDialog の中は 0) | Sidebar.tsx:67, RunningSessionList.tsx:113 |
| H-002 | `setLoading\(true\)` (useSessions.ts) / `'未取得'` | 4 / 1 | useSessions.ts:58,94,104,115 / SessionListScreen.tsx:887 |
| H-003 | 見出しの行の className (SessionListScreen.tsx) | 3 | SessionListScreen.tsx:223, :230, :561 (+ :100) |
| M-002 | 登録の文言 4 種 | 4 | shell/labels.ts:21,24, SessionListScreen.tsx:1024,1029 |
| M-003 | `設定の「` (renderer の非テスト) | 7 | session/labels.ts:286,287,290,391, ResolutionScreen.tsx:254,261, SessionListScreen.tsx:850 |
| M-006 | `EFFORT_LABELS\[` | 3 (OverviewTab は 0) | LaunchDialog.tsx:577, ModelCatalogEditor.tsx:73,129 |
| M-009 | `belowRef.current =` | 1 | useAutoCollapse.ts:36 |

## Verdict

- Critical: 0
- High: 3
- Medium: 11 (G 10 + H 1)
- Low: 5

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
