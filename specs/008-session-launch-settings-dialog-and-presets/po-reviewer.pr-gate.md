# po-reviewer Review: X-4 (pr-gate round 4)

**Run**: 2026-10-01
**Reviewer**: po-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 4

## 初回読了 viewpoint

- FR/SC touched by the Round 3 fixes:
  - FR-008 / US-3 AC2 / spec Edge Case L165 / AD-016: the `blocked` DTO is split three ways. These rules are now written into the spec at `spec.md:220-223`. Code: `LaunchDialog.tsx:236-258,607-636`.
  - FR-002 / US-2 AC3: new reset text when reachability could not be checked (`session/labels.ts:132-133`).
  - Spec Edge Case L170: the folder retry now shows progress, and only one alert appears when the runtime load fails twice (`useFolders.ts:94-98`, `LaunchDialog.tsx:386-402,454-459`).
  - spec L316-321: the provider line for a whole-file parse failure (`provider/labels.ts:57-61`) and the remove-failure text (`provider/labels.ts:72-73`, `useProviders.ts:106-122`).
- Charter / Confirmation for the touched files: session charter L115 (reset and notify), AD-016 (cross-boundary warning), AD-042 Decision 4 (ProviderScreen line).
- A. 認可 / 認証 / secret 管理: 該当なし: owned by security-reviewer. The Round 3 fixes do not touch any secret path.
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owned by security-reviewer.
- C. 業務不変条件 / Charter drift: 該当なし: owned by architecture-reviewer. Charter L115 is judged under E, as UX.
- D. Constitution / ADR drift: 該当なし: owned by architecture-reviewer.
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:0 Low:2
- F. 命名 / module / lint hookup: 該当なし: owned by convention-reviewer.
- G. optional reviewer 範囲: 該当なし: ux-reviewer and a11y-reviewer are not running for this PR.
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

I reviewed only the Round 3 fixes. Files read:
- `LaunchDialog.tsx` (full), `session/labels.ts` (the changed labels), `LaunchDialog.test.tsx:425-524`
- `useFolders.ts` (full), `WorkspaceFoldersScreen.tsx:323-339,604-630`
- `provider/labels.ts` (full), `useProviders.ts` (full), the `lastError` display in `ProviderScreen.tsx:313-320`
- `provider-service.ts:250-259`, `ipc.ts:350-356`
- `resolution.ts:30-151`, `descriptor.ts:67-70`, `wsl-detector.ts:112-224`, `runtime-store.ts:183-229`
- spec FR-006 / FR-008 (`spec.md:209-223`)
- both Round 3 implementer JSON files

I did not re-run the reported green results (unit 1524 / E2E 8 / lint); I take them as reported.

The three-way split for `blocked` holds up:
- **capabilities-not-probed (waiting).** The wait always ends. A successful probe always comes with a PathMapping (`wsl-detector.ts:203-223`), a failed one becomes `probe-failed`, and the probe has a time limit (`wsl-cli.ts:73`). So "waiting" cannot hang forever, and the refetch keyed on `probeState` releases the hold.
- **probe-failed (failure + re-evaluate).** Launch is blocked and a 再評価 button is shown.
- **distro-not-running (leave it to the blocker).** Nothing is added. It is reached only when `state === 'stopped'` (`resolution.ts:143`), and the `runtime-stopped` blocker shows the next step.
- **IPC failure.** Only a failed fetch shows 「判定できませんでした…起動はできます」 (`LaunchDialog.tsx:608`).

All of these cases have tests (`LaunchDialog.test.tsx:432-516`).

Effect of `useFolders.refresh` on WorkspaceFoldersScreen: while a retry is running, `failed=false` and `list=null`, so the screen leaves ErrorState and shows the full layout with the list loader (`WorkspaceFoldersScreen.tsx:328,605-612`). That is the same state the screen shows on first mount, so no new kind of state is introduced. If the retry fails again, the screen goes back to ErrorState. There is no test for this path (L-303).

Remove-failure text: it now names "remove failed" instead of a generic message, and a newer-version file is told apart from other failures. But the wording points to an action that does not exist (L-301).

### Round 3 inheritance

| R3 ID | Verdict | Evidence |
|---|---|---|
| M-201 `blocked` shown as "launch allowed" | resolved | The three-way split is at `LaunchDialog.tsx:248-258,622-636`. The unknown note is limited to `status === 'failed'` (`:608`). Tests: `LaunchDialog.test.tsx:432-473` (launch disabled while waiting; released after the probe), `:475-492` (stopped: no 「起動はできます」), `:494-516` (probe-failed: launch blocked; 再評価 calls refreshRuntimes) |
| L-201 the rules exist only in tasks | resolved | One item added under FR-008 (`spec.md:220-223`). It is kept separate from 「警告は起動をブロックしない」 by the words 「警告とは別に」, and the stopped case is passed to FR-006 |
| L-202 parse-failed line | resolved | `provider/labels.ts:60` now says 「以前の登録は表示されません…必要なら登録し直してください」 |
| L-203 no visible retry progress / two alerts | resolved | `useFolders.ts:95-98` clears `failed` before reloading. `LaunchDialog.tsx:455` hides the second alert. Tests at `LaunchDialog.test.tsx:961-965,983` |
| L-204 duplicated reachability text | resolved | `session/labels.ts:132-133` says 「選んでいた Provider…いまは既定 Provider になっています (再試行で戻せます)」. Test at `LaunchDialog.test.tsx:707-708` |

## Findings

### [Low] The remove-failure text says 「一覧を更新してから」, but ProviderScreen has no way to refresh the list, and in the main failure case a retry always fails (L-301) (scope: feature)

- **観察**:
  - Apart from a newer-version file, remove returns `ok: false` in one case: the target is no longer in main's profiles (`provider-service.ts:254`).
  - `useProviders.remove` only sets `lastError` on failure. It does not call `load()` (`useProviders.ts:109-116`), so the stale entry stays on screen.
  - The text is 「削除できませんでした。一覧を更新してから、もう一度お試しください。」 (`provider/labels.ts:73`).
  - grep `refresh|更新|再読み込み` in `ProviderScreen.tsx`: 0 hits. There is no refresh action.
  - Pressing 削除 again fails the same way. The only way out is to leave the screen and come back.
- **同種事象探索**: The preset remove failure reloads automatically and says so: 「一覧を読み込み直しました」 (`session/labels.ts:248`). The provider remove path is the only one that tells the user to refresh by hand: 1 hit, `provider/labels.ts:73`.
- **リスク/影響**: The recovery step points to a control that does not exist, so the user is stuck on the error path (PO-6).
- **推奨アクション**: In the `remove-failed` branch, call `load()`, as the preset remove does. Change the text to 「削除できませんでした。一覧を読み込み直しました。」 Add a check to the existing it.each that `listProviders` is called again.
- **根拠**: PO-6 (recovery exit), PO-3
- **scope 根拠**: `useProviders.ts` / `provider/labels.ts` are touched files

### [Low] The probe-failed line says only 「再評価してください」 and gives no next step if re-evaluating keeps failing (L-302) (scope: feature)

- **観察**:
  - `FOLDER_RUNTIME_BLOCKED_LABELS.probeFailed` = 「ランタイムの能力確認に失敗しました。再評価してください。」 (`session/labels.ts:202`).
  - If the WSL version is unknown, the runtime is `probe-failed` from detection onward (`wsl-detector.ts:132,178-180`). A single re-probe returns the state unchanged (`runtime-store.ts:193-196`).
  - The cause can therefore persist. Since this round, launch is blocked in this state (`LaunchDialog.tsx:256`). The dialog never tells the user where to look after repeated failures.
- **同種事象探索**: 1 hit for this probe-failed text, at `session/labels.ts:202`.
- **リスク/影響**: The user can only press 再評価 again and again. Before this round launch was allowed (and then failed in main), so this round is what makes the dead end visible.
- **推奨アクション**: Add one sentence, for example 「繰り返し失敗する場合はランタイム画面で状態を確認してください」. Keep it one line.
- **根拠**: PO-4, PO-6
- **scope 根拠**: `session/labels.ts` is a touched file

### [Low] The new WorkspaceFoldersScreen retry behaviour (ErrorState → loader → ErrorState again) has no test (L-303) (scope: feature)

- **観察**:
  - `refresh` now clears `failed` first (`useFolders.ts:95-98`). This changes what WorkspaceFoldersScreen shows during a retry (`WorkspaceFoldersScreen.tsx:328-337,605-612`).
  - grep `再試行|refresh` in `features/workspace-folders/*.test.tsx`: 0 hits. Only the LaunchDialog side is tested (`LaunchDialog.test.tsx:943-965`).
- **同種事象探索**: 0 hits, as above.
- **リスク/影響**: The behaviour looks correct, but no test pins this regression in the other screen that uses the hook.
- **推奨アクション**: Add one test to WorkspaceFoldersScreen. Make `listFolders` reject, press 再試行, check the loader appears, then check ErrorState returns on a second failure (or the list appears on success).
- **根拠**: reviewer-base H (regression)
- **scope 根拠**: `useFolders.ts` is a touched file

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-301 | `refresh\|更新\|再読み込み` in ProviderScreen.tsx | 0 | provider/labels.ts:73; useProviders.ts:109-116; compare session/labels.ts:248 |
| L-302 | probe-failed label | 1 | session/labels.ts:202; runtime-store.ts:193-196 |
| L-303 | `再試行\|refresh` in workspace-folders/*.test.tsx | 0 | useFolders.ts:95-98; WorkspaceFoldersScreen.tsx:328-337 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
- Round inheritance: resolved from 3: 5 / unresolved: 0 / new: 3

Nothing here blocks `/cl-done`. L-301 is a single-line fix (call `load()` and reword), and I recommend applying it before the PR.

Relevant files:
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.tsx
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.test.tsx
- C:\dev\closta\src\renderer\src\features\workspace-folders\useFolders.ts
- C:\dev\closta\src\renderer\src\features\workspace-folders\WorkspaceFoldersScreen.tsx
- C:\dev\closta\src\renderer\src\features\provider\useProviders.ts
- C:\dev\closta\src\renderer\src\features\provider\labels.ts
- C:\dev\closta\src\main\app\provider-service.ts
- C:\dev\closta\src\main\app\runtime-store.ts
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\spec.md
