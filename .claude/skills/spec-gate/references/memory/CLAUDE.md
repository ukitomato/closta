## Spec-Driven Gating Workflow (Claude Code 特有)

このプロジェクトは Spec-Driven Gating Workflow を採用しています。SKILL の一覧は `/help` または `.claude/skills/spec-gate.*/SKILL.md` を参照。

### Workflow 1サイクル

```
/spec-gate.spec <description>      ─→ specs/<NNN>-<domain>-<slug>/spec.md   (drafting)
/spec-gate.plan                    ─→ plan.md                                (drafting → planning)
/spec-gate.tasks                   ─→ tasks.md                               (planning → tasking)
/spec-gate.design-gate             ─[bundle review: 3並列 reviewer]
                                     Critical=0 で                           (tasking → implementing)
/spec-gate.implement               ─→ コード + auto-chain code-gate          (→ implementing)
/spec-gate.code-gate               ─[self review: 3-5並列 + auto-fix loop]
                                     PASS で                                 (implementing → reviewing)
/spec-gate.pr-gate                 ─[adversarial review: multi-round]
                                     Critical=0 で done を許可
/spec-gate.done                    ─→ PR 提出                                (reviewing → completed)
```

### 重要原則 (Skill 内部で繰り返し参照)

- **gate 失敗時は status を進めない**。Critical 指摘を解消してから再実行する
- **AskUserQuestion gated 確定**: domain decomposition / reverse spec の domain 帰属 / Constitution Principle 採否は必ず人間承認
- **`rev-` prefix で物理分離**: brownfield 由来の spec は `specs/rev-<NNN>-<DOM>-<slug>/` に集約し、新規 spec と区別
- **`status: migrated, needs-human-review`**: reverse 由来は frontmatter で明示
- **bf_ids / sf_ids トレーサビリティ**: code ↔ spec を相互参照

### Reviewer SubAgent (clean context isolation)

- `security-reviewer` — secrets / auth / injection
- `architecture-reviewer` — Constitution / Charter / ADR drift
- `po-reviewer` — User Story 価値 / SC 計測可能性
- `convention-reviewer` — naming / lint hookup
- (optional via `/spec-gate.add-reviewer`): `database-reviewer`, `a11y-reviewer`, `api-performance-reviewer`, `openapi-contract-reviewer`, `ux-reviewer`

### Brownfield specialist SubAgent

- `discovery-scanner`, `charter-drafter`, `spec-reverser`, `constitution-drafter`, `glossary-extractor`

### References

- Constitution: `.specify/memory/constitution.md`
- Domain Charter: `docs/domains/<name>/charter.md`
- Glossary: `docs/glossary.md`
- ADRs: `docs/decisions/`
