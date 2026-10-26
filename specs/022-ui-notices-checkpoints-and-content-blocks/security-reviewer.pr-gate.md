# security-reviewer Review: Notices, checkpoints and content blocks (O-12)

**Run**: 2026-10-26
**Reviewer**: security-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001 (`promptSuggestions` is not passed), FR-004 / FR-005 (redaction and truncation; memory body and absolute paths not carried), FR-006 (`file_id` not carried), FR-007 / FR-008 (sanitized `server_tool_use`; `encrypted_content` not carried), FR-009 (only http(s) links, opened through `openExternalIfHttp`), FR-010 (document contents not carried), FR-011 (unknown blocks carry only a shape-checked type name), FR-012 (past logs use the same converter). SC-001 / SC-002 / SC-003 / SC-007.
- Charter / Confirmation that apply to touched files: AD-049 Decision 3 / 5 (redaction exception, path tails), AD-034 (markdown XSS boundary; not touched because Inline citation is not built), AD-023 / FR-039 window hardening (`src/main/app/window.ts` has 0 lines of diff in this PR).
- A. 認可 / 認証 / secret 管理 / プロセス境界の hardening: Critical:0 High:0 Medium:1 Low:0
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: owned by architecture-reviewer
- D. Constitution / ADR drift: 該当なし: owned by architecture-reviewer
- E. User Story / SC / AC / UX: 該当なし: owned by po-reviewer
- F. 命名 / module / lint hookup: 該当なし: owned by convention-reviewer
- G. optional reviewer 範囲: 該当なし: owned by the optional reviewers (a11y / ux / ui-coverage)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

This PR does not change main, preload, IPC, BrowserWindow or CSP: `src/main/` and `src/preload/` have 0 lines in `.pr-gate.diff`.

- **Window hardening and navigation** (`src/main/app/window.ts`): `sandbox` / `contextIsolation` / `nodeIntegration` are set explicitly at :53-55.
  - `setWindowOpenHandler` always returns deny and hands only http(s) URLs to `shell.openExternal` (:31-39, :65-68).
  - `will-navigate` blocks every navigation (:76-81).
- **Where untrusted input enters**:
  1. Notice text is redacted and truncated by `redactedBodyLine` (`src/domain/session/notice-rows.ts`). Enum values go through `pickKey` / `Object.hasOwn`, and ids are shape-checked.
  2. Sources URLs:
     - Domain side: `webSourceUrl` (`src/domain/session/content-blocks.ts:120-125`) checks for an http(s) prefix, a 2048-byte cap and control/bidi characters.
     - Renderer side: `isHttpUrl` (`server-tool-call.aui.tsx:45-47`) checks again before setting `href`, with `target="_blank" rel="noreferrer noopener"`.
     - Main side: `openExternalIfHttp` acts as the final check.
  3. The `__serverTool` trust marker: `stripInternalKeys` strips any `__` keys that came from `argsText`, and the marker is then set explicitly (`src/renderer/src/features/chat/convert.ts:87-104`). A negative test exists (`server-tool-call.aui.test.tsx:140-160`).
  4. Unknown block type names are only carried if they match `/^[a-z][a-z0-9_]{0,63}$/`.
  5. `document` blocks: `source.data` is not read.
  6. Rendering is all React text nodes. In the touched element files, `dangerouslySetInnerHTML` / `innerHTML` occur 0 times.
- **Out of scope for this PR**: no child processes, secrets or crypto are added. The new regexes have no nested quantifiers, so there is no ReDoS risk.

I found no Critical or High facts.

## Findings

### [Medium] `files_persisted` and `document` file names skip `pathTail`, so absolute paths (which include the OS user name) can reach the DOM (M-001) (scope: feature)

- **Observation**:
  - `src/domain/session/notice-rows.ts:246-248` (`filenamesOf`) and :272 (`nameList([...filenamesOf(files), ...filenamesOf(failed)])`) pass `files[].filename` / `failed[].filename` to `redactedBodyLine` as they are.
  - `src/domain/session/content-blocks.ts:66-74` (`documentPart`) does the same for `title` / `source.filename`.
  - `memory_recall` does reduce paths to the last segment with `pathTail` (`notice-rows.ts:232`). The spec's rule for that (U-3: "absolute paths include the user name, so show only the tail") is not applied to these two paths.
  - This is the same issue as design-gate security M-001 / bundle M-010 (`design-gate.md:86`). It is not fixed in the code, and `data-model.md:87` / :160 are also unchanged.
- **Same-pattern search**: `pathTail` in `src/domain/session/notice-rows.ts` / `content-blocks.ts` gives 2 hits (`notice-rows.ts:2` import, `:232` memory_recall only). The paths that skip it are `notice-rows.ts:247` (files_persisted) and `content-blocks.ts:69` (document).
- **Risk / impact**: If the SDK sends an absolute path in `filename`, the user name appears in the transcript DOM and in `SessionEvent` (CWE-359). Existing tool args already show absolute paths, so severity is limited.
- **Recommended action**: In `filenamesOf` and `documentPart`, apply `pathTail` before `redactedBodyLine`. Add a test fixture with an absolute-path marker (for example `C:\Users\MARK\x.txt`) to the `files_persisted` and `document` tests.
- **Basis**: spec U-3 / FR-005, AD-049 Decision 5, CWE-359.
- **Scope basis**: within the touched files `notice-rows.ts` / `content-blocks.ts`. This is carried over from the previous gate at the same Medium severity; there is no new fact.

### [Low] Sources URLs are carried into the DTO and `href` without redaction (L-001) (scope: feature)

- **Observation**: `content-blocks.ts:141` `webSourceUrl(r.url)` checks only scheme, length and control characters, not `redactSecrets`. The full URL goes into `href` at `server-tool-call.aui.tsx:81`.
- **Risk / impact**: A token in a signed URL or in userinfo (`https://user:pass@host`) stays in a DOM attribute. Search results are mostly public pages, so the real-world risk is small.
- **Recommended action**: Either reject URLs that contain userinfo in `webSourceUrl`, or record in research.md the reason for not redacting.
- **Basis**: AD-049 Decision 3, CWE-200.

### [Low] No test checks that a Sources link click reaches `setWindowOpenHandler` and stops at the main-side http(s) check (L-002) (scope: feature) [H]

- **Observation**: `server-tool-call.aui.test.tsx:64-92` pins the `href` / `target` / `rel` attributes and that `javascript:` is not turned into a link. That covers design-gate L-003. However, the renderer check `isHttpUrl` (a regex) and the main check `openExternalIfHttp` (`new URL().protocol`) use different logic. The renderer DTO guard (`transcript-guard.ts:79-81`, `isWebSource`) checks only that `url` is a string, so it re-checks neither scheme nor length.
- **Risk / impact**: This is about depth of defense only. Both layers currently reject non-http(s) URLs, so there is no exploitable path.
- **Recommended action** (optional): Add a check that `url` passes `webSourceUrl`-equivalent validation to `isWebSource` in the guard.
- **Basis**: CWE-20.

### H: tests and regression (summary)

- Each item has a regression test:
  - Redaction of notice text and keeping `memory_recall` content and absolute paths out: `notice-rows.test.ts:190-196`.
  - Non-http(s) URLs not becoming links: `server-tool-call.aui.test.tsx:64-92`.
  - The forged `__serverTool` marker being stripped: `server-tool-call.aui.test.tsx:140-160`.
  - Unknown block shapes dropped by the guard: `server-tool-call.aui.test.tsx:180-203`.
- Only M-001 has no absolute-path fixture for `files_persisted` / `document`.
- The existing navigation rules are unchanged: `window.ts` has 0 lines of diff, and the existing `navigation-policy.test.ts` still applies.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `pathTail` in notice-rows.ts / content-blocks.ts | 2 | src/domain/session/notice-rows.ts:2, :232 (not applied at notice-rows.ts:247, content-blocks.ts:69) |
| L-001 | `href=` in src/renderer/src/components/assistant-ui/elements (non-test) | 1 | server-tool-call.aui.tsx:81 |
| L-002 | `isWebSource` in transcript-guard.ts | 2 | src/renderer/src/features/chat/transcript-guard.ts:79, :91 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 2
