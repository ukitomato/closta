# a11y-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: a11y-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (not run in Round 1 — stale reviewers.yml path; nothing inherited)

Contrast ratios are hand-computed from `main.css` tokens after alpha blending (±0.2).

## 初回読了 viewpoint

- FR/SC: FR-007, FR-009, FR-012 / FR-013, SC-003, SC-005 (US-3 AC5)
- charter / Confirmation: ui charter, Principle XIII (existing tokens only), Principle VIII
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の担当外
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の担当外
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:2 Medium:3 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Surfaces: TranscriptDensityToggle (role=group, visible label, aria-labelledby, aria-pressed), SystemEventRow (`thread.aui.tsx:921-979`), ToolResultMarks / ToolErrorResult. Already OK: status as text Badge, icons aria-hidden, name in a separate 「」 span, distinct accessible names for the two density groups (tested), `<html lang="ja">`.

## Findings

### [High] 「（切り詰め）」 is muted-foreground + opacity-70, failing 4.5:1 in both themes (H-001) (scope: feature)

- **観察**: `tool-result-marks.tsx:44` `opacity-70` inside `text-muted-foreground text-xs` headers (code-diff, subagent, todo-list, agent-plan); terminal-block.aui.tsx:48 same. Light ≈ 2.8:1, dark ≈ 3.9:1 (12px → 4.5:1)
- **同種事象探索**: `opacity-70` near truncation / count: 3 (tool-result-marks.tsx:44, terminal-block.aui.tsx:48, todo-list.aui.tsx:43)
- **リスク/影響**: the only truncation marker is hard to read (WCAG 1.4.3), now in 5 more places
- **推奨アクション**: remove `opacity-70` (inherits muted-foreground ≈ 4.8:1) or use `Badge variant="outline"`; same in terminal-block
- **根拠**: WCAG 2.1 SC 1.4.3; Principle XIII (no new tokens)

### [High] The selected density button is shown only by a faint background (≈1.1:1) (H-002) (scope: feature)

- **観察**: `TranscriptDensityToggle.tsx:34` `variant={density === d ? 'secondary' : 'ghost'}`; light ≈ 1.1:1, dark ≈ 1.4:1. Labels describe actions, not state
- **同種事象探索**: 2 (TranscriptDensityToggle.tsx:34, RunningSessionList.tsx:180 existing). Precedent `SessionListScreen.tsx:645` (a11y H-003): aria-pressed + bold + background
- **推奨アクション**: add `aria-pressed:font-semibold` (or ring with existing tokens); monitor toggle as system follow-up or same PR
- **根拠**: WCAG 1.4.1 / 1.4.11

### [Medium] System event name is muted-foreground/80 (≈3.3:1 light) (M-001)

- **推奨アクション**: remove `/80` at `thread.aui.tsx:967`

### [Medium] Truncated name / detail have no way to show the full text (M-002)

- **推奨アクション**: `title={name}` / `title={detailLabel}` at `thread.aui.tsx:950, :967`
- **根拠**: WCAG 1.4.10

### [Medium] Rows rewritten in place are not announced (M-003)

- **観察**: SystemEventRow status changes and ToolResultMarks appear with no live region; 0 `aria-live` in the transcript. Pattern exists: `SessionAttentionAnnouncer.tsx:41`
- **推奨アクション**: one sr-only polite announcer per Thread, announcing only transitions to terminal status / tool `isError`; add a test
- **根拠**: WCAG 4.1.3

### [Medium] (H) No tests detect the above (M-004)

- **推奨アクション**: class / attribute-level tests (no opacity on the truncation mark, non-colour selected marker, announcer text)
- **根拠**: Principle VIII

### [Low] Hint only in `title`; keyboard users never see it (L-001)

- **推奨アクション**: existing Tooltip (opens on focus) or sr-only + visible help

### [Low] Terminal block failure is icon only; success check ≈2.5:1 (L-002)

- **推奨アクション**: use `ToolResultMarks` for failure; `role="img"` on remaining icons
- **根拠**: WCAG 1.1.1 / 1.4.11

### [Low] SystemEventRow fade-in ignores prefers-reduced-motion (L-003) (scope: system)

- **推奨アクション**: `motion-reduce:animate-none` here and on SystemMessage (`:890`)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `opacity-70` (truncation/count label) | 3 | tool-result-marks.tsx:44, terminal-block.aui.tsx:48, todo-list.aui.tsx:43 |
| H-002 | `variant={density === d ? 'secondary' : 'ghost'}` | 2 | TranscriptDensityToggle.tsx:34, RunningSessionList.tsx:180 |
| M-001 | `text-muted-foreground/80` (elements) | 1 | thread.aui.tsx:967 |
| M-002 | `truncate` in SystemEventRow | 2 | thread.aui.tsx:950, :967 |
| M-003 | `aria-live` (renderer) | 6 (0 in transcript) | SessionAttentionAnnouncer.tsx:41 ほか |
| L-002 | `aria-label={TOOL_RESULT_LABELS` | 2 | terminal-block.aui.tsx:53, :58 |
| L-003 | `prefers-reduced-motion` | 0 | — |

## Verdict

- Critical: 0
- High: 2
- Medium: 4
- Low: 3
- Round inheritance: new 9
