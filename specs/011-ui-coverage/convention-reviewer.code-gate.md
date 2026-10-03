# convention-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: convention-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: code-gate iteration 1

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜003 / SC-001・SC-002: `scripts/ui-coverage/coverage.mjs`、`scripts/constitution/check.mjs` の項目 21、`tests/ui-coverage/{coverage,item21}.test.ts`
  - FR-006 / SC-007: `.claude/agents/ui-coverage-reviewer.md`、`reviewers.yml`、`.agents-registry.yaml`、`cl-pr-gate/SKILL.md`、`reviewer-base.md` の G 行
  - FR-007 / FR-008 / FR-009 / FR-011 / SC-003 / SC-004: `src/agents/live-tool-results.ts`、`src/domain/session/{system-event,tool-result,transcript-dto,transcript,live-message}.ts`、`features/chat/{transcript-guard,convert,labels,transcript-context}.ts`、`thread.aui.tsx`
  - FR-010: `tool-registry.aui.tsx` / `tool-args.ts`
  - FR-012 / FR-013 / SC-005: `TranscriptDensityToggle.tsx`、`stores/ui.ts`、`transcript-context.ts`
  - FR-014 / SC-006: `session-view.ts`
  - FR-015 (Principle XIV): `docs/glossary.md` と code identifier の対応
- touched files に該当する charter / Confirmation: ui charter (transcript の表示、`docs/ui-coverage.md` の維持、情報密度)。Constitution XII (項目 21) / XIII (element 優先) / XIV (glossary) / XV (`labels.ts`)。AD-044。AD-023 §7 のレイヤ行列 (eslint boundaries / depcruise)
- A. 認可 / 認証 / secret 管理: 該当なし: F owner。secret の扱いは security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: F owner。`transcript-guard.ts` の検証の正しさは security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: F owner。glossary と identifier の対応は CONV-6 として F で見た。drift は 0 件
- D. Constitution / ADR drift: 該当なし: F owner。layering は eslint boundaries / depcruise の結果 (0 violations) で受けた
- E. User Story / SC / AC / UX: 該当なし: F owner
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:5
- G. optional reviewer 範囲: 該当なし: F owner。ui-coverage-reviewer の登録は lint hookup / 配置の観点でのみ F として見た
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

O-2 の code-gate iteration 1 (diff は 2dcc694..a50aea6、73 ファイル)。新しいモジュールと reviewer の登録 3 か所の命名・配置・lint への組み込みを見た。lint-agent の JSON は `exit_code: 0` / `violations: []` なので CONV-1 からの finding は 0 件。新しいモジュールはディレクトリ指定の規則 (eslint boundaries / depcruise) に入り、実名の一覧への追加は不要。`tests/ui-coverage/**/*.test.ts` は `vitest.config.ts:47` で node project に収集される。glossary との対応は揃っている。

## Findings

### [Medium] `tests/ui-coverage/*.ts` (748 行) はどの tsconfig にも入っておらず、型検査されない (M-001) (scope: feature)

- **観察**: `tsconfig.node.json:3-11` / `tsconfig.web.json:9` の include は `tests/setup/**` だけ。新しい `coverage.test.ts` (618 行) と `item21.test.ts` (130 行) は型検査の外。Vitest は型検査せずに transpile する。`coverage.mjs` は型宣言を持たないので include を足すだけでは TS7016 になる
- **同種事象探索**: Glob `tests/**/*.test.*` で 9 件、tsconfig の外は 7 件 (新規 2 / 既存 5: tests/docs 3、tests/spec-artifacts 2)
- **リスク/影響**: SC-002 の独立した正解を担うテストが型の保証なしで保守される (X-5 code-gate convention M-005 と同じ穴)
- **推奨アクション**: `coverage.d.mts` か JSDoc + checkJs を置き、`tests/ui-coverage/**/*.ts` を型検査に入れる (tsconfig.node.json の include か `tests/tsconfig.json` + discovery の表に 1 行)。既存分は system として roadmap に記録
- **根拠**: discovery.md:144、X-5 code-gate convention M-005
- **scope 根拠**: 新しい 2 ファイルは本 feature の touched files。既存の 5 件は system

### [Medium] 実装で付けた名前が plan / data-model / tasks に戻っていない (M-002) (scope: feature)

- **観察**: plan.md:11・:20・:138・:139・:151 が旧名 `event` / `isEventPart`。data-model.md:67,71 と tasks.md:16 が `EventStatus` (実装は `SystemEventStatus`)。data-model.md:106 の `withToolResult(dto, toolUseId, block)` は実装 `withToolResult(message, result)` / `withToolResults` と違う。plan.md:184-209 の Project Structure に `live-tool-results.ts` / `transcript-guard.ts` / `transcript-context.ts` / `TranscriptDensityToggle.tsx` が無い
- **同種事象探索**: 旧名の残り 5 件 + plan の `event` の記述 5 か所 + Project Structure の欠け 4
- **リスク/影響**: 後続の grep が空振りする。design-gate R2 architecture L-102 の決定と食い違う
- **推奨アクション**: 上の各所を実装の名前に直し、Project Structure に 4 モジュールを足す
- **根拠**: CONV-6、Constitution XIV、design-gate R2 architecture L-102
- **scope 根拠**: 本 spec_dir の文書

### [Low] `scripts/ui-coverage/coverage.mjs` が 692 行で 500 行の目安を超える (L-001) (scope: feature)

- **推奨アクション**: `coverage/{dts,table,check}.mjs` に分ける (任意)
- **根拠**: CONV-3

### [Low] `coverage.mjs` の export 24 個のうち 12 個は内部でしか使われていない (L-002) (scope: feature)

- **観察**: `ROW_COLUMNS` `ELEMENT_COLUMNS` `SECTIONS` `ASSIGNMENT_SECTIONS` `TIERS` `PATHS` `ASSIGNMENT_KINDS` `GENERIC_ELEMENT` `stripComments` `typeAliasBody` `TOOL_INPUT_EXCLUDED` `splitRow`
- **推奨アクション**: `export` を外す
- **根拠**: CONV-5

### [Low] テストファイルの接尾辞が feature ID (`.o2`) (L-003) (scope: feature)

- **観察**: `ChatScreen.o2.test.tsx` / `SessionScreen.o2.test.tsx`。既存の 6 件は話題の名前 (`.monitor` / `.summary` など)
- **推奨アクション**: 中身に合わせて改名
- **根拠**: CONV-2

### [Low] `scripts/ui-coverage/` / `tests/ui-coverage/` が配置の記述に無い (L-004) (scope: feature)

- **観察**: discovery.md:328-334 の構成の図と :359、vitest.config.ts:13-14 が「tests/ は基盤の検証と違反サンプルだけ」のまま
- **推奨アクション**: 図に 2 ディレクトリを足し、`scripts/` の純関数のテストは `tests/<名前>/` に置くと 1 行足す
- **根拠**: CONV-3

### [Low] `thread.aui.tsx` に手書きの部品を足したが、緩めた lint を戻していない (L-005) (scope: feature)

- **観察**: `GENERATED_FILES` の緩和の下で戻しているのは `react-hooks/exhaustive-deps` だけ。O-2 は約 150 行の手書き部品を足した。X-5 の `thread-list.aui.tsx` は `react-hooks/refs` 等を戻している
- **推奨アクション**: `eslint.config.mjs:559-562` に `'react-hooks/refs': 'error'` と `'no-empty': 'error'` を足す
- **根拠**: CONV-5、X-5 code-gate convention M-003

### [Low] (H) lint-agent の JSON に `commands[]` が無い (L-006) (scope: system)

- **推奨アクション**: lint-agent の出力に `commands[]: [{command, exit_code}]` を含める (lint-agent の定義の側)
- **根拠**: CONV-1 の入力の契約

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | Glob `tests/**/*.test.*` と tsconfig の include の突き合わせ | 7 (新規 2) | tests/ui-coverage/*.test.ts ほか |
| M-002 | `isEventPart\|EventStatus\|withToolResult\(dto` | 5 (+5 / +4) | plan.md:11,20,138,139,151; data-model.md:67,71,106; tasks.md:16; plan.md:184-209 |
| L-001 | 500 行超の新しいファイル | 2 | coverage.mjs (692), coverage.test.ts (618) |
| L-002 | 内部だけの export | 12 名 / 33 件 | coverage.mjs |
| L-003 | Glob `src/**/*.*.test.{ts,tsx}` | 8 (feature ID 2) | *.o2.test.tsx |
| L-004 | `ui-coverage` in docs/discovery.md | 2 (図に 0) | docs/discovery.md:146,560 |
| L-005 | `aui\.tsx` in eslint.config.mjs | 3 ブロック | eslint.config.mjs:559,567,578-584 |
| L-006 | — | 該当なし | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 6

<details><summary>lint-agent の出力 (受け取った JSON)</summary>

```
{"exit_code":0,"violations":[],"violation_count_by_severity":{"error":0,"warning":0,"info":0},"detectors":["eslint (321 files, 0 messages)","tsc node/web/e2e/perf (0 diagnostics)","dependency-cruiser (0 violations, 331 modules / 1530 deps)","check:constitution (ok 20 / violation 0 / not-applicable 1 = #5 by design; #21 ok)"]}
```

</details>
