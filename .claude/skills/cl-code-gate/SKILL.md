---
name: cl-code-gate
description: 実装の self-review gate。touched files を lint / test / convention で検証し、MUST_FIX があれば implementer で auto-fix loop を回す。PASS で implementing → reviewing に昇格する。
argument-hint: [spec_dir]
allowed-tools: Read Write Edit Bash Glob Grep Agent
context: fork
agent: general-purpose
background: true
effort: high
---

# cl-code-gate

Implementation Phase の **self-review gate**。`/cl-implement` 完了後に auto-chain で起動される (手動起動も可)。touched files を **lint / test / convention 専任 reviewer + stack-conditional optional reviewer** で検証し、`MUST_FIX` 指摘があれば `implementer` subagent で **auto-fix loop** を最大 3 iteration 実行。すべて解消で `implementing → reviewing` に昇格。

## 実行モデル

共通規則の正本は AGENTS.md の「実行モデル (context 管理)」節。本 skill 固有の点:

- 本 skill は **background の fork** で動く。呼び出し元の会話は見えず、入力は引数とファイルだけである
- **人間には質問できない** (fork には `AskUserQuestion` が渡らない)。判断が要る分岐は halt して理由を返す
- reviewer と implementer は Agent ツールで起動し、**バックグラウンドで返る**。起動したらターンを終え、報告が届いてから次の段に進む (Phase 3 の直列順もこの形で守る)
- **最終メッセージは Phase 7 の完了通知だけにする。** reviewer の生出力・diff・findings 本文は含めない。main に届くのは最終メッセージだけで、そこに積んだ分だけ main の context が埋まる

## 責務スコープ (vs pr-gate)

| Gate | Scope | Reviewer 構成 |
|---|---|---|
| **code-gate (本 skill)** | touched files に対する **静的検査 + テスト + 命名 / module 配置** | `lint-agent`, `test-agent`, `convention-reviewer` (+ stack 別 lint-like) |
| **pr-gate (別 skill)** | diff `<base>...HEAD` 全体への **adversarial Critical 検証** | `security-reviewer`, `architecture-reviewer`, `po-reviewer` (+ system scope reviewer) |

**Overlap 排除原則**: code-gate は security / architecture / po 系 reviewer を **起動しない** (pr-gate の責務)。stack 別追加 reviewer は lint-like に限定する。

**reviewer の選定は `gate_common::reviewers_filter` に任せる。`registry_filter_agents` を直接呼んではならない** — あちらは agent ファイルの存在しか見ないため、存在する reviewer が全部起動する。`.specify/spec-gate/reviewers.yml` の `enabled` / `gates` / `auto_invoke_patterns` / `exclude_patterns` を適用するのは `reviewers_filter` 側である。

## When to invoke

- `/cl-implement` から auto-chain (default ON)
- 手動: 実装後の self-review を再実行したい時

## Inputs

- `<spec_dir>` (optional): 省略時 branch 名から推定
- `--max-iter N` (default: 3): auto-fix loop の最大回数
- `--no-auto-fix`: MUST_FIX を検出しても auto-fix を実行せず、findings を表示して halt
- `--allow-partial-tasks`: tasks.md に未完了項目が残っていても続行する
- `--base <commit>` (optional): Phase 1 の diff 起点。省略時は下の手順で解決する
- `--lint-cmd <cmd>` / `--test-cmd <cmd>` (optional): lint-agent / test-agent に渡す override

## Steps

### Phase 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || exit 1
spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}") || exit 2
# **reviewing も受理する。** pr-gate の指摘を直したあと lint / test を通し直す経路が
# 必要であり、implementing 固定にすると一度 PASS した spec は二度と通せない。
# reviewing から入ったときは status を動かさない (Phase 6 参照)。
entry_status=$(gate_common::phase0_check_status "$spec_dir" "implementing,reviewing") || exit 1
gate_common::phase0_check_charter "$spec_dir" || exit 1
for a in implementer lint-agent test-agent convention-reviewer; do
  gate_common::registry_assert_agent "$a" \
    || halt "$a が見つかりません。.claude/agents/$a.md の存在と .specify/.agents-registry.yaml の entry を確認してください"
done
```

1. spec_dir 解決
2. `<spec_dir>/spec.md` の frontmatter `status` が `implementing` か `reviewing` であることを確認 (`reviewing` は再実行)
3. `tasks.md` の全タスクが `[x]` であることを確認:
   ```bash
   gate_common::tasks_complete_check "$spec_dir" \
     || halt "未完了タスクがあります。すべての [ ] を [x] にしてから再実行してください。--allow-partial-tasks で強制実行可"
   ```
   未チェック行は stderr に列挙され、件数が stdout に返る。`--allow-partial-tasks` 指定時は warning に落として続行する。
4. `git status` で working tree に diff があることを確認 (なければ "実装すべき変更がありません" で halt)
5. 必須 actor と convention-reviewer の registry validation

### Phase 1: Diff scope の決定

```bash
# **CR と空行を除いて sort -u してから comm に渡す。**
# comm は入力が同じ規則で整列していることを前提とし、一致しない行を黙って落とす。
normalize() { tr -d '\r' | sed '/^[[:space:]]*$/d' | sort -u; }

# **base_commit を必ず解決する。** 未定義のまま `"$base_commit..HEAD"` を使うと
# git が全履歴を差分とみなすか無効な revision で落ちる。
# 起点は **前 feature の最後のコミット** — base ブランチが前 feature のマージ前を
# 指していると `base...HEAD` が前 feature の squash コミットを丸ごと含む。
base_commit="${ARG_BASE:-}"
if [ -z "$base_commit" ]; then
  base_branch=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null \
                | sed 's|^origin/||')
  base_branch="${base_branch:-$(git rev-parse --verify --quiet develop >/dev/null && echo develop || echo main)}"
  base_commit=$(git merge-base "$base_branch" HEAD 2>/dev/null || true)
fi
[ -n "$base_commit" ] || halt "diff の起点を解決できません。--base <commit> を指定してください"

# **実装がコミット済みなら base との差分を使う** — `git diff HEAD` は未コミット変更しか見ない。
# diff 本文は reviewer に貼らず、ファイルに 1 回だけ書き出してパスを渡す (Phase 3)。
if [ -n "$(git status --porcelain)" ]; then
  diff_range=HEAD
else
  diff_range="$base_commit..HEAD"
fi
diff_files=$(git diff --name-only "$diff_range" | normalize)
git diff "$diff_range" > "$spec_dir/.code-gate.diff"
touched_files=$(cat "$spec_dir/touched-files.txt" 2>/dev/null | normalize || true)
if [ -n "$touched_files" ]; then
  scope=$(comm -12 <(echo "$diff_files") <(echo "$touched_files"))
else
  scope="$diff_files"
fi
echo "$scope" > "$spec_dir/.code-gate-scope.txt"

# **落ちた行を報告する。** 黙って絞ると検査が 0 件になっていることに気付けない。
comm -23 <(echo "$diff_files") <(echo "$touched_files")  # diff にあり touched に無い
comm -13 <(echo "$diff_files") <(echo "$touched_files")  # touched にあり diff に無い

# **scope が空なら halt。** 0 件の入力で reviewer を走らせると、
# 全員が「指摘なし」を返し verdict が PASS になる — 検査していないのに通る。
[ -s "$spec_dir/.code-gate-scope.txt" ] \
  || halt "diff scope が 0 件です。base ($base_commit) と touched-files.txt を確認してください"
```

> `halt "<message>"` は本 SKILL の**擬似コード**であり、シェル関数ではない。
> メッセージを出して gate を中止する、という意味に読むこと。そのまま貼ると
> `command not found` になる。

reviewer に渡す scope は `diff_files ∩ touched_files` (touched-files.txt があれば intersect、なければ diff_files 全部)。

### Phase 2: reviewer の選定

- **常駐**: `lint-agent`, `test-agent`, `convention-reviewer` + `implementer` (Phase 5 で起動)
- **stack 別追加**: lint-like のみ。**採否は `.specify/spec-gate/reviewers.yml` が決める**

**候補を全部渡してはならない。`reviewers_filter` に絞らせる。**

```bash
active=$(gate_common::reviewers_filter code-gate "$spec_dir/.code-gate-scope.txt" \
  lint-agent test-agent convention-reviewer \
  a11y-reviewer database-reviewer ux-reviewer platform-boundary-reviewer)
```

上の候補リストは `reviewers.yml` で `gates` に `code-gate` を含む全 reviewer を含める (`reviewers_filter` は渡された候補しか絞らない。登録する箇所の一覧は `/cl-add-reviewer` の Phase 3)。

絞った理由は stderr に 1 行ずつ出る。**Phase 4 の集約に「起動しなかった reviewer とその理由」を必ず転記する** — 黙って絞ると「起動しなかった」と「起動して 0 件だった」を区別できない。

`security-reviewer` / `architecture-reviewer` / `po-reviewer` は **起動しない** (pr-gate 専任)。`a11y-reviewer` / `ux-reviewer` も `reviewers.yml` で `gates: [pr-gate]` である。

### Phase 3: reviewer 起動 (1 iteration)

**lint track と test track は直列に走らせる。reviewer 系は並列でよい。**

- **判定は exit code を正とする。JSON の `success` を見てはならない** — worker の起動が待ちを超えてテストが 0 件実行になったとき、exit code は 1 でも JSON reporter は `success: true` / `numFailedTests: 0` を返す
- `Errors` / `Unhandled Errors` が 0 件でないなら失敗として扱う
- 直列にする理由: ルール検証系が違反サンプルを `src/` 配下へ一時展開するため、並列に走った検出器がそれを実コードの違反として拾う

| Track | Agent type | 観点 | 起動順 |
|---|---|---|---|
| `lint-agent` | `subagent_type: lint-agent` — stdout に JSON で violations | 静的解析 / style 違反 | **1 番目** |
| `test-agent` | `subagent_type: test-agent` — stdout に JSON で pass/fail + failed test names | テスト red 検出 + coverage | lint track の後 |
| `convention-reviewer` | `subagent_type: convention-reviewer` | 命名 / module 配置 / lint hookup | **`lint-agent` の後** |
| (stack 別 +α) | Agent ツール | 該当時 | 並列可 |

**`convention-reviewer` は `lint-agent` の後に起動し、その stdout JSON を context でそのまま渡す。** `convention-reviewer` は自分で lint を実行しないため、渡さないと lint 観点が空になる。**`exit_code` を落とさずに渡すこと** — `convention-reviewer` は「lint が非ゼロ exit で終わったこと自体を Critical とする」判定をこの値で行い、それが `gate-common.sh` の機械 gate (`PASS` かつ `critical>0` は exit 5) に直結する。

各 reviewer に渡すのはパスだけ (AGENTS.md の実行モデル。例外は下の lint-agent の JSON):

- `<spec_dir>` — `{spec,plan,tasks}.md` を reviewer が Read する
- `<spec_dir>/.code-gate-scope.txt` (touched files の絞り込み結果)
- `<spec_dir>/.code-gate.diff` (Phase 1 で書き出した diff。reviewer の多くは Bash を持たず自分で diff を取れない)
- `.specify/memory/constitution.md`
- `docs/domains/<domain>/charter.md`
- **`convention-reviewer` のみ**: `lint-agent` の stdout JSON 全体 (小さいのでこれだけは本文で渡す)
- **`test-agent` のみ**: `scope: touched-files` か `scope: full` を**明示的に指示する**。
  test-agent は「自分が最終 iteration か」を観測できない (その回の結果が出る前に走る) ため、
  **判断は invoker が行う**。収束見込みの回、`--max-iter` 最終回、および PASS を出す前は `full`

### Phase 4: 集約 — findings の集計

各 reviewer 出力を集約し markdown table 化。**lint-agent / test-agent は JSON 直結**で severity 翻訳:

- lint `error` → MUST_FIX / `warning` → SHOULD_FIX / `info` → CONSIDER
- test failure → MUST_FIX (`failed_tests[]` から)
- convention-reviewer の Critical / High → MUST_FIX / SHOULD_FIX

**MUST_FIX と `severity_counts` の対応を必ずこの規則で埋める** (ここを決めないと verdict が「critical 0 なのに MUST_FIX 5 件」という読めない状態になる):

| 出所 | `severity_counts` への計上 |
|---|---|
| lint `exit_code != 0` それ自体 | `critical` +1 (convention-reviewer が Critical にする経路) |
| lint `error` / test failure | `must_fix` に計上。`high` にも計上する |
| lint `warning` / reviewer High | `high` |
| lint `info` / reviewer Medium・Low | `medium` / `low` |

`severity_counts.must_fix` は **MUST_FIX の総数** であり、auto-fix loop の break 条件そのものである。`critical` とは別に必ず出す。

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

**reviewer 出力は本 skill が Write する。** reviewer は `tools: Read, Grep, Glob` なので自分では保存できない。各 reviewer の返り値を `<spec_dir>/<reviewer>.code-gate.md` に Write してから、そのパスに対して次を実行する:

1. `gate_common::viewpoint_coverage_check <md>` — A-H 欠落 warning
2. `gate_common::cascade_enforce <md>` — 0 件確認なし Critical を High に降格 + marker

**書く前に実行してはならない。** 両関数はファイル不在で return 3 を返し、cascade 降格と viewpoint 検証が黙って空振りする (降格されない Critical がそのまま verdict に載る)。

パスに `.code-gate` を挟むのは、同じ reviewer が design-gate / pr-gate でも走るため。修飾しないと後の gate が前の gate の raw output を上書きする。

### Phase 4b: JSON verdict emit

`gate_common::verdict_emit "$spec_dir" code "$verdict_json"` で `<spec_dir>/.gate-verdict-code.json` を生成:

```json
{
  "gate": "code",
  "run": "<ISO>",
  "spec_dir": "specs/<spec_id>",
  "spec_id": "<spec_id>",
  "iter": 1,
  "severity_counts": {"critical": 0, "high": 3, "medium": 2, "low": 5, "must_fix": 0},
  "must_fix_findings": [
    {"mf_id": "MF-001", "where": "src/a.ts:42", "origin": "lint",
     "rule": "no-unused-vars", "message": "...", "severity": "error"}
  ],
  "touched_files": [{"path": "src/a.ts", "sha": "<git blob sha>"}],
  "fr_coverage": [{"fr": "FR-007", "covered": true, "by": ["src/a.ts:42"]}],
  "viewpoint_coverage": {
    "A": "該当なし: pr-gate 専任", "B": "該当なし: pr-gate 専任",
    "C": "該当なし: pr-gate 専任", "D": "該当なし: pr-gate 専任",
    "E": "該当なし: pr-gate 専任", "F": "High:2 Medium:1",
    "G": "該当なし: optional reviewer なし", "H": "Medium:1 Low:0"
  },
  "tracks": {
    "lint-agent": {"violations": 5, "exit_code": 1,
                   "detectors": ["lint", "typecheck", "depcruise", "check:constitution"]},
    "test-agent": {"passed": 142, "failed": 3, "exit_code": 1, "scope": "touched-files"},
    "convention-reviewer": {"viewpoint_missing": [], "cascade_demotions": 0,
                            "lint_input": "lint-agent"}
  },
  "skipped_reviewers": [
    {"name": "a11y-reviewer", "reason": "gates=['pr-gate'] に code-gate が無い"}
  ],
  "cascade_demotions": 0,
  "iter_history": [
    {"iter": 1, "must_fix": 5, "skipped": 0, "error": 0},
    {"iter": 2, "must_fix": 2, "skipped": 1, "error": 0}
  ],
  "verdict": "PASS|FIX_REQUIRED"
}
```

**`iter_history[]` の各要素は `{iter: int, must_fix: int}` を必ず持つ** (`skipped` / `error` は任意)。ここに `must_fix_after_promotion` のような場当たりキーを足さない — 再実行時の iter の復元と完了通知が `must_fix` を読めなくなる。`gate_common::verdict_validate` がこの形を検査して warning を出す。

**`tracks` の 3 フィールドは後から検証するために必ず埋める:**

- `lint-agent.detectors` — 実際に走らせた検出器の名前。**`test:rules` (ルール検証) を含めてはならない** (code-gate では実行しない)。**空 / 欠落は「黙って落ちた」を意味する** ので、そのまま PASS にしない
- `test-agent.scope` — `touched-files` または `full`。**`verdict: PASS` の iteration は必ず `full` でなければならない。** `PASS` かつ `touched-files` は subset だけで通したことを意味し、無効である
- `skipped_reviewers[]` — 起動しなかった reviewer と `reviewers_filter` が出した理由。**0 件なら `[]` を明示する** (記録し忘れと区別するため)

### Phase 5: Auto-fix loop (MUST_FIX > 0 かつ `--no-auto-fix` でないとき)

各 iteration は以下を **1 単位**として定義:

- **START**: iter N 開始時の `.gate-verdict-code.json` (Phase 4b で emit 済) を input
- **BODY**: `implementer` subagent を Agent ツールで **fix モード**で 1 回起動
  - context: `mode: fix` / `spec_dir` / `iter` / 入力 `<spec_dir>/.gate-verdict-code.json` だけ。verdict JSON / `touched-files.txt` / spec.md / plan.md / tasks.md は implementer が自分で Read する。**本文も規則も貼らない** — 修正の規則と action log の形は `implementer.md` が正本である
  - 任務: `must_fix_findings[]` を順に処理、touched files を更新、`code-gate.md.iter<N>.implementer.json` を Write
  - **戻ってきた action log を読む。** `resolutions[]` の `status: skipped` / `error` を
    数え、`iter_history[N]` に `skipped` / `error` として記録し、Phase 7 の完了通知にも出す。
    **読まずに次の iteration へ進んではならない** — implementer が「ambiguous なので
    人間に上げる」と言っているのに、それが誰にも届かないまま max_iter まで回る
- **TAIL**: Phase 3 → Phase 4 → Phase 4b を再実行
- **END**: `severity_counts.must_fix == 0` ⇒ break PASS、それ以外 ⇒ iter N+1

```
for iter in 1..max_iter:
  invoke_implementer(verdict.json)
  rerun_reviewers()                     # ← test-agent には「収束見込み」を渡す
  if verdict.severity_counts.must_fix == 0: break PASS
# max_iter に達したら FIX_REQUIRED で終える
```

**収束した回は test を全件で走らせる。** `must_fix == 0` を見てから break すると、その回の test は subset で走り終わっている。したがって TAIL の Phase 3 では **直前の iter の `must_fix` が 0 に近いか、`--max-iter` 最終回か**を `test-agent` に渡し、`test-agent` 側が全件に切り替える。break 時点で `tracks.test-agent.scope != "full"` なら、**全件で 1 回だけ再実行してから PASS にする**。

これを守らないと Phase 4b の「`verdict: PASS` の iteration は必ず `full`」という自らの規則を満たせない。

loop の上限は `--max-iter` だけで決まる。以前あった「3 連続で MUST_FIX が減らなければ halt」(cascade exhaustion) は、最小発火 iter が 3 で既定の `--max-iter 3` と同じ所で止まるため実質何もしておらず、削除した。`iter_history` は verdict JSON の配列で永続化し、再実行時に復元する (完了通知と収束の確認に使う)。

### Phase 6: Status 遷移判定

**verdict が PASS のときだけ遷移コマンドを実行する。** 無条件に実行してはならない。

```bash
if [ "$entry_status" = "reviewing" ]; then
  echo "reviewing から再実行したため status は動かしません"
elif [ "$verdict" = "PASS" ]; then
  bash .specify/scripts/status-transition.sh \
    --gate-transition "$spec_dir" code implementing reviewing
else
  echo "verdict=$verdict のため status を進めません (implementing 据置)"
fi
```

- entry_status=reviewing (再実行) → 据置
- verdict=PASS → implementing → reviewing
- verdict=FIX_REQUIRED → 状態据置、code-gate.md に "MUST_FIX (max_iter reached)" を記録

`--gate-transition` は内部で `gate_common::verdict_require_pass` を通すので、万一 FIX_REQUIRED のまま呼んでも exit 5 で止まる。上の `if` は**二重の保険**であって、これがあるから遷移コマンドを無条件に書いてよいわけではない。

### Phase 7: 完了通知

```
✓ /cl-code-gate 完了
  - spec dir: <spec_dir>
  - diff scope: <K files> (base: <base_commit>)
  - iterations: <N> (auto-fix loop)
  - implementer: applied <A> / skipped <S> / error <E>   ← S>0 なら人間の判断が必要
  - test scope (最終 iter): <full | touched-files>
  - 起動しなかった reviewer: <name: 理由, ...> (0 件なら "なし")
  - verdict: <PASS | FIX_REQUIRED>
  - status: <implementing → reviewing | 据置>
  - verdict JSON: <spec_dir>/.gate-verdict-code.json
  - 次のアクション: /clear してから /cl-pr-gate <spec_dir> (PASS 時)
```

## Idempotency

- 再実行可能 (各 iteration を `code-gate.md.iter<N>`、最終を `code-gate.md` に保存)
- 既存 `code-gate.md` は `code-gate.md.<TS>` にバックアップしてから新規生成
- `iter_history` は verdict JSON に蓄積されているため、再実行時の iter 番号は最後の +1 から

## Failure modes

- lint / test コマンド検出失敗 (lint-agent / test-agent が exit 2) → 以下の順で自動探索する:
  1. `docs/discovery.md` の "Build / Test / Lint" 表の「agent 用」列
  2. `package.json` の `scripts.lint` / `scripts.test`
  3. `Makefile` の `lint:` / `test:` ターゲット

  全滅したら halt し、完了通知の代わりに次を返す (fork では人間に聞けない)。**コマンドの追記先は `docs/discovery.md` の表** — そこが agent 用コマンドの正本であり、次回の探索が step 1 で当たるようになる:

  ```
  ✗ /cl-code-gate NEEDS_INPUT
    - 理由: <lint | test> コマンドを解決できません (探索: discovery.md / package.json / Makefile)
    - 対処: docs/discovery.md の "Build / Test / Lint" 表の「agent 用」列にコマンドを追記して再実行
            (一度だけ試すなら --lint-cmd / --test-cmd)
  ```
- 必須 agent が registry に無い → halt with "`.claude/agents/<name>.md` の存在と `.specify/.agents-registry.yaml` の entry を確認してください"
- implementer の auto-fix が partial → 次 iter で残りに再挑戦
- `--max-iter` に達しても MUST_FIX が残る → FIX_REQUIRED で終え、最終 iter の verdict / code-gate.md を表示
- git diff が空 → halt

## Acceptance criteria

1. `<spec_dir>/code-gate.md` が存在し、最終 iteration の verdict が記録されている
2. `<spec_dir>/.gate-verdict-code.json` が `gate_common::verdict_validate` を warning なしで通過する
3. `severity_counts.must_fix` が存在し、`iter_history[]` の各要素が `{iter, must_fix}` を持つ
4. **PASS の場合のみ** `status:` が `reviewing` に遷移する (`reviewing` から再実行したときは据置)
5. 各 reviewer の raw output が `<spec_dir>/<reviewer>.code-gate.md` に保存され、それに対して `cascade_enforce` と `viewpoint_coverage_check` が実行されている
6. `verdict: PASS` の iteration の `tracks.test-agent.scope` が `full` である
7. FIX_REQUIRED で終えたときは iter_history の各 iter の must_fix が完了通知に出ている
8. security / architecture / po reviewer が起動されていない (`origin` field に存在しない)
9. implementer の `skipped` / `error` 件数が完了通知に出ている
