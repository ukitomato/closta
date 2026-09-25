# Specification Quality Checklist: Tier A tool 表示 (R-4)

**Purpose**: planning に進む前に spec の完全性と品質を検証する
**Created**: 2026-09-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] 実装詳細に寄りすぎていない (WHAT / WHY 中心。HOW は plan/tasks へ)
- [x] ユーザ価値とビジネスニーズに焦点 (M1「読める」の判断材料の提示 / tool 表示の見栄え評価)
- [x] 非技術ステークホルダにも読める記述
- [x] 必須セクションがすべて埋まっている

## Requirement Completeness

- [x] `[NEEDS CLARIFICATION]` が残っていない (subagent 入れ子の範囲 = targets は AskUserQuestion で確定)
- [x] 要件がテスト可能で曖昧でない (各 FR に検証経路が対応)
- [x] Success Criteria が計測可能 (SC-001〜SC-010 に計測経路を明記)
- [x] Success Criteria が技術非依存 (element / registry 名を SC に書かない)
- [x] Acceptance Scenarios がすべて定義されている (US-1〜US-3)
- [x] Edge cases を特定 (壊れた args / 未応答 / 孤児 / 多段 subagent / 巨大出力 / 未対応 tool / 敵対的内容)
- [x] スコープが明確 (Tier A 完全化 O-2 / composer X-2 / live X-1 / 密度 O-1 / File 表示 O-2 を除外)
- [x] 依存と前提を特定 (R-3 継承 / R-3 実機一次判断の前提 / 参照 ADR / Assumptions)

## Feature Readiness

- [x] 各 FR に明確な受け入れ基準がある
- [x] User Scenario が主要フローを網羅 (専用表示 / subagent 入れ子 / 堅牢性)
- [x] Success Criteria の計測可能な成果を満たす設計になっている
- [x] 実装詳細が spec に漏れ込んでいない

## Notes

- targets は `--targets frontend` で起動したが、**subagent 入れ子表示 (US-2)** に domain 変換 + DTO 拡張が
  要るため **AskUserQuestion で both に確定**した (spec frontmatter `targets_selected_by: user` / plan Summary)。
  5 種の専用表示自体は renderer 単独で成立する
- **Reasoning / Tool group は R-3 実装済み** — R-4 は Tier A 適合の確認と専用表示との共存 (FR-007) を担う
- 「見栄えの判断材料の提示」(SC-010) は quickstart の rubric-a〜d が持ち主。**「M1 完了 / 軸 1 確定」自体は
  R-4 done-gate の合否条件にしない** (design-gate C-001 (a))。軸 1 の正式確定と R-3 一次判断は roadmap の tracked debt
- **Tier A 完全化は主張しない** — 7 種以外は fallback のまま (O-2)。ui-coverage.md は O-2 (FR-016)
