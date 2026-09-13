---
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
description: |
    Spec-Driven Gating Workflow setup orchestrator. Routes to a subcommand body based on the first argument.
    Invoke with one of: scan / bootstrap / migrate / verify.
      /spec-gate scan       — detect tech stack, write docs/discovery.md
      /spec-gate bootstrap  — install 9 daily workflow wrappers + reviewer subagents (with reviewer proposal)
                              + Constitution scaffold + AGENTS.md/CLAUDE.md merge
      /spec-gate migrate    — Brownfield 5-phase orchestrator (Charter Reverse, Spec Reverse,
                              Constitution Draft, Glossary Extraction)
      /spec-gate verify     — quality gate (structure, consistency, gap, dev-ready) → docs/verify-report.md
    Use after `specify init`. Trigger phrases: "set up spec-gate", "bootstrap gating workflow",
    "scan project tech stack", "migrate brownfield to spec-driven", "verify spec-gate setup".
disable-model-invocation: true
license: MIT
metadata:
    author: ukitomato
    github-path: skills/spec-gate
    github-pinned: v0.2.0
    github-ref: refs/tags/v0.2.0
    github-repo: https://github.com/ukitomato/spec-driven-gating-workflow
    github-tree-sha: 094a68bc13391654bc77abf73785560c97551795
    source: ukitomato/spec-driven-gating-workflow
name: spec-gate
---
# /spec-gate `<subcommand>`

`$ARGUMENTS` を parse して subcommand を取り出し、該当 subcommand 本体を `Read` してそのまま実行する (agentskills.io progressive disclosure pattern)。本 dispatcher は約 100 行で薄く保ち、各 subcommand の詳細は `references/commands/<subcommand>.md` で完結させる。

## When to invoke

`specify init` 直後の Greenfield または既に動いている Brownfield プロジェクトで、本 workflow を導入するとき。`$ARGUMENTS` で指定する subcommand により振る舞いが切り替わる。

## Inputs

- `$ARGUMENTS`: subcommand 名 + 任意の flags
  - 例 1: `scan`
  - 例 2: `bootstrap --prefix mycompany`
  - 例 3: `migrate --domains auth,billing --no-reverse`
  - 例 4: `verify --strict`

## Steps

### Phase 0: Subcommand 判定

1. `$ARGUMENTS` の最初の token を抽出 (空白で split)
2. 該当する subcommand body を Read:

   | subcommand | body file |
   |---|---|
   | `scan` | `${CLAUDE_SKILL_DIR}/references/commands/scan.md` |
   | `bootstrap` | `${CLAUDE_SKILL_DIR}/references/commands/bootstrap.md` |
   | `migrate` | `${CLAUDE_SKILL_DIR}/references/commands/migrate.md` |
   | `verify` | `${CLAUDE_SKILL_DIR}/references/commands/verify.md` |

3. token が空 or 上記いずれにも該当しない場合は、次のヘルプを表示して終了:

   ```
   Usage: /spec-gate <subcommand> [flags...]

   Subcommands:
     scan       Detect tech stack and write docs/discovery.md
     bootstrap  Install daily workflow wrappers + reviewer subagents + Constitution scaffold
     migrate    Brownfield 5-phase orchestrator (requires bootstrap to be run first)
     verify     Quality gate (structure, consistency, gap, dev-ready)

   Examples:
     /spec-gate scan
     /spec-gate bootstrap --prefix mycompany
     /spec-gate migrate --domains auth,billing
     /spec-gate verify --strict

   See docs/adoption-guide.md for the recommended order:
     Greenfield: scan → bootstrap → (daily workflow) → verify
     Brownfield: scan → bootstrap → migrate → verify → (daily workflow)
   ```

### Phase 1: 委譲

Phase 0 で Read した subcommand body の指示にそのまま従って実行を続行する。subcommand body は本 dispatcher と同じ実行 context を継承し、`${CLAUDE_SKILL_DIR}` / `$ARGUMENTS` (subcommand token を除いた残り flags) / allowed-tools の権限を引き続き利用できる。

各 subcommand body は冒頭で:
- 自身固有の Phase 0 前提確認 (`.specify/` 存在、必要な前 phase の output 存在など)
- AskUserQuestion による prefix / option 確認
- 必要な subagent を `references/subagents/` から `.claude/agents/` に Write
- 本体処理

を実行する。dispatcher は単に subcommand body を渡すだけで、ロジックは body 側に集約される。

## References

- `references/commands/scan.md` — scan subcommand body
- `references/commands/bootstrap.md` — bootstrap subcommand body (with reviewer proposal phase)
- `references/commands/migrate.md` — migrate subcommand body (Brownfield 5-phase)
- `references/commands/verify.md` — verify subcommand body (quality gate)
- `references/subagents/<name>.md` — 10 SubAgents (deployed to `.claude/agents/` by command bodies)
- `references/wrappers/<name>.md` — 9 daily workflow wrapper templates (deployed by bootstrap)
- `references/{docs-templates,memory,lang,reviewers-optional}/...` — auxiliary content (deployed by bootstrap)
- `scripts/{spec-resolve,status-transition}.sh` — helper scripts deployed to `.specify/scripts/`

## Idempotency

- 同一 subcommand の再実行は各 command body が独自に AskUserQuestion で上書き確認
- subcommand 切替は dispatcher が状態を持たない (毎回 Phase 0 で dispatch)

## Failure modes

- `$ARGUMENTS` が不明 / 空 → ヘルプ表示して終了
- subcommand body ファイルが見つからない → `gh skill update` を案内して halt (例: `gh skill update ukitomato/spec-driven-gating-workflow`)
- Phase 1 (subcommand body 実行) 内のエラーは各 body の Failure modes セクションを参照

## Acceptance criteria

1. `$ARGUMENTS` の最初の token に応じて 4 subcommand のいずれかの body が Read される
2. 未知 subcommand / 空入力ではヘルプが表示され、それ以上の処理が走らない
3. dispatcher 自体は file 操作 / LLM 呼び出しを行わない (すべて subcommand body に委譲)
