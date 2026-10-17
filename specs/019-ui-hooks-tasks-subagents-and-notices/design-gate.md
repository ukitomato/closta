# Design Gate: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-17T00:00:00+09:00
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 2    | 6      | 7   |
| po-reviewer                | 0        | 3    | 4      | 2   |
| architecture-reviewer      | 0        | 4    | 5      | 1   |
| security-reviewer          | 0        | 1    | 2      | 2   |
| platform-boundary-reviewer | 0        | 1    | 1      | 1   |
| **Total (dedup)**          | **0**    | 10   | 12     | 11  |

viewpoint coverage: reviewer の 4 トラックとも A-H 欠落なし (analyze は適用外)。cascade 降格: 0。

**Status**: PASS
**Next**: status: tasking → implementing 昇格。ただし High 10 件はこの round で直す (AD-050)。また U-1〜U-8 と AD-054〜056 は未承認で、tasks.md の「着手の条件」により `/cl-implement` は承認の後 (G1)

## Critical (Total: 0)

なし。

## High (Total: 10)

### H-01 — AD-056 Decision 2「`local_bash` は名前を出さない」が FR-005 / data-model §2.3 と矛盾 [origin: analyze I1 + architecture H-003] [new]

- **Where**: docs/decisions/0056 Decision 2 (:35)、spec.md FR-005 (:192) / US-2 AC2、data-model.md §2.3 (:90)、plan.md:253
- **Action**: proposed の AD-056 Decision 2 を「説明は出さず、`Bash` のコマンドの名前だけを出す」に直し、plan.md:253 の「AD-056 は変えない」も直す

### H-02 — U-1〜U-8 (gated の U-3 / U-7 を含む) と AD-054/055/056 が未承認 [origin: analyze G1] [new]

- **Where**: spec.md「未承認の判断の一覧」、plan「未承認の判断」、tasks.md「着手の条件」
- **Action**: `/cl-implement` の前に、main で人間の承認を取る

### H-03 — subagent に帰属する system メッセージを spec は「入れ子に描く」、data-model / tasks は「捨てる」としている [origin: po H-001] [new]

- **Where**: spec.md:175, data-model.md:154, research.md:69, tasks.md:81 (BE-031)
- **Action**: どちらかに揃え、subagent の中の Hook の扱いを US-1 の AC に足す

### H-04 — 実行中の入れ子が上限 (子 500 件 / 送り直し 1 MB) に当たったときの見え方が spec に無く、送り直しの量を測るタスクも無い [origin: po H-002 + analyze C1] [new]

- **Where**: data-model.md:150-151, plan.md:37 / RK-04, research.md:61,64, tasks.md:80 (BE-030/BE-031), spec.md Edge Cases (記述なし)
- **Action**: 上限に当たったときの見え方を Edge Case と AC に書き、FE-031 に `truncated` のテストを足し、送り直しの量の確認を足す

### H-05 — FR-012 / SC-005 で Tier A 3 行が、実データの検証 (V-3/V-4) を条件にせず `実装済み` になる [origin: po H-003 + analyze C2] [new]

- **Where**: spec.md:205 (FR-012), spec.md:231 (SC-005), plan.md:265 (RK-06), plan.md:270 (RK-11), tasks.md:100 (SH-011), tasks.md:9,102
- **Action**: V-3/V-4 の記録を `実装済み` の条件にし、SC-005 を自動の部分と手で記録する部分に分ける

### H-06 — FE-031 / FE-021 の設計が `tool-registry.aui.tsx` ⇄ `subagent.aui.tsx` (と thread) の循環 import を作る [origin: architecture H-001] [new]

- **Where**: plan.md:225, plan.md:190 (#24), tasks.md:68 (FE-021), tasks.md:89 (FE-031)。src 側は tool-registry.aui.tsx:12, thread.aui.tsx:20,1121、.dependency-cruiser.js:77-81
- **Action**: 依存の向きを 1 方向に決める (context で注入する、または表を別ファイルに切り出す)。#24 を「当たる」に直す

### H-07 — U-3「持ち主は ui」と、session の `meter` / `meters` に保持する設計が食い違い、AD-044 D6 の読み替えが半分しか書かれていない [origin: architecture H-002] [new]

- **Where**: spec.md:42, :89, AD-056:29, :35, :50, data-model.md:95-120, glossary.md:609
- **Action**: 表示は ui、保持は session の契約、と書き分け、AD-044 D6 の「session に含めない」側の読み替えを足す

### H-08 — agents の前景の task の記憶 (256 件の LRU) を、どの ADR も読み替えていない (AD-044 D6) [origin: architecture H-004] [new]

- **Where**: data-model.md:58-68, plan.md:49, :213, tasks.md:58, :64, AD-056:29, glossary.md:1046
- **Action**: AD-056 の「読み替える箇所」に 1 行足し、glossary の Counterexamples を SH-001 で直す

### H-09 — 実行中の subagent の user の text を入れ子に足す規則が O-2 の「user の本文は送らない」を破る。合成メッセージ (Hook 出力など) が DOM に出る経路を開く [origin: security H-001] [new]

- **Where**: data-model.md:153、spec.md:198 (FR-008)、src/agents/sdk-agent-session.ts:641、specs/011-ui-coverage/data-model.md:109
- **Action**: 入れ子の user は tool_result だけを読む。または `isSynthetic` を捨てる。BE-031/BE-032 にテストを足す

### H-10 — 項目 14 のファイル制限は 1 つ目の SDK import しか読まず、別名で照合するので、AD-055 D1 の強制が抜けられる [origin: platform-boundary H-001] [new]

- **Where**: scripts/constitution/check.mjs:687-709、plan.md:229、research.md:93、tasks.md:36-37 (BE-040)
- **Action**: すべての import を走査し、import した名前で照合する。2 つ目の import 文と別名の fixture を足す

## Medium (Total: 12)

- M-01 glossary の表記と定義のずれ (「背景の task」と「バックグラウンドタスク」、Background task の Definition/Domain/Counterexample、Subagent の `parent_agent_id`、System event row) [analyze T1 + T2 + architecture M-001]
- M-02 タブの `null` の状態と「動いていない」の定義が無い [po M-001 + analyze U1]
- M-03 過去ログの subagent の取得の失敗が観測できない [po M-004 + architecture M-005]
- M-04 Hook の行が増えるときの密度の判断が先送りになっている [po M-002]
- M-05 過去ログを開く時間の増分に基準が無い [po M-003]
- M-06 US-3 AC3 (入れ子の divider) が実際には起きないかもしれない [analyze U2]
- M-07 session charter の Key concepts を更新するタスクが無い [architecture M-002]
- M-08 AD-047 などに「訂正: AD-05x への参照」の節を足すタスクが無い [architecture M-003]
- M-09 `getSubagentMessages` の捨て方が AD-035 D5「欠落なし」と食い違う [architecture M-004]
- M-10 過去ログの subagent の補いに合計バイトの上限が無い [security M-001]
- M-11 H-09 の経路を検出するテストが無い [security M-002]
- M-12 H-10 の取りこぼしを検出する fixture が無い [platform-boundary M-001]

## Low (Total: 11)

- L-01 US-2 AC2 の「シェル」と data-model の「シェルのコマンド」 [po L-001 + analyze T3]
- L-02 Principle IV の Statement の API の列挙に 2 つの API が無い [analyze D1 + architecture L-001]
- L-03 User Story がすべて P1 [po L-002]
- L-04 FE-020 [P] が BE-021 に依存する [analyze P1]
- L-05 `subagent.aui.tsx` の順序の制約を書いていない [analyze P2]
- L-06 上限の値 500 / 64 が [ASSUMED] に入っていない [analyze A1]
- L-07 SessionStart/Setup の Hook の注意の色が FR-003 の範囲外 [analyze S1]
- L-08 Principle XIII の PR 説明の義務を持つタスクが無い [analyze D2]
- L-09 `read-transcript.ts` が sessionId の UUID の形を確かめない [security L-001]
- L-10 `hook_event` が allowlist を通らない [security L-002]
- L-11 `pathTail` を domain に移すと branded のパス値にも当てられる [platform-boundary L-001]

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
