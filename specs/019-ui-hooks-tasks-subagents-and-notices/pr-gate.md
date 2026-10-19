# PR Gate Round 1: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19
**Base**: main (merge-base 6fa08c2; HEAD 243b3e6)
**Diff stat**: +6700 -319 over 100 files
**Reviewers**: security-reviewer, architecture-reviewer, po-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (7 並列)
**Skipped reviewers**: database-reviewer — auto_invoke_patterns に一致する変更ファイルが無い (変更 100 件 / pattern 5 件)
**Round inheritance**: N/A (Round 1)
**Rule verification**: ran (Round 1, 単独実行) — `node scripts/rules/run.mjs` exit 0、期待表と一致。作業ツリーに展開物の残りなし

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 2 | 0 | 2 | 2 | 0 |
| Medium   | 18 | 0 | 18 | 18 | 0 |
| Low      | 17 | 0 | 17 | 17 | 0 |

(dedup: `docs/ui-coverage.md:181-183` の「Tier A 3 行が `後続: O-11` のまま / V-1・V-3・V-4 未記録」は ui-coverage H-001・po H-001・architecture H-001 の 3 件を 1 件に統合)

**Status**: PASS (Critical=0)
**Next**:
  - **H-002 はこの round で直す (AD-050)**: Agent(implementer, mode: fix) → /cl-code-gate
  - **H-001 は agent では直せない**: FR-012 / RK-06 により、利用者が実機で quickstart V-1 / V-3 / V-4 を記録するまで `/cl-done` に進まない
  - 上の 2 点が済んだら → /cl-done specs/019-ui-hooks-tasks-subagents-and-notices

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — 対応表 D 節の Tier A 3 行が `後続: O-11` のまま。V-1 / V-3 / V-4 も未記録 [origin: ui-coverage | po | architecture]
- **Where**: docs/ui-coverage.md:181-183, specs/019-ui-hooks-tasks-subagents-and-notices/quickstart-results.md:21-25
- **Issue**: general-hooks / late-backgrounded-task / subagent-nesting-live が `後続: O-11` のまま。FR-012 / SC-005 / RK-06 は、記録が無いなら完了の PR を出さずに利用者に返すと定めている。マージ後に O-11 を完了にすると、項目 21 (`coverage.mjs:471-477, 623-627`) が落ちる
- **Suggested fix**: 利用者が V-1 / V-3 / V-4 を実機で記録し、「届いた」行を `実装済み` にする。「届かない」行は割当を見直す (別 feature への付け替え / SDK の版を待つ)。agent では直せない
- **Status in this round**: new

### H-002 — 背景の task のタブが、起動直後からずっと「まだ届いていません」を出す [origin: po]
- **Where**: src/renderer/src/features/shell/BackgroundTasksTab.tsx:72-75, src/renderer/src/features/shell/labels.ts:263, running-session-store (初期値 null)
- **Issue**: SDK (`sdk.d.ts:3423`) は起動のとき何も emit しないので、consumer が空集合に戻すよう求めている。初期値 `null` のままだと、背景の task を使わないセッションではずっと未着の表示になる。US-2 AC4「一覧は空から始まる」に反する
- **Suggested fix**: セッションのプロセスが (再) 起動したら `backgroundTasks` を `[]` にする。`BackgroundTasksTab.test.tsx:84` と `running-session-store.test.ts:791` の期待値も直す。data-model §2.5 も合わせる
- **Status in this round**: new

## Medium / Low

直さない (AD-050)。本文は各 reviewer の raw output を参照。主なもの:
- security M-001 過去ログの subagent の補いに合計バイト数の上限がない
- po M-001 / M-002 / M-003 過去ログの切り詰めに印がない / Hook の失敗の読み上げが対象を言わない / 読み出しの失敗を観測できない
- architecture M-001〜M-008 charter・glossary・ADR (AD-054 / AD-056) の字面のずれ、承認の後に決定を足した点、U-10 の欠落が ADR に記録されていない
- ux M-001 / M-002 入れ子の 50 件の上限で末尾が見えない / 既定で畳まれていない
- a11y M-001 320px のタブ帯に 5 タブが入りきらない可能性
- platform-boundary M-001 項目 14 が SDK の re-export を見逃す
- ui-coverage M-001 / M-002 過去ログの経路を確かめる持ち主の参照先 / meter 行に BackgroundTasksTab がない

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md)
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md)
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md)
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md)
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md)
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md)
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md)
