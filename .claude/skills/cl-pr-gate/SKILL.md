---
name: cl-pr-gate
description: PR 提出前の adversarial review gate。`git diff <base>...HEAD` 全体を security / architecture / po + system scope reviewer で多角的に検証し、Critical=0 になるまで /cl-done を許可しない。
argument-hint: [spec_dir]
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# cl-pr-gate

PR 提出前の **adversarial review gate**。`/cl-code-gate` PASS 後に手動起動する。`git diff <base>...HEAD` 全体をレビューし、Critical 指摘が解消されるまで `/cl-done` を許可しない。

**本 gate は pure hard gate である。** Critical 残存で done に進む経路は存在しない。妥協が必要な場合は新 ADR を起票して記録し、Constitution Principle 修正か spec 範囲調整で Critical を解消してから再実行する。

## 責務スコープ (vs code-gate)

| Gate | Scope | Reviewer 構成 |
|---|---|---|
| code-gate | touched files に対する **静的検査 + テスト + 命名** | lint-agent, test-agent, convention-reviewer (+ stack lint-like) |
| **pr-gate (本 skill)** | diff `<base>...HEAD` 全体への **adversarial Critical 検証** | `security-reviewer`, `architecture-reviewer`, `po-reviewer` (+ system scope reviewer) |

**Overlap 排除**: pr-gate は lint-agent / test-agent / convention-reviewer を **起動しない** (code-gate 専任)。code-gate verdict JSON を Phase 4 で読み、重複指摘を `suppressed_by_code_gate` で抑制する。

## When to invoke

- `/cl-code-gate` PASS 後 (status: reviewing)
- 反復: 同 PR で複数 round。Round N-1 の findings を引き継いで N で再評価

## Inputs

- `<spec_dir>` (optional): 省略時 branch 名から推定
- `--base <branch>` (default: 下の Failure modes の fallback 順で解決): diff の基準
- `--round <N>`: 明示的に round 番号を指定 (省略時は既存 pr-gate.md から推定 + 1)
- `--no-auto-dedup`: dedup を手動確認モードに切り替える (default: 完全自動)

## Steps

### Phase 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || exit 1
spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}") || exit 2
gate_common::phase0_check_status "$spec_dir" "reviewing" || exit 1
gate_common::phase0_check_charter "$spec_dir" || exit 1
# code-gate verdict 必須 (overlap 排除 contract)
# **verdict_validate ではなく verdict_require_pass を使う。**
# 前者は FIX_REQUIRED を正当な verdict として exit 0 で通すため、
# code-gate を通っていない spec でも pr-gate が始まってしまう。
[ -f "$spec_dir/.gate-verdict-code.json" ] || halt "/cl-code-gate を先に PASS させてください"
gate_common::verdict_require_pass "$spec_dir/.gate-verdict-code.json" \
  || halt "code-gate が PASS していません。/cl-code-gate を通してから再実行してください"
for a in security-reviewer architecture-reviewer po-reviewer; do
  gate_common::registry_assert_agent "$a" \
    || halt "$a が見つかりません。.claude/agents/$a.md の存在と .specify/.agents-registry.yaml の entry を確認してください"
done
```

1. spec_dir 解決
2. `spec.md` frontmatter `status: reviewing` を確認
3. `.gate-verdict-code.json` の verdict=PASS + critical=0 + must_fix=0 を `verdict_require_pass` で確認
4. base branch と現在 branch の関係を確認 (`git merge-base --is-ancestor`)
5. 必須 reviewer の registry validation
6. **ルール発火検証を通す** (`docs/discovery.md` の「ルール検証」行の agent 用コマンド)。code-gate では実行しないので、機械検証としてここが最後の砦になる:
   - **Round 1 で 1 回。** Round 2 以降は、直前 round 以降に規則定義 / fixture が変わったときだけ再実行する (`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/**` / `tests/rule-fixtures/**` / `scripts/rules/**`)。規則を変えていなければ答えは変わらない
   - **他の検出器と並行させない。単独で走らせる。** このランナーは違反サンプルを `src/` 配下へ一時展開するため、同時に走った lint / depcruise が展開物を実コードの違反として拾い、同種の実行を 2 つ重ねると一方の後始末が他方の展開物を消して「ルールが死んでいる」と誤診する
   - 期待表と一致しなければ **Critical** として round に載せる。実行しなかった round はその旨と理由を verdict に記録する

### Phase 1: Round 番号の決定 + 前 round 引継ぎ

**round 番号の正本は `.gate-verdict-pr.json` (latest) の `round` フィールドである。** round snapshot の Glob を一次情報にしてはならない — snapshot は `.gitignore` の `specs/**/*.round[0-9]*` で追跡されないため、clone 直後は 0 件になり round が常に 1 に戻る。

1. `.gate-verdict-pr.json` が存在すれば、その `round` + 1 を新 round 番号とする
2. 存在しなければ N = 1
3. `--round` 指定があればそちらを優先
4. N >= 2 の場合、`round_history[]` の直前 entry と、あれば `.gate-verdict-pr.round<N-1>.json` の Critical / High findings 本文を Read し subagent context に含める。
   **snapshot が無く findings 本文が復元できないときは `inheritance: "summary-only"` として記録し、黙って「全部 new」扱いにしない** — 引継ぎ 0 件と引継ぎ不能は別物である

### Phase 2: Convergence gate (N >= 4 のときのみ)

**前提**: `.gate-verdict-pr.json` の `round_history[]` に各 round の `convergence: {resolved_from_prev, new_in_round, unresolved}` が累積されている (Phase 5b で emit)。R[N] / R[N-1] はこの配列から引く。

```
convergence_failure := (R[N].resolved_from_prev < R[N].new_in_round)
                       AND (R[N-1].resolved_from_prev < R[N-1].new_in_round)
```

- 比較は **隣接 2 round (N と N-1)** のみ。N-2 は使わない
- 最小発火 round = 4
- 例: `R[5]={resolved:1,new:3}, R[4]={resolved:2,new:1}` → **halt しない** (R[4] が resolved>=new)。`R[5]={resolved:1,new:3}, R[4]={resolved:1,new:2}` → **halt**

halt 時のメッセージ: "Convergence failure: Round N-1 と Round N の両方で resolved<new。ADR 起票 + Constitution Principle / spec 範囲調整で Critical を解消後、再 pr-gate (Round N+1)。"

### Phase 3: Reviewer 選定 (feature scope + system scope)

**feature scope reviewer (常駐)**: `security-reviewer` / `architecture-reviewer` (default mode + ADR-drift mode) / `po-reviewer`

**system scope reviewer**: **pattern をここに書かない。正本は `.specify/spec-gate/reviewers.yml` である。**

```bash
git diff --name-only "$base"...HEAD > "$spec_dir/.pr-gate-scope.txt"

active=$(gate_common::reviewers_filter pr-gate "$spec_dir/.pr-gate-scope.txt" \
  security-reviewer architecture-reviewer po-reviewer \
  database-reviewer ux-reviewer a11y-reviewer platform-boundary-reviewer \
  ui-coverage-reviewer)
```

**起動数に固定上限はない。`reviewers_filter` が返した集合がそのまま並列起動の対象である。**

**上の候補リストは `reviewers.yml` で `gates` に `pr-gate` を含む全 reviewer を網羅していなければならない。** `reviewers_filter` は渡された候補しか絞らないため、ここに名前が無い reviewer は yml に載っていても永久に起動せず、`skipped_reviewers[]` にも現れない。reviewer を増やしたら `/cl-add-reviewer` の Phase 3 のとおりここも直す。

**`registry_filter_agents` を直接呼んではならない。** あちらは agent ファイルの存在しか見ないため、`**/migrations/**` を 1 件も含まない diff でも `database-reviewer` が、UI を 1 行も触らない diff でも `a11y-reviewer` / `ux-reviewer` が起動する。

絞った理由は stderr に 1 行ずつ出る。**Phase 5 の集約に「起動しなかった reviewer とその理由」を必ず転記する。**

`lint-agent` / `test-agent` / `convention-reviewer` は **起動しない** (code-gate 専任)。

### Phase 4: 並列起動 + code-gate verdict 受け渡し

1 message 内で全 active reviewer を並列 Agent 起動 (clean-context isolation)。各 subagent に渡す context:

- `<spec_dir>/{spec,plan,tasks,design-gate,code-gate}.md` (前段の判断材料)
- `<spec_dir>/.gate-verdict-code.json` — **重複 suppress 用**。reviewer はこの JSON の `must_fix_findings[].where` に列挙された `file:line` を **再指摘してはならない**
- `git diff <base>...HEAD` の full diff (50KB 超なら `--stat` + 重要 file のみ)
- `<spec_dir>/touched-files.txt`
- `<spec_dir>/.pr-gate-scope.txt` — **対象ファイル集合**。これを渡さないと reviewer が scope (feature / system) を diff 本文から推測するしかなくなる
- `.specify/memory/constitution.md`
- `docs/domains/<domain>/charter.md`
- `docs/decisions/*.md` (status: accepted): **architecture-reviewer のみ全文**、他 reviewer は header + Decision Outcome + Confirmation のみ
- (N >= 2 のとき) Round N-1 の Critical / High findings 一覧 + convergence block

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
  PASS         → /cl-done <spec_dir>
  FIX_REQUIRED → コード修正 + /cl-pr-gate 再実行 (Round <N+1>)
  CONVERGENCE  → ADR 起票 + spec 範囲調整

## Critical (Round <N>)

### C-001 — <title> [origin: security | architecture | po | ...]
- **Where**: <file:line, ...>
- **Issue**: ...
- **Why critical**: ...
- **Suggested fix**: ...
- **Status in this round**: new | resolved from N-1 | unresolved from N-1

## Track raw outputs

<details>...
```

**reviewer 出力は本 skill が Write する。** reviewer は read-only なので自分では保存できない。各 reviewer の返り値を `<spec_dir>/<reviewer>.pr-gate.round<N>.md` に Write し、最新版を `<spec_dir>/<reviewer>.pr-gate.md` にも置いてから、そのパスに対して次を実行する:

1. `gate_common::viewpoint_coverage_check <md>` — A-H 必須カテゴリ欠落の warning
2. `gate_common::cascade_enforce <md>` — 0 件確認なし Critical を機械的に High 降格

**書く前に実行してはならない** — 両関数はファイル不在で return 3 を返し、cascade 降格が黙って空振りする。`.pr-gate.round<N>` で修飾するのは、同じ reviewer が design-gate でも走り、かつ Round ごとに別物として残す必要があるため。

### Phase 5b: JSON verdict emit

`<spec_dir>/.gate-verdict-pr.json` (latest) + `.gate-verdict-pr.round<N>.json` (snapshot) を `gate_common::verdict_emit` で生成する。

**round 間で必要な情報は latest 側の `round_history[]` に累積する。** snapshot (`*.round<N>.json`) は `.gitignore` で追跡されないため、clone 直後や CI では存在しない。convergence 判定 (Phase 2) と Round N-1 引継ぎ (Phase 1) は **latest の `round_history[]` だけで成立する形で書く**。snapshot は手元でのデバッグ用の副産物として扱う。

```json
{
  "gate": "pr",
  "run": "<ISO>",
  "spec_dir": "specs/<spec_id>",
  "spec_id": "<spec_id>",
  "round": 1,
  "base_branch": "develop",
  "diff_stat": {"files": 12, "additions": 340, "deletions": 51},
  "severity_counts": {"critical": 0, "high": 3, "medium": 2, "low": 5},
  "convergence": {"resolved_from_prev": 0, "new_in_round": 3, "unresolved": 0},
  "round_history": [
    {"round": 1, "critical": 0, "high": 3,
     "convergence": {"resolved_from_prev": 0, "new_in_round": 3, "unresolved": 0}}
  ],
  "suppressed_by_code_gate": [
    {"path": "src/a.ts", "line": 42, "finding_id": "MF-001"}
  ],
  "touched_files": [{"path": "src/a.ts", "sha": "<git blob sha>"}],
  "viewpoint_coverage": {"A": "Critical:0 High:2"},
  "fr_coverage": [{"fr": "FR-007", "covered": true, "by": ["src/a.ts:42"]}],
  "rule_verification": {"ran": true, "round": 1, "reason": "Round 1"},
  "skipped_reviewers": [],
  "tracks": {
    "security-reviewer": {"viewpoint_missing": [], "cascade_demotions": 1, "critical": 0, "high": 2},
    "architecture-reviewer": {"viewpoint_missing": ["G"], "cascade_demotions": 0, "critical": 0, "high": 1}
  },
  "verdict": "PASS|FIX_REQUIRED|CONVERGENCE_FAILURE"
}
```

### Phase 6: Dedup + code-gate finding との重複 suppress

1. **code-gate verdict との突合**:
   - `code-gate.md` の MUST_FIX で resolved になった `path:line` を抽出
   - 当 round の Critical / High で **同一 `path:line` かつ同一 `origin+rule`** を 1:1 突合
   - 一致したものは `suppressed_by_code_gate` フラグ付きで verdict JSON に記録、表示は dim
   - **`suppressed_by_code_gate` は visual dim のみ。** `severity_counts.critical` と PASS 判定のカウントから除外しない。同一行に異種 origin の finding がある場合 (lint error と security finding が同一行等) は suppress しない
2. **Multi-reviewer dedup** (design-gate Phase 3 と同じ完全自動戦略): 集約 key は `path:line` > FR-NNN > Principle > Levenshtein < 5
3. AskUserQuestion は **使用しない**。`--no-auto-dedup` 指定時のみ各ペアで確認する

### Phase 7: 完了通知

```
✓ /cl-pr-gate Round <N> 完了
  - spec dir: <spec_dir>
  - reviewers: <count> 並列
  - critical (net): <N>
  - suppressed by code-gate: <S>
  - verdict: <PASS | FIX_REQUIRED | CONVERGENCE_FAILURE>
  - verdict JSON: <spec_dir>/.gate-verdict-pr.json
  - 次のアクション:
    PASS → /cl-done <spec_dir>
    FIX_REQUIRED → 修正後 /cl-pr-gate (Round <N+1>)
    CONVERGENCE → ADR 起票 + spec 範囲調整
```

Status は変更しない (`reviewing` 据置)。`/cl-done` が完了時に `reviewing → completed` 遷移。

## Idempotency

- 各 round の verdict snapshot は `.gate-verdict-pr.round<N>.json`、latest は `.gate-verdict-pr.json`
- pr-gate.md も `pr-gate.md.round<N>` + 最新 `pr-gate.md` の二重保存
- 同 round 番号で再実行されたら overwrite (with `.bak`)

## Failure modes

- subagent timeout → 当該 reviewer track のみ skip + warning、verdict の `tracks.<name>.status: error`
- 全 reviewer 失敗 → halt
- convergence failure (N >= 4) → halt with "ADR 起票 + spec 範囲調整が必須"
- diff が空 → halt with "実装変更がありません"
- base branch が不明 → `git symbolic-ref refs/remotes/origin/HEAD` → `develop` → `main` の順にフォールバック。すべて存在しなければ AskUserQuestion で指定を求める
- code-gate verdict JSON 不在 → halt with "/cl-code-gate を先に PASS させてください"
- 必須 reviewer が registry に無い → halt with "`.claude/agents/<name>.md` の存在と `.specify/.agents-registry.yaml` の entry を確認してください"

## Acceptance criteria

1. `<spec_dir>/pr-gate.md.round<N>` が存在する
2. `.gate-verdict-pr.json` が `verdict_validate` を通過する
3. Verdict が PASS / FIX_REQUIRED / CONVERGENCE_FAILURE のいずれかで明記されている
4. `round_history[]` に当 round の entry が追記され、**追跡されるファイルだけで N-1 の convergence が引ける**
5. N >= 2 の場合、引継ぎ (resolved / unresolved / new) がテーブルと verdict JSON に出ている。復元不能なら `inheritance: "summary-only"` が記録されている
6. N >= 4 で convergence 判定の根拠 (R[N], R[N-1] の resolved / new) が verdict JSON にある
7. 各 reviewer の raw output が `<spec_dir>/<reviewer>.pr-gate.round<N>.md` に保存され、それに対して `cascade_enforce` と `viewpoint_coverage_check` が実行されている
8. spec.md frontmatter `status` は変更されていない (`reviewing` のまま)
9. Critical > 0 のまま PASS になる経路が存在しない
10. code-gate verdict にある file:line を再指摘した場合、`suppressed_by_code_gate` に分類されている
