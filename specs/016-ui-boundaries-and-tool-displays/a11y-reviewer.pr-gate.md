# a11y-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-16
**Reviewer**: a11y-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Round**: 2 (pr-gate)

## 初回読了 viewpoint

- FR/SC (a11y に関わるもの): Round 1 と同じ。FR-001〜004、FR-006〜009、FR-011〜013、SC-003。Round 2 の差分で直接触れるのは FR-011 (結果待ち・結果不明の印) と SC-003 の contrast・motion。
- charter / Confirmation: ui charter「業務不変条件」(VIII 日本語、XIII 新しいトークンを増やさない)、AD-046 (vitest-axe)、AD-045 (labels.ts)。色トークンは `src/renderer/src/assets/main.css:98` / `:137`。AD-050 により Medium / Low は gate で直さない。
- Round 2 で読んだ UI ファイル (変更分): `tool-result-marks.tsx` (全文)、`tool-result-marks.test.tsx` (全文)
- 変更分と関係する呼び出し側: `tool-display-frame.tsx:56-88`、`terminal-block.aui.tsx:43`、`code-diff.aui.tsx:112-122`、`todo-list.aui.tsx:42-54`、`agent-plan.aui.tsx:47-57`、`subagent.aui.tsx:189-205`、`ask-user-question.aui.tsx:234-254`、`mcp-tool-call.aui.tsx:174-181`
- `secret-redaction.ts` と `docs/` / `spec` 系の変更は a11y の範囲外 (UI 変更なし)。
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: a11y-reviewer の担当外 (po-reviewer)
- F. 命名 / module / lint hookup: 該当なし: a11y-reviewer の担当外 (convention-reviewer)
- G. optional reviewer 範囲 (WCAG 2.1 AA): Critical:0 High:0 Medium:0 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

Round 2 の delta のうち UI は `tool-result-marks.tsx` と `tool-result-marks.test.tsx` の 2 ファイルだけ。差分は (1) 結果待ちの印に動く spinner を追加 (`tool-result-marks.tsx:85-91`)、(2) 切り詰めの印から透明度を外した (`:100-103`)、(3) 状態の印を全 9 種の表示で固定するテストを追加。

新規の Critical / High / Medium は無い。Round 1 の状況: L-001 は marks の spinner では `motion-reduce:animate-none` 対応 (`:89`)、ToolFallback の `ToolFallbackStatusIcon` は未対応のまま (`tool-fallback.aui.tsx:161`)。M-001 / L-002〜L-006 は変更なし。

## Findings

### [Low] reduced-motion では「応答中」と「承認待ち」の差が静的な半環の有無だけになり、`aria-busy` も効かない (L-101) (scope: feature)

- **観察**: `tool-result-marks.tsx:85-91` の spinner は reduced-motion で静的な半環になる。区別手段はこの半環と `aria-busy` (`:83`) だけ。文言は running / awaiting とも「結果待ち」 (`:36-38`)。`aria-busy` が支援技術に効かないことは Round 1 L-002 で既出。
- **同種事象探索**: `data-slot="tool-result-spinner"` を renderer で検索 → 非テストは `tool-result-marks.tsx:87` の 1 件。
- **リスク/影響**: reduced-motion のスクリーンリーダー利用者に区別が伝わらない。ただし承認待ちは承認カードが別に示し、応答中は Composer の状態でも分かる。実害は小さい。
- **推奨アクション**: running と awaiting で文言を分ける、または visually-hidden の補足を足す。AD-050 により gate では直さない。
- **根拠**: WCAG 1.3.3
- **scope 根拠**: feature

### [Low] spinner の `motion-reduce:animate-none` を固定するテストが無い (L-102) (H 区分 / scope: feature)

- **観察**: `tool-result-marks.test.tsx:80-89` は spinner の存在と `aria-busy` を固定しているが、`motion-reduce:animate-none` の class を確認していない。class が落ちても全テストが通る。
- **同種事象探索**: `motion-reduce` を `*.test.tsx` で検索 → 0 件。
- **リスク/影響**: reduced-motion 対応の回帰が無検知。
- **推奨アクション**: `expect(spinner).toHaveClass('motion-reduce:animate-none')` を 1 行足す。
- **根拠**: WCAG 2.3.3 / 2.2.2 の趣旨
- **scope 根拠**: feature

### Round 2 で確認済みの点 (指摘なし)

- contrast (A11Y-4): marks は `text-muted-foreground` の親から色を継承 (light 4.83:1、`main.css:98`)。切り詰めの印は透明度なしで 4.5:1 を保つ。`Badge destructive` は light で約 4.5:1 とギリギリ、実機確認は V-3 任せ。
- 色だけに頼らない: 状態は `TOOL_RESULT_LABELS` の文言を持つ。spinner は `aria-hidden`。
- Semantic: interactive 要素を増やしていない。
- axe: `tool-result-marks.test.tsx:118-122` が 9 種の表示で違反 0 を固定。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 | `data-slot="tool-result-spinner"` (renderer 非テスト) | 1 | `tool-result-marks.tsx:87` |
| L-102 | `motion-reduce` (`*.test.tsx`) | 0 | (該当なし) |
| (参考 R1 L-001) | `animate-spin` (tool-fallback.aui.tsx) | 1 | `tool-fallback.aui.tsx:161` |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2 (新規。L-101、L-102)
- Round inheritance: resolved from N-1: 1 (L-001 の marks 側) / unresolved: 6 (M-001、L-001 の ToolFallback 側、L-002〜L-006。AD-050 により gate では直さない) / new: 2
