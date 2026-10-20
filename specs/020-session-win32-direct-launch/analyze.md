## Specification Analysis Report

**Feature**: `specs/020-session-win32-direct-launch` (X-8), design-gate round 2. I read spec.md, plan.md, tasks.md, data-model.md, contracts/ipc-win32-claude.md, quickstart.md and AD-058 (proposed). I grepped research.md and spot-checked these against current source: `sdk-agent-session.ts:329-347`, `derive-env.ts`, `provider-service.ts:277-324`, `forward-env.ts`, `LaunchDialog.tsx`, `win32.ts`, `runtime-list/labels.ts`, and the frontmatter and section lines of the runtime and session charters. Nothing was modified. The prerequisite script was not run (Bash avoided). The paths came from the caller.

Status tags compare against `analyze.md.20261020T080329` and `design-gate.md.20261020T080329`.

| ID | Category | Severity | Location(s) | Summary | Recommendation | Prev |
|----|----------|----------|-------------|---------|----------------|------|
| C1 | Inconsistency | ~~CRITICAL~~ | data-model.md:L137, L205; contracts C-4 L65; tasks BE-003 / BE-010 / BE-011 | The regex rule is gone. §5.2 now requires an exact match against the domain constant `WIN32_TREE_STOP_ARGS`. BE-010 has the positive case and the requested negative cases, and BE-003 / BE-011 add a shared fixture for the build → decode round trip. | — | **resolved from prev** (C-001) |
| F1 | Inconsistency | ~~HIGH~~ | spec.md:L179 (FR-011) vs AD-058 Decision 3 | FR-011 now lists only the guaranteed endings. Worker, supervisor and main abnormal ends, and timeouts, are best-effort, and FR-011 names AD-058 Decision 3 as the source. | — | **resolved from prev** (H-001) |
| F2 | Inconsistency | ~~HIGH~~ | spec.md:L184 (FR-014); AD-058 Decision 1; data-model §5 `windowsHide` | FR-014 now covers only branching and building the values. `windowsHide` is carried in the spec, and agents only run what they are given. | — | **resolved from prev** (H-006). See the new finding F7. |
| D1 | Constitution (verification) | ~~HIGH~~ | tasks FE-010 (L43), FE-011 (L44-45); plan.md:L81 | A component test and a Principle III E2E (FE-011) now check that Win32 shows only the 3 safe modes. | — | **resolved from prev** (H-005) |
| F7 | Inconsistency (spec MUST vs design) | HIGH | spec.md:L184 (FR-014: agents "Windows 固有の値をリテラルで持たない"); data-model.md:L197, L204 (§5.2); contracts C-4 L65; AD-058 Decision 1 (end); tasks BE-010 (L36-37) | The round-1 fix makes the agents decoder check that `stop.command` ends in `taskkill.exe` and that `pathToClaudeCodeExecutable` ends in `.exe`. Those are Windows-specific literals inside `src/agents/`, which the revised FR-014 forbids (its list includes "停止のコマンド"). BE-010's own ban covers only `windowsHide: true` and the taskkill args, so it does not catch this. Today's WSL decoder has no such literals. | Put the basename in domain next to `WIN32_TREE_STOP_ARGS` (e.g. `WIN32_TREE_STOP_COMMAND_BASENAME`). Have the decoder use `classifyClaudeExecutable` for the `.exe` check (this also closes prev L-007). Alternatively, reword FR-014 as "no literals for building; checks use domain constants". | **new** |
| F8 | Inconsistency | MEDIUM | data-model.md:L319-326 (§8 extraEnv table "起動 = invalid-config"), §7 stages 4/5; tasks BE-041 (L83); provider-service.ts:L286 | `deriveEnv` calls `assessReachability` itself (`:286`), and BE-040 adds the transport predicate to it. So for a Win32 Provider whose extraEnv hits a transport key (e.g. `USERNAME`), `deriveEnv` returns null at stage 4 and the launch ends as `provider-unavailable`. It never reaches stage 5, where `composeWin32LaunchEnv` would raise `invalid-config`. The §8 table and BE-041 expect `invalid-config`. A launch-preparation test with a fake `deriveEnv` would pass and hide the real result. | Change the §8 "起動" column and BE-041 to `provider-unavailable` for the real path. Keep `invalid-config` only as the test of `composeWin32LaunchEnv` itself (defense in depth). | **new** |
| E1 | Coverage gap | MEDIUM | LaunchDialog.tsx:L405-406 (`allRuntimesStopped`), L488-489 (`noWslRuntimes`); data-model §10.1; tasks FE-010 | Two states still read only `wslRuntimes`. A host with no WSL but a found Win32 shows "no WSL runtimes". With every distro stopped, the dialog says all runtimes are stopped even though Win32 can launch. | Add both states to §10.1 and FE-010, based on the new list of runtimes that can launch. | **unresolved from prev** (M-011) |
| E2 | Coverage gap | MEDIUM | spec.md:L150, L162 (FR-013 monitor rows) | No task or quickstart step checks that a Win32 session's monitor row shows "Windows (ホスト)". | Add a small test or a V-1 step, or state that the monitor rows need no change. | **unresolved from prev** (M-012) |
| B1 | Ambiguity | MEDIUM | spec.md:L69-71 | Three `[ASSUMED]` answers are still tagged and outside the U-1..U-4 approval: the shim error text, the runtime order and label, and the 5 s timeout. FR-012, SC-004, §10.1, §10.3 and `TREE_STOP_TIMEOUT_MS` depend on them. | Get the user's confirmation, or record them as provisional (RK) in plan. | **unresolved from prev** (M-013) |
| F3 | Risk / Inconsistency | MEDIUM | data-model.md:L364-367 (§9.3); plan.md:L261 (RK-07); quickstart V-3 | The dispose margin is still 1 s (6,000 ms against a 5,000 ms tree stop). RK-07 still assumes taskkill takes "hundreds of ms", yet on this host one process spawn can take 2.4 s. V-3 stops one session, not up to 10 at quit. | Time a quit with several (ideally 10) Win32 sessions in V-3, or justify the margin in R-11. | **unresolved from prev** (M-004) |
| F9 | Inconsistency | MEDIUM | data-model.md:L96-102 (§3) vs spec.md:L168 (FR-006 "自動の探索に戻らない") | If `runtime-settings.json` is unreadable or corrupt, it is backed up and treated as "no override". Detection then quietly uses the auto search, which goes against FR-006's rule not to hide override errors. | Map `parse-failed` / `newer-version` / `read-failed` to `override-invalid` (or a visible state), or state in FR-006 that a lost settings file is an exception. | **unresolved from prev** (po M-001; cross-checked) |
| S1 | Underspecification (security) | MEDIUM | data-model.md:L250-256 (§6.2); §6.1 | `composeWin32LaunchEnv` forbids only the Win32 transport keys and the fixed forbidden keys. Provider extraEnv keys outside the allowlist that can hijack execution on Windows (`PSMODULEPATH`, `MSYS*`, `__COMPAT_LAYER`) pass both registration and Win32 composition. | Add a Win32 deny set for these keys, or record the choice in AD-058 Decision 5. | **unresolved from prev** (security M-006; cross-checked) |
| F4 | Inconsistency | LOW | contracts C-1 L20 vs runtime-store `RuntimeListDTO` | `runtimes` is still typed `readonly RuntimeDescriptorDTO[]`, but `runtimes.refresh()` returns a `RuntimeListDTO`. | State which is returned. | **unresolved from prev** (L-008) |
| F5 | Inconsistency | LOW | data-model.md:L86 | The fail-closed default is still written `{ status: 'not-found' }` without `overridden: false` (tasks BE-002 / BE-022 have it right). | Fix the §2 text. | **unresolved from prev** (L-009) |
| U1 | Underspecification | LOW | plan.md:L40, L44-69, L285-307 | "新設 4 (domain 1・infra 3)" and the structure still leave out `provider-service.ts`, `useRuntimes.ts`, the new `launch-runtime-options.ts`, the new fixture `__fixtures__/win32-launch-spec.ts`, and the `e2e/launch-dialog.spec.ts` change (FE-011). | Add them and correct the count. | **unresolved from prev** (L-010) |
| U2 | Underspecification | LOW | tasks.md:L58 (BE-022); research.md:L116 | `contracts/runtime-detection.md C-1` is still cited without the path of the owning spec. | Give the full path. | **unresolved from prev** (L-011) |
| E3 | Coverage gap | LOW | spec.md:L148 | The network-drive edge case has no test or V-step (`D:\` only). | Add a resolver row for a mapped drive, or drop that part of the edge case. | **unresolved from prev** (L-012) |
| F6 | Measurement wording | ~~LOW~~ | spec.md:L207 (SC-004) | SC-004 now reads "fake child: order and args; 0 processes within 5 s decided by V-3 (required)". | — | **resolved from prev** (F6 / H-003) |
| L1 | Inconsistency | LOW | plan.md:L111; tasks.md:L91 (SH-010) vs docs/domains/runtime/charter.md:L148 (`## Related ADRs`), L163 (`## Related Specs`), frontmatter L7 / L17 | The line numbers for the runtime charter are still swapped. SH-010 does not update the runtime charter frontmatter `related_adrs` / `related_specs` (it does for session). | Swap the line numbers and add the frontmatter update. | **unresolved from prev** (L-004) |
| L2 | Inconsistency | LOW | spec.md:L173 (FR-008 "正本は plan / ADR") vs data-model §6.1 ("この表が正本") | The source of truth for the allowlist is still misnamed. | Point FR-008 at data-model §6.1. | **unresolved from prev** (L-006) |
| L3 | Stale text | LOW | spec.md:L43 (ADR row "1 つか 2 つかは plan で決める"); data-model §9.4 vs AD-058 Decision 3 table | plan decided on one ADR, but the spec still says it is open. §9.4 lacks AD-058's "graceful end: descendants not guaranteed" row, so the two tables differ. | Update the spec row and add the row to §9.4. | **new** |

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 Win32 option in launch dialog | Yes | FE-010 | E1 |
| FR-002 direct launch, launch spec split by kind | Yes | BE-003, BE-010, BE-011, BE-012 | Blocker C1 resolved. See F7. |
| FR-003 resolution table / U-3 | Yes | BE-012, FE-010 | |
| FR-004 resolve once; override → known location → PATH | Yes | BE-002, BE-020, BE-022 | |
| FR-005 .exe only; shim told apart | Yes | BE-001, BE-020 | |
| FR-006 set / clear override; no silent fallback | Yes | BE-021, BE-023, FE-020 | F9 |
| FR-007 reason and fix in list and dialog | Yes | FE-010, FE-020 | H-002 resolved |
| FR-008 Win32 env allowlist + denylist | Yes | BE-011 | L2 |
| FR-009 Provider env layered; judgment = derivation | Yes | BE-011, BE-040, BE-041, FE-040 | H-004 resolved. See F8 and S1. |
| FR-010 tree stop on kill / close; interrupt does not stop | Yes | BE-030 | |
| FR-011 no tree left on app exit | Yes | BE-030, BE-031 | F1 resolved |
| FR-012 5 s timeout; log without paths or env | Yes | BE-030 | B1 |
| FR-013 same path for streaming, approval, limit, monitor rows | Partial | BE-010, BE-012 (+V-1) | E2 |
| FR-014 boundary; spawn allowlist notes | Yes | BE-010, BE-011, BE-030, SH-011 | F7 |
| FR-015 ADR + charters + roadmap | Yes | SH-010 | L1 |
| FR-016 WSL unchanged | Yes | BE-003, BE-010, SH-012 | |
| SC-001 launch / turn / approve / interrupt / close | Yes | BE-010, BE-012, FE-010, SH-012 (V-1 required) | |
| SC-002 4 claude states | Yes | BE-020, FE-010, FE-020 | |
| SC-003 env contents pinned | Yes | BE-011, BE-041 | |
| SC-004 0 processes within 5 s after the 3 stop paths | Yes | BE-030, BE-031, SH-012 (V-3 required) | F3 |
| SC-005 reachability = derivation table | Yes | BE-040 | F8 |
| SC-006 WSL tests and constitution check pass | Yes | SH-012 | |

**Constitution Alignment Issues:** None.
- No NON-NEGOTIABLE principle (I-VIII) is violated.
- Principle III's automated E2E is now planned (FE-011), which resolves D1.
- Principle II holds: there is no `process.platform` in agents. F7 breaks the spec's stricter FR-014 wording, not the constitution text.
- Principle XIV is handled by SH-001.

**Unmapped Tasks:** None.
- SH-001 maps to Principle XIV.
- FE-011 maps to Principle III.
- SH-011 / SH-012 map to FR-014, FR-016 and SC-006.

**Metrics:**
- Total requirements: 22 (FR 16 + SC 6)
- Total tasks: 22 (SH 4, BE 14, FE 4)
- Coverage: 100% of requirements have at least one task (FR-013 only partly)
- Ambiguity count: 1 (B1, covering 3 `[ASSUMED]` items)
- Duplication count: 0
- Critical issues: 0
- Open findings: 17 (CRITICAL 0, HIGH 1, MEDIUM 7, LOW 9)
  - new: F7, F8, L3
  - unresolved from prev: E1, E2, B1, F3, F9, S1, F4, F5, U1, U2, E3, L1, L2, L5, L6, L7
  - Three of the unresolved come from the other gate tracks and were cross-checked here: F9 (po M-001), S1 (security M-006), L1 (L-004).
- Resolved from prev: C1/C-001, F1/H-001, F2/H-006, D1/H-005, F6/H-003. H-002 and H-004 (from the other tracks) are also resolved in the artifacts.

**Other prev gate items (from the other tracks, spot-checked):**
- Resolved: M-007 (round trip, through the shared fixture).
- Unresolved, no artifact change:
  - M-002 (claude.exe exits immediately)
  - M-003 (tree-stop failure goes only to stderr)
  - M-005 (`NoDefaultCurrentDirectoryInExePath`)
  - M-008 (widening `configDirRuntimePath`)
  - M-009 (`distro-mismatch` relaxed)
  - M-010 (provider charter / `_overview` attribution)
  - L-001, L-002, L-003, L-005
  - L-007, which is folded into the F7 fix

**Next Actions:**
- There is no CRITICAL. The verdict depends on the other tracks.
- Fix F7 (HIGH) this round, per AD-050: add a domain constant for the stop-command basename and have the decoder use `classifyClaudeExecutable`, or reword FR-014. The fix belongs in data-model §5.2, AD-058 Decision 1, contracts C-4 and BE-010.
- F8 is MEDIUM but is a one-line correction in data-model §8 and BE-041.
- The other MEDIUM / LOW items stay in the gate output (AD-050).
