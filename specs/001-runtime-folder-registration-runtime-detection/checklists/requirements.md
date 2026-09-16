# Specification Quality Checklist: フォルダ登録とランタイム検出 (R-1)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Updated**: 2026-09-14 (design-gate round 3)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — 下の Notes を参照
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders — 下の Notes を参照
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic — 下の Notes を参照
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### spec と実装の境界

本 spec は「何を満たすか」を定める。**型の実装手段、スクリプトの具体的な内容、
標準ライブラリの使い分けといった実装方式は [tasks.md](../tasks.md) とコードで決める。**

一方、次の 3 種類は「実装方法の漏れ」ではなく **feature の成果物そのもの**であるため spec に残る。

| 種類                 | 例                                                             | 根拠                                                 |
| -------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| ツールチェーンの選定 | 公式 CLI / 5 レイヤ / ESLint と dependency-cruiser の併用      | AD-023 で確定済み。R-1 の最初のコミットで固定される  |
| 実測に基づく制約     | `wsl.exe` の呼び出し回数、UNC 直読み、マウントオプションが正本 | AD-015 の実測。抽象化すると FR が検証不能になる      |
| ubiquitous language  | 所在 / `HostPath` / `RuntimePath` / `AgentRuntime`             | `docs/glossary.md` の canonical term (Principle XIV) |

### Success Criteria の technology-agnostic 性

SC-001 / SC-002 / SC-003 は `runtime` charter の KPI を引いており、計測経路が charter 側で
定義されている。SC-005 / SC-011 は charter の KPI ではなく、**計測経路を spec 本文に持つ**
(前者は `wsl -l -v` の前後比較と停止中識別子での IPC 直叩き、後者は Vitest のフィクスチャと quickstart)。SC-008 / SC-009 / SC-017 は依存規則の機械強制そのものが
US-4 の価値であるため、検証手段から切り離すと計測不能になる。

### 未解決事項

なし。起案時に人間が確定した 3 点は `## Assumptions` に `[USER]` として記録済み。
Constitution / charter / ADR / glossary に残る不整合は **AD-024 / AD-025 の起票と
上流文書の更新**で閉じる。割り当ては `tasks.md` の SH-017 / SH-018 / SH-042 〜 SH-047 / SH-049 / SH-050。
AD-024 の対象は round 3 で 13 項目から **17 項目**に増えた — 検証条件だけでなく、
Principle I の Statement・XI の Exceptions・XIV 本文・未解決候補 #2 という
**本 feature の完了で事実と食い違う本文**を含むため。
