# Code Gate Iteration 2: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30
**Spec**: specs/024-session-launch-axes/
**Entry status**: reviewing (pr-gate round 1 の High 修正 5c15180 後の再実行。status は動かさない)
**Diff scope**: 80 files (base 2bba8f84..HEAD: 98 files, +5447/-224。spec_dir の gate 出力 18 件は touched-files 外)
**Tracks**: lint-agent, test-agent (full), convention-reviewer, database-reviewer, platform-boundary-reviewer
**起動しなかった reviewer**: a11y-reviewer / ux-reviewer — gates=['pr-gate'] に code-gate が無い

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | - |
| SHOULD_FIX | 0 | - |
| CONSIDER | 8 | Medium 3 / Low 5 (下記) |

**Status**: PASS

## Tracks

- lint-agent: exit 0。eslint / tsc (node, web) / dependency-cruiser / check:constitution すべて 0。scope 内違反 0 (prettier warning 20 件は scope 外の elicitation 関連)
- test-agent: scope=full、exit 0、passed 4488 / failed 0 / errors 0
- convention-reviewer: Critical 0 / High 0 / Medium 1 / Low 3
- database-reviewer: 全 0
- platform-boundary-reviewer: Critical 0 / High 0 / Medium 2 / Low 2 (すべて持ち越し)

## MUST_FIX findings (0)

なし。

## CONSIDER (直さない — AD-050、棚卸しで扱う)

- convention M-001: `LaunchDialog.tsx` 1125 行 (+230)
- convention L-001: `LaunchExtraAxes.tsx:6` の古い doc コメント
- convention L-002: `session-ipc.ts:178` の「6 軸」
- convention L-003: `LaunchExtraAxes.tsx:12/:47` の重複 class 定数
- platform-boundary M-001: `resolveAdditionalDirectories` が変換後の重複を見ない (pr-gate M-003 持ち越し)
- platform-boundary M-002: `isLaunchDirectoryValue` の POSIX 規則の重複実装 (code-gate iter 1 M-001 持ち越し)
- platform-boundary L-001 / L-002: 拒否理由のログ区別、main/agents 述語の突き合わせテスト

raw output: `convention-reviewer.code-gate.md` / `database-reviewer.code-gate.md` / `platform-boundary-reviewer.code-gate.md`
