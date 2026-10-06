---
reviewer: architecture-reviewer
gate: pr-gate
round: 3
scope: default+adr-drift
---

# architecture-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: architecture-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 3
**Scope**: default (ARCH-1〜7) と ADR-drift (ARCH-3) を 1 本にまとめた。対象は R2 の修正の差分 `a78a291..bcd6aa4`

## 初回読了 viewpoint

- FR/SC (R2 の修正が触れたもの): FR-007 / X-4 US-1 AC7 (`useShellFocus` の失敗した close の判定、起動ダイアログは外側の押下で閉じない)、FR-006 / SC-002 (`watchedIdOf` の定義の参照の形)、FR-001 / FR-002 (サイドバーの `hidden`、スキップリンクの `focusCenter`)、FR-003 (`useFocusRescue`)、FR-008 (件数の印 `context`)、FR-016 (取得中の文言)、FR-012 / SC-006 (AD-046 :38 と訂正の節の追記)、FR-013 (glossary・charter・roadmap・prompts の記録)
- touched files に当たる charter / Confirmation: ui charter In scope :48 (composer) と :62-69、Cross-domain :166-179。session charter Cross-domain :168-171、Related Specs :204-212。AD-046 Consequences :38、訂正 :57-71、Confirmation :52-55。AD-031 Decision 1。AD-023、AD-025 §7、AD-020 D1、AD-044、AD-038 D5、AD-043。Constitution XII / XIV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (CSP と protocol の変更は無い)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:3
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

R2 の修正は renderer と記録と reviewers.yml だけ。domain・agents・preload・main の差分は 0。**accepted ADR の Decision 1〜6 を変える箇所は無い。AD-046 :38 の参照と訂正の節の追記は決定を変えていない。** R2 の自分の指摘 7 件はすべて直った。新しく見つかったのは文書の小さな食い違い 4 件で、どれも Low。原因は (1) R2 の追記で ADR と charter の「同じ内容」が成り立たなくなった (2) シェルが session のストアの状態の形から「失敗した close」を推し量っていて前提が書かれていない (3) 新しい語と持ち主の記録が charter と合っていない。

## Round 2 の指摘の判定

| R2 ID | 判定 | 確かめた事実 |
|---|---|---|
| M-101 | **resolved** | session charter :171・:207-211、ui charter :177-179、roadmap :231-233。行数 552 / 632 は実ファイルと一致。シェルが呼ぶ session のストアの操作は `dismissLaunchNotice` の 2 か所だけ (`LaunchDialogHost.tsx:40`、`useShellFocus.ts:53`) |
| M-102 | **resolved** | glossary.md:855-857、session-view.ts:436-437、SessionAttentionAnnouncer.tsx:13。`stores/ui.ts:113-127` と食い違う箇所は 0 |
| L-101 | **resolved** | ui charter :168-170 |
| L-102 | **resolved** (追記の文面から L-201) | :38 に「(下の「訂正」節)」。`stores/ui.ts:13-15` と data-model.md:26 は charter を参照 |
| L-103 | **resolved** | prompts.md:312 |
| L-104 | **resolved** | roadmap の (4)、useSessions.ts:92-93、session-service.ts:189 |
| L-105 | **resolved** | quickstart-results の V-3 / V-3b |
| L-006 | **unresolved** (持ち越し) | `setFocus(` (テスト以外) 5 件はすべて useShellFocus.ts。検出の手段が無い |
| L-007 | **unresolved** (持ち越し) | CI の e2e は未記録。V-3b も未実施 |

## ADR-drift (R2 の修正の差分に対して)

| ADR | 照合した対象 | 結果 |
|---|---|---|
| AD-046 Decision 1〜6 | Decision 節の差分 0。サイドバーの `hidden`、外側の押下、概要のモデル行、F 節の置き場所の語 | 違反なし |
| AD-046 Consequences :38 | 末尾に参照を足しただけ | 合っている (AD-024 の先例と同じ形) |
| AD-046 訂正 :70-71 の追記 | AD-031 Decision 1 | 決定の変更は無い。日付が無いことと事実と合わない一句 → L-201 |
| AD-025 §7 | CSP の差分 0。`focusCenter` は属性の付け外しだけ | 違反なし |
| AD-023 | 本番コードの feature → shell の import は 0 | 違反なし |
| AD-020 D1 / AD-044 | ui-coverage.md の追記と F 節の語の規則 | 違反なし |
| AD-038 D5 | e2e と基準画像の変更なし | 違反なし |
| AD-043 | provider の寿命。読み上げは App の階層 (App.tsx:20) で `hidden` の影響を受けない | 違反なし |

## Findings

### [Low] R2 の追記で、AD-046 の訂正の節と ui charter の「同じ内容」が成り立たなくなった。ADR に足した一文には日付が無く、「ui charter にだけある」は事実と違う (L-201) (scope: feature)

- **観察**: `0046-app-shell-layout.md:70-71` は R2 (2026-10-06) の追記だが節の日付は 2026-10-05 / R1 のまま。「`dismissLaunchNotice` を呼ぶ … は ui charter にだけある」と書くが、session charter :171・:207-211、data-model.md:35・:51、roadmap :231 にもある。`docs/domains/ui/charter.md:173` は「AD-046 の訂正の節と同じ内容」と書くが、charter :177-179 に ADR に無い文がある。`stores/ui.ts:14` の「(AD-046 の訂正の節)」も同じ前提
- **同種事象探索**: `訂正の節と同じ内容|AD-046 の訂正の節|ui charter にだけある` 3 件 (ui/charter.md:173、stores/ui.ts:14、0046:71)
- **推奨アクション** (最小案): (1) charter :173 を「AD-046 の訂正の節 (2026-10-05 の時点の記録) に、その後の追加を足したもの」に (2) ADR :70-71 に「(2026-10-06 追記)」を足し、「ui charter にだけある」を「本 ADR には書かず charter の側にある」に直すか、例の句を消す (3) `stores/ui.ts:14` の括弧を外す
- **根拠**: AD-031 Decision 1、ARCH-2 / ARCH-3

### [Low] シェルが session のストアの状態の形から「失敗した close」を推し量っている。前提の不変条件がシェルのコメントにしか無い (L-202) (scope: feature)

- **観察**: `useShellFocus.ts:38-42` は「`launch` の参照が変わり、`previousFailure` が非 null で、`order` が減った」をもって判断する。前提は :38 のコメントだけ。store の `close` の doc (`running-session-store.ts:515-559`)、`dismissLaunchNotice` (:55-59)、session charter :207-211 は、ui がこの形を読んでいることを書いていない。R2 で `selectedId` の条件を外したので推論に頼る範囲が広がった
- **同種事象探索**: `next\.launch !== prev\.launch|order\.length <` (shell) 1 件。`previousFailure:` を立てる箇所は store に 1 件 (:554)
- **リスク/影響**: X-6 が行を減らすか `previousFailure` を立てる別の経路を足すと、シェルが黙って告知を消すか起動ダイアログを開く。経路のテスト (AppShell.test.tsx:1030 / :783) は崩れを捕まえるが、どの不変条件が崩れたかは読み取れない
- **推奨アクション** (最小案): store の `close` の doc と session charter :207-211 の O-7 の項に「ui のシェルはこの組み合わせを失敗した close として読む。ほかの操作でこの組み合わせを作らない」を 1 文。明示の通知 (`closeSeq` など) を足すかは持ち主が判断
- **根拠**: ARCH-5、ui charter :179

### [Low] 新しい横断の語「起動の告知」が glossary に無い (L-203) (scope: feature)

- **観察**: ui charter :177-178 と session charter :171・:207 が「起動の告知 (拒否の理由と前回の失敗) を消す操作」と呼ぶ。glossary に「告知」は 0 件
- **同種事象探索**: `起動の告知|失敗の告知|拒否の告知` docs 4・src 5、glossary 0
- **推奨アクション**: glossary に「起動の告知 (launch notice): 起動ダイアログに出す拒否の理由 (`rejectReason`) と前回の失敗 (`previousFailure`)。`lastConfig` は含まない」を足すか candidate として登録
- **根拠**: Constitution XIV、ARCH-7

### [Low] composer がフォーカスを奪う件の持ち主を session の X-6 にしたが、composer は ui charter の In scope で、X-6 は critical path の外にある (L-204) (scope: feature)

- **観察**: `docs/roadmap.md:189-197` の持ち主は X-6。直す箇所は `thread.aui.tsx:579` の `ComposerPrimitive.Input` か呼び出し元。ui charter :48 は composer を ui の In scope に置く。X-6 は roadmap :291-295 の「M2 の後続 (critical path 外)」で着手の時期が無い。M3 の O-5 は slash commands を持つ ui の feature で composer に触れうる
- **推奨アクション** (最小案): 持ち主を「composer を次に触る feature (O-5 か X-6 の早いほう)」にするか、X-6 のままなら ui charter の composer の項に 1 文書く
- **根拠**: ARCH-2、ui charter In scope :48

### [Low] (H) 持ち越し: 「focus を書くのは `useShellFocus` だけ」に検出の手段が無い (L-006) (scope: feature)

- **推奨アクション**: R1 と同じ

### [Low] (H) 持ち越し: composer の基準画像の CI の結果と V-3b が未記録 (L-007) (scope: feature)

- **推奨アクション**: CI の e2e の合否と V-3b を記録してから completed に進む

### H の観点 (担当範囲)

- L-201 / L-203 / L-204 は文書の食い違いで、検出するテストや検査は無い
- L-202 の振る舞いは AppShell.test.tsx:1030 と :783 が確かめる。store の `dismissLaunchNotice` の単体テストは 0 件のまま
- 既存の振る舞いを壊していない根拠: domain・main・preload・agents の差分 0、逆向き import 0、基準画像の差分 0。quickstart-results の vitest 1969 passed・depcruise 0・Constitution ok 20・E2E 11 passed は修正した側の申告で本 reviewer は実行していない。R2 の E2E の計測の行は値が無く、O-3 の比較の基準にはならない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-201 | `訂正の節と同じ内容\|AD-046 の訂正の節\|ui charter にだけある` | 3 | docs/domains/ui/charter.md:173 / src/renderer/src/stores/ui.ts:14 / docs/decisions/0046-app-shell-layout.md:71 |
| L-202 | `next\.launch !== prev\.launch\|order\.length <` (shell)、`previousFailure:` (store) | 1 / 1 | useShellFocus.ts:39-42 / running-session-store.ts:554 |
| L-203 | `起動の告知\|失敗の告知\|拒否の告知` (glossary) | 0 (docs 4・src 5) | ui/charter.md:177 / session/charter.md:171,207 / roadmap.md:231 |
| L-204 | `ComposerPrimitive\.Input` (本番) / roadmap の持ち主 | 2 / 1 | thread.aui.tsx:579,1053 / roadmap.md:196-197 |
| L-006 | `setFocus\(` (テスト以外) | 5 (すべて useShellFocus.ts) | useShellFocus.ts:33,46,63,69,74 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 6 (L-201, L-202, L-203, L-204, 持ち越しの L-006, L-007)
- Round inheritance: resolved from 2: 7 / unresolved: 2 (L-006, L-007) / new: 4 (L-201〜L-204)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
