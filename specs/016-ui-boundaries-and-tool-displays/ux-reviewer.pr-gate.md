# ux-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-16
**Reviewer**: ux-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Round**: 2 (pr-gate)

## 初回読了 viewpoint

- FR/SC (UX に関わるもの): FR-001〜FR-005、FR-006〜FR-010、FR-011〜FR-013、SC-001〜SC-003
- charter / Confirmation: ui charter「Claude Code が emit する情報のすべてに専用表示を与え、日本語で破綻しない」。AD-045 (文言は `labels.ts`)。AD-049
- Round 2 の delta のうち UX 観点で読んだのは `tool-result-marks.tsx` / `tool-result-marks.test.tsx` / `secret-redaction.ts` (利用者に見える伏せ字の挙動だけ)。spec / data-model / tasks / ADR-0049 / glossary の差分は文書で該当なし
- Round 1 の Medium 2 件 / Low 7 件はコード未変更。AD-050 により gate では直さない。再掲しない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (ux): Critical:0 High:0 Medium:0 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

新しい Critical / High になる観察事実は無かった。

- loading state (UX-3): 結果待ちの spinner は `aria-hidden` + `motion-reduce:animate-none` (`tool-result-marks.tsx:85-91`)。承認待ちは `aria-busy` も spinner も出さない (`:83`)。切り詰めの印から透明度を外した (`:101-102`)
- error state (UX-2): エラーの Badge と `ToolErrorResult` は結果が空・text でないとき何も描かない (`:124`)。その場合の文言は `tool-display-frame.tsx` 側 (Round 1 で確認済み)
- 一貫性 (UX-9): `tool-result-marks.test.tsx:49-70` が 9 表示すべてで結果待ち / 承認待ち / 結果不明の 3 経路 / 結果は別に表示 / axe 違反 0 を検査
- 伏せ字の見え方: 当たった部分だけを `•••` にし行全体は消さない (`secret-redaction.ts:9-10`)。伏せすぎは U-3 で受け入れ済み (`:8`)

## Findings

### [Low] 伏せ字で一部が `•••` になったとき、利用者に「伏せた」と分かる説明が無い (L-001) (scope: feature)

- **観察**: `redactSecrets` は `•••` に置き換えるだけで注記・`title`・ラベルを付けない (`secret-redaction.ts:11`, `:102-143`)。renderer 側にも注記は無い。例えば `password: is required` は `password: •••  required` のようになり、意味が崩れても理由が読めない
- **同種事象探索**: `伏せ字|•••` を `src/renderer` で検索 → 実装側の説明の文言は 0 件 (コメントとテストの期待値のみ: `file-tool.aui.tsx:24`, `tool-display.ts:34`, `web-tool.aui.test.tsx:73` ほか)
- **リスク/影響**: 伏せすぎが起きたとき、情報が欠けたのか元から `•••` なのか区別できない。判断は spec で承認済みで、害は読みにくさに限られる
- **推奨アクション**: コード変更は不要。M3 の棚卸しで、必要なら短い補足 (ツールチップ等) を足すか決める
- **根拠**: UX-2。U-3 は承認済みのため Low
- **scope 根拠**: feature の touched files

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `伏せ字\|•••` (src/renderer) | 実装側 0 件、コメントとテスト約 13 件 | file-tool.aui.tsx:24, tool-display.ts:34, web-tool.aui.test.tsx:73 ほか |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from N-1: 0 / unresolved: 9 (Medium 2 / Low 7。AD-050 により gate では直さない) / new: 1 (Low)
