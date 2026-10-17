# architecture-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-17
**Reviewer**: architecture-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: この bundle は FR-001〜FR-017 と SC-001〜SC-010 のすべてに触れる。この round で特に見直したのは次の FR / SC。
  - FR-002 / FR-008 / SC-003 / SC-010: U-8 と U-9 で書き換わった検証と照合
  - FR-010: AD-053 Decision 6 の訂正
  - FR-017: glossary と charter の追随
- 当たる charter / Confirmation:
  - session charter: In scope の「`canUseTool` の permission 往復の配管」「セッション状態の管理」、frontmatter の `related_adrs` / `related_specs`
  - `_overview.md` の Cross-domain invariants: III / IV / V / VII / IX / X / XII
  - AD-036 Decision 2 と Decision 4 P2
  - AD-041 (g)
  - AD-052 Decision 3 / 4 と Confirmation (proposed)
  - AD-053 Decision 2 / 5 / 6 と Confirmation (proposed)
  - AD-023 のレイヤの行列: `.dependency-cruiser.js` の `ui-not-to-app` / `app-not-to-ui` / `domain-not-to-io`
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲 (domain の述語の中身の妥当性も B)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:2
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲 (URL のリンクを中クリックしたときに accept が送られない点などは E / UX の範囲)
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲。module の export の最小化は ARCH-4 として D に数えた
- G. optional reviewer 範囲: 該当なし: ui-coverage / a11y / ux は各 optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (R1 の C-001 の経路は BE-021 / BE-024 / FE-021 / FE-023 の正例でテストが固定された。ADR の status の確認は SH-013 が Read で行う。この round の C / D の指摘はどれも文書の追随で、検出のためのテストは要らない)

## スコープ要約

R2 の bundle では次の 4 点が変わった。

- U-8 (URL の Elicitation): リンクを押すと開き、同時に content なしの `accept` を返す。`elicitation_complete` ではカードを外さない
- U-9 (検証の述語): 述語を domain に置き、renderer・main・agents が同じ関数を呼ぶ。戻り値は `Promise<void>` のまま
- registry: 要求の形 `{mode, openable | fields}` を持つ
- ADR の status: AD-052 / AD-053 の accepted 化を着手の条件と SH-013 に結び付けた

レイヤの向きを確かめた結果は次のとおりで、AD-023 の行列の内側に収まっている。

- 述語・`redactSecrets`・`sanitizeBody`・`toOneLineText`・`isMcpName`・`isValidToolUseId`・`isValidSessionId` は、どれも `src/domain/` にある (`secret-redaction.ts:102`、`sanitize-body.ts:53`、`session-init-report.ts:136` / `:189`、`meter.ts:253`、`validation.ts:179`)
- その上で、renderer は domain に、main は domain に依存するだけである
- FE-023 の `tests/` からの main と agents の import について:
  - `.dependency-cruiser.js` に `tests/` から出る向きの規則は無い (`not-to-test` は `tests` へ入る向きだけを禁じる)
  - 先例として `tests/meter/meter-through.test.tsx:43-44` が agents を import している
  - `src/main/app/session-ipc.ts` は electron を import しない
  - 以上から、通しのテストは組める

R1 の C-001・H-001・M-001・M-004・L-001 は解消した。M-002・M-003・L-002・L-003・L-004 は残っている。新しい指摘は 2 件で、着手の条件の機械強制の実体が無いこと (M-005) と、U-8 の境界の意味が AD-053 の Decision に載っていないこと (L-005) である。

## R1 からの引き継ぎ

| R1 ID | 状態 | 根拠 |
|---|---|---|
| C-001 (URL / 空の form の accept が落ちる) | resolved from prev | 次の箇所が mode ごとに揃った。<br>- `data-model.md:137-139`: content は省略可、あれば 0〜32 キー<br>- `data-model.md:160-165` と `data-model.md:179`: registry の shape で分ける<br>- `contracts/session-answer-boundary.md:12` / `:18-23` / `:72-81`<br>- `spec.md:148` (AC5) / `:151` (AC8)<br>- `spec.md:225` (FR-008) |
| H-001 (ADR proposed のまま completed に進める) | resolved from prev | `tasks.md:9` に着手の条件として accepted 化が入り、`tasks.md:95` (SH-013) が最初に frontmatter を Read で確かめ、proposed なら `/cl-done` に進まない。`quickstart.md:15` にも確認がある。ただし着手側の強制の主張に実体が無い点は M-005 として新しく出す |
| M-001 (AD-053 Decision 6 と data-model の食い違い) | resolved from prev | `0053-elicitation-callback-and-user-dialog.md:43` が「行の id にだけ使う。待っている要求・カードとは照合しない」になり、`data-model.md:99` と `spec.md:199` と揃った |
| M-002 (glossary の追随の漏れ) | unresolved from prev | 下の M-002 |
| M-003 (`parseAskUserQuestionArgs` を element ファイルから import する) | unresolved from prev | 下の M-003 |
| M-004 (URL の accept の通しのテスト) | resolved from prev | 次のテストが計画に入った。<br>- `tasks.md:46` (BE-021): C-5' の全行<br>- `tasks.md:52` (BE-024): content なしと `{}`<br>- `tasks.md:59` (FE-023): URL の場合を renderer → main → agents で 1 本につなぐ |
| L-001 (contracts「他の公開面は変えない」) | resolved from prev | `contracts/session-answer-boundary.md:16` は「`respondElicitation` を足し、`respondPermission` の第 5 引数を渡す。他は変えない」で、`spec.md:267` (SC-010) と矛盾しない |
| L-002 (session charter の frontmatter) | unresolved from prev | 下の L-002 |
| L-003 (「問い」の 2 つの範囲) | unresolved from prev | 下の L-003 (gate の dedup では M-010) |
| L-004 (AD-052 Decision 4 (d) の backstop の形) | unresolved from prev | 下の L-004 |

## Findings

### [Medium] SessionEvent・SessionControl・承認待ちの意味の拡張が、まだ glossary の追随 (SH-001) に入っていない (M-002) (scope: feature) [unresolved from prev]

- **観察**: `tasks.md:15` (SH-001) が挙げるのは Question from Claude Code / PermissionRequest・PermissionDecision / Approval card / Composer / System event row と、新しい 2 語だけである。次の 3 つは R1 から変わっていない。
  - SessionControl: `docs/glossary.md:846` は種類 (`send-prompt` / `respond-permission` / …) を列挙しており、`respond-elicitation` が入らない
  - SessionEvent: `glossary.md:832` 付近は種類を列挙しており、`elicitation-request` が入らない
  - 承認待ち: `glossary.md:856` の `awaiting_permission` と、`:1001` / `:1005` の行の状態 `awaiting` = 承認待ちは、U-5 / FR-011 (`spec.md:228`) で「承認か Elicitation の待ち」に意味が広がる
- **同種事象探索**: Grep `respond-permission|awaiting_permission|承認待ち` を `docs/glossary.md` に掛けて 7 件 (`:584`, `:618`, `:619`, `:846`, `:856`, `:1001`, `:1005`)。このうち意味が変わるのは `:846` / `:856` / `:1001` / `:1005`
- **リスク/影響**: Principle XIV の「新規用語は glossary に追記してから code に入れる」に反して、契約の語彙と状態の意味の変化が glossary に無いままコードに入る
- **推奨アクション**: SH-001 に次の 3 つを足す。
  - SessionEvent に `elicitation-request` (9 種)
  - SessionControl に `respond-elicitation`
  - SessionRunState / SessionRowStatus に「`awaiting_permission` / `awaiting` は承認の要求と Elicitation の待ちの両方 (O-10 U-5)」
- **根拠**: Constitution Principle XIV / spec FR-011・FR-017
- **scope 根拠**: 本 feature の SH-001 で直せる

### [Medium] 承認カードが、assistant-ui の element ファイルの非公開の関数 `parseAskUserQuestionArgs` を使う設計のまま残っている (M-003) (scope: feature) [unresolved from prev]

- **観察**: 次の 2 か所が、今も element ファイルの関数を使う形である。
  - `plan.md:55`: 「問いの表示は `ask-user-question.aui.tsx` の `parseAskUserQuestionArgs` と部品を使う」
  - `tasks.md:34` (FE-011): 「問いは `ask-user-question.aui.tsx` の `parseAskUserQuestionArgs` と表示の部品で読む」

  既存の parser は `features/chat/tool-args` に置き、element の側がそれを import している (R1 で確かめた `terminal-block.aui.tsx:8` ほか)。
- **同種事象探索**: R1 と同じ。`parseAskUserQuestionArgs` の定義は 1 件 (`src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.tsx:93`。export されていない) で、使用は 1 件 (`:220`)
- **リスク/影響**: `features/session` が element の内部に依存すると、SH-002 で registry の element に差し替えたときに承認カードの入力の解釈も壊れる。解釈の正本が element に縛られる
- **推奨アクション**: FE-011 で `parseAskUserQuestionArgs` を `features/chat/tool-args.ts` に移し、element と `AskUserQuestionAnswer` の両方がそこから import する形を plan の「層ごとの変更」(`plan.md:55`) に書く
- **根拠**: ARCH-4 (module の export の最小化)・既存の置き場の規則
- **scope 根拠**: 本 feature の touched files の中で直せる

### [Medium] 「`/cl-implement` は 2 つが accepted でなければ着手しない」と書いているが、その強制の実体が無い (M-005) (scope: feature) [new]

- **観察**: `tasks.md:9` は次の 2 つを書いている。
  - 「承認を得たら、コードに触る前に … frontmatter を `status: accepted`・`date:` を承認の日に改める」
  - 「`/cl-implement` は 2 つが accepted でなければ着手しない」

  `plan.md:208` も「tasks.md の『着手の条件』が実装の前に frontmatter を改めることを求め」としている。しかし強制の実体は見当たらない。
  - `.claude/skills/cl-implement/` に `accepted` / `proposed` を含む行は 0 件
  - `.claude/agents/implementer.md:23-30` (必読) と `:47-53` (tasks モード) にも、ADR の status を確かめる手順は無い。implementer は「tasks.md に書かれた順」(`:49`) で進めるが、accepted 化はチェックボックスのタスクではない
  - 利用者の承認の有無は、implementer には判断できない
- **同種事象探索**: Grep `accepted|proposed` を `.claude/skills/cl-implement` に掛けて 0 件。Grep `着手の条件|accepted` を `.claude/agents/implementer.md` に掛けて 1 件 (`:38`「accepted ADR の決定を変えないと進めない」。proposed の ADR に依る着手を止める規則ではない)
- **リスク/影響**: completed に進む経路は SH-013 が閉じた (R1 H-001 は解消)。しかし着手側は文書の主張だけで、proposed のまま実装に入れる。そうなると、accepted の AD-036 Decision 4 P2 と AD-041 (g) に反するコードが枝の上に積まれる。存在しない強制を「ある」と書いた記述は、読み手を誤らせる
- **推奨アクション**: `tasks.md:9` の「`/cl-implement` は … 着手しない」を、実際に止める仕組みに替える。最小案は、先行の節の最初に `SH-000` を置くことである。中身は「`docs/decisions/0052-*.md` / `0053-*.md` の frontmatter が `status: accepted` であることを Read で確かめる。proposed なら `[ ]` のまま `BLOCKED` で返す」で、`implementer.md:53` の BLOCKED の経路に乗る。accepted 化そのもの (frontmatter を書き換えること) は利用者の承認を受けた main の作業として書き分ける
- **根拠**: AD-036 Decision 4 P2 / AD-041 (g) / AGENTS.md「判断が要る項目は着手しない」
- **scope 根拠**: 本 feature の tasks.md / plan.md で直せる

### [Low] session charter の frontmatter (`related_adrs` / `related_specs`) の追随が SH-010 に無い (L-002) (scope: feature) [unresolved from prev]

- **観察**: `tasks.md:87` (SH-010 の session charter の項) が挙げるのは、本文の Related Specs / Related ADRs だけである。ui charter の項 (`tasks.md:88`) は frontmatter まで明記している。`docs/domains/session/charter.md:7-31` の frontmatter に 018・AD-052・AD-053 が入らないままになる
- **推奨アクション**: SH-010 に、session charter の frontmatter の `related_specs` に 018、`related_adrs` に 0052 / 0053 を足す項を加える
- **根拠**: ARCH-2 / FR-017
- **scope 根拠**: 本 feature の SH-010

### [Low] 「問い」の語が 2 つの範囲で使われているのに、SH-001 に区別の Counterexample が無い (L-003) (scope: feature) [unresolved from prev]

- **観察**: 語の範囲が 2 つある。
  - `glossary.md:708-710` の Question from Claude Code は、AskUserQuestion・Elicitation・`request_user_dialog` の 3 つを指す
  - 「問いのカード」(`spec.md:224` FR-007) と「問い (Elicitation)」(`spec.md:228` FR-011) は、Elicitation だけを指す

  ところが `tasks.md:15` は「問いのカード (Elicitation card) を足す」とだけ書いている。
- **推奨アクション**: SH-001 で足す「問いのカード」の Definition に「Elicitation 専用。AskUserQuestion は承認カードで答える」と書き、Counterexample を添える
- **根拠**: Principle XIV
- **scope 根拠**: 本 feature の SH-001

### [Low] AD-052 Decision 4 (d) の backstop の形と、plan / BE-012 の「agents に 0 件」が違う (L-004) (scope: feature) [unresolved from prev]

- **観察**: 2 つの形が食い違っている。
  - `docs/decisions/0052-ask-user-question-answer-projection.md:43` は「射影の関数の呼び出しの外に `updatedInput` の綴りが現れたら違反」とし、例外の形を許している
  - `plan.md:201` と `tasks.md:28` (BE-012) は「`src/agents/` の非テストのコードに `updatedInput` / `updatedPermissions` が現れたら違反」で、例外が無い

  射影の関数は domain にあるので、ADR の文言の「呼び出しの外」は実体と合わない。
- **推奨アクション**: proposed のうちに、AD-052 Decision 4 (d) を plan の形に揃える。揃える形は「`AGENT_SDK_IMPORT_DIRECTORIES` の非テストのコードに `updatedInput` / `updatedPermissions` の綴りが 0 件。射影は domain」である
- **根拠**: AD-052 / ARCH-3
- **scope 根拠**: 本 feature の ADR (proposed)

### [Low] U-8 の「リンクを押すことが `accept`」という境界の意味が、AD-053 の Decision に無い (L-005) (scope: feature) [new]

- **観察**: 境界の意味が spec にだけあり、ADR の Decision 側には無い。
  - `spec.md:94` (U-8) は、URL のリンクを押すと開くのと同時に、content なしの `accept` を MCP サーバーに返すと決めた
  - `data-model.md:162` は、agents が URL の `accept` の content を捨てると決めた
  - `0053-elicitation-callback-and-user-dialog.md:42` (Decision 5) は「renderer はリンクとして出して、開くのは今の … 経路に任せる」までで、利用者の操作と `accept` の対応を書いていない
  - Decision 2 (`:39`) も、URL の要求で content を捨てることには触れない

  Decision 6 (`:43`) は U-8 を参照しているが、`elicitation_complete` の扱いに限られる。
- **リスク/影響**: MCP サーバーが受け取る応答の意味 (URL へ進むことに同意した) は session の境界の決定で、accepted の後は immutable になる。spec にだけある決定は、後続の feature が ADR を根拠に読むと見落とされる
- **推奨アクション**: proposed のうちに、AD-053 Decision 5 に 1 文を足す。中身は「URL の要求への `accept` は利用者がリンクを押したこと (開くことへの同意) を表し、content を持たない。agents は付いた content を捨て、開けない URL への `accept` は `decline` に替える (spec 018 U-8)」である
- **根拠**: ARCH-3 / AD-053 Decision 2・5
- **scope 根拠**: 本 feature の ADR (proposed)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-002 | `respond-permission\|awaiting_permission\|承認待ち` (docs/glossary.md) | 7 | glossary.md:584, :618, :619, :846, :856, :1001, :1005 |
| M-003 | `parseAskUserQuestionArgs` (src、テスト以外。R1 の結果を引き継ぐ) | 2 | src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.tsx:93, :220 |
| M-005 | `accepted\|proposed` (.claude/skills/cl-implement) / `着手の条件\|accepted` (.claude/agents/implementer.md) | 0 / 1 | implementer.md:38 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 4
- Round inheritance: resolved from 1: 5 (C-001, H-001, M-001, M-004, L-001) / unresolved: 5 (M-002, M-003, L-002, L-003, L-004) / new: 2 (M-005, L-005)
