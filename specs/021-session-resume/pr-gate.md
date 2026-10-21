# PR Gate Round 1: セッションの再開 (resume) (X-9)

**Run**: 2026-10-22
**Base**: main (7e13d60) ... HEAD (bf50995)
**Diff stat**: +8548 -209 over 86 files
**Reviewers**: security-reviewer, architecture-reviewer (default + ADR-drift), po-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (7 parallel)
**Skipped reviewers**: database-reviewer (reviewers_filter: auto_invoke_patterns に一致する変更ファイルが無い。変更 86 件 / pattern 5 件)
**Round inheritance**: Round 1 のため該当なし
**Rule verification**: 実行 (Round 1)。`node scripts/rules/run.mjs` exit 0 (期待表と一致)。単独で実行し、reviewer はその完了後に起動した

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 0 | 0 | 0 | 0 | 0 |
| Medium   | 17 | 0 | 17 | 17 | 0 |
| Low      | 19 | 0 | 19 | 19 | 0 |

(dedup: ux L-005 と po M-001 は同じ事実 (`cwd-mismatch` に登録の導線が無い) なので po M-001 に統合した。code-gate の `must_fix_findings` は空なので suppress の対象は無い。cascade による降格は 0 件 (Critical の申告が無い)。)

**Status**: PASS (Critical=0)
**Next**:
  PASS → /cl-done specs/021-session-resume

Medium / Low は AD-050 によりこの gate では直さない。マイルストーン末の棚卸しで扱う。

## Critical (Round 1)

なし。

## High (Round 1)

なし。

## Medium / Low の所在 (本文は各 raw output)

| Reviewer | Medium | Low | 主な ID |
|---|---|---|---|
| security-reviewer | 0 | 2 | L-001 (fail closed が最初のプロンプトの後に効く), L-002 (escalation-neutral を偽の SDK でしか確かめていない。V-9 未実施) |
| architecture-reviewer | 4 | 4 | M-001 (charter「会話の id を追っていない」), M-002 (`ResumeUnavailableReason` の pin が AD-059 を挙げる), M-003 (_overview / roadmap / charter の「完了」「承認済み」), M-004 (AD-059 の読み替えに AD-043 Decision 4 が無い) |
| po-reviewer | 3 | 3 | M-001 (`cwd-mismatch` に登録の導線が無い。ux L-005 を統合), M-002 (`location-*` の文言に直し方が無い), M-003 (SC-001 の実機未実施・RK-07) |
| ux-reviewer | 6 | 4 (+1 統合) | M-001〜M-005, H-001 |
| a11y-reviewer | 3 | 2 | M-001 (disabled の「再開」の理由), M-002 (読み取り失敗が読み上げられない), H-M-001 |
| platform-boundary-reviewer | 0 | 2 | L-101 (U-5 の判定が runtimeId を見ない), L-102 |
| ui-coverage-reviewer | 1 | 2 | M-001 (理由キー 18 → 19 の備考) |

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md)
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md)
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md)
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md)
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md)
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md)
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md)
