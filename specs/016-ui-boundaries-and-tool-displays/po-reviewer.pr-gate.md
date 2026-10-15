# po-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-16T00:00:00Z
**Reviewer**: po-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Round**: 2 (pr-gate)

## 初回読了 viewpoint

- FR/SC: Round 2 で動いたのは FR-011 / US-3 AC1 / SC-003 (`tool-result-marks.tsx` と `tool-result-marks.test.tsx`) だけ。delta にある `secret-redaction.*`、`glossary.md`、AD-049 は security / architecture の担当で、E には当たらない。
- touched files に該当する charter / Confirmation: ui charter の KPI「表示網羅」(SC-003)、data-model §3 の表 (`data-model.md:125`, `:129`)。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当 (secret-redaction の delta も security が見る)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (glossary の delta も architecture が見る)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-049 の delta も architecture が見る)
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:0 Low:1
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

R1 の H-003 (実行中と承認待ちが見た目で区別できない) の修正を確かめた。中身は `ToolResultMarks` の spinner の追加と、表示 9 つすべてにかかる `describe.each` のテスト。delta の残りのファイルは私の担当外。Round 1 の Medium と Low (M-001 アイコンの ✗、M-002 / M-003 のテストの穴、L-001 V-3) は AD-050 に従って直していない。持ち越しなので、ここでは数えなおさない。

## Round 1 の指摘の扱い

- **H-003 (R1 での自分の番号は H-001): resolved**
  - `src/renderer/src/components/assistant-ui/elements/tool-result-marks.tsx:85-91` で、`state === "running"` のときだけ `data-slot="tool-result-spinner"` を出すようになった (`animate-spin ... motion-reduce:animate-none`)。承認待ち (awaiting) では出ない。`aria-busy` も running のときだけ付く (`:83`)。
  - 部品が共通なので、spinner の無かった 5 つの表示 (TerminalBlock / CodeDiff / TodoList / Subagent / AgentPlan) にも動く印が付いた。
  - テストは `tool-result-marks.test.tsx:79-97` の `describe.each(DISPLAYS)` にある。表示 9 つそれぞれで、running では spinner がある (`:85`)、awaiting では無い (`:96`) ことを確かめており、見た目の差が無くなれば検出できる。
  - 状態のアイコンを持つ表示の側も確かめた。`tool-result-state.ts:68-69` で awaiting は `requires-action` (AlertCircleIcon、動かない) になる。US-3 AC1 (`spec.md:154`) と data-model §3 (`data-model.md:125`) を満たしている。

## Findings

### [Low] 応答中に、状態のアイコンを持つ表示では spinner が 2 つ出る (L-001) (scope: feature)

- **観察**: 次の 4 つの表示は、見出しの左に `ToolFallbackStatusIcon` を置き、右端に `ToolResultMarks` を置いている。
  - `tool-fallback.aui.tsx:189` / `:754`
  - `tool-display-frame.tsx:61` / `:80` (FileTool / WebTool / TaskTool が使う)
  - `mcp-tool-call.aui.tsx:121` / `:174`
  - `ask-user-question.aui.tsx:235` / `:247`

  running のとき、前者は `tool-result-state.ts:66-67` から `LoaderIcon animate-spin` になる (`tool-fallback.aui.tsx:161`)。後者も今回の修正で spinner を出す。このため見出しの中で 2 つの spinner が回る。テスト (`tool-result-marks.test.tsx:85`) は spinner があるかどうかしか見ていないので、2 重に出ても通る。
- **同種事象探索**: `ToolFallbackStatusIcon|ToolResultMarks` を `elements/` の非 test ファイルに当てた。両方を持つファイルは 4 つ (上の path:line)。
- **リスク/影響**: 見た目が冗長になるだけで、AC1 は満たしている。機能の損失は無い。
- **推奨アクション**: 状態のアイコンを持つ表示では、`ToolResultMarks` の spinner を出さないようにする (例: `showSpinner` prop)。または状態のアイコンの側を static にする。どちらを残すかは見た目の判断に委ねる。
- **根拠**: PO-6 (UX の一貫性)
- **scope 根拠**: 本 PR の touched file の中で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-003 (R1、確認) | `tool-result-spinner\|animate-spin\|awaiting` in `elements/` | spinner の出どころは 1 箇所 | tool-result-marks.tsx:87-89、test:85, :96 |
| L-001 | `ToolFallbackStatusIcon\|ToolResultMarks` in `elements/` (非 test) | 4 ファイル | tool-fallback.aui.tsx:189/754、tool-display-frame.tsx:61/80、mcp-tool-call.aui.tsx:121/174、ask-user-question.aui.tsx:235/247 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from 1: 1 (H-003) / unresolved: 0 / new: 1 (L-001)
