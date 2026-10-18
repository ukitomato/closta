# a11y-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18
**Reviewer**: a11y-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 1 (gate: pr-gate / scope: system)

## 初回読了 viewpoint

- FR/SC (a11y に関わるもの): FR-001 (答える部品), FR-007 (問いのカード・フォーカスの引き継ぎ), FR-012 (コマンドの候補・IME), FR-013 (ボタン名の日本語化), FR-014 (フォーカスを奪わない), FR-015 (編集して再試行)。US-1 AC3 / AC5, US-2 AC1 / AC4 / AC5, US-3 AC1〜AC6, US-4 AC1〜AC4。SC-006 (vitest-axe 違反 0), SC-007。
- touched files に該当する charter / Confirmation: ui charter (composer の持ち主)。AD-046 (O-7 の vitest-axe)、AD-047 (`focus-handoff.ts`)、AD-045 (labels)。Constitution VIII (IME)、XII、XIII (Manual の検証者が a11y-reviewer)。
- 対象にした UI ファイル: `src/renderer/src/features/session/ElicitationCard.tsx`、`AskUserQuestionAnswer.tsx`、`ApprovalCard.tsx`、`LivePane.tsx`、`src/renderer/src/features/chat/composer-extensions.tsx`、`slash-commands.ts`、`src/renderer/src/components/assistant-ui/elements/thread.aui.tsx` (Composer・RetryRefusedButton・SystemEventRow)、`ask-user-question.aui.tsx`、`focus-handoff.ts`。`src/renderer/src/components/ui/**` (button / input) は exclude_patterns のため指摘対象外で、読むだけにした。
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: a11y-reviewer の担当外 (po-reviewer)
- F. 命名 / module / lint hookup: 該当なし: a11y-reviewer の担当外 (convention-reviewer)
- G. optional reviewer 範囲 (WCAG 2.1 AA): Critical:0 High:2 Medium:3 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

diff は 2 つのカードと 1 つの popover を足している。
- `AskUserQuestion` に答える部品: `fieldset` / `legend` + ラジオ / チェック + 「その他」。
- MCP の問い (Elicitation) のカード: form / URL。
- composer のスラッシュコマンドの候補: assistant-ui の trigger popover を使う。

あわせて composer のボタン名の日本語化と `unstable_focusOnRunStart={false}`、拒否の行の「編集して再試行」(確認ダイアログつき) を足している。

意味付けの土台は概ね良い。
- ネイティブの `fieldset` / `legend` / `label` / `input` を使っている。
- 日本語のボタン名は `aria-label` で付いている。
- 「編集して再試行」の dialog は Radix で、初期フォーカスと戻り先の制御がある。
- カードの応答時は `handOffFocusToComposer` で、消える前にフォーカスを移している。
- O-1 の `SessionAttentionAnnouncer` が `awaiting_permission` への遷移を読み上げる。

問題は次の 3 点に集まる。
- 入力エラーと未回答の「どこが」を非視覚的に特定できない (High 2 件)。
- 無効状態の見た目と popover の ARIA 構造に不備がある。
- 新設した入力カードへ到達する経路と、そのフォーカス引き継ぎのテストが弱い。

Critical になる観察事実 (キーボードで到達不可・文字が読めないコントラスト) は見つからなかった。コントラストは配色トークン (`--muted-foreground` 約 4.8:1 など) を使う範囲では問題ないと読んだ。ただし新規の `border-destructive/60` は後述のとおり未確認。

## Findings

### [High] 未回答の問いの特定が色だけ (H-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/AskUserQuestionAnswer.tsx:90-98` は、未回答の `fieldset` を `border-destructive/60` (半透明の赤い枠) に変え、`data-unanswered` を付けるだけである。`data-unanswered` は支援技術に公開されない。全体のメッセージは `:217-225` の「未回答の問いがあります」だけで、どの問いかを言わない。
- **同種事象探索**: `aria-invalid|data-unanswered` で `src/renderer/src` を検索。使用箇所は `AskUserQuestionAnswer.tsx:92` の 1 件のみ (ほかは `components/ui/*` の定義と test)。
- **リスク/影響**:
  - WCAG 1.4.1 (色のみに依存しない・A)。US-1 AC3 の「未回答の問いが分かる」が、色覚特性のある利用者とスクリーンリーダー利用者には満たされない。
  - 4 問のうち 1 問だけ空のとき、利用者は「回答を送る」が反応しない理由を特定できない。
  - 半透明の枠は非テキストのコントラスト 3:1 (1.4.11) を満たす保証もない。jsdom の axe は `color-contrast` を無効にしている (`AskUserQuestionAnswer.test.tsx:8`)。
- **推奨アクション**:
  - 未回答の `fieldset` に見えるテキスト (「未回答」) を `legend` の中に足す。または問いごとの説明要素を作り、`aria-describedby` で結ぶ。
  - 全体のメッセージには、未回答の問いの番号か本文を入れる。
  - 枠は不透明の `border-destructive` にする。
  - test の `data-unanswered` 検査は、上記のテキストの存在の検査に置き換える。
- **根拠**: WCAG 2.1 SC 1.4.1 / 1.3.1 / 1.4.11。spec US-1 AC3。
- **scope 根拠**: 本 feature の新規ファイル。

### [High] form の入力エラーが、どの項目かを特定せず、項目にも結ばれない (H-002) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/ElicitationCard.tsx:284-288` は、送る前の確かめが外れると `role="alert"` に固定の文「入力を確かめてください」(`labels.ts` の `ELICITATION_LABELS.invalid`) を出す。
  - 外れた項目は特定されない。`aria-invalid` も、項目からのエラー参照 (`aria-describedby`) も無い (`FieldInput` `:82-170`)。
  - `form` 要素を使っていない (`:24-26` のコメント) ので、ブラウザの検証も働かない。
  - 外れる条件は、必須が空・数が範囲外・整数でない・文字数の超過など (`ElicitationCard.test.tsx:113-146` が確かめている)。
- **同種事象探索**: `aria-invalid` で `src/renderer/src` を検索。feature 内の使用は 0 件。`components/ui/input.tsx` は `aria-invalid:` の見た目を既に持つ。同種の汎用エラー: `AskUserQuestionAnswer.tsx:226-234` の `answerInvalid` (超過は文字数だけで、実質的に到達しにくい)。
- **リスク/影響**: WCAG 3.3.1 エラーの特定 (A)・3.3.3 エラー修正の提案 (AA)。9 項目の form で 1 つの範囲外の数を入れたとき、スクリーンリーダー利用者は、どれを直すかを走査して探すしかない。spec U-6 (e) の「カードに理由を出す」は文としては満たすが、「理由」が空洞である。
- **推奨アクション**:
  - 項目ごとに失敗の理由を判定する (必須・範囲・文字数・整数)。理由の文は項目の下に出し、`aria-describedby` で `description` と並べて結ぶ。
  - 外れた項目には `aria-invalid="true"` を付ける (`Input` は見た目の対応済み)。
  - 全体の `role="alert"` の文は「N 件の項目を確かめてください」に変える。
  - 送る失敗のあと、最初の外れた項目にフォーカスを移す。
- **根拠**: WCAG 2.1 SC 3.3.1 / 3.3.3 / 4.1.3。
- **scope 根拠**: 本 feature の新規ファイル。

### [Medium] 「回答を送る」は `aria-disabled` だが見た目が有効なままで、押しても反応がない (M-001) (scope: feature)

- **観察**: `AskUserQuestionAnswer.tsx:239` は `aria-disabled={!allAnswered}` だけを付ける。`Button` の無効の見た目は `disabled:` 系のみ (`components/ui/button.tsx:7`) で、`aria-disabled` 用の見た目は無い。同種の画面 (`SessionListScreen.tsx:588-589`・`WorkspaceFoldersScreen.tsx:410`) は枠線や減光で補っている。
- **同種事象探索**: `aria-disabled` で `src/renderer/src` の tsx を検索。`AskUserQuestionAnswer.tsx:239` を含む 9 箇所 (うち減光を補うのは `SessionListScreen.tsx:588`)。この feature では呼び出し側の className が無い。
- **リスク/影響**: 弱視・認知面の利用者には有効に見えるボタンが何も起こさない。H-001 の特定の弱さと重なる。WCAG の免除 (非活性の部品) があるため Medium。
- **推奨アクション**: 呼び出し側で `className="aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"` を足す (vendored の `button.tsx` は触らない)。押したときに、未回答のメッセージへフォーカスを移すか、H-001 の特定を読み上げる。
- **根拠**: WCAG 1.4.1 / 3.3.1 (補助)。同様の既存実装との一貫性。

### [Medium] 候補の listbox の構造が ARIA として不正で、候補の件数・「ほか N 件」が伝わらない (M-002) (scope: feature)

- **観察**:
  - `src/renderer/src/features/chat/composer-extensions.tsx:76` と `:93-97` で、`role="listbox"` の中に `role="option"` でない `div` (「ほか N 件」) を置いている。listbox の子は option / group のみを許す。
  - 件数の変化や 0 件を告げる live region は無い (WCAG 4.1.3)。
  - `LivePane.composer.test.tsx:153-156` は、textarea に付く `aria-expanded` が `aria-allowed-attr` に触れるため、この axe 規則を自ら無効にしている。つまり開いている間の合成の ARIA は axe を通っていない。
  - 21 件の test (`:179-193`) は axe を走らせていない。
- **同種事象探索**: `role="listbox"` で feature 内の使用は `composer-extensions.tsx:45` の 1 件。ほかの `aria-allowed-attr` の無効化は `LivePane.composer.test.tsx:155` の 1 件。
- **リスク/影響**: ライブラリの `aria-activedescendant` で選択中の候補は読まれる可能性が高いが、`aria-expanded` を textarea に付けても役割が `textbox` のままで、スクリーンリーダーによっては「候補が出た」ことも「ほか N 件」も読まれない。
- **推奨アクション**:
  - 「ほか N 件」を listbox の外 (popover の兄弟の要素) に出し、`role="status"` の領域に入れる。
  - 候補の出現を、常にマウントしてある polite の領域で読み上げる (例: 「コマンドの候補 N 件」)。
  - ライブラリ出力の `aria-allowed-attr` の例外は、実際の SR で確かめた結果と一緒に test のコメントに残す。
- **根拠**: WAI-ARIA 1.2 listbox / combobox パターン。WCAG 4.1.2 / 4.1.3。
- **scope 根拠**: `composer-extensions.tsx` は本 feature の新規ファイル。textarea 側はライブラリの管轄 (Input を差し替えない。AD-037)。

### [Medium] 新しい入力カードの出現時にフォーカスも説明も与えられず、キーボード到達が遠い (M-003) (scope: feature)

- **観察**:
  - `LivePane.tsx:210-235` で、承認カードと問いのカードは Thread の前の DOM に差し込まれる。出現してもフォーカスは移らず、`ElicitationCard.tsx:206-211` と `ApprovalCard.tsx:40-44` の `role="alertdialog"` に `aria-describedby` が無い (`aria-label` は見出しと同じ文)。
  - フォーカスが composer にあるまま Shift+Tab で戻ると、手前の transcript のフォーカス可能な要素 (tool の開閉・action bar など) を全部通る。
  - 新設の form / 選択のカードは、承認カードの「許可 / 拒否」の 2 ボタンと違い、入力が必須になる。
  - `SessionAttentionAnnouncer` の「承認待ちになりました」の読み上げはあるが、カードの場所や中身は伝えない。
- **同種事象探索**: `role="alertdialog"` で feature 内の使用は `ElicitationCard.tsx:207`・`ApprovalCard.tsx:41` の 2 件 (承認カードは既存の様式)。
- **リスク/影響**: WCAG 2.4.3 フォーカスの順序・2.4.1 (ブロックのスキップ)。キーボードだけの利用者が、待たせている問いに到達する効率が悪い。承認カード由来の既存の様式なので、Medium に留める。
- **推奨アクション**: `aria-describedby` で `message` を結ぶ。カードの見出しにスキップ先を設ける、または「承認待ちのセッションへ移る」の導線を表示中のセッションの問いにも使えるようにする。ほか、ユーザーが操作していない (composer が空でフォーカスが composer にある) ときだけ、カードの最初の入力に移す案もある。
- **根拠**: WCAG 2.4.3。WAI-ARIA の alertdialog。
- **scope 根拠**: `ElicitationCard.tsx` は本 feature の新規ファイル。承認カード側 (`ApprovalCard.tsx`) は既存の様式を引き継いでいる。

### [Low] 「生成を止める」だけツールチップが無い (L-001) (scope: feature)

- **観察**: `thread.aui.tsx:826-834` の `Button` (停止) は `aria-label` だけで `TooltipIconButton` ではない。spec の Clarification (「ツールチップも同じ語」) とずれる。名前は読み上げられるので WCAG 違反ではない。
- **同種事象探索**: `ComposerPrimitive.Cancel` で `thread.aui.tsx` に 1 件 (`:825`)。
- **リスク/影響**: アイコンだけで、視覚の利用者に名前が出ない。
- **推奨アクション**: `TooltipIconButton` に替える。
- **根拠**: spec FR-013。

### [Low] 複数の問いが並ぶとき、応答のあとフォーカスが次のカードに行かず composer に落ちる (L-002) (scope: feature)

- **観察**: `LivePane.tsx:229-233` は応答のたび `handOffFocusToComposer` を呼ぶ。`remaining > 0` (`:228`) のときも次のカードではなく composer に移る。
- **同種事象探索**: `handOffFocusToComposer` の呼び出しは `LivePane.tsx` に 5 件。
- **推奨アクション**: 次の問いがあるなら、その最初の入力に移す。
- **根拠**: WCAG 2.4.3。

### [Low] 必須の列挙の選択肢にも「選択しない」が出る (L-003) (scope: feature)

- **観察**: `ElicitationCard.tsx:140` の `<option value="">` は、必須の項目でも先頭に出る。選ぶと送る前の確かめで外れる。
- **同種事象探索**: `ELICITATION_LABELS.unselected` の使用は `ElicitationCard.tsx:140` の 1 件。
- **推奨アクション**: 必須のときは `disabled` か非表示の「選んでください」にする。または H-002 の項目ごとのエラーで拾う。
- **根拠**: WCAG 3.3.3。

### [Medium] (H) フォーカスの引き継ぎとコントラストを検出するテストが無い (M-004) (scope: feature)

- **観察**:
  - FR-007 は問いのカードの応答時に O-4 の `focus-handoff.ts` へ従うと定めるが、`ElicitationCard` と `LivePane` の問いのカードの応答でフォーカスを検査するテストが無い。`tests/elicitation/elicitation-through.test.tsx` に `activeElement` / `toHaveFocus` は 0 件。`LivePane.o2.test.tsx:1188` と `:1218` は別の機能の検査である。
  - 回答の送信 (承認カード側の `handOffFocusToComposer`) にも同様に検査が無い。`ApprovalCard.test.tsx` に focus の検査は 0 件。
  - 3 つのカードのテストはいずれも axe の `color-contrast` を無効にしている。したがって、H-001 の枠の色などを機械検証する経路が無い。
  - popover の Tab での選択を a11y の観点で確かめるテストは無い (Enter だけ)。
- **同種事象探索**: `toHaveFocus|activeElement|focus` で関連 test を検索。`ApprovalCard.test.tsx` に 0 件、`tests/elicitation/elicitation-through.test.tsx` に 0 件。
- **リスク/影響**: 既存の挙動 (承認カードの許可後のフォーカスの戻り先) が O-4 から変わっていないことを守る検査が、この feature の応答経路には無い。
- **推奨アクション**: `LivePane` を通した test で、カード内のボタンを押したあと `document.activeElement` が composer であることを `AskUserQuestion` の送信・問いのカードの応答・URL のリンクの 3 経路で検査する。
- **根拠**: AD-047 / O-4 FR-019。Constitution XII。

## 同種事象探索 cascade summary

Critical は 0 件のため、cascade の対象はない。High の裏付けの検索を参考に記す。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `aria-invalid\|data-unanswered` (src/renderer/src) | 1 (feature 内) | `src/renderer/src/features/session/AskUserQuestionAnswer.tsx:92` |
| H-002 | `aria-invalid` (feature 内の使用) | 0 | (`components/ui/input.tsx` は vendored。feature に使用なし) |
| M-001 | `aria-disabled` (tsx) | 9 | `AskUserQuestionAnswer.tsx:239` ほか |
| M-002 | `role="listbox"` (feature) | 1 | `src/renderer/src/features/chat/composer-extensions.tsx:45` |
| M-003 | `role="alertdialog"` (feature) | 2 | `ElicitationCard.tsx:207`, `ApprovalCard.tsx:41` |

## Verdict

- Critical: 0
- High: 2
- Medium: 4
- Low: 3
- Round inheritance: new (Round 1)
