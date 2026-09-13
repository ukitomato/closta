---
name: {{prefix}}-implement
description: tasks.md に従い実装を実行する wrapper。`/speckit.implement` を内部委譲しつつ、targets=both の BE→FE order・touched-files tracking・tasks.md 100% checkbox 検証・完了後 `/{{prefix}}-code-gate` の auto-chain を本 wrapper が担当する。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# {{prefix}}-implement

tasks.md に従って実装を実行する。`/speckit.implement` を内部委譲しつつ、本 wrapper は以下を担当する:

- **前提検証** — `/{{prefix}}-design-gate` PASS (Critical=0、status: implementing) を確認
- **targets=both の BE→FE order** — Backend section を先に完走させてから Frontend に進む
- **touched-files tracking** — 実装中に編集したファイルを `<spec_dir>/touched-files.txt` に記録
- **tasks.md checkbox 100% 検証** — 全タスクが `[x]` であることを確認
- **`/{{prefix}}-code-gate` auto-chain** — 実装完了後に自動起動

## When to invoke

- `/{{prefix}}-design-gate` で PASS した直後 (status: implementing)

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
gate_common::verdict_validate "$spec_dir/.gate-verdict-design.json" || halt "/{{prefix}}-design-gate PASS が必要"
```

1. spec_dir 解決
2. `<spec_dir>/spec.md` の frontmatter:
   - `status: implementing` であること (異なれば halt with "/{{prefix}}-design-gate で gate 通過してから")
   - `targets` 値を取得 (frontend / backend / both)
3. `<spec_dir>/.gate-verdict-design.json` の verdict=PASS + critical=0 を `verdict_validate` で確認
4. `<spec_dir>/tasks.md` の checkbox がすべて `[ ]` (未着手) であることを確認 (再開なら `[x]` 混在 OK)

### Phase 1: Implementation order の決定

- `targets: frontend` → tasks.md をそのまま順に実装
- `targets: backend` → 同上
- `targets: both` → Backend Section → Shared Section → Frontend Section の順 (依存逆転を避けるため)

`tasks.md` に Backend/Frontend/Shared section が無い (targets=single) ならそのまま順次実装。

### Phase 2: `/speckit.implement` delegation

各 section ごとに:

1. `/speckit.implement <spec_dir>` を bash 経由で起動
2. SpecKit が tasks.md を読んで実装を進める
3. 完了したタスクは `[x]` にチェック
4. 編集ファイルを touched-files tracking (下記 Phase 3 で記録)

`targets=both` の場合は section ごとに `/speckit.implement` を呼び分け (Backend → Shared → Frontend)、または 1 回の呼び出しで全 section を順序付きで処理する SpecKit の機能に委ねる。

### Phase 3: Touched-files tracking

実装中の各 Edit/Write/Bash 操作で編集したファイルを記録:

```bash
# Edit / Write が走るたびに append
echo "$file_path" >> "$spec_dir/touched-files.txt"
```

実装完了後 `sort -u` で重複排除。`<spec_dir>/touched-files.txt` は次の `code-gate` で diff scope の参考に使う。

### Phase 4: tasks.md 100% 検証

```bash
unchecked=$(grep -cE '^\s*- \[ \]' "$spec_dir/tasks.md" || echo 0)
total=$(grep -cE '^\s*- \[[ x]\]' "$spec_dir/tasks.md")
```

- `unchecked > 0` → halt with "未完了タスクが残っています: <list>。手動で対処してから再実行"
- `unchecked == 0` → 次へ

### Phase 5: `/{{prefix}}-code-gate` auto-chain

実装完了後、本 wrapper が自動的に `/{{prefix}}-code-gate <spec_dir>` を起動する (auto-chain は default ON、**`--no-auto-chain` で skip 可能** — flag 名統一、resolves item 7)。

auto-chain 中の status 遷移は code-gate 側が担当。本 skill の責務は implement までで完了。

### code-gate との結合点 (resolves item 7)

- **受け渡し artifact**:
  - `<spec_dir>/touched-files.txt` (sort -u 済) — code-gate Phase 1 で diff_files ∩ touched_files として使用
  - spec.md frontmatter status=implementing — code-gate が validates
  - tasks.md 全 `[x]` — code-gate が validates
- **受け渡し guarantee**:
  - `touched-files.txt` は **必ず非空** (本 Phase 4 で検証)
  - implementer が code-gate の auto-fix で追加修正したファイルは code-gate 内 implementer subagent が `touched-files.txt` に再追加 (重複は排除)
- **結合の責務境界**:
  - implement: 「機能を成立させる」までを保証
  - code-gate: 「静的検査 + テストが通る」までを保証
  - pr-gate: 「adversarial Critical が無い」までを保証

### Phase 6: 完了通知 (auto-chain skip 時のみ)

```
✓ /{{prefix}}-implement 完了
  - spec dir: <spec_dir>
  - tasks completed: <N>/<N>
  - touched files: <count> (see <spec_dir>/touched-files.txt)
  - 次のアクション: /{{prefix}}-code-gate <spec_dir>
```

## Idempotency

- 部分実装後の再開可能 (既に `[x]` のタスクは skip)
- `--restart` フラグで全タスクを `[ ]` にリセットして最初から実装

## Failure modes

- ビルド / test 失敗 → 該当タスクを `[ ]` のまま、エラー出力を表示、ユーザに対処を求めて halt
- design-gate.md が FIX_REQUIRED → halt with "design-gate PASS 後に再実行してください"
- status が implementing でない → halt
- auto-chain した code-gate が MUST_FIX → code-gate の auto-fix loop に委ねる (本 skill は終了)

## Acceptance criteria

1. tasks.md の全タスクが `[x]` checked
2. `<spec_dir>/touched-files.txt` が存在し、空でない
3. spec.md frontmatter `status` が `implementing` (code-gate auto-chain 前) のまま
4. ビルド / lint / test に明らかな breaking がない (code-gate でより詳細にチェックされる)
5. auto-chain ON ならば `/{{prefix}}-code-gate` が起動された
6. `--no-auto-chain` 指定時は code-gate を起動せず status: implementing で完了する (旧 `--no-auto-gate` は deprecation warning 付き acceptance、次 release で削除)
