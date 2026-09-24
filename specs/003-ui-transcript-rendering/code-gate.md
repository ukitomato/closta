# Code Gate Iteration 1: transcript の基本表示 (R-3)

**Run**: 2026-09-24
**Spec**: specs/003-ui-transcript-rendering/
**Diff scope**: 45 files (base = origin/HEAD merge-base。未コミットの tracked 変更 + untracked 新規 ∩ touched-files.txt)
**Tracks**: lint-agent, test-agent, convention-reviewer, platform-boundary-reviewer
**起動しなかった reviewer**: a11y-reviewer (gates=[pr-gate]) / ux-reviewer (gates=[pr-gate]) / database-reviewer (auto_invoke_patterns 不一致)。security / architecture / po は pr-gate 専任のため code-gate では起動しない

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| High (SHOULD_FIX) | 1 | H-001 (SDK 書き込み alias バイパス対策) → invoker が FIXED |
| Medium | 3 | M-001 (safe-url strictness) / M-002 (thread.aui exhaustive-deps) / M-003 (reasonKey dead data) → いずれも invoker が FIXED |
| Low | 4 | platform L-001 (marker) FIXED / conv L-001 (vocab) PARTIAL / conv L-002 (doc) FIXED / conv L-003 (cross-feature import) DEFERRED |

**Status**: PASS

lint-agent: exit 0 (eslint / tsc node / tsc web / depcruise / check:constitution すべて exit 0、violations 0)。
test-agent: exit 0、scope=full、42 files / 850 tests passed、unhandled error 0。
→ **MUST_FIX = 0**。code-gate は PASS。以下は SHOULD_FIX / Medium / Low であり verdict を左右しないが、invoker が L-003 を除き修正した。

## Tracks

- **lint-agent**: detectors = [eslint, tsc_node, tsc_web, depcruise, constitution] (test:rules は code-gate で走らせない)。exit 0
- **test-agent**: scope=full、passed 850 / failed 0 / errors 0、exit 0
- **convention-reviewer**: viewpoint F。Critical 0 / High 0 / Medium 3 / Low 3。lint 入力 exit 0 を受領
- **platform-boundary-reviewer**: viewpoint D/F。Critical 0 / High 1 / Low 1。発火理由 allowlists.mjs

## Findings と対応 (SHOULD_FIX / Medium / Low)

各 finding の詳細と Resolution は reviewer 別 md に記録:
- `platform-boundary-reviewer.code-gate.md` — H-001 (FIXED: alias fixture + UNDETECTED_NOTES) / L-001 (FIXED: marker)
- `convention-reviewer.code-gate.md` — M-001 (FIXED: safe-url strictness override) / M-002 (FIXED: thread.aui exhaustive-deps override) / M-003 (FIXED: reasonKey 配線 option a) / L-001 (PARTIAL: 表示文言で列挙語彙回避、型拡張は architecture follow-up) / L-002 (FIXED: doc) / L-003 (DEFERRED: cross-feature import の共有化)

### invoker 修正の再検証

- lint (`--fix` 後): exit 0 / errors 0 (react-virtual の incompatible-library warning は意図明示で disable)
- typecheck node + web: exit 0
- test (影響 4 file: useTranscript / ChatScreen / virtualization / safe-url): 52 passed
- test:rules: 期待表一致 (alias fixture `sdk-forbidden-call-alias` = detectors none + UNDETECTED_NOTES 明記)

## DEFERRED / follow-up

- **conv L-003**: `features/chat` → `features/session-list/rows` の cross-feature import。選択→session 解決関数の共有化 (refactor)。動作はするため Low
- **conv L-001 (型レベル)**: transcript 専用の `FailureReason` 値追加は R-2 由来の型のため architecture-reviewer (pr-gate) と調整
- **H-001 の恒久対策**: 項目14 の binding denylist は X-1 (UNDETECTED_NOTES に nextFeature 記録済み)
