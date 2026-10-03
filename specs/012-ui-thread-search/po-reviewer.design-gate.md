# po-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: po-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016、SC-001〜SC-007
- 該当 charter / Confirmation: ui charter (Scope :50、Principle VIII / XII / XIII)、session charter (KPI「再利用率」:158-159、「並列時の滑らかさ」の持ち主 :146)、roadmap O-3 の行 :255 / :155 / :170-172、013 spec の O-3 への申し送り (:58, :258-260)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の Owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の Owner 範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の Owner 範囲
- E. User Story / SC / AC / UX: Critical:0 High:3 Medium:4 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の Owner 範囲
- G. optional reviewer 範囲: 該当なし: po-reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

「探す」4 つと義務 2 つ。義務 (O-1)(2) は O-8、map / timing / heat graph と本文の横断検索は O-9。roadmap の O-3 の義務はすべて「受ける」か「送る」に割り当て済み。受け手が無いのは 013 spec からの「1 つの一覧に混ぜるかの再検討」1 件 (M-003)。

## Findings

### [High] KPI「再利用率」の定義と、起動元の分類規則がずれている。計測経路を作っても KPI を判定できない (H-001) (scope: feature)

- **観察**: KPI (`session/charter.md:158`) は「プリセット経由の起動が、全軸を手で選ぶ起動を上回る」。FR-009 は「適用したら `preset`、それ以外は `manual`。適用後に軸を変えても `preset`」。分子も分母も一致しない
- **同種事象探索**: 3 件 (charter:158 / spec.md:65 / spec.md:213)。揃える記述 0 件
- **推奨アクション**: (a) KPI の文言を「プリセットを適用した起動が、適用しない起動を上回る」に改める (未承認の判断の表へ) か (b) 3 値に。SC-005 に「2 つの数で KPI の不等式を判定できる」
- **根拠**: PO-2 / PO-1

### [High] Thread search の一致 0 件が既存の `filtered-out` に合流するが、その表示は「語を消す」操作を持たず、文言も AC と違う (H-002) (scope: feature)

- **観察**: 既存の `filtered-out` (`SessionListScreen.tsx:1050-1063`) は「絞り込みに一致するセッションがありません。」と、所在・フォルダだけを解除するボタン。data-model §5 は既存の文言を変えないとする
- **同種事象探索**: `filtered-out` (src/renderer) 3 件 (:640,849,1050)。変えると書いた箇所 0 件
- **推奨アクション**: Thread search 用の 0 件の文言とボタンの動作を決め、`filtered-out` を変えるか `search-empty` を足すかを決める。§5 の例外として明記
- **根拠**: PO-3 / PO-4 / SC-004

### [High] 会話内検索は「追加分だけを走査」と定めているため、ストリーミング中に伸びる本文の一致が数えられない (H-003) (scope: feature)

- **観察**: data-model §2 / FE-020 は追加分だけ。Edge case と AC5 は件数の更新を求める。本文が伸びる場合と O-2 の送り直しを走査し直す規則が無い
- **同種事象探索**: `追加分だけ` 2 件、更新の規則 0 件
- **推奨アクション**: 追加と本文が変わったメッセージを走査し直し、そのメッセージの hits を置き換える。`current` は同じ hit (messageId + occurrence) を指し続ける。FE-022 にテスト
- **根拠**: PO-4 / PO-3

### [Medium] 未登録グループは既定で畳まれており、絞り込みが開閉を書き換えないと一致したセッションが見えない (M-001) (scope: feature)

- **観察**: `SessionListScreen.tsx:200-201` で未登録は既定で閉じる
- **推奨アクション**: 検索中は畳まれたグループも一致した行を出す (語を消せば元に戻る) か、見出しに件数。AC を 1 つ

### [Medium] Ctrl+K / Ctrl+F をモーダルのダイアログが開いている間に押したときの扱いが無い (M-002) (scope: feature)

- **同種事象探索**: `モーダル|ダイアログが開` (specs/012) 0 件
- **推奨アクション**: モーダルの間は無視する Edge case。FE-031 に

### [Medium] 013 spec が O-3 に申し送った「稼働中と過去を 1 つの一覧に混ぜるかの再検討」に受け手が無い (M-003) (scope: feature)

- **同種事象探索**: specs/012 で 0 件、specs/013 で 2 件 (:58, :259)
- **推奨アクション**: plan の申し送りの表に 1 行。本 feature で結論を書くか登録済みの feature に送る
- **根拠**: PO-7、AD-028 §5

### [Medium] SC-002 の性能の基準が「jsdom の目安」で、合否を判定できない (M-004) (scope: feature)

- **推奨アクション**: 判定方法 (中央値・N 回) を書くか、構造の条件 (入力 1 回あたりの走査 ≤ 1、追加分の走査が全件にならない) で判定し時間は参考値

### [Low] US-1 / US-3 の benefit が計測で結び付いていない (L-001) (scope: feature)

- **推奨アクション**: quickstart V-3 に「過去のセッション 50 件以上で、語 1〜2 個で絞れたか」

### [Low] Thread search の placeholder の文言が、対象のフィールドと一致しない (L-002) (scope: feature)

- **推奨アクション**: placeholder に「フォルダ」

### [Low] US-1 AC5「セッションを開いて戻る」が、O-7 の 3 面のシェルの語彙と合わない (L-003) (scope: feature)

- **推奨アクション**: 「セッションを選んで中央が切り替わっても語と結果は保たれる」。サイドバーの畳みでも保つか

### [Medium] (H) 再利用率の記録の書き込みに失敗しても観測点が無い (M-005) (scope: feature)

- **推奨アクション**: main のログに失敗の種類 (コードだけ) を 1 行。読めない状態ではプリセットの欄に「記録を読めません」

### [Medium] (H) H-001〜H-003 と M-001 を検出するテストが tasks に無い (M-006) (scope: feature)

- **同種事象探索**: `畳|本文が伸び|軸を変え` (tasks.md) 0 件
- **推奨アクション**: FE-011 / FE-022 / FE-040 に 1 行ずつ

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `全軸を手で選ぶ\|それ以外は .manual\|適用した後に軸を変えても` | 3 | session/charter.md:158 / spec.md:65 / spec.md:213 |
| H-002 | `filtered-out` (src/renderer) | 3 | SessionListScreen.tsx:640,849,1050 |
| H-003 | `追加分だけ` (specs/012) | 2 | data-model.md:30 / tasks.md:30 |
| M-001 | `useState\(!collapsible\)` | 1 | SessionListScreen.tsx:201 |
| M-002 | `モーダル\|ダイアログが開` (specs/012) | 0 | — |
| M-003 | `混ぜ\|1 つの一覧` (specs/012 / 013) | 0 / 2 | 013 spec.md:58,259 |
| M-004 | `目安` | 1 | spec.md:269 |
| M-005 | `握りつぶ\|失敗は記録しない` | 2 | spec.md:156 / plan.md:165 |
| M-006 | `畳\|本文が伸び\|軸を変え` (tasks.md) | 0 | — |

## Verdict

- Critical: 0 / High: 3 / Medium: 6 / Low: 3
