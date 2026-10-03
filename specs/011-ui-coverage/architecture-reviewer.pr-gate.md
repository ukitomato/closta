# architecture-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: architecture-reviewer (default mode + ADR-drift mode)
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-007。R1 の修正が触れたもの: FR-003、FR-006、FR-007、FR-016
- charter / Confirmation: Constitution XII / XIII / 改定手順・方針表 / Sync Impact Report、AD-044 Decision 1〜4 と Confirmation、ui charter KPI、`_overview.md` Cross-domain invariants、session / isolation charter、roadmap M3 / X-6 / I-3
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:3
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (申し送り: `tool-result-marks.tsx` は手書きだが strictness を戻すリストに無い)
- G. optional reviewer 範囲: 該当なし: Tier は ui-coverage-reviewer。ux / a11y の発火の残りは M-101
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

R1 の 9 件のうち 8 件が解消、1 件 (H の Medium) が一部残り。数字の突き合わせ: Sync Impact Report の行数は対応表と一致 (6 列の行 144)、`後続` の件数と M3 の残り 24 は行の数え直しと一致 (A 節 11 + C 節 11 + E 節 2)、O-4〜O-6 の範囲は `後続` の行をすべて覆う。Tier を A に変えた行は AD-044 Decision 2 / AD-019 に沿う。ToolFallback だけの `実装済み` はすべて Tier B。ADR-drift: accepted ADR の決定の書き換え 0 件。

## Round 1 inheritance

| R1 ID | 内容 | 判定 | 根拠 |
|---|---|---|---|
| H-001 | ux / a11y が chat / session 画面で起動しない | resolved | reviewers.yml:42-45 / :62-65、承認の注記 :39-41。残りは M-101 |
| M-001 | XII の Statement | resolved | constitution.md:755、Modified sections :23 |
| M-002 | 末尾の版表示 / XIII amended | resolved | constitution.md:1050 / :800 |
| M-003 | cross-domain 不変条件 | resolved | _overview.md:147-150、session :163、isolation :133、roadmap :234 / :277 |
| M-004 | ui-coverage-reviewer の発火条件 | resolved | reviewers.yml:123-125 |
| (H) Medium | 再発を捕まえる仕組み | 一部解消 | 版の 3 点一致の検査は無いまま → M-H01 |
| L-001 | `LOWER_BOUNDS` | resolved | ui-coverage.md:31 (手順で更新) |
| L-002 | glossary の「後続」 | resolved | glossary.md:915 / :918 |
| L-003 | ui charter frontmatter | resolved | ui/charter.md:6, :14, :19, :120 |

## Findings

### [Medium] 後続 (O-4〜O-6) の手書きの表示は `components/assistant-ui/elements/**` にあり、ux / a11y の発火条件から「vendored」として外れたまま (M-101) (scope: feature)

- **観察**: `reviewers.yml:49-54` / `:69-71` は elements/** を除外 (「registry の複製 14 files」)。実際は手書きの表示が並ぶ (`eslint.config.mjs:579-589` の 6 ファイル、`thread.aui.tsx`、`tool-result-marks.tsx`)。O-4〜O-6 の表示は elements/** の `.aui.tsx` と `features/chat/*.ts` だけで完結しうるので、その PR で ux / a11y が起動しない
- **同種事象探索**: 手書き宣言 9 件 + 2 (tool-result-marks / surfaces)
- **リスク/影響**: M3 の残り 24 行を実装済みにする PR で XII / XIII の Manual の検証が当たらない
- **推奨アクション**: 手書きのファイルを ux / a11y の `auto_invoke_patterns` に明示で足し、`exclude_patterns` を CLI 生成物の列挙に狭める。「14 files」の注記を直す。代替: O-4〜O-6 の roadmap の行に「pr-gate で ux / a11y を明示的に起動する」
- **根拠**: Constitution XII / XIII Verification (Manual)、AGENTS.md、eslint.config.mjs:543-547

### [Medium] O-4 / O-5 (domain `ui`) の範囲は session の契約を変える必要があるのに、domain 間の依存が書かれていない (M-102) (scope: feature)

- **観察**: O-4 の失敗の理由は `session-core.ts:326-341` の `ResultTermination` (`complete | provider-error`。X-1 FR-030、security-relevant) を広げる必要がある。O-5 の AskUserQuestion / Elicitation は応答を session の control 経路で返す。O-4 / O-5 の依存は O-2 だけ
- **推奨アクション**: roadmap の O-4 に「`ResultTermination` / 失敗の理由キーを広げる (session の契約。FR-030 を保つ)」、O-5 に「応答の control 経路 (session)」。session charter か `_overview.md` の帰属の根拠に書く。持ち主が決まらなければ O-4 着手時に人間に諮る
- **根拠**: ARCH-2、AD-028 §5、session charter

### [Medium] (H) 版の 3 点一致を機械で捕まえる仕組みが無い (M-H01) (scope: system)

- **推奨アクション**: 別 spec で check.mjs に項目を足す (frontmatter / trail の最後の行 / 末尾の `**Version**`)。本 PR では対処しない

### [Low] `_overview.md` / session / isolation charter の frontmatter が追随していない (L-101)

- **推奨アクション**: 日付を 2026-10-03 に、session に AD-044 / 011、isolation に AD-044 を足す

### [Low] `_overview.md` の XII の行の domain に「SDK の版を上げる PR はすべての domain」が入っていない (L-102)

- **推奨アクション**: 行を分ける (`後続` の書き換えは ui / session / isolation、SDK の版は「すべて」)

### [Low] research.md:112 の M3 の完了の条件が AD-044 Decision 3 より前の字面 (L-103)

- **推奨アクション**: Decision 3 の字面に直す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | 手書き宣言 (eslint.config.mjs) / Glob elements | 9 + 2 | eslint.config.mjs:561, :571, :583-588; reviewers.yml:49-54, :69-71 |
| M-102 | `失敗の理由\|理由キー\|provider-error\|classifyResult` (docs/domains / src) | 0 / 10 | session-core.ts:326-341; roadmap.md:256-257; _overview.md:96-97 |
| M-H01 | `\*\*Version\*\*\|last_amended\|Sync Impact` (check.mjs) | 0 | scripts/constitution/check.mjs |
| L-101 | frontmatter (docs/domains) | 3 ファイル | _overview.md:3; session/charter.md:6-22; isolation/charter.md:6-11 |
| L-102 | `domain を問わず` | 3 | _overview.md:147; constitution.md:781; 0044:100 |
| L-103 | `M3 の完了の条件` (specs/011) | 1 | research.md:112 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
- Round inheritance: resolved 8 / unresolved 1 (M-H01) / new 5
