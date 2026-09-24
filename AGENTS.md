# Spec-Driven Gating Workflow

すべての feature 開発は以下の順序で行う。SKILL の一覧は `/help` または `.claude/skills/cl-*/SKILL.md` を参照。

```
/cl-design <description>    ─ Design フェーズを 1 コマンドで完走 (下の 4 つを連鎖)
  ├─ /cl-spec               ─→ specs/<NNN>-<domain>-<slug>/spec.md   (drafting)
  ├─ /cl-plan               ─→ plan.md                                (drafting → planning)
  ├─ /cl-tasks              ─→ tasks.md                               (planning → tasking)
  └─ /cl-design-gate        ─[bundle review]
                              Critical=0 で                           (tasking → implementing)
                              FIX_REQUIRED なら implementing → tasking に降格
/cl-implement               ─→ コード + code-gate へ auto-chain
/cl-code-gate               ─[lint / test / convention + auto-fix loop]
                              PASS で                                 (implementing → reviewing)
/cl-pr-gate                 ─[adversarial review: multi-round]
                              Critical=0 で done を許可
/cl-done                    ─→ PR 提出                                (reviewing → completed)
```

個別に `/cl-spec` / `/cl-plan` / `/cl-tasks` / `/cl-design-gate` を叩くこともできる。
design-gate が FIX_REQUIRED なら status は `tasking` に留まる。修正後 `/cl-design --spec-dir <dir> --from gate` で再開する。

新規 reviewer の追加には `/cl-add-reviewer` を使う。

## gate の原則

- **gate 失敗時は status を進めない。** Critical 指摘を解消してから再実行する
- **pr-gate は pure hard gate。** Critical を残したまま `/cl-done` に進む経路は存在しない
- **gate を通ったかの判定は `gate_common::verdict_require_pass` が行う。**
  `verdict_validate` は schema 検査であり、`FIX_REQUIRED` を正当な verdict として exit 0 で通す。
  「次の段に進んでよいか」を `verdict_validate` で判定してはならない
- **AskUserQuestion gated 確定**: domain decomposition と Constitution Principle の採否は必ず人間が承認する
- **自動推論の範囲**: `/cl-spec` は domain / targets を自動推論して自動採用する。domain が僅差のときだけ聞く。採用根拠は `domain_selected_by` / `targets_selected_by` として spec.md frontmatter に残る
- **reviewer の発火条件を skill 側に焼き込まない。** ただし正本は gate で分かれる:
  - **code-gate / pr-gate** — `gate_common::reviewers_filter` が `.specify/spec-gate/reviewers.yml` の `enabled` / `gates` / `auto_invoke_patterns` を適用する
  - **design-gate** — まだ diff が無く file glob が効かないため、`.specify/.agents-registry.yaml` の `invoked_by` で決まる。**reviewers.yml の `gates` は design-gate では読まれない**

## References

- Constitution: `.specify/memory/constitution.md` — プロジェクト全体の不変原則 (NON-NEGOTIABLE)
- Domain Charter: `docs/domains/<name>/charter.md` — 各 domain の mission / scope / User Journey / KPI
- Glossary: `docs/glossary.md` — Ubiquitous Language
- ADRs: `docs/decisions/` (MADR 4.0.0、accepted 後 immutable)
- Build / Test / Lint コマンド: `docs/discovery.md` の "Build / Test / Lint" 表

reviewer subagent はこれらを横断的に参照して drift 検出を行う。
