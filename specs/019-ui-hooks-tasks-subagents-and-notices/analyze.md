## Specification Analysis Report — 019-ui-hooks-tasks-subagents-and-notices (O-11)

This was a read-only run and no files were modified. I did not run `check-prerequisites.ps1`, following the CLAUDE.md rule against spawning processes; the feature directory was given. All six artifacts are present (spec, plan, tasks, data-model, research, quickstart). `.specify/extensions.yml` has no `before_analyze` or `after_analyze` hooks.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I1 | Inconsistency (ADR vs spec) | HIGH | docs/decisions/0056 Decision 2; spec.md FR-005, US-2 AC2; data-model §2.3 | AD-056 Decision 2 says list row names come from the transcript task row, with the note "`local_bash` は名前を出さない". FR-005 and data-model §2.3 say the opposite: the `local_bash` row `name` carries the Bash command name (`bashCommandName`). The plan's ADR section says "AD-054 / AD-056 は変えない", so the conflict stays in the record. | AD-056 is still proposed, so edit Decision 2 in place: "`local_bash` は起動した `Bash` の呼び出しのコマンドの名前だけ (description は出さない)". Or drop FR-005 naming. Do this before approval. |
| G1 | Governance / gated decisions | HIGH | spec.md "未承認の判断の一覧" U-1–U-8; plan "未承認の判断"; tasks.md "着手の条件" | U-3 (owner domain of the background task list) and U-7 (not using Principle XIII's Agent handoff) are AGENTS.md gated decisions with no human approval. AD-054/055/056 are proposed. The artifacts handle this correctly (implementation is blocked until approval), but `/cl-implement` cannot start. | Get the user's approval for U-1–U-8 and the 3 ADRs (AskUserQuestion in main) before `/cl-implement`. Follow RK-01 for any decision that gets overturned. |
| T1 | Terminology drift (Principle XIV) | MEDIUM | glossary.md:81-85 (日本語表記: バックグラウンドタスク); spec, data-model §2.5, FE-022 (tab label 「背景の task」); plan Glossary excerpt | The canonical Japanese for Background task is 「バックグラウンドタスク」. The spec and the UI label use 「背景の task」, two words for one concept. The plan's glossary excerpt misquotes it as "Background task (背景の task)". | In SH-001, either change the glossary's 日本語表記 (record the reason) or use 「バックグラウンドタスク」 for the tab label and FE-022 wording. |
| T2 | Inconsistency (glossary vs feature) | MEDIUM | glossary.md:83-89; tasks SH-001 | The glossary Definition limits Background task to `is_backgrounded: true`. Its Domain line says 「状態の一覧は持たない (session も ui も)」 and its Counterexample says foreground tasks never get a row. This feature adds a list and rows for tasks moved to the background later. SH-001 only names rewriting `:89`. | Expand SH-001 to rewrite the `:83` Definition, the `:86-87` Domain line (now the latest list is kept in `meters`) and the `:88` Counterexample. |
| U1 | Underspecification | MEDIUM | spec US-2 AC4; data-model §2.5; FE-022 | US-2 AC4 says the list "starts empty" on process start. The data-model uses `null` (not yet received, no count shown), separate from `[]` (0 tasks). What the tab body shows in the `null` state (empty message, or nothing) is not specified. | Add one row to data-model §2.5 defining what the body shows when `null`, and pin it in the FE-022 test. |
| U2 | Testability / AC | MEDIUM | spec US-3 AC3; research R-09; plan RK-11 | In SDK 0.3.270 types, system messages do not carry `parent_tool_use_id`. AC3 (a divider inside the live nesting) can pass with fakes but may never happen in practice. | Mark AC3 as conditional on V-5 in the spec text, or move it to Edge Cases. |
| C1 | Coverage (NFR) | MEDIUM | plan RK-04; data-model §3.1; tasks BE-030/BE-031 | The whole root DTO is re-sent (up to 1 MB) every time a child is added. RK-04 says to add throttling in tasks if it gets heavy, but no task measures this or holds a fallback. | Add a resend-size/count check to BE-030's tests, or add V-4's subjective result as an explicit decision point in SH-013. |
| C2 | Coverage (SC dependency on manual work) | MEDIUM | spec SC-005; quickstart V-1–V-6; tasks SH-013 | SC-005 requires the quickstart to record the `hook_name` shape, whether rows survive in past logs, and more. Those are user tasks that SH-013 leaves undone, so the SC cannot be completed by the tasks alone. RK-06 (`is_backgrounded` may never arrive) can also affect M3 completion. | Split SC-005 into an automated part (item 21) and a manual-record part. State that M3 completion is decided after V-3. |
| P1 | Task-marker inconsistency | LOW | tasks.md US-2 BE-021 [P] / FE-020 [P]; dependency list item 3 | FE-020 depends on BE-021's types (`BackgroundTaskEntry`), but both carry [P], so by the stated [P] definition they could run in parallel. | Remove [P] from FE-020, or state the dependency on BE-021 explicitly in the task. |
| P2 | Ordering | LOW | tasks.md "順序の制約" | Order is stated for same-file tasks on `thread.aui.tsx`, but `subagent.aui.tsx` (FE-021, then FE-031) is only implied by section order. | Add `subagent.aui.tsx: FE-021 → FE-031` to the ordering constraints. |
| A1 | Ambiguity (assumed values) | LOW | data-model §3.1 (live children 500 "[ASSUMED] の数値と同じ値"); §2.4 `MAX_BACKGROUND_TASKS = 64` | The live per-tool-call child cap (500) and the list cap (64) are not in the spec's [ASSUMED] list. 500 reuses the per-subagent message count, which is a different quantity. | Add both to spec Clarifications/Assumptions (as [ASSUMED] or as safety caps). |
| S1 | Scope creep (minor) | LOW | data-model §1.4; FE-011; research R-03 | The attention tone is also applied to failed SessionStart/Setup hooks. FR-003 covers only general hooks. | Add one line to FR-003 saying SessionStart/Setup hooks get the same tone. |
| D1 | Constitution (Principle IV wording) | LOW | constitution.md Principle IV Statement; AD-055 Consequences | The Statement lists the session read APIs (listSessions/getSessionMessages/...), and `listSubagents`/`getSubagentMessages` are not in it. AD-055 says "本文は変えない". This is not a MUST violation (the MUST is not parsing JSONL yourself), but the list goes stale. | Consider a separate PATCH amendment. No change needed in this feature. |
| D2 | Constitution (Principle XIII process) | LOW | Principle XIII Exceptions; plan Constitution Check XIII; tasks (none) | The new self-built parts (`BackgroundTasksTab.tsx`, `markdown-body.tsx`) need the compared candidate names (Background runs, Task card, ...) and the reasons they don't fit in the PR description. No task carries this. | Add it to SH-013 or the `/cl-done` PR body checklist. |
| T3 | Terminology (minor) | LOW | spec US-2 AC2 「シェル」 vs data-model §2.3 「シェルのコマンド」 | The plan admits the mismatch and explains it in data-model, but the spec still says 「シェル」. | Change the spec AC2 to 「シェルのコマンド」. |

### Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 includeHookEvents | Yes | BE-002 | |
| FR-002 general hook rows / masked ordinals | Yes | BE-010, FE-010 | |
| FR-003 appearance / read-aloud | Yes | FE-011 | S1 |
| FR-004 late-backgrounded task row | Yes | BE-020, BE-022, BE-023, FE-021 | RK-06 |
| FR-005 shell command name | Yes | BE-001, BE-020, BE-022, BE-023, FE-021, FE-022 | I1 |
| FR-006 background-tasks meter / tab | Yes | BE-021, BE-023, FE-020, FE-022 | U1, T1 |
| FR-007 forwardSubagentText | Yes | BE-002 | |
| FR-008 live nesting / resend | Yes | BE-030, BE-031 | C1 |
| FR-009 nested results / divider / marks | Yes | BE-031, FE-001, FE-031 | U2 |
| FR-010 past-log subagents | Yes | BE-032, BE-033 | |
| FR-011 same shape live/past | Yes | BE-032, FE-030, FE-031 | |
| FR-012 ui-coverage rewrite | Yes | SH-011 | relies on V-2 |
| FR-013 pin tests / item 14 fixtures | Yes | BE-002, BE-021, BE-040 | |
| FR-014 roadmap O-12 | Yes | SH-010 | |
| FR-015 approval / ADR accepted / charters | Yes | SH-002 | G1 |
| FR-016 glossary / overview / prompts / O-8 (c) | Yes | SH-001, SH-010, SH-012 | T1, T2 |
| SC-001 | Yes | BE-010, FE-010, FE-011 | |
| SC-002 | Yes | BE-020–BE-023, FE-020–FE-022 | |
| SC-003 | Yes | BE-030–BE-033, FE-031 | |
| SC-004 | Yes | BE-002, BE-021, BE-040, SH-013 | |
| SC-005 | Partial | SH-011, SH-013 | C2: the manual quickstart records are user tasks |

**Constitution alignment issues:** No NON-NEGOTIABLE (I–VIII) violations. The plan's I (`pathTail` is string slicing, not a path value), IV (reads go through SDK APIs), V (description, hook output and exit codes are not read) and VII (agents depend only on domain) all hold up. Standard-level notes: D1 (IV wording), D2 (XIII PR-description duty), T1/T2 (XIV terminology). XII is covered by SH-011.

**Unmapped tasks:** None in practice. FE-001 (rendering spike) and FE-030 (shared markdown part) support FR-009/FR-011. SH-012 (name lists and src comment cleanup) supports FR-016 and plan handoff items #22/#25–#27. SH-013 is overall verification.

### Metrics

- Total requirements: 21 (16 FR, 5 SC)
- Total tasks: 26 (SH 6, BE 12, FE 8)
- Coverage: 100% of FR (16/16) and 95% overall (SC-005 is partial)
- Ambiguity count: 3 (U1, U2, A1)
- Duplication count: 0
- Critical issues: 0

### Next Actions

- No CRITICAL issues. `/cl-implement` is still blocked by G1: get approval for U-1–U-8 and AD-054/055/056 in main before implementing.
- Before approval, edit AD-056 Decision 2 in place for I1 (it is proposed, so editing is allowed).
- The terminology fixes (T1, T2) go into SH-001: settle 「バックグラウンドタスク」 vs 「背景の task」.
- Under AD-050, the MEDIUM/LOW items should stay in the gate output and not be fixed here.

**Severity counts: Critical 0 / High 2 / Medium 6 / Low 7**
