# ui-coverage-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-001 (table exists), FR-002 (assignment kinds and Tier), FR-004 (O-4/O-5/O-6 ranges), FR-005 (F section), FR-007 (live tool results, live `redacted_thinking`), FR-008 / FR-009 (Hook / task rows), FR-010 (Agent/Task → Subagent), SC-001 / SC-003
- Charter / Confirmation: AD-044 Decision 1/2/3 and Confirmation, Principle XII, ui charter Out of scope, AD-028 §5
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (UC-6 は G で見た)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (ui-coverage の判断): Critical:0 High:3 Medium:3 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

The PR creates `docs/ui-coverage.md` and item 21, adds AD-044 and Constitution v1.3.0, implements live tool results, Hook/task rows (live and past-log conversion), live `redacted_thinking`, Subagent for `Agent`/`Task`, and registers O-4/O-5/O-6. Every 実装済み row for the new displays holds against the code (tool_result :41/:104, hook/task :53/:55/:59-61, redacted_thinking :99, Agent :114). Every 後続 row is in its owner's range except M-001 / L-003. The findings below are judgement errors that pass item 21.

## Findings

### [High] The `result` failure reason has no owner, and the row's note understates the display (H-001) (scope: feature)

- **観察**: `ui-coverage.md:43` SDKResultMessage Tier A `後続: O-4`, note "成否はセッションの状態 (完了・失敗) として出ている". `session-core.ts:337-341` (`classifyResult`) maps every non-`success` subtype (`error_max_turns`, `error_during_execution`, `error_max_budget_usd` …) to `provider-error`, shown as "Provider の認証/接続でエラーが発生しました…" (`features/session/labels.ts:27-28`). O-4's range (`roadmap.md:256`) lists only 費用・使用量・ターン数・`permission_denials`
- **同種事象探索**: `classifyResult|'provider-error'` 3 件 (session-core.ts:337, labels.ts:27, :67)
- **リスク/影響**: A session stopped at the turn/budget limit tells the user to check login/credits. No owner's range covers the failure reason (AD-028 §5)
- **推奨アクション**: Add "`result` の失敗の理由 (subtype の区別・`errors`)" to O-4's range; rewrite the note to "失敗は理由を区別せず provider-error として出ている。理由の区別は O-4"
- **根拠**: AD-044 Decision 1 / 2 / Consequences, AD-028 §5
- **scope 根拠**: both files touched by this PR

### [High] `conversation_reset` and `informational` are Tier B with no note (H-002) (scope: feature)

- **観察**: `ui-coverage.md:78` SDKConversationResetMessage Tier B `後続: O-6`, empty note; SDK says "/clear, plan-mode exit … mount a fresh transcript" (`sdk.d.ts:4746-4748`). `:77` SDKInformationalMessage Tier B; carries a UserPromptSubmit hook's block reason and `prevent_continuation` (`sdk.d.ts:4852-4870`)
- **同種事象探索**: session-boundary / stop rows: `compact_boundary` (:46) A, these 2 B
- **リスク/影響**: AD-044 Decision 2 lists セッションの境界 and 中断 as Tier A. Downgrading removes them from the M3 count
- **推奨アクション**: Make both Tier A, keep `後続: O-6` (M3 remaining 17 → 19), or give a reason in the note
- **根拠**: AD-044 Decision 2 / 3

### [High] TaskCreate / TaskUpdate / TaskList / TaskGet are Tier B ToolFallback while TodoWrite is Tier A TodoList (H-003) (scope: feature)

- **観察**: `ui-coverage.md:131` TodoWriteInput A `実装済み: TodoList`; `:139-142` Task* Tier B ToolFallback with empty notes. `TaskCreateInput` / `TaskUpdateInput` carry the same plan/progress concept (`sdk-tools.d.ts:2724-2775`)
- **同種事象探索**: 5 rows (:131, :139-142)
- **リスク/影響**: Sessions using Task* show plan/progress only as raw JSON; looks like UC-4 (lowering Tier to count ToolFallback)
- **推奨アクション**: (a) Tier A + `後続: O-6` with "Task* の TodoList 表示" in O-6's range, or (b) keep B with an observed reason in each note
- **根拠**: AD-044 Decision 1 / 2, AD-019

### [Medium] `init` note sends model / tools / slash_commands to O-5 but O-5's range only covers `mcp_servers` (M-001) (scope: feature)

- **推奨アクション**: Add them to O-5's range, or narrow the note and mark the rest 表示不要 with a reason
- **根拠**: AD-044 Consequences / AD-028 §5

### [Medium] `status` is Tier B with no note, though it carries permission-mode changes and compaction failure (M-002) (scope: feature)

- **観察**: `ui-coverage.md:47`; `sdk.d.ts:5467-5477` has `permissionMode?`, `compact_result: 'failed'`, `compact_error`. `permissionMode` appears in 0 rows
- **推奨アクション**: Give a reason or raise to A; spell out "permissionMode の変化・圧縮の失敗" in O-4's range (or X-6)
- **根拠**: AD-044 Decision 2

### [Medium] Tier B ToolFallback tools with side effects have no reason note (M-003) (scope: feature)

- **観察**: NotebookEdit (:127), EnterWorktree (:157), ExitWorktree (:158, can delete worktree/branch); Edit/Write are Tier A
- **推奨アクション**: Add a reason note to each, or Tier A + `後続: O-6`
- **根拠**: AD-044 Decision 2

### [Medium] (H) No test or check can catch Tier and range judgement errors (M-004) (scope: feature)

- **観察**: by design (AD-044 Decision 4). H-001's display defect is pinned by `labels.test.ts:21-23`
- **推奨アクション**: When fixing H-001 in O-4, add a test that each failure subtype gets its own reason key. For this PR, write the corrected facts into the rows

### [Low] Hook/task rows say route 実行中 though past-log conversion is implemented (L-001)

- **推奨アクション**: Note "過去ログの変換は実装済み (transcript.ts)。実データに残るかは V-4 で確認後に経路を両方へ"

### [Low] F section "Agent plan" usage lists `AgentInput` (L-002)

- **推奨アクション**: Change to "C ExitPlanModeInput" (`Agent` maps to Subagent)

### [Low] `RefreshMcpTools` only loosely fits O-5's range (L-003)

- **推奨アクション**: Add "MCP 系の組み込み tool (`RefreshMcpTools`)" to O-5's range

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `classifyResult\|'provider-error'` (src) | 3 | src/agents/session-core.ts:337, src/renderer/src/features/session/labels.ts:27, :67 |
| H-002 | session-boundary / stop rows | 2 | docs/ui-coverage.md:77, :78 |
| H-003 | `TaskCreate\|TaskGet\|TaskUpdate\|TaskList\|TodoWrite` | 5 | docs/ui-coverage.md:131, :139-142 |
| M-001 | `model` owner for `init` (roadmap) | 0 | — |
| M-002 | `permissionMode` (ui-coverage.md) | 0 | — |
| M-003 | Tier B ToolFallback rows with side effects | 3 | docs/ui-coverage.md:127, :157, :158 |

## Verdict

- Critical: 0
- High: 3
- Medium: 4
- Low: 3
