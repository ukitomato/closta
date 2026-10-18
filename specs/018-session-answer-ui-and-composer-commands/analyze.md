## Specification Analysis Report

Feature: `specs/018-session-answer-ui-and-composer-commands`. This is Round 2. It covers spec, plan, tasks, data-model, research, quickstart and contracts. I checked it against the constitution, the session charter, the glossary, AD-052 / AD-053 (both still `proposed`) and the current source: `agent-session.ts`, `run-state.ts`, `session-core.ts`, `session-core.test.ts:248-270` and `running-session-store.ts`. No files were modified. `.specify/extensions.yml` has no analyze hooks.

Status labels: **resolved from prev** / **unresolved from prev** / **new**. The prev IDs refer to analyze.md.20261017T102721 (F1–F18) and design-gate.md.20261017T102721.

| ID | Category | Severity | Location(s) | Summary | Recommendation | Status |
|----|----------|----------|-------------|---------|----------------|--------|
| N1 | Inconsistency | HIGH | spec US-2 AC7 ("中断 (SDK の `signal`)… カードが外れ"), FR-009, data-model §4 renderer「外す」(応答・`failure`・終端の `state`・`close()` only), FE-020 tests ("外す 4 つの場面"), contracts C-2' (no cancel event) | When the SDK aborts an elicitation (signal, MCP-side timeout, user interrupt → `interrupted`), agents `drop` it and return `cancel`. Nothing tells the renderer, so its card stays. If it was the last pending item, agents move to `running`, and the UI shows a running session with a live card. Pressing that card does nothing, because agents ignore the unknown `requestId`. The renderer side of AC7 cannot be built from the stated events, and no task tests it. (Same root as the existing approval-card gap, but here the AC claims removal.) | Pick one. (a) Minimal: narrow AC7/FR-009 to user-initiated close/end, and record the stale card after a server-side abort as a known limit (pressing it is a harmless no-op). (b) Also remove `elicitations` when `runState` leaves `awaiting_permission`. This fails when an approval is pending at the same time, so state that. (c) Carry the cancel on an existing event so `SESSION_EVENT_KINDS` stays at 9 for SC-010. Add a matching FE-020 test. | new |
| F7 | Ambiguity | MEDIUM | data-model §4 renderer「外す」("`error` / `done` で終わったセッションではなく、`closed` など送れない終端"); `run-state.ts:15-16,38` | `closed` is not a `SessionRunState`. The only terminal states are `TERMINAL_STATES = ['error','done']`, and the rule excludes both, so the "終端の state" trigger matches no value. `done` sessions (agents `cancelAll()` on `finish`) keep their card. That contradicts AC7 ("セッションの終了"). | List the exact `SessionRunState` values that clear the queue (most likely `error`, `done`, and possibly `interrupted`). Fix FE-020 to match. | unresolved from prev |
| F5 | Inconsistency | MEDIUM | plan RK-07, BE-022 (two overlapping approvals keep `awaiting_permission`), FR-011; `running-session-store.ts:425-433` (`pending` is a single slot, overwritten) | Agents now stay `awaiting_permission` until every approval is answered. The renderer holds one `pending`, so a second `permission-request` overwrites the first. The first can never be answered, and with this feature's rule the session never leaves 承認待ち. FE-010 does not touch this. | Make `pending` a queue (like `elicitations`), or record the gap explicitly in Risks with a test that documents it. | unresolved from prev |
| N2 | Underspecification | MEDIUM | data-model §2 `ElicitationField` ("`properties` の項目が 1〜32… 外れたら `fields: null`"), BE-020 test ("項目 0 … で `fields: null`"), spec US-2 AC8 / SC-003 (`{}` accept now allowed) | A form with zero properties (a plain "proceed?" confirmation) is treated as unsupported and can only be declined or cancelled. Yet main and agents now accept `content: {}`. After the C-001 fix this is the one remaining valid form the user cannot accept. | Allow 0 properties (render only the message plus 送る / 断る / 取り消す, with accept sending `{}`), or state explicitly in spec Edge Cases that empty-schema forms cannot be answered. | new |
| F8 | Underspecification | MEDIUM | data-model §2 key regex `^[A-Za-z0-9_.-]{1,64}$` (allows `__proto__` / `constructor` / `prototype`) vs §3 `isElicitationContent` (rejects those keys); BE-020 test ("`__proto__` / `constructor` の項目名", no expected value) | Partly fixed: the content predicate now has a rule. §2 still lets these names into `fields`. A field named `constructor` is then drawn, but any value for it fails the renderer pre-check. A required field like that leaves a form that can never be submitted, showing `invalid` with no way to fix it. | In §2, treat these 3 names as out of the subset (making `fields` `null`) so §2 and §3 match. Give BE-020 that expected value. | unresolved from prev (partially resolved) |
| F4 | Coverage / Underspecification | MEDIUM | data-model §4 (`ELICITATION_MAX_PENDING = 4`, 5th auto-`decline`), plan Scale/Scope, contracts C-5'; absent from spec Clarifications / Assumptions / U-6 (b) | The pending limit and the silent decline it causes appear only in plan / data-model. The user is never told that a request was declined automatically (design-gate M-001). | Add the limit to the spec Clarifications as [ASSUMED], and decide whether anything is shown when it triggers. | unresolved from prev |
| F6 | Underspecification | MEDIUM | spec FR-015 / US-4 AC2, research R-09, data-model §5「編集して再試行」, FE-040 ("最も近い `user-*`"), RK-09 | The retry text is still "the nearest `user-*` before the refusal row". With the X-2 queue, a later queued input can sit between the refused message and the refusal row, so the wrong text is restored. RK-09 covers only the case where no text is found. | Add an edge case for queued input. Either limit the button to the case where exactly one app-sent input belongs to the refused turn, or document the rule and test it in FE-040. | unresolved from prev |
| F9 | Inconsistency | MEDIUM | spec FR-004 ("「全 return は `toPermissionResult` を通す」の静的な検査は…直す"), data-model §1 pin row ("`session-core.test.ts:248-270` の静的な検査を…直す"), plan「機械強制の変更」row 2; BE-011 ("今のまま通し… キーの検査で固定する"); actual test is a runtime key check | Fixed in tasks only. FR-004, data-model and plan still describe changing a static check that does not exist, which contradicts BE-011. | Reword FR-004, data-model §1 and the plan row to "runtime key-set tests per tool", matching BE-011. | unresolved from prev |
| F11 | Inconsistency | LOW | AD-052 Decision 4 (d) ("射影の関数の呼び出しの外"), research R-10 / BE-012 (any `updatedInput` / `updatedPermissions` in non-test code under `src/agents/` is a violation) | The ADR text still differs from the backstop that is actually built. | Align AD-052 Decision 4 (d) with R-10 while it is still proposed. | unresolved from prev |
| F13 | Underspecification | LOW | plan 層ごとの変更 (session-core.ts row), BE-011; `session-core.ts:81` `CanUseToolLike` | research R-02 says the return type becomes a union, but neither the plan table nor BE-011 lists changing `CanUseToolLike` to return `CanUseToolResult`. | Add it to the BE-011 description and the plan row. | unresolved from prev (partially) |
| F14 | Ambiguity | LOW | quickstart V-1 last bullet, BE-010 ("`updatedInput` の綴りが src の非テストのコードで現れるのはこのファイルだけ"), SH-013; `session-core.ts:169` comment spells `updatedInput` | "(コメントを除く)" is still attached only to the `updatedPermissions` clause. The existing comment in `session-core.ts` breaks the `updatedInput` claim when read literally. | Apply "(コメントを除く)" to both clauses (the same as item 16's `src.code`), or update that comment in BE-011. | unresolved from prev |
| F15 | Constitution (VIII) / Coverage | LOW | FE-011 (AskUserQuestion「その他」free text); FE-021 now states "Enter を送信に結ばない" | Partly fixed: the Elicitation card now has the rule. The AskUserQuestion「その他」field still has no IME / Enter rule and no test. | In FE-011, state that「その他」does not bind Enter to send, and add a test that a composing Enter does not submit. | unresolved from prev (partially) |
| F16 | Underspecification | LOW | SH-002 (`npx assistant-ui@latest add`), plan Technical Context (0.15.19 pinned), CLAUDE.md (avoid `npx`) | `@latest` registry items may not match the installed 0.15.19. | Pin the registry / CLI version, or record the version compared in the PR description. | unresolved from prev |
| F17 | Coverage | LOW | SC-004 (marker test for Elicitation only), AD-052 Consequences (answers are not persisted or logged) | No SC or task checks that AskUserQuestion answers stay out of the agents / main logs. | Extend the BE-011 / BE-013 or FE-023-style marker check to answers. | unresolved from prev |
| F18 | Terminology | LOW | spec Key Entities ("問いの要求 (ElicitationRequest の写し)") vs data-model / contracts `ElicitationPrompt` | Still named differently. | Name `ElicitationPrompt` in the spec's Key Entities. | unresolved from prev |
| N3 | Underspecification | LOW | FE-021 (accept is sent from the link's `onClick`), research R-08 ("中クリックなどでも同じ防御に落ちる") | A middle-click (or open via context menu) opens the browser through `setWindowOpenHandler` but fires no `click`. No `accept` is sent, the card stays, and the user has to press the link again, which opens the URL a second time. | Also handle `auxclick`, or document that only a primary activation counts as accept. | new |
| N4 | Coverage | LOW | SC-003 (measurement path names `tests/elicitation/elicitation-through.test.tsx` for the URL case), FE-023 ("…import を許さなければ…段ごとのテストの入力と期待値に共有する形に分ける") | The SC measurement path depends on a condition the task leaves open. If the fallback is taken, no single through-test exists. | Check the dependency-cruiser rule for `tests/` now and fix one form in both SC-003 and FE-023. | new |

**Resolved from previous round:**
- F1: URL accept rejected twice. Resolved by data-model §3 (split by mode), contracts C-1' / C-5', the BE-021 / BE-024 / FE-023 URL cases and spec U-8.
- F2: "the card stays" contradicted the store, which sends and forgets. Resolved by U-9: the IPC result stays `Promise<void>`, the predicates live in domain, the renderer checks before sending, and the Edge Cases text was rewritten.
- F3: empty optional form rejected. Resolved: `content` is optional and may have 0–32 keys, and the form value rules are in §3.
- F10: "問いのカード" was ambiguous. Resolved: SH-001 and plan define it as the Elicitation card.
- F12: AD-053 Decision 6 said the id was used for matching. Resolved: it is now used only for the row id.
- From the design-gate, as seen in this pass: C-001, H-001 (U-8), H-002 (whitespace-only answers fail at all 3 layers, and 「答えた」 is defined), H-003 (U-9), H-004 (through-test and positive accept fixtures) and H-005 (implementation is blocked until AD-052 / AD-053 are accepted, and SH-013 checks it) are resolved in the artifacts.

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 answer UI in approval card | Yes | FE-011, BE-011, FE-010 | F15 |
| FR-002 answers via respondPermission + domain predicate | Yes | BE-010, BE-013, FE-010, FE-011 | |
| FR-003 projection in agents | Yes | BE-010, BE-011 | |
| FR-004 boundary pins + item 16 backstop | Yes | BE-010, BE-011, BE-012 | F9, F11, F13 |
| FR-005 onElicitation / no onUserDialog | Yes | BE-020, BE-021, BE-022 | |
| FR-006 elicitation-request shape + store queue | Yes | BE-020, BE-021, FE-020 | F8, N2 |
| FR-007 question card (form / URL / unsupported) | Yes | FE-021 | N3 |
| FR-008 respond-elicitation validation | Yes | BE-020, BE-021, BE-024 | |
| FR-009 no persistence / log, discard on abort | Yes | BE-021, BE-022, FE-020, FE-023 | N1, F7 |
| FR-010 elicitation_complete row | Yes | BE-020, BE-023, FE-022 | |
| FR-011 awaiting_permission aggregation | Yes | BE-022 | F5 |
| FR-012 slash command candidates / IME | Yes | FE-031, SH-002 | F16 |
| FR-013 Japanese composer labels | Yes | FE-030 | |
| FR-014 focusOnRunStart=false | Yes | FE-030 | |
| FR-015 edit-and-retry | Yes | BE-040, FE-040 | F6 |
| FR-016 ui-coverage rewrite | Yes | SH-011 | |
| FR-017 records | Yes | SH-001, SH-010, SH-012 | |
| SC-001 | Yes | BE-010, BE-011, FE-011, SH-013 (V-3 left to the user) | |
| SC-002 | Yes | BE-010, BE-011, BE-012 | |
| SC-003 | Yes | BE-020, BE-021, BE-024, FE-021, FE-023 | N2, N4 |
| SC-004 | Yes | BE-022, FE-023 | F17 |
| SC-005 | Yes | BE-023, FE-022 | |
| SC-006 | Yes | FE-031 (component + E2E) | |
| SC-007 | Yes | FE-030 | |
| SC-008 | Yes | BE-040, FE-040 | F6 |
| SC-009 | Yes | SH-011, SH-013 | |
| SC-010 | Yes | BE-020, BE-021, BE-024, SH-013 (V-1) | F14 |

**Constitution Alignment Issues:**
- None of the NON-NEGOTIABLE principles (I–VIII) is violated, so there are no CRITICAL findings.
  - Principle III: the exact tool-name match, the domain-only projection, `updatedPermissions` staying at 0, and the item 16 backstop together close the escalation surface.
  - Principle V: elicitation input is never persisted or logged, and URLs are redacted for display.
  - Principle VII: `createOnElicitation` sits in `session-core.ts` and does not import the SDK.
- Principle VIII has one LOW gap: the AskUserQuestion「その他」field has no IME / Enter rule (F15).
- Principle XIII: the SH-002 comparison is planned. The version pin is a LOW issue (F16).
- Governance: AD-052 / AD-053 are proposed and U-1〜U-9 are unapproved. tasks.md「着手の条件」and SH-013 now require `status: accepted` before any code is written and before `/cl-done`.

**Unmapped Tasks:** None. SH-002 (the Principle XIII comparison) and SH-013 (verification) are support tasks tied to FR-012 / FR-016 and to all the SCs.

**Metrics:**
- Total Requirements: 27 (17 FR + 10 SC)
- Total Tasks: 25 (6 SH, 10 BE, 9 FE)
- Coverage: 100% (all 27 requirements have at least 1 task)
- Ambiguity Count: 2 (F7, F14)
- Duplication Count: 0
- Critical Issues Count: 0
- Severity counts: **Critical 0 / High 1 / Medium 7 / Low 8** (16 findings: 12 unresolved from prev, 4 new; 5 prev analyze findings resolved)

### Next Actions
- There are no CRITICAL issues. Fix N1 (no renderer path removes the card after an agent-side cancel, which contradicts US-2 AC7) in this round, per AD-050. The smallest fix is to narrow AC7 and record the limit; F7, the exact list of states that clear the queue, can go in the same edit.
- MEDIUM items (F4, F5, F6, F8, F9, N2) stay in the gate output per AD-050. F8 and N2 are one-line data-model edits if the designer is already in §2.
- LOW items (F11, F13–F18, N3, N4) stay in the gate output. F11 is worth folding in while AD-052 is still proposed.
