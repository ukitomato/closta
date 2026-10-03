# platform-boundary-reviewer Review: O-2 ui-coverage (specs/011-ui-coverage)

**Run**: 2026-10-03
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Gate**: code-gate iteration 1 (lint-like slice)

## 初回読了 viewpoint

- FR/SC in my slice: FR-003 / SC-001 / SC-002 (Constitution check item 21 and `scripts/ui-coverage/coverage.mjs`), FR-007 (`src/agents/live-tool-results.ts`, `src/domain/session/tool-result.ts`), FR-008 / FR-009 (`src/domain/session/system-event.ts`)
- Charter / Confirmation that apply to the touched files: Principle I / II / VII and the AD-023 §7 layer matrix (as written in `eslint.config.mjs` and `.dependency-cruiser.js`), Principle XII item 21. Neither the `runtime` charter nor the `isolation` charter is touched.
- A. 認可 / 認証 / secret 管理: 該当なし: owner is security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner is security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: no file in the 73-file scope belongs to the `runtime` or `isolation` domain, so neither charter's Out of scope is crossed
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: owner is po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: the ui-coverage table decisions belong to ui-coverage-reviewer
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

The diff `2dcc694..HEAD` adds Constitution check item 21. It reads 5 inputs relative to `process.cwd()`: the SDK's `sdk.d.ts`, `sdk-tools.d.ts` and `package.json`, plus `docs/ui-coverage.md` and `docs/roadmap.md`. It passes them to pure functions in `scripts/ui-coverage/coverage.mjs`. The diff also adds 3 new src modules (`src/agents/live-tool-results.ts`, `src/domain/session/system-event.ts`, `src/domain/session/tool-result.ts`) and wires them into `sdk-agent-session.ts`, `transcript.ts` and the renderer.

I checked with `git diff --name-only` that the diff does not touch `src/preload`, `src/main`, `src/agents/supervisor*`, `transport.ts`, `eslint.config.mjs`, `.dependency-cruiser.js`, `scripts/constitution/allowlists.mjs` or `scan.mjs`. The result was empty, so no rule was loosened.

### What I verified

- **No override of the inputs (L-102).** Item 21 has no `process.env` or `process.argv` reads (`scripts/constitution/check.mjs:1312-1319`). The input paths are constants.
- **Missing input counts as a violation.** A missing file is reported as `VIOLATE` with its file name, never as `pending` (`check.mjs:1322-1325`).
  - Parse failures are caught and reported as violations (`check.mjs:1339-1342`).
  - `checkCoverage` reports null or undefined inputs as failures (`coverage.mjs:522-534`).
  - The lower bounds `LOWER_BOUNDS` (A 39 / C 45 / E 38) fail closed when the parser silently drops members.
- **Paths work on both Windows and POSIX.**
  - The paths are forward-slash relative paths, which Node fs accepts on Windows. Line splitting uses `/\r?\n/` (`coverage.mjs:305, 393`), so CRLF checkouts parse correctly.
  - Under pnpm the SDK is a direct dependency (`package.json:30`), so `node_modules/@anthropic-ai/claude-agent-sdk/` is a top-level link. I confirmed that all 3 files exist there.
  - Running the check from the wrong cwd makes item 21 fail closed.
- **The new modules are covered by the lint and boundary rules.**
  - `boundaries/elements` and dependency-cruiser classify by folder (`src/domain`, `src/agents`; see `eslint.config.mjs:250-251` and `.dependency-cruiser.js:193-270`). New files fall under `domain-not-to-io`, `domain-not-to-electron`, `agents-not-to-electron/native/infra` and the agents→{agents, domain} policy with no allowlist edits needed.
  - The 3 modules import only `@domain/session/*` or local siblings. None imports the SDK, so `AGENT_SDK_IMPORT_DIRECTORIES` does not apply. None uses `path`, `process.platform` or `os`.
  - `tsconfig.node.json`, `tsconfig.web.json` and `tsconfig.depcruise.json` include the folders by glob and map `@domain/*`.
- **`scripts/` is scanned by the constitution checks** (`SCAN_ROOTS = ['src', 'scripts']`, `allowlists.mjs:12`).
  - `coverage.mjs` and the item 21 block contain no spawn-shaped calls: every `exec(` has a receiver (`RegExp.exec`), which the bare-`exec(` pattern excludes.
  - They contain no privileged-command literals.
- **PB-2 (single-instance assumption).** The tracker is created per session inside the `run()` closure (`src/agents/sdk-agent-session.ts:276`), not at module scope.
- PB-1 / PB-3 / PB-4 / PB-5 / PB-6: 該当なし. The diff contains no HostPath/RuntimePath values, `capabilities`, permission-mode paths, endpoint path conversion, or code that creates persistent environment state.

## Findings

### [Low] Item 21 reads its inputs outside the try, so an unreadable input crashes the script instead of producing a formatted violation (L-001) (scope: feature)

- **観察**: At `scripts/constitution/check.mjs:1323`, `readFileSync` runs after `existsSync` but outside the `try` at 1328. If an input exists but cannot be read (a directory with that name, EACCES, or a broken pnpm link where `existsSync` returns true), the script throws an uncaught exception. In that case the report for all 21 items is never printed.
- **同種事象探索**: `existsSync\(file\)\) text\[key\] = readFileSync` in `scripts/constitution/check.mjs`: 1 件 (`check.mjs:1323`).
- **リスク/影響**: The check still fails closed (non-zero exit), so this is not a gate bypass. The cost is diagnosability: CI shows a stack trace instead of `<file>  検査の入力を読めない`, and the results of the other items are lost.
- **推奨アクション**: Wrap the read in a try/catch and push `${file}  検査の入力を読めない: <message>` into `found`.
- **根拠**: Principle XII (the input must not silently drop out of the check); the existing comment at `check.mjs:1304-1306`.
- **scope 根拠**: The file is a touched file of this feature.

### [Low] The missing-input test covers only `docs/ui-coverage.md`, not the SDK files or the roadmap (L-002) (scope: feature)

- **観察**: `tests/ui-coverage/item21.test.ts:122-129` deletes only the table. No test removes `sdk.d.ts`, `sdk-tools.d.ts`, `package.json` or `docs/roadmap.md`. The loop at `check.mjs:1322-1325` treats all 5 inputs the same way, so the gap is in regression protection, not current behaviour.
- **同種事象探索**: `rmSync\(join\(root` in `tests/ui-coverage/item21.test.ts`: 1 件 (`:123`, table only).
- **リスク/影響**: A future change could special-case the SDK path, for example a `pending` fallback when `node_modules` is absent. That would bring back the gap closed in design-gate R1 M-003, and no test would catch it.
- **推奨アクション**: Add one more case to the existing temp-root test that deletes `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` and asserts `[VIOLATE] #21` plus the file name. Avoid a new spawn per input, because each child process costs 0.4–2.4s on this machine.
- **根拠**: Principle XII; design-gate R1 platform-boundary M-003.
- **scope 根拠**: The file is a touched test file of this feature.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `existsSync\(file\)\) text\[key\] = readFileSync` | 1 | scripts/constitution/check.mjs:1323 |
| L-002 | `rmSync\(join\(root` | 1 | tests/ui-coverage/item21.test.ts:123 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
