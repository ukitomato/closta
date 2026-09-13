---
name: {{prefix}}-done
description: PR 提出の最終 wrapper。6-stage gate (tasks 100% / code-gate PASS / pr-gate Critical=0 / format / commit / push / PR create) を順に検証・実行する。外部チケット (Linear / GitHub Issue) との連携も担当。status は reviewing → completed に遷移。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep AskUserQuestion
---

# {{prefix}}-done

PR 提出の最終 wrapper。`/{{prefix}}-pr-gate` PASS 後に手動起動。**6-stage gate** を順に検証・実行し、すべて成功で `status: reviewing → completed` に遷移。

## When to invoke

- `/{{prefix}}-pr-gate` で Critical=0 になった直後 (status: reviewing)

## Inputs

- `<spec_dir>` (optional)
- `--draft`: Draft PR として作成 (`gh pr create --draft` or `glab mr create --draft`)

## 6-Stage Gate

各 stage の失敗で halt。前 stage に戻って修正することを案内。

### Stage 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || exit 1
spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}") || exit 2
gate_common::phase0_check_status "$spec_dir" "reviewing" || exit 1
```

### Stage 1: tasks.md 100% 検証

```bash
unchecked=$(grep -cE '^\s*- \[ \]' "$spec_dir/tasks.md")
[ "$unchecked" -eq 0 ] || halt with "未完了タスクあり: <list>"
```

### Stage 2: code-gate verdict 確認 (machine-checkable)

```bash
gate_common::verdict_validate "$spec_dir/.gate-verdict-code.json"
rc=$?  # 0 = PASS, 5 = hard-gate violation, 3 = missing
[ "$rc" -eq 0 ] || halt
```

### Stage 3: pr-gate verdict 確認 (hard gate、resolves C-4-b)

```bash
gate_common::verdict_validate "$spec_dir/.gate-verdict-pr.json"
rc=$?
[ "$rc" -eq 0 ] || halt "/{{prefix}}-pr-gate を再実行して verdict=PASS かつ critical=0 にしてください"
```

verdict 検証で `severity_counts.critical > 0` または `verdict != "PASS"` は exit 5 で halt。

**`--defer-remaining` 経路は撤廃済** (decision #2)。Critical が残っている場合は別 spec / ADR + spec 範囲調整 を経て再度 pr-gate を通す。本 stage で defer による done 通過は不可能。

### Stage 4: Format

プロジェクトの format コマンドを実行 (`docs/discovery.md` から取得):

- TypeScript → `pnpm format` (prettier / biome)
- Python → `ruff format` or `black .`
- Flutter → `dart format .`
- Go → `gofmt -w .`

format 後に diff が出ていれば AskUserQuestion で「format 結果を含めて commit しますか?」を確認。

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
   - `<subject>`: spec.md title から **50 byte (NOT char) cap、UTF-8 grapheme cluster aware** で切断 (resolves C-3-f / item 6)

**Truncation アルゴリズム** (gate-common.sh 委譲):

```bash
subject=$(gate_common::truncate_subject "$title" 50)
```

実装詳細:
  1. byte 長 = `printf '%s' "$title" | wc -c`
  2. <= 50 ならそのまま
  3. > 50 → grapheme cluster boundary を尊重した上で 50-3 byte (= 47 byte) まで切詰し末尾に `…` (U+2026、3 byte) を付加
  4. truncate 後の末尾空白 / 句読点 (` ,.;:、。 `) は trim
  5. python3 `regex` パッケージ > perl `\X` > iconv fallback の順で grapheme 境界を判定

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

- Linear: `mcp__linear-server__create_comment` で PR URL + status を投稿
- GitHub Issue: `gh issue comment` で同上
- 失敗時は warning のみ (halt しない)

### Stage 8: Status 遷移 + 完了通知

```bash
bash .specify/scripts/status-transition.sh \
  --gate-transition "$spec_dir" pr reviewing completed
```

`--gate-transition` mode は再度 verdict JSON を validate するため、Stage 3 と二重 protection。

```
✓ /{{prefix}}-done 完了
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
  - Stage 1 unchecked task → `/{{prefix}}-implement` 再実行を案内
  - Stage 2/3 verdict not PASS → 対応 gate skill を再実行
  - Stage 4 format → 手動修正
  - Stage 5 commit (pre-commit hook 失敗) → hook の指摘を表示、修正を求める
  - Stage 6 push failure → 認証 / merge conflict を案内
  - Stage 6 PR create 失敗 → リモート種別と auth を確認
  - Stage 7 外部チケット失敗 → warning のみ、本体処理は続行

## Acceptance criteria

1. すべての 6 stage が PASS している
2. Stage 3 で `.gate-verdict-pr.json` が schema validation 通過 + critical=0 + verdict=PASS (hard gate)
3. PR が作成された URL が表示
4. spec.md frontmatter `status` が `completed` に遷移 (status-transition.sh --gate-transition 経由)
5. (Linear/Issue 連携指定時) コメントが投稿されたか warning で明示
6. commit subject が 50 byte 以内、UTF-8 grapheme boundary 尊重で切断、末尾 `…` (truncate 発生時)
7. `--defer-remaining` ルート不在 — Critical 残存で done を通す経路がない
