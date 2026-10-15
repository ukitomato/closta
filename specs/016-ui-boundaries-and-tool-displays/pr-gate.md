# PR Gate Round 2: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-16
**Base**: main (merge-base 791f72d)。実装は未コミットのため、作業ツリー + untracked 新規ファイルの diff を対象にした (HEAD = 0f6fe33)
**Diff stat**: +7895 -227 over 105 files
**Reviewers**: security-reviewer, architecture-reviewer (default + ADR-drift), po-reviewer, ux-reviewer, a11y-reviewer, ui-coverage-reviewer (6 並列)
**Round inheritance**: Round 1 findings (Critical: 0, High: 3) を引継ぎ。snapshot `.gate-verdict-pr.round1.json` と `pr-gate.md.round1` から本文を復元した (inheritance: full)
**Rule verification**: 実行しない。Round 1 以降、`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/**` / `tests/rule-fixtures/**` / `scripts/rules/**` に変更が無い (blob sha が Round 1 と一致)

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 0 | 3 | 0 | 0 | 0 |
| Medium   | 2 | 1 | 1 | 2 | 0 |
| Low      | 8 | 1 | 6 | 8 | 0 |

(dedup 後。security L-003 (4 KB の記述) は architecture M-101 に統合した。Medium / Low の「This round」は reviewer が今 round に数えた件数で、持ち越しの architecture M-002 / L-003 / M-001 (H) を含む。Medium の resolved は security M-001、Low の resolved は a11y R1 L-001 の marks 側)

**Status**: PASS (Critical=0)
**Next**:
  PASS → /clear してから /cl-done specs/016-ui-boundaries-and-tool-displays

## Round 1 の Critical / High の扱い

| ID | Origin | Status in this round | 根拠 |
|---|---|---|---|
| H-001 | security | resolved from N-1 | JWT を線形走査の `redactJwt` に置換 (secret-redaction.ts:60-91)、mysql を `[^\n]{0,256}?` に上限 (:138)。200 KB の敵対入力 7 つを 500 ms 以内で固定 (secret-redaction.test.ts:123-138) |
| H-002 | architecture | resolved from N-1 | docs/glossary.md:423-424 が AD-049 Context / Decision 3 と glossary :448 に一致 |
| H-003 | po | resolved from N-1 | tool-result-marks.tsx:85-91 で running のときだけ動く印。tool-result-marks.test.tsx:79-97 の describe.each が 9 表示で running / awaiting の差を固定 |

## Critical (Round 2)

なし。

## High (Round 2)

なし。

## Medium / Low

AD-050 によりこの gate では直さない。マイルストーンの終わりの棚卸しで扱う。

- [architecture M-101 + security L-003] H-001 の mysql の上限 `{0,256}?` が正本 data-model.md:50 に反映されていない。ASSIGNMENT の行 (:49) と secret-redaction.ts:6 / data-model.md:55 の「4 KB」も古い。256 の境界を固定するテストも無い
- [architecture M-002] (持ち越し) data-model §5 F 節の用途が ui-coverage と食い違う
- [po L-001] 状態のアイコンを持つ 4 表示で running 中に spinner が 2 つ回る
- [a11y L-101] reduced-motion では running と awaiting の差が静的な半環だけで、文言は同じ「結果待ち」
- [a11y L-102] spinner の `motion-reduce:animate-none` を固定するテストが無い
- [ux L-001] 伏せ字の `•••` に「伏せた」と分かる説明が無い
- [security L-004] 伏せ字の処理時間の観測点が無い
- [architecture L-101] AD-049 が Round 2 の delta に出た件。gate で `git diff HEAD -- docs/decisions/0049-*.md` を実行し差分 0 を確認した (Round 1 の touched_files に載っていなかったため delta に出ただけ。最終変更は e4ff74c)。解消
- 持ち越しの Medium / Low (ux M-001 / M-002、po M-001〜M-003、architecture M-001、ui-coverage M-001 / M-002、platform-boundary M-001 ほか) は Round 1 の pr-gate.md.round1 を参照

## 起動しなかった reviewer

- database-reviewer: auto_invoke_patterns に一致する変更ファイルが無い (変更 105 件 / pattern 5 件)
- platform-boundary-reviewer: no-open-findings-and-untouched (Round 1 に Critical / High が無く、Round 1 以降の変更 20 件が auto_invoke_patterns に一致しない)
- lint-agent / test-agent / convention-reviewer: code-gate 専任のため起動しない

## viewpoint coverage の警告

- architecture-reviewer: `viewpoint_coverage_check` が A-H 全欠落を返した。出力が英語の見出し ("A. Authorization ...") で書かれ、検査の書式に合わないため。内容上は A-H をすべて記載している

## code-gate との重複

code-gate の must_fix_findings は 0 件のため suppress 対象なし。

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md)
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md)
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md)
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md)
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md)
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md)
- Round 1 のみ: [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md)
