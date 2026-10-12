# ux-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11T00:00:00Z
**Reviewer**: ux-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 (MCP の tool の表示)、FR-004 (承認カード)、FR-005 (AskUserQuestion の表示)、FR-008 / FR-009 (構成のタブ・帯の注意の印)、FR-010 (auth / plugin の行)、SC-001 / SC-003
- charter / Confirmation: ui charter (Principle XV、空の状態と案内)、data-model §1 / §3 / §6、AD-048 Decision 5、AD-046 Decision 4
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:2 Low:7
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Round 1 の後に変わったのは主に `RightPanel.tsx` (開いた tablist にも注意の印を出すようにした) と、そのテスト `RightPanel.tabs.test.tsx:284-297`。ほかに live-signals / roadmap / ui-coverage / allowlists も変わったが、これらは MD-01 / MD-09..11 の範囲で私の担当ではない。UX の対象ファイルのうち `ApprovalCard.tsx`、`ask-user-question.aui.tsx`、`mcp-tool-call.aui.tsx`、`chat/labels.ts`、`shell/labels.ts`、`tool-fallback.aui.tsx` は、code-gate の touched_files の sha が Round 1 の pr-gate と同じで、今の作業ツリーを読んでも Round 1 の指摘箇所は変わっていない。code-gate の must_fix_findings は 0 件なので、抑止の対象は無い。回答 UI、監視ビューの行の印、composer は承認済みの範囲外 (U-1 / Q2 / Q3) なので指摘しない。

## Round 1 の指摘の扱い

| Round 1 ID | gate ID | 状態 | 根拠 |
|---|---|---|---|
| M-001 「許可」が primary | MD-04 | unresolved | `src/renderer/src/features/session/ApprovalCard.tsx:82-87` は変わっていない。AskUserQuestion でも「拒否」は `variant="outline"` のまま |
| M-002 tablist に注意の印が無い | MD-02 | **resolved** | `src/renderer/src/features/shell/RightPanel.tsx:150-178` で、tab に `data-attention`、警告アイコン、`aria-label` の「(注意)」が付いた。テストは `RightPanel.tabs.test.tsx:284-297` |
| M-003 AskUserQuestion に ToolFallbackError が無い | MD-05 | unresolved | `ask-user-question.aui.tsx:228-283` はまだ `ToolFallbackError` を import も描画もしていない |
| M-004 AC9 のテストが `tool-fallback-error` を比べない | MD-06 | unresolved | elements 配下を `tool-fallback-error` で検索すると、テストファイルでは 0 件 (見つかるのは `tool-fallback.aui.tsx:333-340` だけ) |
| L-001 「Error:」「Cancelled reason:」の英語が混ざる | LW-07 | unresolved | `tool-fallback.aui.tsx:329` が変わっていない |
| L-002 見出しが内部の識別子のまま | LW-08 | unresolved | `ask-user-question.aui.tsx:243` は `{toolName}` のまま |
| L-003 認証の失敗の案内に場所が無い | LW-09 | unresolved | `src/renderer/src/features/chat/labels.ts:96` が変わっていない |
| L-004 句点が揃っていない | LW-10 | unresolved | `src/renderer/src/features/shell/labels.ts:217` が変わっていない |
| L-005 MCP の見出しに `title` が無い | LW-11 | unresolved | `mcp-tool-call.aui.tsx:116-138` に `title=` が無い |
| L-006 承認カードの文言を 2 か所にハードコード | LW-12 | unresolved | `ApprovalCard.tsx:42` と `:47-51` が変わっていない |

## Findings

### [Medium] AskUserQuestion の承認カードで、注記は「拒否」を勧めているのに「許可」が primary のまま (M-001) (scope: feature) [unresolved, MD-04]

- **観察**: `src/renderer/src/features/session/ApprovalCard.tsx:61-68` の注記は拒否を勧める。一方、`:82-87` のボタンは全 tool で同じ階層で、「拒否」は outline、「許可」は primary で右端にある。Round 1 から変わっていない
- **同種事象探索**: `request.toolName === 'AskUserQuestion'` で 1 件 (`ApprovalCard.tsx:61`)。tool ごとにボタンの階層を変えている箇所は 0 件
- **リスク/影響**: 注記が勧める操作と、見た目が勧める操作が逆になっている (UX-5 / UX-7)
- **推奨アクション**: AskUserQuestion のときだけ variant を入れ替える。`onDecision` の値は変えない。variant をテストで固定する
- **根拠**: UX-5 / UX-7、spec US-1 AC8
- **scope 根拠**: touched file で直せる

### [Medium] AskUserQuestion の表示が中断とエラーの理由 (ToolFallbackError) を出さない (M-003) (scope: feature) [unresolved, MD-05]

- **観察**: `src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.tsx:11-17` の import と `:228-283` の描画のどちらにも `ToolFallbackError` が無い。`mcp-tool-call.aui.tsx:177` は描画している
- **同種事象探索**: `ToolFallbackError` の利用は 2 件 (`tool-fallback.aui.tsx`、`mcp-tool-call.aui.tsx:177`)。ask-user-question では 0 件
- **リスク/影響**: `status.error` だけを持つ失敗では、利用者に見えるのが XCircle だけになり、理由が分からない (UX-2)。data-model §1「状態の印」とも食い違う
- **推奨アクション**: 問いの一覧 (`:254`) の前に `<ToolFallbackError status={status} />` を置く
- **根拠**: UX-2、data-model §1、spec US-1 AC9
- **scope 根拠**: touched file で直せる

### [Medium] AC9 の比較テストが `tool-fallback-error` を比べていない (M-004) (scope: feature) [unresolved, MD-06]

- **観察**: `ask-user-question.aui.test.tsx` と `mcp-tool-call.aui.test.tsx` を `tool-fallback-error` で検索すると 0 件
- **同種事象探索**: elements 配下の `tool-fallback-error` は `tool-fallback.aui.tsx:333-340` だけ
- **リスク/影響**: M-003 をテストで検出できない
- **推奨アクション**: incomplete のエラーと、error を持つ cancelled の case で、`[data-slot="tool-fallback-error"]` の有無と文言を ToolFallback と比べる
- **根拠**: H、spec SC-001
- **scope 根拠**: touched files のテストで直せる

### [Low] 開いた tablist の注意の印に、何の印かを示す見える手掛かり (title) が無い (L-007) (scope: feature) [new]

- **観察**: 今回足した `src/renderer/src/features/shell/RightPanel.tsx:152-178` のタブは、「(注意)」を `aria-label` (`:157`) にしか持たない。見える側は警告アイコン (`:172-178`、`aria-hidden`) だけで、`title` も無い。同じ印を出す畳んだ帯のボタン (`:121-122`) には `title={name}` があり、hover すると「構成 (注意)」が出る
- **同種事象探索**: RightPanel.tsx の `title=` は 2 件 (`:104` 開閉のボタン、`:122` 帯のタブ)。tablist の tab には 0 件
- **リスク/影響**: 同じ印なのに、開いたときと畳んだときで説明の出し方が違う (UX-9)。晴眼の利用者は、赤い三角が何を指すのか hover でも確かめられない
- **推奨アクション**: 印があるときだけ tab に `title={`${tab.label} (${SHELL_LABELS.attention})`}` を付ける。spec US-2 AC5 と data-model §3 は今も「畳んだ帯」の印しか書いていないので、開いた tablist の印を追記するよう designer に渡す (spec の追記は po / architecture の担当)
- **根拠**: UX-8 / UX-9
- **scope 根拠**: touched file で直せる

### [Low] MCP の表示に英語の「Error:」「Cancelled reason:」が混ざる (L-001) (scope: feature) [unresolved, LW-07]

- **観察**: `tool-fallback.aui.tsx:329` が変わっていない。これを `mcp-tool-call.aui.tsx:177` から再利用しており、近くの日本語の見出し (`:181`、`:211`) と言語が混ざる
- **同種事象探索**: `Cancelled reason:|"Error:"` で 1 件 (`tool-fallback.aui.tsx:329`)
- **推奨アクション**: `headerText` を props で差し替えられるようにするか、chat/labels.ts の文言を使う
- **根拠**: UX-6、Principle XV
- **scope 根拠**: touched file

### [Low] AskUserQuestion の見出しが内部の識別子のまま (L-002) (scope: feature) [unresolved, LW-08]

- **観察**: `ask-user-question.aui.tsx:243` は `{toolName}` のまま
- **同種事象探索**: `ASK_USER_QUESTION_LABELS` に見出しのキーは 0 件
- **推奨アクション**: `ASK_USER_QUESTION_LABELS.heading` を足す
- **根拠**: UX-6
- **scope 根拠**: touched file

### [Low] 認証の失敗の案内が、どこで再ログインするかを言わない (L-003) (scope: feature) [unresolved, LW-09]

- **観察**: `src/renderer/src/features/chat/labels.ts:96` は「認証に失敗しました (再ログインしてください)」だけ。`:93` の `authInProgress` は場所を示している
- **同種事象探索**: auth の文言は 3 件 (`chat/labels.ts:93-96`)
- **推奨アクション**: `mcpNeedsAuth` (`shell/labels.ts:230-231`) と同じ形で、場所を示す文言にする
- **根拠**: UX-2
- **scope 根拠**: touched file

### [Low] `initReportTimepoint` の文末に句点が無い (L-004) (scope: feature) [unresolved, LW-10]

- **観察**: `src/renderer/src/features/shell/labels.ts:217` は「ターンの開始時点の状態です」。同じ表の `:218-220` には「。」がある
- **同種事象探索**: INIT_REPORT_LABELS で句点の無い文は 1 件
- **推奨アクション**: 「。」を付け、data-model §6 も揃える
- **根拠**: UX-9
- **scope 根拠**: touched file

### [Low] 切り詰めた MCP の見出しに `title` が無い (L-005) (scope: feature) [unresolved, LW-11]

- **観察**: `mcp-tool-call.aui.tsx:116-138` は `truncate` で切り詰めるが、`title=` が無い
- **同種事象探索**: `mcp-tool-call.aui.tsx` の `title=` は 0 件
- **推奨アクション**: 見出しの span に全文の `title` を付ける
- **根拠**: UX-9
- **scope 根拠**: touched file

### [Low] 承認カードの文言を 2 か所にハードコードしている (L-006) (scope: feature) [unresolved, LW-12]

- **観察**: `ApprovalCard.tsx:42` と `:47-51` が同じ「Claude が … の実行を求めています」を持つ
- **同種事象探索**: `の実行を求めています` で 2 件
- **推奨アクション**: `APPROVAL_CARD_LABELS` に前置きと後置きを足し、両方の分岐から使う
- **根拠**: UX-6
- **scope 根拠**: touched file

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `request.toolName === 'AskUserQuestion'` | 1 | src/renderer/src/features/session/ApprovalCard.tsx:61 |
| M-003 | `ToolFallbackError` | 2 | tool-fallback.aui.tsx, mcp-tool-call.aui.tsx:177 |
| M-004 | `tool-fallback-error` (テスト) | 0 | — |
| L-007 | `title=` (RightPanel.tsx) | 2 | src/renderer/src/features/shell/RightPanel.tsx:104, :122 |
| L-001 | `Cancelled reason:\|"Error:"` | 1 | tool-fallback.aui.tsx:329 |
| L-002 | `ASK_USER_QUESTION_LABELS` に見出しのキー | 0 | — |
| L-003 | auth の文言 | 3 | chat/labels.ts:93-96 |
| L-004 | INIT_REPORT_LABELS の句点の無い文 | 1 | shell/labels.ts:217 |
| L-005 | `title=` (mcp-tool-call.aui.tsx) | 0 | — |
| L-006 | `の実行を求めています` | 2 | ApprovalCard.tsx:42, :47-51 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 7
- Round inheritance: resolved from 1: 1 (M-002 / MD-02) / unresolved: 9 (M-001, M-003, M-004, L-001..L-006) / new: 1 (L-007)
