<!-- BEGIN spec-gate -->
## Spec-Driven Gating Workflow

このプロジェクトは Spec-Driven Gating Workflow を採用しています。すべての feature 開発は以下の順序で行います:

1. `/cl-spec <description>` — spec.md 起草 (status: drafting)
2. `/cl-plan` — plan.md 起草 (drafting → planning)
3. `/cl-tasks` — tasks.md 起草 (planning → tasking)
4. `/cl-design-gate` — spec/plan/tasks の bundle review (tasking → implementing)
5. `/cl-implement` — 実装 + code-gate auto-chain
6. `/cl-code-gate` — 実装の self-review (implementing → reviewing)
7. `/cl-pr-gate` — PR diff の adversarial review
8. `/cl-done` — PR 提出 (reviewing → completed)

各 gate で Critical 指摘が残っている間は次の status に進めません。

Brownfield 機能の文書化には `/spec-gate migrate` を使い、Charter → Spec の順で逆生成します。本プロジェクトは greenfield のため通常は使いません。

新規 reviewer の追加には `/cl-add-reviewer` を使います。

## Constitution / Domain Charter

- `.specify/memory/constitution.md` — プロジェクト全体の不変原則 (NON-NEGOTIABLE)
- `docs/domains/<name>/charter.md` — 各 domain の mission / scope / User Journey / KPI
- `docs/glossary.md` — Ubiquitous Language

reviewer subagent はこれらを横断的に参照して drift 検出を行います。
<!-- END spec-gate -->
