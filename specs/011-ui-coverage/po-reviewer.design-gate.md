# po-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: po-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (design-gate)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 と SC-001〜SC-007 はすべて範囲内。R1 からの改訂箇所: FR-003 / FR-004 / FR-008 / FR-009 / FR-012 / FR-014 / FR-015 / FR-016、SC-001 / SC-003 / SC-005 / SC-006
- 関係する charter / Confirmation: ui charter の業務ルール (:126) と KPI「表示網羅」(:135)、roadmap M3 の達成状態「未表示情報がゼロ」(roadmap.md:245、_overview.md:100)、I-3 は M4 (roadmap.md:268)、AD-019 の Tier A の承認の element に Permission grant (0019:34)、AD-020 Decision 1、AD-035 Trade-off、AD-041 (g)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (M3 の完了の条件の計測・達成の可否は E に含めた)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:1 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: design-gate では optional reviewer を起動していない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

R1 を受けて改訂した文書をもう一度見た。利用者の決定 (後続 ID の扱い、AD-044 と MINOR、Hook の範囲、renderer の合成、O-4〜O-6 を ui、Permission grant を I-3) は覆していない。

## Findings

### [High] M3 の完了の条件「Tier A の `後続` の行が 0」は M3 の中で満たせない。Permission grant (Tier A) の割当先 I-3 が M4 にある (H-101) (scope: feature)

- **観察**: spec / data-model / research は M3 の完了の条件を「Tier A の `後続` の行が 0」とする。Permission grant は `後続: I-3` で、I-3 は M4 (roadmap.md:268)。Permission grant は AD-019 の Tier A の承認の element で、data-model の Tier の決め方でも「承認」は Tier A
- **同種事象探索**: `Tier A の.{0,3}後続|M3 の完了の条件` で 9 件、`I-3` で 5 件 (specs/011)
- **リスク/影響**: 条件どおりなら M4 の I-3 が終わるまで M3 は完了しない。条件を通すために Tier を B に下げる動機が生まれる
- **推奨アクション**: 利用者の決定は覆さずに AD-044 で決める。(a) 条件を「Tier A の `後続` のうち割当先が M3 の feature の行が 0」とし、項目 21 の出力で後続 ID に milestone を併記する。(b) capability 付与の行を単発承認 (X-1、実装済み) と別の行にし、M3 の条件から I-3 の行を除く理由を書く
- **根拠**: PO-2、AD-028 §5、roadmap M3 / M4

### [Medium] M3 の完了の条件が Tier A に限られ、roadmap と _overview の M3 の達成状態「未表示情報がゼロ」と食い違う (M-101) (scope: feature)

- **観察**: roadmap.md:245 と _overview.md:100 は「未表示情報がゼロ」。新しい条件は Tier A の `後続` だけを数え、Tier B の `後続` の行は残りうる。FR-015 は達成状態の文言の読み替えを含まない
- **推奨アクション**: FR-015 の roadmap と `_overview.md` の項目に「M3 の達成状態は AD-044 の条件で判定する」と注記するか、条件を Tier A / B に広げる

### [Low] 実行中のセッションの過去ログでは、まだ動いている task が「結果不明」と出る (L-101)

- **推奨アクション**: Edge Cases に 1 行足すか、文言を「記録に結果なし」に

### [Low] US-2 AC3 の「Hook の名前」は V-4 の結果次第で `hook_event` だけに変わりうるが、spec にその条件が無い (L-102)

- **推奨アクション**: Assumptions に `[ASSUMED]` を足し、AC3 を「名前 (または Hook の種類)」に

### [Low] (H) Hook の失敗の行に出す案内の文言にテストの観点が無い (L-103)

- **推奨アクション**: FE-012 に「`failed` の Hook の行に案内が出る。`succeeded` / `cancelled` には出ない」

### [Low] (H) SC-007 の確認は `docs/ui-coverage.md` の 1 つのパスでしか起動を確かめない (L-104)

- **推奨アクション**: V-5 に `thread.aui.tsx` と `package.json` でも起動されることを足す

## R1 指摘の判定

| R1 ID | 判定 |
|---|---|
| C-001 | resolved (FR-008 を 5 つに) |
| H-001 | resolved (AC4) |
| H-002 | resolved (FR-004 の O-4 / O-6) |
| H-003 | resolved (AC6 / FR-009 / data-model §2 / FE-010 / FE-012 / V-4.4。過去ログの側面は L-101) |
| H-004 | resolved (件数の出力・charter・SC-001。条件の達成の可否は H-101 / M-101) |
| M-001〜M-006 | resolved |
| L-001〜L-004 | resolved |

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `Tier A の.{0,3}後続\|M3 の完了の条件` (specs/011) | 9 | spec.md:42, :221, :230、data-model.md:43、research.md:104, :105、tasks.md:15, :101, :103 |
| H-101 | `I-3` (specs/011) | 5 | plan.md:98、spec.md:52, :175, :274, :277 |
| H-101 | `Permission grant` (PLAN.md / docs) | 4 | PLAN.md:349、prompts.md:222、0019:34, :44 |
| M-101 | `未表示\|表示網羅` (docs) | 6 | roadmap.md:245、_overview.md:100、ui charter:126, :135、0020:118、verify-report.md:172 |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 4
- Round inheritance: resolved from 1: 15 / unresolved: 0 / new: 6
