---
name: cl-design-gate
description: Design Phase 末尾の hard gate。spec.md + plan.md + tasks.md (+ data-model.md / research.md / contracts/) を bundle で検証する。analyze (machine consistency) + `po-reviewer` (User Story 価値) + `architecture-reviewer` (Constitution / Charter / ADR drift) + registry で design-gate に登録された optional reviewer を **並列 clean-context subagent** で起動 → 集約 `design-gate.md`。Critical=0 で tasking → implementing 昇格。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# cl-design-gate

Design Phase の **最後の品質ゲート**。`/cl-implement` 起動前に手動起動する。`spec.md` + `plan.md` + `tasks.md` を **bundle で** レビューし、Critical 指摘が解消されるまで status を `tasking` から進めない。

## When to invoke

- `/cl-tasks` 完了後、`/cl-implement` 起動前
- `spec.md` 単体のレビューではなく、設計フェーズ全体 (spec + plan + tasks) の整合性を検証する gate

## Inputs

- `<spec_dir>` (optional): 省略時は branch 名から推定

## Steps

### Phase 0: spec_dir resolution + state check (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || exit 1
spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}") || exit 2
current_status=$(gate_common::phase0_check_status "$spec_dir" "tasking,implementing,reviewing") || exit 1
gate_common::phase0_check_charter "$spec_dir" || exit 1
```

1. spec_dir を解決 (phase0_resolve_spec_dir、spec-resolve.sh 経由)
2. 以下が存在することを確認 (1 つでも欠ければ halt):
   - `<spec_dir>/spec.md`
   - `<spec_dir>/plan.md`
   - `<spec_dir>/tasks.md`
3. frontmatter `status` を読み取る (phase0_check_status):
   - `tasking` → 正常
   - `implementing` / `reviewing` → **自動で再レビューを実行** (status は据置)、完了通知に `[warn: re-run on status=<status>]` を記録
   - `drafting` / `planning` → halt with "/cl-plan, /cl-tasks を先に完了してください"
4. `domain` 値を frontmatter から取得 → `docs/domains/<domain>/charter.md` の存在を確認 (phase0_check_charter)
5. agent registry validate: `gate_common::registry_assert_agent po-reviewer && gate_common::registry_assert_agent architecture-reviewer` (resolves C-1-b)
6. **optional reviewer の解決**: `.specify/.agents-registry.yaml` で `invoked_by` に `design-gate` を含むエントリを列挙し、`gate_common::registry_filter_agents` で実在するものだけを追加トラックとする。registry が SSoT であり、本 SKILL にトラック数を焼き込まない

### Phase 1: 並列 clean-context 起動

**1 つのメッセージ内で全トラックを並列起動する**。各トラックは完全独立、互いの出力を見ない。
**すべて Agent ツールによる clean-context subagent であり、subprocess は使わない。**

| Track | Trigger | 観点 |
|---|---|---|
| **A. analyze** | Agent ツール (`subagent_type: general-purpose`)。`.claude/skills/speckit-analyze/SKILL.md` を Read させ、その解析手順に従わせる | **機械的 consistency**: spec / plan / tasks / contracts の identifier 整合、FR/SC カバレッジ、EARS 完全性、Constitution Article 参照、ADR 引用の正しさ |
| **B. `po-reviewer`** | Agent ツール (`subagent_type: po-reviewer`) | **ビジネス価値**: User Story の "why" / Success Criteria の計測可能性 / Acceptance Criteria testability / UX negative cases / 優先度妥当性 |
| **C. `architecture-reviewer`** | Agent ツール (`subagent_type: architecture-reviewer`) | **アーキ整合**: Constitution Principle drift / Domain Charter drift / 関連 ADR drift / レイヤ違反 / cross-domain invariant 違反 |
| **D+. registry 由来の optional reviewer** | Agent ツール (`subagent_type: <name>`) | 各 reviewer の Owner Matrix に従う。Phase 0 step 6 で解決した分だけトラックを増やす |

**Track A を subprocess にしない理由**: `claude --slash <name>` は CLI のフラグとして存在しない。
また analyze の要件は「メインスレッドの会話履歴を見ない独立した読解」であり、
これは Agent ツールの clean-context isolation で満たされる。別プロセスを立てる必要はなく、
立てると timeout / crash / 文字コードの failure mode を余分に抱え込む。

各 subagent に context として渡す素材:

- `<spec_dir>/spec.md` (必須)
- `<spec_dir>/{plan.md, tasks.md, data-model.md, research.md, contracts/, quickstart.md, checklists/}` (存在分すべて)
- `docs/domains/<domain>/charter.md`
- `docs/domains/_overview.md` (存在すれば)
- `docs/glossary.md`
- `.specify/memory/constitution.md`
- `docs/decisions/*.md` で `status: accepted` のもの: **header (frontmatter + `# Title`) + `## Decision Outcome` + `## Confirmation` section のみ** を context として提供 (Context / Considered options / Pros&Cons は除外、resolves C-2-b shift-left)
- **前回 design-gate.md が存在する場合** (`<spec_dir>/design-gate.md`): Critical / High findings の一覧を "Previous gate findings" として context に追加。reviewers はこれを参照し "resolved from prev / unresolved from prev / new" を finding ごとに付記する

**clean-context isolation の意味**: subagent は本 skill のメインスレッドの会話履歴を一切見ない。reviewer は frontmatter `tools: Read, Grep, Glob` で Edit/Write も禁止 (read-only)。

全トラックの完了を待機する。**reviewer は read-only なので自分で出力を保存できない。**
本 skill が各トラックの返り値を `<spec_dir>/<track-name>.md` (Track A は `<spec_dir>/analyze.md`) に Write する。

いずれかのトラックが結果を返さなかった場合は当該トラックを 1 回だけ retry し、再失敗なら
verdict の `tracks.<name>.status: error` を記録する。**他トラックが PASS でも全体 verdict は `error`**
(silent PASS にしない)。

### Phase 2: 集約 — `<spec_dir>/design-gate.md`

```markdown
# Design Gate: <spec.md title>

**Run**: <ISO 8601>
**Spec**: specs/<spec_dir>/spec.md
**Domain**: <domain>
**Charter**: docs/domains/<domain>/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer[, optional reviewers] (parallel clean-context subagents)

## Verdict

| Track                 | Critical | High | Medium | Low |
| --------------------- | -------- | ---- | ------ | --- |
| analyze               | <n>      | <n>  | <n>    | <n> |
| po-reviewer           | <n>      | <n>  | <n>    | <n> |
| architecture-reviewer | <n>      | <n>  | <n>    | <n> |
| **Total (dedup)**     | **<N>**  | <n>  | <n>    | <n> |

_(前回 gate が存在する場合のみ表示)_

|                      | Critical | High  |
| -------------------- | -------- | ----- |
| Resolved from prev   | <r>      | <r>   |
| Unresolved from prev | <u>      | <u>   |
| New in this run      | <new>    | <new> |

**Status**: <PASS | FIX_REQUIRED>
**Next**: <Critical=0 なら "status: tasking → implementing 昇格、/cl-implement 起動可能" | "Fix Critical 指摘を解消してから再実行">

## Critical (Total: <N>)

### C-001 — <title> [origin: po | analyze | architecture] [new | resolved | unresolved from prev]

- **Where**: spec.md US-2 / plan.md L42 / tasks.md SH-005
- **Issue**: <reviewer 出力をそのまま>
- **Why critical**: <根拠>
- **Action**: <修正提案>

...

## High / Medium / Low

...

## Track raw outputs

<details>
<summary>analyze</summary>

<full output、または分量が大きい場合は `analyze.md` へのリンク>
</details>

<details>
<summary>po-reviewer</summary>
...
</details>
```

### Phase 3: 重複排除 (dedup) — fully-automated by default (resolves C-3-b)

各トラックが同一根本原因を別 finding として上げる可能性がある。**AskUserQuestion を使わず**機械的 dedup を完全自動で実行する:

1. **Automated dedup** (常時実行):
   - 集約 key 優先順位:
     1. **同一 `path:line`** (spec.md / plan.md / tasks.md 内) → 集約候補
     2. **同一 `FR-NNN` / `SC-NNN` 参照** → 集約候補
     3. **同一 `Principle X` 参照** → 集約候補
     4. **一行サマリの Levenshtein 距離 < 5** → 集約候補 (**Critical severity には適用しない**)
   - **集約後 finding の `Where` / `Issue` は全候補の union** で記録する (例: `Where: spec.md:42, plan.md:90`)。片方の location のみ残すことを禁止
   - 集約された findings は dedup_log にペアで記録
2. `--no-auto-dedup` 指定時のみ各ペアで AskUserQuestion を実行 (opt-in)
3. dedup 結果を Total 行に反映、`<spec_dir>/.gate-verdict-design.json` の `dedup_log` 配列に記録

### Phase 4: 集計と enforcement

各トラック出力 (`<spec_dir>/analyze.md`, `po-reviewer.md`, `architecture-reviewer.md`, optional reviewer 分) に対して:

1. `gate_common::viewpoint_coverage_check <md>` を実行、A-H 欠落があれば warning (gate fail にはしない、reviewer 品質可視化)
2. `gate_common::cascade_enforce <md>` を実行、0 件確認なし Critical を High に機械的降格。降格 count を verdict に記録

### Phase 4b: JSON verdict emit

`<spec_dir>/.gate-verdict-design.json` を `gate_common::verdict_emit` で生成:

```json
{
  "gate": "design",
  "run": "<ISO 8601>",
  "spec_dir": "specs/<spec_id>",
  "spec_id": "<spec_id>",
  "tracks": {
    "analyze": {"status": "ok|error", "raw_out": "analyze.md", "viewpoint_missing": [], "cascade_demotions": 0},
    "po-reviewer": {"status": "ok", "raw_out": "po-reviewer.md", "viewpoint_missing": [], "cascade_demotions": 0},
    "architecture-reviewer": {"status": "ok", "raw_out": "architecture-reviewer.md", "viewpoint_missing": ["G"], "cascade_demotions": 1}
  },
  "severity_counts": {"critical": 0, "high": 3, "medium": 2, "low": 5},
  "fr_coverage": [{"fr": "FR-007", "covered": true, "by": ["spec.md:42", "plan.md:90"]}],
  "viewpoint_coverage": {"A": "Critical:0 High:1", "B": "該当なし: read-only", "C": "Critical:1 High:0", ...},
  "dedup_log": [{"merged": ["po-C-001", "arch-C-002"], "key": "FR-007"}],
  "verdict": "PASS|FIX_REQUIRED|ERROR"
}
```

### Phase 5: Status 遷移判定

```bash
bash .specify/scripts/status-transition.sh \
  --gate-transition "$spec_dir" design tasking implementing
```

- verdict=PASS かつ critical=0 → tasking → implementing に遷移、design-gate.md Status "PASS"
- verdict=FIX_REQUIRED:
  - 元 status が `tasking` → 据置
  - 元 status が `implementing` → **`tasking` に降格** (`status-transition.sh --downgrade`) し、完了通知に `[warn: status downgraded implementing → tasking]` を記録
  - design-gate.md Status "FIX_REQUIRED"
- verdict=ERROR (いずれかの track が retry 後も結果を返さない) → 状態据置、design-gate.md Status "ERROR"

### Phase 6: 完了通知

```
✓ /cl-design-gate 完了
  - spec dir: <spec_dir>
  - tracks: <N> 並列 (analyze + po + architecture[ + optional])
  - critical (total dedup): <N>
  - verdict: <PASS|FIX_REQUIRED>
  - status: <tasking → implementing | tasking 据置>
```

## Idempotency

- 同一 spec_dir で再実行可能 (毎回 design-gate.md を新規生成、過去版は `design-gate.md.<TS>` に rename して保存)
- status が `implementing` 以降でも再レビュー可 (status は変更しない)

## Failure modes

- subagent エラー (context overflow / 結果が返らない) → 当該 track 単独で retry 1 回、再失敗時は
  `tracks.<name>.status: error` を記録し、**全体 verdict を `error` にする** (silent PASS にしない)
- Track A `error` + 他 track が FIX_REQUIRED → 全体 FIX_REQUIRED (or ERROR)
- agent registry に po-reviewer / architecture-reviewer が登録されていない (gate_common::registry_assert_agent fail) → halt with "/spec-gate bootstrap を再実行してください"
- 全 track 失敗 → halt (status 変更なし)
- domain charter missing → halt

## Acceptance criteria

1. `<spec_dir>/design-gate.md` が存在
2. `<spec_dir>/.gate-verdict-design.json` が存在し `gate_common::verdict_validate` を通過
3. 全トラックの出力が `<spec_dir>/<track-name>.md` に記録されている (error の track は明示)
4. Verdict が PASS / FIX_REQUIRED / ERROR で明記
5. Critical 件数が dedup 後の値で表示
6. PASS の場合のみ spec.md frontmatter `status:` が `implementing` に遷移
7. design-gate.md に subagent の raw output が `<details>` 内に保存されている
8. いずれかの track が error のとき verdict が ERROR (not silently PASS)
9. viewpoint coverage の missing カテゴリが verdict JSON に記録される
10. cascade_demotions count が verdict JSON に記録される
