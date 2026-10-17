# architecture-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17T13:30:00Z
**Reviewer**: architecture-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Mode**: pr-gate (default + ADR-drift)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-004: `src/domain/session/transcript.ts`, `transcript-time.ts`. Past-log `timestamp` is read via `parseMessageTime`.
  - FR-002: `src/agents/sdk-agent-session.ts`, `live-signals.ts`, `live-tool-results.ts`, `src/domain/session/live-message.ts`. These set the receive time.
  - FR-003: `src/renderer/src/features/session/running-session-store.ts` (`appendUser`).
  - FR-005 / SC-005: the DTO shape, IPC and preload are unchanged. `src/main` and `src/preload` have no diff.
  - FR-006 / FR-007 / SC-002: `MessageTimeLabel.tsx`, `turns.ts` (`deriveTurns`, which subtracts on one clock only), `thread.aui.tsx`.
  - FR-008 to FR-011 / SC-003: `panel-tabs.ts`, `ConversationMapTab.tsx`, `center-conversation.ts`, `ConversationSearchProvider.tsx` (`navigateTo`).
  - FR-012 / FR-013 / SC-004: `activity-bins.ts`, `ConversationMapTab.tsx`.
  - FR-014 to FR-016 / SC-006: `docs/ui-coverage.md`, glossary, ui and session charters, `_overview.md`, `prompts.md`, roadmap, AD-051.
- Charter and Confirmation items that apply to the touched files:
  - ui charter rules: "長大スレッドは仮想化する" (the map is virtualized), Principle XII / XIII, the right-pane tab table (AD-046 Decision 4).
  - session charter Key concepts and Related Specs (U-1 records the widening of the contract's values).
  - AD-051 Confirmation (SC-001 / SC-002 / SC-005 and quickstart V-3 #1).
  - AD-034 (the map does not re-fetch the transcript), AD-046 Decision 4 / 6.
  - Constitution IV (SDK only), X (not persisted), XIV (glossary).
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (`parseMessageTime` の未信頼検査は ADR 整合の観点でのみ確認)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲 (glossary `Activity bar` と実装の `ActivityBand` の混在は code-gate で convention-reviewer が既に記録済み)
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

This PR fills `TranscriptMessageDTO.createdAt`, which was always `null`:
- Past logs: the `timestamp` field from the `getSessionMessages` return, which is not in the public type.
- Running sessions: the SDK's `timestamp`, falling back to the session thread's receive time.
- User input: the renderer's send time.

On top of that it adds:
- Times and turn durations in the center body.
- A new right-pane tab, "会話の地図": one virtualized row per turn plus the activity bar.

New ADR: AD-051 (accepted).

Architecture checks that hold up:
- `parseMessageTime` is a single domain function, shared by the past-log and running paths (AD-051 Decision 4).
- Nothing sorts by time.
- Display code reads only `metadata.custom.createdAt`, never assistant-ui's `createdAt` (Decision 6). Grep: no non-test code in the renderer reads it.
- Duration subtracts on one clock: `receivedAt` for running sessions, record time for past logs (Decision 7).
- Same-id resends keep the first time (`mergeSystemEvent` spreads `prev`; `upsertMessage` keeps the earlier value).
- The new tab is added to the single table `PANEL_TABS` (AD-046 D4).
- Navigation reuses O-3's `navigateTo` instead of adding a new mechanism.
- Nothing is persisted (Principle X).
- The DTO shape, IPC and preload have no diff (FR-005).

ADR-drift mode:
- Among accepted ADRs, only AD-051 is added. No existing ADR is changed in place.
- AD-051 is not in the implementation's touched files, so it was not edited after acceptance.
- Implementation and the AD-051 Decisions disagree in 0 places.
- The open problem is how the Confirmation's progress is recorded (H-001).

## Findings

### [High] The roadmap's list of "V-3 items not confirmed" leaves out AD-051's Confirmation (past log, V-3 #1). Read as written, the ADR premise looks confirmed (H-001) (scope: feature)

- **Observation**:
  - `C:\dev\closta\specs\017-ui-conversation-time-and-activity\quickstart-results.md:28` says the whole of V-3 was "未実施 (利用者に残す)". It lists the unconfirmed items as "実行中の SDK の `timestamp` の有無・012 の V-3 の絞り込み・V-3 の 3 / 12 の見え方".
  - The O-9 row's conclusion at `C:\dev\closta\docs\roadmap.md:382` names only two unconfirmed V-3 items: whether running SDK messages carry `timestamp`, and 012's V-3 filtering. It omits 3 / 12, and it omits V-3 #1.
  - V-3 #1 (`quickstart.md:37`: open one past session and see times; if none, U-2's premise has failed) is exactly AD-051's Confirmation (`docs/decisions/0051-message-time-source-and-display-only.md:57`). The ADR says that if this fails, the ADR itself must be revisited.
  - The roadmap phrasing "確かめられなかった項目 = 2 つ" reads as if every other V-3 item, including #1, was confirmed.
- **Same-kind search**: `V-3 \(実機の目視\) で確かめられなかった項目` in `docs/` gives 1 hit (`docs/roadmap.md:382`). `quickstart-results.md:28` lists a different set (3 items), so the two records disagree.
- **Risk / impact**:
  - Decision 1 relies on a field outside the SDK's public type, and the only check against a real transcript is V-3 #1. Unit tests use synthetic fixtures, so they cannot catch a missing field.
  - If the field is missing, every past log falls back to `null`. Message times, the map's times and durations, and the activity bar all disappear for past logs with no error. AD-051's "revisit" trigger then fires with no owner.
  - Because the roadmap omits the item, whoever closes O-9 next could treat the Confirmation as done.
- **Recommended action**:
  - In the O-9 row at `docs/roadmap.md:382`, list the full set of unconfirmed V-3 items, matching `quickstart-results.md:28`. Put #1 first and mark it as AD-051's Confirmation. Make the list consistent with quickstart-results ("3 / 12 の見え方" is also missing from the roadmap).
  - Record in `quickstart-results.md` V-3 that #1 is AD-051's Confirmation and who owns it: the user, before merge or by the next SDK bump.
- **Basis**: AD-051 Confirmation; AD-031 (accepted ADRs are judged against the facts); constitution amendment procedure (keep ADR confirmations traceable).
- **Scope basis**: `docs/roadmap.md` and `quickstart-results.md` are in this PR's touched files.

### [Medium] The session charter's record of O-9 is wrong: it lists a file that was not changed and omits renderer-side changes to session's store (M-001) (scope: feature)

- **Observation**:
  - `C:\dev\closta\docs\domains\session\charter.md:300` says O-9 changed `src/domain/session/... system-event.ts`. `system-event.ts` is not in the diff or in `touched-files.txt`; it already accepted the `createdAt` argument.
  - The same entry does not mention the changes to session's renderer store:
    - `running-session-store.ts`: time and `receivedAt` on `appendUser`; `applyMessage` gains a `receivedAt` argument; `upsertMessage` keeps the earlier time.
    - `composer-queue.ts`: new public function `isRunBusy`.
    - `RunningSessionsProvider.tsx`.
  - Precedent: O-7 and O-3 recorded their changes to this store explicitly in the same Related Specs section (`charter.md:258-274`).
  - `charter.md:159` writes the type name as `TranscriptMessageDto`; the real identifier is `TranscriptMessageDTO` (`src/domain/session/transcript-dto.ts`).
- **Same-kind search**: `system-event.ts` appears in the O-9 entry as a changed file in 1 place (`docs/domains/session/charter.md:300`). The design-time statement in `spec.md:79` (U-1) also lists `system-event.ts`, but that is a plan, so no fix is needed there.
- **Risk / impact**: The charter is meant to record exactly how a ui feature widened session's contract. With the wrong file listed and the renderer store changes missing, the next person to touch `running-session-store.ts` will not find the ownership of the time-handling code or the `metadata.custom.receivedAt` rule.
- **Recommended action**:
  - In the O-9 entry at `charter.md:300`, drop `system-event.ts` and add `running-session-store.ts` and `composer-queue.ts` (`isRunBusy`).
  - At `charter.md:159`, change `TranscriptMessageDto` to `TranscriptMessageDTO`.
- **Basis**: session charter Related Specs convention (O-7 / O-3 precedent); Principle XIV.
- **Scope basis**: `docs/domains/session/charter.md` is in the touched files.

### [Medium] The glossary's definition of "Message time" contradicts AD-051 Decisions 1 and 4 for past logs (M-002) (scope: feature)

- **Observation**: `C:\dev\closta\docs\glossary.md:592` says: "無い・壊れている・範囲外ならメッセージを受信・送信した時刻". AD-051 Decisions 1 and 4, and the implementation (`transcript.ts` `createdAt = parseMessageTime(rec.timestamp, now)`), make an invalid past-log value `null`. Only running sessions fall back to the receive time (`live-message.ts` `parseMessageTime(...) ?? receivedAt`). The definition makes no distinction between past logs and running sessions.
- **Same-kind search**: `受信・送信した時刻` in `docs/` gives 1 hit (`docs/glossary.md:592`). The session charter (`charter.md:159`) correctly says past logs are `null` when missing.
- **Risk / impact**: Under Principle XIV the glossary is the canonical term set. If it says "past logs get a fallback time", someone may later add a receive time to past logs, which contradicts AD-051's rejected alternative and the meaning of "missing means `null`".
- **Recommended action**: Rewrite the definition as: "過去ログは記録の `timestamp` を検査して使い、受けられなければ `null`。実行中は SDK の `timestamp`、受けられなければセッションスレッドの受信時刻。利用者の入力は renderer の送信時刻".
- **Basis**: Principle XIV; AD-051 Decision 1 / 2 / 4.
- **Scope basis**: `docs/glossary.md` is in the touched files.

### [Low] The registry element count (127 → 128) was updated only in `ui-coverage.md`, not in the Constitution or the charter (L-001) (scope: system)

- **Observation**: F section of `docs/ui-coverage.md` says 128. The Constitution's Principle XIII (`constitution.md:833,841`) and the ui charter Key concepts (`docs/domains/ui/charter.md:148`) still say 127, dated 2026-10-03.
- **Same-kind search**: `127` appears in 2 places in the Constitution and 1 place in the ui charter.
- **Recommended action**: Fix in the next Constitution PATCH. The charter can say "127 (2026-10-03) / 128 (2026-10-16)".
- **Basis**: Principle XIII; constitution versioning policy.

### [Low] Past-log time depends on a non-public SDK field, and nothing observes when it silently disappears (L-002) (scope: system) [H]

- **Observation**: `src/agents/read-transcript.ts` passes the SDK return value through as `SessionMessageLike` and invalid values become `null`. When every record lacks `timestamp`, nothing tells anyone except someone looking at the screen.
- **Same-kind search**: `timestamp` in `src/agents/read-transcript.ts`: 0 hits. In `src/domain/session/transcript.test.ts`: 3 hits (synthetic fixtures only).
- **Recommended action**: Not a fix for this PR. Consider with the observation-point decision (014 plan RK-14).
- **Basis**: AD-051 Consequences / Confirmation.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `V-3 \(実機の目視\) で確かめられなかった項目` (docs/) | 1 | docs/roadmap.md:382 (quickstart-results.md:28 lists a different set) |
| M-001 | `system-event.ts` (session charter, O-9 entry) | 1 | docs/domains/session/charter.md:300 |
| M-002 | `受信・送信した時刻` (docs/) | 1 | docs/glossary.md:592 |
| L-001 | `127` (registry element count) | 3 | .specify/memory/constitution.md:833, :841 / docs/domains/ui/charter.md:148 |
| L-002 | `timestamp` (src/agents/read-transcript.ts) | 0 | — |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 2
