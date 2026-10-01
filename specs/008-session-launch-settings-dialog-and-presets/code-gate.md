# Code Gate Iteration 3: 起動設定ダイアログとプリセット (X-4)

**Run**: 2026-09-30
**Entry status**: reviewing (iter2 PASS 後の再実行。status は動かさない)
**Spec**: specs/008-session-launch-settings-dialog-and-presets/
**Diff scope**: 104 files (`.code-gate-scope.txt`。iter3 で fixture 4 本を追加)
**Tracks**: lint-agent, test-agent (full), convention-reviewer, database-reviewer, platform-boundary-reviewer
**起動しなかった reviewer**: a11y-reviewer / ux-reviewer (`gates=['pr-gate']` に code-gate が無い)
**前 iteration**: `code-gate.md.iter2` (PASS。残り 6 件)。implementer の結果は `code-gate.md.iter3.implementer.json` (applied 6 / skipped 0 / error 0)

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 0 | — |
| CONSIDER | 7 | 下表 |

- lint: 4 検出器 (lint / typecheck / depcruise / check:constitution) がすべて exit 0 で、違反 0
- test: full 1382/1382 pass、exit 0
- cascade 降格 0、viewpoint 欠落 0
- iter2 の残り 6 件 (db M-101 / L-101 / L-102、conv L-007 / L-008、pb L-101) は、すべて resolved
- test:rules は code-gate では実行しない (docs/discovery.md)。reflective fixture (`detectors: ['none']`) を含む新 fixture の全体検証は、pr-gate で行う

**Status**: PASS

## 残りの指摘 (Low)

| ID | 要旨 | 扱い |
|---|---|---|
| pb L-201 | 項目 16 の迂回。(a) 改行を挟んだ三項演算子 (prettier が出す形) と、regex リテラル / 入れ子テンプレートによる深さの誤算。(b) readonly の判定窓の打ち切り。(c) optional の class field | pr-gate の修正と一緒に扱う。(a)(c) は regex で塞ぎ、(b) は UNDETECTED_NOTES に記録する |
| db L-201 | rename 失敗後の rm 失敗が元の error を上書きする。writeFile(temp) の失敗で tmp が残る | pr-gate の修正と一緒に扱う |
| db L-202 | read-failed から回復した直後に同名で保存すると、name-conflict の確認が出ない | pr-gate の修正と一緒に扱う (ux の判断を含む) |
| conv L-009 | `PresetStoreFs` の名前が実態 (rename だけ) と合わない。doc の「provider-store と 1:1」も合わない | pr-gate の修正と一緒に扱う |
| conv L-010 | `REACHABILITY_EXCLUDED_LABELS` が provider / session に重複している (provider 側は参照されていない) | pr-gate の修正と一緒に扱う |
| db L-001 | `.bak` が増え続ける | 繰越済み (X-6) |
| conv L-006 | sdk-agent-session.ts が 519 行ある | 繰越 |

## System scope follow-up (本 feature では直さない)

iter1 の記録のとおり、roadmap X-6 行に転記済み。
