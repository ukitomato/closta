# PR Gate Round 1: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Base**: main (merge-base 2dcc694)
**Diff stat**: +7613 -202 over 88 files (HEAD a05dfc8)
**Reviewers**: security-reviewer, architecture-reviewer, po-reviewer, platform-boundary-reviewer (`eslint.config.mjs` に一致), ui-coverage-reviewer (`docs/ui-coverage.md` に一致)
**起動しなかった reviewer**: database-reviewer / ux-reviewer / a11y-reviewer (auto_invoke_patterns に一致する変更ファイルが無い。ux / a11y は pattern が旧パス `features/session-list/**` だけ — architecture H-001)
**Rule verification**: `node scripts/rules/run.mjs` を reviewer の起動前に単独で実行、exit 0 (期待表と一致)
**Round inheritance**: なし (Round 1)

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | — | 0 | 0 | 0 |
| High | 5 | — | 5 | 5 | 0 |
| Medium | 11 | — | 11 | 11 | 0 |
| Low | 13 | — | 13 | 13 | 0 |

**Status**: PASS (Critical=0)
**Next**: /cl-done は可能。ただし High 5 件はいずれも本 PR の変更ファイルの中で直せるため、Round 2 で直してから done に進むことを推奨する

## High (Round 1)

| ID | 出所 | 内容 | 推奨 |
|---|---|---|---|
| H-1 | architecture H-001 | ux / a11y reviewer が chat / session 画面の PR で起動しない (Constitution VIII / XII / XIII の Manual の検証が働いていない) | reviewers.yml に `features/chat/**/*.tsx` と `features/session/**/*.tsx` を足し、Round 2 で ux / a11y を走らせる |
| H-2 | po H-001 | tool の結果のエラー・切り詰めが Bash 以外 (CodeDiff / ToolFallback / Subagent 最上位) に出ず、失敗・拒否された Edit が適用済みの diff に見える。対応表は Tier A 実装済みと書いている | 表示を直す、または対応表と spec を実態に合わせて `後続: O-6` に分ける |
| H-3 | ui-coverage H-001 | `result` の失敗の理由 (max turns / budget 等) が全部「Provider の認証/接続」と出るのに、どの後続の範囲にも無い | O-4 の範囲に足し、行の備考を事実に直す |
| H-4 | ui-coverage H-002 | `conversation_reset` / `informational` (セッションの境界・中断) が理由なしの Tier B | Tier A (M3 残り 17 → 19) か理由を書く |
| H-5 | ui-coverage H-003 | Task* の 4 tool が理由なしの Tier B ToolFallback (TodoWrite は Tier A) | Tier A + `後続: O-6` か理由を書く |

## Medium / Low

各 reviewer の raw output を参照 (Medium: architecture 5 / po 2 / ui-coverage 4、Low: security 4 / po 3 / ui-coverage 3 / architecture 3)。主なもの: Constitution XII の Statement の字面 (arch M-001)、末尾の版表示 1.2.9 (arch M-002)、X-6 / I-3 への `後続` が cross-domain の不変条件 (arch M-003)、密度の切り替えの見える文言 (po M-001)、V-4 の持ち主 (po M-002)、`hook_name` の秘密判定 (security L-001)。

## Track raw outputs

- [security-reviewer.pr-gate.round1.md](security-reviewer.pr-gate.round1.md) — C0 H0 M0 L4
- [architecture-reviewer.pr-gate.round1.md](architecture-reviewer.pr-gate.round1.md) — C0 H1 M5 L3
- [po-reviewer.pr-gate.round1.md](po-reviewer.pr-gate.round1.md) — C0 H1 M2 L3
- [platform-boundary-reviewer.pr-gate.round1.md](platform-boundary-reviewer.pr-gate.round1.md) — C0 H0 M0 L0
- [ui-coverage-reviewer.pr-gate.round1.md](ui-coverage-reviewer.pr-gate.round1.md) — C0 H3 M4 L3
