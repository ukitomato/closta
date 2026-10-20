# security-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-20
**Reviewer**: security-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-002 (spawn with no shell, args as an array, decoder)
  - FR-004 to FR-007 (locating claude.exe, override, rejecting shims)
  - FR-008 / FR-009 (Win32 env allowlist, Provider overlay, reachability check)
  - FR-010 to FR-012 (stopping the process tree with taskkill, logs carry no path/pid/env)
  - FR-014 (spawn allowlist)
  - SC-002 / SC-003 / SC-004 / SC-005
- Charter / Confirmation that apply to the touched files:
  - session charter (launch contract, session thread)
  - AD-036 §3 / §6 (AD-058 reinterprets them for Win32)
  - AD-041 (e) (forbidden forward keys, transport union)
  - AD-043 Decision 5
  - AD-058 (proposed) Decision 1 / 3 / 5
  - Constitution V / VI / VII
- A. 認可 / 認証 / secret 管理 / プロセス境界の hardening: Critical:0 High:0 Medium:1 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が owner
- G. optional reviewer 範囲: 該当なし: security の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (the round 1 C-001 / M-003 regression tests are now in tasks; details below)

## スコープ要約

This round re-checks what changed since round 1:

- **Stop arguments:** the domain constant `WIN32_TREE_STOP_ARGS` (`data-model.md:137`) and an exact-match decoder rule (`data-model.md:205`).
- **Stop command:** the decoder requires the basename of `stop.command` to be `taskkill.exe` (`data-model.md:204`).
- **Fixture:** a canonical Win32 fixture is shared by BE-010 and BE-011 (`tasks.md:27`, `:37`, `:39`).
- **Provider overrides:** Providers may override the 4 network keys (`data-model.md:234-238`).
- **Reachability:** a transport forbidden-key predicate is injected into `assessReachability` (`data-model.md:268-278`).

I also checked the existing code:

- `makeForbiddenForwardKey` matches keys case-insensitively (`src/domain/provider/forward-env.ts:110-116`). Upper-case variants such as `COMSPEC`, `SYSTEMROOT` and `WINDIR` therefore also count as Win32 transport keys and are rejected, so a case-variant bypass does not exist.
- The network keys a Provider may override (`HTTP_PROXY` and the rest) are already passed through as-is on the WSL launch, so this adds no new attack surface (RK-05 covers the residual risk).

## Findings

### [Medium] The Win32 launch env still does not stop Windows from searching the working folder for executables (M-001) (scope: feature) [unresolved from prev]

- **観察**:
  - Neither data-model.md §6.1 / §6.2 nor AD-058 mentions `NoDefaultCurrentDirectoryInExePath`. A Grep of `specs/020-session-win32-direct-launch/*.md` and `docs/decisions/0058*` for it returns 0 hits.
  - The gate recorded this as M-005 (`design-gate.md.20261020T080329:73`). Per AD-050, Medium findings are not fixed in the gate, so it is carried over unchanged.
- **リスク/影響**: Opening a malicious repo as the working folder could let a binary planted in that folder be picked up (CWE-427). This is the same exposure as starting Claude Code from a terminal there.
- **推奨アクション**: Same as round 1. Either set the fixed value `NoDefaultCurrentDirectoryInExePath=1`, or add one line to AD-058 Consequences saying it is not adopted.
- **根拠**: CWE-427; Constitution V (defense in depth)
- **scope 根拠**: Can be added in this feature's §6.

### [Medium] Rejecting Provider forward keys still misses Windows-specific keys that can hijack execution (M-002) (scope: feature) [unresolved from prev]

- **観察**: `isWin32ForbiddenKey = makeForbiddenForwardKey(WIN32_TRANSPORT_KEYS)` (`data-model.md:256`). The fixed list it adds is the POSIX one (`forward-env.ts:43-97`). These keys still pass both registration and launch: `PSMODULEPATH`, `MSYS`, `MSYSTEM`, `MSYS2_PATH_TYPE`, `__COMPAT_LAYER`. AD-058 has no note about switching to an allowlist. The gate recorded this as M-006.
- **リスク/影響**: A Provider's extraEnv could change how claude.exe's child processes (Git Bash / PowerShell) search for and load modules. The source is the user's own Provider registration, so exploiting it needs social engineering.
- **推奨アクション**: Same as round 1. Either add a Windows-specific fixed list to `isWin32ForbiddenKey` (applied at launch time only), or record in AD-058 Decision 5 that switching to a name allowlist (X-7) is planned.
- **根拠**: AD-041 (e); CWE-15
- **scope 根拠**: Fixable in this feature's §6.2.

### [Low] The override accepts any `.exe`, not only claude.exe (L-001) (scope: feature) [unresolved from prev]

- **観察**: §1.1 (`data-model.md:28`) is unchanged and still accepts any `.exe`. The gate recorded this as L-003.
- **リスク/影響**: Only a path the user explicitly picks gets launched, so this is not a privilege boundary.
- **推奨アクション**: Same as round 1, and leaving it as is is acceptable.
- **根拠**: CWE-20
- **scope 根拠**: Limited to §1.1.

### Resolved from prev

- **C-001 (round 1 High, Critical in the gate) — resolved.**
  - The decoder rule is now an exact element-by-element match against `WIN32_TREE_STOP_ARGS`, including order, spelling and case (`data-model.md:205`).
  - The value is built by `[...WIN32_TREE_STOP_ARGS]` (`data-model.md:182`), and the constant sits in one place, the domain layer (`data-model.md:137`, `:169-171`).
  - The contract says the same (`contracts/ipc-win32-claude.md:65`).
  - The positive case and the negatives `/T /F /IM`, `/T /F /PID /PID`, `/X`, missing `/PID` and lower case are all in BE-010 (`tasks.md:37`).
  - The pattern that only checks the shape (`/^\/[A-Z]$/`) is gone: Grep `\[A-Z\]` over specs/020 returns 0 hits.
  - The basename of `stop.command` is now pinned to `taskkill.exe` (`data-model.md:204`), which closes the loosened-regex risk I flagged in round 1.
- **M-003 (round 1 Medium) — resolved.**
  - The canonical fixture `src/domain/session/__fixtures__/win32-launch-spec.ts` is placed in BE-003 (`tasks.md:27`).
  - BE-010 checks that the decoder accepts it (`tasks.md:37`), and BE-011 checks that the built value equals it (`tasks.md:39`).
  - The build → decode round trip is therefore tied together through one value. A literal in-process round-trip test is not possible because agents and main cannot import each other, so the shared fixture is a reasonable substitute.

### Confirmed (no findings, round 2 changes)

- **§6.4 reachability injection:**
  - `assessReachability`'s third argument is required, so there is no way to fall back to "allow" by omitting it (`plan.md:219`).
  - Reachability and launch use the same `isWin32ForbiddenKey`, so a Provider shown as reachable cannot fail at launch for a forbidden key, and an unreachable one cannot slip through.
  - Launch time still rejects as well, so the defence is layered.
- **Network keys:** letting a Provider override the 4 network keys matches existing WSL behaviour (`forward-env.ts:55-57`). `NODE_TLS_REJECT_UNAUTHORIZED` stays in the fixed forbidden keys.
- **Upper-case variants:** `COMSPEC` / `SYSTEMROOT` / `PATHEXT` and similar collide with transport keys under case-insensitive matching and are rejected (`forward-env.ts:113-115`).
- **Unchanged since round 1:**
  - The IPC handlers C-1 / C-2 take no arguments, are registered through `handle()`, and return no paths.
  - Both spawns (claude.exe and taskkill.exe) use an absolute path with `shell: false`.
  - The `[tree-stop]` log contains only fixed words and the exit code.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `NoDefaultCurrentDirectoryInExePath` (specs/020/*.md, docs/decisions/0058*) | 0 | - |
| M-002 | `PSMODULEPATH\|MSYSTEM\|__COMPAT_LAYER` (specs/020/*.md, docs/decisions/0058*) | 0 | - |
| C-001 (prev, resolved) | `\[A-Z\]` (specs/020/*.md) | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 1
- Round inheritance: resolved from 1: 2 (C-001, M-003) / unresolved: 3 (M-001, M-002, L-001. All are Medium/Low, so per AD-050 they stay in the gate output and are not fixed) / new: 0
