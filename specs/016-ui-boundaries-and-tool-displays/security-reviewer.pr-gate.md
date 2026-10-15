# security-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-16
**Reviewer**: security-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-004 / FR-006 / FR-007 (伏せ字: `redactSecrets`)、FR-009 / FR-010 / FR-012 / FR-018 (Round 1 から変わっていない)、SC-001 / SC-002 / SC-005
- touched files に該当する charter / Confirmation: AD-049 Decision 3-6 と Confirmation (伏せ字の fixture と計算量)、data-model §1「伏せ字」の「計算量」、ui charter の CSP の基線 (main / preload に差分は無い)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

Round 2 の delta: `src/domain/session/secret-redaction.ts` とテスト、`tool-result-marks.tsx` とテスト、docs (AD-049 / glossary / spec / tasks / data-model)。main・preload・`ipcMain`・`BrowserWindow`・`spawn` に差分は無い。SEC-2 / SEC-3 / SEC-5 / SEC-7 の攻撃面は Round 1 と同じ。

`tool-result-marks.tsx` が増やしたのは状態の印だけ。文言は `TOOL_RESULT_LABELS` の固定文言、`data-state` には列挙値の `ToolResultState` が入る。会話由来の文字列は入らない。`ToolErrorResult` は plain text のまま。

## Round 1 の指摘の扱い

- **H-001 (`redactSecrets` の O(n²) の正規表現): 解消**
  - JWT は正規表現をやめ、`redactJwt` (`secret-redaction.ts:60-91`) で前から 1 回だけ走査する。失敗した開始点では同じ区間の終わり `e1` まで読み飛ばす (区間内の別の開始点も必ず失敗するので正しい)。各文字は高々 2-3 回しか読まれず線形。境界判定と一致範囲は元の正規表現と同じ
  - mysql の項は `[^\n]{0,256}?` に上限 (`secret-redaction.ts:138`)
  - 残りの正規表現 (PEM・userinfo・クエリ・webhook・Authorization・Cookie・Bearer・Basic・ASSIGNMENT・フラグ・KNOWN_TOKEN) は、開始点がリテラルで互いに素 / 量指定子の区間が成功すれば消費 / 区間に上限、のいずれかに当てはまり、多重読みは起きない
  - `secret-redaction.ts:97` の ASSIGNMENT も名前の前の英数字を消費しない形に変更
  - テスト `secret-redaction.test.ts:123-138` が 200 KB の敵対的入力 7 つを 500 ms 以内で固定。Round 1 で示した `'-eyJaaaaaaaa'.repeat(16_000)` と `'mysql '.repeat(33_000)` を含む
- **M-001 (200 KB のテストが無い): 解消** (同じテストで閉じた)
- L-001 / L-002: Low なので AD-050 に従い扱わない (変更なし)

## Findings

### [Low] 計算量の上限の記述が 4 KB のまま残っている (L-003) (scope: feature)

- **観察**: `src/domain/session/secret-redaction.ts:6` の docstring は「4 KB の敵対的な入力でも線形に近い」のまま。正本 `specs/016-ui-boundaries-and-tool-displays/data-model.md:55` も「4 KB … 50 ms」だけ
- **推奨アクション**: 両方を「200 KB を 500 ms 以内 (`sanitizeBody` の既定の上限)」に揃え、JWT の項が関数であることも書き添える
- **根拠**: data-model §1「伏せ字」の「計算量」

### [Low] H: 伏せ字の処理時間を見る観測点が無い (L-004) (scope: feature)

- **観察**: 計算量はテストで固定された (`secret-redaction.test.ts:123-138`) が、実描画で遅くなっても捉えるログ・測定値は無い
- **回帰の根拠**: 既存 fixture `secret-redaction.test.ts:9-106`、既知トークン集合の一致 `:90-106`、状態の印 `tool-result-marks.test.tsx:80-126`
- **推奨アクション**: 今は不要。表示が遅いという報告が出たときに足す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 (Round 1、解消の確認) | `redactSecrets\(` (src、test を除く) | 5 | tool-display.ts:36、:222、:223、system-event.ts:55、transcript.ts:219 |
| L-003 | `計算量\|200 KB\|4 KB` (data-model.md) | 1 | data-model.md:55 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2 (新規。Round 1 の L-001 / L-002 は持ち越し)
- Round inheritance: resolved 2 (H-001 / M-001) / unresolved 0 (Critical / High) / new 2 (L-003 / L-004)
