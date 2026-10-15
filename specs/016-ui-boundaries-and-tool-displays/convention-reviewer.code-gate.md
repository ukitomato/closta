# convention-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-16
**Reviewer**: convention-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Round**: code-gate iter 5 (pr-gate R1 の修正後の再実行)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-018、SC-001〜SC-005。F に関係するのは FR-010 / FR-013 / FR-017 / FR-018、tasks SH-012、BE-001。
- touched files に該当する charter / Confirmation: ui charter scope、Constitution Principle XIII / XV (AD-045)、discovery の lint 表。
- A. 認可 / 認証 / secret 管理: 該当なし: F 担当外 (security-reviewer の範囲)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: F 担当外 (security-reviewer の範囲)
- C. 業務不変条件 / Charter drift: 該当なし: F 担当外 (architecture-reviewer の範囲)
- D. Constitution / ADR drift: 該当なし: F 担当外 (architecture-reviewer の範囲)
- E. User Story / SC / AC / UX: 該当なし: F 担当外 (po-reviewer の範囲)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:3
- G. optional reviewer 範囲: 該当なし: F 担当外 (optional reviewer の範囲)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

iter 4 からの変更は pr-gate R1 の H-001 / H-002 / H-003 の修正 (`pr-gate.md.round1.implementer.json`)。`secret-redaction.ts` は JWT を正規表現から `redactJwt` (前から 1 回走査する関数) に置き換え、JWT の境界を `B` と同じ `(^|[^A-Za-z0-9])` に戻した。mysql の接頭辞は 256 文字に上限をつけた。`tool-result-marks.tsx` には実行中だけのスピナーを足した。`docs/glossary.md` の Hook の反例を例外として書き直した。

- CONV-1: lint-agent の JSON は `exit_code` 0、`violations` 0 件。commands 5 本 (eslint / tsc node / tsc web / depcruise 451 modules / check:constitution) はすべて 0。非ゼロ exit の Critical なし。`eslint-disable` が `thread.aui.tsx:381` に既存 (`react-hooks/incompatible-library`) だが、今回の diff で増えたものではない。
- iter 4 の M-002 (data-model と JWT の境界の食い違い) は解消した。
  - `data-model.md:40` と `:51` は「境界 `B` は `(^|[^A-Za-z0-9])`」「正規表現ではなく前から 1 回走査する関数」と書いている。
  - `secret-redaction.ts:5` のヘッダも `B` と同じ。`redactJwt` の docstring (`:54-59`) が走査にした理由を持つ。実装は、境界が `isAlnum(s.charCodeAt(i - 1))` で `B` と一致する (`:67`)。
  - `secret-redaction.test.ts:77-83` が `foo-` / `x_` の直後の JWT は伏せ、`ab` の直後は伏せないことを固定している。
- iter 4 で未確認だった H 観点も埋まった。`secret-redaction.test.ts:123-138` の計算量テストに `eyJ` + `-` 20 万個と `-eyJaaaaaaaa` の繰り返しが入っている。
- 新規の命名・配置の問題なし。`redactJwt` / `isB64Url` / `isAlnum` / `runEnd` は同ファイル内に閉じ、`redactSecrets` だけが export。import を持たない純関数の方針 (BE-001) を保っている。
- 500 行超のファイルは iter 4 と同じ 6 件で、増加なし。

<details><summary>lint-agent の出力 (要約)</summary>

exit_code: 0、violations: []
commands: eslint (76 touched) 0 / tsc node 0 / tsc web 0 / depcruise 0 (no violations, 451 modules) / check:constitution 0 (ok 20、違反 0、検査対象なし 1)
notes: 既存の eslint-disable `thread.aui.tsx:381` `react-hooks/incompatible-library`。eslint 対象外は reviewers.yml、docs/*.md、specs/*/data-model.md、tests/rule-fixtures/**。
</details>

## Findings

### [Medium] M-001: 500 行を超えるファイルが残っている (iter 4 M-001 の継続。増加なし) (scope: feature)

`thread.aui.tsx` 1395、`live-signals.ts` 826、`tool-fallback.aui.tsx` 820、`running-session-store.ts` 790、`sdk-agent-session.ts` 752、`LivePane.tsx` 501。AD-050 により棚卸しで扱う。

### [Medium] M-002 (H 観点): 手書き element の登録漏れを検出する仕組みが無い (iter 4 M-003 の継続) (scope: feature)

`Grep "TOOL_DISPLAY_LABELS|registry" src/renderer/**/tool-registry.aui.test.tsx` では個別の登録の確認はあるが、SDK の emit する tool 名との網羅の照合は無いまま。AD-050 により棚卸しで扱う。

### [Low] L-001: 新規ファイル間で import の順序が揃っていない

`file-tool.aui.tsx:3-17` は `react` → `lucide-react` → `@assistant-ui/react` → `@/…` → `./…` → `@/lib/utils` の順で、`@/lib/utils` が相対 import の後ろに来る。`tool-display-frame.tsx` も同様。iter 1 から継続。

### [Low] L-002: 別モジュールに同名で意味の違う関数がある

`truncateCodePoints` (`tool-display.ts:21` / `session-view.ts:189`)、`oneLine` (`tool-display.ts:30` / `system-event.ts:36`)。iter 1 から継続。

### [Low] L-003: テスト以外から参照されない export がある

`HOST_MAX`、`TREE_LINE_MAX`、`TREE_ITEM_MAX`、`HEADING_MAX`、`taskStatusOf`。iter 1 から継続。今回の diff で増えていない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | scope の非テストファイルで 500 行超を数える | 6 | `thread.aui.tsx:1395` ほか |
| M-002 | 手書き element の網羅を検査するテスト | 0 | - |

(Critical なし。iter 4 の M-002 を `Grep "境界|JWT|eyJ" data-model.md` で再確認し、食い違い 0 件)

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 3
- Round inheritance (iter 4 から): resolved 1 (JWT の境界の食い違い) / unresolved 5 (M-001, M-002 (旧 M-003), L-001〜L-003) / new 0
