# Specification Quality Checklist: transcript の基本表示 (R-3)

**Purpose**: planning に進む前に spec の完全性と品質を検証する
**Created**: 2026-09-24
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] 実装詳細に寄りすぎていない (WHAT / WHY 中心。HOW は plan/tasks へ)
- [x] ユーザ価値とビジネスニーズに焦点 (M1「読める」/ 軸 1 の一次判断)
- [x] 非技術ステークホルダにも読める記述
- [x] 必須セクションがすべて埋まっている

## Requirement Completeness

- [x] `[NEEDS CLARIFICATION]` が残っていない (targets のスコープは AskUserQuestion で確定)
- [x] 要件がテスト可能で曖昧でない (各 FR に検証経路が対応)
- [x] Success Criteria が計測可能 (SC-001〜SC-010 に計測経路を明記)
- [x] Success Criteria が技術非依存 (仮想化ライブラリ名を SC に書かない)
- [x] Acceptance Scenarios がすべて定義されている (US-1〜US-3)
- [x] Edge cases を特定 (空 / 失敗 / 未知 block / 大 tool_result / compact / 選択なし / subagent)
- [x] スコープが明確 (専用 tool 表示 R-4 / composer X-2 / 密度 O-1 / ui-coverage O-2 を除外)
- [x] 依存と前提を特定 (R-2 継承 / SPIKE-2・14 / 参照 ADR / Assumptions)

## Feature Readiness

- [x] 各 FR に明確な受け入れ基準がある
- [x] User Scenario が主要フローを網羅 (読む / 大量スクロール / 逐次伸長)
- [x] Success Criteria の計測可能な成果を満たす設計になっている
- [x] 実装詳細が spec に漏れ込んでいない

## Notes

- targets は `--targets frontend` で起動したが、実データ表示に読み取り専用 backend 経路が要るため
  **AskUserQuestion で both に確定**した (spec frontmatter `targets_selected_by: user` / plan #9)
- 「見栄えの一次判断」(SC-010) は quickstart V-9 が持ち主。M1 完了判定の一部
