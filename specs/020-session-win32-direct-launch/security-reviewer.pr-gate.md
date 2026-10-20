# security-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: security-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-002 (shell: false, args as array, per-kind decoder), FR-004 to FR-007 (locator, override, shim rejection), FR-008 / FR-009 (Win32 env allowlist, Provider overlay, shared reachability predicate), FR-010 to FR-012 (taskkill tree stop, fixed-word logs), FR-014, SC-002 / SC-003 / SC-004 / SC-005.
- Charter / Confirmation: session charter (launch contract, session thread), AD-036 §3 (reinterpreted by AD-058), AD-041 (e), AD-043 Decision 5, AD-058 Decisions 1 / 3 / 5, Constitution V.
- A. 認可 / 認証 / secret 管理 / プロセス境界の hardening: Critical:0 High:0 Medium:1 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が owner
- G. optional reviewer 範囲: 該当なし: security の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

Reviewed diff main...7e5e1ba against the design-gate security findings (round 2: M-001, M-002, L-001 carried over).

Confirmed in code:
- New IPC channels take no arguments, go through `isTrustedSender` (`ipc.ts:178-186`) and return no paths. Preload exposes only those 2 arg-less functions. DTO does not carry `claudePath` (`dto-mapper.ts:53`).
- claude.exe and taskkill.exe spawn with absolute paths, `shell: false`, array args, env from the spec only (`sdk-agent-session.ts:560-565`, `:703-708`). taskkill built from `SystemRoot\System32\taskkill.exe` (`win32-launch.ts:141-151`).
- Decoder matches `argsBeforePid` exactly and rejects `WSLENV` / `WSL_UTF8` and `prefixArgs` (`sdk-agent-session.ts:366-389`).
- Win32 env is an allowlist with `LAUNCH_ENV_DENY_PATTERN` as a second net; `NODE_OPTIONS` / `ELECTRON_*` not allowed (`win32-launch.ts:30-61`, `:85-102`). Overlay rejects forbidden keys and control chars (`win32-launch.ts:109-128`); key names restricted (`forward-env.ts:34`).
- `makeHostPath` accepts only drive-letter absolute paths (`path-types.ts:85`).
- Logs contain only fixed words, reason keys and exit codes. Settings file holds one path and the version.
- No new BrowserWindow / CSP / `openExternal` / `innerHTML` path (the single `innerHTML` hit is a test assertion, `.pr-gate.diff:8687`).

## Findings

### [Medium] The Win32 launch env still does not stop Windows from searching the working folder for executables (M-001) (scope: feature) [unresolved from design-gate R2 M-001]

- **観察**: `win32-launch.ts:30-61` / `:109-128` never set `NoDefaultCurrentDirectoryInExePath`. claude.exe runs with `cwd` = the working folder (`sdk-agent-session.ts:703-707`, `session-core.ts:519-526`); its children resolve bare command names with the current directory first.
- **同種事象探索**: `NoDefaultCurrentDirectoryInExePath` 0 hits in `src/`.
- **リスク/影響**: CWE-427 with a malicious repository. Same exposure as starting `claude` from a terminal in that folder, hence not High.
- **推奨アクション**: Add a fixed `NoDefaultCurrentDirectoryInExePath=1` in `composeWin32LaunchEnv` (pinned in `win32-launch.test.ts`), or record non-adoption in AD-058 Consequences.

### [Medium] Rejecting Provider forward keys still misses Windows-specific keys that can hijack execution (M-002) (scope: feature) [unresolved from design-gate R2 M-002]

- **観察**: `isWin32ForbiddenKey` (`win32-launch.ts:79`) adds only Win32 transport keys to the POSIX-oriented list (`forward-env.ts:43-97`). `PSMODULEPATH`, `MSYS`, `MSYSTEM`, `MSYS2_PATH_TYPE`, `__COMPAT_LAYER` pass. Registration uses the WSL-only `isForbiddenForwardKey` (`composition-root.ts:262`).
- **同種事象探索**: `PSMODULEPATH|__COMPAT_LAYER` 0 hits in `src/`.
- **リスク/影響**: The source is the user's own Provider registration; exploitation needs social engineering.
- **推奨アクション**: Add a Windows fixed deny set, or record in AD-058 Decision 5 that the switch to a name allowlist is planned in X-7.

### [Low] The override accepts any `.exe`, and a persisted settings file decides which executable runs (L-001) (scope: feature) [unresolved from design-gate R2 L-001]

- `claude-executable.ts:18-28`, `runtime-settings-store.ts:134-144`, `win32-claude.ts:51-58`. Same-user writer only. Acceptable as is.

### [Low] The agents-side decoder pins taskkill's file name but not its directory (L-002) (scope: feature)

- `sdk-agent-session.ts:376-382`. Defense in depth only.

### [Low] `taskkill /T /F /PID` uses a pid while the child's exit may already be pending (L-003) (scope: feature)

- `sdk-agent-session.ts:541-565`. Very small window; not observed.

### [Low] No test pins the absence of the M-001 / M-002 protections (H-L-001) (scope: feature)

- If M-001 / M-002 are adopted, add pin cases to `win32-launch.test.ts`.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `NoDefaultCurrentDirectoryInExePath` (repo, excluding node_modules) | 0 in src | - |
| M-002 | `PSMODULEPATH\|__COMPAT_LAYER` (repo) | 0 in src | - |
| L-002 | `WIN32_TREE_STOP_COMMAND_NAME` decoder check | 1 | src/agents/sdk-agent-session.ts:378-382 |
| - | `dangerouslySetInnerHTML\|innerHTML\|openExternal` in .pr-gate.diff | 1 (test only) | .pr-gate.diff:8687 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4
- Carried from design-gate: 3 unresolved (M-001, M-002, L-001). New: 3 (L-002, L-003, H-L-001).
