# platform-boundary-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-22
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/021-session-resume/spec.md
**Gate**: pr-gate, Round 1

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 / SC-002〜SC-009. The ones that fall to platform-boundary are FR-003 / FR-004 (conversation id crosses the main↔agents boundary, UUID checks in 3 places), FR-005 (axis resolution, origin vs location), FR-011 (U-5 duplicate check), FR-014 (one `resume` injection point, no WSL/Win32 branching) and FR-017 (fail closed on the first `init`).
- Charter / Confirmation that apply to the touched files: session charter Journey 4, AD-059 Confirmation, AD-003 (multiple runtime instances), AD-004 (branded paths), AD-012 (not touched: docker is not in this diff), Principle I / II / III / VI / VII.
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

X-9 adds a `resume` key to the query options (11 → 12). It carries the SDK's `system/init` `session_id` from the session thread through the supervisor to the main registry. The UUID shape is checked at `supervisor-protocol.ts:116/:175`, `sdk-agent-session.ts:314`, `session-core.ts:186` and `validate.ts:461/:467`. Past-row axes are resolved in `resume-axes.ts` from the enumeration target and the row's cwd origin. Live-row resume uses the records the main process keeps for ended rows. Both kinds of resume go through the same `startSession` → `prepareLaunch` gate as a new launch.

I re-checked the code-gate PB findings L-001 to L-004 (all Low and not must_fix). They are unchanged and I do not report them again here.

PB check results:
- **PB-1 (path types lost at the boundary):** only opaque ids cross IPC (targetKey / UUID / folderId / runtimeId / providerId). `PastResumeDTO` (`src/domain/capability.ts:42`) carries no paths. The provider match in `resume-axes.ts:97-101` compares the `resolveConfigDirPath` result against the enumeration target's `configDir` by namespace plus value, so it stays in one namespace. Nothing new beyond L-001 / L-003.
- **PB-2 (single runtime instance assumed):** see L-101.
- **PB-3 (false capability claims):** the optimistic path where a past row in a non-default WSL home shows as resumable is code-gate L-002 (accepted under AD-059 Consequences). Every target from `target-finder.ts:246/:340` has `origin: 'default'`, so this is the existing L-002. Otherwise 該当なし.
- **PB-4 (permission gate bypass):** 該当なし.
  - `checkResumeRequest` (`validate.ts:457`) always passes `checkLaunchConfig`. Only the 3 safe modes get through.
  - The main side rejects any change to the inherited 3 axes as `invalid-config` (`resume-service.ts:93-99` / `:114-120`). Applying a preset in the renderer cannot change them either.
  - The resumed `init` fails closed when it reports a mode outside the 3 safe values, or no mode at all (`sdk-agent-session.ts:890-898`).
- **PB-5 (missing multi-hop path conversion):** 該当なし. docker endpoints are not touched. The past-row match uses `resolveFolderRuntime` (`resolution.ts:154-192`), the launch uses `resolveCwd` (`composition-root.ts:522`), and `resume-axes.ts:89` requires an exact match on the folder root. Both conversion paths already existed and this diff does not change them.
- **PB-6 (building a persistent environment):** 該当なし. Resume does not create volumes, configs or packages. It only reads and appends to the transcript that already exists.
- **PB-7 (lint rule coverage):** 該当なし.
  - The diff adds `resume-service` to the service-io rule (`.dependency-cruiser.js:254`) and to `WSL_FREE_DIRECTORIES` (`allowlists.mjs:427-428`).
  - Splitting out `resume-axes.ts` was forced by `ui-not-to-core` actually firing 118 times, so that rule works.
  - Only main-side modules import `resume-axes` (`ipc.ts:26`, `session-ipc.ts:12`, `resume-service.ts:7`).
  - The diff adds no `process.platform` / `os.platform` / `node:path` / `require(`.

## Findings

### [Low] U-5's duplicate check keys on the conversation id alone, not on runtime × config dir (L-101) (scope: feature)

- **観察**: `src/main/app/session-launch-service.ts:358-365` decides `already-running` / `conversation-running` only by `entry.conversationId === resolved.conversationId` and `inFlightConversations.has(conversationId)`. The registry `Entry` holds `axes.runtimeId` (`:171`), but the check does not use it.
- **同種事象探索**: `conversationId === resolved.conversationId|inFlightConversations.has` matched 2 places (`src/main/app/session-launch-service.ts:359`, `:363`). The `cached` lookup in `liveTranscriptTargetKey` (`src/main/app/resume-service.ts:148-150`) also takes the first target in the location by conversation id alone.
- **リスク/影響**: AD-003 lets several runtime instances (Win32 + several distros) hold the same transcript, for example after copying `~/.claude` into WSL. If the user resumes the WSL copy while the Win32 copy is running, Closta silently selects the Win32 row instead (`already-running`). This is fail-safe and the conditions are narrow, so Low.
- **推奨アクション**: Put `axes.runtimeId === config.runtimeId` in the same check, or key it on `(runtimeId, providerId, conversationId)`. Do not fix it this round (AD-050).
- **根拠**: AD-003 (multiple runtime instances), PB-2.
- **scope 根拠**: Fixable within the touched file `session-launch-service.ts`.

### [Low] (H) No test pins L-101's cross-runtime case (L-102) (scope: feature)

- **観察**: In `src/main/app/session-launch-service.test.ts`, the U-5 tests use the same runtimeId for the running row and the request. No case has the same conversation id under a different runtimeId.
- **同種事象探索**: The Grep for `already-running` cases that use different runtimes found 0 hits.
- **推奨アクション**: Add 1 test when L-101 is fixed.
- **根拠**: SC-006.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 | `conversationId === resolved.conversationId\|inFlightConversations.has` | 2 | src/main/app/session-launch-service.ts:359, :363 (related: src/main/app/resume-service.ts:148) |
| L-102 | `already-running` cases with different runtimes | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2

Under AD-050, Low findings are not fixed in this gate. Code-gate L-001 to L-004 are still open as Low.
