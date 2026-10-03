# ux-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: ux-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (ux-reviewer の初回起動。HEAD 57fcc0b)

## 初回読了 viewpoint

- FR/SC: FR-007、FR-008 / FR-009、FR-010、FR-012 / FR-013、FR-014、SC-003 / SC-005 / SC-006
- charter / Confirmation: ui charter (表示網羅)、Constitution XIII (R-06 の照合。新しいトークンなし)、Principle XV、glossary「Transcript density」「System event row」
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (XIII のトークン追加は観察されなかった)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:2 Low:7
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

`TranscriptDensityToggle.tsx` (ChatScreen / SessionScreen)、`SystemEventRow` と密度に応じた既定の開閉、`tool-result-marks.tsx` と各表示、`labels.ts`、`session-view.ts`、`system-event.ts` を見た。R1 の po の UX 指摘 (H-001 / M-001 / L-002 / L-003) は反映済み。空・失敗・読み込み中の状態は既存で適切。

## Findings

### [Medium] tool の表示で「結果待ち」「成功」「結果が来ないまま終わった」の区別がつかない (M-001) (scope: feature)

- **観察**: terminal-block は `isError` で ✗、`hasOutput` で ✓ だけ。code-diff / todo-list / agent-plan / subagent の最上位は `status` も結果の有無も見ない。システムイベントの行は `useTranscriptSettled` で「結果不明」を出すのに、tool の表示には無い
- **同種事象探索**: 専用表示 5 ファイルで `props.status` の参照 0 件
- **リスク/影響**: 実行中に終わったか分からない。落ちた後・過去ログで結果の無い tool が成功に見える
- **推奨アクション**: `ToolResultMarks` に「結果待ち」「結果不明」を足す (`Badge variant="outline"`、文言は `TOOL_RESULT_LABELS`)。やらないなら対応表の `user/tool_result` の備考に「O-6」と持ち主を書く
- **根拠**: FR-007、US-2 AC6、Constitution XII

### [Medium] Terminal block だけ失敗の印がアイコンだけ (M-002) (scope: feature)

- **観察**: `terminal-block.aui.tsx:50-54` は `XCircleIcon` + `aria-label`。他は `ToolResultMarks` の「失敗」Badge。`labels.ts:59-62` / `tool-result-marks.tsx:11` の記述と違う
- **推奨アクション**: terminal-block のヘッダで `ToolResultMarks` を使い、テストを見える文字で確かめる
- **根拠**: UX-9

### [Medium] (H) Todo / Agent plan / Write の印のテストが無い (M-003)

- **推奨アクション**: TodoWrite / ExitPlanMode / Write の失敗と切り詰めを 1 件ずつ (M-001 を直すなら結果待ち・結果不明も)

### [Low] 拒否した操作にも「失敗」と出る (L-001)

- **推奨アクション**: 「エラー」「失敗・拒否」など拒否を含む文言に

### [Low] ToolFallback の見出しが英語「Used tool:」で日本語の印と混ざる (L-002)

- **推奨アクション**: 見出しを `labels.ts` に移して日本語に

### [Low] 密度の説明文が内部用語「Tool group」(L-003)

- **推奨アクション**: 画面で見る言葉で書く

### [Low] Hook の失敗の案内に次の操作が無い。task の失敗には案内が無い (L-004)

- **推奨アクション**: 「設定を直してセッションを起動し直す」を足す。task の失敗に呼び出しの表示を見る案内

### [Low] 「不明な状態」と「結果不明 (記録に終わりが無い)」が紛らわしい (L-005)

- **推奨アクション**: 言い方を分け、括弧の中を実行中と過去ログの両方に通じる表現に

### [Low] 監視ビューの密度の切り替えに見える見出しが無い (L-006) (scope: system)

- **推奨アクション**: 別の feature で扱う (RunningSessionList.tsx は本 PR の外)

### [Low] シェルの Background task が複数あると区別できない (L-007)

- **推奨アクション**: 秘密を出さない手がかり (コマンド名を `bashCommandName` の規則で、または番号) を検討。見送るなら O-6 に記録

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `status\|running` (専用表示 5 ファイル) | props.status 0 / 該当 5 | terminal-block.aui.tsx:50-60; code-diff.aui.tsx:84-111; todo-list.aui.tsx:44; agent-plan.aui.tsx:37; subagent.aui.tsx:174 |
| M-002 | `ToolResultMarks` | 5 (terminal-block 0) | terminal-block.aui.tsx:47-54 |
| M-003 | `TodoWrite\|ExitPlanMode\|'Write'` (*.o2.test.tsx) | 0 | SessionScreen.o2.test.tsx:191-284 |
| L-002 | `Used tool` | 1 | tool-fallback.aui.tsx:145 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 7
- Round inheritance: new 10 (R1 で未起動)
