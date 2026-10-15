# architecture-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-16T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md

## 初回読了 viewpoint

Read in full: spec.md, plan.md, tasks.md, data-model.md, research.md, quickstart.md, AD-051 (proposed), the whole constitution, the ui charter, `_overview.md`, and these accepted ADRs: AD-002 / 034 / 046 / 047 / 049. For the rest of the accepted set I checked `status:` and grepped for `createdAt` / `timestamp` / `時刻`. The only hit is AD-051, so no accepted ADR fixes `createdAt` at null. I also read the relevant parts of the session charter and glossary, and checked the source the plan cites by line: `transcript.ts`, `live-signals.ts`, `sdk-agent-session.ts`, `ConversationSearchProvider.tsx`, `RunningSessionsProvider.tsx`, `eslint.config.mjs`, and the SDK's `sdk.mjs:134`.

- FR/SC: FR-001〜FR-005 (filling in times: domain / agents / store) / FR-006〜FR-007 (time and turn duration in the center) / FR-008〜FR-011 (conversation map) / FR-012〜FR-013 (activity band) / FR-014〜FR-016 (coverage table, ADR, records) / SC-001〜SC-006. All are touched.
- Charter / Confirmation that apply to the touched files:
  - ui charter: In scope :61 and :77-84, invariant "長大スレッドは仮想化する" :162, KPI 表示網羅 / 自作率 :165-176, 面の状態 :181-197.
  - session charter: Key concepts :121-160, frontmatter :7-31.
  - `_overview.md` 帰属の判断根拠 :102-120.
  - AD-046 Decision 4 / 6, AD-034 Decision 1, AD-047 Decision 3, AD-049 Decision 1 / 2, AD-051 Confirmation.
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer's area. The plan does not touch IPC, preload, credentials, or process boundaries.
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer's area. Validating `parseMessageTime` input is security's job.
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:4 Low:3
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer's area
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer's area (stale plan line numbers and the eslint list are also theirs)
- G. optional reviewer 範囲: 該当なし: ui-coverage, a11y and ux each own their part
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-9 fills `TranscriptMessageDTO.createdAt` with real times. Past logs read the `timestamp` that `getSessionMessages` returns even though the public type does not have it. Live sessions use the SDK `timestamp`, falling back to the time the session thread received the message. User input gets its time from the running store. The DTO shape, IPC and preload do not change. On top of that, the renderer adds:
- message times and turn durations in the center body,
- a "会話の地図" tab in the right pane, virtualized, that jumps the center using O-3's existing navigation,
- an activity band at the top of that tab.

AD-051 (proposed) records where times come from and that they are display-only. U-1〜U-7 are provisional choices made overnight and still need the user's approval. The layering is sound:
- agents only adds an import of `domain/session/transcript-time.ts`;
- `features/session → features/chat` already exists as a dependency;
- `ConversationSearchProvider` keeps its "props only" rule.

The plan contradicts no accepted ADR's Decision. The findings are gaps in recording what happened, overlapping terms, and one place where the plan reaches into O-11's scope.

## Findings

### [Medium] U-1 (O-9 extends the session contract's values) is recorded in fewer places than in O-4 / O-5 / O-6 (M-001) (scope: feature)

- **観察**:
  - `docs/domains/_overview.md:104-120`, under 帰属の判断根拠, has one bullet each for O-4, O-5, O-6 and O-11 saying "ui のまま、session の契約を広げる". This is where the attribution decisions are kept.
  - `data-model.md:244` / `tasks.md:76` only rewrite the O-9 feature row at `_overview.md:68`. Neither adds an attribution bullet for O-9.
  - For the session charter, `data-model.md:243` / `tasks.md:75` cover Key concepts, Related ADRs and Related Specs. Neither mentions the frontmatter `related_adrs` (`session/charter.md:7-19`) or `related_specs` (`:20-31`). The precedent puts 014 / 016 and AD-047 / 049 there.
  - For the ui charter, `data-model.md:242` does list the frontmatter.
- **同種事象探索**: Grep `O-4 は|O-5 は|O-6 は|O-11` in `_overview.md` gives 4 bullets (:104, :107, :114, :118), and 0 for O-9. Grep `0047|0049|014-|016-` in the session charter frontmatter gives 4 entries (:18, :19, :29, :31), and 0 for 017 / AD-051.
- **リスク/影響**: The roadmap (`roadmap.md:382`) asked O-9 to confirm who owns this, "session charter と合わせて". `_overview.md` is the single source of truth for attribution decisions. If the O-9 bullet is missing there, the next reader cannot find the decision that O-9, a ui feature, extended a session contract value.
- **推奨アクション**:
  - Add to `_overview.md` under 帰属の判断根拠: "**O-9 は `ui` のまま、session の契約の値を広げる** — `createdAt` の値を過去ログ・実行中の変換で埋める (DTO の形は不変。U-1 / AD-051)".
  - Add `docs/decisions/0051-...md` and `specs/017-.../spec.md` to the session charter frontmatter.
  - Add both lines to data-model §7 and SH-010.
- **根拠**: `_overview.md` 帰属の判断根拠 (precedent from O-4 / O-5 / O-6), roadmap O-9 row, session charter frontmatter.
- **scope 根拠**: These are record updates already in this feature's FR-016 / SH-010.

### [Medium] The domain conversion's default `now` brings the first clock read into `src/domain` (M-002) (scope: feature)

- **観察**:
  - `data-model.md:47` and `plan.md:41` define `toTranscriptMessages(records, options?: { now?: number })`, and `tasks.md:33` (BE-010) has the default fall back to `Date.now()`.
  - BE-001 (`tasks.md:24`) requires the sibling `parseMessageTime` to have "時計を読まない".
  - AD-023 says domain has no I/O (`0023-application-architecture.md:194`) and that "domain のテストはモックがゼロ" (`:372`).
- **同種事象探索**: Grep `Date\.now` in `src/domain` gives 0 hits. This would be the first in domain. Callers of `toTranscriptMessages(`: 41 across 6 files (37 tests, 1 in `read-transcript.ts`, 1 in `ChatScreen.test.tsx`).
- **リスク/影響**: With the default, the result of the range check (rule #6, "受けた時点 + 1 日") depends on the wall clock. It becomes the domain's first impure default and contradicts BE-001's own "the function does not read the clock". Existing tests keep passing without saying anything, so the purity rule wears down without anyone noticing.
- **推奨アクション**:
  - Make `now` required (`toTranscriptMessages(records, { now })`).
  - Pass `Date.now()` from `read-transcript.ts:70-75`. The test callers pass a fixed value; a helper can absorb this.
  - If keeping it optional is unavoidable, skip the upper-bound check when `now` is omitted (do not read the clock in domain) and record the reason in data-model §1.
- **根拠**: AD-023 (domain I/O なし / テストのモックがゼロ), BE-001's own rule.
- **scope 根拠**: Only this feature's BE-010 / data-model §1 change.

### [Medium] "ターン" now has three meanings in the same right pane, and the glossary entry does not separate them (M-004) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:48` uses "ターン数 (セッションスレッドが result を数える)" (shown in the 使用量 tab, UsageTab) and "`num_turns` (1 ターンの往復の数)".
  - `src/agents/live-signals.ts:286` counts `turns` once per result.
  - spec.md:160 (Edge case) and data-model.md:93 say "1 つの API のターン", which means a single API round-trip.
  - The new "ターン" (`data-model.md:73-77`) runs from one user input to the next.
  - SH-001 (`tasks.md:15`) adds the new term without a Counterexample against these.
- **同種事象探索**: Grep `ターン` in glossary headings: 0 entries (the word appears only inside other entries, e.g. FailureReason "起動とターンの失敗"). Usages: `ui-coverage.md:48` (2 meanings), `spec.md:160`, `data-model.md:93`, `live-signals.ts:286`.
- **リスク/影響**:
  - The 使用量 tab's ターン数 and the map's row count are both shown in the same right pane and can differ:
    - RK-05: compaction summaries and `is_meta` records count as turns in past logs.
    - A turn with no result yet is still a map row.
  - Principle XIV forbids one word meaning different things in code, spec and UI.
- **推奨アクション**:
  - In SH-001, add Counterexamples to the "ターン" entry:
    - not the same as the meter `turn`'s ターン数 (results counted);
    - not the SDK's `num_turns` (API round-trips).
  - Change spec.md:160 and data-model.md:93 from "API のターン" to "API の往復" (1 回の API 呼び出し).
- **根拠**: Principle XIV, glossary Meter, ui-coverage A section `SDKResultMessage`.
- **scope 根拠**: This feature's SH-001 and its own spec / data-model wording.

### [Medium] Past-log boundary marks would require O-11's past-log conversion, but the plan does not say so (M-005) (scope: feature)

- **観察**:
  - US-2 AC1 (`spec.md:130`) promises marks for compaction, conversation resets and model refusals on both past and running conversations.
  - FE-022's test (`tasks.md:57`) uses "過去ログと実行中の fixture で…境界の印 (O-6 の 3 つ)".
  - Converting O-6's rows (informational, refusal, conversation reset) for past logs belongs to O-11 (AD-049 Decision 1, `0049-...md:37`; roadmap O-11 row `roadmap.md:384`).
  - Today's past-log conversion only produces the compaction divider (`transcript.ts:207-209`). Refusals come through as redacted `system` text.
  - data-model §2 `marks` (`data-model.md:91`) says only that past-log dividers match `compact-boundary`, not that the other two can never appear in past logs.
- **同種事象探索**: Grep `conversation-reset|refusal` in `src/domain/session/transcript.ts`: 0 hits. They are built only in agents (`live-signals.ts:633`, `:645`, `:798`).
- **リスク/影響**: An implementer trying to satisfy the past-log fixture literally might add refusal / reset detection to the past-log conversion. That would cut into scope that AD-049 Decision 1 gave to O-11. The opposite outcome is a fixture the code can never satisfy.
- **推奨アクション**:
  - In data-model §2 `marks` and FE-022's test, state that past logs only get `compact-boundary`, and that refusal / reset come only from running sessions until O-11.
  - Qualify US-2 AC1 to match ("過去ログは圧縮の境界だけ").
- **根拠**: AD-049 Decision 1, roadmap O-11 row.
- **scope 根拠**: This feature's spec / data-model / tasks wording.

### [Medium] The deferred handling of compaction summaries / `is_meta` (RK-05) has no named owner (M-006) (scope: feature)

- **観察**: `plan.md:248` (RK-05) and `research.md:65` say "見分けるなら後続で `isCompactSummary` / `is_meta` を変換に通す (本 feature の範囲の外)", but name no follow-up feature ID. SH-010 (`tasks.md:73`) only says to carry V-3 items that could not be confirmed into the O-9 row.
- **同種事象探索**: Grep `isCompactSummary|is_meta` in `docs/roadmap.md`: 0 hits. The SDK return value carries both fields (confirmed at `sdk.mjs:134`).
- **リスク/影響**: Turn counts in past logs, which drive map rows, durations and the activity band, come out wrong in a known way, and nobody owns fixing it. The project's rule is to leave no deferral without an owner (AD-034 申し送り, AD-031).
- **推奨アクション**:
  - Name an owner (for example add it to the O-11 row's "過去ログへの…変換", or to the feature that next touches the past-log conversion).
  - Record it in roadmap.md through SH-010 and replace RK-05's "後続" with that ID.
  - Re-scoping is not required.
- **根拠**: AD-034 申し送り / AD-031 (持ち主のいない延期を残さない).
- **scope 根拠**: Changes are limited to this feature's plan / tasks / roadmap record.

### [Medium] The undocumented `timestamp` that AD-051 Decision 1 depends on is only checked by hand when the SDK changes (M-003) (scope: feature)

- **観察**:
  - AD-051 (`0051-...md:29`, `:38`, `:55`) has the app depend on a `timestamp` the SDK returns but its public type lacks.
  - Detection relies on two manual steps: step 4 of "SDK を上げたときの手順" in `ui-coverage.md` (`data-model.md:233`) and the user's live check in quickstart V-3 #1 (`quickstart.md:37`).
  - Principle IV's Why (`constitution.md:477`) and AD-002 (`0002-...md:29-30`) avoid relying on SDK implementation details because they "バージョン間で変更されうる".
  - The code falls back to `null` (current display), so nothing breaks.
- **同種事象探索**: Grep `getSessionMessages` in `src`: 0 hits in tests. Only the real call in `read-transcript.ts:70`; no contract test.
- **リスク/影響**: If the field disappears on an SDK upgrade, CI stays green and past-log times, the map and the band all go blank without any error. The only safeguard is a person remembering a checklist step.
- **推奨アクション**:
  - Add an agents-side contract test: write a minimal JSONL into a temp `CLAUDE_CONFIG_DIR`, call the real `getSessionMessages`, and assert `timestamp` is a string. Running it in CI, in the PR that upgrades the SDK, catches the drift automatically.
  - If this is not done, add a line to AD-051 Consequences: "検出は手動だけであり CI は気づかない". The user decides when approving AD-051.
- **根拠**: Principle IV (Why) / AD-002 Rationale / AD-051 Confirmation.
- **scope 根拠**: This feature's AD-051 and test design (BE-010).

### [Low] "活動" / `startedAt` clash with existing terms (L-001) (scope: feature)

- **観察**:
  - Existing glossary "Recent activity（直近の活動）" (`glossary.md:738-743`) uses the identifier `Activity` / `deriveActivity` (session).
  - The new "活動の帯" / `activityBins` (`data-model.md:116-150`) uses the same word for a different idea.
  - The turn's `startedAt` (`data-model.md:85`) collides with the session start time `startedAt` in glossary `:1016`.
- **同種事象探索**: Grep `Activity|直近の活動` in `docs/glossary.md`: 1 entry (:738). Grep `startedAt` in glossary: 1 hit (:1016).
- **推奨アクション**: In SH-001, add Counterexamples to the "活動の帯" entry ("監視ビューの直近の活動 (Recent activity) とは別"). Rename the turn field to something like `turnStartedAt`, or add a Counterexample.
- **根拠**: Principle XIV.
- **scope 根拠**: SH-001.

### [Low] The glossary SessionMessage entry still names `sdk.d.ts` as the only authority (L-002) (scope: feature)

- **観察**: `glossary.md:869-874` lists SessionMessage's fields with "`sdk.d.ts` が正本". O-9 reads `timestamp`, which is not in the type. SH-001 does not update this entry.
- **同種事象探索**: Grep `timestamp` in `docs/glossary.md`: 0 hits.
- **推奨アクション**: Add a Note to the SessionMessage entry: "`timestamp` (ISO 8601) は型に無いが SDK 0.3.270 の実装が返し、O-9 が読む (AD-051 Decision 1)".
- **根拠**: Principle XIV, AD-051.
- **scope 根拠**: SH-001.

### [Low] The registry count goes from 127 to 128, but the Constitution and ui charter keep saying 127 (L-003) (scope: feature)

- **観察**:
  - data-model §7 (`data-model.md:231-232`) adds Conversation map to F section, making it 128, and adds a note at the top of F section.
  - Constitution XIII Why and Exceptions (`constitution.md:833`, `:842`) and ui charter Key concepts (`ui/charter.md:146`) say "127 (2026-10-03)".
  - Because these are dated records they are not false, but readers will see a different number from the current table.
- **同種事象探索**: Grep `127` in `docs`: 2 hits (`ui-coverage.md:231`, `ui/charter.md:146`). The constitution has 2 occurrences (:833, :842).
- **推奨アクション**: In SH-010, add to ui charter Key concepts: "2026-10-16 に Conversation map を足して 128 (O-9)". Leave the Constitution as is (dated) and handle it in the next PATCH.
- **根拠**: Principle XIII Exceptions ("registry が増えたら F 節に足してから照合する").
- **scope 根拠**: SH-010.

### [Low] The new center-to-right-pane channel is not written into the ui charter's "面の状態" (L-004) (scope: feature)

- **観察**:
  - The ui charter describes `stores/ui.ts` as "面の状態と画面をまたぐ受け渡し" (`ui/charter.md:181`). The "面の状態" item (`:188-197`) is the operational source of truth.
  - research R-07 (`research.md:76-78`, `:86`) and plan (`plan.md:214`) create a separate store in `ShellLayout` (`center-conversation.ts`) for the center-to-right-pane handoff, with a reason for not using `stores/ui.ts`. That reasoning is sound, but nothing is recorded in the charter or glossary.
- **同種事象探索**: Grep `center-conversation|公開口` in `docs/domains`, `docs/glossary.md`: 0 hits.
- **推奨アクション**: Add one line to the ui charter's "面の状態" (or the glossary Shell entry): "中央の会話を右のペインへ渡す公開口 (`features/chat/center-conversation.ts`) は面の状態ではなく ui の内部の store。`stores/ui.ts` に置かない理由は 017 research R-07".
- **根拠**: The ui charter's "面の状態" section is the operational source of truth (AD-046 correction section).
- **scope 根拠**: SH-010.

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `O-4 は\|O-5 は\|O-6 は\|O-11` in `_overview.md` / `0047\|0049\|014-\|016-` in session charter frontmatter | 4 / 4 (O-9: 0 / 0) | `_overview.md:104,107,114,118` / `session/charter.md:18,19,29,31` |
| M-002 | `Date\.now` in `src/domain` / `toTranscriptMessages\(` in `src` | 0 / 41 (6 files) | `transcript.test.ts` 29, `transcript.system-event.test.ts` 7, `transcript-schema.test.ts` 2, `read-transcript.ts` 1, `ChatScreen.test.tsx` 1, `transcript.ts` 1 |
| M-003 | `getSessionMessages` in `src` (tests) | 0 tests (1 real call) | `src/agents/read-transcript.ts:70` |
| M-004 | `ターン` (glossary headings / existing usage) | 0 entries / 5 usages | `ui-coverage.md:48`, `spec.md:160`, `data-model.md:93`, `live-signals.ts:286` |
| M-005 | `conversation-reset\|refusal` in `src/domain/session/transcript.ts` | 0 | (built only in agents: `live-signals.ts:633,645,798`) |
| M-006 | `isCompactSummary\|is_meta` in `docs/roadmap.md` | 0 | — |
| L-001 | `Activity\|直近の活動` / `startedAt` in glossary | 1 / 1 | `glossary.md:738`, `:1016` |
| L-002 | `timestamp` in `docs/glossary.md` | 0 | — |
| L-003 | `127` in `docs` + constitution | 2 + 2 | `ui-coverage.md:231`, `ui/charter.md:146`, `constitution.md:833,842` |
| L-004 | `center-conversation\|公開口` in `docs/domains`, glossary | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 6
- Low: 4
