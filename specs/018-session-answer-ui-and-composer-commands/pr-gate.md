# PR Gate Round 1: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18
**Base**: main
**Head**: 9fb6c5441d0f430f42435f14c8ae118ea278df74
**Diff stat**: +8209 -216 over 93 files
**Reviewers**: security-reviewer, architecture-reviewer (default + ADR-drift), po-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (7 並列)
**Skipped reviewers**: database-reviewer — auto_invoke_patterns に一致する変更ファイルが無い (reviewers_filter)
**Round inheritance**: Round 1 のため引継ぎなし
**Rule verification**: 実行 (Round 1)。`node scripts/rules/run.mjs` exit 0、期待表と一致 70 件 (機械検証で捕まらない経路 9 件は既知の追跡対象)

## Verdict

dedup 後の件数 (reviewer の生の件数の合計: High 10 / Medium 17 / Low 15)。

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 8 | 0 | 8 | 8 | 0 |
| Medium   | 14 | 0 | 14 | 14 | 0 |
| Low      | 15 | 0 | 15 | 15 | 0 |

**Status**: PASS (Critical=0)
**Next**:
  PASS → /cl-done specs/018-session-answer-ui-and-composer-commands

注: High が 8 件ある。AGENTS.md の gate の原則 (AD-050) は「High はその round で直す」と定めるため、/cl-done の前に implementer (fix モード) で直すかを main が判断する。Medium / Low は直さず本ファイルに残す。

code-gate の `must_fix_findings` は空のため、`suppressed_by_code_gate` は 0 件。platform-boundary-reviewer の M-001 / M-002 / L-001 は code-gate の M-001 / M-003 / L-002 (非 must_fix) の持ち越しで、本 round の Medium / Low に数えている。

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — 一致するコマンドが無いと、空の候補の枠が開いたまま Enter / Tab が奪われ、`/xxx` を送れない [origin: ux H-001 + po H-001 (+ ux H-003 / po M-004 のテスト部分)]
- **Where**: src/renderer/src/features/chat/slash-commands.ts:79-89, src/renderer/src/features/chat/composer-extensions.tsx:41-80, src/renderer/src/features/session/LivePane.composer.test.tsx:136-200
- **Issue**: `slashMatcher` が一覧との照合なしに trigger を返し、ライブラリは件数を見ずに open にして Enter を奪う。O-10 より前は送れていた入力が送れなくなる (regression)
- **Suggested fix**: matcher を commands の closure にし、一致が 0 件なら null を返す。一覧があって 0 件一致のとき Enter で送れることの component テストを足す
- **Status in this round**: new

### H-002 — 問いのカードに高さの上限もスクロールも無く、親が overflow-hidden なので送信ボタンが画面の外に出うる [origin: ux H-002 (+ ux H-003 のテスト部分)]
- **Where**: src/renderer/src/features/session/LivePane.tsx:211,224, ElicitationCard.tsx:206-211, AskUserQuestionAnswer.tsx:199, src/renderer/src/features/shell/CenterPane.tsx:60
- **Suggested fix**: 本体を `max-h-[50dvh] overflow-y-auto` にし、ボタン行を固定する
- **Status in this round**: new

### H-003 — SC-006 の E2E が中身の無い検査になっている (stub がコマンドの一覧を出さない) [origin: po H-002]
- **Where**: e2e/ime.spec.ts:93-105, src/main/app/e2e-capability.ts
- **Suggested fix**: stub に `commands` の meter を流す fixture を足し、変換していない `/` で popover が出る正の対照を入れる
- **Status in this round**: new

### H-004 — AD-053 Decision 3 (中断で renderer の保持も捨てる) と、実装・spec U-10 (SDK 側の中断ではカードが残る) が食い違う [origin: architecture H-001]
- **Where**: docs/decisions/0053-elicitation-callback-and-user-dialog.md:40, src/agents/session-core.ts (createOnElicitation), src/renderer/src/... running-session-store.ts
- **Suggested fix**: (a) U-10 を記録する後続 ADR を起こす (AD-031 により in-place 修正は不可。最小案)。または (b) renderer も捨てる
- **Status in this round**: new

### H-005 — FR-017 / SH-010 が名指した charter の追随が抜けている (session charter の Related ADRs / frontmatter に AD-052 / AD-053 / 018 が無い、ui charter の related_specs に 018 が無い) [origin: architecture H-002]
- **Where**: docs/domains/session/charter.md:7-31,227-240, docs/domains/ui/charter.md:22-32
- **Status in this round**: new

### H-006 — `elicitation_complete` の過去ログの扱いを備考で O-11 に預けたが、O-11 の範囲に無い (持ち主のいない延期) [origin: ui-coverage H-001]
- **Where**: docs/ui-coverage.md:79, docs/roadmap.md:384
- **Suggested fix**: roadmap の O-11 に足す / 記録に残らないことを確認して備考を直す / 本 PR で実装する、のどれか
- **Status in this round**: new

### H-007 — 未回答の問いの特定が色だけで、支援技術にも伝わらない (WCAG 1.4.1) [origin: a11y H-001]
- **Where**: src/renderer/src/features/session/AskUserQuestionAnswer.tsx:90-98,217-225
- **Status in this round**: new

### H-008 — Elicitation の form の入力エラーが、どの項目かを特定せず項目にも結ばれない (WCAG 3.3.1) [origin: a11y H-002 + ux M-002 + po M-001]
- **Where**: src/renderer/src/features/session/ElicitationCard.tsx:82-170,189-199,284-288, src/renderer/src/features/session/labels.ts:222
- **Suggested fix**: 項目ごとに理由を返し、`aria-invalid` と `aria-describedby` で結ぶ
- **Status in this round**: new

## Medium / Low

直さない (AD-050)。本文は各 reviewer の raw output を参照。

- Medium (14): architecture M-001 / M-002、po M-002 / M-003、ux M-001 / M-003、a11y M-001 / M-002 / M-003 / M-004、platform-boundary M-001 / M-002、ui-coverage M-001 / M-002
- Low (15): security L-001 / L-002、architecture L-001 / L-002 / L-003、po L-001、ux L-001 / L-002 / L-003 / L-004、a11y L-001 / L-002 / L-003、platform-boundary L-001、ui-coverage L-001

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md)
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md)
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md)
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md)
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md)
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md)
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md)
