## Specification Analysis Report

**Feature**: `specs/017-ui-conversation-time-and-activity` (O-9)
**Artifacts analyzed**: spec.md, plan.md, tasks.md, data-model.md, research.md, quickstart.md, and `docs/decisions/0051-message-time-source-and-display-only.md` (AD-051, proposed, uncommitted)
**Supporting context**: constitution.md (Principles I–XV), ui charter, `_overview.md`, glossary.md, ADRs 0019 / 0034 / 0044 / 0045 / 0046 / 0047 / 0049 / 0050
**Mode**: read-only. No files were modified. `.specify/extensions.yml` has no `before_analyze` / `after_analyze` hooks.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I1 | Inconsistency | MEDIUM | spec.md:L130 (US-2 AC1); data-model.md:L91; tasks.md:L57 (FE-022 test) | US-2 AC1 says boundary marks (compaction, conversation reset, model refusal) appear for **both past and running** conversations. In `src`, only `compact-boundary` exists on the past-log path (`convert.ts:77-81`, the divider). `conversation-reset` and `refusal` rows are built only in agents (`live-signals.ts:633/646/798`). This matches AD-047 Decision 3: rows are not added to the past-log conversion. The FE-022 test says "past and running fixtures, all three O-6 marks", which cannot be met for past logs. | Say in US-2 AC1 / data-model §2 `marks` that past logs only show `compact-boundary`, and that `conversation-reset` / `refusal` are running-only. Narrow the FE-022 test to match. |
| I2 | Inconsistency | MEDIUM | spec.md:L32, L196 (FR-014 "the 4 rows"); plan.md:L14, L313-314; data-model.md:L231-232; quickstart.md:L27 | FR-014 / Summary list 4 F-section rows to rewrite. Plan and data-model add a 5th: a new `Conversation map` row, with the header count changing to 128. The plan says spec "is not changed" on purpose, so FR-014 (the source of truth for behavior) under-describes what SH-011 and quickstart V-2 check. | Add the Conversation map row (Principle XIII Exceptions procedure) to FR-014 in one clause, or have FR-014 point to data-model §7 for the full list. |
| T1 | Terminology (Principle XIV) | MEDIUM | spec.md:L30, L139-153, L98 vs L191 (FR-012), L205; data-model §5 | The same UI is called "活動の heat graph" (activity heat graph; Summary, US-3, Clarifications) and "活動の帯" (activity band; FR-012/013, Key Entities, glossary plan, UI label). Principle XIV bans synonyms across code / spec / UI. "Heat graph" is also the name of an F-section registry element, which makes the two harder to tell apart. | Use "活動の帯" for the app concept everywhere. Keep "Heat graph" only when naming the registry element (U-6 / F-section). Note this in the SH-001 glossary entry. |
| T2 | Terminology (Principle XIV) | MEDIUM | spec.md:L160 (Edge case "1 つの API のターン"); data-model.md:L93; SH-001 | "ターン" (turn) is defined as "one user input plus the messages until the next input". The same spec also uses it in the SDK sense (one API turn, cf. `num_turns` / the `max-turns` failure reason in AD-047). The glossary has no "Turn" entry yet, and SH-001 adds no counterexample. | In SH-001's glossary entry for ターン, add a counterexample that separates it from the SDK / API turn (`num_turns`, `max-turns`). Reword the Edge case to "1 回の API の応答" (one API response) or similar. |
| T3 | Terminology | LOW | glossary.md:L738-748 (Recent activity / `Activity` / `deriveActivity`); data-model §4 (`activityBins`) | The new identifiers `activityBins` / "活動の帯" sit next to the existing session-domain term "Recent activity (直近の活動)", whose identifier is `Activity`. Readers could confuse them. | Add a one-line counterexample in SH-001: the activity band is not Recent activity. |
| C1 | Coverage (docs drift) | MEDIUM | glossary.md:L867-872 (SessionMessage definition); SH-001; data-model §1 | The glossary's `SessionMessage` entry lists its fields exhaustively and has no `timestamp`. U-2 / AD-051 now rely on `timestamp`, a field the implementation returns that is not in the published type. SH-001 does not update this entry. | Add to SH-001: a note on the SessionMessage entry that the implementation returns `timestamp` outside the published type (AD-051), plus an AD-051 Ref. |
| C2 | Coverage (docs drift) | LOW | constitution.md:L833, L842 ("127 names"); ui charter.md:L146 ("registry の名前は 127"); data-model.md:L232 (128) | Adding Conversation map makes the F section 128 names. The charter Key concepts count goes stale, and SH-010 does not update it. The constitution's "127" sits in Why / Exceptions; it is not a violation, because Exceptions expects new names to be added, but the number goes stale. | Add the charter :146 count update to SH-010. Leave the constitution number for a separate amendment or the milestone cleanup, since this analysis does not touch the constitution. |
| U1 | Underspecification | MEDIUM | data-model.md:L171 ("now は表示の時点で 1 回だけ取る"); FE-010 / FE-012 / FE-022 / FE-031 | `formatMessageTime(ms, now)` needs `now`. Nothing says who reads the clock: ConversationTimeProvider, each MessageTimeLabel, or the map tab. It also does not say whether center, map and band share one `now`. SC-002 depends on a fake clock, so where the clock is injected matters. | In data-model §5, name the owner of `now`, e.g. a value in ConversationTimeProvider's context taken when `messages` changes, which the map tab reuses through the shared store. Name the injection point FE-012 tests use. |
| U2 | Underspecification | LOW | spec.md:L165 (Edge case: navigation target retracted → does not move); FE-020 / FE-022 tests | Only "the row disappears on the next update" is tested. "Does not move / no error" when `navigateTo` gets a retracted or evicted id has no test. | Add a FE-022 (or FE-020) test: `navigateTo` with a retracted id keeps focus, does not scroll, and does not throw. |
| U3 | Underspecification | LOW | spec.md:L150 (US-3 AC2 "選べない"); data-model.md:L214 | The spec says empty bins "cannot be selected". The data-model says focus still stops on them, with `aria-disabled="true"` and no navigation. The plain reading of "cannot be selected" differs from "focusable but inert". | Reword AC2 to "selecting does not navigate (focus still stops; aria-disabled)". |
| I3 | Inconsistency | LOW | spec.md:L81 (U-4), L149 (US-3 AC1: "first and last message times"); data-model.md:L126; research R-09 | The spec defines the band range as the first and last message times. The data-model deliberately uses min / max timestamps, so that clock rollback does not push times outside the range. FR-012 makes the data-model canonical, so behavior is clear, but the AC text conflicts with it. | Change US-3 AC1 / U-4 to "the earliest and latest timestamps". |
| I4 | Inconsistency (ADR wording) | LOW | AD-051 Decision 2 ("SDK が時刻を持たないもの (システムイベントの行) は受信時刻"); data-model.md:L52 (`rowEvent` → `clock.now()`); BE-012 | For O-4–O-6 rows, the time comes from the signals clock when the row is built (`live-signals.ts:117`). Some rows are built at turn end (refusal from `retracted_message_uuids`). This is not exactly the `for await` `receivedAt` that Decision 2 / data-model L55 describe as "the same clock". The difference is small, but the ADR text is stricter than the design. | In AD-051 Decision 2 (still proposed), say "receive time, or for rows built by agents the time the row was built". |
| A1 | Ambiguity | LOW | data-model.md:L51 (running path, O-2 Hook / task row, "change location" column shows `toSystemEventMessage(message, null)`) | The "change location" column shows the current code (`null`), not the target, unlike the other rows. Readers could take `null` as the intended value. | Change it to "`sdk-agent-session.ts:678`: pass `receivedAt` instead of `null`". |
| E1 | EARS completeness | LOW | spec.md:L174-198 (FR-001..016) | FRs are mostly ubiquitous "shall" statements. Event and unwanted-behavior clauses that exist only in Edge cases or Clarifications are not in the FRs. FR-003 does not include the message-queue condition (time = actual send, not enqueue). FR-010 has no "if the target no longer exists, do not move". FR-006 / FR-012 point to Clarifications for thresholds, which is fine. No placeholders or TODOs were found. | Optional: add "if queued, the time is when it is handed to the SDK" to FR-003, and "if the target is missing, do not move and keep focus" to FR-010. Tasks already cover the first; U2 covers the second. |
| D1 | Dependency listing | LOW | spec.md:L222-229 (Dependencies) vs tasks.md:L9 | Tasks list O-5 (#17) as a merged prerequisite. The spec's Dependencies section leaves out O-5, though the spec mentions O-5's "構成" tab as the previous tab in the table. | Add O-5 (015) to the spec Dependencies, or drop it from the tasks start condition. |
| D2 | Coverage (verification) | LOW | tasks.md:L82 (SH-013 includes `-p e2e/tsconfig.json`); quickstart.md:L18 (V-1 #3 lists only node / web) | SH-013 runs the E2E typecheck, but quickstart V-1 does not list it. quickstart-results.md would therefore not record it. | Add the e2e tsconfig typecheck to quickstart V-1 #3. |
| G1 | Governance (constitution / AGENTS.md) | MEDIUM | spec.md:L43-55 (U-1..U-7 unapproved), L49 (U-1 = domain ownership of a cross-domain contract change); tasks.md:L9 | U-1 decides that ui changes session contract values. AGENTS.md requires human approval for domain decomposition, and U-1 comes close to that. It is correctly marked unapproved, and tasks.md blocks implementation until approval. This is a sequencing risk, not a violation: if U-1, U-2 or U-3 is rejected, BE-010 to BE-012 and AD-051 are rewritten. | Keep the gate as is. Get explicit user approval of U-1 to U-7 and AD-051 before the status moves to implementing, and record it in spec.md (approval date per U-#). |

No CRITICAL findings. No constitution MUST violations were found. Each plan Constitution Check row (I–XV) matches the constitution's principle titles and statements: I path API, II platform branching, IV SDK only, VII supervisor without Electron, VIII IME, X external session store, XII ui-coverage, XIII element priority with name-by-name matching and the new-registry-name procedure, XIV glossary before code (SH-001 comes before code), and XV labels.ts / AD-045.

**ADR citation check (all verified correct)**:
- **AD-046**: Decision 4 is the tab table that later features add rows to. Decision 6 is the placement vocabulary.
- **AD-045**: labels go in `labels.ts`.
- **AD-047**: rows are assembled in agents. Decision 4 keeps the allowlist and options keys unchanged.
- **AD-049**: boundaries and retraction.
- **AD-044**: item 21.
- **AD-034**: 1 request = 1 process.
- **AD-019**: inventory.
- **AD-050**: correctly cited as proposed.
- **AD-051**: frontmatter and section layout (Context / Decision / Consequences / Alternatives / Confirmation) match AD-049 / AD-050. Its Confirmation points to SC-001, SC-005 and quickstart V-3 #1, all of which exist.

Glossary and charter line references in the plan (`glossary.md:209`, `:1028`, `:1051`, `:1075`, `:1083`, `:1134`; `charter.md:61`, `:65`, `:162`, `:234`, `:251`) are accurate.

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 past-log createdAt | Yes | BE-001, BE-010 | Includes Hook / task merge and nested subagent messages |
| FR-002 live createdAt (assistant / result-only / rows) | Yes | BE-011, BE-012 | See I4 for row clock wording |
| FR-003 user input time | Yes | FE-010 | Queue case tested |
| FR-004 validate, no sorting | Yes | BE-001, BE-010 | Ordering test on the past path. Live path has no sort code |
| FR-005 no contract / IPC / allowlist change | Yes | BE-010, BE-011, SH-013 | quickstart V-2 |
| FR-006 center message time | Yes | FE-010, FE-012 | |
| FR-007 turn duration | Yes | FE-011, FE-012 | |
| FR-008 map tab in table | Yes | FE-022 | panel-tabs fixed test (#24) |
| FR-009 map row content | Yes | FE-011, FE-022 | See I1 (marks per path) |
| FR-010 navigate via O-3 path | Yes | FE-020, FE-021, FE-022 | See U2 |
| FR-011 virtualized, throttled, no focus steal | Yes | FE-022 | |
| FR-012 activity band | Yes | FE-030, FE-031 | |
| FR-013 band interaction / a11y / tokens | Yes | FE-031 | |
| FR-014 ui-coverage rewrite | Yes | SH-002, SH-011 | See I2 |
| FR-015 AD-051 | Yes | (AD-051 exists), SH-010 | Consistency re-check in SH-010 |
| FR-016 records (glossary / charters / roadmap / prompts) | Yes | SH-001, SH-010 | See C1, C2 |
| SC-001 time filled | Yes | BE-001, BE-010, BE-011, BE-012, FE-010 | |
| SC-002 time / duration shown | Yes | FE-012 | See U1 (clock injection) |
| SC-003 map navigation, row bound, axe | Yes | FE-022 | |
| SC-004 band, bins table, axe | Yes | FE-030, FE-031 | data-model §4 has 11 rows |
| SC-005 boundary unchanged | Yes | SH-013 | |
| SC-006 coverage / records / AD-051 | Yes | SH-011, SH-013 | |

**Constitution Alignment Issues:** None at MUST level. Advisory items:
- G1: U-1 human approval is still pending. The tasks gate correctly blocks on it.
- C2: the stale "127" registry count in the Principle XIII Why / Exceptions text needs a separate amendment, not an edit in this feature.

**Unmapped Tasks:** None. SH-012 (allowlists that list files by name) and SH-013 (verification) are cross-cutting and support FR-005 / FR-014 / SC-005 / SC-006.

**Metrics:**

- Total Requirements: 22 (16 FR + 6 SC)
- Total Tasks: 18 task IDs
- Coverage %: 100% (22/22 requirements have at least 1 task)
- Ambiguity Count: 4 (A1, U1, U3, I3)
- Duplication Count: 0
- Critical Issues Count: 0
- Severity totals: CRITICAL 0 / HIGH 0 / MEDIUM 7 (I1, I2, T1, T2, C1, U1, G1) / LOW 10 (T3, C2, U2, U3, I3, I4, A1, E1, D1, D2). Total findings: 17.

### Next Actions

- No CRITICAL or HIGH issues. The design may proceed once U-1 to U-7 and AD-051 are approved (G1). Per AGENTS.md / AD-050, MEDIUM and LOW findings stay in the gate output and do not need fixing now. Cheapest optional fixes are spec / data-model wording via `Agent(designer)`: I1, U1, T1 / T2, I2, C1.
- No `/speckit-specify` or `/speckit-plan` rerun is needed. All fixes are local edits.
