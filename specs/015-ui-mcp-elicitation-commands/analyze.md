## Specification Analysis Report — 015-ui-mcp-elicitation-commands (O-5 / Track A / design-gate R2)

Scope: spec.md, plan.md, tasks.md, data-model.md, research.md, quickstart.md and .needs-input.md, checked against the constitution, ui charter, glossary, AD-047/AD-048 and the current main code. Line numbers checked with Grep and Read only. No files were modified. `.specify/extensions.yml` was not checked, so hooks were skipped.

### Findings (open: new or unresolved)

| ID | Category | Severity | Location(s) | Summary | Recommendation | Prev |
|---|---|---|---|---|---|---|
| F1 | Inconsistency | HIGH | data-model §2 (renderer の保持: 後勝ち) / §3 (スラッシュコマンド: 名前・argumentHint・説明) / spec US-2 AC4 / FR-008 / tasks FE-001, FE-021 tests / `sdk-agent-session.ts:310` | `commands_changed` arrives before the first prompt (`sdk-agent-session.ts:310`), and `init` arrives at the start of every turn. The first `init-report` is always sent because there is no baseline yet. Its `slashCommands` is `string[]` (names only), and under "last one wins" it replaces `commands`. So the descriptions and `argumentHint` that §3 promises almost never show. They return only after a mid-session `commands_changed`, and disappear again at the next changed `init-report`. The FE-021 test ("後から届いた init-report が勝つ") locks this behaviour in. | Decide the merge rule: "last one wins" decides only which set of names is shown, and descriptions and hints are looked up by name from the latest `commands` (a `Map`). Alternatively, `init-report` replaces the list only when its name set differs from `commands`. Update §2, §3, US-2 AC4 and the FE-001 / FE-021 tests. | new |
| F2 | Inconsistency | MEDIUM | spec US-1 AC5 ("実行中と同じ形") vs AC4 / data-model §1 row 3 / FE-012 test ("過去ログと実行中の fixture で同じ DOM") | Past logs have empty `knownServers`, so every `mcp__s__t` gets `inferred: true` and the "サーバー名は推定" mark. Live sessions do not show the mark once an `init-report` has arrived. So the same call renders differently in past logs and live, which contradicts AC5. Even an unambiguous `mcp__github__create_issue` is always marked in past logs and before the first turn. | Either show the mark only when `rest` has 2 or more `__` (an actually ambiguous split), or state in AC5 that the inferred mark may differ between past logs and live, and fix the FE-012 test fixtures to match. | new |
| C1 | Underspec | MEDIUM | data-model §3 (`PanelTab.attention?: (sessionId) => boolean`) / tasks FE-020 / `RightPanel.tsx` / `panel-tabs.ts` (static table) | `attention` is a plain function on a static table entry. Nothing says how the collapsed strip re-renders when `initReport` changes (US-2 AC3 / AC5). It cannot read zustand reactively without a hook, and calling hooks inside a loop over tabs is fragile. | Give it a selector shape, `attention?: (m: SessionMeters) => boolean`, which `RightPanel` evaluates through `useSessionMeters(displayedSessionId, …)`. Name where `RightPanel` gets the displayed session id. Add a test: "印 appears and clears on a state-only update while collapsed". | new (prev C4 added the field; reactivity still open) |
| G1 | Process / gating | MEDIUM | spec 義務の扱い, Clarifications, Edge Cases, FR-014, Assumptions / .needs-input.md Q1–Q3 / plan RK-01 / tasks `[Q1]` `[Q2]` `[Q3]` | Three decisions are provisionally set to option A and still unapproved: the AD-047 correction section, moving the 2 composer obligations to another owner, and the URI summary plus no MCP mark on the monitoring-view row. Q2 changes who owns a roadmap system-scope item. None are domain-decomposition or Principle decisions, so not Critical. The plan itself says O-5 stops at design-gate. | Get the human answers before `/cl-implement`. If any answer is B or C, edit the tasks marked `[Qn]` (RK-01). | new |
| L1 | Inconsistency | LOW | spec Edge Cases ("超えた数を「ほか N 件」") vs data-model §3 / §6 `configOmitted` | The edge case promises a per-list "ほか N 件", but the data model has only one aggregated `omitted` and a single message. | Pick one wording; change the Edge Case text to the aggregated form. | unresolved from prev (L4, partial) |
| L2 | Inconsistency | LOW | spec FR-014 ("`METER_UPDATE_TYPES` の固定テストを直す") vs plan #14 / data-model §2 / BE-002 ("足す") | Spec wording still wrong; downstream documents reinterpret it. | Change FR-014 to "足す". | new |
| L3 | Inconsistency | LOW | tasks BE-010 (`src/agents/live-message.ts:61`) | The file is `src/domain/session/live-message.ts:61`. | Fix the path. | new |
| L4 | Inconsistency | LOW | data-model §2 (基準は `run()` の closure) vs plan step 2 / tasks BE-020 (`createLiveSignals` の closure) | Data model and tasks disagree on where the dedup baseline is held. | Align on `createLiveSignals` (`live-signals.ts:127`). | new |
| L5 | Ambiguity | LOW | tasks BE-020 test ("O-4 の権限モードの比較のテスト (BE-040 の `init` の観点)") | "BE-040" means O-4's task but collides with this spec's BE-040. | Write "014 BE-040" or name the test file. | new |
| L6 | Inconsistency | LOW | research R-08 ("plan の申し送り #16〜#18") | #16 is the URI item; the real-name lists are #17 and #18. | Change to "#17 / #18". | new |
| L7 | Inconsistency | LOW | plan Technical Context ("新しいモジュール 6 (domain 1・renderer 5)") | Renderer gets 4 new modules, so 5 in total. | Change to "5 (domain 1・renderer 4)". | new |
| L8 | Ambiguity | LOW | spec FR-001 ("入力の値を見出しに出さない") vs FR-002 / data-model §1 | FR-002 is an intended exception but FR-001 states the rule as absolute. | Add "(FR-002 の URI の要約を除く)" to FR-001. | new |
| L9 | Underspec | LOW | tasks FE-012 / O-4 `useLiveToolElapsed` | Not stated whether `McpToolCall` shows the live tool elapsed time. | Add one line to FE-012. | unresolved from prev (L8) |

### Previous findings resolved

| Prev ID (source) | Summary | Status / where it was fixed |
|---|---|---|
| analyze F1 / gate H-01 | Dedup compared counts and lengths | resolved: full serialization, baseline updated only when sent (data-model §2, BE-020, SC-002) |
| analyze C1 / gate H-02 | Image/resource marks | resolved: not shown (U-7, FR-006, AD-048 D4) |
| analyze F2 / gate H-03 | AC4 vs §1 name parsing | resolved: longest match plus inferred mark. F2 above is a new side effect. |
| analyze B2 / gate H-04 | Approval card truncation | resolved (FR-004, FE-014, SC-001) |
| gate H-05 | No machine check for "do not operate MCP" | resolved: `QUERY_MUTATION_METHODS` +11, pin test, fixture (FR-011, BE-040) |
| gate H-06 | AskUserQuestion interim notice | resolved: AC7/AC8, FR-005, FE-013/FE-014 |
| gate H-07 | Composer slash commands owner | resolved: U-6 → O-10, SH-013 |
| analyze B1 | URI credentials | resolved (R-07, FE-010); decision still unapproved (G1 / Q3) |
| analyze C2 | Throttling of config | resolved |
| analyze F3 | `config` name collision | resolved (`init-report` / `SessionInitReport`) |
| analyze F4 | Plugin name semantics | resolved |
| analyze D1 | XIII ordering | resolved |
| analyze C3 | `auth_status` switch branch | resolved (BE-031) |
| analyze C4 | `PanelTab` attention field | resolved (field added); reactivity open, see C1 |
| analyze L1, L2, L3, L5, L6, L7 | — | resolved |
| gate Medium/Low (sec, arch, pb, po) | — | resolved; pb M-003 deliberately sent to system scope (plan #19, SH-012) |
| gate status note | Unapproved U-1–U-7, proposed ADRs, unmerged O-7/O-4 | resolved |

### Coverage Summary

| Requirement | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | Yes | BE-010, FE-010, FE-012 | |
| FR-002 | Yes | FE-010, FE-012 | |
| FR-003 | Yes | FE-012 | |
| FR-004 | Yes | FE-014 | |
| FR-005 | Yes | FE-013 | |
| FR-006 | Yes | FE-012 | |
| FR-007 | Yes | BE-001, BE-002, BE-020 | |
| FR-008 | Yes | FE-001 | F1 |
| FR-009 | Yes | FE-020, FE-021 | C1 |
| FR-010 | Yes | BE-030, BE-031, FE-030 | |
| FR-011 | Yes | BE-040 | |
| FR-012 | Yes | SH-010 | |
| FR-013 | Yes | SH-012 | |
| FR-014 | Yes | SH-013, BE-002 | L2; Q1 open |
| FR-015 | Yes | SH-001, SH-012, SH-013 | Q2 open |
| SC-001 | Yes | FE-010, FE-012, FE-013, FE-014 | F2 |
| SC-002 | Yes | BE-001, BE-020, FE-001, SH-020 | |
| SC-003 | Yes | FE-020, FE-021, BE-031, FE-030 | |
| SC-004 | Yes | SH-010, SH-014 | |
| SC-005 | Yes | BE-040, SH-014 | |

### Constitution Alignment Issues
No violations (no Critical). III / IV / V / VII / VIII / XV / XII / XIII / XIV checked; glossary Meter "6 types" (`glossary.md:569`) will need updating via SH-001.

### Unmapped Tasks
SH-002 (Principle XIII), SH-011 (real-name lint and reviewer lists, plan #17/#18), SH-014 (verification) — each has a stated reason.

### Metrics
- Total requirements: 20 (FR 15 / SC 5)
- Total tasks: 24
- Coverage: 100% (20/20)
- Ambiguity count: 2 / Duplication count: 0
- Critical: 0 / High: 1 / Medium: 3 / Low: 9
- Previous: 20 resolved, 2 unresolved (L4 partial → L1, L8 → L9)

### Next Actions
- No Critical findings on the analyze track.
- Before `/cl-implement`: fix F1 and get the human answers to .needs-input.md Q1–Q3 (G1).
- Same designer pass: F2, C1, and the Low one-line fixes.
