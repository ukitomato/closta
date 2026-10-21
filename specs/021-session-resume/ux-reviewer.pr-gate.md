# ux-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-22
**Reviewer**: ux-reviewer
**Spec**: specs/021-session-resume/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: UI に関わるのは FR-001・FR-002 (再開の出し分け)、FR-006〜FR-009 (再開の形のダイアログ・「やり直す」)、FR-010・FR-011 (行の入れ替え・同じ会話が動いているときの扱い)、FR-012・FR-013 (それまでの会話の表示)。SC は SC-004・SC-005・SC-006・SC-007。
- touched files に該当する charter / Confirmation: docs/domains/session/charter.md (Journey 4)、AD-059 (accepted)、AD-041 (安全な権限モード 3 値)。UI 範囲のコードは AD-059 の決定に反していない。
- A. 認可 / 認証 / secret 管理: 該当なし: ux-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: ux-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: ux-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: ux-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が担当。UX 完成度は G に記録した
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が担当。UX-6 の表記は G の L-002 に記録した
- G. optional reviewer 範囲 (ux): Critical:0 High:0 Medium:5 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

X-9 は、過去の行 (中央の `PastResumeBar`)、稼働中の終了済み・失敗した行 (`resume-action.ts`)、再開の形の起動ダイアログ (`LaunchDialog.tsx`)、それまでの会話の読み取り専用表示 (`running-session-store.ts` の `applyResumed`) を足す。UX-1〜UX-9 を見た結果、Critical と High に当たるものは無かった。拒否の理由は `RESUME_UNAVAILABLE_LABELS` / `launchRejectLabel` で日本語化され、技術的なエラーの生表示は無い。拒否時はダイアログが開いたまま `role="alert"` で理由が出る。読み取りの失敗は 1 行で出て、composer は使える。会話の id や cwd を DOM に出していない。`resumeActionFor` の純関数で行・`EndNotice`・`FailureBanner` の出し分けがそろっている。壊れていない根拠もある: テスト 3856 件が通り (code-gate)、PastResumeBar・resume-action・LaunchDialog.resume・LivePane.resumed・store の各テストが主要な状態を網羅している。残るのは、状態遷移の説明と回復導線の不足 (Medium 5 件、Low 5 件) である。

## Findings

### [Medium] 同じ会話が動いているとき、何の説明もなくダイアログが消えて別の行に移る (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/running-session-store.ts:828-837` で、`already-running` を受けると `selectedId` を差し替えて `resume: null` に戻すだけで、通知を出さない。`conversationRunning` の文言 (`labels.ts:108`) が出るのは、返された行が renderer のストアに無いとき (`:830`) だけである。`PastResumeBar.tsx:96` は、その会話が動いていても「再開」を押せる状態にする。利用者はモデルなどを選んで「再開する」を押した後、理由の説明なしに別のセッションへ飛ばされる。
- **同種事象探索**: `Grep "already-running"` を renderer の非テストで検索。running-session-store.ts:828 の 1 件のみ。toast / banner の仕組みは `Grep "toast|Toaster"` で `src/renderer/src/features/session` に 0 件。
- **リスク/影響**: UX-8 / UX-1。FR-011 (その行を選ぶ) の文面は満たしているが、利用者から見ると「再開を押したのに何も起きず別画面になった」と受け取れる。
- **推奨アクション**: 移動先の中央に 1 回限りの `role="status"` の知らせ (「この会話はすでに実行中のため、実行中のセッションを表示しました」) を出す。または `resolvePastResume` で動いている会話を判定し、「再開」の代わりに「実行中のセッションを表示」を出す。
- **根拠**: UX-8、spec U-5。
- **scope 根拠**: touched files (running-session-store.ts、PastResumeBar.tsx) で直せる。

### [Medium] それまでの会話の読み込み中を示す表示が無く、完了時に先頭へ差し込まれる (M-002) (scope: feature)

- **観察**: `LiveSessionState.resumed.phase` ('loading' / 'loaded' / 'failed') は `running-session-store.ts:745` で設定され、`:670` で更新されるが、UI は読まない。`Grep "resumed"` を非テストの renderer で検索すると、読む箇所は store 内だけ。`LivePane.tsx` には読み込み表示が無い。`applyResumed` (`:654-676`) は読み取りの完了後に、既存の `messages` の前へ会話を差し込む。
- **同種事象探索**: `Grep "resumed\?\.phase|resumed\.phase"` で 2 件 (running-session-store.ts:659, :670)。どちらも store 内で、描画側は 0 件。
- **リスク/影響**: UX-3。transcript が大きいと、読み取り中は「新規セッション」のように空の中央に見える。利用者がその間に入力を始めると、完了後に画面の中身が上から押し下げられる。
- **推奨アクション**: `resumed.phase === 'loading'` の間、Thread の上に「それまでの会話を読み込んでいます…」の `role="status"` を 1 行出す。完了したら消す。
- **根拠**: UX-3 (200ms を超える操作へのフィードバック)、spec FR-012。
- **scope 根拠**: touched files (LivePane.tsx) で直せる。

### [Medium] 再開で元の行を差し替えるとき、取り消された入力と下書きが黙って消える (M-003) (scope: feature)

- **観察**: `running-session-store.ts:857-861` の `replace` が `queues.delete` / `drafts.delete` を行う。元の行が終了済みまたは失敗のとき、`LivePane.tsx:234` の `CancelledQueueNotice` は「送信されずに取り消された入力 (N)」を表示している (切り詰め表示で、コピーする手段は無い)。再開を押すとその行ごと消え、再送の導線も引き継ぎも無い。
- **同種事象探索**: `Grep "drafts.delete|queues.delete"` を running-session-store.ts で検索。3 件 (`:859`, `:860`, `:1019-1020` の close)。close は既存の「閉じる」操作で、操作の意味が違う。
- **リスク/影響**: UX-5。失敗から復帰する目的で「再開」を選ぶ利用者は、直前に積んでいたプロンプトを失う。「閉じる」と違い、再開は続きを話す操作なので期待とずれる。
- **推奨アクション**: 取り消された入力があるとき、新しい行の composer の下書きへ引き継ぐ (連結して 1 回だけ)。難しければ、再開のダイアログに「取り消された入力 N 件は引き継がれません」と明示する。
- **根拠**: UX-5。
- **scope 根拠**: touched files (running-session-store.ts) で直せる。

### [Medium] 再開の形のダイアログで、引き継ぐ軸が変えられないのに「組み合わせを見直してください」で起動が止まる (M-004) (scope: feature)

- **観察**: `LaunchDialog.tsx:837-845` の `folderRuntimeUnreachable` の表示は `resume` で分岐しない。`CROSS_BOUNDARY_LABELS.unreachable` (`labels.ts:558-559`) の文言は「組み合わせを見直してください」である。また `:334-340` により、そのとき `launchConfig` は null になり、「再開する」ボタンは無効になる。再開の形では 3 軸が `fixed` で選べないため、利用者が文言どおりに動く手段が無い。ブロックはダイアログを閉じるまで解けない。spec FR-008 は「起動ゲートの理由で拒否する」としているが、ここは renderer が先に止めている。
- **同種事象探索**: `Grep "folderRuntimeUnreachable|folderRuntimeProbeFailed"` で LaunchDialog.tsx の 8 件 (`:329`, `:333`, `:337-338`, `:812-845`)。`probeFailed` は「再評価」の導線があるので同じ詰まりにはならない。
- **リスク/影響**: UX-2 の回復導線欠如。到達できない組み合わせは、過去の行の解決 (`resolvePast`) を通った後はまれにしか起きない。起きた場合は、直し方を示さない無効ボタンだけが残る。
- **推奨アクション**: 再開の形では文言を差し替える (「この会話の作業フォルダとランタイムの組み合わせには到達できません。ランタイムの状態を確かめてから再開してください」)。または、このブロックを外して main の拒否に任せる。
- **根拠**: UX-2、spec FR-008。
- **scope 根拠**: touched files (LaunchDialog.tsx、labels.ts) で直せる。

### [Medium] 「やり直す」と「閉じて再起動」が同じ結果で並び、「再開」と「閉じる」の主従も付いていない (M-005) (scope: feature)

- **観察**: 会話の id が無い失敗の行では、`FailureBanner` (`LivePane.tsx:431-458`) が「やり直す」と「閉じて再起動」の両方を出す。「やり直す」は `resume-action.ts:64-67` で `store.close` を呼んでからダイアログを開く。「閉じて再起動」は `session.close` で、`useShellFocus.ts:47-48` により、中央で失敗した行を閉じると前回の設定でダイアログが開く。どちらも同じ結果になる。さらに「再開」・「やり直す」・「閉じる」はすべて `variant="outline"` で、主操作が区別されない (`LivePane.tsx:451`, `:455`, `:481`, `:486`、`RunningSessionRow.tsx:357`)。
- **同種事象探索**: `Grep "閉じて再起動|閉じて起動し直す"` で 1 件 (LivePane.tsx:456)。
- **リスク/影響**: UX-7 / UX-9。同じ画面に別名の同じ操作が並び、どちらを押すか迷う。
- **推奨アクション**: 「やり直す」が出るときは「閉じて再起動」を出さない。または「再開」/「やり直す」を主操作 (default の variant) にし、「閉じる」系を ghost にする。
- **根拠**: UX-7、UX-9。
- **scope 根拠**: touched files (LivePane.tsx、RunningSessionRow.tsx) で直せる。

### [Low] 取得失敗が「一覧を再取得」と案内され、再試行の操作も無い (L-001) (scope: feature)

- **観察**: `PastResumeBar.tsx:53-59` は、IPC が失敗したとき `source-unknown` に倒す。文言は「この会話を再開できません。一覧を再取得してから試してください」(`labels.ts:94`) で、IPC 失敗の利用者には見当違いな案内になる。稼働中の行の `source-unknown` 拒否 (main のレコードが無い場合) でも、同じ「一覧」という言い方が出る。再試行の操作は無い。
- **推奨アクション**: 取得失敗は別の理由 (「再開できるか確認できませんでした」) と「再試行」のボタンにする。稼働中の行向けには「一覧」を含まない文言にする。
- **根拠**: UX-2。

### [Low] 文字列がハードコードされ、同じラベルが 2 か所に重複している (L-002) (scope: feature)

- **観察**: 「作業フォルダとして登録」が `PastResumeBar.tsx:109` と `SessionListScreen.tsx:271` に直書きされている。他の再開の文言は `labels.ts` の `RESUME_LABELS` にある。
- **同種事象探索**: `Grep "作業フォルダとして登録"` で 2 件 (PastResumeBar.tsx:109, SessionListScreen.tsx:271)。
- **推奨アクション**: 1 つの定数にして両方から参照する。
- **根拠**: UX-6、UX-9。

### [Low] 再開の起動中も「セッションを起動中…」と表示される (L-003) (scope: feature)

- **観察**: `LivePane.tsx:123-130` の `Launching` は固定の文言である。`LaunchDialogHost.tsx:70-72` の読み上げも `SHELL_LABELS.launching` のままで、再開の形でも「再開中」にならない。
- **推奨アクション**: `launch.resume !== null` のときは「セッションを再開中…」にする。
- **根拠**: UX-9。

### [Low] 再開の形で、ランタイム停止時の「再評価」導線が出ない (L-004) (scope: feature)

- **観察**: `LaunchDialog.tsx:472-482` は、再開の形では blocker と `allRuntimesStopped` を出さない。ディストロが停止していると、起動後に main から `distro-not-running` の拒否文言が出るだけで、「再評価」ボタンは出ない。
- **推奨アクション**: 拒否文言に併せて「再評価」を出す。
- **根拠**: UX-2 (回復の導線)。

### [Low] `cwd-mismatch` の理由で「登録」の導線が出ない (L-005) (scope: feature)

- **観察**: `labels.ts:82-83` は「そのディレクトリを作業フォルダとして登録してから再開してください」と案内する。しかし `PastResumeBar.tsx:107` は `folder-unregistered` のときだけ登録ボタンを出す。`register-seed.ts:15` は、グループが未登録でないとき null を返す。案内文だけがあり、操作が無い。
- **推奨アクション**: `cwd-mismatch` でも登録の初期値を渡せるなら、ボタンを出す。渡せないなら、設定の「作業フォルダ」を開く導線にする。
- **根拠**: UX-2。

## 同種事象探索 cascade summary

Critical の申告は 0 件のため、cascade_enforce の対象は無い。参考として、各指摘の探索結果を載せる。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `already-running` (renderer 非テスト) | 1 | running-session-store.ts:828 |
| M-002 | `resumed\.phase` / `resumed\?\.phase` | 2 (store 内のみ。描画側 0) | running-session-store.ts:659, :670 |
| M-003 | `drafts.delete\|queues.delete` | 3 | running-session-store.ts:859, :860, :1019-1020 |
| M-004 | `folderRuntimeUnreachable\|folderRuntimeProbeFailed` | 8 | LaunchDialog.tsx:329-338, :812-845 |
| M-005 | `閉じて再起動\|閉じて起動し直す` | 1 | LivePane.tsx:456 |
| L-002 | `作業フォルダとして登録` | 2 | PastResumeBar.tsx:109, SessionListScreen.tsx:271 |

## H (テスト / observability / regression) の補足

- **[Medium] (H-001)** 上の UX の穴を検出するテストが無い。
  - `already-running` を受けたときの利用者向けの知らせ (M-001)、読み込み中の表示 (M-002)、差し替え時の入力の引き継ぎ (M-003) は、どのテストにも出てこない。`running-session-store.resume.test.ts:166` は `already-running` で行が選ばれることだけを確かめている。
  - `LaunchDialog.resume.test.tsx` に `folderRuntimeUnreachable` のケースが無い。
  - E2E は `e2e/session-resume.spec.ts` の 3 件だけで、偽の capability を使う。実機の確認 (quickstart V-0〜V-9) は「未実施」とされている (`quickstart-results.md:22`)。これは spec の合否の扱いで許容されているが、UX の最終確認は未実施である。
- 既存の振る舞いが壊れていない根拠: 全件 3856 件が通っている。axe の検査が PastResumeBar、LaunchDialog.resume、LivePane.resumed、resume-action の各テストにある。
- 観測点: 再開の失敗の原因を追える log は `conversation-id-changed` の 1 つだけ。会話の id を出さない方針と整合している。

## Verdict

- Critical: 0
- High: 0
- Medium: 6 (UX 5 件 + H-001)
- Low: 5
- Round inheritance: 初回 round のため該当なし
