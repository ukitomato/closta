---
name: cl-tasks
description: plan.md から tasks.md を起草する。User Story 単位の section 構造と `[P]` 並列マーカーを検証し、status を planning → tasking に遷移させる。
argument-hint: [spec_dir]
allowed-tools: Read Write Edit Bash Glob Grep
context: fork
agent: designer
background: false
---

# cl-tasks

plan.md から tasks.md を起草する。`/speckit.tasks` を内部委譲しつつ、本 wrapper は以下を担当する:

- **User Story 単位の section 構造化** — tasks.md が `## US-N` 見出しでグルーピングされていることを検証
- **`[P]` 並列マーカー** — 同 phase 内で並列実行可能なタスクに `[P]` を付与する慣習が守られているか検証
- **targets=both の分割** — FE / BE / shared (DB migration / API contract 等) の 3 section に自動分割
- **Status 遷移** — `planning → tasking`

## 実行モデル

- 本 skill は `designer` agent の fork で動く。呼び出し元の会話は見えず、入力は引数とファイルだけである
- **人間には質問できない。** 判断が要る点は designer の規則どおり `<spec_dir>/.needs-input.md` に書き、`NEEDS_INPUT` で返す
- **最終メッセージは Phase 8 の完了通知 (または halt 理由) だけにする**

## When to invoke

- `/cl-plan` で plan.md を起草した直後

## Inputs

- `<spec_dir>` (optional): 省略時は branch 名から `.specify/scripts/spec-resolve.sh` で推定

## Steps

### Phase 0: spec_dir resolution + state check

1. spec_dir を解決
2. `plan.md` が存在し、frontmatter `status: planning` であることを確認
3. `status: tasking` 以降ならば tasks.md を **自動上書き** し、完了通知に `[warn: status was <old_status>, tasks.md overwritten]` を記録する

### Phase 1: `/speckit.tasks` delegation

`/speckit.tasks <spec_dir>` を起動。SpecKit が `<spec_dir>/tasks.md` を生成する。

### Phase 2: User Story section の検証

生成 tasks.md を Read し、`^## US-\d+` 見出しの数が plan.md の User Story 数と一致するか確認:

1. plan.md から `## User Story` 見出し (or `^### US-N`) の数を Grep でカウント
2. tasks.md の `^## US-N` 見出し数と比較
3. 不一致なら warning として表示 (halt しない、ユーザ判断に委ねる)

### Phase 3: `[P]` 並列マーカーの検証 (informational)

`[P]` マーカーがタスク行末尾に付与されているか確認:

```bash
grep -cE '\[P\]\s*$' "$spec_dir/tasks.md"
```

- `[P]` ゼロ → "完全に直列なタスク構成です。本当に並列化可能なタスクが無いか確認推奨" の warning
- `[P]` 多すぎ (タスク全体の 80% 超) → "並列化想定が楽観的な可能性。依存関係を再確認" の warning

halt はしない。

### Phase 4: targets=both 分割 (frontmatter targets が both の時のみ)

spec.md frontmatter `targets: both` の場合、tasks.md を以下 3 section に分割:

```markdown
## Backend Tasks
- [ ] BE-001 ... [P]
- ...

## Frontend Tasks
- [ ] FE-001 ... [P]
- ...

## Shared Tasks (DB migration / API contract / E2E)
- [ ] SH-001 ...
- ...
```

`/speckit.tasks` 出力が既にこの構造を持っていれば skip。持っていなければ Edit で分割。判断基準:

- task description に `frontend`, `FE`, `client`, `UI` を含む → Frontend
- `backend`, `BE`, `server`, `API`, `endpoint`, `database`, `migration` → Backend or Shared
- 上記いずれにも該当しないものは **AI が Shared に自動分類** し、tasks.md のタスク行末尾に `<!-- [auto-classified: Shared] -->` を追記するとともに、完了通知に `[auto-classified: <task> → Shared]` として列挙する

### Phase 5: tech-stack 別タスク注入 (任意)

`docs/discovery.md` (setup で生成) を Read し、検出した tech stack に応じた必須タスクが含まれるか確認:

- Flutter → "build_runner build --delete-conflicting-outputs" タスクが含まれているか
- TypeScript → "type-check (tsc --noEmit)" タスクが含まれているか
- FastAPI → "alembic migration generate" タスクが含まれているか (DB 変更を伴う場合)

含まれていなければ **自動追加** し、追加したタスク行末尾に `<!-- [auto-added: <stack>] -->` を追記するとともに、完了通知に `[auto-added tech task: <task>]` として列挙する。

### Phase 6: Language verification (warning only)

`/cl-plan` 同様、生成テキスト言語チェック。

### Phase 7: Status 遷移

`spec.md` frontmatter `status:` を `planning` → `tasking` に Edit。

### Phase 8: 完了通知

```
✓ /cl-tasks 完了
  - spec dir: <spec_dir>
  - tasks.md: 生成 + structure 検証
  - US count: <N>
  - [P] markers: <M>
  - status: planning → tasking
  - 次のアクション: /cl-design-gate <spec_dir>
```

## Idempotency

- 既存 tasks.md は自動上書き (完了通知に warn 記録)
- targets 分割は既存構造があれば skip

## Failure modes

- plan.md が存在しない → halt
- `/speckit.tasks` delegation 失敗 → エラー + status 据置
- targets=both で分類不能なタスク → Shared に自動分類 (`[auto-classified]` ラベル付き)

## Acceptance criteria

1. `<spec_dir>/tasks.md` が存在
2. `## US-N` 見出しが plan.md の User Story 数と一致 (warning は許容)
3. targets=both の場合、Backend / Frontend / Shared の 3 section に分割されている
4. spec.md frontmatter `status` が `tasking` に更新されている
5. `[NEEDS CLARIFICATION]` が tasks.md に残っていない
