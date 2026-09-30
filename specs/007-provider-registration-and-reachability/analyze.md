# Track A — speckit-analyze (design-gate Round 2)

**Run**: 2026-09-29 · **Spec**: specs/007-provider-registration-and-reachability · **Round**: 2 (re-run after C-001 fix)

## Verdict (analyze track): Critical 0 · High 0 · Medium 0 · Low 5

All Round 1 analyze-track items resolved. New artifacts exist and resolve broken-link findings; ADR citations (incl. AD-040) accurate against real authorities and actual enforcement code.

### Resolution of Round 1 analyze-track items

| Prev ID | Item | Status |
|---|---|---|
| H-01 (analyze-H1) | aws-assume-role `AWS_*` injection vs FR-009 denylist | **RESOLVED** — FR-009 type-separates passthrough allowlist vs 方式固有 curated 実名注入 (aws-assume-role=3 AWS vars). SC-003 別勘定 wording. Contracts C-5 + data-model §4(b). "WSLENV 透過で届けない" stated. |
| H-05 (analyze-H2) | data-model/contracts/research missing | **RESOLVED** — all three exist, internally consistent, links resolve. |
| M-12 | FR-001 no dedicated SC | **RESOLVED** — SC-010 added. |
| L-02 | FE-030 → SC-007 mismatch | **RESOLVED** — FE-030 now `(FR-001, SC-010)`. |
| L-03 | denylist restated ≥3 places | **RESOLVED** — reference-form; normative list once in FR-009 citing SSoT X-1 C-5. |
| L-01 (analyze-L3) | glossary ProviderProfile lacks id/displayName | **RESOLVED** — glossary now includes id/displayName + AD-005 ref. |
| L-04 | plan Post-design re-check unchecked | **RESOLVED** — all 6 `[x]`. |

### Focus verifications (all pass)

- Identifier integrity: FR-001..014 (14), SC-001..010 (10). SC-009/SC-010 confirmed added. All backlinks resolve; no orphans.
- FR/SC coverage: 14/14 FR have ≥1 task. SC→SH-020(i–xiii) + BE/FE tasks. SC-006 escalation-free assert present.
- AD-040 reconciliation citation correctness: AD-036 §4 P1 5-key allowlist (settings excluded) and AD-039 D2 quoted accurately. Enforcement anchors real: `allowlists.mjs` `QUERY_ESCALATION_OPTION_KEYS` first entry = `settings`; `check.mjs` 項目16 flags `settings:` in `AGENT_SDK_IMPORT_DIRECTORIES=['src/agents/']`. AD-040 Decision 3 grounded. Follows house precedent (AD-036 §8 読み替え).
- CLAUDE_CONFIG_DIR RuntimePath (AD-036 §6): FR-008/SC-003/data-model §4 accurately require config-dir→RuntimePath conversion (fail on raw HostPath). Round 1 H-02 resolved.
- Broken-link check: data-model/contracts/research/AD-040 all exist; relative-path depths correct.
- Duplication/drift: HelperSettings / DerivedLaunchEnv / ResolvedCredential seam / 5-min threshold SSoT consistent.

### New findings (Round 2)

| ID | Category | Severity | Location | Summary | Applied |
|----|----------|----------|----------|---------|---------|
| N1 | Inconsistency | LOW | data-model.md §2 (api-key-helper row) | "(§5 HelperSettings)" wrong — HelperSettings in §4. | **fixed** (§5→§4) |
| N2 | Traceability | LOW | tasks.md BE-030 | CRUD task omits SC-010 backlink. | **fixed** (added SC-010) |
| N3 | Underspecification | INFO | glossary | DetectedCandidate/DerivedLaunchEnv not yet in glossary; SH-003 schedules pre-code (Principle XIV). Tracked. |
| N4 | Inconsistency | INFO | AD-040/plan/session-core.ts | AD-040 updates check.mjs 項目16 denylist side; X-1 `buildQueryOptions` positive allowlist extension (settings 6th key) correctly deferred to X-4 wiring, left unnamed. Non-blocking. |
| N5 | ADR framing | INFO | AD-040 Consequences | AD-040 expands AD-036 §4 P1 allowlist by 1 conditional key while framing as 追記的精緻化; consistent with immutable-ADR reconciliation precedent; Principle III surface remains 0. For architecture-reviewer confirmation. |

### Metrics
- 14 FR + 10 SC · 30 tasks · 14/14 FR + 10/10 buildable SC mapped · 0 placeholders · 0 blocking duplication
- **Critical: 0 · High: 0 · Medium: 0 · Low: 5**

Analyze track clean for gate promotion (Critical=0). N1/N2 applied; N3–N5 informational.
