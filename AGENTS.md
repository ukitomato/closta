<!-- BEGIN spec-gate -->
## Spec-Driven Gating Workflow

このプロジェクトは Spec-Driven Gating Workflow を採用しています。すべての feature 開発は以下の順序で行います:

1. **`/cl-design <description>`** — Design フェーズを 1 コマンドで完走
   （`/cl-spec` → `/cl-plan` → `/cl-tasks` → `/cl-design-gate` を連鎖、drafting → implementing）
2. `/cl-implement` — 実装 + code-gate auto-chain
3. `/cl-code-gate` — 実装の self-review (implementing → reviewing)
4. `/cl-pr-gate` — PR diff の adversarial review
5. `/cl-done` — PR 提出 (reviewing → completed)

design-gate が FIX_REQUIRED なら status は `tasking` に留まる。
修正後 `/cl-design --spec-dir <dir> --from gate` で再開する。
個別に `/cl-spec` / `/cl-plan` / `/cl-tasks` / `/cl-design-gate` を叩くこともできる。

各 gate で Critical 指摘が残っている間は次の status に進めません。

Brownfield 機能の文書化には `/spec-gate migrate` を使い、Charter → Spec の順で逆生成します。本プロジェクトは greenfield のため通常は使いません。

新規 reviewer の追加には `/cl-add-reviewer` を使います。

## Constitution / Domain Charter

- `.specify/memory/constitution.md` — プロジェクト全体の不変原則 (NON-NEGOTIABLE)
- `docs/domains/<name>/charter.md` — 各 domain の mission / scope / User Journey / KPI
- `docs/glossary.md` — Ubiquitous Language

reviewer subagent はこれらを横断的に参照して drift 検出を行います。
<!-- END spec-gate -->
