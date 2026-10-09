# security-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: security-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-004 (MCP の見出しと結果)、FR-003 (承認カード)、FR-005〜FR-007 (第三者が決めた文字列を常時見える場所に)、FR-008、FR-010 (O-10 の申し送り)、SC-001〜SC-003 / SC-005
- 該当 charter / Confirmation: ui charter:52-58、AD-036 Decision 4 (P2 / P3)、AD-041 (g)、AD-035 Decision 1、proposed の AD-046 / AD-047 / AD-048
- A. 認可 / 認証 / secret 管理: Critical:0 High:1 Medium:2 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:4 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

IPC・preload・main・spawn・新しい SDK の呼び出しは無い。`cwd`・`path`・MCP の `error`・`apiKeySource`・auth の `output` / `error` を運ばない方針は SDK の型と一致する。`mcp_status` を呼ばないので `McpServerStatus.config` (URL・ヘッダ) の経路も無い。`AskUserQuestion` の暫定の状態は P2 / P3 が変わらず昇格の経路は増えない。

担当外の観察 (採点外): 構成の「前回と同じか」を件数と名前の連結の長さで比べると MCP の `status` の変化と同じ長さのモデルの切り替えが送られない (data-model.md:51)。`started` は既に `transcript-dto.ts:67` にある。`mcp__*` のパターンでの振り分けと AD-035 Decision 1 の関係。

## Findings

### [High] 承認カードの見出しが、MCP の名前を分割して 64 文字で切り詰めた形に置き換わる。承認する tool の生の名前がカードから消え、`__` を含むサーバー名では別のサーバーの tool に見える (H-001) (scope: feature)

- **観察**: 今の承認カードは無害化した `toolName` を全文で出す (`ApprovalCard.tsx:30`、H-05/H-06)。FR-003 と data-model §1 は最初の `__` で切り 64 文字で切り詰める。`mcp__github__mirror__push` は `github › mirror__push` に見える
- **同種事象探索**: `\.toolName\b` (renderer) 13 件、承認の判断に使うのは `ApprovalCard.tsx:30` の 1 件
- **推奨アクション**: 承認カードでは生の `toolName` を切り詰めずに常に出す (等幅・`break-all`)。分割は補助で、構成の `mcpServers` の名前と完全一致するときだけ帰属を出す (曖昧なら「サーバーを特定できません」)。テスト
- **根拠**: AD-036 Decision 4、ApprovalCard H-05、CWE-451

### [Medium] resource の `uri` を見出しに出す可否を `mayCarrySecret` で決めている。この判定は URL の資格情報・クエリのトークンを通す。spec の「入力の値を見出しに出さない」とも矛盾する (M-001) (scope: feature)

- **同種事象探索**: `mayCarrySecret` 9 件、URL の判定に使うのは本 feature の 2 件
- **推奨アクション**: URL として読み scheme・host・最後のパスの要素だけ (userinfo・query・fragment を捨てる)。読めないものは出さない。入力の `server` に名前の形の検査。テスト
- **根拠**: spec.md:62、O-2 data-model §2、CWE-200

### [Medium] 過去ログの `toolName` は無害化されていない (M-002) (scope: feature)

- **観察**: 実行中は `sanitizeBody` (`live-message.ts:61`)、過去ログは生の `b.name` (`transcript.ts:233`)
- **同種事象探索**: `b\.name|tool_name` 4 件、無害化していないのは 1 件
- **推奨アクション**: `transcript.ts:233` を `sanitizeBody(b.name).value` に。`mcp-tool-name.ts` にも 2 層目。U+202E の fixture

### [Medium] 構成のタブで tool をサーバー名ごとにまとめる方法が決まっていない。名前の規則は `constructor` / `toString` を通し、renderer には ErrorBoundary が無い (M-003) (scope: feature)

- **同種事象探索**: ErrorBoundary 0 件
- **推奨アクション**: 集計と結合は `Map`。FE-021 に prototype のキーのテスト
- **根拠**: CWE-1321

### [Medium] AD-048 Decision 3 と spec が運ぶ文字列を「利用者の設定由来」と捉えている。実際には第三者が決めた値で、名前の規則も allowlist ではなく blocklist (M-004) (scope: feature)

- **同種事象探索**: `設定由来` 3 件
- **推奨アクション**: 文言を「第三者由来を含む」に。名前は allowlist (MCP `^[A-Za-z0-9_-]{1,128}$`、コマンド・スキル・プラグイン `^[A-Za-z0-9_.:@/-]{1,128}$`)。説明は Cc / Cf / Zl / Zp を除き平文で描く (markdown・自動リンクにしない)。テストに tag 文字・U+2028
- **根拠**: AD-047 Decision 2、`HOOK_NAME_SHAPE` の先例、CWE-451

### [Medium] 結果の「画像」「resource」の印に要る情報が、今の DTO の契約では renderer に届かない (M-005) (scope: feature)

- **観察**: `toolResultText` は `text` の無いブロックを捨てる。`TRANSCRIPT_PART_FIELDS` は固定
- **推奨アクション**: (a) 件数だけを数え本文に固定の文言 / (b) 件数のフィールドを足しスキーマのテストを直す / (c) 印を外す。印は押せない表示
- **根拠**: 003 SC-009、Principle I

### [Medium] 暫定の `AskUserQuestion` の承認カードは「許可しても回答が届かない」ことを利用者に示さない (M-006) (scope: feature)

- **推奨アクション**: `toolName === 'AskUserQuestion'` のとき固定の注記 (「許可しても回答は Claude に届きません。拒否して本文で答えてください」)。V-3 に tool_result の中身
- **根拠**: AD-036 Decision 4、Principle III

### [Medium] H: 上の指摘を検出するテストが tasks に無い (M-007) (scope: feature)

- **同種事象探索**: tool-registry のテスト 0 件
- **推奨アクション**: URI の負例、承認カードの全文と曖昧なケース、既存の 8 つの名前の振り分けの回帰、過去ログの双方向制御、prototype のキー、decoder の負例、注記の表示

### [Low] SH-002 で registry の element を採るときの、セキュリティ上の外し方の条件が無い (L-001) (scope: feature)

- **推奨アクション**: 生の HTML / iframe / `frame-src` / 遠隔の取得 / 操作のボタンを不採用の条件に

### [Low] FR-010 の O-10 の登録文に、権限ゲートの例外を作るときのセキュリティ上の制約が書かれていない (L-002) (scope: feature)

- **推奨アクション**: `updatedInput` は agents が元の入力から組み renderer からは回答だけ、`toolName` は SDK の値、Elicitation の入力は永続化しない、URL は `openExternalIfHttp` だけ、`supportedDialogKinds` は allowlist

### [Low] MCP の結果の描き方 (平文か markdown か) が決まっていない (L-003) (scope: feature)

- **推奨アクション**: 結果は `<pre>` の平文。MarkdownText に通さない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `\.toolName\b` (renderer) | 13 (承認は 1) | ApprovalCard.tsx:30、SessionScreen.tsx:606-607 |
| M-001 | `mayCarrySecret` | 9 (URL の判定 2) | data-model.md:16、tasks.md:22 |
| M-002 | `b\.name\|tool_name` (src) | 4 (無害化なし 1) | transcript.ts:233 |
| M-003 | ErrorBoundary (renderer) | 0 | — |
| M-004 | `設定由来` | 3 | spec.md:43,54、0048:29 |
| M-005 | 印の経路 | 0 | tool-result.ts:23-35 / transcript-dto.ts:30,122-131 |
| M-006 | 暫定の注記 | 0 | ApprovalCard.tsx:30,48-50 |
| M-007 | tool-registry のテスト | 0 | — |
| L-001 | MCP の element の行 | 2 | ui-coverage.md:291,292 |
| L-002 | `updatedInput` | 4 ファイル | spec.md:39,162、research.md:7、0048:19,27 |
| L-003 | 結果の描き方 | 0 | — |

## Verdict

- Critical: 0 / High: 1 / Medium: 7 / Low: 3
