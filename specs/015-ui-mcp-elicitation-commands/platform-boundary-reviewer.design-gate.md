# platform-boundary-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-003 (PB-4)、FR-005〜FR-007 (PB-1 / PB-2 / AD-043)、FR-008 (PB-6)、FR-010 / FR-011 (PB-4 / PB-7)、SC-002 (PB-1)、SC-005 (PB-7)
- 該当 charter / Confirmation: isolation charter (Principle III のゲート)、runtime charter、AD-036 Decision 4 の P1〜P3 と検証 (c)、check.mjs 項目 14 / 16、AD-041 (g)、AD-043 Decision 2 と項目 18、AD-003、AD-004、AD-048 Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation charter の Out of scope を侵していない
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:1 Medium:2 Low:0
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:0 Low:0

## スコープ要約

PB-1: `cwd` / `path` を通さず、MCP の設定 (URL) は `init` に無い。main は http(s) しか外部で開かない (`window.ts:31-38`)。AD-043 の経路をそのまま使い IPC・preload・main の差分 0。PB-2: 状態は `run()` の closure と `meters[id]`。主な問題は「MCP を操作しない」を守る機械検査が無いことと、比較の仕方が状態の変化を落とすこと。

## Findings

### [High] AD-048 Decision 2 の「MCP・プラグインの制御を呼ばない」を守る機械検査が無い。項目 16 の P3 は 6 件の denylist で、MCP / plugin を操作する `Query` のメソッドを 1 つも含まない (H-001) (scope: feature)

- **観察**: 項目 14 は `.method()` を見ない (`allowlists.mjs:387`)。P3 (`check.mjs:917-924`) の `QUERY_MUTATION_METHODS` (`allowlists.mjs:419-427`) は 6 件。`mcpServerStatus` (:2775)・`reloadPlugins` (:2838)・`reloadSkills` (:2846)・`reconnectMcpServer` (:2898)・`toggleMcpServer` (:2906)・`setMcpServers` (:2935)・`rewindFiles` (:2871) は無い。AD-036 §4 (c) は `interrupt` 以外の Query メソッドの静的検査を求める
- **同種事象探索**: 上の名前 (scripts / rule-fixtures / src / eslint) 0 件。`項目 16|QUERY_MUTATION|P3` (specs/015, AD-048) 0 件。P3 の fixture は `setPermissionMode` の 1 件
- **推奨アクション**: AD-048 / SC-005 / V-1 で項目 16 の P3 を守りとして名指す。P3 を allowlist の形 (`query(` の戻り値の `interrupt` 以外の `.<名前>(` を違反) に直すか、最小案として denylist に上の 7 件と `stopTask` / `seedReadState` / `streamInput` / `reinitialize` を足す。違反 fixture
- **根拠**: AD-036 Decision 4 の P3 と (c)、AD-048 Decision 2、Principle III・VI、`allowlists.mjs:372`

### [High] 「前回と同じなら送らない」の比較が「件数と名前の連結の長さ」だけで、MCP の状態の変化が送られない (H-002) (scope: feature)

- **観察**: data-model.md:51。O-4 の 1 秒 20 件の上限 (`014 data-model.md:81`) で捨てた回に基準を更新すると二度と送られない
- **同種事象探索**: `前回` 3 件 (spec.md:151、data-model.md:51、plan.md:18)
- **推奨アクション**: 変換後の値の全体で比べ、送ったときだけ基準を更新。上限から外すか「最新の値を次の境で」。テスト 3 つ

### [Medium] 承認カードの見出しを `__` で分けると、正規化後のサーバー名に `__` を含むときに別のサーバーとして見える。64 文字で切ると tool の識別も欠ける (M-001) (scope: feature)

- **観察**: SDK は「non-[a-zA-Z0-9_-] becomes _」と正規化する (`sdk.d.ts:4322`) のでサーバー名に `__` は正規
- **推奨アクション**: 承認カードに全体の名前を切り詰めずに必ず出す。`meters[id].config.mcpServers` の最長一致でサーバー名を決め、一致しない・複数一致は分けない。テスト

### [Medium] `init.permissionMode` (毎ターン必ず届く) を捨て、昇格を観測できるのを任意フィールドの `status.permissionMode` だけにしている (M-002) (scope: feature)

- **推奨アクション**: `init.permissionMode` を O-4 の比較関数に渡す。テスト
- **根拠**: Principle III / AD-047 Decision 5 / AD-041 (a)

### [Medium] Agent SDK の呼び出しを見る項目 14 は、最初の `import {…}` しか読まない (M-003) (scope: system)

- **観察**: `check.mjs:687-689` は `g` の無い `exec`。2 つ目の import・再 export・動的 `import()` を見ない
- **同種事象探索**: 項目 14 の fixture 2 件
- **推奨アクション**: (system) `matchAll`、再 export と動的 import の禁止、fixture。本 feature は BE-020 で SDK の import 文を 1 つに保つ

### [Medium] domain が SDK のメッセージを `unknown` から構造で読むため、フィールド名の変化が tsc に掛からない (M-004) (scope: feature)

- **観察**: `auth_status` は最上位の型 (`sdk.d.ts:3413-3414`) で今は `default` に落ちる
- **推奨アクション**: 読むフィールドだけの入力型を domain に手書きし、`sdk-agent-session.ts` で一方向の代入可能性で固定。`auth_status` は `type === 'auth_status'`。O-4 に申し送り

### [Low] `needs-auth` の案内がランタイムを WSL に決め打ちしている (L-001) (scope: feature)

- **推奨アクション**: 「このセッションを起動した環境で claude を開き /mcp」

### [Low] `config` / `commands` の `meter` 全体の上限が書かれておらず、最悪で `BODY_MAX_BYTES` を超える (L-002) (scope: feature)

- **推奨アクション**: `meter` 1 件の直列化後のバイト数の上限。`slashCommands` も 256 件まで

### [Low] O-10 の範囲の文 (FR-010) に、`updatedInput` の射影をどこで何から組むかの制約が無い (L-003) (scope: feature)

- **推奨アクション**: agents の `canUseTool` で元の `input` に `answers` だけ、キーは `questions` と照合、関数は `toPermissionResult` の隣で pin テスト

### 固有観点の記録

PB-1 / PB-3 / PB-5 / PB-6 該当なし (PB-6 の機械検査の穴は H-001)。PB-2 は FE-022 で確かめる。PB-4 は M-001 / M-002 / L-003。PB-7 は H-001 / M-003 / M-004。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | MCP / plugin の Query メソッド名 | 0 | — |
| H-001 | `QUERY_MUTATION_METHODS` の中身 | 6 | allowlists.mjs:420-427 |
| H-002 | `前回` (specs/015) | 3 | spec.md:151 / data-model.md:51 / plan.md:18 |
| M-001 | `ApprovalCard\|承認カード` (specs/015) | 4 | spec.md:129,141 / plan.md:19 / tasks.md:22 |
| M-002 | `init` (specs/014) | 0 | — |
| M-003 | 項目 14 の fixture | 2 | expected.mjs:239-242,368-377 |
| M-004 | `Equal<` | 4 | sdk-agent-session.ts:80-81 / data-model.md:50 / plan.md:18,91 |
| L-001 | `WSL` (renderer labels.ts) | 16 | session/labels.ts ほか |
| L-002 | `BODY_MAX_BYTES` (specs/015) | 0 | — |
| L-003 | `updatedInput` | 4 | spec.md:39,162 / research.md:7 / AD-048:19 |

## Verdict

- Critical: 0 / High: 2 / Medium: 4 / Low: 3
