# a11y-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11
**Reviewer**: a11y-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-004 / FR-005 (MCP の tool の表示、承認カード、AskUserQuestion の表示)、FR-009 (構成のタブと注意の印)、FR-010、SC-001 / SC-003
- charter / Confirmation: ui charter (Tier A の表示、右のペインのタブ)、014 FR-017 (tablist のキー操作。継承)、AD-046 Decision 4、data-model §1 / §3 / §4
- Round 2 で読み直した UI ファイル: `RightPanel.tsx`、`ApprovalCard.tsx`、`mcp-tool-call.aui.tsx`、`InitReportTab.tsx` (該当箇所)、`RightPanel.tabs.test.tsx:220-309`、`ApprovalCard.test.tsx` (aria / axe を grep)。vendored primitive は見ていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (WCAG): Critical:0 High:0 Medium:1 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R1 と R2 の間に手が入ったのは pr-gate の MD-01 / MD-02 / MD-10 だけ。a11y に関係するのは MD-02 (a11y L-003 を含む)。`RightPanel.tsx:148-179` で、開いた tablist の `role="tab"` にも注意の印が付くようになった。付くのは `data-attention`、`aria-hidden` の警告アイコン、`aria-label="構成 (注意)"` の 3 つ。aria-label は表示中の文字「構成」で始まるので WCAG 2.5.3 (Label in Name) を満たす。roving tabindex と ← / → / Home / End のキー操作は R1 から変わっていない。テストは `RightPanel.tabs.test.tsx:278-299` にある。開いたタブの accessible name の付け外しを検査し、vitest-axe でも違反 0 を見ている。ただし axe の color-contrast は無効にしている。

MD-03 (a11y M-001) と LW-03〜LW-06 (a11y L-001 / L-002 / L-004 / L-005) は、コードが R1 のまま。今回の変更による新しい a11y の退行は見つからなかった。Critical につながる経路も無い (キーボードで届かない要素も、読めないコントラストも無い)。

## Findings

### [Medium] 承認カード (`role="alertdialog"`) に `aria-describedby` が無く、AskUserQuestion の注記が説明として読まれない (M-001) (scope: feature) [unresolved, pr-gate MD-03]

- **観察**: `src/renderer/src/features/session/ApprovalCard.tsx:35-38` は今も `role="alertdialog"` と `aria-label="ツールの実行許可"` だけ。要求文 (`:41` / `:46`)、MCP の見出し (`:53-58`)、AskUserQuestion の注記 (`:62-67`) のどれにも id が無く、ダイアログの説明に結び付いていない。`ApprovalCard.test.tsx:132-137` は vitest-axe の違反 0 を見るだけ。`aria-describedby` が無くても axe は違反にしないので、このテストでは検出できない
- **同種事象探索**: `role="alertdialog"` (src/renderer/src) で 1 件 (`ApprovalCard.tsx:36`)。`aria-describedby` 付きの alertdialog は 0 件
- **リスク/影響**: スクリーンリーダーの利用者は「回答は届かない」という注記を知らないまま「許可」を押しうる。そうなると回答が届かないまま会話が進む (US-1 AC8、WCAG 1.3.1 / 4.1.2)
- **推奨アクション**: `useId()` で要求文の `<p>` と注記の `<p>` に id を振り、alertdialog に `aria-describedby` を付ける (要求文、あれば注記の順)。テストには `expect(getByRole('alertdialog')).toHaveAccessibleDescription(...)` を足す
- **根拠**: WAI-ARIA APG Alert and Message Dialogs、WCAG 2.1 SC 1.3.1 / 4.1.2
- **scope 根拠**: touched file の中で直せる

### [Low] MCP の見出しの区切り「›」の読み上げが transcript と承認カードで違う (L-001) (scope: feature) [unresolved, pr-gate LW-03]

- **観察**: `mcp-tool-call.aui.tsx:126-137` は server と tool を別々の `<span>` に置き、`›` を `aria-hidden="true"` にしている (`:129`)。間に空白の文字ノードは無い。`ApprovalCard.tsx:54` は `${server} › ${tool}` を文字列のまま出すので、こちらは読み上げに入る
- **推奨アクション**: 区切りを読み上げる形か `sr-only` の区切り語のどちらかに揃え、両方の画面で同じにする
- **根拠**: WCAG 2.1 SC 1.3.1 / 3.2.4
- **scope 根拠**: touched file の中で直せる

### [Low] 注意の状態が変わっても支援技術に通知されない (L-002) (scope: feature) [unresolved, pr-gate LW-04]

- **観察**: `RightPanel.tsx:110-181` は MD-02 で印を出す場所が増えた。しかし `aria-live` / `role="status"` は今も無い (`InitReportTab.tsx` を grep して 0 件)。spec が求めているのは目に見える印だけなので Low とする
- **推奨アクション**: 帯の外に visually-hidden の `role="status"` を置き、印が false から true に変わったときだけ知らせる
- **根拠**: WCAG 2.1 SC 4.1.3
- **scope 根拠**: touched files の中で直せる

### [Low] 構成タブの MCP の tool のまとまりのラベルが、後に続く一覧と結び付いていない (L-004) (scope: feature) [unresolved, pr-gate LW-05]

- **観察**: `InitReportTab.tsx:220` の `mcpToolGroup(server)` は今も `<p>` のまま。後に続く `<ul>` には `aria-labelledby` が無い (同じファイルで見出しの要素は `:104` の `<h3>` だけ)
- **推奨アクション**: `<h4>` にするか、`<ul aria-labelledby>` で結び付ける
- **根拠**: WCAG 2.1 SC 1.3.1
- **scope 根拠**: touched file の中で直せる

### [Low] (H) M-001 / L-001 を検出できる a11y のテストが無い (L-005) (scope: feature) [unresolved, pr-gate LW-06。一部 resolved]

- **観察**: MD-02 の部分は `RightPanel.tabs.test.tsx:278-299` で検査されるようになった (開いたタブの `toHaveAccessibleName` の付け外しと axe)。一方で `ApprovalCard.test.tsx` には `toHaveAccessibleDescription` が無く、`mcp-tool-call.aui.test.tsx` にはトリガーの `toHaveAccessibleName` が無い。axe は color-contrast を無効にして回しているので、`text-destructive` の警告アイコンの非テキストのコントラスト (3:1) も機械では確かめていない
- **推奨アクション**: M-001 を直すときに `toHaveAccessibleDescription` を、L-001 を直すときに `toHaveAccessibleName` を足す
- **根拠**: reviewer-base H
- **scope 根拠**: touched files のテストに足せる

### Round 1 からの引き継ぎ

- a11y L-003 (pr-gate MD-02): **resolved**。`RightPanel.tsx:150-178` で直り、`RightPanel.tabs.test.tsx:278-299` で検査されている
- a11y M-001 (MD-03): unresolved
- a11y L-001 (LW-03) / L-002 (LW-04) / L-004 (LW-05): unresolved
- a11y L-005 (LW-06): unresolved (MD-02 の部分だけ解消)
- new: 0

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `role="alertdialog"` (src/renderer/src) | 1 | src/renderer/src/features/session/ApprovalCard.tsx:36 |
| L-002 | `aria-live\|role="status"` (InitReportTab.tsx) | 0 | - |
| L-004 | `mcpToolGroup\|aria-labelledby\|<h[1-6]` (InitReportTab.tsx) | 3 | src/renderer/src/features/shell/InitReportTab.tsx:103, :104, :220 |
| L-005 | `aria\|Accessible\|axe` (ApprovalCard.test.tsx) | 2 | src/renderer/src/features/session/ApprovalCard.test.tsx:3, :132-137 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 4
- Round inheritance: resolved from 1: 1 (L-003 / MD-02) / unresolved: 5 (M-001 / L-001 / L-002 / L-004 / L-005) / new: 0
