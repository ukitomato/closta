## Specification Analysis Report (Track A: analyze, X-4 / 008)

I found no CRITICAL issues. Four findings are HIGH and should be fixed before implementing.

Budget is within limits: 17 FR (limit 20), 10 SC (limit 10), 4 US (limit 4). No `[NEEDS CLARIFICATION]` markers remain. No `.specify/extensions.yml` hooks apply. AD-041 and AD-042 are free numbers (no other file references them).

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|---|---|---|---|---|---|
| A1 | ADR drift | HIGH | plan.md:119, tasks.md:22 (BE-003) vs AD-036:137-141 §4 P1; session-core.ts:38-45 | Adding `'model'` / `'effort'` to `QUERY_OPTION_KEYS` expands the §4 P1 query-options allowlist. That allowlist is "完全部分集合に固定 (他キーを一切含めない)". AD-040 needed its own ADR to add `settings`. AD-041's scope (a)-(f) (plan.md:140, SH-001) does not include extending P1. | Add item (g) to AD-041: extend §4 P1 with `model` / `effort`, argued as escalation-neutral like `abortController`. Update the `session-core.ts` doc comment and the SC-006(a) key-set test. |
| A2 | Technical inconsistency / risk | HIGH | spec FR-005, FR-012, SC-006, SC-009; plan.md:128; AD-036:170-171 §6; sdk-agent-session.ts:279-281; launch-spec.ts:30 | Derived env (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `AWS_PROFILE`/`AWS_REGION`, `CLAUDE_CONFIG_DIR`) is set on the **`wsl.exe`** process env. WSL forwards only variables listed in `WSLENV` into Linux, and `WSLENV` is on the denylist, so these values may never reach `claude`. Also, `LAUNCH_ENV_DENY_PATTERN` matches the curated keys themselves. So "合流させ最終 env denylist を通す" either strips them or needs a split between passthrough and curated keys that the spec does not state. The only premise is 007 research.md:25-27, which is unverified. No risk entry or quickstart check exists. | Add a plan risk and an SH-023 live check that each env value is visible inside WSL. State that the final denylist applies to passthrough only and curated injection is counted separately (derive-env.ts:12-13). Decide how values are delivered into WSL. |
| A3 | Fail-safe gap | HIGH | FR-006 ("無効値のまま起動できてはならない"), SC-002, SC-005 (effort), BE-005/BE-006 | `resolveLaunchAxes` runs only in the renderer (FE-001) and in preset apply (BE-012). `checkLaunchConfig` checks shape and the safe 3 values only. Main never re-checks model ∈ catalog or effort ∈ `supportedEffortLevels` at launch. An unreachable provider happens to be rejected via `deriveEnv` → null. An invalid model or effort from IPC reaches `query()`. | In BE-006, call `resolveLaunchAxes` (or a strict validator) in main at launch time and reject or reset. Add a test to SH-020. |
| A4 | Coverage (plumbing) | MEDIUM | BE-004, tasks.md:23; sdk-agent-session.ts:163-182 `decodeLaunchSpec` | The worker's launch-message decoder only reads `spec`. `settings` / `model` / `effort` / `permissionMode` have to cross the main→utilityProcess port and be decoded and re-validated. No task covers this. | Extend BE-004 (or add a task) for the launch message protocol and its decode, with negative tests. |
| A5 | ID collision | MEDIUM | spec FR-002 ("FE-010"), FR-003 ("BE-013"), Dependencies:169 ("FE-010 / BE-013 / BE-020") vs tasks.md:43,46,52 | The spec cites X-3 task IDs that are reused in tasks.md for different work: FE-010 = PresetPanel, BE-013 = preset IPC, BE-020 = resolution test. | Qualify them as "X-3 FE-010" etc., or drop them from the spec. |
| A6 | Ordering / ADR | MEDIUM | plan.md:47,141; tasks.md:10,78; AD-039:95,131-133 D4 | AD-039 D4 (app does AssumeRole, env injection) is still accepted text. The helper generation in BE-031/032 contradicts it until AD-042 records it as void. SH-002 is `[P]` and does not gate BE-031/032. | Make SH-002 accepted a prerequisite of BE-031/032. |
| A7 | Coverage (measurement) | MEDIUM | SC-008; FE-020; SH-020:71 | SC-008's measurement path is "越境判定の単体テスト". SH-020's list omits boundary crossing, and FE-020 has no test. | Add a renderer unit test (cross → warning, launch not blocked) to FE-020 or SH-020. |
| A8 | Wrong signature | MEDIUM | tasks.md:53 (FE-020), plan.md:134 | `resolveFolderRuntime(folderId, runtimeId)` does not match the real signature `resolveFolderRuntime(input: ResolveInput)` (resolution.ts:215). The renderer also lacks the descriptor and PathMapping inputs. | Consume the existing resolution DTO over IPC (as ResolutionScreen.tsx:85 does), or fix the call form. |
| A9 | Underspecified | MEDIUM | FR-001 ("どの軸にも既定"), FR-005, BE-006 | Two cases are undefined. First, what "既定" means for folder and runtime, which launch requires. Second, provider `'default'`: BE-006 always calls `deriveEnv(providerId, …)` and has no fallback to `buildLaunchEnv`. | Limit "既定" to provider, model and effort (plus permission = `default`). Specify the no-provider path. |
| A10 | Underspecified | MEDIUM | FR-001, FR-017, SH-005 (`supportedEffortLevels?` optional) | It is not stated which effort values are offered when a catalog entry has no `supportedEffortLevels`: "既定" only, or all 5. | Pick one and add it to BE-020's boundary cases. |
| A11 | Dependency gap | MEDIUM | US-3 AS-1 (runtime → another distro); AD-036:175-179 §7; launch-gate.ts:53-57 | Moving a WSL folder to another distro's runtime gets `distro-mismatch` at launch. The folder↔runtime edge is not in the `resolveLaunchAxes` graph (runtime→provider→model→effort), so the user gets no reset or notice and hits a launch failure. | Add a folder↔runtime validity check (a disabled option or a reset) to FR-006/BE-001. |
| A12 | Conditional scope | MEDIUM | plan R-01:153; SH-023:74 | If the `/mnt/c` helper execution does not work, BE-031/032 are deferred. FR-013 and SC-007 would then be unmet, but the spec has no conditional wording. | Add the R-01 fallback to the spec's Assumptions, or make FR-013 explicitly conditional. |
| A13 | Glossary | MEDIUM | glossary.md:287-295 (LaunchInput: "`permissionMode: 'default'` リテラル固定…6 値ユニオンにしない"); SH-003 | BE-002 changes this to `SafePermissionMode`, but SH-003 does not update the LaunchInput entry. "越境" already exists as **Cross-boundary** (glossary.md:95-102), so "越境警告" should refer to it, not duplicate it. | Add both to SH-003 (Principle XIV). |
| A14 | Constitution check completeness | MEDIUM | plan.md:17-30 | Principle VIII (NON-NEGOTIABLE, 日本語環境) and XIII (element priority) are missing. Preset names are free Japanese text and go through the control-character rejection. | Add VIII (Japanese names pass validation, IME) and XIII rows. |
| A15 | Terminology drift | LOW | spec US-4 AS-2 "X-3 の deriveEnv" vs FR-005 `deriveLaunchEnv`; plan/tasks `providers.deriveEnv` | The domain pure function (derive-env.ts:34) and the service method (provider-service.ts:87) are used interchangeably. | Name the layer each time. |
| A16 | Charter drift | LOW | charter.md:36-37 (order "ランタイム→Provider→モデル→権限モード"), :110, :151, :170 (SPIKE-6 open) | The charter order differs from the spec's (effort in the chain; permission mode as an independent axis). The charter rule "権限モードはcapabilityに従う" is only met by deferral to I-3, and SPIKE-6 is already closed by AD-020. | Add these to SH-014's charter update. |
| A17 | Structure | LOW | tasks.md:12-13, :48-62 | SH-004/005 sit in the Shared section but are tagged `[BE]`. US-3 and US-4 have no Backend/Frontend subsections. targets=both is still satisfied. | Retag, or move them to Backend. |
| A18 | Ordering | LOW | spec.md:109 | FR-017 appears between FR-003 and FR-004. | Cosmetic; fine to leave. |

ADR citation check: AD-016 (performance cliff, no threshold, warn without blocking: :57-73, :114-120), AD-017 (container workspace strategy, bind/clone-ephemeral), AD-020 (6 PermissionMode values, danger table :68-75, EffortLevel 5 values :77, dontAsk safe §3), AD-025:49 ("X-4 (コンテナ)"), AD-036 §5 (default fixed :156-164) and §6 (env denylist), and AD-040 (2-key projection; X-4 does the wiring, :75) all say what the spec claims. AD-005 has models: ModelCatalogRef, and the plan correctly routes the change through AD-042.

### Coverage Summary

| Req | Has task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | Y | SH-004, BE-001, BE-002, FE-001 | See A9, A10 |
| FR-002 | Y | FE-001, SH-022 | |
| FR-003 | Y | BE-001, FE-001 | |
| FR-004 | Y | SH-001, SH-004, BE-003, SH-010 | See A1 |
| FR-005 | Y | BE-004 to BE-007, FE-002 | See A2, A4 |
| FR-006 | Y | BE-001, BE-020, FE-001, FE-004 | No backend enforcement (A3) |
| FR-007 | Y | BE-001 | |
| FR-008 | Y | FE-020 | See A8 |
| FR-009 | Y | BE-010 to BE-013, FE-010 | |
| FR-010 | Y | BE-011, SH-020 | |
| FR-011 | Y | BE-012, FE-010 | |
| FR-012 | Y | BE-030 | See A2 |
| FR-013 | Y | BE-031, BE-032, SH-011 | See A6, A12 |
| FR-014 | Y | BE-031, BE-033 | |
| FR-015 | Y | SH-003, SH-014 | See A13 |
| FR-016 | n/a | (inheritance) | Nothing to build |
| FR-017 | Y | SH-005, BE-008, FE-003 | |
| SC-001 | Y | BE-001, SH-020, SH-022 | |
| SC-002 | Y | BE-020, SH-022 | |
| SC-003 | Y | BE-011, SH-020 | |
| SC-004 | Y | SH-020 | |
| SC-005 | Y | BE-003, SH-010, SH-020 | Effort part only enforced in the renderer (A3) |
| SC-006 | Y | BE-030, SH-020 | |
| SC-007 | Y | BE-031, SH-020 | |
| SC-008 | Partial | FE-020 | Measurement test unassigned (A7) |
| SC-009 | Y | BE-006, SH-020 | |
| SC-010 | Y | BE-008, SH-020 | |

**Unmapped requirements:** none outright. SC-008's measurement is only partly covered (A7).

**Unmapped tasks:** none. SH-012 and SH-013 are follow-up bookkeeping for items carried over from earlier features.

### Metrics
- Total requirements: 27 (17 FR + 10 SC)
- Total tasks: 37
- Coverage: 100% nominal (26/26 buildable, with FR-016 as inheritance). 96% if SC-008's measurement gap counts.
- Ambiguity count: 5 (A9, A10, A11, A12, A15)
- Duplication count: 1 (FR-011 restates FR-006 plus US-2 AS-2; acceptable)
- Critical issues: 0 (the four HIGH findings are A1-A3 and A4 is MEDIUM; A1-A3 should be fixed before implementing)

### Next actions
- A1: add the §4 P1 `model` / `effort` extension to AD-041 (SH-001).
- A2: add a plan risk and a quickstart check that env reaches `claude` inside WSL, and clarify the passthrough vs curated split in FR-005 and SC-009.
- A3 and A4: add main-side re-validation at launch and the worker decode to BE-006 and BE-004.
- MEDIUM items can be fixed by editing tasks.md and plan.md directly. Then re-run with `/cl-design --spec-dir specs/008-session-launch-settings-dialog-and-presets --from gate`.

Files analyzed (all under C:\dev\closta\): specs/008-session-launch-settings-dialog-and-presets/{spec,plan,tasks}.md, docs/domains/session/charter.md, docs/domains/_overview.md, docs/glossary.md, .specify/memory/constitution.md, docs/decisions/00{05,16,17,20,25,36,39,40}-*.md, plus code evidence in src/agents/{session-core,sdk-agent-session}.ts, src/main/infra/runtime/launch-spec.ts, src/domain/provider/derive-env.ts, src/domain/session/launch-gate.ts, src/domain/workspace/resolution.ts.
