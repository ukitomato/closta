# po-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05
**Reviewer**: po-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: pr-gate Round 1

## 初回読了 viewpoint

- FR/SC (すべて本 PR が実装する):
  - FR-001〜FR-006・FR-016 → `features/shell/*`, `stores/ui.ts`, `useSessions.ts`
  - FR-007 → `LaunchDialogHost.tsx`, `useShellFocus.ts`, `LivePane.tsx`
  - FR-008 / FR-009 → `SettingsDialog.tsx`, `SessionListScreen.tsx`
  - FR-010 → `stores/ui.ts`
  - FR-011 → `e2e/*`, `perf/real-sessions.spec.ts`
  - FR-012 / FR-013 → docs/*
  - FR-014 / FR-015 → `RightPanel.tsx`, `panel-tabs.ts`, `OverviewTab.tsx`
  - SC-001〜SC-008。計測が終わっていないもの: SC-003 (CI 待ち)、SC-008 の V-3 (利用者待ち)
- touched files に該当する charter / Confirmation:
  - ui charter: Scope「アプリのシェル」、Cross-domain「面の状態」、Journey 2 / 4、Principle「見た目の判断を先送りしない」、KPI「日本語の健全性」
  - session charter: :100-105、KPI「並列時の滑らかさ」と「列挙の網羅」(SC-008 / FR-016)
  - AD-046 Confirmation: SC-001〜SC-005 と quickstart V-3。AD-025 目標レイアウト
  - 引き継いだ AC: X-4 US-1 AC7、X-5 FR-008
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:4 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当 (M-003 / M-004 の WCAG の判定は a11y-reviewer に委ねる)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:1

## スコープ要約

renderer だけの変更 (93 files / +5457 -575)。上部の 7 つのタブを 3 面と 2 つのダイアログに置き換えた。各画面の中身は変えていない。design-gate の自分の指摘 (H-001〜H-004、M-001〜M-005) は手当てがあることを確かめた。今回の主な穴はシェルにしたことで生まれた負の経路 4 つ (閉じるで中央を奪う / 拒否の表示が残る / 待ちの間に FR-016 を迂回 / 登録後のフォーカスの戻り先) と、tasks で完了にしたがテストが無い観点。

## Findings

### [High] 失敗したセッションをサイドバーの行の「閉じる」で閉じると、過去の会話を読んでいても中央が空の状態に変わり、起動ダイアログが開く (H-001) (scope: feature)

- **観察**: 行の「閉じる」は終了したセッション (失敗を含む) ならどの面からでも押せる (`session-view.ts:139`、`RunningSessionList.tsx:536-546`)。`running-session-store.ts:510-537` は失敗したセッションを閉じると `selectedId` を null にし `launch.previousFailure` を立てる。`useShellFocus.ts:37-43` は `failedClose` のとき今の focus を見ずに `setFocus('none')` と `setLaunchOpen(true)` を呼ぶ。稼働中の選択は過去の行を選んでも消えない。したがって「A を起動 → 過去の行を読む → A が失敗 → サイドバーの A の行の「閉じる」」で、読んでいた過去の transcript が空の状態に変わり、起動ダイアログが開く。data-model.md:35 の表の行が focus を条件にしていない
- **同種事象探索**: `store\.close\(|session\.close` (features/*.tsx) で 2 件。失敗したセッションを閉じる経路は `LivePane.tsx:137` (中央の告知。focus は running のときだけ見える) と `RunningSessionList.tsx:543` (サイドバーの行。どの focus でも押せる)。`AppShell.test.tsx:526-535` は中央の告知の経路しか見ていない
- **リスク/影響**: 「閉じる」の文言と振る舞いが合わない。読んでいた過去の会話から勝手に移る (US-2 AC3・FR-007・Edge Cases の趣旨に反する)。シェルにしたことで生まれた新しい経路
- **推奨アクション**: 起動ダイアログを開くのは閉じる前の focus が `running` のときに限る。data-model §1 の表の行を「`focus === 'running'` なら `none`、かつ `launchOpen = true`。それ以外は focus を変えない」に直し、focus が `past` のときにサイドバーで失敗した行を閉じても `data-focus === 'past'` のままでダイアログが開かないテストを足す
- **根拠**: PO-4 / PO-6、spec US-2 AC3・FR-007、X-4 US-1 AC7
- **scope 根拠**: touched files で直せる

### [Medium] 起動が拒否された後に「新規起動」で開き直すと、古い拒否の理由が出たままになる (M-001) (scope: feature)

- **観察**: 拒否の表示を消す規則は `running-session-store.ts:415-428` の `select(null)` だけにあり、本番で `select(null)` を呼ぶのは O-7 で外した `ThreadListNew` の経路 (`useRunningThreadList.ts:48`) だけ。今の開く経路 (`Sidebar.tsx:63,113`、`CenterPane.tsx:99`) は `setLaunchOpen(true)` だけで、`LaunchDialogHost.tsx:26-29` は閉じても `launch.phase` を戻さない。`LaunchDialog.tsx:692-696` は `phase === 'rejected'` の間 `role="alert"` で理由を出し続ける。既存の観点のテストは消えている
- **同種事象探索**: `setLaunchOpen\(true\)` 4 件、どれも拒否の表示を消さない。`rejectReason: null` は 3 か所 (うち `select(null)` は到達できない)
- **リスク/影響**: 枠を空けた後でも開いた瞬間に「上限に達している」と誤って出て、支援技術にも読み上げ直される。O-7 で入った回帰
- **推奨アクション**: 起動ダイアログを開く (または閉じる) ときに `phase` を `rejected` から `entry` に戻し `rejectReason` を null にする store の操作を足し `LaunchDialogHost` から呼ぶ。E2E と `AppShell.test.tsx` に「開き直すと拒否の alert が無い」を足す。使われなくなった `onSwitchToNewThread` の扱いも決める
- **根拠**: PO-4、spec US-2 AC5、FR-007

### [Medium] 起動直後、過去の区画は `listRuntimes` を待つ間「未取得」のまま読み込み中を示さず、「全件を取り直す」を押すと FR-016 を迂回できる (M-002) (scope: feature)

- **観察**: `useSessions.ts:79-85` は `listRuntimes()` の解決の後で初めて `load()` を呼び `loading` を立てる (初期値 `loading: false`)。待ちの間は「未取得」と押せる「全件を取り直す」(`SessionListScreen.tsx:886-911`)。押すと `refreshSessions` が検出の前に列挙し、main の `refresh()` は `loaded = true` を立て (`session-service.ts:505`, `:691-700`)、その後の初回の `list()` はキャッシュを返す (`:632`)。O-7 以前は画面を開いた瞬間に `loading` が立ちボタンは押せなかった
- **同種事象探索**: `listRuntimes` (session-list) 1 件。待ちの間の表示とボタンを確かめるテストは 0 件
- **リスク/影響**: 検出の待ちが数秒続く間に押すと session charter の KPI「列挙の網羅」が黙って崩れる
- **推奨アクション**: マウントの時点で `loading` を立てる (または検出を待っている状態を持つ) ことで、スケルトンと `aria-busy` を出しボタンを busy にする。テストを足す
- **根拠**: PO-4、spec FR-016 / SC-008 / Edge Cases、session charter KPI「列挙の網羅」

### [Medium] 起動ダイアログを開いている間も「見ているセッション」を変えないので、モーダルに隠れた会話の承認待ちが読み上げられない (M-003) (scope: feature)

- **観察**: `watchedIdOf` (`stores/ui.ts:118-123`) は `settings.open` しか見ない。data-model.md:47 は「起動ダイアログの間は中央の会話は見えている」とするが、実際の起動ダイアログは Radix のモーダルで全面のオーバーレイ (`dialog.tsx:40`) が掛かり、中央の大半と承認カードの位置を覆い、外側は支援技術から隠れる
- **同種事象探索**: `watchedIdOf\(` 本番 2 件。`launchOpen` の場合のテスト 0 件
- **リスク/影響**: 起動の設定を選んでいる間に選択中のセッションが承認待ちになっても読み上げない (US-1 AC6 が欠ける面)
- **推奨アクション**: `watchedIdOf` で `launchOpen` も `settings.open` と同じに扱い、data-model §1 とテストを直す。WCAG 4.1.3 の判定は a11y-reviewer に委ねる
- **根拠**: PO-4、spec US-1 AC6 / FR-006

### [Medium] 設定で作業フォルダを登録すると、開いた元のボタンが消えるので、閉じた後のフォーカスの戻り先が無い (M-004) (scope: feature)

- **観察**: `SettingsDialog.tsx:68-74` は開いた元が `isConnected` のときだけフォーカスを戻し、消えていたら Radix の既定に任せるが `DialogTrigger` が無いので戻り先が無い。登録の成功で 5 つの開く元のうち 3 つが消える (`CenterPane.tsx:102-106`、`SessionListScreen.tsx:238`、`SessionListScreen.tsx:1022-1031`)。`AppShell.test.tsx:564-595` は登録せずに閉じる場合しか見ていない
- **リスク/影響**: 初回の流れ (未登録 → 設定 → 登録 → 閉じる) でキーボード・支援技術の利用者はフォーカスを失う
- **推奨アクション**: US-3 AC2 に fallback (サイドバーの「設定」のボタンなど) を足し、`onCloseAutoFocus` に入れる。テストを足す
- **根拠**: PO-4 / PO-6、spec US-3 AC2・AC4

### [Medium] (H) tasks で完了にしたテストの観点のうち、実在しないものがある (M-005) (scope: feature)

- **観察**:
  1. FE-014・plan.md:37・RK-04 の「長い日本語の題・フォルダ名を 1 行に切り詰める」のテストが無い。「概要」は折り返している (`OverviewTab.tsx:50` の `break-words`)
  2. FE-042 / US-4 AC5 の U+202E のテストが無い
  3. FE-031 / US-3 AC4「登録の後にサイドバーへ反映」のテストが無い。AC2「閉じて開き直すと秘密の入力欄が空」は開き直していない
  4. SC-004「設定の 4 画面の既存の component テストが、ダイアログの中に置いた形で通る」: 4 画面のテストは単独で描いたまま
  5. Edge Cases の入れ子のダイアログ (解除の確認) で Esc が内側から閉じる、のテストが無い
  6. SC-002 の「設定のダイアログを開閉した後も稼働中の状態が保たれる」のテストが無い
- **同種事象探索**: `長い|truncate|切り詰` (shell の test) 0 件。`202E` (features) 0 件。設定の describe は 2 件だけ
- **推奨アクション**: 1〜6 のテストを足すか、tasks / plan / SC を実際の観点に合わせて直す
- **根拠**: PO-3、reviewer-base の H 規則、Principle VIII

### [Medium] (H) SC-003・SC-008・AD-046 Confirmation の判定がまだ出ていない。完了にする前の条件として記録が無い (M-006) (scope: feature)

- **観察**: SC-003 の `composer-screenshot` は本機で高さ 1px の差で落ち、合否は CI に委ねている。SC-008 の V-3 と AD-046 Confirmation (0046:55) は利用者に残したまま。ui charter の Principle「見た目の判断を先送りしない」が名指す判断が V-3
- **推奨アクション**: PR の説明のチェックリストと quickstart-results に、完了の前の条件として (1) CI の `composer-screenshot` の合否 (run の ID)、(2) V-3 の結果または利用者が残すリスクとして受け入れた旨を明記する
- **根拠**: PO-2、ui charter Principle、AD-046 Confirmation

### [Low] SC-006・FR-012・U-5・quickstart V-2 が AD-046 を「proposed」と書いたまま (L-001) (scope: feature)

- **観察**: spec.md:51 / :209 / :244、quickstart.md:11、plan.md:9 / :133。ADR は `status: accepted`
- **推奨アクション**: SC-006 を「AD-046 が accepted で存在する」に直し、ほかの箇所も合わせる
- **根拠**: PO-2

### [Low] 狭いウィンドウで利用者が手で開いた右のペインが、次のリサイズ (広げる方向でも) で自動で畳まれる (L-002) (scope: feature)

- **観察**: `useAutoCollapse.ts:25-36` の `belowRef` は利用者が開く前の閾値で計算した値のまま。例: 幅 1000px で開く (閾値 1080px) → 1050px に広げる → 「割った瞬間」と判定して畳む。data-model.md:68「利用者が開いたら開く」に反する
- **推奨アクション**: 開閉が変わったら `belowRef` を今の閾値で計算し直す。テストを足す
- **根拠**: PO-4、data-model §2、plan RK-05

### [Low] (H) perf の起動の手順を直したが実行していないことが、roadmap の O-3 の義務に引き継がれていない (L-003) (scope: feature)

- **推奨アクション**: O-3 の義務 (2) に「O-7 で起動と行の選択の locator を直した。実行していない」を 1 行足す
- **根拠**: PO-7

### [Low] 起動直後の既定の画面がランタイムの一覧ではなくなったのに、ランタイムが検出できない初回の案内が無い (L-004) (scope: feature)

- **観察**: 以前の既定の画面は `screen: 'runtimes'`。今の中央の空の状態はフォルダが未登録の場合だけを案内する
- **推奨アクション**: Edge Cases に扱いを書く (起動ダイアログの blocker に任せるならその旨)。または空の状態に「設定 → ランタイム」の案内を足す
- **根拠**: PO-4 / PO-6

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `store\.close\(\|session\.close` (features/*.tsx) | 2 | LivePane.tsx:137; RunningSessionList.tsx:543 |
| M-001 | `setLaunchOpen\(true\)` / `rejectReason: null` / `ThreadListNew` | 4 / 3 / 0 (本番) | Sidebar.tsx:63,113; CenterPane.tsx:99; useShellFocus.ts:42 / running-session-store.ts:356,403,425 |
| M-002 | `listRuntimes` (session-list) | 1 | useSessions.ts:81 |
| M-003 | `watchedIdOf\(` | 2 (本番) | SessionAttentionAnnouncer.tsx:28; RunningSessionList.tsx:154 |
| M-004 | `openSettings\(\|seedFolderDraft\(` | 5 (うち登録で消える 3) | Sidebar.tsx:75,150; CenterPane.tsx:103; SessionListScreen.tsx:238,1028 |
| M-005 | `長い\|truncate\|切り詰` (shell の test) / `202E` (features) | 0 / 0 | — |
| M-006 | `V-3` (quickstart-results.md) | 1 (未実施) | quickstart-results.md:41-46 |
| L-001 | `proposed` (specs/013 の spec / plan / quickstart) | 6 | spec.md:51,209,244; quickstart.md:11; plan.md:9,133 |
| L-002 | `shellThreshold\(` | 2 | useAutoCollapse.ts:25,32 |
| L-003 | `real-sessions\|実行していない` (roadmap) | 0 | — |
| L-004 | `noFolders` (features/shell) | 1 | CenterPane.tsx:90 |

## Verdict

- Critical: 0
- High: 1
- Medium: 6
- Low: 4

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
