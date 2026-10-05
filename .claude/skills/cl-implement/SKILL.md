---
name: cl-implement
description: tasks.md に従い実装を実行する。section ごとに task-implementer subagent を直列で起動し、touched-files を確定し、tasks.md の checkbox 100% を検証して `/cl-code-gate` へ auto-chain する。
argument-hint: [spec_dir]
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# cl-implement

tasks.md に従って実装を実行する。**本 skill は main で動く指揮役であり、ソースを読まず、自分では実装しない。** 実装は section ごとに `task-implementer` subagent が行う (共通規則の正本は AGENTS.md の「実行モデル (context 管理)」節)。本 wrapper は以下を担当する:

- **前提検証** — `/cl-design-gate` PASS (Critical=0、status: implementing) と checklist の完了を確認
- **targets=both の BE→FE order** — Backend section を先に完走させてから Frontend に進む
- **task-implementer の直列起動** — 未完了タスクを含む section ごとに 1 つずつ
- **touched-files の確定** — subagent の追記と git の差分の和集合を `<spec_dir>/touched-files.txt` に記録
- **tasks.md checkbox 100% 検証** — 全タスクが `[x]` であることを確認
- **`/cl-code-gate` auto-chain** — 実装完了後に自動起動

## When to invoke

- `/cl-design-gate` で PASS した直後 (status: implementing)

## Inputs

- `<spec_dir>` (optional): 省略時 branch 名から推定

## Steps

### Phase 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || exit 1
spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}") || exit 2
gate_common::phase0_check_status "$spec_dir" "implementing" || exit 1
gate_common::phase0_check_charter "$spec_dir" || exit 1
# design-gate verdict が PASS であること
# **verdict_validate ではなく verdict_require_pass。** 前者は FIX_REQUIRED を
# 正当な verdict として exit 0 で通すので、gate を通っていない spec で実装が始まる。
gate_common::verdict_require_pass "$spec_dir/.gate-verdict-design.json" \
  || halt "/cl-design-gate が PASS していません"
# checklist の未完了項目をファイルごとに数える (step 5)
[ -d "$spec_dir/checklists" ] && grep -c -- '- \[ \]' "$spec_dir"/checklists/*.md
# 実装開始時の commit を記録する。再開時は既存の値を使う (Phase 3 の差分起点)
[ -s "$spec_dir/.implement-base" ] || git rev-parse HEAD > "$spec_dir/.implement-base"
impl_base=$(cat "$spec_dir/.implement-base")
```

1. spec_dir 解決
2. `<spec_dir>/spec.md` の frontmatter:
   - `status: implementing` であること (異なれば halt with "/cl-design-gate で gate 通過してから")
   - `targets` 値を取得 (frontend / backend / both)
3. `<spec_dir>/.gate-verdict-design.json` の verdict=PASS + critical=0 を `verdict_require_pass` で確認
4. `<spec_dir>/tasks.md` の checkbox がすべて `[ ]` (未着手) であることを確認 (再開なら `[x]` 混在 OK)
5. **checklist の未完了確認** — `<spec_dir>/checklists/` に未完了項目 (`- [ ]`) が残っていれば、ファイルごとの件数を表で示し、**AskUserQuestion** で「未完了の checklist があります。実装を始めますか? (yes / no)」と確認する。subagent は人間に聞けないため、この確認は main で行う。no なら、この回に作った `.implement-base` を消して halt する
6. `impl_base` を記録する (`<spec_dir>/.implement-base`。既にあれば上書きしない)

### Phase 1: Implementation order の決定

- `targets: frontend` → tasks.md をそのまま順に実装
- `targets: backend` → 同上
- `targets: both` → Backend Section → Shared Section → Frontend Section の順 (依存逆転を避けるため)

`tasks.md` に Backend/Frontend/Shared section が無い (targets=single) ならそのまま順次実装。

### Phase 2: section ごとに `task-implementer` を起動

`/speckit.implement` には委譲しない。実装はすべて subagent で行い、main はソースを読まない。

1. tasks.md の `## ` 見出しを上から列挙し、未完了タスク (`- [ ]`) を含む section だけを対象にする。targets=both のときは Phase 1 の順 (Backend → Shared → Frontend) に並べる
2. 対象 section ごとに `Agent(subagent_type: task-implementer)` を **1 つずつ直列で**起動する。渡すのは `spec_dir` / `impl_base` / section 見出しだけで、本文は貼らない
   - **並列に起動しない。** 同じ作業ツリーで動かすと eslint / vitest / tsbuildinfo のキャッシュが互いに無効化される
   - Agent はバックグラウンドで返る。報告が届いてから次の section を起動する
3. 報告の 1 行目で分岐する:
   - `DONE` → 次の section へ
   - `BLOCKED` → **halt** し、報告の `blocked` 行を利用者に提示する。対処が決まったら `/cl-implement` を再実行する (完了済みの `[x]` は skip される)
4. 報告 (10 行以内) 以外を読まない。tasks.md の `[x]` は Phase 4 の bash で確かめる

### Phase 3: touched-files の確定

task-implementer の追記だけに頼らない。次の 3 つの和集合を **1 回の bash** で取り、`sort -u` する。`<spec_dir>/` 配下 (tasks.md の `[x]` など) は実装ではないので除く:

```bash
impl_base=$(cat "$spec_dir/.implement-base")
{ cat "$spec_dir/touched-files.txt" 2>/dev/null       # task-implementer の追記分
  git diff --name-only "$impl_base"                   # 実装開始以降の変更 (コミット済みを含む)
  git ls-files --others --exclude-standard            # 新規ファイル
} | tr -d '\r' | sed '/^[[:space:]]*$/d' | grep -v "^${spec_dir%/}/" | sort -u \
  > "$spec_dir/touched-files.txt.tmp"
mv "$spec_dir/touched-files.txt.tmp" "$spec_dir/touched-files.txt"
```

**PostToolUse hook で記録しない。** Edit / Write のたびにプロセスが起動し (1 回 400〜2,400ms)、CLAUDE.md の方針に反する。

`<spec_dir>/touched-files.txt` は次の `code-gate` が diff と intersect して scope を決めるのに使う。

### Phase 4: tasks.md 100% 検証 + touched-files.txt 非空検証

Phase 3 と同じ bash で続けて実行する (プロセスを 1 回で済ませる)。

```bash
gate_common::tasks_complete_check "$spec_dir" \
  || halt "未完了タスクが残っています (上の一覧を参照)。手動で対処してから再実行"

# **touched-files.txt が非空であることをここで検証する。**
# 空のまま code-gate に渡すと Phase 1 の scope が空集合になり、
# 検査 0 件のまま PASS する経路が開く。
[ -s "$spec_dir/touched-files.txt" ] \
  || halt "touched-files.txt が空です。impl_base ($impl_base) 以降の差分がありません"
```

- 未完了タスクあり → halt
- `touched-files.txt` が空 → halt
- 両方 OK → 次へ

### Phase 5: `/cl-code-gate` auto-chain

実装完了後、本 wrapper が自動的に `/cl-code-gate <spec_dir>` を起動する (auto-chain は default ON、**`--no-auto-chain` で skip 可能**)。

code-gate は background の fork で走る。main には起動の通知と、終了時の完了通知だけが届く。完了通知が届くまで次の操作をしない。

auto-chain 中の status 遷移は code-gate 側が担当。本 skill の責務は implement までで完了。

### code-gate との結合点

- **受け渡し artifact**:
  - `<spec_dir>/touched-files.txt` (sort -u 済) — code-gate Phase 1 で diff_files ∩ touched_files として使用
  - spec.md frontmatter status=implementing — code-gate が validates
  - tasks.md 全 `[x]` — code-gate が validates
- **受け渡し guarantee**:
  - `touched-files.txt` は **必ず非空、かつ `sort -u` 済** (Phase 3 で確定、Phase 4 で検証)
  - implementer が code-gate の auto-fix で追加修正したファイルは code-gate 内 implementer subagent が `touched-files.txt` に再追加 (重複は排除)
- **結合の責務境界**:
  - implement: 「機能を成立させる」までを保証
  - code-gate: 「静的検査 + テストが通る」までを保証
  - pr-gate: 「adversarial Critical が無い」までを保証

### Phase 6: 完了通知 (auto-chain skip 時のみ)

```
✓ /cl-implement 完了
  - spec dir: <spec_dir>
  - tasks completed: <N>/<N>
  - touched files: <count> (see <spec_dir>/touched-files.txt)
  - 次のアクション: /cl-code-gate <spec_dir>
```

## Idempotency

- 部分実装後の再開可能 (既に `[x]` のタスクは skip、未完了タスクを含む section から再開)
- 再開時も `.implement-base` は作り直さない (差分の起点を実装開始時に固定する)
- `--restart` フラグで全タスクを `[ ]` にリセットして最初から実装

## Failure modes

- task-implementer が `BLOCKED` を返した (判断が要る / ビルド・test を直せない) → 該当タスクは `[ ]` のまま。`blocked` 行を提示して halt
- design-gate.md が FIX_REQUIRED → halt with "design-gate PASS 後に再実行してください"
- status が implementing でない → halt
- auto-chain した code-gate が MUST_FIX → code-gate の auto-fix loop に委ねる (本 skill は終了)

## Acceptance criteria

1. tasks.md の全タスクが `[x]` checked
2. `<spec_dir>/touched-files.txt` が存在し、空でない
3. spec.md frontmatter `status` が `implementing` (code-gate auto-chain 前) のまま
4. ビルド / lint / test に明らかな breaking がない (code-gate でより詳細にチェックされる)
5. auto-chain ON ならば `/cl-code-gate` が起動された
6. `--no-auto-chain` 指定時は code-gate を起動せず status: implementing で完了する
