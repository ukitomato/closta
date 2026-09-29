# Code Gate Iteration 1: 日本語 composer (X-2)

**Run**: 2026-09-29
**Spec**: specs/006-ui-japanese-ime-composer/
**Diff scope**: 32 files (base: 1198a95, diff ∩ touched-files.txt)
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX (Medium) | 4 | composer-queue.ts, eslint.config.mjs, e2e/**, rule in-gate |
| CONSIDER (Low) | 3 | test 命名, import order, thread.aui strictness |

**Status**: PASS

- lint-agent: **exit 0 / 0 violations** (lint / typecheck node+web / depcruise 223 modules / check:constitution ok 15)
- test-agent: **1035 passed / 0 failed / exit 0 / scope=full**
- convention-reviewer: Critical 0 / High 0 / Medium 3 / Low 3
- platform-boundary-reviewer: Critical 0 / High 0 / Medium 1 / Low 0

**must_fix = 0** (lint error 0 / test failure 0 / reviewer Critical 0) → PASS。cascade demotions 0。

起動しなかった reviewer: a11y-reviewer (gates=pr-gate) / database-reviewer (該当ファイルなし) / ux-reviewer (gates=pr-gate)。security/architecture/po は pr-gate 専任のため code-gate では起動しない。

## MUST_FIX findings (0)

なし。

## SHOULD_FIX / CONSIDER (次段 / follow-up に持ち越し)

### conv M-001 [Medium] — dead export + R2-M-001 live 未配線 (要 pr-gate po 判定)
`composer-queue.ts` の `classifyEnqueue` / `DEFAULT_MAX_QUEUE_ITEMS` / draft ヘルパ (`setDraftText`/`clearDraftText`/`emptyDraft`/`DraftState`) が production 未参照。特に **キュー上限拒否+理由提示 (R2-M-001 / SC-003) が pure 関数としてテスト済みだが live composer 経路に未配線**。→ 機能判定は pr-gate の po-reviewer が owner。live 配線 or 純内部化/削除で解消する。

### conv M-002 [Medium] — e2e の全静的検査除外 + 「別途 lint」の未履行
`e2e/**` が lint/typecheck/depcruise 全外。`playwright.config.ts` コメント/T002 の「override で base を緩めない/別途 lint」と実態 (全面 ignore) が乖離。→ 最小 e2e flat config を置くか、config コメント/T002 を実態に合わせて訂正。

### pb M-001 [Medium] — e2e が Constitution SCAN_ROOTS 外 (AD-024 #5)
`e2e/` + `playwright.config.ts` が SCAN_ROOTS 外で Principle VI/II が届かない。将来 wsl/docker/fc-cache を足しても発火しない。→ SCAN_ROOTS に e2e 追加 + EXCLUDED_FILES 明示、または ADR に scope 外根拠を明記。roadmap M-101 系。

### conv H [Medium] — 変更 rule の in-gate 検証欠如
`eslint.config.mjs`/`.dependency-cruiser.js` の変更が意図通り発火するかは test:rules fixture のみで確認でき、code-gate では test:rules 非実行。pr-gate Round で再実行される前提。

### Low (3)
- L-001: `pending-queue-notice.test.tsx`/`draft-bridge.test.tsx` が実在しない source 名を模す (SessionScreen 同居)。
- L-002: `e2e/support/launch.ts` の import order (3rd→std が逆)。
- L-003: `thread.aui.tsx` の手書き `ComposerAction` が generated 緩和下で strictness 復元が exhaustive-deps のみ。

## 判断

**code-gate は PASS (must_fix=0)。** Medium/Low はいずれも保守性/coverage/検証スコープの改善提案で、gate を止める Critical/High は 0。最重要の **E2E stub の production-inert 性は platform-boundary が堅牢と確認**。

**pr-gate への申し送り**: conv M-001 の「R2-M-001 (キュー上限) の live 未配線」は po-reviewer が機能ギャップとして判定する。High/Critical と判定されれば pr-gate の fix loop で live 配線する。

verdict JSON: `.gate-verdict-code.json` (verdict_validate OK / critical=0)。
