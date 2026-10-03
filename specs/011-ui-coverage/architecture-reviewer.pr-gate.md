# architecture-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: architecture-reviewer (default mode + ADR-drift mode)
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 3 (HEAD a28fcf9)

## 初回読了 viewpoint

- FR/SC: FR-003、FR-006 / SC-007、FR-007、FR-008 / FR-009、FR-016
- charter / Confirmation: AD-044 Decision 1 / 3 / 4 / 6 と Confirmation、AD-028 §5、AD-035 D6、AD-020 Consequences、Constitution XII / XIII / XV、_overview.md Cross-domain invariants、session charter
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ux / a11y の発火は L-202、Tier は ui-coverage-reviewer
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

R2 の 6 件のうち 5 件解消、M-H01 (system) は延期のまま。M-101 は数え直して確認 (elements/ の 21 ファイル = auto_invoke 11 + exclude 10、重なり・漏れなし。`glob_to_re` はリテラルを正確に照合し、除外を先に判定)。ADR-drift: accepted ADR の変更 0 件。

## Round 2 inheritance

| R2 ID | 内容 | 判定 | 根拠 |
|---|---|---|---|
| M-101 | elements/** の手書きの表示が ux / a11y から外れる | resolved | reviewers.yml:48-58 / :92-102、:69-78 / :108-117。残る脆さは L-202 |
| M-102 | O-4 / O-5 の session の契約への依存 | resolved | roadmap.md:256, :257 |
| M-H01 | 版の 3 点一致の検査 (system) | deferred (持ち主の記録なし) | → M-H02 |
| L-101 | frontmatter | resolved | _overview.md:3、session/charter.md:6,17,24、isolation/charter.md:6,11 |
| L-102 | _overview の XII の行 | resolved | _overview.md:147 / :148 |
| L-103 | research.md:112 | resolved | research.md:112 |

## Findings

### [Medium] Tier A の `実装済み` の行の備考で後続に回した残りを、項目 21 の M3 の件数が数えない (M-201) (scope: feature)

- **観察**: `ui-coverage.md:104` ほか `:53`、`:60`、`:114`、`:117` (いずれも Tier A `実装済み`、備考に O-6)。`coverage.mjs:589-635` の `m3Remaining` は割当の列が `後続` の行だけを数える。凡例にもこの書き方の規定が無い
- **同種事象探索**: 5 件
- **リスク/影響**: O-6 が `後続: O-6` の行だけを書き換えると M3 達成と判定され、5 件の残りは roadmap を読み落とすと検出されない
- **推奨アクション**: 案 1: 残りを D 節の行 (Tier A `後続: O-6`) として起こす。案 2: 凡例に「Tier A の残りは D 節に行を起こす」と書く
- **根拠**: AD-044 Decision 3 / Consequences、Constitution XII

### [Medium] (H) 版の 3 点一致の検査の延期先が roadmap に無い (M-H02) (scope: system)

- **推奨アクション**: roadmap の system-scope の欄に 1 項目足す。実装は別 spec
- **根拠**: AD-028 §5

### [Low] O-6 の後続のうち session の無害化の経路を変えるものに domain 間の依存が無い (L-201) (scope: feature)

- **推奨アクション**: O-6 の行に「Hook の名前・task の手がかり・`includeHookEvents` は session の無害化の経路と query の options を変える。持ち主の確認は O-6 の design で session charter と合わせて行う」。ToolFallback の見出しの日本語化は O-3 の i18n の判断に従う、と添える
- **根拠**: ARCH-2 / ARCH-5、AD-044 Decision 6、Constitution XV

### [Low] ux / a11y の発火のリストが明示の列挙で、新しいファイルが黙って対象外になる。注記の数も古い (L-202) (scope: feature)

- **推奨アクション**: auto_invoke の 11 件を `elements/**` 1 行に置き換え (除外が先に効くので vendored 10 件は外れたまま)。`error-state.tsx` の除外の扱いを注記。`:31-32` / `:66` の数を直す
- **根拠**: Constitution XII / XIII Manual、AGENTS.md

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-201 | `\| 実装済み:…(O-[3-6]\|X-6\|I-3)` (ui-coverage.md) | 5 | docs/ui-coverage.md:53, :60, :104, :114, :117 |
| M-H02 | `\*\*Version\*\*\|last_amended\|Sync Impact` / `system-scope` | 0 / 5 (本件 0) | pr-gate.md:48; roadmap.md:128-173 |
| L-201 | `session の契約` (roadmap O-4〜O-6) | 2 (O-6 は 0) | roadmap.md:256-258 |
| L-202 | Glob `elements/**/*` / `registry の写しからの逸脱` | 21 / 3 | reviewers.yml:31-32, :46-117; error-state.tsx:17, :33, :60 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 2
- Round inheritance: resolved 5 / unresolved 1 (M-H01 → M-H02) / new 3
