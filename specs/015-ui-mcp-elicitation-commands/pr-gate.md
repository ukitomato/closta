# PR Gate Round 2: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11T00:58:46+09:00
**Base**: main (merge-base faafe91)。origin/HEAD の symref は stale (001-runtime-folder-registration-runtime-detection) なので使っていない
**Diff stat**: +7505 -172 over 79 files (追跡済み 62 files +4907 -175、未追跡の新規 17 files)。実装はまだコミットされていないので、diff は merge-base から作業ツリーまでの差分に未追跡のファイルを足して取った
**Reviewers**: security-reviewer, architecture-reviewer (default + ADR-drift), po-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (7 並列)
**Skipped**: database-reviewer。理由は auto_invoke_patterns に一致する変更ファイルが無いこと (変更 79 件 / pattern 5 件)
**Round inheritance**: Round 1 の findings (Critical: 0、High: 0、Medium: 11、Low: 20) を pr-gate.md.round1 と .gate-verdict-pr.json から復元して引き継いだ (inheritance: full)
**Rule verification**: Round 1 の後に規則定義が変わったので再実行した (`scripts/constitution/allowlists.mjs` と `tests/rule-fixtures/expected.mjs` の blob が Round 1 と違い、`tests/rule-fixtures/b-equivalent/*` も変わっている)。`node scripts/rules/run.mjs` を他の検出器と並行させず、単独で 1 回走らせた。exit 0、期待表との一致 66 件、宣言済みの未検出経路 9 件。展開したサンプルは後始末されている

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 0 | 0 | 0 | 0 | 0 |
| Medium   | 8 (dedup 前 8) | 3 (MD-01, MD-02, MD-10) | 0 | 8 | 0 |
| Low      | 23 (dedup 前 24) | 0 (部分的な解消: LW-06, LW-17) | 3 | 23 | 0 |

**Status**: PASS (Critical=0)
**Next**:
  PASS → /cl-done specs/015-ui-mcp-elicitation-commands

Medium / Low は PASS を妨げない。Medium 8 件はすべて Round 1 から持ち越したもので、新規は 0 件。MD-03 / MD-04 / MD-05 / MD-06 は touched file の中で数行直せば済む UI の修正。MD-07 / MD-08 / MD-11 は spec か roadmap への追記で済む。`/cl-done` の前に直すか、PR の説明に持ち越しとして書くことを勧める。

## Critical (Round 2)

なし。

## High (Round 2)

なし。

## Resolved from Round 1

| ID | 解消の根拠 | 確認した reviewer |
|---|---|---|
| MD-01 | `live-signals.ts:456-460` / `:489-505` で、開いた行が無いまま届いた結果からも行を作るようになった。data-model §4・§5、対応表 `:61` / `:63`、spec AC3 / AC6 も更新された。テストは `live-signals.test.ts:1649-1660` と `LivePane.o2.test.tsx:827-854`。新しい経路も `error` の文字列を運ばない (security が確認) | ui-coverage, po, security |
| MD-02 | `RightPanel.tsx:150-178` で、開いた tablist のタブにも注意の印 (`data-attention`、アイコン、`aria-label="構成 (注意)"`) が付くようになった。テストは `RightPanel.tabs.test.tsx:278-299`。文書の追随漏れは NL-01 として別に挙げた | po, ux, a11y |
| MD-10 | `getContextUsage` / `usage_EXPERIMENTAL…` を denylist に移した (21 個)。`close` を外した理由と「この分類は呼び出しを禁じない」は `expected.mjs:872-874` と roadmap に書かれた。pin テストは 21 個 | architecture, platform-boundary |

## Medium (Round 2, dedup 後。すべて Round 1 から unresolved)

| ID | 題 | origin | Where |
|---|---|---|---|
| MD-03 | 承認カードの `role="alertdialog"` に `aria-describedby` が無い | a11y M-001 | src/renderer/src/features/session/ApprovalCard.tsx:35-38 |
| MD-04 | AskUserQuestion の承認カードで、注記は「拒否」を勧めているのに「許可」が primary になっている | ux M-001 | src/renderer/src/features/session/ApprovalCard.tsx:82-87 |
| MD-05 | AskUserQuestion の表示が `ToolFallbackError` を描かない | ux M-003 | src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.tsx:228-283 |
| MD-06 | AC9 の比較テストが `tool-fallback-error` を比べていない | ux M-004 | ask-user-question.aui.test.tsx / mcp-tool-call.aui.test.tsx |
| MD-07 | 承認カードが出ない経路では、「回答を送れない」の注記が利用者に届かない | po M-001 | ask-user-question.aui.tsx; ApprovalCard.tsx:61-68; spec.md:177 |
| MD-08 | `needs-auth` / `failed` の案内に、直らなかったときの出口が無い | po M-002 | src/renderer/src/features/shell/labels.ts:230-232 |
| MD-09 | 項目 16 P3 が検出しない呼び出しの形 (`?.()` / `!()` / `<T>()` / `(q.m)()` / `.bind(q)()`) が記録されていない | platform-boundary M-001 | scripts/constitution/check.mjs:918-925; tests/rule-fixtures/expected.mjs:863-867; docs/roadmap.md:300 |
| MD-11 | 「項目 16 / 14 の持ち主」が feature ID になっていない (案: I-3 / X-6) | architecture M-002 | tests/rule-fixtures/expected.mjs:877; docs/roadmap.md:301, :303 |

## Low (Round 2, dedup 後)

### New in Round 2

| ID | 題 | origin | Where |
|---|---|---|---|
| NL-01 | MD-02 で開いた tablist にも印を出すようにしたが、spec AC5 / FR-009、data-model §3、対応表 `init` の備考はまだ「畳んだ帯」のことしか書いていない | po L-101 + ui-coverage L-004 | spec.md:141, :205; data-model.md:123-126; docs/ui-coverage.md:49 |
| NL-02 | 開いた tablist の注意の印に `title` が無い。畳んだ帯の方には `title` がある | ux L-007 | src/renderer/src/features/shell/RightPanel.tsx:152-178 |
| NL-03 | MD-10 の修正 (19 → 21 / 9 → 7) が spec / plan / research / quickstart / tasks に反映されていない | architecture L-003 | spec.md:214; plan.md:12, :160; research.md:61, :63; quickstart.md:7, :9; tasks.md:89 |

### Unresolved from Round 1

LW-01〜LW-20 はすべて残っている (Round 1 の pr-gate.md.round1 の表のとおり)。部分的に直ったものは次の 2 件。
- LW-06: MD-02 の部分は `RightPanel.tabs.test.tsx` で検査されるようになった。MD-03 / LW-03 の部分はまだ検査されていない
- LW-17: MD-01 と MD-02 のテストは足された。MD-07 のテストはまだ無く、E2E と V-3 も本機で確かめていない

## Dedup / suppress

- code-gate の `must_fix_findings` は 0 件だったので、`suppressed_by_code_gate` も 0 件
- reviewer をまたぐ重複は、path:line と FR をキーに完全自動で統合した。Low は 24 件から 23 件になった
  - NL-01 = po L-101 + ui-coverage L-004。どちらも data-model §3 と AC5 / FR-009 が tablist の印を書いていないという指摘
- 統合した組には、元の指摘のうち最も高い severity を付けた

## Convergence

- Round 2: resolved_from_prev 3 / new_in_round 3 / unresolved 28 (Medium 8 + Low 20)
- 収束の判定は Round 4 以降で行うので、今回は対象外

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md) (Critical 0 / High 0 / Medium 0 / Low 4)
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md) (0 / 0 / 1 / 3)
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md) (0 / 0 / 2 / 3)
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md) (0 / 0 / 3 / 7)
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md) (0 / 0 / 1 / 4)
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md) (0 / 0 / 1 / 0)
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md) (0 / 0 / 0 / 3)

7 つの track のどれでも viewpoint A-H の欠落は無かった (`viewpoint_coverage_check`)。cascade による降格も 0 件だった (`cascade_enforce`)。
