# Specification Quality Checklist: セッション列挙 (R-2)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-16
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

本 spec は「何を満たすか」を定める。**列挙を行う実行単位の形、config ディレクトリの探索手順、
キャッシュの実装手段は [plan.md](../plan.md) / [tasks.md](../tasks.md) とコードで決める。**

一方、次の 3 種類は「実装方法の漏れ」ではなく **feature の制約そのもの**であるため spec に残る。

| 種類                 | 例                                                                         | 根拠                                                            |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| accepted ADR の拘束  | Agent SDK 経由に限る / `wsl.exe` を使わない / 環境変数の書き換えで切り替えない | Principle IV・AD-015・AD-021。抽象化すると FR が検証不能になる   |
| 実測に基づく制約     | `wsl.exe` は 1 回あたり約 1.5 秒 / UNC の浅い列挙は 22 ミリ秒               | AD-015 の実測。SC-003 / SC-008 の予算がこれに乗っている          |
| ubiquitous language  | 所在 / `PathMapping` / 実行中確認済みの値 / セッション                      | `docs/glossary.md` の canonical term (Principle XIV)             |

FR-001 / FR-006 / FR-014 / FR-042 は API 名やモジュール名を挙げているが、
いずれも **accepted ADR と Constitution Principle が禁止・限定している経路**を指している。
これらを「実装詳細」として spec から外すと、`architecture-reviewer` が drift を
判定する根拠が spec 側から消える。

### Success Criteria の technology-agnostic 性

SC-001 は `session` charter の KPI「列挙の網羅」を引いている。
SC-002 / SC-003 / SC-004 は **禁止事項が守られたことの測定**であり、
測定対象が経路そのものであるため計測手段から切り離せない
(R-1 の SC-005 が「発行側の行為で測る」と定めたのと同じ構造)。
SC-008 の数値は開発ホスト 1 台の実測に基づく予算であり、`## Assumptions` に留保を記録した。

### 起案時に確定した 3 点

`## Assumptions` に `[USER]` として記録済み。

1. 登録フォルダ外のセッションも全件列挙し「未登録フォルダ」として示す
2. 列挙対象の config ディレクトリは所在ごとの既定のみ (複数 config は X-3)
3. 本 feature は一覧とメタデータまで (transcript 本文の取得は R-3)

### plan の Phase 0 で解消した事項

3 件を [../research.md](../research.md) の実測で解消した。

| 項目 | 結論 |
| --- | --- |
| WSL 側 config ディレクトリの探索方式 | UNC 経路の浅い列挙で足りる (実測 69 ms)。`wsl.exe` を使わない (R-03) |
| 列挙を行う実行単位 | 列挙対象ごとの短命 `utilityProcess`。FR-005 / FR-014 / FR-045 を同時に満たす (R-04) |
| 作業ディレクトリの名前空間 | **仮定が誤っていた。** 1 つの config ディレクトリに 3 形式が混在する (R-02) |

**3 件目は spec の変更を伴った。** 起案時は「由来 config ディレクトリの所在の名前空間で
書かれている」と暗黙に仮定していたが、実測が反証した。
FR-016 〜 FR-018 を追加し、SC-005 / US-1 AC-5 / AC-6 / AC-8 / Key Entities / Edge Cases を
追随させた。**status が `drafting` の段階で反証が出たため spec 側を直した** —
plan で回避策を書いて spec の誤った前提を残すと、以降の gate がすべて誤った前提を通す。

### 起案後に人間が確定した 2 点

`## Assumptions` に `[USER]` として記録済み。

4. セッション一覧は assistant-ui の thread-list 系 element を土台にする (AD-025 の申し送り)
5. **E2E / CI 基盤は本 feature に含めず、M4 完了後に再検討する。**
   charter KPI の「計測経路: E2E」と AD-024 #18 の R-2 名指しは本 feature では満たさない
   ([../plan.md](../plan.md) の「上流からの申し送り」#4)
