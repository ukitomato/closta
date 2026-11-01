# convention-reviewer Review: 権限モードの Auto (起動と実行中) (026)

**Run**: 2026-11-01
**Reviewer**: convention-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: iter 3 (code-gate)

> iter 3: iter 2 からの差分は `tests/ui-coverage/item21.test.ts:114` の beforeAll に `120_000` を足しただけ。同ファイル :142 の `it` と同じ形で、`vitest.config.ts` は `hookTimeout` を持たないので個別指定が既存の流儀に合う。scope 77 (lint 対象 58)。lint 5 コマンドすべて exit 0、prettier warning 63 件 (iter 2 と同数)。指摘は iter 2 と同じ M-001 / L-001 / L-002 (resolved 0 / unresolved 3 / new 0)。

## 初回読了 viewpoint

- FR/SC: F 観点で見たのは FR-001〜003・FR-006 (値の集合と判定点の命名)、FR-004 / SC-002 (項目 16 と rule fixture の命名・登録)、FR-008 (帯の命名)、FR-011 (glossary)。
- touched files に該当する charter / Confirmation: session charter。plan の「レイヤごとの変更」表が配置と命名の正本。depcruise は exit 0 (575 modules)。
- lint-agent の JSON は受領した。`exit_code` は 0 で、5 コマンドとも 0。warning は 65 件 (prettier/prettier 63、e2e の ignored-file notice 2。AD-038 D2 で e2e は eslint 対象外)。非ゼロ exit による Critical は 0 件。
- iter 1 からの差分 (pr-gate round 1 の fix): 項目 16 のバッククォート形、fixture の新設と `expected.mjs` 登録、`UNDETECTED_NOTES` の mitigatedBy、LaunchDialog のテスト追加、`quickstart-results.md` の新設。
- A. 認可 / 認証 / secret 管理: 該当なし: F owner の範囲外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: F owner の範囲外
- C. 業務不変条件 / Charter drift: 該当なし: F owner の範囲外
- D. Constitution / ADR drift: 該当なし: F owner の範囲外 (`check:constitution` は ok 20 / 違反 0)
- E. User Story / SC / AC / UX: 該当なし: F owner の範囲外
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:2
- G. optional reviewer 範囲: 該当なし: F owner の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

scope は 59 ファイル (lint 対象)。新設 fixture の命名は既存と一致し、`expected.mjs:337-338` に登録済み。旧名 `assertSafePermissionMode` の残存は 0 件。`allowlists.mjs:575` は fixture の import と一致する。`check.mjs:915-927` の追加は既存構造に沿う。

## Findings

### [Medium] prettier/prettier の整形警告が 63 件ある (M-001) (scope: feature)
- **観察**: lint-agent JSON のとおり (内訳は lint-agent.code-gate.md)。iter 1 は 62 件、今回 63 件 (LaunchDialog.test.tsx +1)。error は 0。`quickstart-results.md:14` の「warning 75」は古い数字。
- **同種事象探索**: prettier/prettier 63 件。
- **推奨アクション**: 棚卸しで `prettier --write`。AD-050 により gate では直さない。
- **根拠**: CONV-1、AD-050。

### [Low] `.vitest/` が untracked のままで `.gitignore` に無い (L-001) (scope: feature)
- **観察**: `?? .vitest/`。iter 1 の L-001 が未解決。
- **同種事象探索**: 1 件。

### [Low] 500 行超のファイルが 13 本ある (今回新たに超えたものは 0) (L-002) (scope: feature)
- **同種事象探索**: 新たに超えたファイルは 0 件。

## H の根拠

バッククォート形の検査に対し `b-equivalent/sdk-permission-mode-template-literal.ts.fixture` が `rules: ['#16']` で登録されている。fixture の照合は pr-gate / CI に委ねる (test:rules は agent が実行しない)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | lint-agent JSON の prettier/prettier | 63 | lint-agent.code-gate.md |
| L-001 | `git status --short .vitest .gitignore` | 1 | `.vitest/` (untracked) |
| L-002 | HEAD 比で 500 行を新たに超えたファイル | 0 | 13 本は既存の超過 |

## lint-agent 結果 (CONV-1)

eslint / tsc (node, web) / depcruise / check:constitution すべて exit 0。詳細は `lint-agent.code-gate.md`。

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 2
- Round inheritance: resolved: 1 / unresolved: 3 / new: 0
