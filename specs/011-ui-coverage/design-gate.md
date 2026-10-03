# Design Gate Round 2: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Spec**: specs/011-ui-coverage/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer (default + adr-drift), security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Round inheritance**: Round 1 ([design-gate.round1.md](./design-gate.round1.md)。Critical 3 / High 8)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 0 | 1 | 3 | 7 |
| po-reviewer | 0 | 1 | 1 | 4 |
| architecture-reviewer | 0 | 1 | 3 | 5 |
| security-reviewer | 0 | 0 | 1 | 3 |
| platform-boundary-reviewer | 0 | 0 | 1 | 2 |
| **Total (dedup)** | **0** | **3** | **7** | **15** |

| | Critical | High |
|---|---|---|
| Resolved from prev | 3 | 7 |
| Unresolved from prev | 0 | 1 (DH-2 → R2 DH-1) |
| New in this run | 0 | 2 |

cascade の降格 0 件、A–H の欠落 0 件 (reviewer の 4 トラック)。

**Status**: PASS (Critical=0)
**Next**: status: tasking → implementing。High 3 件と Medium は実装の前に文書を直す (下の「Round 2 の後の対応」)

## High (Total: 3)

| ID | origin | 要旨 | 対応 |
|---|---|---|---|
| DH-1 | architecture H-101 + analyze N2 + security L-003 | 名前つきの `task_updated` (`patch.description`) が、行の無い id (隠した task) に行を作る。FR-009 と data-model §2 が食い違う (R1 DH-2 の残り) | DTO の event に「行を作ってよいか」(`opens`) を足し、`hook_started` / `hook_response` / `task_started` だけが行を作る |
| DH-2 | analyze N1 | `task_updated` は `patch.status` を持たないことが多く、変換が `unknown` を作って `running` を上書きする | 変換の status を任意にし、合成は無いとき前の値を保つ |
| DH-3 | po H-101 | M3 の完了の条件「Tier A の `後続` が 0」は、Permission grant (Tier A) が M4 の I-3 にあるので M3 の中で満たせない | 条件を「Tier A の `後続` のうち割当先が M3 の feature の行が 0」とし、項目 21 の出力で後続 ID に milestone を併記する |

## Medium (Total: 7)

| ID | origin | 要旨 |
|---|---|---|
| DM-1 | po M-101 | M3 の達成状態「未表示ゼロ」の読み替えが roadmap / _overview の追随に無い |
| DM-2 | analyze N3 | 前景の task (`is_backgrounded: false`、subagent など) にも event の行が出る |
| DM-3 | analyze N4 + architecture M-102 | event の行を `role: 'assistant'` にすると AssistantMessage の部品と「最後の assistant」の running indicator が付く |
| DM-4 | architecture M-101 | 合成と読み飛ばしの規則が DTO の形で書かれているが、store は ThreadMessageLike を持つ |
| DM-5 | architecture M-103 | XII の Adoption metadata (`violation_threshold`) が項目 21 と食い違う |
| DM-6 | security M-004 | 送り直す payload の合計の上限が無い。並列の結果が 1 つの user メッセージで来る前提が未確認 |
| DM-7 | platform-boundary M-101 | 照合の正解を parse 自身の出力から起こすので、parse の取りこぼしが検出されない |

## Low (Total: 15)

analyze N5〜N10 / T1'、po L-101〜L-104、architecture L-101〜L-105、security L-101 / L-102、platform-boundary L-101 / L-102 (重複をまとめて 15 件)。各トラックの raw を参照。

## Round 2 の後の対応

High 3 件と Medium 7 件、Low のうち文書で直せるものを、実装の前に spec / data-model / research / plan / tasks / quickstart に反映した (同じコミット)。

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
