# platform-boundary-reviewer Review: 起動設定ダイアログとプリセット (X-4)

**Run**: 2026-09-30
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Gate**: design-gate, first round. Read-only review. One harmless `wsl.exe` probe was run to check Critical C-001.

## 初回読了 viewpoint

- FR/SC affected by this bundle:
  - FR-001: WSL-only launch.
  - FR-004 / SC-005: safe 3-value permission mode and the item 16 backstop.
  - FR-005 / SC-009: derived env merged into `RuntimeLaunchSpec.env`; settings passed through `buildQueryOptions`.
  - FR-008 / SC-008: `boundary === 'cross'` is consumed.
  - FR-009–011 / SC-003–004: presets hold ids only.
  - FR-012 / SC-006: `CLAUDE_CONFIG_DIR` as a RuntimePath.
  - FR-013 / FR-014 / SC-007: helper generation and control-character rejection.
- Charter / Confirmation clauses touched:
  - runtime charter In scope: launch contract and multi-hop path conversion.
  - runtime charter Out of scope: gating permission modes on capability belongs to isolation.
  - isolation charter L29: permission-mode gate.
  - AD-003 Decision Outcome: multiple instances; not a singleton.
  - AD-004 Consequences: conversion is not always 1 hop.
  - AD-036 §3: agents only check that no HostPath/UNC leaks. §6: env allowlist; WSLENV is denied.
  - Constitution I / III / VI (items 6, 16) / VII.
- A. 認可 / 認証 / secret 管理: 該当なし: owner is security-reviewer. The secret side of env delivery in C-001 is handed to them.
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner is security-reviewer. Shell metacharacters in the helper path/arguments go to them.
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:1 High:1 Medium:3 Low:2
- E. User Story / SC / AC / UX: 該当なし: owner is po-reviewer.
- F. 命名 / module / lint hookup: Critical:0 High:1 Medium:2 Low:2
- G. optional reviewer 範囲: 該当なし: I am not an optional reviewer.
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

X-4 does several things:
- Changes X-1's `launch(folderId, runtimeId)` into `launch(config)`.
- Wires X-3's `deriveEnv` output (env + settings) into the real WSL launch.
- Implements the `resolveConfigDirRuntimePath` stub.
- Generates the aws-assume-role helper in Windows `userData` and passes it to WSL claude as a `/mnt/c/...` RuntimePath.
- Widens the permission mode to the safe 3 values, with `assertSafePermissionMode` plus an item 16 backstop.
- Adds the helper to item 6.

On the platform side, the most important problem is that this design has no route for env to cross the Win32 → WSL boundary.

## Findings

### [High] Env merged into `RuntimeLaunchSpec.env` never reaches claude inside WSL, so FR-012 / SC-006 cannot be met (C-001) (scope: feature)

- **観察**:
  - FR-005 (spec.md:111), plan.md:128 and BE-006 (tasks.md:25) merge the `deriveEnv` output into `RuntimeLaunchSpec.env`.
  - That env is passed as-is as the Windows process env of `wsl.exe` (`sdk-agent-session.ts:281` `spawn(plan.command, [...plan.args], { env: plan.env, shell: false })`).
  - The argv is only `['--cd', cwd, '-d', distro, '--']` (`launch-spec.ts:102`). There is no mechanism that carries env across.
  - WSL passes only the host env vars listed in `WSLENV` into the distro. The code itself says so at `wsl-cli.ts:47`. `WSLENV` is denied by `LAUNCH_ENV_DENY_PATTERN` (`launch-spec.ts:30`).
  - **Live check on this machine**:
    - `CLOSTA_PB_PROBE=reached wsl.exe -- sh -c 'echo ${CLOSTA_PB_PROBE:-unset}'` printed `unset`.
    - Adding `WSLENV=CLOSTA_PB_PROBE/u` printed `reached`.
- **同種事象探索**: I looked for injection points that assume env reaches WSL. Query: Grep `env\.(ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|AWS_PROFILE|AWS_REGION|CLAUDE_CODE_USE_BEDROCK|CLAUDE_CONFIG_DIR)|env\[key\]` on `src/domain/provider/derive-env.ts`. 7 hits:
  - `derive-env.ts:47` (extraEnv)
  - `:56` (API key)
  - `:60` (OAuth token)
  - `:73`, `:74`, `:75` (aws-profile)
  - `:82` (CLAUDE_CONFIG_DIR)

  The design side assumes the same thing at spec.md:87, :111, :127, :160, :163, plan.md:128 and tasks.md:25. Code that carries env across via WSLENV: 0 hits (Grep `WSLENV` in src/ finds only denylist and exclusion tests).
- **リスク/影響**:
  - These methods all silently become no-ops: config-dir, in-app-login, api-key, oauth-token, aws-profile and extraEnv.
  - Claude inside WSL then starts with the distro's default `~/.claude` credentials. The user picked Provider X, but the session runs on different credentials and billing.
  - X-3 PB-P-M01 put fail-closed in place precisely to block "silently grabbing the default config dir". That path comes back through the transport layer.
  - SC-006 / SC-009 are measured only by unit tests on the derived values, so the problem stays green and invisible.
  - Helper methods (settings) go through argv via `--settings`, so they may survive. That leaves the Provider types with inconsistent behaviour.
- **推奨アクション**:
  1. Decide the env transport in AD-041 or a separate ADR, as an explicit reconciliation of AD-036 §6.
     - Most realistic option: the infra launch-spec generates `WSLENV` from **only the derivation-controlled key names**. It is never passed through from the parent env.
     - Narrow the denylist to "WSLENV inherited from the parent env".
     - **Do not use the `/p` or `/l` flags.** `CLAUDE_CONFIG_DIR` is already a RuntimePath, and those flags would convert it a second time (a 2-hop mis-conversion under AD-004). Use `/u` only.
  2. `env KEY=VAL claude` in argv puts secrets on the command line, so do not use it.
  3. Add an integration leg to SC-006 / SC-009 that observes the value inside the distro, e.g. `printenv CLAUDE_CONFIG_DIR` through the same spawn path.
  4. Add "does `--settings` JSON survive `wsl.exe` argv quoting" to the live checks in quickstart SH-023.
- **根拠**:
  - Principle I / AD-004: the RuntimePath must actually be delivered to the runtime namespace.
  - AD-003: the transport axis is WslRuntime = `wsl.exe -d <distro> -- ...`.
  - AD-036 §6.
  - runtime charter In scope "起動契約".
- **scope 根拠**: FR-005 / FR-012 in this feature are what wire X-3's env to a real launch for the first time.

<!-- gate-common: demoted Critical → High (no cascade evidence) finding=FR-012 -->

### [High] Helper paths lose their namespace, and a conversion failure fails open to a user-supplied path (H-001) (scope: feature)

- **観察**:
  - `ResolvedCredential.awsCredentialExportPath` is a plain `string` (`types.ts:121`). `configDirRuntimePath` is branded (types.ts:127, PB-M-001); this one is not.
  - `derive-env.ts:70` has `resolved.awsCredentialExportPath ?? cred.helperPath`. If generation or PathMapping conversion fails, it silently falls back to the X-3 user-supplied `helperPath`, which has no namespace. SC-007 (RoleSessionName) then silently stops holding.
  - BE-032 (tasks.md:61) converts to a RuntimePath but does not specify the type or the failure behaviour.
  - The `api-key-helper` / `aws-credential-export` `helperPath` is also a namespace-less string (`types.ts:49`, `:54`; `provider-record.ts:88-94`). X-4 is the first feature that delivers it to WSL claude.
  - `assessReachability` returns `reachable` for helper-based sources on every runtime (`reachability.ts:29`). A Windows-form path like `C:\...` therefore passes as a launch option.
- **リスク/影響**:
  - Case 1: a HostPath is sent to WSL, the helper is not found, and authentication fails.
  - Case 2: an absolute path meant for one distro runs a same-named file in another distro.
- **推奨アクション**:
  1. Change `awsCredentialExportPath` to `RuntimePath`, and build it only with `runtimePathOps.fromHost(userDataHelper, runtime.pathMapping)`.
  2. When generation mode is on, remove the `??` fallback and fail closed: `deriveEnv` returns null with a reason key.
  3. For user-supplied helperPath on a WSL runtime, classify it (e.g. with `classifyRawPath`) before `deriveEnv`. Allow only POSIX absolute paths, or convert a HostPath through PathMapping.
- **根拠**: Principle I / AD-004. This is the same line of reasoning as X-3 PB-M-001 / PB-P-M01.

### [High] The item 6 three-point check is structurally broken for a helper that is file-delivered and parameter-substituted (H-002) (scope: feature)

- **観察**:
  - SH-011 (tasks.md:67) and plan.md:146 add the helper to `DISTRO_SCRIPT_CONSTANTS`.
  - Check (ii) collects `.stdin.write(X)` calls across **all sources** and requires them to match the entry's identifier (`check.mjs:304-320`).
  - The helper is written with fs, not stdin. For the helper entry, the collected writer list is the existing `PROBE_SCRIPT` writer only, so it always reports "not the constant's identifier".
  - Check (i) requires a single literal (`check.mjs:282-292`). The design embeds parameters (plan.md:124), so what actually runs is not the constant.
  - Check (iii) has only the forms `command -v` and similar (`allowlists.mjs:474-485`). `aws sts assume-role` has to be added, and `>` is forbidden.
  - "Align the parameter substitution with the three-point check" (SH-011) leaves the method undefined. In practice it invites loosening (ii).
- **推奨アクション**:
  1. Make the helper body a **fixed literal with no substitution**. Pass the parameters as argv in the `settings.awsCredentialExport` command string, e.g. `'<RuntimePath>' <roleArn> closta-<id>`. Validate the characters against the ARN character class.
  2. Add a (ii') check to item 6: the expression written to a file is the constant's identifier itself. Scope (ii) per entry and per delivery path (stdin or file).
  3. This design also removes H-001's fallback, R-04 (M-004) and the overwrite race at the same time.
  4. Before adopting it, confirm on a real machine that Claude Code runs `awsCredentialExport` through a shell.
- **根拠**: Principle VI item 6 / AD-024 #3–5 ("連結・関数生成は禁止").

### [Medium] configDir conversion follows `resolveCwd`'s raw-string prefix-match, so the judging function and the converting function differ (M-001) (scope: feature)

- **観察**:
  - plan.md:21, :128 and BE-030 implement it the same way as `resolveCwd` (`composition-root.ts:381-387`, which returns a plain string via `applyEntry`).
  - Reachability (the gate) instead uses `runtimePathOps.fromHost` (`reachability.ts:41`).
  - The UNC configDir case cannot be handled by prefix-match. It needs `fromUnc` (`path-api.ts:338-348`), and `fromUnc` does not check against the selected runtime's distro.
- **推奨アクション**:
  - Host configDir: use `runtimePathOps.fromHost`.
  - UNC configDir: use `runtimePathOps.fromUnc` + `isSameDistro(result.namespace, runtime.id)` again.
  - This keeps the judge and the executor on the same function.
  - Fix the wording in the plan's Principle I row.
- **根拠**: Principle I / AD-004 / AD-036 §3 (conversion goes through the domain path API).

### [Medium] The agents-side decoding and the HostPath leak check are not extended to the new launch fields (M-002) (scope: feature)

- **観察**:
  - `decodeLaunchSpec` (`sdk-agent-session.ts:163-183`) is where agents recovers types from the structuredClone'd message. It applies the backslash (HostPath/UNC) check from AD-036 §3 only to argv.
  - BE-004 (tasks.md:23) does not specify three things:
    - how settings / model / effort / permissionMode travel main → agents;
    - that the decoder validates them;
    - that the backslash check is extended to settings values.
- **推奨アクション**:
  - Add the new fields to the decoder. Discard any unknown key.
  - Apply the backslash check to settings values.
  - Hand permissionMode to `assertSafePermissionMode` without defaulting it.
  - Add a negative test.
- **根拠**: AD-036 §3 / Principle VII (agents type recovery).

### [Medium] The item 16 `permissionMode:` backstop regex will false-positive on type declarations and misses shorthand properties (M-003) (scope: feature)

- **観察**:
  - The planned rule "`permissionMode:` that does not go through `assertSafePermissionMode(`" (plan.md:145, SH-010) copies the `settings` rule (`check.mjs:790-804`).
  - `settings` escaped false positives only because its fields are optional (`settings?:`).
  - `session-core.ts:80` `readonly permissionMode: 'default'` and the new Deps field are non-optional, so they will hit the rule.
  - Neither rule catches the shorthand `{ permissionMode }`, `{ settings }` or spread.
- **推奨アクション**:
  - Exclude type positions (interface / type literal) from the rule.
  - Treat a value-position shorthand as a violation.
  - Add fixtures for both shorthand and type declarations.
- **根拠**: Principle III / PB-7.

### [Medium] Overwriting one helper per provider (R-04) breaks under X-5, and nothing tracks that obligation (M-004) (scope: feature)

- **観察**:
  - plan.md:156 says "write one file per provider and overwrite it at launch; split it per session in X-5".
  - With multiple sessions, a later launch overwrites the file. The earlier session's next credential refresh then uses a different RoleSessionName, which breaks CloudTrail traceability (Principle V).
  - The overwrite is also not atomic, so it can race with a running session executing the helper.
  - No X-5 obligation is recorded in the roadmap, UNDETECTED_NOTES or the ADR.
- **推奨アクション**:
  - Preferred: the argv design from H-002 (fixed file + per-session arguments).
  - Otherwise, record the obligation in AD-041 / the roadmap X-5 row, and write via temp + rename.
- **根拠**: AD-003 Decision Outcome (multiple instances; not a singleton).

### [Medium] The rationale for moving `principle-v-unknown-shape-secret` to a later feature contradicts the plan (M-005) (scope: feature)

- **観察**:
  - The re-targeting is justified by "helpers are app-generated and add no free input" (plan.md:88).
  - But BE-031 needs role ARN / region / profile (tasks.md:60), and `CredentialRef` for `aws-assume-role` has only `helperPath` (`types.ts:56`). A new input path is required.
  - FR-017 (free-text model fields) and preset names are also new free-text fields that get persisted.
  - The trigger condition at `expected.mjs:424` ("an X-4 free-input secret path") may actually fire.
- **推奨アクション**:
  - Define in the data model where the role parameters come from.
  - Either keep `nextFeature: 'X-4'` and add a secret scan to `checkProviderDraft` / `checkPreset`, or give an explicit reason why the trigger does not fire.

### [Medium] SC-006 / SC-007 / SC-009 are measured only by unit tests on derived values (M-006) (scope: feature)

- **観察**: The measurement paths at spec.md:160-163 only check the return values of `deriveEnv` / `buildQueryOptions`. No leg observes the value inside the distro, so C-001 cannot be detected.
- **推奨アクション**:
  - Add an integration test that goes through the same spawn path and asserts `printenv CLAUDE_CONFIG_DIR`.
  - Add a live leg that confirms the helper actually runs (quickstart).

### [Low] SH-012 re-targets `nextFeature` to "a later feature" instead of a concrete feature ID (L-001)

`expected.mjs:357-359` requires naming the feature that closes the path. Replace "後続" with a concrete ID, e.g. the feature that adds the extra-directory axis for `ui-path-concat`.

### [Low] Item 16 messages still say "'default' 固定" (L-002)

`check.mjs:809` and `allowlists.mjs:379` still say "'default' 固定". Update them to "safe 3 values" alongside AD-041.

### [Low] Read-side validation of the preset permissionMode, and a forward note for I-3 (L-003)

- BE-011 validates keys only. Validate the value on read too, with the same predicate `isSafePermissionMode` (write/read symmetry).
- Add to AD-041 (c): once I-3 adds escalated modes, applying a preset must re-validate against the capability of the runtime it is applied to.

### [Low] Principle VI residuals (L-004)

- Generating the helper in `userData` is inside the app's own data area. It does not count as building a persistent environment.
- However, the aws CLI can write `~/.aws/cli/cache` / `sso/cache` inside the distro. Record in AD-041 that this is the user's own tool behaviour, the same as with aws-profile.
- Clean up the helper when its provider is removed.
- R-01: DrvFs defaults to 0777, so the exec bit usually works. It breaks under `noexec` or `metadata`+`fmask`. Consider invoking the helper as `/bin/sh '<path>'` so it does not depend on the exec bit (check the shell-execution semantics on a real machine).

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `env\.(ANTHROPIC_API_KEY\|CLAUDE_CODE_OAUTH_TOKEN\|AWS_PROFILE\|AWS_REGION\|CLAUDE_CODE_USE_BEDROCK\|CLAUDE_CONFIG_DIR)\|env\[key\]` in derive-env.ts | 7 | src/domain/provider/derive-env.ts:47,56,60,73,74,75,82 |
| C-001 | `RuntimeLaunchSpec\.env\|CLAUDE_CONFIG_DIR\|env denylist` in specs/008 | 7 | spec.md:87,111,127,160,163 / plan.md:128 / tasks.md:25 |
| C-001 | `WSLENV` in src (code that carries env across) | 0 (only denylist / exclusion tests) | launch-spec.ts:30, wsl-cli.ts:47, session-core.ts:170 and others |
| H-001 | `helperPath` in src (excluding tests) | 14 | derive-env.ts:63,66,70 / types.ts:49,54,56 / provider-record.ts:88,90-91,94 / provider-service.ts:135,277 / validate.ts:297 / ProviderScreen.tsx:58 |
| H-002 | `\.stdin[\s\S]{0,40}?\.(write\|end)` (item 6 writeRe; existing writers) | 1 entry (PROBE_SCRIPT) | allowlists.mjs:465-467, check.mjs:304-320 |
| M-003 | `permissionMode\s*:` in src/agents (excluding tests) | 2 | session-core.ts:80,110 |

## Verdict

- Critical: 1
- High: 2
- Medium: 6
- Low: 4
