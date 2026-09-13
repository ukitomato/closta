---
name: {{prefix}}-add-reviewer
description: 新規 reviewer subagent を後付け追加する wrapper。built-in optional reviewer (database / a11y / api-performance / openapi-contract / ux) の有効化、もしくは project 固有 reviewer の新規起草を担当。新規時は LLM が body を draft → ユーザ承認 → ファイル展開 → `/{{prefix}}-code-gate` / `/{{prefix}}-pr-gate` の reviewer リストに自動編入。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# {{prefix}}-add-reviewer

新規 reviewer subagent を後付けで追加する wrapper。

## 2 modes

### Mode A: built-in optional reviewer を有効化

`--from-template <name>` で以下 5 種から選択:

- `database-reviewer` (RLS / index / migration)
- `a11y-reviewer` (WCAG 2.1 AA)
- `api-performance-reviewer` (latency / caching / N+1)
- `openapi-contract-reviewer` (oasdiff breaking-change scan)
- `ux-reviewer` (empty / error states / i18n)

`.specify/extensions/spec-gate/reviewers-optional/<name>-body.md` から body を copy し、`.claude/agents/<name>.md` として展開。

### Mode B: project 固有 reviewer を新規作成

`<name>` のみで起動。LLM が AskUserQuestion で観点 / scope / severity 判定基準を elicit し、`reviewer-base.md` を base とした body を draft。

## When to invoke

- 既存 4 reviewer (security / architecture / po / convention) では足りないと判明した時
- 特定 tech stack や regulatory 要件で project 固有の観点を追加したい時

## Inputs

- `<name>`: reviewer 名 (kebab-case)。例: `compliance-reviewer`, `performance-reviewer`
- `--from-template <built-in-name>` (optional): Mode A で起動
- `--scope feature|system|both` (default: both): pr-gate でどの scope に encore されるか

## Steps

### Phase 0: Preconditions + Mode 判定

1. `<name>` が valid kebab-case (`^[a-z][a-z0-9-]*$`) であること
2. `.claude/agents/<name>.md` が既存でないこと (既存なら `--force` 必須)
3. `--from-template` 指定 → Mode A、なし → Mode B

### Phase 1A (Mode A): built-in テンプレートから展開

1. `.specify/extensions/spec-gate/reviewers-optional/<name>-body.md` を Read
2. 不存在なら "<name> は built-in にない、Mode B (新規起草) で再実行してください" で halt
3. body の冒頭の comment セクション (もしあれば) を読み、tech stack 適合性を AskUserQuestion で確認 (例: database-reviewer なら "PostgreSQL / MySQL / SQLite どれを対象?")

### Phase 1B (Mode B): 新規 reviewer を draft

LLM (本 skill のメインスレッド) が以下を AskUserQuestion で elicit:

1. **責任観点**: この reviewer は何を検出する? (最低 5 件の viewpoint)
2. **scope**: feature / system / both
3. **severity 判定**:
   - 何を Critical とする?
   - 何を High とする?
   - **Severity 禁則** (将来的攻撃経路や defensive coding を Critical 扱いしない) は適用するか?
4. **Tier-0 必読ファイル**: spec.md 以外で必ず Read すべきものは?
5. **使用ツール**: Bash が必要か? (lint コマンド実行等)
6. **owner matrix**: 他 reviewer と重複する観点は? (重複は禁止)

エリシト完了後、`reviewer-base.md` を `@include` した body を Write 用に draft:

```markdown
---
name: <name>
description: <elicited description>
tools: Read, Grep, Glob<, Bash>
---

# <name>

<本 reviewer の役割 説明>

## 初期化

invoke 直後に Read:

1. `.claude/agents/reviewer-base.md`
2. <elicited Tier-0 files>

## 固有観点

### A. <viewpoint 1>
...
### B. <viewpoint 2>
...
(5 件以上)

## owner matrix
- 本 reviewer が責任を持つ観点: <list>
- 他 reviewer に委ねる観点: <list>

## 出力フォーマット
`reviewer-base.md` の "最終出力フォーマット" に従う。
```

ユーザに draft を AskUserQuestion で見せて承認 / 編集 / 拒否を選択。

### Phase 2: ファイル展開

1. `.claude/agents/<name>.md` を Write (Claude Code 用)
2. `.cursor/agents/<name>.md` を Write (Cursor が `.cursor/agents/` を読む場合)
3. `.agents/shared/<name>-body.md` に body 部分 (frontmatter 除く) を Write (SSoT)

### Phase 3: gate skill の reviewer リストへ自動編入

ユーザが `<name>` を毎 gate で必須にするか、特定条件で encore するかを AskUserQuestion で確認:

- "常駐 (毎 code-gate / pr-gate で必ず起動)"
- "system scope のみ (file pattern にマッチする時のみ起動)" + pattern 入力
- "manual only (`--scope <name>` で明示起動した時のみ)"

選択に応じて `.specify/spec-gate/reviewers.yml` (or 同等の registry file) に entry を追加:

```yaml
reviewers:
  - name: <name>
    enabled: true
    scope: feature | system | both
    auto_invoke_patterns: ["**/*.sql", ...]  # system scope 時のみ
    gates: [code-gate, pr-gate]              # どの gate で起動するか
```

### Phase 4: 動作確認 (任意)

AskUserQuestion で「即座に dry-run しますか?」を提示し、yes なら最新 spec_dir に対し新 reviewer を 1 回だけ起動して出力サンプルを表示。

### Phase 5: 完了通知

```
✓ /{{prefix}}-add-reviewer 完了
  - name: <name>
  - mode: <A built-in | B new>
  - 配置: .claude/agents/<name>.md, .agents/shared/<name>-body.md
  - registry: .specify/spec-gate/reviewers.yml に登録
  - 次のアクション: /<prefix>.code-gate または /<prefix>.pr-gate を実行して動作確認
```

## Idempotency

- 既存 `<name>` reviewer がある場合は `--force` 必須
- registry への登録は同名 entry があれば上書き

## Failure modes

- name validation 失敗 → AskUserQuestion で再入力
- Mode A で `.specify/extensions/spec-gate/reviewers-optional/<name>-body.md` 不存在 → Mode B に switch を提案
- Mode B で 5 viewpoint 未満を elicit → AskUserQuestion で追加観点を要求 (5 件未満は受け付けない)
- registry file 不存在 → 新規作成

## Acceptance criteria

1. `.claude/agents/<name>.md` が存在
2. body に `reviewer-base.md` への参照が含まれる
3. 5+ viewpoint section (A-E 以上) が記述
4. owner matrix が他 reviewer と重複していない
5. registry に entry が登録 (gates / scope / auto_invoke_patterns が記述)
