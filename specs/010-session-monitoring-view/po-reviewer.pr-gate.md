# po-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-03
**Reviewer**: po-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 2 (pr-gate)

Critical と High はない。Round 1 の 9 件 (H-001、M-001〜M-005、L-001〜L-003) はどれも resolved。新しい指摘は Medium 1 件 (M-101: compact の失敗の行の幅を確かめる手段が登録されていない) と Low 2 件 (L-101: US-4 の「範囲から削らない」に改訂の注記が無い / L-102: FR-003 / FR-008 の本文が compact の実装に追いついていない)。利用者の判断 (SC-005 を閉じた、下限 30、ナレーターはスコープ外、内訳の出力は O-3、compact をコードで直す) は覆していない。

## 初回読了 viewpoint

- **FR/SC**: FR-001〜FR-013 と SC-001〜SC-006 が範囲内。R1 の後で直接変わったのは FR-002 / FR-003 / FR-006 / FR-008 / FR-012 / FR-013、SC-003 / SC-005 / SC-006
- **touched files に該当する charter / Confirmation**: session charter の KPI「並列時の滑らかさ」(`charter.md:138-145`)、roadmap の O-1 の行・O-3 の「義務 (O-1 から)」(`#o3-kpi-smoothness`)・system-scope の 2 項目、AD-038 D2 / D3、FR-010 の境界
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (charter の KPI の記録の正確さは E で見た)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:0 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux-reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## FR / SC coverage

| ID | 評価 |
|---|---|
| FR-001 / FR-004 / FR-005 / FR-007 / FR-009 / FR-011 | 被覆 |
| FR-002 | 被覆 (L-003 / M-005 解消) |
| FR-003 | 被覆。spec の文面との差は L-102 |
| FR-006 | 被覆 |
| FR-008 | 被覆。失敗の行の幅は E2E で測れず、目視の担い手もいない (M-101)。文面の差は L-102 |
| FR-010 | 被覆 (L-002 解消) |
| FR-012 | 被覆。完了条件は改訂して外した (M-001 解消) |
| FR-013 | 被覆 (H-001 解消) |
| SC-001 / SC-002 / SC-004 / SC-006 | 被覆 (M-004 / M-005 解消) |
| SC-003 | 部分。V-4 (2026-10-02) は短い理由が入る前の目視で、失敗の行の幅を確かめる手段が無い (M-101) |
| SC-005 | 利用者の判断で閉じた。宿題は O-3 (2) |

## Round 1 指摘の判定

| R1 ID | 判定 | 根拠 |
|---|---|---|
| H-001 | resolved | roadmap O-3 の行に (a)(b)(c) と E2E の 33 件が登録され、charter と quickstart-results が指す。相対リンクの深さも正しい |
| M-001 | resolved | `spec.md` の FR-012 に改訂の行。Clarifications / Assumptions / SC-005 / plan / quickstart / tasks / roadmap が指す。残りは US-4 (L-101) |
| M-002 | resolved (コード) | 短い理由・sr-only の全文と終了の告知・ツールチップ。テスト 3 件。残りは文面 (L-102) と幅の確かめ方 (M-101) |
| M-003 | resolved | 観測として書き直し、charter に「行の切り替えは測っていない」、宿題は O-3 (2)(c) |
| M-004 | resolved | V-3 の結論に 33 件の評価 |
| M-005 | resolved | 押した直後に解けた場合と 3 本の行ごとの再描画のテスト。「承認カードが出ない」「一覧の Root が再描画されない」の明示の assert は無いが、edge case と SC-006 の分離は守られている |
| L-001 / L-002 / L-003 | resolved | — |

## Findings

### [Medium] compact の失敗の行の幅を確かめる手段が、どこにも登録されていない (M-101) (scope: feature)

- **観察**: `quickstart-results.md` の V-2 の再実行の記録が「実アプリでの失敗の行の幅の目視は朝の確認項目に残す」と結ぶが、「朝の確認項目」は spec dir と docs のどこにも定義が無い。`quickstart.md` の V-4 に失敗の行の幅の項目は無い。V-4 の結果 (2026-10-02) は短い理由を足す前の目視。compact の外側の要素に `min-w-0` は無く、幅を抑えるのは内側の `max-w-24` だけ
- **同種事象探索**: `朝|失敗の行の幅|max-w-24` で 2 件
- **リスク/影響**: SC-003 の 3 経路 (E2E / component / 目視) のどれにも失敗の行の幅の計測が無い。担い手と記録先が無い宿題になる
- **推奨アクション** (記録だけ): quickstart V-4 に手順を 1 つ足し、quickstart-results の V-4 の表に「未実施 (利用者の確認待ち)」として載せて参照を置き換える。目視を done の前に行うか残したまま done にするかを記録する
- **根拠**: spec SC-003、FR-008 (Principle VIII)

### [Low] US-4 の「範囲から削らない」に改訂の注記が無い (L-101) (scope: feature)

- **観察**: `spec.md` US-4 の Why this priority と `tasks.md` の US-4 の見出しが元の文面のまま
- **推奨アクション**: 2 か所に改訂の注記 (SC-005 は利用者が閉じ、残りは roadmap O-3 (2)。FR-012 の改訂の行) を足す

### [Low] FR-003 / FR-008 の本文が compact の実装に追いついていない (L-102) (scope: feature)

- **観察**: compact は短い訳を出し、全文と終了の告知はツールチップと読み上げだけ。FR-008 が行から外してよいとするのはランタイム・起動時刻・直近の活動だけ。この扱いは tasks FE-021 にしか書かれていない
- **推奨アクション**: FR-008 の compact の項に「失敗の理由は印の横に短い訳、全文と終了の告知はフォーカス / ポインタと読み上げで読める」を足し、FR-003 に「compact では短い訳」と添える

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `朝\|失敗の行の幅\|max-w-24` | 2 | quickstart-results.md (V-2 の再実行)、RunningSessionList.tsx (compact の短い理由) |
| L-101 | `完了条件\|削らない` | 注記が無いもの 2 | spec.md (US-4)、tasks.md (US-4 の見出し) |
| L-102 | `FR-008\|終了の告知\|強制終了` in spec.md | 改訂の記述 0 | spec.md FR-003 / FR-008 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 2
- Round inheritance: resolved from 1: 9 / unresolved: 0 / new: 3 (M-101, L-101, L-102)
