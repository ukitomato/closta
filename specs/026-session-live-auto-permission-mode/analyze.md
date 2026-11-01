## Specification Analysis Report

**Spec dir**: `specs/026-session-live-auto-permission-mode` (Round 2, analyze track)
**Artifacts read**: spec.md, plan.md, tasks.md, data-model.md, research.md (P-8 to P-11), contracts/ipc-auto-permission-mode.md, quickstart.md, AD-066, constitution.md (改定手順 and Principle III), session charter, isolation charter, glossary (targeted), roadmap (targeted), Round 1 gate `design-gate.md.20261031T150056Z`
**Extension hooks**: none run.

### Round 1 Critical/High: resolution status

| Prev ID | Status | Evidence |
|---|---|---|
| C-001 (`autoModeSafe: true` skips confirmation with no sandbox) | **resolved (by user decision)** | The user accepted the risk as spec U-6 (2026-10-31). It is carried consistently through FR-005, FR-008, AC6, SC-001, data-model §1 :33 / §4.2 :87 / §6.2 :157,:169 / §8.1 (temporary-acceptance paragraph and the new Bad example), §9 `autoModeIsolation.allowed`, AD-066 Decision 2, Consequences and Alternatives, plan RK-08, quickstart V-5, and tests in FE-010 / FE-015 / BE-010 (test name cites U-6). The roadmap I-3 hand-off is already written. |
| H-001 (`autoAckRuntimeId` never cleared, preset skips confirmation) | **resolved** | data-model §6.2 :152, :160-162 reset it on mount, on preset apply, on a non-auto mode and on runtime change. FE-013 tests "承諾 → default → auto のプリセット → 確認" and "承諾 → default → ack=false". Quickstart V-4.1 covers it too. |
| H-002 (announcement rule cannot work in the current component tree) | **resolved** (one residual Medium, I1 below) | data-model §5.3 adds `PermissionModeBanners key={sessionId}` and an always-mounted `AutoModeAnnouncer`. `null → auto` is decided (announced). FE-015 adds the session-switch tests. Quickstart V-1.4 and V-2.5 match. |
| H-003 (resume path wiring for the mark missing) | **resolved** | The plan table now lists `LaunchSource`, `LivePane` `:89-125` (owned by FE-013), `RunningSessionsProvider` and `running-sessions-view`. data-model §6.4 requires the `boolean`. FE-011 and FE-013 add `LaunchDialog.resume.test.tsx` cases. Quickstart V-4.4 covers it. |
| H-004 (isolation charter and glossary drift; gate owner unclear) | **resolved** (one Low residual, D1 below) | data-model §1 :34 makes session the temporary owner and moves it to isolation in I-3. §11 and SH-011 cover isolation charter :30-31 / :74 / :101 / :127 / Related Specs, the session charter :85 note, and glossary :75 / :1420. AD-066 `affected_domains` now includes `isolation`. |
| H-005 (AD-066 reinterpretation table missing 3 ADR spots) | **resolved** | The AD-066 table now has AD-059 D1 / V-9, AD-015 Consequences and AD-041 (c). The plan Related ADRs list adds AD-015. The plan's count of 13 matches the table. |
| H-006 (Principle III Why / Bad contradict the amended Statement) | **resolved** | data-model §8.1 replaces Why sentence 2 and limits Bad to `bypassPermissions`. Its Good example says the launch-time Auto confirmation is not an error. SH-010 adds a Grep check afterwards. |
| H-007 (AD-066 could merge while still proposed) | **resolved** | RK-01 is now a single rule (no merge until AD-066 is accepted and the review date is recorded, overnight rule included). The pre-merge check is in SH-012 and the same text is in the tasks.md 着手の条件. |

### Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I1 | Underspecification | MEDIUM | data-model.md §5.3 :131-133; tasks.md FE-015, BE-012; quickstart.md V-1.3 | [new] The announcement for a session launched in Auto only fires if `PermissionModeBanners` mounts while `meters.permissionMode` is still `null`. Nothing pins the order of "row created and selected" versus "first `meter`". The E2E fake (BE-012) sends the meter right after launch. If the meter lands before the new session is shown, the ref starts at `auto` and nothing is read. That breaks V-1.3 and the SC-004 "1 回" rule. The FE-015 unit test re-renders `null → auto` by hand, so it cannot catch this. | Either base the trigger on a session-local fact that does not depend on mount timing (for example, "first observation of `auto` while `chosenPermissionMode` is `auto` and the store has not announced for this session yet"), or state the ordering guarantee and add a store- or E2E-level test that the announcer gets text once after launch. |
| I2 | Inconsistency | MEDIUM | docs/domains/session/charter.md:144; docs/glossary.md:819; data-model §11; SH-001 / SH-011 | [unresolved from prev M-011] The session charter and the glossary Preset definition still say `presets.json` 版 2. BE-013 makes it 版 3, and neither §11 nor the SH tasks cover these lines. | Add charter :144 and glossary :819 to §11, SH-001 and SH-011. Leave :361 alone, since it is the 024 history. |
| I3 | Inconsistency | MEDIUM | spec.md:73, :86; plan.md:131; glossary (new term) | [unresolved from prev M-012] The new term 「許可の 4 値」 collides with "allowed" in `autoModeAllowed` / `isAutoModeAllowed`, which is the capability gate. In the same sentences, a 「許可」 value can still require confirmation when 「許可」 is false. | Rename the Japanese term (for example 「選べる 4 値」 to match `Selectable`), or add a glossary Counterexample that separates the two meanings. |
| C1 | Coverage (recovery path) | MEDIUM | data-model §4.2, §6.2, §9 `LAUNCH_REJECT_LABELS`; contracts C-1 / C-3 | [unresolved from prev M-003] If the renderer DTO says `autoModeAllowed: true` but main's snapshot says false (a stale DTO after a re-probe), the user gets `auto-mode-unconfirmed` and the message says 「選び直して確認してください」. Re-selecting shows no confirmation because the renderer still thinks it is true, so the user is stuck. | On `auto-mode-unconfirmed`, refetch the runtimes, or treat the next Auto selection for that runtime as requiring confirmation. Otherwise list the case in Out of Scope with the reason (same snapshot source, only transient). |
| C2 | Coverage (non-functional) | MEDIUM | data-model §4.2; tasks BE-010 | [unresolved from prev M-007] Accepting an acknowledged `auto` and rejecting with `auto-mode-unconfirmed` leave no main-side log or audit record. For a change to a NON-NEGOTIABLE principle, these are the events a reviewer would want to trace. | Add one structured log line to the main judgment (no secrets) and a BE-010 test that it fires, or record in AD-066 why it is not needed. |
| C3 | Coverage (non-functional) | MEDIUM | data-model §5.3 :130; tasks FE-015 | [unresolved from prev M-013, analyze A1] The contrast of the amber `text-amber-700 dark:text-amber-400` banner text is not verified. vitest-axe in jsdom does not compute color contrast. | Compare against the existing `UnsafeModeBanner` tokens (same tokens means the same contrast), or add a manual check in quickstart V-1.3. |
| C4 | Constitution verification strength | MEDIUM | data-model §10; scripts/constitution/check.mjs (item 16) | [unresolved from prev M-009] Item 16 still bans only quoted escalation literals. A template literal (`` `auto` ``) in agents slips past it, and §10 does not mention this. | Extend the literal scan to template literals, with a b-equivalent fixture, or record the gap in `UNDETECTED_NOTES` (expected.mjs). |
| A1 | Ambiguity | MEDIUM | spec.md SC-005; plan RK-05 | [unresolved from prev M-002] SC-005 is a record-only criterion with no pass/fail threshold. RK-05 explains how to read it but adds no threshold. | State that the observation is informational (does not block merge), or define a minimum (for example, at least one classifier-allowed tool run with no approval card). |
| U1 | Underspecification | MEDIUM | spec.md Out of Scope | [unresolved from prev M-005] Nothing in the running-sessions list distinguishes Auto sessions from others, and Out of Scope does not say this is deferred. | Add one line to Out of Scope (for example, "Auto marker in the running-sessions list → later") or cover it. |
| D1 | Inconsistency | LOW | docs/domains/isolation/charter.md:19, :87-88; data-model §11 | [new] §11 rewrites isolation charter In scope, Journey 2, business rules and KPI. It leaves Key concepts `autoModeSafe` 「そのランタイムで無人実行を許してよいか」 and the mission line unchanged. Under U-6, true now means "sandbox usable, not enabled", and the glossary gets that note but the charter does not. | Add the U-6 meaning note to isolation charter :87-88 in §11 and SH-011. |
| D2 | Inconsistency | LOW | plan.md:32, :68 | [new] The plan Summary says the `AutoModeBanner` does the one-time announcement, and the Scale section lists only `AutoModeBanner` as new in `CenterBanners.tsx`. data-model §5.3 and FE-015 put the announcement in the new `PermissionModeBanners` and `AutoModeAnnouncer`. | Update the plan Summary and Scale lines to name `PermissionModeBanners` and `AutoModeAnnouncer`. |
| D3 | Inconsistency | LOW | research.md:94 (P-8) | [unresolved from prev L-008] P-8 still says the confirmation is used 「起動の設定とヘッダの両方」 (it is now the composer group) and that the wording is in 「data-model §6」 (it is §9). | Fix both references. |
| D4 | Inconsistency | LOW | spec.md:19 | [unresolved from prev L-011] The body says `Status: Draft` but the frontmatter says `status: tasking`. | Align the body or drop it. |
| D5 | Duplication | LOW | data-model.md:235-237 (§9) | [unresolved from prev L-012] An empty duplicate table header sits before the explanatory paragraph. | Delete the first header. |
| D6 | Inconsistency | LOW | spec.md:103 | [unresolved from prev L-003] `[ASSUMED: …]` remains even though the plan resolved it in data-model §9. | Replace with "文言は data-model §9 で決めた". |
| D7 | Terminology | LOW | plan.md:110-111 | [unresolved from prev L-010] The plan's Principle I and II titles paraphrase the constitution titles (for example 「domain のパス API 経由」 versus 「`runtime.path` を経由する」). | Use the constitution titles verbatim. |
| T1 | Terminology | LOW | spec.md FR-008, AC2, SC-004; data-model §5.3 :133 | [new] The spec says the announcement happens when the session 「Auto に切り替わったとき」. data-model counts the launch `null → auto` as a switch, but spec AC2 (launch) does not mention any announcement. | Add 「起動直後を含む」 to FR-008 or AC2 so SC-004 and V-1.3 rest on the spec. |
| U2 | Underspecification | LOW | spec.md Edge Cases | [unresolved from prev L-013] If/unwanted behaviors (closing the confirmation when the session ends, reverting on failure) live only in Edge Cases, not in FRs. They are covered by FE-014 tests, so execution is not affected. | Optional: fold them into FR-005 / FR-002. |
| G1 | Coverage | LOW | spec SC-001; plan RK-07 | [unresolved from prev L-014, accepted] The 1-operation path (`autoModeAllowed: true`) is checked only by unit tests, because no fake runtime has true. This is acknowledged in RK-07. | None needed beyond RK-07. Optionally add one true fake runtime to the E2E. |

Prev Lows now **resolved**: L-005 (AD-066:14 now reads P-1〜P-13), L-006 (`amended` is now `<改定を入れる日>`), L-009 (bump rationale is in §8.1 Sync Impact Report), L-015 (SH-012 owns the accepted check; a human flips the status in PR review).
Prev Mediums partly resolved: M-004 (spec Assumptions L102 covers the failure display), M-006 (Edge Case 4 now covers the ack lifetime; `lastConfig` mount-null is in data-model §6.2), M-010 (BE-010 fixes the true-row expectation under U-6). The rest are reviewer-owned or listed above.

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 Auto in launch options | Yes | BE-001, FE-010, FE-013, FE-017 | |
| FR-002 live transitions safe3 ⇄ auto | Yes | BE-001, BE-003, FE-014, FE-018 | |
| FR-003 main/thread 4-value check | Yes | BE-001, BE-003, BE-012 | |
| FR-004 0 paths to acceptEdits/bypass | Yes | BE-004, SH-012 | gap C4 (template literal) |
| FR-005 confirmation when false | Yes | FE-010, FE-012, FE-013, FE-014 | |
| FR-006 single decision point | Yes | BE-001, BE-012 | |
| FR-007 main mark check | Yes | BE-010, BE-011, BE-012, FE-011, FE-013, FE-014 | recovery gap C1 |
| FR-008 Auto banner and one announcement | Yes | FE-010, FE-011, FE-015 | timing gap I1 |
| FR-009 AD-066 | Yes (pre-authored) | SH-012 (accepted check) | ADR already exists (proposed) |
| FR-010 Constitution III amendment | Yes | SH-010, SH-012 | |
| FR-011 glossary/charter/roadmap/ui-coverage | Yes | SH-001, SH-011 | gaps I2, D1 |
| FR-012 preset save/load without skipping confirmation | Yes | BE-013, FE-013 | |
| SC-001 2-op / 1-op | Yes | FE-013, FE-014, FE-017, FE-018 | 1-op unit-only (G1) |
| SC-002 100% rejection of escalation values | Yes | BE-001, BE-003, BE-004, BE-012 | |
| SC-003 100% rejection of unacknowledged auto | Yes | BE-010 | |
| SC-004 banner 100% and one announcement | Yes | FE-015, FE-017, FE-018 | I1 |
| SC-005 classifier on real hardware | Manual | SH-012 (quickstart V-3) | A1 |

**Constitution Alignment Issues**: None CRITICAL. The plan judges Principle III against the amended text (data-model §8.1). The amendment goes through 改定手順 1-5 (AD-066, human review in the PR with merge blocked until accepted, MINOR with rationale, Amendment trail, enumeration III: 0). The constitution diff and the value-set diff are in the same PR (RK-01, SH-012). U-6's accepted risk is written into the amended Principle III, so after the amendment it is not a violation.

**Unmapped Tasks**: None. SH-001 maps to Principle XIV and FR-011. SH-012 is the verification task for all SCs.

**Metrics**:
- Total Requirements: 17 (FR 12, SC 5)
- Total Tasks: 21 (SH 4, BE 8, FE 9)
- Coverage: 100% (17/17 have at least one task; SC-005 is manual)
- Ambiguity Count: 2 (A1, T1)
- Duplication Count: 1 (D5)
- Critical Issues Count: 0
- High Issues Count: 0
- Medium: 9 (I1, I2, I3, C1, C2, C3, C4, A1, U1); Low: 10

### Next Actions

- No CRITICAL or HIGH remain. All Round 1 Critical/High (C-001, H-001 to H-007) are resolved; C-001 by the user's U-6 decision. From the analyze track's view, implementation may proceed.
- Medium and Low findings stay in the gate output for the milestone-end inventory (AD-050). They should not be fixed this round.
- If the designer touches the artifacts anyway, the cheapest high-value fixes are I1 (pin the launch-announcement trigger in data-model §5.3 and FE-015) and I2 (add charter :144 and glossary :819 to §11 / SH-001 / SH-011).
