# po-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: po-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Gate**: pr-gate Round 1 (HEAD a05dfc8)

## 初回読了 viewpoint

- FR/SC の割当と根拠: FR-001〜003 / SC-001 / SC-002 (V-1 ok)、FR-004 (roadmap O-4〜O-6・M3 の条件)、FR-005 (F 節)、FR-006 / SC-007 (Phase 3 で確認)、FR-007 (**エラーと切り詰めは Bash だけ — H-001**)、FR-008 / FR-009、FR-010、FR-011 / SC-004 (V-3 ok)、FR-012 / FR-013 / SC-005 (**見える文言で対象が分からない — M-001**)、FR-014 / SC-006、FR-015 / FR-016、SC-003 (自動の範囲は ok、V-4 未実施)
- charter / Confirmation: ui charter KPI「表示網羅」、AD-044 Confirmation、AD-028 §5、glossary「Transcript density」「System event row」
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:2 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ui-coverage-reviewer / ux-reviewer / a11y-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (テストの欠けは H-001 / M-001 に含めた)

## スコープ要約

対応表と項目 21、`ui-coverage-reviewer`、実行中の tool の結果、Hook / Background task の行、transcript の密度、監視ビューの要点を見た。FR / SC の裏づけ、文言、異常系の UX、V-4 の記録の正直さを見た。

## Findings

### [High] tool の結果のエラーと切り詰めが Bash 以外の表示に出ず、失敗・拒否された Edit が適用済みの diff に見える (H-001) (scope: feature)

- **観察**: `code-diff.aui.tsx:103-142` は `isError` / `result` を見ない。`tool-fallback.aui.tsx` に `isError` の参照が無い (エラーは `status.type === "incomplete"` だけ、`convert.ts:61-69` は `status` を付けない)。切り詰めの印は CodeDiff と TerminalBlock だけ。Subagent の最上位 (`subagent.aui.tsx:146-192`) も `isError` を見ない。一方で `ui-coverage.md:104` は `user/tool_result` を Tier A「実装済み: 各 tool の表示 (両方)」、`:343` は「Tool error … エラーの結果は各 tool の表示で出す」。AC2 のテストは Bash 1 件だけ (`SessionScreen.o2.test.tsx:187-197`)
- **同種事象探索**: elements で `isError|truncated` — エラーを描くのは terminal-block と subagent の入れ子だけ。code-diff / tool-fallback / todo-list / agent-plan / subagent 最上位は 0 件
- **リスク/影響**: 失敗・拒否された Edit が成功と同じ diff に見える。対応表の Tier A の「実装済み」が実態より甘い
- **推奨アクション**: (a) CodeDiff・ToolFallback・Subagent 最上位などにエラーと切り詰めの印を足してテストする、または (b) 対応表を Bash は実装済み・その他は `後続: O-6` に分け、spec の AC2 / FR-007 を絞る
- **根拠**: FR-007、US-2 AC2、Constitution XII、AD-044 Decision 1
- **scope 根拠**: 変更済みのファイルの中で直せる

### [Medium] 密度の切り替えは見える文言で何に効くかが分からない (M-001) (scope: feature)

- **観察**: 見える文言は「開いて表示 / 畳んで表示」だけで、「transcript の表示」は `aria-label` だけ (`TranscriptDensityToggle.tsx:21-41`)。監視ビューも見出しは aria だけ。AC5 のテストは aria 名の違いだけ。「開いて表示」は Reasoning が閉じたままである点と合わない
- **推奨アクション**: 見える見出しか接頭辞を足す、少なくとも `title` で説明。V-4 の 6 に見た目の区別を入れる
- **根拠**: US-3 AC5、FR-012、glossary Counterexamples

### [Medium] V-4 で未確認の前提に merge 後の持ち主がいない (M-002) (scope: feature)

- **観察**: `quickstart-results.md:26-35` は V-4 を未実施と正しく記録。ただし `hook_name` の中身、過去ログの経路、`Agent` / `Task`、並列の結果の届き方の 4 項目に持ち主が無い (roadmap の `V-4` は R-3 の先例 `:111` だけ)
- **推奨アクション**: roadmap に O-2 の V-4 の後続 (4 項目と結果ごとの直し方) を登録し、spec の [ASSUMED] から参照する
- **根拠**: AD-028 §5、spec Assumptions (L260-263)、roadmap.md:111

### [Low] 「過去ログは未確認 (V-4)」の注記が hook_started の行だけ (L-001)

- **推奨アクション**: `ui-coverage.md:55` / `:59` / `:60` / `:61` にも足す

### [Low] task の行に SDK の識別子 (`local_bash` など) がそのまま出る (L-002)

- **推奨アクション**: `labels.ts` に task の種類の文言の表を足す (知らない値は識別子のまま)

### [Low] Hook の失敗の案内でログの場所が分からない。進行中が「開始」と出る (L-003)

- **推奨アクション**: 案内に設定とログの場所の手がかりを足す。`started` を「実行中」と表示

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `isError\|truncated` (elements) | 描く 2 / 描かない 5 | terminal-block.aui.tsx:51,82; subagent.aui.tsx:80; code-diff.aui.tsx:103-142; tool-fallback.aui.tsx; subagent.aui.tsx:146-192 |
| M-001 | `TRANSCRIPT_DENSITY_LABELS.group` の見えるテキスト | 0 | TranscriptDensityToggle.tsx:23 |
| M-002 | `V-4` (docs/) | 3 (O-2 の後続 0) | roadmap.md:111; ui-coverage.md:53; decisions/0035…:95 |
| L-001 | `未確認` (ui-coverage.md) | 1 | ui-coverage.md:53 |
| L-002 | `task_type` 用の文言 | 0 | system-event.ts:115-118; thread.aui.tsx:948-951 |
| L-003 | started / hookFailedGuidance | 2 | labels.ts:19, 36 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 3

V-4 の記録は正直 (未実施と明記し、自動の範囲と分けている)。足りないのは merge 後の持ち主 (M-002)。V-5: Phase 3 で `ui-coverage-reviewer` が実際に選ばれた (`docs/ui-coverage.md` に一致) ので閉じる。
