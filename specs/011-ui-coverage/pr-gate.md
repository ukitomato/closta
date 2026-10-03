# PR Gate Round 2: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Base**: main (merge-base 2dcc694)
**Diff stat**: +8588 -224 over 101 files (HEAD 57fcc0b)
**Reviewers**: security, architecture, po, ux, a11y, platform-boundary, ui-coverage (7 本。ux / a11y は reviewers.yml の修正で今回から起動)
**起動しなかった reviewer**: database-reviewer (auto_invoke_patterns に一致する変更ファイルが無い)
**Rule verification**: 実行せず — Round 1 以降、規則定義 (`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/**` / `tests/rule-fixtures/**` / `scripts/rules/**`) の変更 0 件。Round 1 の実行は exit 0
**Round inheritance**: Round 1 (Critical 0, High 5) を引継ぎ

## Verdict

| Severity | This round | Resolved from 1 | New in 2 | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High | 2 | 5 | 2 | 2 | 0 |
| Medium | 13 | 10 | 13 | 13 | 0 |
| Low | 22 | 12 | 22 | 22 | 0 |

**Status**: PASS (Critical=0)
**Next**: /cl-done は可能。High 2 件 (a11y) は小さく直せる

## Round 1 の High の行方

| R1 | 判定 |
|---|---|
| H-1 ux / a11y の配線 (architecture H-001) | resolved (残りの漏れは architecture M-101 = elements/** の手書き部分) |
| H-2 エラー・切り詰めが Bash だけ (po H-001) | resolved (Terminal block だけ文字の印が無い = ux M-002 / po L-002 / a11y L-002) |
| H-3 `result` の失敗の理由 (ui-coverage H-001) | resolved |
| H-4 `informational` / `conversation_reset` の Tier (ui-coverage H-002) | resolved |
| H-5 Task* の Tier (ui-coverage H-003) | resolved |

## High (Round 2)

| ID | 出所 | 内容 | 推奨 |
|---|---|---|---|
| H-6 | a11y H-001 | 「（切り詰め）」が `text-muted-foreground` + `opacity-70` でコントラスト 2.8:1 (light) / 3.9:1 (dark)。WCAG 1.4.3 | `opacity-70` を外す (既存トークンで 4.8:1)。terminal-block も |
| H-7 | a11y H-002 | 密度の切り替えの選択中が背景の淡い差 (≈1.1:1) だけ。WCAG 1.4.1 / 1.4.11 | `aria-pressed:font-semibold` など (先例 `SessionListScreen.tsx:645`) |

## 主な Medium

- ux M-001: tool の表示で結果待ち / 成功 / 結果不明の区別が無い (結果不明はシステムイベントの行にはある)
- ux M-002 / po L-002 / a11y L-002: Terminal block だけ失敗が文字でなくアイコン
- ux M-003 / ui-coverage L-102 / po H: TodoList / AgentPlan / Write の印のテストが無い
- a11y M-001〜M-003: 名前の `/80` のコントラスト、切り詰めた名前の全文、行の書き換えの読み上げ
- architecture M-101: elements/** の手書きの表示が ux / a11y の発火から外れる (O-4〜O-6 で漏れる)
- architecture M-102: O-4 / O-5 が session の契約 (`ResultTermination`・control 経路) を変える依存が未記載
- architecture M-H01 (system): Constitution の版の 3 点一致の検査が無い

## Track raw outputs

- [security-reviewer.pr-gate.round2.md](security-reviewer.pr-gate.round2.md) — C0 H0 M0 L2 (R1 の 4 件 resolved)
- [architecture-reviewer.pr-gate.round2.md](architecture-reviewer.pr-gate.round2.md) — C0 H0 M3 L3 (R1 の 8 件 resolved)
- [po-reviewer.pr-gate.round2.md](po-reviewer.pr-gate.round2.md) — C0 H0 M0 L4 (R1 の 6 件 resolved)
- [ux-reviewer.pr-gate.round2.md](ux-reviewer.pr-gate.round2.md) — C0 H0 M3 L7 (初回)
- [a11y-reviewer.pr-gate.round2.md](a11y-reviewer.pr-gate.round2.md) — C0 H2 M4 L3 (初回)
- [platform-boundary-reviewer.pr-gate.round2.md](platform-boundary-reviewer.pr-gate.round2.md) — C0 H0 M0 L0
- [ui-coverage-reviewer.pr-gate.round2.md](ui-coverage-reviewer.pr-gate.round2.md) — C0 H0 M0 L2 (R1 の 10 件 resolved)
