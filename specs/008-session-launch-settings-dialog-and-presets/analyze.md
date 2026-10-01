## Specification Analysis Report (Track A: analyze, X-4 / 008, round 3)

**Result: CRITICAL 0, HIGH 0, MEDIUM 7, LOW 9** (2 of the LOW are carried over from round 1).

Every round-2 Critical and High is closed except one partial:
- **C-101 resolved.** `forwardKeys` is now separate from `DerivedLaunchEnv.env`. Curated base keys and `WSL_UTF8` are never forwarded. A bad forward key rejects the launch instead of being dropped. SC-007 and the quickstart now have the negative checks.
- **H-201 resolved.** extraEnv has a forbidden-key denylist, and `resolveWslCommand` gets the base env from before the merge.
- **H-203 resolved.** env-passthrough is wired from `process.env`.
- **H-202 partly resolved.** AD-041 (b) now covers SC-006(a)(b)(c), 005 contracts C-5 and data-model §7. But no task adds the pointers in C-5 or data-model §7 (only C-4 gets one), and only one of the X-1 tests to change is named.

The code claims hold against `src/`:
- `derive-env.ts:38,63,66,70,85-87`
- `reachability.ts:29,51` (`===` distro compare)
- `launch-spec.ts:24,30,65,102`
- `validate.ts:246-253,270-284,312`
- `composition-root.ts:250,283,285,287`
- `provider-service.ts:277,285`
- `isSameDistro(NamespaceId, NamespaceId)` at `namespace.ts:126`
- `--exec` is already in `WSL_ALLOWED_ARGS`

Check 15 only looks for `wsl.exe` literals and `wsl-cli` imports (`check.mjs:734-735`), so a `WSLENV` literal would not trip it mechanically. `docs/decisions/` has no 0041 or 0042 yet, so those numbers are free. `.specify/extensions.yml` has no hooks.

The new findings are all precision gaps in the new env-forwarding rules:
- **B9:** varNames are not validated when the Provider is saved.
- **B10:** the key comparison may be case-sensitive on Windows.
- **B11:** the list of forbidden keys is copied into two layers.
- **B12:** a guard that blocks `CLAUDE_CONFIG_DIR` could be lost.
- **B13:** a WSL check in the agents decoder appears in tasks only, not in the plan.
- **B14:** some cross-spec reconciliations are not recorded.
- **B15:** stricter checks on read would drop existing Providers.

Budget is within limits: FR 17/20, SC 10/10, US 4/4, AC 7/4/3/4 against a cap of 8.

### Round 2 findings status
| ID | status | evidence (path:line) |
|---|---|---|
| C-101 (TEMP/TMP leak via WSLENV) | resolved | spec.md:237-243 (FR-013 forwardKeys, base keys + WSL_UTF8 never forwarded, reject on violation); plan.md:162,180,194-199; tasks.md:40,83,87; SC-007 spec.md:322-330; SH-020 tasks.md:210; SH-023 tasks.md:231 (`printenv TMP TEMP` empty) |
| H-201 (extraEnv overrides base / hijack env) | resolved (residual gaps in B9, B10, B12) | spec.md:244-249 (denylist, 3 places, pre-merge base for wsl.exe); plan.md:155-157,201,268 (ANTHROPIC_BASE_URL recorded as residual risk); tasks.md:35,84,88,92 |
| H-202 (AD-041 does not re-read SC-006(b)(c) / C-5 / data-model §7) | partially resolved | spec.md:347-350 and plan.md:252-257 widen (b). But SH-001 (tasks.md:22) and plan.md:274 only add a C-4 pointer, with none in C-5 (`005 contracts/session-launch.md:88-93`) or data-model §7 (`005 data-model.md:180-191`). Of the X-1 tests to change, only `launch-spec.test.ts:29` is named. See B14 |
| H-203 (env-passthrough has no path) | resolved | spec.md:240,247,294; plan.md:164,179,205; tasks.md:39,85,91,215,231 |
| M-201 (reset confirmation / declining it) | resolved | spec.md:106-108; tasks.md:98,113 |
| M-202 (reason keys / when input is kept) | resolved | spec.md:79-86 (US-1 AC7) |
| M-203 (R-01 fallback) | resolved | spec.md:295,354; plan.md:302-313 |
| M-204 (helperPath charset / shell execution) | resolved | spec.md:257; tasks.md:20,168 |
| M-205 (helperRuntimePath for all 3 helper methods) | resolved | plan.md:165,179; tasks.md:38,170 |
| M-206 (one classify function for reachability and launch) | resolved | spec.md:258; tasks.md:169 |
| M-207 (preset name predicate in domain) | resolved | plan.md:170; tasks.md:31,130 |
| M-208 (WSLENV generation in infra/runtime) | resolved (new drift: B13) | plan.md:193-199; tasks.md:86-89 |
| M-209 (model predicates in domain/provider) | resolved | plan.md:151-153; tasks.md:34 |
| M-210 (provider charter / _overview) | resolved | tasks.md:198-199 |
| M-211 (`--exec` pin test / regression) | resolved | plan.md:144,288-293; tasks.md:183-186 |
| M-212 (SC-007 negative cases) | resolved | spec.md:325-330 |
| po L-101 / L-102 / L-103 / L-104 | resolved | spec.md:141; spec.md:222-223; spec.md:161; tasks.md:77 |
| sec N-004 (child processes inherit secret env) | resolved | plan.md:267 |
| B6 (`--exec` already allowed) | resolved | plan.md:144; tasks.md:88 |
| B7 (where fork env is measured) | resolved | spec.md:329; tasks.md:214 |
| B8 (`checkProviderDraft` covered) | partially resolved | BE-008 tasks.md:80 includes it; SC-010 spec.md:335 still names only `checkProviderPatch` (B19) |
| arch L-101 / L-102 / L-005 | resolved | tasks.md:196; spec.md:376; plan.md:277 |
| PB L-101 (`isSameDistro`) | resolved | plan.md:223; tasks.md:171 |
| A17 (SH-004/005 tagged [BE] under Shared) | unresolved | tasks.md:28,33 |
| A18 (FR-017 sits between FR-003 and FR-004) | unresolved | spec.md:186 |

### Findings
| ID | Category | Severity (CRITICAL/HIGH/MEDIUM/LOW) | Location(s) | Summary | Recommendation | vs prev |
|---|---|---|---|---|---|---|
| B9 | Coverage gap / write-read symmetry | MEDIUM | spec.md:244-246 (FR-013 applies the denylist to extraEnv and env-passthrough keys, at IPC, provider-record and launch); plan.md:215; tasks.md:173-174 (BE-032 targets only "extraEnv の KEY"); code validate.ts:312 and provider-record.ts:108-109 (varNames checked only by `isValidName`) | varNames of env-passthrough (e.g. `PATH`, lowercase names) are not checked against `isForbiddenForwardKey` / `isValidForwardKeyName` at registration or on read. Only the launch-time throw in `composeLaunchEnv` catches them. Such a Provider registers fine, shows as reachable, and fails every launch with `invalid-config`. | Add varNames to BE-032, to plan.md:215 (`isValidCredentialDraft` env-passthrough branch) and to the provider-record target. Add one boundary-value case to SC-010 or SH-020. | new (H-201 / H-203 residual) |
| B10 | Ambiguity (security predicate) | MEDIUM | spec.md:243-245; plan.md:155-156; tasks.md:35 | "curated base と同名のキー" is compared on names that must match `^[A-Z_][A-Z0-9_]*$`. So `SYSTEMROOT` and `WINDIR` pass the name rule, and an exact-match check would not flag them as the curated `SystemRoot` / `windir`. Windows env names are case-insensitive, so the wsl.exe spawn env could carry a second SystemRoot under different casing. | State that the forbidden-key comparison is case-insensitive (at least for the curated base and `PATH`). Add `SYSTEMROOT` / `WINDIR` negative cases to SH-020. | new |
| B11 | Single source of truth / layer | MEDIUM | plan.md:154-157 (`domain/provider/forward-env.ts` lists `SystemRoot`/`windir`/`TEMP`/`TMP`/`WSL_UTF8`/`WSLENV`); code launch-spec.ts:24 (`LAUNCH_ENV_ALLOWLIST`), derive-env.ts:9-10 (X-3 injects the deny predicate precisely so domain does not duplicate it, L-03) | The curated base key set would exist in both infra (`LAUNCH_ENV_ALLOWLIST`) and domain (`forward-env.ts`). If X-1 adds a base key, the forbidden set silently stops covering it, which is the same failure as C-101. It also puts WSL transport names into domain/provider. | Either inject the forbidden predicate the way X-3 does with `isDeniedEnvKey`, or add a pin test asserting `LAUNCH_ENV_ALLOWLIST ∪ {WSL_UTF8, WSLENV} ⊆ forbidden`. Record the choice in AD-041 (e). | new |
| B12 | Regression risk | MEDIUM | derive-env.ts:32,46 (`DERIVATION_CONTROLLED_KEYS = {CLAUDE_CONFIG_DIR}`, an X-3 PB-H-001 guard); tasks.md:84 ("除外ではなく拒否にする"); spec.md:245 (forbidden list lacks `CLAUDE_CONFIG_DIR`) | The forbidden list does not include `CLAUDE_CONFIG_DIR`, and BE-009 rewrites the extraEnv branch. That could drop the guard that stops a raw HostPath from bypassing RuntimePath conversion. The method-specific keys (`ANTHROPIC_API_KEY` etc.) are also not said to be off-limits to extraEnv. The credential denylist covers most of them, but not `CLAUDE_CODE_USE_BEDROCK` or `CLAUDE_CONFIG_DIR`. | Add `CLAUDE_CONFIG_DIR` (all derivation-controlled keys) to the forbidden list, or state in BE-009 that `DERIVATION_CONTROLLED_KEYS` stays. Add an SH-020 case: extraEnv `CLAUDE_CONFIG_DIR` is rejected. | new |
| B13 | Plan/tasks drift / architecture | MEDIUM | tasks.md:92 (agents decoder re-checks the WSLENV elements, that they exist in env and are not base keys); plan.md:184-190 (agents section has no such item); plan.md:193 ("WSL transport 固有の処理はここ (infra/runtime) に閉じる"); allowlists.mjs:421-422 (`src/agents/` is WSL-free); code sdk-agent-session.ts:163-183 | The decoder task gives agents knowledge of WSLENV format and of the base key set, which contradicts the plan's statement that this stays in infra. Check 15 does not catch it mechanically, but it is the same move that AD-036 §8 undid. | Pick one. (a) Keep it, add it to the plan, and have agents check via a transport-neutral predicate imported from domain (e.g. "WSLENV only lists keys present in env"). Record the exception in AD-041 (e). (b) Drop it from BE-009 and rely on `composeLaunchEnv` plus the pin test. | new |
| B14 | Traceability / cross-spec reconciliation | MEDIUM | spec.md:269 (FR-016 says X-3 FRs are not redefined); spec.md:247 (env-passthrough values injected "方式固有キーと同じ扱い"); 007 spec.md:258-265 (X-3 FR-009 (b) allows method injection only for a "実名固定集合", not generic pass-through); tasks.md:22 (SH-001 adds only the C-4 pointer) | Injecting user-chosen varNames (e.g. `ANTHROPIC_API_KEY`), exempt from the credential denylist, widens X-3 FR-009 (b). AD-041 (e) reconciles only AD-036 §6, not X-3 FR-009 or AD-039 §3. The H-202 pointers in 005 contracts C-5 and data-model §7 are also untasked, and X-3 FR-009 cites C-5 as its source of truth. This does not reopen the human decision. | Add "X-3 FR-009 (b) / AD-039 §3 env-passthrough" to AD-041 (e)'s list of sections it reinterprets. Extend SH-001 to add AD-041 pointers in C-5 and data-model §7. Soften FR-016 to "X-3 の FR を継承 (FR-009 (b) は AD-041 (e) で拡張)". | new (H-202 residual) |
| B15 | Data compatibility | MEDIUM | tasks.md:80,173-174 (read side gains `isValidModelId` charset / `isValidForwardKeyName` / forbidden keys); code provider-store.ts:100-121 (an invalid record is skipped and the file backed up); spec.md:372 (the UI notice for this is X-6) | X-3 is merged, so a `providers.json` may hold extraEnv keys that are lowercase or now forbidden, or model IDs outside the new charset. With the tighter read checks those Providers disappear on load, with only a `.bak` and no UI notice until X-6. The spec never says whether that is acceptable or whether a migration or schemaVersion bump is needed. | State the policy in FR-013 / FR-017 or the Assumptions: accept the loss (early product, backup kept), or migrate or validate only at launch. Add one provider-store test for a pre-X-4 record. | new |
| B16 | Underspecified mapping | LOW | tasks.md:166-171 (BE-031 `classifyHelperPath → RuntimePath \| null`); reachability.ts:38-41 (config-dir maps stopped / no mapping to `blocked` and failed conversion to `unreachable`) | When a helper Provider's path cannot be classified, it is not said which `Reachability` value it gets (`blocked` if the mapping is pending or the runtime is stopped, `unreachable` otherwise). A `null` return loses that distinction, and the exclusion reason shown for FR-002 depends on it. | Return a reason from classify (e.g. `{ok:false, reason:'blocked'\|'unreachable'}`), or fix the mapping in BE-031. | new |
| B17 | Inconsistency (AC vs FR) | LOW | spec.md:154-156 (US-4 AC4: a Windows path or a UNC from another distro may be converted via PathMapping); spec.md:253-256 (FR-014: POSIX absolute path or HostPath, everything else rejected) | UNC paths are converted with `fromUnc`, not PathMapping. FR-014 rejects every UNC, including one from the same distro. The AC wording suggests some UNC path could be converted. | Make AC4 say "HostPath は PathMapping で変換、UNC は拒否", or add a `fromUnc` + `isSameDistro` rule to FR-014. | new |
| B18 | Semantics drift | LOW | derive-env.ts:46 (an extraEnv key hitting the credential denylist is silently skipped) vs spec.md:243 (forward-key violations are rejected, not dropped) | Since X-4 now actually forwards extraEnv, an extraEnv like `AWS_REGION` or `FOO_TOKEN` is silently lost at launch, while forbidden keys are rejected. The two behaviours are now visible to the user and differ. | State in FR-013 whether hits on the credential denylist stay silently skipped (and ideally reject them at registration via the same predicate). | new |
| B19 | Coverage (minor) | LOW | spec.md:335 (SC-010 names only `checkProviderPatch`) vs tasks.md:80 | The SC measurement path still omits `checkProviderDraft`. | Add `checkProviderDraft` to SC-010. | B8 partial |
| B20 | Test-change enumeration | LOW | plan.md:257; code launch-spec.test.ts:68 (asserts prefixArgs end with `'--'`), :70 (`spec.env toBe env`, while the params change to `{baseEnv, launchEnv}`); session-core.test.ts:141 (fixture uses `'--'`) | H-202 asked for every X-1 test that changes to be named. Only `:29` is listed. | List `launch-spec.test.ts:68,70` (and the session-core fixture) in AD-041 (b)/(f) or in SH-011. | new (H-202 residual) |
| B21 | Constitution Check completeness | LOW | plan.md:47-60 vs constitution.md:294 (Principle II, NON-NEGOTIABLE), :606 (X), :663 (XII) | The table skips Principle II, even though this feature places WSL transport logic (`--exec`, WSLENV) in infra/runtime. X and XII are also absent without an "N/A" note. | Add rows: II ✅ (WSL-specific logic is inside infra/runtime), X and XII N/A or ✅. | new |
| B22 | Editorial | LOW | plan.md:280 | "`passthroughValues`X-3 pr-gate D-L-101/102 と…" — two sentences run together. | Split the sentence. | new |
| A17 | Structure | LOW | tasks.md:28,33 | SH-004 and SH-005 sit under Shared Tasks but carry the [BE] tag. | Retag them or move them to Backend. | unresolved |
| A18 | Ordering | LOW | spec.md:186 | FR-017 sits between FR-003 and FR-004. It is cosmetic and can be left. | — | unresolved |

### Coverage Summary
| Req | Has task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | Y | SH-004, BE-001, BE-002, FE-001 | |
| FR-002 | Y | FE-001, SH-022 | B16 (exclusion reason) |
| FR-003 | Y | BE-001, FE-001, SH-022 | |
| FR-017 | Y | SH-005, BE-008, FE-003 | B15 |
| FR-004 | Y | SH-001, SH-004, BE-003, SH-010 | |
| FR-005 | Y | BE-003, BE-004, BE-005, BE-006, BE-007, FE-002 | |
| FR-006 | Y | BE-001, BE-006, BE-020, FE-001, FE-010 | |
| FR-007 | Y | BE-001 | |
| FR-008 | Y | FE-020 | |
| FR-009 | Y | SH-004, BE-010, BE-011, BE-012, BE-013, FE-010 | |
| FR-010 | Y | BE-011, SH-020 | |
| FR-011 | Y | BE-012, FE-010 | |
| FR-012 | Y | BE-030 | |
| FR-013 | Y | SH-000, SH-005, BE-006, BE-009, BE-032, SH-020, SH-023 | B9 (varNames at IPC/record), B10, B11, B12, B13, B14 |
| FR-014 | Y | BE-031, BE-032 | B16, B17 |
| FR-015 | Y | SH-003, SH-014, FE-004 | |
| FR-016 | n/a | (inherited) | B14 (FR-009 (b) widened) |
| SC-001 | Y | BE-001, SH-020, SH-022 | |
| SC-002 | Y | BE-006, BE-020, SH-020, SH-022 | |
| SC-003 | Y | BE-011, SH-020 | |
| SC-004 | Y | BE-011, BE-013, SH-020, SH-022 | |
| SC-005 | Y | BE-003, BE-004, SH-010, SH-020 | |
| SC-006 | Y | BE-030, SH-020, SH-023 | |
| SC-007 | Y | BE-009, BE-006, SH-020, SH-023 | B10 (casing negatives) |
| SC-008 | Y | FE-020 | |
| SC-009 | Y | BE-009, SH-011, SH-020, SH-023 | |
| SC-010 | Y | BE-008, SH-020 | B19 |

Every task maps to a requirement. SH-012, SH-013 and SH-015 record obligations carried over from earlier features.

### Metrics
- Critical 0 / High 0 / Medium 7 (B9–B15) / Low 9 (B16–B22, A17, A18)
- Requirements: 27 (FR 17 + SC 10), within budget (FR ≤ 20, SC ≤ 10, US 4 ≤ 4, AC 7/4/3/4 ≤ 8)
- Tasks: 40 (SH 16, BE 17, FE 7)
- Coverage: 100% of the 26 buildable requirements have at least one task
- Ambiguity 3 (B10, B16, B17) / Duplication 1 (B11)
- Round 2: the 1 Critical and 3 Highs are closed (H-202 partly, with residuals in B14/B20). All 12 Mediums are resolved. B8 is partial. A17 and A18 remain.
- Next: B9–B15 can each be closed with a line or two in FR-013 / plan / tasks, plus the AD-041 (e) section list. None blocks the gate. Re-run with `/cl-design --spec-dir specs/008-session-launch-settings-dialog-and-presets --from gate`.

Files referenced (all under C:\dev\closta\):
- `specs/008-session-launch-settings-dialog-and-presets/{spec,plan,tasks}.md`, `gate-r2/{design-gate,analyze}.md`
- `specs/007-provider-registration-and-reachability/spec.md`, `specs/005-session-launch-and-streaming/{contracts/session-launch.md,data-model.md}`
- `src/domain/provider/{derive-env,types,reachability}.ts`, `src/domain/runtime/{namespace,descriptor}.ts`
- `src/main/infra/runtime/launch-spec.ts` (+`.test.ts`), `src/main/infra/settings/{provider-record,provider-store}.ts`
- `src/main/app/{validate,composition-root,provider-service}.ts`
- `src/agents/{session-core,sdk-agent-session}.ts`, `src/agents/session-core.test.ts`
- `scripts/constitution/{allowlists,check}.mjs`, `.specify/memory/constitution.md`, `docs/roadmap.md`
