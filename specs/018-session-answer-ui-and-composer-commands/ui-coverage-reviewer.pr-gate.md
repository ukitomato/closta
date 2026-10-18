# ui-coverage-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 1 (pr-gate / scope: system)

## 初回読了 viewpoint

- FR/SC: FR-001〜004 / SC-001・002 (AskUserQuestion の回答)、FR-005〜011 / SC-003〜005 (Elicitation・elicitation_complete)、FR-012〜015 / SC-006〜008 (composer・拒否後の再試行)、FR-016 / SC-009 (対応表の書き換え。本 reviewer の主対象)、SC-010 (境界の固定)
- touched files に該当する charter / Confirmation: AD-044 Confirmation (項目 21 ok・M3 の完了の条件の件数が出る)。`docs/ui-coverage.md` が diff に入っている。ui charter の Out of scope は、他 domain の行を足していないので抵触しない。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲 (AD-044 の条文の drift は見ない。対応表の行ごとの判断だけ見た)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲 (SDK の emit と表示の対応表): Critical:0 High:1 Medium:2 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (UC-1 の裏づけは下記。対応表の行に対応する実装は diff とコードにあり、項目 21 は quickstart-results.md:18 で ok、後続: O-10 の行は 0 件。V-3 の実機の目視は未実施だが、これは po 側の扱い)

## スコープ要約

O-10 は `AskUserQuestion` の回答、MCP Elicitation (form / URL)、`elicitation_complete` の行、composer のスラッシュコマンドの候補、拒否後の「編集して再試行」を実装する。対応表は `後続: O-10` の 4 行を書き換え (AskUserQuestionInput / elicitation / SDKElicitationCompleteMessage は `実装済み`、request_user_dialog は `表示不要`)、関連する A / D / F 節の備考を直した。SDK の版は変わっていない (UC-2 は該当なし)。以下、観点ごとに確認した。

- UC-1: 該当なし (問題なし)。実装は diff にもコードにもある。`SDKElicitationCompleteMessage` は `src/agents/live-signals.ts:693-700` の `onElicitationComplete`。`SDKModelRefusalNoFallbackMessage` の再試行は `live-signals.ts:656-658` (`no-fallback-retry`) と `thread.aui.tsx:1294-1321` (`RetryRefusedButton`)。`AskUserQuestionInput` は `ApprovalCard.tsx:73-79`。composer の候補は `LivePane.tsx:161-168` と `features/chat/slash-commands.ts`。`実装済み` なのに実装が無い行は見つからなかった。
- UC-2: 該当なし: `package.json` / `pnpm-lock.yaml` が touched files に無く、冒頭の SDK 版 (0.3.270) も変わっていない。
- UC-3: 下記 M-001 / M-002。`AskUserQuestionInput` の割当 `AskUserQuestion + ApprovalCard (両方 / 回答は実行中)` は、`coverage.mjs:358-364` が括弧の中を捨てて `+` も区切りに読むので機械照合は通る。回答できるのは実行中だけで、過去ログは O-5 の読み取り専用の表示という実態と備考が合っている。
- UC-4: 該当なし: Tier の変更は無い (`SDKElicitationCompleteMessage` と `elicitation` は A のまま、`request_user_dialog` は元から B)。理由の無い引き下げの形跡は見つからなかった。
- UC-6: 該当なし: 他 domain の値を行に足していない。
- UC-7: 該当なし: 本 PR は reviewing のまま。`後続: O-10` の行は 0 件 (Grep で確認)。`M3 の完了の条件の残り` は quickstart-results.md:18 で 3 (O-11 の 3 行)。

## Findings

### [High] `elicitation_complete` の過去ログの扱いを O-11 に預けたが、O-11 の範囲に無い (H-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:79` の `SDKElicitationCompleteMessage` (Tier A) は、割当が `実装済み: SystemEventRow (実行中)`、経路が `実行中`、備考が「過去ログは O-11 の変換に従う」。しかし `docs/roadmap.md:384` の O-11 の範囲は「過去ログへの本 feature の行 (`informational`・拒否・会話の作り直し) と Hook / task の行の変換」で、`elicitation` の行を名指していない。roadmap の O-10 の行 (`docs/roadmap.md:383`) にも過去ログの扱いは書かれていない。spec.md の「過去ログ・過去のセッション」の節 (spec.md:207) も、問いのカードとコマンドの候補は稼働中だけとし、`elicitation_complete` の行の過去ログには触れていない。
- **同種事象探索**: `elicitation_complete.*過去ログ|過去ログ.*elicitation` を `specs/018-*/{spec,plan,data-model,research,quickstart-results,tasks}.md` で検索 → 1 件 (data-model.md:250)。`docs/roadmap.md` では O-11 の行に `elicitation` の語が 0 件。`後続:` の形ではなく備考の文だけなので、項目 21 は検出しない。
- **リスク/影響**: `後続: <ID>` の書式を避けた備考だけの延期で、持ち主の O-11 が自分の担当と気付けない。AD-028 §5 の「持ち主のいない延期」にあたる。Tier A の行の過去ログの経路が、誰の担当でもないまま残る。過去ログに記録が残るか (残らないなら経路は `実行中` だけで正しい) も未確認で、確認の予定も書かれていない。
- **推奨アクション**: 次のどれか 1 つを選ぶ。(a) roadmap の O-11 の「過去ログへの本 feature の行」に `elicitation_complete` (`category: elicitation`) を足す。(b) 記録に残らないことを確かめて、備考を「過去ログには残らない (確認済み)」に直す。(c) 過去ログへの変換を本 PR で実装する。備考の文言は (a)〜(c) の結論に合わせて直す。
- **根拠**: AD-044 Decision 1 (後続の割当は持ち主の範囲に入っていること)、AD-028 §5、UC-5
- **scope 根拠**: `docs/ui-coverage.md` と `docs/roadmap.md` は本 PR の touched files。

### [Medium] E 節 `elicitation` の経路が `なし` のまま (M-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:226` は割当が `実装済み: ElicitationCard (実行中)` なのに、経路の列が `なし` (凡例は `なし` を「表示していない」と定義する。ui-coverage.md:26)。書き換え先の表 (data-model.md:255) も経路を直す指示を書かなかったので、割当を書き換えたときに経路の列だけ取り残された。同じ E 節の `interrupt` / `can_use_tool` は `実行中` と書く。`coverage.mjs` は経路の語が値域内かだけを見て割当との整合は見ないので、機械照合は通る。
- **同種事象探索**: `実装済み` の行で経路が `なし` のものを `docs/ui-coverage.md` で検索。該当は `:226` の 1 件だけ (`実装済み` で経路が `なし` になる他の行は無い)。
- **リスク/影響**: 経路の列を読む人に、Elicitation のカードが出ていないと見える。
- **推奨アクション**: `:226` の経路を `実行中` に直す。
- **根拠**: ui-coverage.md 凡例「経路」
- **scope 根拠**: `docs/ui-coverage.md` は touched files。

### [Medium] F 節 `Composer slash commands` の使い道が存在しない行を指す (M-002) (scope: feature)

- **観察**: `docs/ui-coverage.md:260` の使い道が `D composer (候補)`。凡例 (ui-coverage.md:16) は使い道を「対応表の行 (`<節> <識別子>`)」と定める。ところが D 節に `composer` の行は無い。data-model.md:257 が `D composer` と指示し、書き換えがそのまま入った。F 節は機械照合の外なので項目 21 は通る。実際の表示を担うのは A 節の `SDKCommandsChangedMessage` (ui-coverage.md:73 の備考が composer の候補を書く)。
- **同種事象探索**: `D composer|\| composer \|` を `docs/ui-coverage.md` で検索 → 使い道の 1 件 (`:260`) のみで、D 節の行は 0 件。
- **リスク/影響**: Tier A の element (Composer slash commands) の対応表の行への辿りが切れる。表から実装の割当を追えない。
- **推奨アクション**: 使い道を `A SDKCommandsChangedMessage` に直す。`SDK の外: 中央の本体の composer` との併記でもよい。D 節に `composer` の行を足すのは、Tier A の行を機械照合の外で増やす決定になるので勧めない。
- **根拠**: ui-coverage.md 凡例「使い道」
- **scope 根拠**: `docs/ui-coverage.md` は touched files。

### [Low] `request_user_dialog` の備考が古く、将来の持ち主もいない (L-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:227` は、割当が `表示不要: 宣言する種類が無い (AD-053 Decision 4)` に直ったのに、備考が「O-10 で判断」のまま。spec.md:284 は「種類の payload の形を確かめた feature が AD-053 を読み替えて足す」と書くが、feature ID も roadmap の行も無い。
- **同種事象探索**: `O-10 で判断` を `docs/ui-coverage.md` で検索。該当は `:227` の 1 件。
- **リスク/影響**: Tier B で、アプリが `supportedDialogKinds` を宣言しない限り CLI は出さない。実害は無い。「判断済み」が表に残らないだけ。
- **推奨アクション**: 備考を「O-10 で判断済み (宣言しない)。宣言を足す feature は AD-053 の読み替えの ADR を起こす」に直す。
- **根拠**: AD-044 Decision 1 (表示不要は理由を書く)
- **scope 根拠**: `docs/ui-coverage.md` は touched files。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `elicitation_complete.*過去ログ` (O-10 の spec 群)、O-11 の行の `elicitation` | 1 / 0 | specs/018-*/data-model.md:250、docs/roadmap.md:384 |
| M-001 | `実装済み` かつ経路 `なし` の行 | 1 | docs/ui-coverage.md:226 |
| M-002 | `D composer` | 1 (参照のみ。D 節の行は 0) | docs/ui-coverage.md:260 |
| L-001 | `O-10 で判断` | 1 | docs/ui-coverage.md:227 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 1
