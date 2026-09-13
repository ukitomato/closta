## Spec-Driven Gating Workflow

このプロジェクトは Spec-Driven Gating Workflow を採用しています。すべての feature 開発は以下の順序で行います:

1. `/spec-gate.spec <description>` — spec.md 起草 (status: drafting)
2. `/spec-gate.plan` — plan.md 起草 (drafting → planning)
3. `/spec-gate.tasks` — tasks.md 起草 (planning → tasking)
4. `/spec-gate.design-gate` — spec/plan/tasks の bundle review (tasking → implementing)
5. `/spec-gate.implement` — 実装 + code-gate auto-chain
6. `/spec-gate.code-gate` — 実装の self-review (implementing → reviewing)
7. `/spec-gate.pr-gate` — PR diff の adversarial review
8. `/spec-gate.done` — PR 提出 (reviewing → completed)

各 gate で Critical 指摘が残っている間は次の status に進めません。

Brownfield 機能の文書化には `/spec-gate.migrate` を使い、Charter → Spec の順で逆生成します。

新規 reviewer / wrapper の追加には `/spec-gate.add-reviewer` / `/spec-gate.add-wrapper` を使います。

## Constitution / Domain Charter

- `.specify/memory/constitution.md` — プロジェクト全体の不変原則 (NON-NEGOTIABLE)
- `docs/domains/<name>/charter.md` — 各 domain の mission / scope / User Journey / KPI
- `docs/glossary.md` — Ubiquitous Language

reviewer subagent はこれらを横断的に参照して drift 検出を行います。
