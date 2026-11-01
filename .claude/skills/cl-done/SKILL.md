---
name: cl-done
description: PR を提出する。tasks 100% / code-gate PASS / pr-gate Critical=0 を検証し、format → commit → push → PR create を実行して status を reviewing → completed に遷移させる。
argument-hint: [spec_dir]
allowed-tools: Read Write Edit Bash Glob Grep AskUserQuestion
---

# cl-done

PR 提出の最終 wrapper。`/cl-pr-gate` PASS 後に手動起動。以下の stage を順に検証・実行し、すべて成功で `status: reviewing → completed` に遷移する。

## When to invoke

- `/cl-pr-gate` で Critical=0 になった直後 (status: reviewing)

## Inputs

- `<spec_dir>` (optional)
- `--draft`: Draft PR として作成 (`gh pr create --draft` or `glab mr create --draft`)
- `--night`: 夜間の自走 (`/cl-night`) から呼ばれたとき。Stage 0〜5 (format → commit) までを行い、Stage 6〜8 の代わりに台帳へ記録する (下の「night モード」)。規則の正本は `docs/ai-workflow/night-run.md`

## night モード (`--night`)

- Stage 4 で format の diff が出ても確認せず、そのまま commit に含める
- Stage 5 の commit は単独のコマンドで行う (`git commit … && git push` のように連結しない)
- **Stage 6 (push / PR)・Stage 7 (外部チケット)・Stage 8 (status 遷移) を行わない。** status は `reviewing` のまま (朝の `/cl-land` がマージ後に completed にする)
- 代わりに、台帳 (`.specify/night/current` が指すファイル) の `## <spec_dir>` 節に `end: <git rev-parse HEAD>` と gate の結果 (各 verdict JSON の round / iter / severity_counts) を書く
- 完了通知は `✓ /cl-done --night: <spec_dir> committed <sha>` の 1 行

## 6-Stage Gate

各 stage の失敗で halt。前 stage に戻って修正することを案内。

### Stage 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || exit 1
spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}") || exit 2

# **completed を先に判定する。** `phase0_check_status "reviewing"` だけを掛けると、
# 二重実行時にユーザが受け取るのは冪等性の案内ではなく status mismatch エラーになる。
current=$(gate_common::phase0_check_status "$spec_dir" "reviewing,completed") || exit 1
if [ "$current" = "completed" ]; then
  echo "既に完了済です ($spec_dir)。PR の再作成は 'gh pr edit' で手動に行ってください。"
  exit 0
fi
```

### Stage 1: tasks.md 100% 検証

```bash
gate_common::tasks_complete_check "$spec_dir" || halt "未完了タスクあり (上の一覧を参照)"
```

Stage 0〜3 は 1 回の bash で続けて実行する (プロセスを起こす回数を減らす。CLAUDE.md)。

### Stage 2: code-gate verdict 確認 (machine-checkable)

```bash
gate_common::verdict_require_pass "$spec_dir/.gate-verdict-code.json"
rc=$?  # 0 = PASS / 5 = gate hard-stop / 3 = missing / 2 = schema NG
[ "$rc" -eq 0 ] || halt "code-gate が PASS していません"
```

**`verdict_validate` を使ってはならない。** あれは schema 検査であり、`FIX_REQUIRED` を正当な verdict として exit 0 で通す。「gate を通ったか」の判定は `verdict_require_pass` だけが行う。

### Stage 3: pr-gate verdict 確認 (hard gate)

```bash
gate_common::verdict_require_pass "$spec_dir/.gate-verdict-pr.json"
rc=$?
[ "$rc" -eq 0 ] || halt "/cl-pr-gate を再実行して verdict=PASS かつ critical=0 にしてください"
```

`verdict_require_pass` は `verdict != "PASS"` / `critical > 0` のいずれでも exit 5 を返す。**Critical を残したまま done を通す経路は存在しない。** Critical が残っている場合は ADR 起票 + spec 範囲調整を経て再度 pr-gate を通す。

### Stage 4: Format

`docs/discovery.md` の "Build / Test / Lint" 表の「整形」行の agent 用コマンドを、`touched-files.txt` のうち存在するファイルだけに掛ける。全体に掛けない (他 spec の verdict JSON まで書き換わる)。`pnpm` / `npx` 経由で呼ばない。

```bash
tr -d '\r' < "$spec_dir/touched-files.txt" | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done \
  | xargs -r node node_modules/prettier/bin/prettier.cjs --write --ignore-unknown
```

format 後に diff が出ていれば AskUserQuestion で「format 結果を含めて commit しますか?」を確認する (night モードでは確認せず含める)。

### Stage 5: Commit

1. `git status` で staging されていない変更を確認
2. `git add` で touched-files.txt 記載のファイルを stage (or 全部)
3. Conventional Commits format で commit message を生成:
   ```
   <type>(<scope>): <subject>
   
   <body>
   
   Spec: specs/<spec_dir>/spec.md
   Linear: <PRJID>-NNN  (frontmatter linear 値、null なら omit)
   ```
   - `<type>`: feat / fix / refactor / chore (spec.md frontmatter or AskUserQuestion で決定)
   - `<scope>`: spec.md frontmatter `domain` 値
   - `<subject>`: spec.md title を **`gate_common::truncate_subject "$title" 50`** に通す。
     **cap は 50 byte であって 50 文字ではない。** 自前で切らずに必ずこの関数を使う

4. `git commit` 実行 (pre-commit hook が動く)

### Stage 6: Push + PR create

1. `git push -u origin <branch>` (upstream 未設定なら -u 付き)
2. リモートが GitHub なら `gh pr create`、GitLab なら `glab mr create` を実行
3. PR body は以下テンプレート:

   ```markdown
   ## Summary
   <spec.md の Summary section から抽出>

   ## Spec
   - Spec ID: <spec_id>
   - Domain: <domain>
   - Targets: <targets>

   ## Gates passed
   - design-gate: PASS (Critical=0) — `.gate-verdict-design.json`
   - code-gate: PASS (MUST_FIX=0, iterations: <N>) — `.gate-verdict-code.json`
   - pr-gate: PASS Round <N> (Critical=0) — `.gate-verdict-pr.json`

   ## Files changed
   <touched-files.txt の主要ファイル>

   ---
   🤖 Generated with Spec-Driven Gating Workflow
   ```

4. `--draft` 指定があれば draft PR で create
5. 作成された PR URL を表示

### Stage 7 (任意): 外部チケット連携

spec.md frontmatter `linear:` 値が non-null なら:

- Linear: Linear の MCP (`linear`) の comment 作成 tool で PR URL + status を投稿
- GitHub Issue: `gh issue comment` で同上
- 失敗時は warning のみ (halt しない)

### Stage 8: Status 遷移 + 完了通知

```bash
bash .specify/scripts/status-transition.sh \
  --gate-transition "$spec_dir" pr reviewing completed
```

`--gate-transition` mode は再度 verdict JSON を validate するため、Stage 3 と二重 protection。

```
✓ /cl-done 完了
  - spec dir: <spec_dir>
  - PR URL: <url>
  - status: reviewing → completed
  - Linear/Issue updated: <yes/no>
```

## Idempotency

- 既に completed 状態なら "既に完了済です" を表示して終了 (overwrite しない)
- PR 再作成は本 skill の責務外 (`gh pr edit` を手動で)

## Failure modes

- 各 stage 失敗時の対応:
  - Stage 1 unchecked task → `/cl-implement` 再実行を案内
  - Stage 2/3 verdict not PASS → 対応 gate skill を再実行
  - Stage 4 format → 手動修正
  - Stage 5 commit (pre-commit hook 失敗) → hook の指摘を表示、修正を求める
  - Stage 6 push failure → 認証 / merge conflict を案内
  - Stage 6 PR create 失敗 → リモート種別と auth を確認
  - Stage 7 外部チケット失敗 → warning のみ、本体処理は続行

## Acceptance criteria

1. すべての stage が PASS している
2. Stage 3 で `.gate-verdict-pr.json` が schema validation 通過 + critical=0 + verdict=PASS (hard gate)
3. PR が作成された URL が表示
4. spec.md frontmatter `status` が `completed` に遷移 (status-transition.sh --gate-transition 経由)
5. (Linear/Issue 連携指定時) コメントが投稿されたか warning で明示
6. commit subject が `gate_common::truncate_subject` 経由で 50 byte 以内に収まっている
7. Critical 残存で done を通す経路がない
