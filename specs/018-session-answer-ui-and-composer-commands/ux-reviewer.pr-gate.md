# ux-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18
**Reviewer**: ux-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 1 (pr-gate / scope: system)

## 初回読了 viewpoint

- FR/SC (UX 観点で影響を受けるもの): FR-001 / FR-007 (問いのカード・答える部品)、FR-012 (コマンドの候補)、FR-013 / FR-014 (composer の名前とフォーカス)、FR-015 (編集して再試行)。SC-003 / SC-006 / SC-007 / SC-008。
- touched files に該当する charter / Confirmation: session charter と ui charter (composer の持ち主)。ADR は AD-052 / AD-053 (Decision と Confirmation のみ確認)、AD-045 (labels.ts)、AD-037 (IME のガードはライブラリ側に任せる)。
- A. 認可 / 認証 / secret 管理: 該当なし: ux-reviewer の担当外 (security-reviewer が見る)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: ux-reviewer の担当外 (security-reviewer が見る)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (UX の実装完成度は G に記載)
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (empty / error state / i18n): Critical:0 High:2 Medium:3 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:0 Low:0

## スコープ要約

O-10 は、承認カード内での `AskUserQuestion` への回答 (`AskUserQuestionAnswer.tsx`)、MCP の Elicitation のカード (`ElicitationCard.tsx`)、composer のスラッシュコマンドの候補 (assistant-ui の trigger popover)、拒否の行の「編集して再試行」、composer のボタンの日本語化とフォーカスの変更を足している。確認できた点は次のとおり。

- 回答の送信ボタンは未回答のあいだ `aria-disabled` で、未回答の問いに印と文言が出る。
- 検証に落ちたときは送らず理由が出る。
- 部分集合の外の form・開けない URL・読めない問いは、断る/拒否だけが出る。
- 置き換えの確認ダイアログは具体的な文言で、既定のフォーカスが「取り消す」にある。
- 文言は `labels.ts` に集約されている。

一方、実際に使うと詰まる箇所が 3 つある。

1. 一致するコマンドが無いとき、popover が空のまま開き、Enter / Tab が握りつぶされる。
2. 問いのカードに高さの上限もスクロールも無く、親が `overflow-hidden` である。
3. 承認カードの枠が `AskUserQuestion` でも「ツールの許可」のままになっている。

code-gate verdict (`.gate-verdict-code.json`) は PASS で must_fix が空なので、その指摘は再掲していない。

## Findings

### [High] 一致するコマンドが無いと、空の候補の枠が出たまま Enter / Tab が握りつぶされて送信できない (H-001) (scope: feature)

- **観察**
  - `src/renderer/src/features/chat/composer-extensions.tsx:41-80` の popover は、`items` が 0 件のときの分岐を持たない。枠 (`border … p-1`) だけが空で描かれる。
  - `src/renderer/src/features/chat/slash-commands.ts:79-89` の `slashMatcher` は、入力が `/` で始まりカーソルが先頭の語の中にあれば、コマンドの一覧と照合せずに当たりとする。
  - ライブラリ側の挙動:
    - `node_modules/@assistant-ui/react/src/primitives/composer/trigger/TriggerPopoverResource.ts:81-84` は、`open` を「trigger がある・adapter がある・behavior がある」だけで決める。件数は見ない。
    - `.../trigger/triggerKeyboardResource.ts:104-109` は、popover が open のとき Enter / Tab で `e.preventDefault()` を呼び、`item` が無ければ `return true` する。
    - `ComposerInput.tsx:227-230` は、plugin が true を返すとそこで処理を終える。
  - したがって、`/hlep` のような綴り違い、Claude Code が報告していないコマンド、`/etc/hosts` のような最初の 1 語だけのメッセージを打って Enter を押すと、何も起きない。送られず、理由の表示も無い。残るのは空の枠だけで、Escape か送信ボタンのクリックでしか抜けられない。
  - `LivePane.composer.test.tsx:136-200` の 4 件 (一致・途中の `/`・21 件・一覧なし) には、一覧があって 0 件一致のケースが無い。spec の US-3 AC4 も「一覧が無い」場合しか決めていない。
- **同種事象探索**: `Unstable_TriggerPopover\b` (features 配下の非 test) で 1 件 (`composer-extensions.tsx:41`)。
- **リスク/影響**: 入力欄の主操作である Enter での送信が、`/` で始まる 1 語のメッセージで静かに効かなくなる。キーボードだけで使う利用者は気付きにくい。UX-1 (空の状態に説明も次の一手も無い) と UX-3 (操作へのフィードバックが無い) に当たる。
- **推奨アクション** (どちらか。1 を推す)
  1. `slashMatcher` を、コマンドの一覧を閉じ込めた形 (`createSlashMatcher(commands)`) にし、`searchSlashCommands(commands, query).items.length === 0` なら `null` を返す。popover が閉じ、Enter は通常どおり送信になる。`composer-extensions.tsx:44` の `matcher={slashMatcher}` を差し替え、0 件一致の component テストを足す。
  2. 枠を残すなら「一致するコマンドはありません」を出し、さらに Enter を通す手当てが要る。ライブラリの挙動ではこれが難しいので、1 のほうが小さい。
- **根拠**: spec FR-012 (「キーを奪わない」)、UX-1、UX-3。
- **scope 根拠**: touched files (`composer-extensions.tsx`・`slash-commands.ts`) で直せる。

### [High] 問いのカード (AskUserQuestion の答える部品・Elicitation の form) に高さの上限もスクロールも無く、親が overflow-hidden なので、送信ボタンが画面の外に出うる (H-002) (scope: feature)

- **観察**
  - `src/renderer/src/features/session/LivePane.tsx:211` と `:224` は、カードを包む `div.px-4.pt-3` に高さの制限もスクロールも付けていない。
  - `src/renderer/src/features/session/ElicitationCard.tsx:206-211` と `AskUserQuestionAnswer.tsx:199` も同様で、`max-h` も `overflow-auto` も無い。
  - 親の `src/renderer/src/features/shell/CenterPane.tsx:60` は `overflow-hidden`、`:105` と `:118` は `min-h-0 flex-1` である。
  - spec は `AskUserQuestion` を最大 4 問 (各問に選択肢と説明)、Elicitation の `content` を最大 32 項目と許している (spec FR-002・FR-008)。
  - 既存の承認カードは、入力の `pre` だけに `max-h-48 overflow-auto` を付けている (`ApprovalCard.tsx:83`)。カード全体の高さを制限する前例は、今回の追加分に無い。
  - 4 問 × 選択肢 4 つ (説明付き) の `AskUserQuestion`、または項目が多い form は、画面の高い 13 インチ級のウィンドウでも縦に収まらない。承認カードとほかの通知帯が同時に出れば、さらに足りなくなる。
  - 高さが足りないと、下端の「回答を送る」「送る」「断る」と、その下の Thread・composer が `overflow-hidden` で切れる。マウスのホイールでは動かせない。
  - Tab キーでのフォーカス移動なら、ブラウザがフォーカス先を見える位置にずらすので届く可能性がある。ただし、スクロール位置も表示範囲も目に見えない。
  - component テスト (jsdom) は高さを検証できず、テストも無い。
- **同種事象探索**: `max-h-|overflow-y-auto` (features 配下の非 test) で 8 件。そのうち問いのカード・承認カードの本体への適用は 0 件 (`ApprovalCard.tsx:83` は入力の `pre` のみ)。ほかは別の面 (`SessionListScreen.tsx:1135`、`LaunchDialogHost.tsx:47`、`Sidebar.tsx:135`、popover の `composer-extensions.tsx:48`)。
- **リスク/影響**: 答えを送れない・断れない状態になり、問いのカードが出ているあいだはセッションが承認待ちのまま残る。「アプリの中で答えられる」という本 feature の主目的が崩れる。UX-7 (情報の詰め込みと主要操作の到達性) に当たる。
- **推奨アクション**: 問いのカード 2 つ (と、同じ枠にある答える部品) を、本体を `max-h-[50dvh] overflow-y-auto` にして、ボタン行を外側の固定にする。たとえば `ElicitationCard` と `ApprovalCard` の本体を「スクロールする本体 + 固定のボタン行」の 2 段にする。スクロール領域には `tabIndex={0}` と名前を付ける。
- **根拠**: UX-7、spec US-1 AC2 / US-2 AC2 (送れること)。
- **scope 根拠**: touched files (`ElicitationCard.tsx`・`AskUserQuestionAnswer.tsx`・`ApprovalCard.tsx`・`LivePane.tsx`) で直せる。

### [Medium] AskUserQuestion の答えるカードが「ツールの許可」の言い方のままで、利用者が何を求められているか読み取りにくい (M-001) (scope: feature)

- **観察**: `answerable === 'ask-user-question'` のときも、`ApprovalCard.tsx:42` の `aria-label="ツールの実行許可"`、`:47` の「Claude が AskUserQuestion の実行を求めています」、`:71` の「この 1 回だけの許可です。」が出る。その下に、選択肢を選ぶフォームがある。内部の tool 名を見せたまま、質問に答える画面が「許可」の文言で包まれている。
- **同種事象探索**: `ツールの実行許可|実行を求めています|この 1 回だけの許可` (features/session) で `ApprovalCard.tsx:42,47,52-56,71`。答える部品用の分岐は 0 件。
- **リスク/影響**: UX-9 (一貫性)。画面の意味 (質問に答える) と枠の文言 (許可) が食い違う。「回答を送る」を押すと許可になることが、見出しからは分からない。
- **推奨アクション**: `answerable` のとき、見出しを「Claude からの質問」程度にし、「この 1 回だけの許可です。」を出さない。`aria-label` も切り替え、文言は `APPROVAL_CARD_LABELS` に置く。
- **根拠**: UX-9。
- **scope 根拠**: feature の touched file。

### [Medium] form の検証エラーが「入力を確かめてください」の 1 行で、どの項目がなぜ違うか分からない (M-002) (scope: feature)

- **観察**: `ElicitationCard.tsx:189-199` は、`buildContent` が null、`isElicitationContent` が false、`matchesElicitationSchema` が false のいずれでも同じ `setRejected(true)` に落とす。表示は `:284-288` の汎用文言 (`labels.ts:222` の `invalid`) だけで、項目の近くに出ず、`aria-invalid` も `aria-describedby` による紐付けも無い。必須の印は付いているが任意の印は無く、数・日付・最大長などの形式のヒントも無い (`min`/`max` 属性のみ)。`AskUserQuestionAnswer.tsx:226-234` の `answerInvalid` は上限の説明が付いているが、これも項目の近くには出ない。
- **同種事象探索**: `setRejected\(true\)` (features/session) で 2 件 (`ElicitationCard.tsx:194`、`AskUserQuestionAnswer.tsx:190`)。
- **リスク/影響**: UX-4 (エラーメッセージの位置と具体性)。項目が多い form で原因を探すしかない。
- **推奨アクション**: `matchesElicitationSchema` の失敗を項目ごとに返せるようにし、該当する入力の下に出す。入力を `aria-invalid` にして、エラーを `aria-describedby` に足す。
- **根拠**: UX-4。
- **scope 根拠**: feature の touched file。

### [Medium] 「断る」と「取り消す」の違いが画面から分からない (M-003) (scope: feature)

- **観察**: `ElicitationCard.tsx:290-301` に「取り消す」「断る」が並び、どちらにも説明も `title` も無い。`labels.ts:212-213`。MCP の意味では `decline` (明示的な拒否) と `cancel` (何も決めずに閉じる) で、サーバー側の扱いが変わる。URL のカードでは、この 2 つとリンクが選択肢で、リンクだけが前進の操作になる。
- **同種事象探索**: `ELICITATION_LABELS.(cancel|decline)` で 2 件 (`ElicitationCard.tsx:291-296`)。
- **リスク/影響**: UX-5/UX-9。利用者はどちらを押すべきか判断できない。
- **推奨アクション**: 各ボタンに `title` か補足文 (例: 断る = 「入力しないことをサーバーに伝えます」、取り消す = 「何も答えずに閉じます」) を付ける。文言は `ELICITATION_LABELS` に置く。
- **根拠**: UX-9、spec Clarifications (文言は [ASSUMED] で承認の対象外)。
- **scope 根拠**: feature の touched file。

### [Low] 「その他」を選んでも入力欄にフォーカスが移らず、上限の案内も入力前に無い (L-001) (scope: feature)

- **観察**: `AskUserQuestionAnswer.tsx:129-143` で、選ぶと `Input` が現れるが `autoFocus` が無い。`maxLength` も無く、1,000 コードポイントの上限は送信後にしか分からない (`labels.ts:199`)。
- **同種事象探索**: 該当 1 箇所のみ。
- **リスク/影響**: キーボード操作の手間が増える。
- **推奨アクション**: 選んだ直後に入力欄へフォーカスを移し、上限を `maxLength` かヘルパー文で出す。
- **根拠**: UX-4。
- **scope 根拠**: feature の touched file。

### [Low] SDK の側で中断された Elicitation のカードが残り、押しても何も起きない (L-002) (scope: feature)

- **観察**: spec U-10 と Edge Cases が既知の限界として承認済み (2026-10-17)。カードが残ること自体に、利用者への表示が無い。
- **同種事象探索**: 該当 1 箇所 (U-10)。
- **リスク/影響**: 承認済みの限界なので設計の差し戻しは求めない。入力済みの form を送っても無反応に見える。
- **推奨アクション**: 将来、中断の知らせを足す spec で扱う。
- **根拠**: UX-2、spec U-10。
- **scope 根拠**: 別 spec (承認済みの限界)。

### [Low] 「MCP サーバー」が 2 か所に別々に書かれている (L-003) (scope: feature)

- **観察**: `src/renderer/src/features/session/labels.ts:202` (`ELICITATION_UNKNOWN_SERVER`) と `src/renderer/src/features/chat/labels.ts:234` (`elicitationComplete` の中の直書き)。chat は session を import できないので共有しにくいが、片方だけ変えると食い違う。
- **同種事象探索**: `'MCP サーバー'` で 2 件 (上記)。
- **リスク/影響**: UX-6 / UX-9 の表記揺れの種。
- **推奨アクション**: chat 側に定数を置き、session 側がそこから取る。
- **根拠**: UX-6。
- **scope 根拠**: feature の touched file。

### [Low] 候補が見つかりにくい (L-004) (scope: feature)

- **観察**: `labels.ts:436` の placeholder「メッセージを入力」は `/` でコマンドが選べることに触れない。`moreCommands` の「ほか N 件」(`composer-extensions.tsx:95`) も、入力で絞り込めることを示さない。
- **同種事象探索**: 該当 2 箇所のみ。
- **リスク/影響**: 機能の見つけにくさ。
- **推奨アクション**: placeholder に「/ でコマンド」を足すか、ヘルパー文を出す。
- **根拠**: UX-4 (入力形式のヒント)。
- **scope 根拠**: feature の touched file。

### [High] H 観点: UX の指摘を検出するテストが無い (H-003) (scope: feature)

- **観察**: H-001 (0 件一致で Enter が握りつぶされる) と H-002 (カードの高さの上限) を検出するテストが無い。`LivePane.composer.test.tsx:136-200` は一覧があって 0 件一致のケースを持たない。`ElicitationCard.test.tsx` と `AskUserQuestionAnswer.test.tsx` に、大きな入力で送信ボタンに届くことの検証は無い。`e2e/ime.spec.ts:93-` の候補の検証は IME の変換中のみ。
- **既存の振る舞いを壊していない根拠**: code-gate の全テスト 3340 件が PASS (`.gate-verdict-code.json`)。composer のボタン名の日本語化は `LivePane.composer.test.tsx:102` で英語の名前が DOM に無いことを確認している。
- **観測点**: 候補を閉じる・握りつぶす経路に log も表示も無い。
- **同種事象探索**: 上記 2 ファイルの `it(` を一覧し、0 件一致と大きなカードの検証は 0 件。
- **リスク/影響**: H-001 / H-002 は再発しても気付けない。
- **推奨アクション**: H-001 の修正と合わせて「一覧があり 0 件一致 → 候補が出ない・Enter で送信される」の component テストを足す。H-002 は E2E (`e2e/`) か Playwright の画面で、4 問の `AskUserQuestion` が小さいウィンドウでも「回答を送る」を押せることを確かめる。
- **根拠**: reviewer-base の H 観点。
- **scope 根拠**: feature のテスト追加。

## 同種事象探索 cascade summary

Critical の指摘は 0 件のため、cascade 必須の行は無い。参考として High の探索結果を載せる。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `Unstable_TriggerPopover\b` (features 配下の非 test) | 1 | src/renderer/src/features/chat/composer-extensions.tsx:41 |
| H-002 | `max-h-\|overflow-y-auto` (features 配下の非 test。問いのカード本体への適用) | 0 (別の面に 8 件) | ApprovalCard.tsx:83 (pre のみ)、SessionListScreen.tsx:1135、LaunchDialogHost.tsx:47、Sidebar.tsx:135、composer-extensions.tsx:48 |
| M-001 | `ツールの実行許可\|実行を求めています\|この 1 回だけの許可` | 1 ファイル | ApprovalCard.tsx:42,47,52-56,71 |
| M-002 | `setRejected\(true\)` | 2 | ElicitationCard.tsx:194, AskUserQuestionAnswer.tsx:190 |
| M-003 | `ELICITATION_LABELS.(cancel\|decline)` | 2 | ElicitationCard.tsx:291,294 |
| L-003 | `'MCP サーバー'` | 2 | session/labels.ts:202, chat/labels.ts:234 |

## Verdict

- Critical: 0
- High: 3 (H-001・H-002・H-003)
- Medium: 3 (M-001・M-002・M-003)
- Low: 4 (L-001〜L-004)
