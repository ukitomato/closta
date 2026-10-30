## Specification Analysis Report — 024-session-launch-axes (Track A / analyze)

Inputs read: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/launch-config-v2.md, quickstart.md, docs/domains/session/charter.md, docs/domains/_overview.md, docs/glossary.md (relevant entries), .specify/memory/constitution.md (principle index), docs/decisions/0041, 0042, 0047, 0062, 0064 and the existence of 0007, 0016, 0031, 0036, 0040, 0043, 0059. I also spot-checked the cited source and test files with Glob/Grep. No files were modified and no scripts were run. `.specify/extensions.yml` was not checked for hooks.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| F1 | Inconsistency | High | spec.md FR-003 (L188) vs data-model §4.1, research R-06, AD-064 Decision 2, tasks BE-011 | FR-003 says main re-evaluates FR-002 and converts "残った folder id", which reads as "drop the bad items and keep launching". data-model §4.1, research R-06, AD-064 D2 and BE-011 all say the opposite: if `directoryResets.length > 0`, reject with `invalid-config` ("main は黙って外さない"). US-1 AC6 agrees with rejecting. An implementer following the FR literally would contradict the ADR and the tests. | Rewrite FR-003 as: "main は起動ゲートで FR-002 を再評価し、外す項目が 1 つでもあれば `invalid-config` で拒否する (黙って外さない)。全件が通れば…変換して agents に渡す". |
| F2 | Inconsistency | Medium | data-model §2.3 bullets (L117) vs research R-05 P-4 (L74) vs tasks BE-010 (L46-47) | data-model (the stated rules SSoT) skips only rule 3 (`unreachable`) when no runtime is selected; rule 2 (`same-as-folder`) only needs `draft.folderId !== null`. research P-4 and BE-010 say that when **either** folder or runtime is unselected, both rule 2 and rule 3 are skipped. BE-010's test row "ランタイム未選択で `unregistered` だけ" contradicts data-model when a folder is selected. | Settle on one rule and fix the other two files. data-model's version is more natural, since `same-as-folder` needs only the folder. If it wins, change BE-010's description and test to "ランタイム未選択で 3 を評価しない". |
| F3 | Underspecification | Medium | data-model §4.2 (L161), plan「実装方針」main, tasks BE-011 | For a Windows folder on a WSL runtime, `resolveFolderRuntime` needs a PathMapping. The source is given only vaguely ("今の cwd の解決と同じ情報から得る…確定している"). Today the WSL cwd goes through `composition-root.ts` `resolveCwd`, not `launch-preparation.ts`. BE-011 does not say how `launch-preparation` gets the mapping, or whether a new dependency must be injected. | In BE-011 / data-model §4.2, name the dependency that supplies the PathMapping (for example the existing `resolveFolderRuntime` deps used at `:126-134` for Win32) and say whether `LaunchPreparationDeps` changes. |
| F4 | Constitution-adjacent (Principle I) | Medium | data-model §5.2, research R-07, tasks BE-003 | The `posix` branch of `isLaunchDirectoryValue` re-implements the value rules of `makeRuntimePath` (leading `/`, no `\`, no `.`/`..` segments, no controls, ≤4096) in `agent-session.ts`, instead of going through the domain path API. This is not a violation, because it is validation in domain and not path manipulation. But two copies of the POSIX rule can drift apart. | Export the value-only predicate from the domain path module that `makeRuntimePath` uses, and call it from `isLaunchDirectoryValue`, or add a test that checks the two agree. |
| F5 | Terminology drift | Low | spec Summary L26 / AD-064 Context L17 ("軸 6→9") vs data-model §1 / SH-011 ("キー 6→10") vs data-model §10 ("10 軸の列挙") vs tasks SH-001 ("10 キーの列挙") | Axes and keys are counted differently, and data-model §10 mixes the two ("10 軸"). This matters for the glossary edit (Principle XIV). | Use "keys" for `SessionLaunchConfig` (10) and "dialog axes" for the UI (9) consistently. Fix data-model §10 to say "10 キー". |
| F6 | Stale references | Low | plan Glossary excerpt / 申し送り #13-#16, data-model §10, tasks SH-001 | The glossary line numbers have shifted by about +9: Concurrency limit counterexample :217→:226, Session name counterexample :1041→:1050, SessionLaunchConfig :1093-1102→:1102-1111, fork :944/:954→:953/:963. tasks already says to re-resolve with Grep. | No action required. Optionally refresh the numbers. |
| F7 | Inconsistency | Low | research.md header L5 ("P-1〜P-12") vs body / plan / tasks / AD-064 ("P-1〜P-11") | Only P-1..P-11 exist. | Change the header to P-1〜P-11. |
| F8 | Underspecification | Low | spec Clarifications L92 vs data-model §9.3 L306, tasks FE-001 ("外した通知の 3 種") | The spec's [ASSUMED] wording lists 2 removal messages. data-model adds a third (`same-as-folder` → "…作業フォルダと同じため外しました"), but the row header is the confusing "`unreachable` / `same-as-folder`". | Split the §9.3 row into three reason→message rows. Optionally add the third message to the spec's Clarification. |
| F9 | Inconsistency | Low | spec SC-006 L231 (`launch-usage.test.ts`) vs tasks BE-030 (`launch-usage-service.test.ts`) | Both files exist; `launch-usage.test.ts` is the domain one. The SC's measurement path names a different file from the task's test. | Align SC-006 with BE-030 (or add the assertion to the file SC-006 names). |
| F10 | Stale "plan で決める" | Low | spec Key Entities L218, FR-016 L213 | The spec still defers two points to plan: name inside `SessionLaunchConfig`, and the `nextFeature` target. plan decided both (R-03 → in config; R-12 → stays X-6). The plan's "設計後の見直し" edited the spec for other points but not these. | Update the two sentences to state the decision and cite R-03 / R-12. |
| F11 | Citation precision | Low | spec 本 feature の位置づけ L54 and 義務の扱い L64, AD-064 Context L21 | The spec attributes "パスの入力を renderer に足す…`ui-path-concat`" to AD-041 (h). AD-041 (h) (0041:133-139) lists only "追加ディレクトリ / 上限 / セッション名の軸". The path-input enforcement comes from `tests/rule-fixtures/expected.mjs` `ui-path-concat` (`nextFeature: 'X-6'`) and 008. Substantively harmless. | Reword as "AD-041 (h) の追加ディレクトリの軸と、`ui-path-concat` の `nextFeature: X-6`". |
| F12 | Coverage (non-buildable) | Low | spec FR-006 / US-2 AC2, US-3 AC2 | Hitting a limit → O-4 reason, and the name appearing in the past list, are checked only by existing O-4 tests plus quickstart (SC-009). No new automated test feeds an `error_max_turns` result through a session launched with `maxTurns`. This is acceptable by design (FR-006 says don't change the classification), and SH-011 checks a zero diff on `classifyResult`. | Optional: one renderer test that a `max-turns` failure shows on a row launched with a limit. |

### ADR citation check
- AD-064 exists (`docs/decisions/0064-…`), `status: accepted`. Decisions 1-5 match plan / data-model / tasks.
- AD-041 (g) (0041:125-131) is the escalation-neutral `QUERY_OPTION_KEYS` rule, and (h) (0041:133-139) names X-6 for the additional directory / limit / name axes. Correct apart from F11.
- AD-042 Decision 4's "今後の規則" (0042:60) explicitly names X-6 and requires bumping schemaVersion with a per-version reader inside the store. Correct.
- AD-062 Decision 4 (0062:39) keeps the name in main memory via the registry, and Consequences :45 says "`SessionLaunchConfig` は変わらない". Correct; the reinterpretation is in AD-064's "読み替える箇所".
- AD-047 contains `max-turns` / `max-budget`. Correct.
- AD-007, AD-016, AD-031, AD-036, AD-040, AD-043 and AD-059 exist and are cited for appropriate topics.
- The spec's earlier mistaken attribution ("AD-059 の 6 軸") was already corrected (research R-13). The glossary at :1109 confirms the real source.
- Cross-spec references check out: 021 FR-006 / FR-007 / FR-009 and 023 FR-009 / FR-012 / FR-014 have the cited content.

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 additional-dirs-axis-0-10-ids-only | Yes | BE-001, FE-010, SH-011 | |
| FR-002 resolve-dirs-reset-notify-crossboundary | Yes | BE-010, FE-010 | See F2 |
| FR-003 main-reeval-convert-agents-recheck | Yes | BE-011, BE-003, BE-004 | See F1 / F3 |
| FR-004 limits-axes-default-none | Yes | BE-006, FE-020 | |
| FR-005 limits-2-stage-validation | Yes | BE-001, BE-004, BE-005 | |
| FR-006 limit-reached-uses-O-4 | Partial | FE-020 (existing tests), SH-011 (zero diff) | See F12 |
| FR-007 launch-name-validation-title | Yes | BE-001, BE-004, BE-006, FE-030 | |
| FR-008 registry-name-init | Yes | BE-030, FE-030 | |
| FR-009 preset-saves-dirs-limits | Yes | BE-005, FE-040 | |
| FR-010 preset-no-name | Yes | BE-001, BE-005, FE-001, FE-040 | |
| FR-011 presets-v2-v1-read | Yes | BE-005 | |
| FR-012 resume-reselectable-axes | Yes | BE-005, FE-041 | |
| FR-013 overview-tab-rows | Yes | FE-011, FE-021 | |
| FR-014 launch-usage-unchanged | Yes | BE-030, SH-011 | |
| FR-015 ADR-and-pins-same-PR | Yes | BE-001, BE-002, BE-004 (AD-064 already written) | |
| FR-016 ui-path-concat-howToClose | Yes | SH-010 | |
| FR-017 charter/glossary/roadmap | Yes | SH-001, SH-010 | |
| SC-001 validation-boundaries | Yes | BE-001, BE-005 | |
| SC-002 resolution-table | Yes | BE-010 | |
| SC-003 query-options-16-and-gate-convert | Yes | BE-004, BE-006, BE-011 | |
| SC-004 preset-store-versions | Yes | BE-005 | |
| SC-005 dialog-components | Yes | FE-010, FE-020, FE-030, FE-040, FE-041 | |
| SC-006 registry/overview/launch-usage | Yes | BE-030, FE-011, FE-021, FE-030 | See F9 |
| SC-007 E2E | Yes | FE-012, FE-022, FE-031, FE-042 | |
| SC-008 verify | Yes | BE-007, SH-011 | |
| SC-009 real-machine | Yes (manual) | SH-011 (quickstart V-0..V-6), SH-010 | "未実施" is allowed and does not block the merge |

**Constitution Alignment Issues:** none at Critical. Every principle I-XV cited in the plan's Constitution Check exists with the cited numbering and topic. The widened read scope from `additionalDirectories` (relevant to Principle III and AD-041 (g)) is handled by the ADR (AD-064 D2) rather than silently. F4 is a Principle I-adjacent drift risk, not a violation. Principle XII: no new SDK-emitted information to display, so ui-coverage rows are unchanged, which is consistent.

**EARS completeness:** the project does not require EARS (no "EARS" anywhere in the constitution or `.specify`). The FRs use "〜しなければならない / してはならない" with explicit conditions and responses. Every FR has a subject, a condition and an observable outcome. The exception is FR-003's ambiguous response on re-evaluation (F1).

**Unmapped Tasks:** none. BE-007 (fixture spread) maps to SC-008 / FR-015. SH-001 maps to FR-017.

**Metrics:**
- Total Requirements: 26 (FR 17 + SC 9)
- Total Tasks: 25 (SH 3, BE 10, FE 12)
- Coverage: 100% of requirements have at least one task (FR-006 is covered indirectly, by design)
- Ambiguity Count: 2 (F1, F3)
- Duplication Count: 0
- Critical Issues Count: 0
- High: 1 (F1), Medium: 3 (F2, F3, F4), Low: 8 (F5-F12)

### Next Actions
- No Critical findings. Per AGENTS.md, fix the High in this round: rewrite FR-003 to "reject on any `directoryResets`" (designer, spec edit only). The Medium and Low findings stay in the gate output and are not fixed now.
- F2 and F3 are cheap to fix alongside F1 if the designer is already editing (data-model §2.3 / BE-010 wording; name the PathMapping dependency in BE-011).
