# a11y-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-22
**Reviewer**: a11y-reviewer
**Spec**: specs/021-session-resume/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: UI に関わるのは FR-001・FR-002・FR-006・FR-009・FR-010・FR-012・FR-013 と SC-004・SC-005・SC-007。
- touched files に該当する charter / Confirmation: session charter Journey 4 (引き継ぐ軸と選び直せる軸)。UI の touched files は次の 9 つ。
  - `src/renderer/src/features/session/PastResumeBar.tsx`
  - `src/renderer/src/features/session/RunningSessionRow.tsx`
  - `src/renderer/src/features/session/LivePane.tsx`
  - `src/renderer/src/features/session/LaunchDialog.tsx`
  - `src/renderer/src/features/session/resume-action.ts`
  - `src/renderer/src/features/session/labels.ts`
  - `src/renderer/src/features/session/running-session-store.ts`
  - `src/renderer/src/features/shell/LaunchDialogHost.tsx`
  - `src/renderer/src/features/shell/CenterPane.tsx`
- shadcn / assistant-ui の vendored primitive は diff に無く、指摘対象外にした。
- code-gate の `must_fix_findings` は空。a11y-reviewer は code-gate では skipped だったので、重複する file:line は無い。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (WCAG): Critical:0 High:0 Medium:2 Low:2
- H. テスト / coverage / observability / regression: High:0 Medium:1 Low:0

## スコープ要約

X-9 は、過去の行の「再開」の帯 (`PastResumeBar`)、稼働中の行・`EndNotice`・`FailureBanner` の「再開」「やり直す」ボタン、再開の形の起動ダイアログ、それまでの会話と「ここから再開」の区切りの表示を足す。

WCAG 2.1 AA の観点では、ほとんど既存の部品と規則を再利用している。
- ボタンは全部 `<button>` で、compact のアイコンボタンには `aria-label` と `title` が付いている。アイコンは `aria-hidden`。
- 引き継ぐ 3 軸は `dl/dt/dd` の表示のみで、無効化した select ではない。
- ダイアログは Radix の focus trap・Esc を使い、閉じるときのフォーカスは `useDialogReturnFocus` が元の要素か `new-session` に戻す。
- 「やり直す」の行ボタンは `handOffFocusFromClosingRow` を通る。
- それまでの会話には編集・再生成・承認の操作が出ないことをテストで固定している (`LivePane.resumed.test.tsx:178`)。
- 新しい配色は無く、既存の `text-muted-foreground` / `text-destructive` だけを使っている。
- axe を 3 画面で走らせている。ただし jsdom なので `color-contrast` は無効。

Critical と High は 0 件。以下は Medium / Low で、AD-050 によりこの gate では直さない。

## Findings

### [Medium] 過去の行の「再開」が押せない理由が、キーボード・支援技術から発見しにくい (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/PastResumeBar.tsx:93-106` で、押せないときの「再開」は `disabled` になる。理由の `<p>` は `aria-describedby` で結んである。取得中は押せない状態のまま理由も出さず、取得が終わっても結果を知らせる live region が無い。
- **同種事象探索**: `aria-live|role="status"|role="alert"` を `PastResumeBar.tsx` で Grep し 0 件。
- **リスク/影響 (WCAG 4.1.3 / 2.1.1)**:
  - `disabled` な button は Tab で到達できない。そのため `aria-describedby` は読み上げられず、キーボードと読み上げの利用者は、理由と隣の「作業フォルダとして登録」(`folder-unregistered` のとき) に気づくには閲覧モードで探すしかない。
  - 行を選んだ直後は、押せない「再開」が理由なしで出る。数百 ms 後に理由が現れ、それを知らせる手段が無い。
- **推奨アクション**:
  - 理由の `<p>` を常時マウントした `role="status"` の領域に入れ、中身だけ差し替える。同じ作りが `LaunchDialogHost.tsx:70` にある。
  - 押せない「再開」は `aria-disabled="true"` にして focusable のまま保ち、click を無視する。こうすれば `aria-describedby` が効く。
- **根拠**: WCAG 2.1 SC 4.1.3 (Status Messages)、SC 2.1.1。
- **scope 根拠**: `PastResumeBar.tsx` は feature の新規ファイル。

### [Medium] それまでの会話の読み取り失敗が、読み上げに知らされない (M-002) (scope: feature)

- **観察**: `src/renderer/src/features/session/running-session-store.ts:189-205` で、失敗の 1 行は `status: 'warning'` の system-event として `messages` の先頭に入る。`src/renderer/src/features/chat/transcript-announcements.ts:11` は `notice` / `warning` を読み上げ対象から除外している。FR-013 は「中央に失敗を 1 行で出す」とあるが、読み上げの経路は無い。`LivePane.resumed.test.tsx:188` は見えることしか確かめていない。
- **同種事象探索**: `resumedLoadFailed` を `src/renderer` の非テストで Grep し 2 件 (`labels.ts:113`、`running-session-store.ts:200`)。どちらにも live region は無い。
- **リスク/影響 (WCAG 4.1.3)**: 再開直後に非同期で会話の読み込みが失敗すると、視覚の利用者は 1 行で気づく。読み上げの利用者は、続きを話すのに必要な文脈が無いことに気づかないまま composer に進む。
- **推奨アクション**: 失敗の行が出たときだけ、常時マウントした `role="status"` で一度読み上げる。または `TranscriptAnnouncer` に `resumed:load-failed` の id を例外として足す。
- **根拠**: WCAG 2.1 SC 4.1.3。
- **scope 根拠**: `running-session-store.ts` と `LivePane.tsx` が touched files。

### [Low] 再開の形のダイアログで、引き継ぐ軸の値が読み込み中に空の `<dd>` になる (L-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/LaunchDialog.tsx:484-507` の `fixedNames` は、一覧を読み込み中は `''` を返す。`LaunchDialog.tsx:526,530,534` の `dd` が空のまま描かれ、読み上げは「フォルダ」の項目名だけを読む。
- **リスク/影響**: 一瞬だが、読み込み中だと伝える文字が無い。
- **推奨アクション**: `'読み込み中…'` を入れる。
- **根拠**: WCAG 1.3.1 (情報と関係性)。
- **scope 根拠**: `LaunchDialog.tsx` は feature の touched file。

### [Low] `EndNotice` の `role="status"` の中に操作ボタンが増えた (L-002) (scope: feature)

- **観察**: `src/renderer/src/features/session/LivePane.tsx:475-489` の `role="status"` 領域の中に、既存の「閉じる」に加えて「再開」ボタンが入った。`FailureBanner` の `role="alert"` (`LivePane.tsx:445-457`) も同じ構造で、「再開」「やり直す」と「閉じて再起動」が並ぶ。
- **リスク/影響**: `role="status"` / `alert` は文言の変化を読み上げる。ボタンの出入りで、領域の内容が毎回読み直される支援技術がある。既存の作りを踏襲しており、実害は小さい。
- **推奨アクション**: 文言の `<span>` だけを live region にして、ボタンは外に出す。
- **根拠**: WAI-ARIA の live region の使い方。
- **scope 根拠**: 既存の作りの踏襲。マイルストーン末の棚卸しで扱うのが妥当。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `aria-live\|role="status"\|role="alert"` (PastResumeBar.tsx) | 0 | - |
| M-002 | `resumedLoadFailed` (src/renderer 非テスト) | 2 | `labels.ts:113`、`running-session-store.ts:200` |
| L-001 | `fixedNames\|<dd>` (LaunchDialog.tsx) | 3 | `LaunchDialog.tsx:526`、`:530`、`:534` |
| L-002 | `role="status"` + ボタン (LivePane.tsx) | 2 | `LivePane.tsx:475`、`:445` |

(Critical の指摘は無いので、cascade による降格は発生しない。)

## H. テスト / regression の補足 (Medium 1 件)

- **検出できるテストの有無**:
  - `PastResumeBar.test.tsx:155`、`LaunchDialog.resume.test.tsx:227`、`resume-action.test.tsx:285`、`LivePane.resumed.test.tsx:218` の axe は違反 0 を固定している。
  - 判定が jsdom 上のため、`color-contrast` は 4 本とも無効 (`AXE_RULES`)。新しい配色は無いので regression の余地は小さい。
- **Medium (H-M-001)**:
  - 再開の経路にフォーカスの確認が 1 件も無い。`toHaveFocus` / `toBeFocused` / `activeElement` を `*resume*` / `*Resume*` のテストと `e2e/session-resume.spec.ts` で Grep し 0 件。
  - 特に次の 2 つが固定されていない。
    - 稼働中の行から「再開」を押して元の行が消えたあと、ダイアログを閉じたときに `useDialogReturnFocus` が `new-session` に戻すこと。
    - 過去の行から再開が受け付けられて `PastResumeBar` が unmount したときの行き先。
  - 実装は `useDialogReturnFocus` で支えられているので、今は動く見込みだが、将来の変更で壊れても気づけない。
  - O-4 FR-019 の既存テストと同じ形で、再開のボタンにもフォーカス移動のテストを足すのが望ましい。
- **観測点**: 該当なし。UI に log / metric を置く層ではない。
- **regression の根拠**: 既存の起動ダイアログは `resume === null` の分岐で何も変わらない。`LaunchDialog.tsx:204` の `session.resume ?? null` で、全テストが緑 (3856 件) になっている。

## Verdict

- Critical: 0
- High: 0
- Medium: 3 (M-001、M-002、H-M-001)
- Low: 2 (L-001、L-002)
