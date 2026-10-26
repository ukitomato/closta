# convention-reviewer Review: O-12 notices, checkpoints and content blocks (spec 022) — code-gate iteration 2

**Run**: 2026-10-27
**Reviewer**: convention-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Round**: 2 (code-gate iteration 2)

## 初回読了 viewpoint

- FR/SC: this diff (uncommitted fixes after pr-gate round 1) touches FR-002 (the `tool_use_summary` branch comment), FR-012 (the shared notice-row function), the announcer for the notification category, and the new ADR AD-061.
- Charter / Confirmation: docs/domains/session/charter.md and docs/domains/ui/charter.md (related_adrs); `docs/domains/_overview.md` records the O-12 exception. ADR 0061 has `status: accepted`, a `# AD-061` title and a `## Confirmation` section (grep only).
- A. 該当なし: owned by security-reviewer. No auth, secret or process-boundary change.
- B. 該当なし: owned by security-reviewer. The announcer key including `data.detail` is a dedup key only; not rendered or injected.
- C. 該当なし: owned by architecture-reviewer.
- D. 該当なし: owned by architecture-reviewer. Only AD-061 reference consistency checked here.
- E. 該当なし: owned by po-reviewer.
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. 該当なし: owned by optional reviewers (a11y, ux).
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

lint-agent JSON: eslint on the 6 touched .ts/.tsx files returned exit_code 0 with 0 violations. Invoker whole-project checks all exited 0: tsc node, tsc web, dependency-cruise, constitution/check.mjs. No CONV-1 Critical or High.

- CONV-2/3: no new source files. ADR file name follows `NNNN-kebab-case.md`. touched-files.txt lists the new paths.
- CONV-4: no import changes.
- CONV-5: no dead code; `data.detail` is an existing `RowFields` field.
- CONV-6: the four src comments (`sdk-agent-session.ts:968`, `notice-rows.ts:8`, `system-event.test.ts:376`, `transcript-dto.ts:98`) now point to AD-061; no stale reference left in src. AD-061 appears in session charter, ui charter, `_overview.md` and spec.md. Cross-references consistent.

H detail: `TranscriptAnnouncer.test.tsx:163-176` covers rewrite-then-reread for the key change at `transcript-announcements.ts:75`, and the same body returning as `notice` not being reread. Other categories keep fixed keys; no regression path seen.

## Findings

### [Low] An untracked `.vitest/` directory (test output) is not gitignored (L-001) (scope: feature)

- **観察**: git status shows `?? .vitest/`; `.vitest\json\output.json` exists.
- **同種事象探索**: Grep `0061|AD-061` over *.json matched `.vitest\json\output.json:1`. One stray directory.
- **リスク/影響**: May be committed by accident with `git add -A`. No effect on lint or behaviour.
- **推奨アクション**: Add `.vitest/` to `.gitignore`, or do not stage it.
- **根拠**: CONV-3. Low; per AD-050 not fixed in the gate.
- **scope 根拠**: Not in touched files; repository setting.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `0061\|AD-061` in *.json (.vitest artifact) | 1 | .vitest\json\output.json |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from N-1: n/a / unresolved: 0 / new: 1

### Lint input (CONV-1)

lint-agent JSON received; `exit_code` 0 for all commands. No non-zero-exit Critical.

Supplementary (invoker): tsc node 0, tsc web 0, dependency-cruise 0, constitution/check 0.
