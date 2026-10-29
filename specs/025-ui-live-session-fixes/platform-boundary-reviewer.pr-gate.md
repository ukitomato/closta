# platform-boundary-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Gate**: pr-gate round 1

## 初回読了 viewpoint

- FR/SC in my slice:
  - FR-005〜FR-007 / SC-002: the new `supportedModels()` path through agents → supervisor → main → renderer, and main's check that the chosen value is in the last list it received.
  - FR-008〜FR-010 / SC-003: only the names in the permission-mode table change. The selectable values stay the three safe ones (Principle III).
  - FR-016〜FR-018 / SC-006: `/resume` → `resolvePastResume` → `startPastResume`. This touches AD-003 (multiple runtime instances).
  - FR-001〜FR-004 / FR-011〜FR-015: layout and appearance in the renderer only. Outside the platform boundary.
- Charter / Confirmation that apply to the touched files:
  - Principle VII: `src/agents/sdk-agent-session.ts:136-140` and `src/agents/supervisor-protocol.ts:1-2` add imports from `@domain/provider/*` only. Neither depends on electron.
  - Principle III / AD-062: the diff does not touch `isAutoModeAllowed` or `checkSetPermissionModeArgs`.
  - AD-065 Confirmation: the method classification and the `queryHandle` `Pick` are at `src/agents/sdk-agent-session.ts:183-189,464`.
  - Constitution v1.5.0 only adds an Exception to Principle XV. Principles I / II / III / VI / VII are unchanged.
  - AD-004 / AD-012 and the runtime / isolation charters: no paths, no docker endpoint, and nothing in their Out of scope is touched.
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 — tests and log points exist for my slice:
  - A test that crosses the layers and catches a shape mix-up: `src/agents/live-models-path.test.ts`.
  - The worker decoder and the main decoder: `src/agents/supervisor-protocol.test.ts` (diff 4325-4396). It covers dropping out-of-shape entries and the `dropped` count.
  - The supervisor relays the result at once, not batched in the window: `src/agents/supervisor-core.test.ts` (diff 4251-4284).
  - `list-models` is not accepted while the session is closing: `src/agents/session-core.test.ts` (diff 4222-4224).
  - `checkListModelsArgs`: `src/main/app/validate.test.ts` (diff 5605-5614).
  - Log point: `[session] live-models count=N dropped=M` (`src/main/app/session-launch-service.ts`, diff 5440). It does not log model values.

## スコープ要約

This is a ui-domain change. Only 3 parts touch the platform boundary:

1. **Model list for the default Provider.** A new path: IPC `listSessionModels` → `SessionControl` `list-models` → `queryHandle.supportedModels()` → `models-result` → main stores `Entry.liveModels` → `setModel` checks against it.
2. **Permission-mode names.** Only the names change.
3. **`/resume`.** It runs through `startPastResume`, which `PastResumeBar` also uses.

The diff does not touch runtime abstraction, `capabilities`, path types, docker endpoints, or persistence.

PB-1〜PB-7, each re-checked against the code at head 8c9f442:

- **PB-1 (path types lost at IPC / persistence):** 該当なし. Nothing that crosses the boundary is a path (sessionId / requestId UUIDs, model id strings, opaque `targetKey`, folderId). `resumePickerRows` does not read `cwd` (`src/renderer/src/features/session/resume-picker-rows.ts:15-29`).
- **PB-2 (single-instance assumption):** 該当なし. Model list kept per-session on `Entry.liveModels` (null at launch, diff 5476); pending requests keyed by requestId, accepted only on matching sessionId + generation (diff 5425-5428); sharing only for same sessionId + generation (diff 5521-5523); thread end / supervisor exit / `killAll` settle pending (diff 5421, 5458, 5466). `/resume` takes `fixed.runtimeId` from `resolvePastResume` (`past-resume.ts:23-27`); session-index groups keyed by `folderId` with `boundary` (`src/domain/session/dto.ts:70-76`).
- **PB-3 (false `capabilities` claims):** 該当なし.
- **PB-4 (bypassing the permission gate):** 該当なし. `/resume` passes `initial: null` (`past-resume.ts:28`); `LaunchDialog.tsx` only removes description text (diff 6100); default-Provider `setModel` sends only ids in `liveModels` passing effort filter (diff 5491-5495).
- **PB-5 (missing multi-hop path conversion):** 該当なし.
- **PB-6 (building a persistent environment):** 該当なし. `liveModels` is memory-only (diff 5379).
- **PB-7 (coverage of the lint rules):** Low, 1 finding (L-001, carried over from code-gate). Only the type `Pick` guards the `supportedModels` call; one call today (`src/agents/sdk-agent-session.ts:792`).

## Findings

### [Low] The `mitigatedBy` text in `expected.mjs` does not say that `QueryLiveReadMethod` (`supportedModels`) is outside item 16 (L-001) (scope: feature)

- **観察**: `tests/rule-fixtures/expected.mjs:950` adds `supportedModels` to the list of methods that are called, but does not say `QueryLiveReadMethod` (`src/agents/sdk-agent-session.ts:183`) is outside item 16, nor that a direct `.supportedModels(` call on a raw `Query` would not be caught. Same as code-gate L-001.
- **同種事象探索**: Grep `supportedModels|QueryLiveReadMethod` in `src/**/*.ts`, `tests/**`, `scripts/**`: 1 call at `src/agents/sdk-agent-session.ts:792`; other hits are types (`:183`, `:189`, `:464`), tests, comments, `expected.mjs:950`.
- **リスク/影響**: No harm today. A reader of the fixture could wrongly think item 16 or tsc guards this read method.
- **推奨アクション**: Add one sentence to `mitigatedBy` at `tests/rule-fixtures/expected.mjs:950`.
- **根拠**: AD-065 Decision 1 / Constitution Principle VII Verification / PB-7
- **scope 根拠**: touched file.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `supportedModels\|QueryLiveReadMethod` (call sites) | 1 | src/agents/sdk-agent-session.ts:792 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
