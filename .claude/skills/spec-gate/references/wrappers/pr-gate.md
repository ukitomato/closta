---
name: {{prefix}}-pr-gate
description: PR 提出前の adversarial review gate。`git diff <base>...HEAD` 全体を security/architecture/po + system scope reviewer で多角的に検証 (lint/test は code-gate 専任、resolves C-4-a)。multi-round adversary review (隣接 2 round で resolved<new → halt、resolves C-3-g)。Critical=0 で /{{prefix}}-done を許可。`--defer-remaining` は撤廃 (pure hard gate、resolves C-4-b)。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# {{prefix}}-pr-gate

PR 提出前の **adversarial review gate**。`/{{prefix}}-code-gate` PASS 後に手動起動する。`git diff <base>...HEAD` 全体を **5+3 並列 reviewer 上限** で多角的にレビューし、Critical 指摘が解消されるまで `/{{prefix}}-done` を許可しない。

**Hard gate philosophy** (resolves C-4-b): Critical 残存時の `--defer-remaining` 経路は **撤廃された**。Critical=0 まで done 不可。妥協 (defer) が必要な場合は新 ADR 起票で記録し、Constitution Principle 修正 or spec 範囲調整で Critical を解消してから本 gate を通す。

## 責務スコープ (vs code-gate)

| Gate | Scope | Reviewer 構成 |
|---|---|---|
| code-gate | touched files に対する **静的検査 + テスト + 命名** | lint-agent, test-agent, convention-reviewer (+ stack lint-like) |
| **pr-gate (本 skill)** | diff `<base>...HEAD` 全体への **adversarial Critical 検証** | `security-reviewer`, `architecture-reviewer`, `po-reviewer` (+ system scope: database/openapi/api-perf/a11y/ux) |

**Overlap 排除**: pr-gate は lint-agent / test-agent / convention-reviewer を **起動しない** (code-gate 専任、resolves C-4-a)。code-gate verdict JSON を Phase 4 で読み、重複指摘を `suppressed_by_code_gate` で抑制。

## When to invoke

- `/{{prefix}}-code-gate` PASS 後 (status: reviewing)
- 反復: 同 PR で複数 round。Round N-1 の findings を引き継いで N で再評価

## Inputs

- `<spec_dir>` (optional): 省略時 branch 名から推定
- `--base <branch>` (default: `develop` or `main`、`.specify/config.yaml` から取得): diff の基準
- `--round <N>`: 明示的に round 番号を指定 (省略時は既存 pr-gate.md から推定 + 1)
- `--auto-dedup`: dedup 確認 AskUserQuestion を skip (default-automated だけで進む)

**注意**: `--defer-remaining` フラグは **撤廃** (decision #2、resolves C-4-b)。Critical 残存で done に進めたい場合は別経路 (ADR + spec 修正 + 再 pr-gate) を要する。

## Steps

### Phase 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || exit 1
spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}") || exit 2
gate_common::phase0_check_status "$spec_dir" "reviewing" || exit 1
gate_common::phase0_check_charter "$spec_dir" || exit 1
# code-gate verdict 必須 (overlap 排除 contract)
[ -f "$spec_dir/.gate-verdict-code.json" ] || halt "/{{prefix}}-code-gate を先に PASS させてください"
gate_common::verdict_validate "$spec_dir/.gate-verdict-code.json" || halt "code-gate verdict not PASS"
# agent registry
gate_common::registry_assert_agent security-reviewer
gate_common::registry_assert_agent architecture-reviewer
gate_common::registry_assert_agent po-reviewer
```

1. spec_dir 解決
2. `spec.md` frontmatter `status: reviewing` を確認
3. `<spec_dir>/.gate-verdict-code.json` の verdict=PASS + critical=0 を `verdict_validate` で確認
4. base branch (`develop` / `main`) と現在 branch の関係を確認 (`git merge-base --is-ancestor` で diverge 確認)
5. 必須 reviewer (security / architecture / po) の registry validation

### Phase 1: Round 番号の決定 + 前 round 引継ぎ

1. `<spec_dir>/.gate-verdict-pr.round*.json` の存在を Glob、最大 round 番号を取得
2. `--round` 指定があればそちらを優先
3. 新規 round 番号 N = (既存最大 + 1) または `--round` 指定値
4. N >= 2 の場合、`.gate-verdict-pr.round<N-1>.json` の Critical/High findings + `convergence` block を Read し subagent context に含める

### Phase 2: Convergence gate (N >= 4 のときのみ)

Round 4 以降は **convergence failure** をチェック。

**前提**: 各 round の `<spec_dir>/.gate-verdict-pr.round<N>.json` に `convergence: { "resolved_from_prev": <r>, "new_in_round": <n_new>, "unresolved": <u> }` が保存されている (Phase 5b で emit)。

**数学的定義** (resolves C-3-g / item 3 / spec C-6):

```
convergence_failure := (R[N].resolved_from_prev < R[N].new_in_round)
                       AND (R[N-1].resolved_from_prev < R[N-1].new_in_round)
```

- 比較は **隣接 2 round (N と N-1)** のみ。N-2 vs N-1 の比較は使わない
- 最小発火 round = 4 (N=4 のとき N-1=3 のデータで比較)
- 例:
  - R[5]={resolved:1, new:3}, R[4]={resolved:2, new:1} → **NO halt** (R[4] が resolved>=new)
  - R[5]={resolved:1, new:3}, R[4]={resolved:1, new:2} → **halt** (両方 resolved<new)

```
IF convergence_failure:
  halt with "Convergence failure: Round N-1 と Round N の両方で resolved<new。
            ADR 起票 + Constitution Principle / spec 範囲調整で Critical を解消後、
            再 pr-gate (Round N+1)。--defer-remaining は撤廃済 (pure hard gate)."
```

### Phase 3: Reviewer 選定 (feature scope + system scope)

**feature scope reviewer (常駐 3-5)**:

- `security-reviewer`
- `architecture-reviewer` (default mode + ADR-drift mode)
- `po-reviewer`
- `api-performance-reviewer` (registry にあれば、optional)

**system scope reviewer (file pattern 連動、最大 +3)**:

`git diff --name-only <base>...HEAD` から file pattern を判定し動的に追加:

| Pattern | 追加 reviewer |
|---|---|
| `**/migrations/**` or `*.sql` | `database-reviewer` |
| `openapi.yaml` or `**/contracts/*.yaml` | `openapi-contract-reviewer` |
| `**/*.tsx`, `**/*.vue`, `**/*.dart` (UI files) | `ux-reviewer` / `a11y-reviewer` |

```bash
active=$(gate_common::registry_filter_agents \
  security-reviewer architecture-reviewer po-reviewer \
  api-performance-reviewer database-reviewer openapi-contract-reviewer \
  ux-reviewer a11y-reviewer)
```

`lint-agent`, `test-agent`, `convention-reviewer` は **起動しない** (code-gate 専任)。

合計 3+3 = 最大 6 reviewer 並列 (架空の +5+3=8 上限は維持)。

### Phase 4: 並列起動 + code-gate verdict 受け渡し

1 message 内で全 active reviewer を並列 Agent 起動 (clean-context isolation)。各 subagent に渡す context:

- `<spec_dir>/{spec,plan,tasks,design-gate,code-gate}.md` (前段の判断材料)
- `<spec_dir>/.gate-verdict-code.json` — **重複 suppress 用**。reviewer はこの JSON の `must_fix_findings[].where` に列挙された `file:line` を **再指摘してはならない** (code-gate で既に解消済として扱う)
- `git diff <base>...HEAD` の full diff (50KB 超なら `--stat` + 重要 file のみ)
- `<spec_dir>/touched-files.txt`
- `.specify/memory/constitution.md`
- `docs/domains/<domain>/charter.md`
- `docs/decisions/*.md` (status: accepted): **architecture-reviewer のみ全文**、他 reviewer は header + Decision Outcome + Confirmation のみ
- (N >= 2 のとき) Round N-1 の Critical/High findings 一覧 + convergence block

### Phase 5: 集約 — `<spec_dir>/pr-gate.md.round<N>`

```markdown
# PR Gate Round <N>: <spec.md title>

**Run**: <ISO>
**Base**: <base branch>
**Diff stat**: +<L> -<M> over <K> files
**Reviewers**: <list>
**Round inheritance**: Round <N-1> findings (Critical: <X>, High: <Y>) を引継ぎ

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | <n> | <r> | <new> | <n> | <s> |
| High     | ... |
| Medium   | ... |
| Low      | ... |

**Status**: <PASS (Critical=0) | FIX_REQUIRED | CONVERGENCE_FAILURE (N>=4)>
**Next**:
  PASS         → /{{prefix}}-done <spec_dir>
  FIX_REQUIRED → コード修正 + /{{prefix}}-pr-gate 再実行 (Round <N+1>)
  CONVERGENCE  → ADR 起票 + spec 範囲調整 (defer-remaining 経路なし)

## Critical (Round <N>)

### C-001 — <title> [origin: security | architecture | po | ...]
- **Where**: <file:line, ...>
- **Issue**: ...
- **Why critical**: ...
- **Suggested fix**: ...
- **Status in this round**: new | resolved from N-1 | unresolved from N-1

...

## Track raw outputs

<details>...
```

各 reviewer 出力に対して:

1. `gate_common::viewpoint_coverage_check <md>` — A-H 必須カテゴリ欠落の warning
2. `gate_common::cascade_enforce <md>` — 0 件確認なし Critical を機械的に High 降格 (resolves C-2-d)

### Phase 5b: JSON verdict emit

`<spec_dir>/.gate-verdict-pr.json` (latest) + `<spec_dir>/.gate-verdict-pr.round<N>.json` (snapshot) を `gate_common::verdict_emit` で生成:

```json
{
  "gate": "pr",
  "run": "<ISO>",
  "spec_dir": "specs/<spec_id>",
  "spec_id": "<spec_id>",
  "round": <N>,
  "base_branch": "develop",
  "diff_stat": {"files": <K>, "additions": <L>, "deletions": <M>},
  "severity_counts": {"critical": <n>, "high": <n>, "medium": <n>, "low": <n>},
  "convergence": {"resolved_from_prev": <r>, "new_in_round": <new>, "unresolved": <u>},
  "suppressed_by_code_gate": [
    {"path": "lib/a.ts", "line": 42, "finding_id": "MF-001"}
  ],
  "touched_files": [{"path": "lib/a.ts", "sha": "<git blob sha>"}],
  "viewpoint_coverage": {"A": "Critical:0 High:2", ...},
  "fr_coverage": [{"fr": "FR-007", "covered": true, "by": ["lib/a.ts:42"]}],
  "tracks": {
    "security-reviewer": {"viewpoint_missing": [], "cascade_demotions": 1, "critical": 0, "high": 2},
    "architecture-reviewer": {"viewpoint_missing": ["G"], "cascade_demotions": 0, "critical": 0, "high": 1}
  },
  "verdict": "PASS|FIX_REQUIRED|CONVERGENCE_FAILURE"
}
```

### Phase 6: Dedup + code-gate finding との重複 suppress

1. **code-gate verdict との突合** (resolves C-4-a):
   - `code-gate.md` の MUST_FIX で resolved になった `path:line` を抽出
   - 当 round の Critical/High で同一 `path:line` を 1:1 突合
   - 一致したものは `suppressed_by_code_gate` フラグ付きで verdict JSON に記録、表示は dim
2. **Multi-reviewer dedup** (design-gate Phase 3 と同じ default-automated 戦略):
   - 集約 key: path:line > FR-NNN > Principle > Levenshtein < 5
3. AskUserQuestion は dedup 結果の **確認のみ** で起動 (`--auto-dedup` で skip)、ユーザ無応答で機械判定採用

### Phase 7: 完了通知

```
✓ /{{prefix}}-pr-gate Round <N> 完了
  - spec dir: <spec_dir>
  - reviewers: <count> 並列
  - critical (net): <N>
  - suppressed by code-gate: <S>
  - verdict: <PASS | FIX_REQUIRED | CONVERGENCE_FAILURE>
  - verdict JSON: <spec_dir>/.gate-verdict-pr.json
  - 次のアクション:
    PASS → /{{prefix}}-done <spec_dir>
    FIX_REQUIRED → 修正後 /{{prefix}}-pr-gate (Round <N+1>)
    CONVERGENCE → ADR 起票 + spec 範囲調整 (defer 経路なし)
```

Status は変更しない (`reviewing` 据置)。`/{{prefix}}-done` が完了時に `reviewing → completed` 遷移。

## Idempotency

- 各 round の verdict snapshot は `.gate-verdict-pr.round<N>.json` に保存、latest は `.gate-verdict-pr.json`
- pr-gate.md も `pr-gate.md.round<N>` + 最新 `pr-gate.md` の二重保存
- 同 round 番号で再実行されたら overwrite (with `.bak`)

## Failure modes

- subagent timeout → 当該 reviewer track のみ skip + warning、verdict の `tracks.<name>.status: error`
- 全 reviewer 失敗 → halt
- convergence failure (N >= 4) → halt with "ADR 起票 + spec 範囲調整が必須"。follow-up 経路なし
- diff が空 → halt with "実装変更がありません"
- base branch が不明 → AskUserQuestion で指定を求める
- code-gate verdict JSON 不在 → halt with "/{{prefix}}-code-gate を先に PASS させてください"
- agent registry check failure → halt with bootstrap 再実行案内

## Acceptance criteria

1. `<spec_dir>/pr-gate.md.round<N>` が存在
2. `<spec_dir>/.gate-verdict-pr.json` + `.gate-verdict-pr.round<N>.json` 両方が schema validation 通過
3. Verdict が PASS / FIX_REQUIRED / CONVERGENCE_FAILURE のいずれかで明記
4. N >= 2 の場合、Round N-1 からの引継ぎ (resolved / unresolved / new) がテーブル + verdict JSON で表示
5. N >= 4 で convergence section が verdict JSON に存在し、convergence_failure 判定の根拠 (R[N], R[N-1] の resolved / new) を含む
6. spec.md frontmatter `status` は変更されない (`reviewing` のまま)
7. `--defer-remaining` 経由の PASS 経路が存在しない (pure hard gate)
8. code-gate verdict にある file:line を再指摘した場合、suppressed_by_code_gate に分類されている
