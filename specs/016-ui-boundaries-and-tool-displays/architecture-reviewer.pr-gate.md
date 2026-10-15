# architecture-reviewer Review: 016 UI boundaries and tool displays (O-6)

**Run**: 2026-10-16T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Round**: 2
**scope**: adr-drift (run together with the default mode)

## Initial-read viewpoint

- FR/SC: the Round 2 delta touches FR-004 / FR-005 (`secret-redaction.ts`), FR-011 to FR-013 (`tool-result-marks.tsx`), FR-016 (AD-049) and FR-017 (glossary). SC-002 is relevant.
- Charters / Confirmations: AD-049 Decision 3, Consequences, Confirmation; AD-047 Decision 2 and correction section; AD-031; Constitution XIV; data-model §1 (canonical source for redaction); docs/domains/ui/charter.md
- A. Authorization / authentication / secret management: N/A: owned by security-reviewer
- B. Input validation / injection / CSP / crypto: N/A: owned by security-reviewer
- C. Business invariants / Charter drift: Critical:0 High:0 Medium:0 Low:2
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:1
- E. User Story / SC / AC / UX: N/A: owned by po-reviewer
- F. Naming / module / lint hookup: N/A: owned by convention-reviewer
- G. optional reviewer scope: N/A: owned by ux / a11y / ui-coverage reviewers
- H. Tests / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## Scope summary

Round 2 covers the Round 1 fixes (AD-049, glossary, data-model / spec / tasks, secret-redaction.ts + test, tool-result-marks.tsx + test). Layering is unchanged: `secret-redaction.ts` is still a pure domain function with no imports (`src/domain/session/secret-redaction.ts:1-143`); `tool-result-marks.tsx` imports only `@/components/ui`, `@/features/chat/*`, `@/lib/utils`, `./surfaces` (`:3-8`).

## Round 1 inheritance

| Round 1 ID | Status | Basis |
|---|---|---|
| H-002 (glossary said `informational` "is not Hook output / out of scope") | **resolved** | `docs/glossary.md:423-424` now states Hook feedback can appear, as an exception to the O-2 rule, through redaction / 1 line / truncation, origin not distinguished. Matches AD-049 Context `:20`, reading table `:33`, Decision 3 `:39`, and glossary `:448`. `Hook の出力ではなく\|対象外` in the Hook entry: 0 hits. |
| M-001 (stderr retraction log) | unresolved (Medium, not fixed under AD-050) | `src/agents/sdk-agent-session.ts:403` |
| M-002 (data-model §5 F section) | unresolved (Medium) | `data-model.md:191` |
| L-003 (`total_terms: 99`) | unresolved (Low) | `docs/glossary.md:5` |
| L-001 / L-002 / L-004 / L-005 | not re-checked (Low) | — |

## Findings

### [Medium] H-001's mysql-flag fix changed the code (`{0,256}?`) but not data-model §1, the canonical source for the redaction spelling (M-101) (scope: feature)

- **Observation**: `src/domain/session/secret-redaction.ts:138` is `/((?:mysql|mysqldump|mysqladmin|mariadb)\b[^\n]{0,256}?\s-p)\S+/gi`. `specs/016-ui-boundaries-and-tool-displays/data-model.md:50` still has the unbounded `[^\n]*?`. data-model calls itself the canonical source (`:3`, `:38`). The JWT row (`:51`) was updated, only the mysql row was left. Smaller mismatches: ASSIGNMENT row (`:49`) still has the `[A-Za-z0-9_-]*` prefix the code dropped (`:96-97`, same match set, Low); code header comment (`:6`) still says 4 KB.
- **Same-pattern search**: `mysql` in data-model.md: 1 (`:50`); `\{0,256\}` in secret-redaction.ts: 1 (`:138`); `線形|二乗` in data-model.md: 1 (`:51`).
- **Risk / impact**: `-p` more than 256 chars after `mysql` is no longer redacted and the canonical source does not show it. Principle XIV drift. No test fixes either side of the 256 bound (H, combined).
- **Recommended action**: update `data-model.md:50` to `[^\n]{0,256}?` with a note on the bound; optionally drop the prefix at `:49`; update `secret-redaction.ts:6` to 200 KB.
- **Basis**: data-model §1, AD-049 Decision 3 / Consequences, Constitution XIV
- **Scope basis**: spec_dir docs + touched file

### [Medium] (carried over) M-002: data-model §5 F section disagrees with ui-coverage (scope: feature)

- `data-model.md:191` still says "使い道を本 feature の表示に"; ui-coverage has Tool call / Web search as 未使用. Not fixed, per AD-050.

### [Low] Could not inspect what changed in AD-049, so cannot confirm it was not edited after acceptance (L-101) (scope: feature)

- **Observation**: AD-049 is in `.pr-gate-scope.round2-delta.txt`. Lines cited in Round 1 (`:20`, `:33`, `:39`) match word for word; no correction section; `status: accepted`, `date: 2026-10-04` unchanged. The hunk in `.pr-gate.diff` (`:62-134`, new file vs base) matches the current text. Reviewer had no Bash to diff against Round 1.
- **Same-pattern search**: `^## 訂正` in 0049: 0 hits.
- **Recommended action**: the gate confirms `git diff HEAD -- docs/decisions/0049-*.md` is empty.
- **Basis**: AD-031, FR-016

### [Low] (carried over) L-003: `total_terms: 99` (`docs/glossary.md:5`)

### [Low] (carried over) M-001 observation point: stderr retraction log still unconditional (`src/agents/sdk-agent-session.ts:403`). Counted as Medium under H.

## H (tests / observability / regression)

- H-002 fix is doc-only; no test can catch it.
- H-001 fix: adversarial inputs added in `secret-redaction.test.ts`; no test fixes the mysql 256 bound (Medium, combined with M-101).
- Observability unchanged (M-001).

## Same-pattern search cascade summary

| Finding ID | Grep query | Hits | path:line |
|---|---|---|---|
| R1 H-002 check | `Hook の feedback が入りうる` (glossary) | 1 | docs/glossary.md:423 |
| M-101 | `mysql` (data-model.md) | 1 | data-model.md:50 |
| M-101 | `\{0,256\}` (secret-redaction.ts) | 1 | secret-redaction.ts:138 |
| M-002 | `使い道を本 feature の表示に` | 1 | data-model.md:191 |
| L-101 | `^## 訂正` (0049) | 0 | — |
| M-001 | `process\.stderr\.write\|console\.` (src/agents) | 1 | sdk-agent-session.ts:403 |

**ADR-drift mode conclusion**: no change contrary to an accepted ADR's Decision Outcome or Confirmation observed (Critical 0). AD-047: correction section only adds a reference. AD-049: no visible change; diff vs Round 1 unverified by reviewer (L-101).

## Verdict

- Critical: 0
- High: 0
- Medium: 2 (M-101 new, M-002 carried over)
- Low: 3 (L-101 new, L-003 carried over, M-001 counted under H)
- Round inheritance: resolved from 1: 1 (H-002) / unresolved Critical/High: 0 / new: 2 (M-101, L-101)
