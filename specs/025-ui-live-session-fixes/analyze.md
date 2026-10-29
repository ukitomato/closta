## Specification Analysis Report

Scope: spec 025-ui-live-session-fixes (spec.md, plan.md, tasks.md, data-model.md, research.md, quickstart.md, contracts/ipc-live-models.md), checked against the constitution v1.4.0, the ui charter, the glossary, ADRs (including untracked AD-065) and the current source.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| C1 | Inconsistency (Principle XIV terminology) | MEDIUM | spec.md US-4 title, FR-014/FR-015, SC-005, Summary; tasks.md US-4; plan.md (uses both forms) | Spec and tasks say 「右のパネル」. The glossary has 7 uses of 「右のペイン」 and none of 「右のパネル」; AD-046 and the ui charter (`:93-100`) also say 右のペイン. Principle XIV forbids synonyms. Code identifiers (`RightPanel`, `SHELL_WIDTHS.panel`) are fine. | Change the Japanese prose in spec, plan and tasks to 「右のペイン」. |
| D1 | Constitution / process | MEDIUM | plan.md 判断の承認, ADR 節, RK-08; AD-065 frontmatter `status: accepted`; AGENTS.md "Constitution Principle の採否は必ず人間が承認する" | (a) AD-065 was set to `accepted` during plan, before design-gate and before the human review that the constitution's 改定手順 step 2 requires. Under AD-031, any change to a decision found later at gate or PR review then needs a new ADR. (b) Plan reads adding an Exceptions item as outside the gated "Principle 採否" approval. That reading rests on U-4 only. | Either keep AD-065 at `proposed` until the PR review (step 2) and accept it at merge, or record explicit human acceptance of the Decision 4 wording in the spec's 判断の一覧. Keep RK-08 (separate PR for the constitution diff). |
| U1 | Coverage gap (edge case) | MEDIUM | spec.md Edge Cases bullet 1 (input box squeezed when the composer is narrow); plan RK-05; tasks FE-011/FE-012 | RK-05 says the narrow width is checked with E2E, but no task asserts that the input and send button keep their width when the composer is narrow. FE-011 checks only "is rendered / not rendered", and the screenshot test runs at one fixed width. | Add to FE-012 or FE-013 a check that the textarea width and send-button visibility hold at a narrow viewport (the CI width). |
| U2 | Underspecification | MEDIUM | data-model §6.2, §7.4; tasks FE-012, FE-053; `src/renderer/src/features/session/focus-handoff.ts:61` | `handOffFocusToComposer(scope)` moves focus only if focus is inside `scope`, and does nothing when the composer is disabled. Neither artifact says which `scope` each caller passes. FE-053 also copies `useDialogReturnFocus` from CommandPalette, which returns focus to its own target. That can conflict with "return to composer on close". | Name the `scope` argument per caller (the select element; the dialog content before unmount). State that the picker overrides or skips `useDialogReturnFocus`'s target. |
| I1 | ADR citation | LOW | plan.md Constitution の改定 (`**Exceptions** (AD-065 Decision 3)`) vs plan Summary, Constitution Check XV and tasks SH-011 ("AD-065 Decision 4") | The heading cites Decision 3 (the name rule) but the amendment is attributed to Decision 4. It matches the existing convention (headings cite the ADR item that defines the rule), but the two forms can read as a mismatch. | Add one sentence in plan: "heading cites the rule (D3); the amendment act is D4". |
| I2 | Identifier consistency | LOW | tasks FE-010 test ("名前の表の 7 値") vs AD-065 Confirmation and plan Summary ("6 値") | 7 = the 6 Claude Code modes plus `unknown`. The counts differ only by that. | Write "6 値 + `unknown`" in FE-010. |
| I3 | Inconsistency | LOW | plan.md Scale/Scope ("新設のモジュール 4 つ") | It lists 3 new files plus 1 function added to an existing file. | Change to "新設 3 ファイル + 既存ファイルへの関数 1 つ". |
| I4 | Task ordering | LOW | tasks.md 記法 (definition of `[P]`) vs 依存と順序 §3 and §6 | By its own definition, `[P]` BE-024 waits for BE-020–BE-023, and FE-052 waits for FE-051. The dependency list says BE-024 needs only BE-020, and FE-052 is independent. | Move BE-024 directly after BE-020 and FE-052 before FE-051, or relax the `[P]` definition. |
| I5 | Stale text | LOW | spec.md Assumptions L239-241 (`[ASSUMED: …]` ×3); plan.md Project Structure ("spec.md # status を planning に") | Plan resolved all three ASSUMED items (R-05, R-07, R-03/§7.3), but the spec still marks them ASSUMED. The spec's status is now `tasking`. | Replace the markers with the decisions and references; drop the stale comment. |
| I6 | Data-model vs source | LOW | data-model §7.3 (`rowTitleText(summary)`); `src/renderer/src/features/session-list/rows.ts:145` | The real signature is `rowTitleText(title: SessionTitle, formatTime)`. | Change to `rowTitleText(summary.title, formatSessionTime)`. |
| I7 | Glossary drift (existing) | LOW | `docs/glossary.md:1016` SessionControl; tasks SH-001 | The glossary says "8 種類" but lists 7 kinds (`respond-elicitation` is missing; the code at `agent-session.ts:315-326` has 8). SH-001 only bumps the count from 8 to 9. | In SH-001, list all 9 kinds explicitly, including `respond-elicitation` and `list-models`. |
| U3 | Underspecification | LOW | tasks SH-010 ("`:285` の行も plan の表のとおり見直す"); plan layer table | `ui-coverage.md:285` is the Composer slash commands row. Plan only lists the line number and gives no action. | State the edit, e.g. note that the app command `/resume` is merged into the candidates (025). |
| U4 | Spec/plan alignment | LOW | spec US-4 AC3, FR-014 (truncated name readable by pointer and screen reader) vs plan 設計後の見直し 2 | Under R-07 (scroll, no truncation), AC3 never applies, and no task tests it. FE-040 does check that names are not truncated. | Add a note to AC3 in the spec ("R-07 により省略しない") so design-gate and po do not count it as uncovered. |
| I8 | Identifier consistency | LOW | plan layer table (domain/preload row) vs tasks BE-024 | BE-024 touches `src/preload/index.d.ts`, which the plan table and Source tree leave out. | Add it to the plan table. |

Checked and found correct:
- **ADR files**: AD-019/024/031/033/036/037/038/043/044/045/046/047/059/062 all exist.
- **ADR contents match what the plan cites**:
  - AD-036 §4 P3 is at `:144`.
  - AD-062 Decisions 1–3 and Decision 6 (`control-result`) say what the plan says.
  - AD-037 `useEscapeKeydown` ignores `isComposing` (`:69`).
  - AD-047 `:79` places the display names in `PERMISSION_MODE_NAMES`.
- **Line references** all match their targets:
  - Constitution: Principle XV Exceptions `:885-893`, Amendment trail `:1064`, Version line `:1093`, version 1.4.0.
  - Glossary: `:184/613/720/857/937/948/980/1013/1398`.
  - ui charter: `:46/68/74/93-100/110/170-179/186/215/223`.
  - ui-coverage: `:33/219/220/227/284/338/359`.
- **`QueryUnusedReadMethod`** currently has 6 members, so 5 after the move, as planned.
- **Symbols named by tasks** all exist in source: `handOffFocusToComposer`, `createCappedAdapter`, `switchableModels`, `isValidModelEntry`, `MAX_CATALOG_MODELS`, `CONTROL_RESULT_TIMEOUT_MS`, `RESUME_UNAVAILABLE_LABELS`, `PERMISSION_MODE_DESCRIPTIONS`, `matchesAllTerms`.

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 selectors moved to composer, removed from header | Yes | FE-011, FE-012, FE-013 | |
| FR-002 reuse 023 blockers and paths | Yes | FE-012 | 023 table tests must pass without edits |
| FR-003 IME, send and focus unchanged; focus returns | Yes | FE-011, FE-012 | scope semantics: see U2 |
| FR-004 ui-coverage F section rows | Yes | SH-010 | `:285` unclear (U3) |
| FR-005 `supportedModels()` after first response | Yes | BE-020–BE-025, FE-020 | |
| FR-006 effort filter; main checks against last list | Yes | BE-023 | |
| FR-007 fail, empty or timeout gives a disabled selector with reason | Yes | BE-023, FE-020 | |
| FR-008 Claude Code names, descriptions removed | Yes | FE-010 | |
| FR-009 single name table | Yes | FE-010 | string test outside labels.ts |
| FR-010 version constant and review step | Yes | FE-010, SH-010 | |
| FR-011 stop button less prominent | Yes | FE-030 | `outline` |
| FR-012 Esc stops when focused and not composing | Yes | FE-030, FE-031 | RK-04 fallback |
| FR-013 Esc not stopping in other cases | Yes | FE-030 (b)–(e), FE-053 | |
| FR-014 tabs do not wrap and all are reachable | Yes | FE-040, FE-042 | AC3 vacuous (U4) |
| FR-015 usage values do not wrap | Yes | FE-041, FE-042 | |
| FR-016 `/resume` candidate, deduplicated | Yes | FE-050, FE-053 | |
| FR-017 intercept `/resume` (with or without args) | Yes | FE-050, FE-051 | |
| FR-018 picker leads to X-9 resume, Japanese, keyboard, focus return | Yes | FE-052, FE-053, FE-054 | |
| SC-001 | Yes | FE-012, FE-013 | |
| SC-002 | Yes | BE-020–BE-025, FE-020, FE-021, SH-012 (V-1/V-2) | the real-device part may be "未実施" (not run) under the night rule |
| SC-003 | Yes | FE-010, FE-013 | |
| SC-004 | Yes | FE-030, FE-031 | |
| SC-005 | Yes | FE-040–FE-042 | |
| SC-006 | Yes | FE-051, FE-053, FE-054 | |
| SC-007 | Yes | FE-013, FE-031, SH-012 | screenshot baseline taken from the CI artifact |

**Constitution Alignment Issues:**
- No conflicts with MUST principles.
- **Principle XV**: the English mode names are handled by an Exceptions amendment (MINOR, 1.4.0 → 1.5.0/1.6.0). The version bump fits the versioning table ("指針の実質的な拡張 = MINOR").
- **Process concern (D1)**: the ADR was accepted before the review step, and approval of the Exceptions wording is inferred from U-4.
- **Principle XIV**: one terminology drift (C1). SH-001 adds the glossary entries before any code is written, as XIV requires.
- **Principles III, IV, VII, VIII and XIII** were checked in the plan and are consistent with the tasks.

**EARS completeness:** No EARS template exists in the repo; the FRs use MUST / MUST NOT style. Every event-driven or state-driven requirement names its trigger or condition:
- FR-005 (after the first response)
- FR-012 (while generating, focus in composer, not composing)
- FR-013 (the cases where Esc must not stop)
- FR-014 (when the tabs do not fit)
- FR-017 (when `/resume` is submitted)

The remaining FRs are always-on requirements, which is acceptable. No finding.

**Unmapped Tasks:** None. SH-001, SH-011 and SH-012 cover Principle XIV, the AD-065 Decision 4 amendment, and verification.

**Metrics:**
- Total Requirements: 25 (18 FR + 7 SC)
- Total Tasks: 28 (BE 6 / FE 18 / SH 4)
- Coverage: 100% (25/25 have at least one task)
- Ambiguity Count: 2 (U2, U3)
- Duplication Count: 0
- Critical Issues Count: 0 (HIGH 0 / MEDIUM 4 / LOW 10)

### Next Actions

- There are no CRITICAL or HIGH findings, so `/cl-implement` can proceed after design-gate.
- Before implementation, fix the four MEDIUM items:
  - C1: replace 右のパネル with 右のペイン in spec, plan and tasks.
  - D1: decide whether AD-065 stays `accepted` or goes back to `proposed` until the PR review.
  - U1: add a narrow-width assertion to FE-012 or FE-013.
  - U2: specify the `handOffFocusToComposer` scope and how it overrides the dialog's return focus.
- The LOW items are small edits to tasks.md and plan.md (I2–I4, I8, U3), spec.md (I5, U4), data-model.md (I6) and SH-001 (I7). They can be folded into one `Agent(designer)` pass.
