# platform-boundary-reviewer Review: 015 O-5 MCP・プラグイン・コマンドの表示

**Run**: 2026-10-11
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2 (code-gate iter 2)

## 初回読了 viewpoint

- FR/SC: FR-007 (構成を許可リストで読み、`meter` の `init-report` / `commands` で運ぶ)、FR-010 (`auth_status` / `plugin_install` の行)、FR-011 (項目 16 の P3 を広げる。正の形は持ち主に送る)、FR-013 (O-10 への分離)
- touched files に該当する charter / Confirmation: AD-036 §4 P3 (`interrupt` のみ)、AD-041 (a) (permissionMode の安全 3 値)、AD-048 Decision 2 (MCP・プラグイン・スキルの制御要求は呼ばない)、AD-047 Decision 4 (`getContextUsage` は呼ばない)、Constitution III (権限ゲート) と VII (`src/agents/`)、runtime / isolation charter (本差分は触れていない)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

差分の大半は renderer の表示 (MCP の tool の表示、AskUserQuestion の読み取り専用の表示、構成のタブ) と domain の変換。本 reviewer の担当は次の 3 つ。
- `src/agents/live-signals.ts` / `src/agents/sdk-agent-session.ts`: `init` / `commands_changed` / `auth_status` / `plugin_install` を読む処理と、`keyof Query` の型による網羅
- `scripts/constitution/check.mjs` 項目 16 の P3: 計算キーでの呼び出しも検出するようにした
- `scripts/constitution/allowlists.mjs`: `QUERY_MUTATION_METHODS` を 6 個から 21 個に広げた

PB 観点:
- PB-1: 該当なし。構成の変換は `cwd`・プラグインの `path`・`apiKeySource` を読まない。IPC を越えるのは名前・状態・版だけ。テストは `sdk-agent-session.test.ts` の LEAK-cwd / LEAK-plugin-path で固定。
- PB-2: 該当なし。合流の状態と auth / plugin の連番は `createLiveSignals` の closure にセッションごとに持つ。module スコープの `let` は追加 0 件。
- PB-3: 該当なし。
- PB-4: 該当なし。`ApprovalCard.tsx` の `onDecision` の型は不変。`queryHandle` の利用は `interrupt()` と反復だけ (`sdk-agent-session.ts:542-543`, `:615-616`)。
- PB-5: 該当なし。
- PB-6: 該当なし。
- PB-7: 指摘 1 件 (M-001)。

## Findings

### [Medium] 項目 16 の P3 が optional call の形 (`.m?.(` / `['m']?.(`) を検出せず、取りこぼしの一覧にも載っていない (M-001) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:922` の `dotCall` は `\.\s*<m>\s*\(`、`:923-925` の `computedKeyCall` は `\[\s*(['"\x60])<m>\1\s*\]\s*\(`。`queryHandle.setModel?.(x)` / `queryHandle['reloadPlugins']?.()` はどちらにも一致しない。`check.mjs:918-920` のコメントと `tests/rule-fixtures/expected.mjs:862-867` の `UNDETECTED_NOTES['sdk-query-method-indirect']` にも optional call と `.bind(` が載っていない。
- **同種事象探索**: `src/agents` (テスト除く) で `\?\.\(|\.call\(|\.apply\(|Reflect\.` は 5 件 (`read-transcript.ts:84,103,110`、`transport.ts:159,172`、いずれも port / target)。`Query` に対するものは 0 件。現時点で検出を免れた呼び出しは無い。
- **リスク/影響**: 等価な呼び出しが grep backstop を素通りし、記録された取りこぼしにも無い。実際の防御は `queryHandle` が 1 つしかないことと型の網羅なので Medium。
- **推奨アクション**: (a) 正規表現で `(?:\?\.\s*)?` を許し `b-equivalent/` に fixture を 1 つ足す、または (b) 追わない形として `check.mjs:918-920` のコメントと `expected.mjs:866` の `why` に optional call と `.bind(` を足す。
- **根拠**: Constitution III / AD-036 §4 P3 / PB-7
- **scope 根拠**: touched files (`scripts/constitution/check.mjs`、`tests/rule-fixtures/expected.mjs`) で直せる。

### H の記入根拠

- M-001 の形を検出するテストは無い (fixture は計算キー・ドット呼び出し・MCP 操作の 3 つ)。
- P3 の denylist は `tests/docs/query-mutation-methods.test.ts` で固定、`keyof Query` の網羅は tsc で落ちる、cwd / plugin path の非漏洩は BE-020 / BE-031 で固定、permissionMode の検査は不変。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `queryHandle\|\?\.\(\|\.call\(\|\.apply\(\|Reflect\.` in src/agents (テスト除く) | 9 (`Query` に対する optional call / call / apply は 0) | src/agents/read-transcript.ts:84,103,110; src/agents/transport.ts:159,172; src/agents/sdk-agent-session.ts:373,542,615,616 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 0
- Round inheritance: 前 Round の M-003 (項目 14 が最初の import しか読まない) は docs/roadmap.md に持ち主送りで記録済み。新規 1 件。
