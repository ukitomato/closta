# platform-boundary-reviewer Review: X-4 (pr-gate round 4)

**Run**: 2026-10-01
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 4

## 初回読了 viewpoint

- **FR / SC in scope**: FR-006, FR-008, FR-014 / US-1 AC7, US-2 AC3. These are the only ones the Round 3 fixes touch.
- **Charters and Confirmations that apply to the touched files**:
  - AD-016 (cross-boundary warning)
  - AD-004 / Principle I (only convert a path when a conversion table exists)
  - PB-3 (do not say a runtime or Provider "can't" based on stale facts)
  - AD-041 (main is the launch gate)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer owns this. Round 3 added no secret or credential path.
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer owns this.
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1 (L-601)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owns this. L-601 touches the US-1 AC7 guidance, but I only point at the place where the user has no way forward.
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0. Rules and fixtures are unchanged in Round 3, so not re-running test:rules is acceptable.
- G. optional reviewer 範囲: 該当なし: this is not an optional reviewer.
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1. No test covers L-601 (details in Verdict).

## スコープ要約

**Read statically:**
- `src/renderer/src/features/session/LaunchDialog.tsx`: the whole file, focusing on `:82-114`, `:186-191` and `:236-258`.
- The tests at `LaunchDialog.test.tsx:432-652`.
- `labels.ts:172-203`.
- To compare the renderer's checks against what main actually does:
  - `resolution.ts:140-151`
  - `composition-root.ts:395-401`
  - `launch-preparation.ts:85-129`
  - `runtime-store.ts:103-229`
  - `wsl-detector.ts:120-223`

**Not done:** I did not run wsl.exe, did not put any fixture under src, and did not re-run test:rules.

**Answers to the focused questions:**

1. **Does each blocked branch match what main does? Yes, all three.** main's `resolveCwd` is only part of the picture, because main also requires `claudePath`.
   - **`capabilities-not-probed`** means probeState is `idle` or `probing`, so `pathMapping === null`.
     - Every path that produces it also clears `claudePath`:
       - `detect()`'s descriptor has no `claudePath` field (`wsl-detector.ts:124-135`).
       - `beginProbing` passes `null, null` (`runtime-store.ts:152`, `:210-215`).
     - So main always rejects: a Windows folder gets `launch-failed` (`launch-preparation.ts:127`), and a WSL folder gets `claude-not-found` (`:128-129`).
   - **`probe-failed`**: every failure branch in probe returns `pathMapping: null` and leaves `claudePath` out (`wsl-detector.ts:173-221`). `withCapabilities` then sets it to null (`runtime-store.ts:110`). Main rejects for the same reason as above.
   - **`distro-not-running`**: the renderer's `runtime-stopped` blocker and main's `verifyRunning` → `distro-not-running` agree.
   - **WSL folders are not over-blocked.** `resolveCwd` returns the path for a WSL folder even without a mapping (`composition-root.ts:396`), but the launch still cannot succeed because `claudePath` is null.
     - A successful probe always comes with a mapping (`wsl-detector.ts:203-207`), so there is no state that is "blocked but launchable".
     - Holding WSL1 forever is also impossible: a successful WSL1 probe returns a mapping too (`:214-215`).
2. **Does the wider fetch key cause loops or over-fetching? No.**
   - `runtimeRevision` (`LaunchDialog.tsx:189`) is a string built only from runtime state, probeState and the nonce. The effect deps are `[runtimeId, key]`, and `setState` stores the result only, so nothing feeds back into the key.
   - `probeAll` sends notifications in the order probing (same key, from `detect` or `beginProbing`) → done, so each probe adds exactly 1 fetch.
   - The test pins this at `fetchesBeforeProbe + 1` (`LaunchDialog.test.tsx:644`).
3. **Is the renderer/main judgement now symmetric? Yes, for every DTO case.**
   - Every renderer hold or stop (checking / waiting-probe / unreachable / probe-failed) is a case main also rejects.
   - The only case the renderer lets through that main may still reject is "reachable but `claudePath` null" (claude not installed). That predates this round, and the reason key is shown as intended.
   - The one new problem: the renderer's "wait for the probe" assumption does not hold when the probe never starts (L-601).

## Findings

### [Low] Waiting-probe has no exit when the probe never starts: the dialog says "準備を待っています…" indefinitely and offers no reevaluate (L-601) (scope: feature)

- **Observation**:
  - `detect()` creates every runtime with `probeState: 'probing'` and `pathMapping: null` (`wsl-detector.ts:132-133`).
  - `probeAll` only probes runtimes that `verifyRunning` confirmed (`runtime-store.ts:150-153`, `:159-160`). A runtime that is not confirmed — because `listRunning` failed (`wsl-detector.ts:155`) or because the distro stopped between enumeration and confirmation — stays `state: 'running'` + `probing` + no mapping until the next rescan.
  - In that state the renderer shows only `FOLDER_RUNTIME_BLOCKED_LABELS.waitingProbe` with no button (`LaunchDialog.tsx:622-626`) and holds the launch (`:250-258`).
  - Since `state === 'running'`, neither the `runtime-stopped` blocker (`:653`) nor `allRuntimesStopped` (`:448-453`) appears, so the dialog never shows a reevaluate button.
  - Before Round 3 the launch went ahead and main rejected it with `not-verified-running` or `claude-not-found`, so the user at least saw a reason. Now the dialog just keeps saying "待っています".
- **Search for similar cases**:
  - Places that leave a runtime unprobed: `runtime-store.ts:151` (`if (!verified.has(target.id)) continue`) and `:160` (`token === undefined`). 2 hits.
  - Places that show a reevaluate button: `LaunchDialog.tsx:451` / `:634` / `:653`. None of them is shown in the waiting-probe state.
  - Tests: 0 cover a probe that never completes. `LaunchDialog.test.tsx:432` and `:589` both always send the completion notification.
- **Risk/impact**: fail-closed, so nothing unsafe launches. But in an ordinary case (`wsl.exe -l --running` fails transiently), the "the probe completion will clear it" assumption in the header table (`LaunchDialog.tsx:59`) and in the comments at `:242` and `labels.ts:196` does not hold, and the user has no next step in this dialog. That conflicts with US-1 AC7 (show an action the user can take).
- **Recommended action** (minimal): put `reevaluateButton` next to the waiting-probe line at `LaunchDialog.tsx:622-626`. The DTO's `resolutionSteps` here is only `wait-for-probe`, but `runtimes.refresh` → `probeAll` reruns the confirmation, so this is the only exit. Add one test: no probe-complete notification arrives → reevaluate is pressed → `refreshRuntimes` is called. The root cause in runtime-store (an unconfirmed runtime keeps `probing` forever) belongs to the runtime domain and is out of scope here.
- **Basis**: PB-3 (do not present a probe that will not happen as "in progress") / US-1 AC7.
- **Scope basis**: the gate at `LaunchDialog.tsx:250-258` was added in this round.

## Round 3 inheritance verdict

| ID | Verdict | Basis |
|---|---|---|
| M-501 | **resolved** | The fetch key now includes the shared `runtimeRevision` (`LaunchDialog.tsx:189-191`), so `useReachable` fetches again when only probeState changes. The test at `LaunchDialog.test.tsx:589-652` pins the full path: fetch again → Provider comes back → no confirmation → launch with p-bedrock. While probing, the "到達できない" reset line is still shown, but the launch is held by waiting-probe, so the false confirmation that M-501 raised cannot appear. The wording is po-reviewer's call. |
| L-502 | **resolved** | The `blockedReason` split (`:248-258`) matches main's rejections for all three reasons (see answer 1), so WSL folders are not over-blocked. The cross-boundary-unknown note is now limited to IPC failure (`:608`). The incorrect assumption in the comments at `:239-244` and `labels.ts:179-180` is fixed. Tests: `:432` / `:475` / `:494`. |

## 同種事象探索 cascade summary

| Finding ID | Grep query | Hits | path:line |
|---|---|---|---|
| L-601 | places that leave a runtime unprobed | 2 | runtime-store.ts:151 / :160 |
| L-601 | places that show `reevaluateButton` | 3 | LaunchDialog.tsx:451 / :634 / :653 |
| (check) | places that clear `claudePath` | 3 | runtime-store.ts:110 / :152 / :210-215 |
| (check) | the `pathMapping === null` branch in `resolveCwd` | 1 | composition-root.ts:397 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from 3: 2 / unresolved: 0 / new: 1

**Viewpoints with nothing to report:**
- **PB-1**: 該当なし. The added key is made only of state enums and the nonce; no path crosses a boundary.
- **PB-2**: 該当なし. Both keys include `runtimeId`.
- **PB-4**: 該当なし. The permission-mode path is untouched.
- **PB-5**: 該当なし. There is no docker endpoint, and conversion is a single hop.
- **PB-6**: 該当なし. There is no new process or persistent write.
- **PB-7**: 該当なし. Rules and fixtures are unchanged.

**H (tests and observability):**
- M-501 and L-502 are both pinned by tests.
- L-601 has 0 tests.
- Observability: the waiting state is not logged, so a probe that never completes cannot be told apart from one still running.

**Relevant files:**
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.tsx
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.test.tsx
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\src\main\app\runtime-store.ts
- C:\dev\closta\src\main\infra\runtime\wsl-detector.ts
- C:\dev\closta\src\main\app\launch-preparation.ts
- C:\dev\closta\src\main\app\composition-root.ts
- C:\dev\closta\src\domain\workspace\resolution.ts
