<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-runtime-folder-registration-runtime-detection/plan.md`
<!-- SPECKIT END -->

<!-- BEGIN spec-gate -->
## Spec-Driven Gating Workflow (Claude Code 特有)

このプロジェクトは Spec-Driven Gating Workflow を採用しています。SKILL の一覧は `/help` または `.claude/skills/cl-*/SKILL.md` を参照。

### Workflow 1サイクル

```
/cl-design <description>    ─ Design フェーズを 1 コマンドで完走（下の 4 つを連鎖）
  ├─ /cl-spec               ─→ specs/<NNN>-<domain>-<slug>/spec.md   (drafting)
  ├─ /cl-plan               ─→ plan.md                                (drafting → planning)
  ├─ /cl-tasks              ─→ tasks.md                               (planning → tasking)
  └─ /cl-design-gate        ─[bundle review: 3並列 reviewer]
                              Critical=0 で                           (tasking → implementing)
                              FIX_REQUIRED なら implementing → tasking に降格
/cl-implement               ─→ コード + auto-chain code-gate          (→ implementing)
/cl-code-gate               ─[self review: 3-5並列 + auto-fix loop]
                              PASS で                                 (implementing → reviewing)
/cl-pr-gate                 ─[adversarial review: multi-round]
                              Critical=0 で done を許可
/cl-done                    ─→ PR 提出                                (reviewing → completed)
```

### 重要原則 (Skill 内部で繰り返し参照)

- **gate 失敗時は status を進めない**。Critical 指摘を解消してから再実行する
- **AskUserQuestion gated 確定**: domain decomposition / reverse spec の domain 帰属 / Constitution Principle 採否は必ず人間承認
- **自動推論の範囲**: `/cl-spec` は domain / targets を自動推論して自動採用する。
  domain が僅差のときだけ聞く。採用根拠は `domain_selected_by` / `targets_selected_by` として
  spec.md frontmatter に残る
- **`rev-` prefix で物理分離**: brownfield 由来の spec は `specs/rev-<NNN>-<DOM>-<slug>/` に集約し、新規 spec と区別
- **`status: migrated, needs-human-review`**: reverse 由来は frontmatter で明示
- **bf_ids / sf_ids トレーサビリティ**: code ↔ spec を相互参照

### Reviewer SubAgent (clean context isolation)

- `security-reviewer` — secrets / auth / injection
- `architecture-reviewer` — Constitution / Charter / ADR drift
- `po-reviewer` — User Story 価値 / SC 計測可能性
- `convention-reviewer` — naming / lint hookup
- 採用済み optional: `a11y-reviewer`, `ux-reviewer`, `database-reviewer`
- 未採用 optional (`/cl-add-reviewer` で追加可能): `api-performance-reviewer`, `openapi-contract-reviewer`

### Brownfield specialist SubAgent

- `discovery-scanner`, `charter-drafter`, `spec-reverser`, `constitution-drafter`, `glossary-extractor`

### References

- Constitution: `.specify/memory/constitution.md`
- Domain Charter: `docs/domains/<name>/charter.md`
- Glossary: `docs/glossary.md`
- ADRs: `docs/decisions/`
<!-- END spec-gate -->
