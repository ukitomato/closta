## Specification Analysis Report — 023-session-launch-axes-and-operations

Scope: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/ipc-live-session-settings.md, quickstart.md. Checked against constitution v1.4.0, the session charter, the glossary and AD-062 (untracked, `status: accepted`). Source spot-checked: `resume-service.ts`, `launch-preparation.ts`, `OverviewTab.tsx`, `allowlists.mjs`, `agent-session.ts`, `model-catalog.ts`, `launch-resolution.ts`, `ui-coverage.md`. `.specify/extensions.yml` has no `before_analyze` / `after_analyze` hooks. No files were modified.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| U1 | Underspecification | MEDIUM | tasks.md BE-031; plan.md layer table and handoff #36; data-model §6.1-3 | BE-031 calls the extracted `resolveLiveTranscriptTarget(record)` "a pure function with no I/O" and leaves it out of `services-not-to-io` on that basis. The real `liveTranscriptTargetKey` (`resume-service.ts:136-166`) is `async` and reads `deps.runtimes()`, `deps.enumerationTargets()`, `deps.pastResumeSource()` and `await deps.providers()`. The one-argument signature cannot hold "without changing behavior". | State the real signature, e.g. `(record, deps) => Promise<string \| null>` with injected deps. Re-check the `services-not-to-io` exclusion against injected-vs-direct I/O. |
| U2 | Underspecification | MEDIUM | tasks.md BE-020; contracts C-2; research R-03 | BE-020 uses `sdkModelOf(entry)` from `launch-preparation.ts:95`, which is module-private, and `launch-preparation.ts` is not in BE-020's file list. `entry` there is a `ModelEntry`, easy to confuse with the registry `Entry`. | Add `launch-preparation.ts` (export it, or move it to domain `model-catalog.ts`) to BE-020's files; name the argument as the catalog `ModelEntry`. |
| U3 | Underspecification | MEDIUM | data-model §4.2; contracts C-2; FE-020 | A late success after the 10 s `timeout` is discarded. For `set-model`, the SDK may have switched while `currentModelId` / `ContextCostMeter` keep the old value; `changing` is released so a second request can overlap. Permission mode recovers via `meter`; model has no such path. | Define what a late `control-result` does for `set-model`, or record the stale display as a risk (RK). |
| I1 | Inconsistency | MEDIUM | spec FR-007 / US-2; data-model §8.3; `OverviewTab.tsx:86-88` | The Configuration tab (InitReportTab) shows `init`'s model. `setModel` does not re-emit `init`, so after a switch the header / Overview and the Configuration tab disagree. | Add an Edge Case stating which display wins, and a task or note for InitReportTab. |
| I2 | Inconsistency | MEDIUM | spec US-2 AC1, FR-005; data-model §2; research R-03 | Spec says options equal the launch dialog's list; plan filters by launch effort (`switchableModels`). FR-005 never mentions the effort filter, which becomes an `invalid-value` rejection in main. | Amend FR-005 / US-2 AC1 to "catalog models that support the launch effort (effort unchanged)". |
| I3 | Inconsistency | MEDIUM | spec Clarifications; data-model §8.2; tasks FE-030 | Rename trigger: `h2` itself as a button vs a separate button next to the heading. Affects a11y and SC-005 tests. | Pick one (separate button next to `h2`) and align spec, data-model and FE-030. |
| C1 | Constitution (XV) | MEDIUM | data-model §8.2 vs §8.4; tasks FE-001, FE-020 | Reason text 「この Provider にはモデルの一覧がありません」 is missing from `LIVE_SETTING_LABELS` (§8.4) and is not a `LiveSettingBlocker` value; FE-001's coverage test will not catch it. Risks a hard-coded string. | Add `noCatalog` (or similar) to §8.4 and FE-001. |
| C2 | Constitution (XIII) | MEDIUM | spec U-7; plan Constitution Check XIII; tasks (no task) | Principle XIII requires the PR description to list compared candidates and why each does not fit. Only the F-section note (SH-010) is tasked. | Add the PR-description item to SH-011 or `/cl-done`, with per-element misfit reasons. |
| I4 | Inconsistency | LOW | `OverviewTab.tsx:108`; tasks FE-011 | Existing O-4/014 note says permission mode is not shown permanently in the center header; 023 reverses it, but only the CenterHeader note is updated. | Have FE-011 also update the OverviewTab note. |
| I5 | Terminology | LOW | spec ("4 layers"), U-2 ("2 stages"), plan / AD-062 ("3 stages + backstop") | Guard count on the permission-mode path differs. | Use one description. |
| I6 | Terminology | LOW | FE-011 (`PERMISSION_MODE_LABELS`) vs `OverviewTab.tsx:112` (`PERMISSION_MODE_NAMES`) | Two label tables for the same mode. | Confirm agreement or use one. |
| I7 | Inconsistency | LOW | research R-12 ("plan handoff #17-#20") vs plan #21-#23 | Wrong cross-reference numbers. | Change to #21-#23. |
| I8 | Inconsistency | LOW | plan Scale/Scope vs SH-011; plan layer table | Breakdown adds up to 5; `LiveSettingsControls.tsx` and `e2e/live-session-settings.spec.ts` missing. | Add them to the plan's layer table. |
| I9 | Inconsistency | LOW | tasks.md `[P]` on FE-001 vs dependency on BE-003 | FE-001 could run in parallel with BE-003 though it imports its types. | Drop `[P]` or note the dependency. |
| G1 | Glossary (XIV) | LOW | glossary `SessionControl` (:1007), `AgentSession` (:43); SH-001 | Glossary lists 5 kinds (missing `respond-elicitation`) while SH-001 says "6 → 8"; `AgentSession` entry not updated for `setPermissionMode` / `setModel`. | SH-001 lists all 8 kinds and updates `AgentSession`. |
| A1 | Ambiguity | LOW | data-model §5.3 line 132 | Line/paragraph separators appear as invisible literal characters. | Write them as U+2028 / U+2029. |
| U4 | Underspecification | LOW | spec US-3 AC2; SC-006; RK-06 | Past-list name after rename is checked only manually (V-3). | Accept as manual, or add a check that the past list shows `customTitle` after `sessionsChanged`. |
| U5 | Underspecification | LOW | data-model §4.2; BE-008 | Synchronous failure of `connection.control` before pending registration is undefined. | Resolve immediately as `session-ended`. |
| U6 | Wording | LOW | spec Summary | Says the name stays Claude Code's automatic title; live row actually shows `name ?? folder name`. | Fix the wording. |

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 | Yes | BE-010, BE-009 | |
| FR-002 | Yes | BE-001, BE-005, BE-007 | |
| FR-003 | Yes | BE-007, FE-011 | |
| FR-004 | Yes | BE-007, BE-008, FE-011 | |
| FR-005 | Yes | BE-004, BE-020 | See I2 |
| FR-006 | Yes | BE-005, BE-007 | |
| FR-007 | Yes | FE-020 | See I1 |
| FR-008 | Yes | BE-001, SH-010 | |
| FR-009 | Yes | BE-003, BE-035 | |
| FR-010 | Yes | BE-003, BE-034 | |
| FR-011 | Yes | BE-031, BE-032, BE-033, BE-034 | See U1 |
| FR-012 | Yes | BE-034, FE-030 | |
| FR-013 | Yes | FE-011, FE-020, FE-030 | See I3 |
| FR-014 | Yes | BE-010, BE-020, FE-001, SH-011 | |
| FR-015 | Yes | SH-010, SH-011 | |
| FR-016 | Yes | SH-010 | See C2 |
| FR-017 | Yes | BE-001, BE-002 | |
| FR-018 | Yes | SH-001, SH-010 | |
| SC-001 | Yes | BE-005, BE-007, BE-010 | |
| SC-002 | Yes | BE-001, BE-002 | |
| SC-003 | Yes | BE-004, BE-005, BE-007, BE-020 | |
| SC-004 | Yes | BE-003, BE-034, BE-035 | |
| SC-005 | Yes | FE-011, FE-020, FE-030 | |
| SC-006 | Yes | BE-009, FE-012, FE-021, FE-031 | |
| SC-007 | Yes | SH-010, SH-011 | |
| SC-008 | Yes | SH-011 | |
| SC-009 | Yes | SH-011 (quickstart V-0 to V-6) | Manual |

**Constitution Alignment Issues:** No CRITICAL (MUST) conflicts. III / IV / VI / VII / VIII / X / XII / AD-031 aligned. Standard-principle gaps: C1 (XV), C2 (XIII), G1 (XIV).

**Unmapped Tasks:** None.

**Metrics:**
- Total Requirements: 27 (FR 18 + SC 9)
- Total Tasks: 27 (SH 3 / BE 17 / FE 7)
- Coverage: 100%
- Ambiguity Count: 1
- Duplication Count: 0
- Critical Issues Count: 0
- Severity counts: **Critical 0 / High 0 / Medium 8 / Low 11** (19 findings)
