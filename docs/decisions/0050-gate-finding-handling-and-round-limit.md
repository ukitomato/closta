---
status: proposed
date: 2026-10-12
id: AD-050
deciders: ukitomato
tags: [workflow, gate, review-cost]
supersedes: []
superseded-by: []
---

# AD-050: gate の Medium / Low は直さず、round を 3 までに限り、round 2 以降の reviewer を絞る

## Context

2026-09-12〜10-12 の 31 日で、gate (design / code / pr) は Claude Code の利用額の約 41% を占めた (API 定価の概算。集計は [docs/ai-workflow/PLAN.md](../ai-workflow/PLAN.md) §2)。pr-gate は 1 回あたり約 $47 で、PR 1 本あたり 2〜3 round を回していた。

round が増えた理由は 2 つある。

- **PASS した後も Medium / Low を直していた。** 例: `pass O-6 design-gate R2` の後の `address O-6 design-gate R2 High and Medium findings`、`address design-gate M-01, M-07..M-13`。直したことで次の round の reviewer が新しい指摘を出し、round がさらに増える
- **round 2 以降も、指摘の無い reviewer を含めて全員を起動していた。** 修正の差分に関係しない reviewer も、constitution・charter・ADR・diff を読み直す

Claude Code の公式のベストプラクティスは、adversarial review について「見つけろと言われた reviewer は、作業が健全でも何かを報告する。それを全部追うと過剰設計になる。正しさと要件に関わる指摘だけを挙げさせ、残りは任意として扱う」と書いている ([Best practices](https://code.claude.com/docs/en/best-practices#add-an-adversarial-review-step))。

## Decision

1. **Critical の扱いは変えない。** Critical が残っていれば次の段に進まない。pr-gate は pure hard gate のまま (AGENTS.md)
2. **High はその round の中で直す。** High を確かめるためだけの round は回さない。Critical の再実行があれば、そこで一緒に確かめる
3. **Medium / Low は直さない。** gate の出力ファイル (`design-gate.md` / `code-gate.md` / `pr-gate.md`。最終版は git で追跡される) に残し、マイルストーンの終わりの棚卸しで「直す / 特定の feature に付ける / 捨てる」を利用者が決める。roadmap や spec に 1 件ずつ転記しない。直してよいのは、1 行で済み、かつ同じファイルを既に触っているときだけ
4. **design-gate と pr-gate は 3 round まで。** 3 round で Critical が残ったら止めて、人が spec の範囲の調整か ADR の起票を判断する。pr-gate の Round 4 以降は `--round <N>` の明示があるときだけ受け付け、既存の convergence gate (Phase 2) はそのまま働く。code-gate の auto-fix loop (lint / test の機械的な修正) の上限は別に定める (cl-code-gate)
5. **pr-gate の round 2 以降は reviewer を絞る。** 前の round で未解決の Critical / High を持つ reviewer と、前の round の head からの差分に `reviewers_filter` が当てた reviewer だけを起動する。除いた reviewer は `skipped_reviewers[]` に理由付きで記録する
6. **reviewer は、正しさ・セキュリティ・spec の要件・プロジェクト不変条件に関わる指摘だけを Critical / High にする** (reviewer-base の重大度の節)

## Consequences

- 良い: round の数と、round ごとの reviewer の起動数が減る。PLAN.md の目標は pr-gate 1 回あたり $25 以下
- 良い: roadmap への申し送り (「持ち主 = 次の feature」) が Medium / Low の分だけ増えなくなる
- 悪い: Medium / Low の保守性の指摘は、マイルストーンの終わりまで直されない。棚卸しで同じ観点の Medium が複数の spec で繰り返されていたら、その観点を High に格上げする規則を reviewer-base に足す
- 悪い: round 2 で絞った reviewer が、修正の副作用を見落とす可能性がある。修正の差分に `reviewers_filter` を当てるので、差分に触れた領域の reviewer は必ず起動する
- 悪い: reviewer が直すべき指摘を Medium に置くと、直されない。reviewer-base の定義でそれを防ぐ

## Alternatives

- **Medium も PASS の条件に含める**: 今の運用 (PASS 後に Medium を直す) を明文化することになり、round が減らない
- **round の上限を置かない**: 既存の convergence gate (Round 4 以降、2 round 続けて resolved < new なら halt) だけでは、Round 3 までは無条件に回る
- **round 2 以降も全員を起動する**: 見落としは最も少ないが、reviewer の起動の大半が「前の round と同じ答え」になる

## Confirmation

本 ADR は proposed である。[docs/ai-workflow/PLAN.md](../ai-workflow/PLAN.md) §7 のパイロット 2 (016) の指標をすべて満たしたら accepted にする。

- 015 (O-5) の pr-gate と 016 (O-6) の design-gate で、round の数が 3 以下であること、PASS 後に Medium / Low を直したコミットが 0 件であることを確かめる
- round 2 以降に絞ったことで見落とした Critical (次の round や CI で初めて見つかった Critical) を数える。1 件でも出たら、絞り込みの条件を見直す
