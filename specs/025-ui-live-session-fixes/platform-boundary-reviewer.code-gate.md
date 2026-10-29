# platform-boundary-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Round**: 3 (code-gate iteration 3, re-run from status reviewing after the MF-001 fix)

Result: Critical 0 / High 0 / Medium 0 / Low 1. The one Low (L-001) is carried over from iteration 2. The MF-001 fix resolved nothing on my list and added nothing new.

## 初回読了 viewpoint

- FR/SC that touch my slice have not changed since iteration 2:
  - FR-005 to FR-007 / SC-002: the `supportedModels` path.
  - FR-008 / FR-009 / SC-003: only the permission-mode names change. The three safe values stay the same.
  - FR-016 to FR-018 / SC-006: the `/resume` path through `resolvePastResume`, which carries `runtimeId`.
- What the MF-001 fix changes:
  - `src/renderer/src/features/session/labels.test.ts:264-276`: the `RESUME_PICKER_LABELS` key test now lists 6 keys including `noMatch`. It also checks that `noMatch` is a function that includes the search text.
  - `specs/025-ui-live-session-fixes/data-model.md` §9: the `noMatch` key is now recorded.
  - Both are renderer label text and its documentation. Neither touches `src/agents/`, `src/main/`, `src/domain/`, `src/preload/`, any path type, `capabilities`, the permission gate, or the lint/rule fixtures.
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0. The fix does not touch anything in the runtime or isolation charters' Out of scope.
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0. Principles I / II / III / VI / VII and AD-003 / AD-004 / AD-012 are unaffected, because only renderer test text and docs changed.
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1 (L-001, carried over)
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0. My slice's tests are unchanged since iteration 2 and still in place:
  - `src/agents/live-models-path.test.ts`
  - `src/agents/sdk-agent-session.test.ts` (the `supportedModels` call, its reject, and no call while closing)
  - The log point in `src/main/app/session-launch-service.ts`
  - The new test covers only renderer labels, so it cannot cause a regression across the platform boundary.

## スコープ要約

PB-1 to PB-6 still do not apply, for the same reasons as iteration 2:
- No paths cross a boundary.
- `liveModels` is stored per Entry and per session.
- `/resume` gets `runtimeId` from `resolvePastResume` and passes `initial: null`.
- `capabilities` and the permission gate functions are not in the diff.
- No path conversion and nothing persistent is created.

The MF-001 change reaches none of these. PB-7: L-001 is carried over unchanged.

## Findings

### [Low] The `mitigatedBy` text in `expected.mjs` does not say that `QueryLiveReadMethod` (`supportedModels`) is outside the item-16 check (L-001, carried over) (scope: feature)

- **観察**: `tests/rule-fixtures/expected.mjs:950` lists `supportedModels` as a method that is called. It does not say that `QueryLiveReadMethod` (`src/agents/sdk-agent-session.ts:183`) is outside the item-16 `QUERY_MUTATION_METHODS` denylist. It also does not say that a direct call to `.supportedModels(` on a raw `Query` would not be caught. The MF-001 fix did not change this line.
- **同種事象探索**: Grep `supportedModels|QueryLiveReadMethod` in `tests/rule-fixtures/expected.mjs` still finds only line 950. There is still 1 call site, at `src/agents/sdk-agent-session.ts:792`, and the agents diff has not changed since iteration 2.
- **リスク/影響**: No harm today. A reader could wrongly assume that item 16 also guards read methods.
- **推奨アクション**: Add 1 sentence to `mitigatedBy` on line 950: "`QueryLiveReadMethod` (`supportedModels`) is also outside item 16. A direct call outside the `queryHandle` `Pick` is checked by platform-boundary-reviewer on agents diffs." Per AD-050 this is a Low, so it is not fixed now and stays in the gate output.
- **根拠**: AD-065 Decision 1 / Constitution Principle VII Verification / PB-7
- **scope 根拠**: It can be fixed on the same line of a file this feature already touches.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `supportedModels\|QueryLiveReadMethod` in expected.mjs | 1 | tests/rule-fixtures/expected.mjs:950 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from 2: 0 / unresolved: 1 (L-001) / new: 0
