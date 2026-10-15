# platform-boundary-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-16
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Gate**: code-gate iter 5 (pr-gate の修正のあとに再実行。入口の status は reviewing)

## 初回読了 viewpoint

- FR/SC: FR-018 / SC-005 (項目 16 の `readFile`、`queryHandle` の型を絞る)、FR-002 / FR-003 / FR-005 (agents の `conversation_reset` と `retraction`)、FR-006 / FR-007 (パスと URL は本文として表示するだけで、解決しない)
- touched files に該当する charter / Confirmation: Principle I / II / III (AD-036 §4 P3) / VII、AD-004、AD-049 Decision 5 / 6
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当 (今回の伏せ字の変更もこちら)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

前回の本 reviewer の出力 (2026-10-15 22:50) のあとに変わったのは、`src/`・`tests/`・`scripts/`・`docs/`・`eslint.config.mjs`・`.dependency-cruiser.js` の中で 2 ファイルだけだった (`find -newer` で確認)。どちらも `code-gate.md.round3.implementer.json` の M-002 による変更。

- `src/domain/session/secret-redaction.ts`: JWT の正規表現をやめ、前から 1 回だけ走査する `redactJwt` (`:60-91`) に置き換えた
- `src/domain/session/secret-redaction.test.ts`: テストを追加した

この 2 ファイルはプラットフォーム境界に触れていない。

- `secret-redaction.ts` には import が 1 件も無い。`process.` / `navigator.` / `require(` / `import(` / `globalThis` / `window.` / `node:` も 0 件
- module スコープにあるのは `const` (正規表現と文字列) だけ。`let` は関数の中にしかない
- テストが import するのは `vitest`・`../provider/secret-scan`・`./secret-redaction` だけで、domain 層の外には出ていない
- `eslint.config.mjs` と `scripts/constitution/allowlists.mjs` は iter 4 から変わっていない

PB-1〜PB-7 の結果は次のとおり。

- **PB-1 (パス型)**: 該当なし。変わった 2 ファイルはパスを扱わない
- **PB-2 (ランタイムは 1 つという仮定)**: 該当なし。module スコープの可変状態は増えていない
- **PB-3 (capabilities)**: 該当なし。capabilities に触れていない
- **PB-4 (権限ゲート)**: 該当なし。`Query` のメソッドで呼ぶのは今も `interrupt` だけ (`src/agents/sdk-agent-session.ts:549`)
- **PB-5 (多段パス変換)**: 該当なし。パスの変換は無い
- **PB-6 (永続環境)**: 該当なし。変わった 2 ファイルは純関数とそのテストで、ファイルにも外部にも書かない
- **PB-7 (ルールの網羅性)**: ルールは緩んでいない。`'readFile'` は禁止の union に残っている (`sdk-agent-session.ts:166`)。`queryHandle` の型も `(Pick<Query,'interrupt'> & AsyncIterable<SDKMessage>) | null` のまま (`:373`)
- **H**: 担当範囲のテスト (`tests/docs/query-mutation-methods.test.ts`、`tests/rule-fixtures/expected.mjs`) は iter 4 から変わっていない

## Findings

新しい指摘は無い。

pr-gate R1 の M-001 (`queryHandle` の型を固定するテストが無い) と L-001 (`UNDETECTED_NOTES` の記録が古い) は、AD-050 により直さずに残っている。どちらも件数には入れていない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (PB-1/PB-2 の確認) | `^import\|process\.\|navigator\.\|require\(\|import\(\|globalThis\|window\.\|node:` を `src/domain/session/secret-redaction*.ts` で | 3 (テストの import だけ) | src/domain/session/secret-redaction.test.ts:1, :3, :4 |
| (PB-7 の確認) | `queryHandle\|'readFile'` を `src/agents/sdk-agent-session.ts` で | 5 | src/agents/sdk-agent-session.ts:166, :373, :549, :622, :623 |
| (変更範囲の確認) | 前回の出力より新しいファイルを src / tests / scripts / docs / eslint / dependency-cruiser で | 2 | src/domain/session/secret-redaction.ts, src/domain/session/secret-redaction.test.ts |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: N-1 から解決 0 / 未解決 2 (pr-gate R1 の M-001 / L-001。AD-050 により直さない) / 新規 0
