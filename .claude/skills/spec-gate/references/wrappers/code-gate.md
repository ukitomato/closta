---
name: {{prefix}}-code-gate
description: Implementation Phase 末尾の self-review gate。touched files への lint/test/convention 検証に専念 (security/architecture/po は pr-gate 専任、resolves C-4-a)。MUST_FIX があれば `implementer` subagent で auto-fix loop (max 3 iter、3 連続単調非減少で cascade exhaustion halt)。PASS で implementing → reviewing 昇格。verdict JSON emit (resolves C-4-c)。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# {{prefix}}-code-gate

Implementation Phase の **self-review gate**。`/{{prefix}}-implement` 完了後に auto-chain で起動される (手動起動も可)。touched files を **lint / test / convention 専任 reviewer + stack-conditional optional reviewer** で検証し、`MUST_FIX` 指摘があれば `implementer` subagent で **auto-fix loop** を最大 3 iteration 実行。すべて解消で `implementing → reviewing` に昇格。

## 責務スコープ (vs pr-gate)

| Gate | Scope | Reviewer 構成 |
|---|---|---|
| **code-gate (本 skill)** | touched files に対する **静的検査 + テスト + 命名 / module 配置** | `lint-agent`, `test-agent`, `convention-reviewer` (+ stack 別 lint-like: a11y / database-migration / flutter-perf) |
| **pr-gate (別 skill)** | diff `<base>...HEAD` 全体への **adversarial Critical 検証** | `security-reviewer`, `architecture-reviewer`, `po-reviewer` (+ system scope: api-performance / openapi-contract) |

**Overlap 排除原則**: code-gate は security / architecture / po 系 reviewer を **起動しない** (pr-gate の責務、resolves C-4-a)。stack 別追加 reviewer は lint-like (a11y, flutter-perf, database-migration) に限定。

`gate_common::registry_filter_agents` で実在する reviewer のみに絞り込み (registry に無い optional reviewer は silent skip)。

## When to invoke

- `/{{prefix}}-implement` から auto-chain (default ON)
- 手動: 実装後の self-review を再実行したい時

## Inputs

- `<spec_dir>` (optional): 省略時 branch 名から推定
- `--max-iter N` (default: 3): auto-fix loop の最大回数
- `--no-auto-fix`: MUST_FIX を検出しても auto-fix を実行せず、findings を表示して halt
- `--lint-cmd <cmd>` (optional): lint-agent に渡す override
- `--test-cmd <cmd>` (optional): test-agent に渡す override

## Steps

### Phase 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || exit 1
spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}") || exit 2
gate_common::phase0_check_status "$spec_dir" "implementing" || exit 1
gate_common::phase0_check_charter "$spec_dir" || exit 1
# agent registry validate (resolves C-1-a / C-1-b)
gate_common::registry_assert_agent implementer || halt "implementer agent missing; run /spec-gate bootstrap"
gate_common::registry_assert_agent lint-agent  || halt "lint-agent missing"
gate_common::registry_assert_agent test-agent  || halt "test-agent missing"
gate_common::registry_assert_agent convention-reviewer || halt "convention-reviewer missing"
```

1. spec_dir 解決 (phase0_resolve_spec_dir)
2. `<spec_dir>/spec.md` の frontmatter `status` が `implementing` であることを確認
3. `tasks.md` の全タスクが `[x]` (implement Phase 4 検証済) であることを確認
4. `git status` で working tree に diff があることを確認 (なければ "実装すべき変更がありません" で halt)
5. 必須 actor (implementer / lint-agent / test-agent) と convention-reviewer の registry validation

### Phase 1: Diff scope の決定

```bash
diff_files=$(git diff --name-only HEAD | sort -u)
touched_files=$(cat "$spec_dir/touched-files.txt" 2>/dev/null | sort -u || true)
if [ -n "$touched_files" ]; then
  scope=$(comm -12 <(echo "$diff_files") <(echo "$touched_files"))
else
  scope="$diff_files"
fi
echo "$scope" > "$spec_dir/.code-gate-scope.txt"
```

reviewer に渡す scope は `diff_files ∩ touched_files` (touched-files.txt があれば intersect、なければ diff_files 全部)。

### Phase 2: tech-stack 別 reviewer の選定

`docs/discovery.md` から tech stack を検出し、追加 reviewer を決定:

- **常駐 (4 actor/reviewer)**: `lint-agent`, `test-agent`, `convention-reviewer` + `implementer` (auto-fix 用、Phase 5 で起動)
- **stack 別追加 (最大 +2)**: lint-like のみ
  - Flutter → `flutter-perf-reviewer` (registry にあれば)
  - WCAG 対応プロジェクト → `a11y-reviewer`
  - データベース migration を含む diff → `database-reviewer`
  - UI framework → `ux-reviewer`

```bash
active=$(gate_common::registry_filter_agents \
  lint-agent test-agent convention-reviewer \
  flutter-perf-reviewer a11y-reviewer database-reviewer ux-reviewer)
```

`security-reviewer`, `architecture-reviewer`, `po-reviewer`, `api-performance-reviewer`, `openapi-contract-reviewer` は **起動しない** (pr-gate 専任)。

### Phase 3: 並列 reviewer 起動 (1 iteration)

**1 message 内で全 active reviewer を並列 Agent 起動**:

| Track | Agent type | 観点 |
|---|---|---|
| `lint-agent`         | Agent ツール (`subagent_type: lint-agent`) — stdout に JSON で violations 返却 | 静的解析、style 違反 |
| `test-agent`         | Agent ツール (`subagent_type: test-agent`) — stdout に JSON で pass/fail + failed test names | テスト red 検出 + coverage |
| `convention-reviewer`| Agent ツール (`subagent_type: convention-reviewer`) | 命名 / module 配置 / lint hookup |
| (stack 別 +α)        | Agent ツール | 該当時 |

各 reviewer に context として渡す:

- `<spec_dir>/{spec,plan,tasks}.md`
- `<spec_dir>/.code-gate-scope.txt` (touched files の絞り込み結果)
- `git diff HEAD` の full diff (大きすぎる場合は `git diff --stat` + 個別 file の diff)
- `.specify/memory/constitution.md`
- `docs/domains/<domain>/charter.md`

clean-context isolation (`tools: Read, Grep, Glob` + lint/test-agent は `Bash` のみ追加許可)。

### Phase 4: 集約 — findings の集計

各 reviewer 出力を集約し markdown table 化。**lint-agent / test-agent は JSON 直結**で severity 翻訳:

- lint severity `error` → MUST_FIX
- lint severity `warning` → SHOULD_FIX
- lint severity `info` → CONSIDER
- test failure → MUST_FIX (test agent JSON の `failed_tests[]` から)
- convention-reviewer の Critical/High → MUST_FIX / SHOULD_FIX

```markdown
# Code Gate Iteration <N>: <spec.md title>

**Run**: <ISO>
**Spec**: specs/<spec_dir>/
**Diff scope**: <K files>, <L+/M->
**Tracks**: lint-agent, test-agent, convention-reviewer, <stack-specific...>

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | <N> | <file:line, ...> |
| SHOULD_FIX | <M> | ... |
| CONSIDER | <K> | ... |

**Status**: <PASS | FIX_REQUIRED>

## MUST_FIX findings (N)

### MF-001 — <title> [origin: lint | test | convention | <stack>]
- **Where**: <file:line>
- **Issue**: ...
- **Why must-fix**: ...
- **Suggested fix**: ...
```

各 reviewer 出力 (`<spec_dir>/convention-reviewer.md` 等) に対して:

1. `gate_common::viewpoint_coverage_check <md>` — A-H 欠落 warning
2. `gate_common::cascade_enforce <md>` — 0 件確認なし Critical を High に降格 + marker

### Phase 4b: JSON verdict emit

`gate_common::verdict_emit "$spec_dir" code "$verdict_json"` で `<spec_dir>/.gate-verdict-code.json` を生成:

```json
{
  "gate": "code",
  "run": "<ISO>",
  "spec_dir": "specs/<spec_id>",
  "spec_id": "<spec_id>",
  "iter": <N>,
  "severity_counts": {"critical": 0, "high": 3, "medium": 2, "low": 5},
  "must_fix_findings": [
    {"mf_id": "MF-001", "where": "lib/a.ts:42", "origin": "lint",
     "rule": "no-unused-vars", "message": "...", "severity": "error"}
  ],
  "touched_files": [
    {"path": "lib/a.ts", "sha": "<git blob sha>"}
  ],
  "fr_coverage": [
    {"fr": "FR-007", "covered": true, "by": ["lib/a.ts:42"]}
  ],
  "viewpoint_coverage": {
    "A": "該当なし: pr-gate 専任", "B": "該当なし: pr-gate 専任",
    "C": "該当なし: pr-gate 専任", "D": "該当なし: pr-gate 専任",
    "E": "該当なし: pr-gate 専任", "F": "High:2 Medium:1",
    "G": "該当なし: optional reviewer なし", "H": "High:1 Medium:1"
  },
  "tracks": {
    "lint-agent": {"violations": 5, "exit_code": 1},
    "test-agent": {"passed": 142, "failed": 3, "exit_code": 1},
    "convention-reviewer": {"viewpoint_missing": [], "cascade_demotions": 0}
  },
  "cascade_demotions": 0,
  "iter_history": [{"iter": 1, "must_fix": 5}, {"iter": 2, "must_fix": 2}],
  "verdict": "PASS|FIX_REQUIRED"
}
```

### Phase 5: Auto-fix loop (MUST_FIX > 0 かつ `--no-auto-fix` でないとき)

各 iteration は以下を **1 単位**として定義 (resolves C-3-a):

- **START**: iter N 開始時の `<spec_dir>/.gate-verdict-code.json` (Phase 4b で emit 済) を input
- **BODY**: `implementer` subagent (`subagent_type: implementer`) を Agent ツールで 1 回起動
  - context: verdict JSON 全体 + `<spec_dir>/touched-files.txt` + spec.md/plan.md/tasks.md
  - 任務: `must_fix_findings[]` を順に処理、touched files を更新、`<spec_dir>/code-gate.md.iter<N>.implementer.json` を Write
- **TAIL**: Phase 3 (並列 reviewer 再起動) → Phase 4 (集約) → Phase 4b (verdict emit + iter_history append) を再実行
- **END**: iter N の `severity_counts.must_fix == 0` ⇒ break PASS、それ以外 ⇒ iter N+1

```
for iter in 1..max_iter:
  invoke_implementer(verdict.json)
  rerun_reviewers()
  if verdict.must_fix == 0:
    break PASS
  if cascade_exhausted(iter_history):
    break HALT
```

**Cascade exhaustion 数学的定義** (resolves C-3-a / item 2 / spec C-6):

- 条件: `iter_history[N].must_fix >= iter_history[N-1].must_fix AND iter_history[N-1].must_fix >= iter_history[N-2].must_fix`
- すなわち **N, N-1, N-2 の 3 連続で MUST_FIX が単調非減少**
- 最小発火 iter = 3 (N=3 のとき N-1=2, N-2=1 を比較)
- iter ∈ {1, 2} では発火しない (data 不足)
- `iter_history` は `.gate-verdict-code.json` の配列で永続化、再実行時に復元

Cascade exhaustion 時は halt with "Manual intervention required" + 直前 verdict をそのまま最終扱い。

### Phase 6: Status 遷移判定

```bash
bash .specify/scripts/status-transition.sh \
  --gate-transition "$spec_dir" code implementing reviewing
```

- verdict=PASS かつ critical=0 (auto-fix で must_fix=0 まで到達) → implementing → reviewing
- verdict=FIX_REQUIRED → 状態据置、code-gate.md に "MUST_FIX (max_iter reached)" を記録

### Phase 7: 完了通知

```
✓ /{{prefix}}-code-gate 完了
  - spec dir: <spec_dir>
  - iterations: <N> (auto-fix loop)
  - verdict: <PASS | FIX_REQUIRED>
  - status: <implementing → reviewing | implementing 据置>
  - verdict JSON: <spec_dir>/.gate-verdict-code.json
  - 次のアクション: /{{prefix}}-pr-gate (PASS時)
```

## Idempotency

- 再実行可能 (各 iteration を `code-gate.md.iter1`, `code-gate.md.iter2`, ..., 最終を `code-gate.md` に保存)
- 既存 `code-gate.md` は `code-gate.md.<TS>` にバックアップしてから新規生成
- `iter_history` は verdict JSON に蓄積されているため、再実行で再 iter 番号は最後の +1 から

## Failure modes

- lint/test コマンド検出失敗 (lint-agent / test-agent が exit 2) → AskUserQuestion でコマンド指定を求める or `--lint-cmd` / `--test-cmd` で override
- implementer subagent registry 不在 (`gate_common::registry_assert_agent implementer` 失敗) → halt with "/spec-gate bootstrap を再実行してください"
- implementer の auto-fix が partial (一部 MUST_FIX しか修正しない) → 次 iter で残りに再挑戦
- cascade exhaustion (3 連続単調非減少) → halt + 直前 iter の verdict / code-gate.md を最終とみなして表示
- git diff が空 → halt
- agent registry check failure → halt with bootstrap 再実行案内

## Acceptance criteria

1. `<spec_dir>/code-gate.md` が存在し、最終 iteration の verdict が記録
2. `<spec_dir>/.gate-verdict-code.json` が schema validation を通過 (gate_common::verdict_validate)
3. iter_history が verdict JSON に保存されている (再実行時の累積)
4. PASS の場合のみ spec.md frontmatter `status:` が `reviewing` に遷移
5. 各 iteration の生 output (`code-gate.md.iter<N>`, `.iter<N>.implementer.json`) が保存
6. cascade exhaustion 時は halt 理由と数学的根拠が明示 (iter_history の 3 値表示)
7. security/architecture/po reviewer が起動されていない (origin field に存在しない)
