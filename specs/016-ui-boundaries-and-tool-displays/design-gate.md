# Design Gate: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-05 (Round 2)
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [design-gate.md.20261004T2330](./design-gate.md.20261004T2330) (Round 1。FIX_REQUIRED、Critical 1 / High 12)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 0 | 1 | 6 | 13 |
| po-reviewer | 0 | 0 | 5 | 6 |
| architecture-reviewer | 0 | 2 | 1 | 5 |
| security-reviewer | 0 | 0 | 2 | 7 |
| platform-boundary-reviewer | 0 | 0 | 2 | 5 |
| **Total (dedup)** | **0** | 3 | 12 | 25 |

|  | Critical | High |
|---|---|---|
| Resolved from prev | 1 | 12 |
| Unresolved from prev | 0 | 0 (po H-002 / H-004 の残りは Medium に下げて持ち越し) |
| New in this run | 0 | 3 |

**Status**: PASS (Critical 0)
**Next**: status は tasking → implementing。**ただし本 spec は未承認の判断 (U-1〜U-6)・proposed の AD-046〜AD-049・未マージの O-7 / O-4 / O-5 に依るので、/cl-implement には入らない。** R2 の High 3 件と Medium は gate の後に手当てした。手当ては再レビューを受けていない

## High (dedup 後 3 件。すべて new)

| ID | 内容 | 出所 |
|---|---|---|
| H-01 | `WebFetch` の見出しの「最後のパスの要素」は、webhook (`/services/T…/B…/<secret>`・`/api/webhooks/<id>/<token>`) の秘密を常に見える見出しに出す。FE-021 のテストと正本の規則が両立しない (R1 sec M-001 の推奨が矛盾していた) | analyze S1 / sec M-001 |
| H-02 | 過去ログの変換は `system` の記録の文字列の `content` を、伏せ字なしで text の part にしている (`transcript.ts:73`, `:214-216`)。spec は「過去ログでは出していない」前提で、伏せ字を実行中にだけ当てている | arch H-001 |
| H-03 | data-model §5 が Inline citation の Tier を A から B に下げる。accepted の AD-019 (Tier A は確定) の変更なのに、AD-049 の読み替えに無い (R1 arch L-003 の推奨が原因) | arch H-002 / analyze K2 |

## Medium (dedup 後 12 件)

| ID | 内容 | 出所 |
|---|---|---|
| M-01 | O-2 から回された「Hook・task の状態の変化の読み上げ」が本 spec にも O-11 にも無い | po M-104 / arch M-001 (a) / analyze C1 |
| M-02 | 持ち主の無い延期: 拒否の後の編集して再試行 (O-10 の行に足す作業が無い)、計画の一覧、ux L-102 / arch L-201、「O-1 の続き」 | arch M-001 (b)(c) / analyze C2 |
| M-03 | `supersedes` で外した時点では理由が出ない | po M-101 |
| M-04 | `informational` の出所 (Claude Code 自身の状態の行も含む) と `info` の水準 | po M-102 / analyze A1 |
| M-05 | `TaskUpdate` の「タスク #{id}」をどのタスクかと結び付けられない。`status` の無い更新 | po M-103 |
| M-06 | File tree の項目の判定が実データに依る。区切りの無い相対パスは注記に回る | po M-105 / analyze A2 |
| M-07 | `redactSecrets` の境界と値の形が無い。取りこぼし (JSON のキー・`GITHUB_TOKEN=`・`--password x`・`sk_live_`・PEM) と誤検出 (`task-`・`Basic usage`・`-path`)。既存の `secret-scan.ts` を参照しない | sec M-002 / analyze S2 / po L-105 |
| M-08 | 項目 16 の P3 は呼び出しの形しか見ない (ブラケット・`.call`・参照) | pb M-101 |
| M-09 | FR-018 の fixture 1 本では 3 つの追加を固定できない。`QUERY_MUTATION_METHODS` の集合の pin が無い | pb M-102 |
| M-10 | 既存の File tree の element は差分の要約 (英語の見出し・増減・`key={node.path}`) | analyze U1 / sec L-002 |
| M-11 | Compaction boundary は registry に無い。SH-002 が実在しない名前と照合する | analyze K1 |
| M-12 | assistant-ui の part の状態 (`running` / `requires-action`) で ToolFallback がアイコンと「Cancelled tool」を描き、§3 の結果の状態と食い違う。英語の文言が残る | analyze I1 |

## Low (25 件。抜粋。全文は各トラックの raw output)

- po: 120 コードポイントの切り詰め (L-101)、自分で拒否・中断した後のエラーの読み上げ (L-102)、会話の作り直しの文言 (L-103)、256 件の上限の結果不明 (L-104)、fallback の `content` の列 (L-106 / analyze U2)
- security: 伏せ字の計算量 (L-001)、markdown で描かれない部分の印 (L-003)、provider を Agent plan に限る (L-004)、取り消した tool の承認 (L-005)、`react/no-danger` (L-006。system)、見出しの自由文の伏せ字 (L-007)
- platform-boundary: WslUncPath の glossary (L-101)、`pathTail` の置き場 (L-102)、本文のパスに操作を付けない (L-103)、取り消しの観測と退行の 4 点 (L-104 / analyze U5・C4)、項目 8 の `navigator` と `ui-path-concat` の注記 (L-105 / analyze K3)
- architecture: D 節の定義 (L-001 / analyze I2)、O-6 を指したまま残る記述 (L-002 / analyze C3)、「計量」の定義 (L-003)、task・チェックポイントを操作しない判断の U (L-004)、AD-019 の Tier A の照合の検査 (L-005。system)
- analyze: URI の要約の関数の違い (D1)、status の level (U3)、英語のキー (K4)、要素の名前と AC4 の文言 (I3)

## Track raw outputs

- Round 2: [analyze.round2.md](./analyze.round2.md) / [po-reviewer.design-gate.round2.md](./po-reviewer.design-gate.round2.md) / [architecture-reviewer.design-gate.round2.md](./architecture-reviewer.design-gate.round2.md) / [security-reviewer.design-gate.round2.md](./security-reviewer.design-gate.round2.md) / [platform-boundary-reviewer.design-gate.round2.md](./platform-boundary-reviewer.design-gate.round2.md)
- Round 1: [analyze.md](./analyze.md) / [po-reviewer.design-gate.md](./po-reviewer.design-gate.md) / [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md) / [security-reviewer.design-gate.md](./security-reviewer.design-gate.md) / [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
