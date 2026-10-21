## Specification Analysis Report

**Feature**: `specs/021-session-resume` (X-9, domain `session`, targets `both`, status `tasking`)
**Artifacts read**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/ipc-session-resume.md, quickstart.md, `.specify/memory/constitution.md`, session charter, AD-059 (proposed). I also checked that every cited ADR file exists, and checked the source anchors the plan cites against main 7e13d60 (`sdk-agent-session.ts`, `supervisor-protocol.ts`, `agent-session.ts`, `session-core.ts`, `validation.ts`, `LivePane.tsx`).
**Extension hooks**: not checked. `.specify/extensions.yml` was not read in this run.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I1 | Inconsistency | HIGH | data-model.md §6.4; plan.md 実装方針 agents (L212); tasks.md BE-004; research.md R-07 | The plan and tasks list three failure sites to route through `crashReason()`: `:717`, `:727` and `:932`. The data-model calls them "child exit / stream exception / stream ended without init". In the code, `:727` is `fatalSink`, which fires on a JS exception inside the session thread. It is not the "stream ended without init" path. A stream that ends cleanly without `init` calls no `fail` today at all. As written, BE-004 would turn internal JS exceptions into `resume-failed`, which goes against R-07's reasoning ("most causes are a conversation that cannot be found"). Its 3×3 test table also expects `resume-failed` on a path that has no failure call. | In §6.4 / BE-004, name the exact sites. Child `exit` (`:717`) and stream exception (`:932`) become `resume-failed` before `init`. Keep `fatalSink` (`:727`) as `process-crashed`, or state explicitly why it should change. Also decide whether a clean stream end without `init` on a resume launch should become a new failure path. If yes, add it to the plan as a new path rather than presenting it as an existing site. |
| C1 | Coverage Gap | MEDIUM | spec US-2 AC2; tasks.md BE-006 / BE-020 tests | US-2 AC2 names `supervisor-exited` as a resumable failure. No task checks that the `ConversationRecord` survives a supervisor abnormal exit (`synthesizeExit(ids, 'supervisor-exited')` plus a generation change). No task checks that a `live` resume from that row is accepted afterwards. | Add to the BE-006 / BE-020 tests: after `supervisor-exited`, the record stays and `resolveResumeSource({kind:'live'})` resolves it. Later `conversation` events for the old generation are still discarded. |
| U1 | Underspecification | MEDIUM | spec U-4 / FR-010; data-model §5 step 9 and §9.4 | U-4 avoids keeping two rows of the same conversation, but only for `live` sources. If a user resumes from the **past** row while an ended or failed live row of the same conversation is still in the running list, both rows remain. The old row still shows 「再開」, and pressing it would return `already-running`. | State the intended behavior: either accept two rows and document it in Edge Cases, or have main also drop or replace any non-alive live row whose record has the same `conversationId`. Add a test in BE-020 / FE-010. |
| I2 | Inconsistency | LOW | plan.md layer table (domain `agent-session.ts` `:63`, `:125`); tasks.md BE-002 | The line anchors are swapped. In the code, `LAUNCH_FAILURE_REASONS` is at `:63` and `LaunchQueryOptions` is at `:125`. BE-002 states the reverse. | Swap the anchors in plan and BE-002. |
| I3 | Inconsistency | LOW | tasks.md 順序の制約 (`session/labels.ts は BE-002 → FE-012 → FE-020`) | FE-011 (adds the §10 labels) and FE-040 (read-failure label) also edit `labels.ts`, but the same-file order omits them. | Change the order to BE-002 → FE-011 → FE-012 → FE-020 → FE-040. |
| I4 | Inconsistency | LOW | plan.md layer table, renderer `features/chat/` row (`convert.ts:179`) vs tasks.md FE-040 | The plan places the `retryTextFor` change under `features/chat/`. The function is actually defined in `features/session/LivePane.tsx:164`, which FE-040 cites correctly. | Change the plan row to `LivePane.tsx:164`. |
| I5 | Inconsistency | LOW | research.md R-09 決定 (P-8) | R-09 cites "data-model §9.3" for the divider. The divider and insertion rules are in §8.2. §9.3 is the dialog. | Fix the reference. |
| I6 | Terminology drift | LOW | spec.md Clarifications (rejection-message bullet) vs FR-011 / U-5 / data-model §10 | The spec gives 「この会話はすでに実行中です」 as the message when the same conversation is running. FR-011 / U-5 select that row with no message. data-model §10 reassigns the text to the in-flight `conversation-running` case. | Change the spec clarification to say the message applies to `conversation-running` (a second request while one is still being prepared). |
| I7 | Inconsistency | LOW | plan.md Project Structure (`spec.md # status を planning に`) | The comment is stale. The spec frontmatter says `status: tasking`. | Remove or update the comment. |
| U2 | Underspecification | LOW | data-model §9.1 (past row table) / §10 `cwd-mismatch` | The `cwd-mismatch` label tells the user to register that subdirectory, but the 「作業フォルダとして登録」 action is only offered for `folder-unregistered`. | Either also offer the registration action for `cwd-mismatch`, seeded with the row's cwd, or reword the label. |
| E1 | Ambiguity / EARS | LOW | spec FR-003, FR-004, FR-015 | Each of these packs several obligations into one statement. FR-003 covers carrying, storing, non-persistence, no logging and a fresh `sessionId`. FR-004 covers the option, the key-set pin and dual-boundary checks. FR-015 covers ADR, charter and roadmap. They are still testable, but trigger and response are harder to trace. | Optionally split them into atomic EARS statements, keeping in mind the review-cost guideline of 20 FRs. Leaving as-is is acceptable. |
| C2 | Coverage Gap | LOW | spec FR-003 last clause; tasks.md BE-013 tests | No test explicitly asserts 「Closta の `sessionId` は再開でも新しく採る」: the new row's `sessionId` should differ from both the source row's `sessionId` and the `conversationId`. | Add one assertion to the BE-013 tests. |
| D1 | Constitution wording | LOW | plan.md Constitution Check I / II | The paraphrases differ from the constitution titles. Principle I is 「`runtime.path` を経由する」, not "domain のパス API". Principle II is 「`AgentRuntime` 実装の内側」. This is not a violation, because the judgment (no new path building, no `process.platform`) is correct. | Use the constitution titles verbatim. |
| G1 | Process | LOW | tasks.md 着手の条件 | Implementation is blocked until AD-059 is `accepted` with a date. Under the overnight policy, design can proceed on recommended options, but this condition halts `/cl-implement` until the user approves. That matches the 020 precedent, so it is intended. | No change. Be aware that this is a hard stop for overnight autonomy. |

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 past row 「再開」 | Yes | FE-012, BE-012, BE-014 | |
| FR-002 live row 「再開」 only when not alive and has an id | Yes | FE-020, FE-010, BE-006, BE-014 | |
| FR-003 conversation id carried and kept in main, not persisted or logged | Yes | BE-004, BE-005, BE-006 | C2: fresh `sessionId` not asserted |
| FR-004 `resume` option, 12 keys, dual UUID check | Yes | BE-003, BE-011, BE-013 | |
| FR-005 past-row axis resolution | Yes | BE-001, BE-010, BE-012 | |
| FR-006 resume-form dialog, fixed 3 axes | Yes | FE-011, BE-012 | |
| FR-007 initial values from the original config | Yes | FE-030, FE-020 | |
| FR-008 missing inherited axis → launch-gate reason, no axis swap | Yes | BE-030, BE-012 | |
| FR-009 「やり直す」, no auto-resume | Yes | FE-020 | |
| FR-010 replace original row on accept, keep on reject | Yes | FE-010, FE-011, BE-020, FE-021 | U1: past-source case |
| FR-011 same conversation alive → select it, judged in main | Yes | BE-013, FE-011, FE-021 | |
| FR-012 prior conversation read once, shown read-only | Yes | FE-040, BE-014, BE-020 | |
| FR-013 read failure does not block | Yes | FE-040, BE-014 | |
| FR-014 same gate, limit, runtime builders; `resume` added in one place | Yes | BE-013 | |
| FR-015 ADR, charter, roadmap records | Yes | SH-010 (+ AD-059 drafted) | |
| FR-016 glossary, ui-coverage | Yes | SH-001, SH-010 | |
| SC-001 6-way live resume on real machines | Partial | SH-010, SH-011 (records); quickstart V-1 | Manual, user-run; required before `/cl-done` |
| SC-002 12 keys, UUID rejected in main and agents | Yes | BE-003, BE-011, BE-014 | |
| SC-003 axis-resolution table | Yes | BE-001, BE-012 | |
| SC-004 action matrix | Yes | FE-012, FE-020 | |
| SC-005 dialog fixed / initial / preset | Yes | FE-011, FE-030 | |
| SC-006 replace / reject / already-running (unit + E2E) | Yes | BE-013, BE-020, FE-021 | |
| SC-007 prior conversation shown, failure tolerated, Win32 transcript | Yes / Partial | FE-040; quickstart V-2 | The Win32 part is manual |
| SC-008 existing tests and Constitution checks pass | Yes | SH-011 | |

**Constitution Alignment Issues**: none at CRITICAL. No requirement, plan element or task conflicts with a MUST principle (I–VIII). Standard principles IX–XV are each addressed in the plan's Constitution Check, and D1 is wording only.

**ADR citation check**: every cited ADR exists: AD-007, 018, 031, 034, 036, 038, 041, 043, 044, 047, 053, 054, 058, plus 059 (proposed). The cited sections match their sources:

- AD-041 (a), (f), (g) and (h) say what the artifacts claim.
- AD-036 "§4 P1" matches AD-036's own "§4 の P1-P3" wording.
- AD-047 Decision 1 lists 18 failure reasons, which matches the 18 entries in the code.
- The 11 query-option keys match `session-core.ts:64-78`, and the 12-key arithmetic in AD-059 Confirmation is consistent.
- AD-059 is structurally complete (Context, 読み替える箇所, Decision 1–4, Consequences, Alternatives, Confirmation) and agrees with data-model and contracts.

**Identifier consistency**: these identifiers match across spec, plan, data-model, contracts and tasks:

- `SessionResumeRequest` / `ResumeSource`
- `ResumeUnavailableReason` (8 values)
- `conversation-running`, `already-running`, `resume-failed`
- `ConversationRecord`
- the four IPC channels `closta:resolvePastResume`, `closta:resumeSession`, `closta:getResumedTranscript`, `closta:sessionResumable`
- `QUERY_OPTION_KEYS` 12, `LAUNCH_FAILURE_REASONS` 19
- `resumed:` prefix / `resumed:divider`

The internal `ResumeOutcome.reason` vs DTO `reasonKey` split follows the existing `LaunchOutcome` / `SessionLaunchHandshakeDTO` pattern and is not drift. Apart from I2 and I4, the code line anchors I checked are accurate (`:306`, `:717`, `:727`, `:870`, `:932`, `:91`, `:135`, `:152`, `validation.ts:179`).

**Unmapped Tasks**: none. SH-001, SH-010 and SH-011 map to FR-015, FR-016 and SC-008. The remaining tasks map to user stories US-1 through US-4.

### Metrics

- Total Requirements: 24 (FR 16 + SC 8)
- Total Tasks: 23 (SH 3, BE 13, FE 7)
- Coverage: 100% of requirements have at least one task (SC-001 and the Win32 part of SC-007 are covered only by the manual quickstart)
- Ambiguity Count: 1 (E1)
- Duplication Count: 0
- Findings by severity: CRITICAL 0 / HIGH 1 / MEDIUM 2 / LOW 10 (total 13)
- Critical Issues Count: 0

### Next Actions

- There are no CRITICAL issues, so this can proceed to implementation once AD-059 is accepted (G1).
- Fix **I1** in this round (HIGH, per AD-050). Have `Agent(designer)` correct data-model §6.4, plan 実装方針 agents and tasks BE-004: name the actual failure sites, decide what `fatalSink` should report, and decide whether a clean stream end without `init` becomes a new failure path.
- Leave the MEDIUM and LOW findings (C1, U1, I2–I7, U2, E1, C2, D1, G1) in the gate output for the end-of-milestone review. Edit them only if convenient while fixing I1.
