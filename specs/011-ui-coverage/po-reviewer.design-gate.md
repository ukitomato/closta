# po-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: po-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 1 (design-gate)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-007 はすべて範囲内
- 関係する charter / Confirmation: ui charter の Mission、業務ルール「未割当の間は completed にしない」(:126)、KPI「表示網羅」(:135)、Journey 2 / 4、Open Questions (:180-195)。AD-020 Decision 1。AD-035 Trade-off (:96-97)。Constitution XII (:712-734) / XIII (:755, :763)。roadmap M3 の達成状態「未表示情報がゼロ」(:245)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (PO の価値・計測に関わる記録の不整合は E に含めた)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲 (bad_pattern_grep の誤検出だけを E に含めた)
- E. User Story / SC / AC / UX: Critical:1 High:4 Medium:5 Low:4
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: design-gate で optional reviewer を起動していない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

(1) 対応表 (A〜F 節、A・C・E 節は機械照合)・項目 21・reviewer・O-4〜O-6・Constitution の PATCH、(2) 実行中の tool の結果と Hook / Background task の event の行、(3) transcript の密度と Tool group の既定 open、(4) 直近の活動の要点。利用者の決定 (2026-10-03) は覆していない。

## Findings

### [Critical] FR-008 が「renderer に届けなければならない」とする 3 つの subtype を、research / tasks は「送らない」と決めている (C-001) (scope: feature)

- **観察**: spec FR-008 は `hook_progress` / `task_progress` / `background_tasks_changed` を含む 8 つを届けると書く。research R-04 はこの 3 つを変換しない (表示不要 / O-4 / O-6)、tasks BE-024 は送らないことをテストし、data-model §2 の許可リストにも無い
- **同種事象探索**: `hook_progress|task_progress|background_tasks_changed` を specs/011 で 3 件 (spec.md:171, research.md:50, tasks.md:51)
- **リスク/影響**: tasks どおりなら FR-008 違反、FR どおりなら stdout / stderr を持つ `hook_progress` を通し「出力本文は通さない」と衝突する。SC-003 の合否が定まらない
- **推奨アクション**: FR-008 を通す 5 つに直し、残る 3 つは「通さず、対応表で割り当てる」と書く。SC-003 も区別できる形に
- **根拠**: design-gate の severity 緩和 (FR と設計の矛盾)

### [High] US-2 AC4 の「進み」「1 行ずつ」が、1 つの task を 1 行に保つ設計と食い違う (H-001) (scope: feature)

- **観察**: spec.md:88「始まり、進み、終わる → 1 行ずつ出る」。research R-04 は 1 つの task を 1 行、イベントごとの行は退けた。`task_progress` は送らない
- **推奨アクション**: AC4 を「task ごとに 1 行が出て、状態が同じ行で書き換わる。進捗の要約は出さない」に

### [High] `background_tasks_changed` と `task_progress` の割当先が文書ごとに違い、後続 feature の範囲にも入っていない (H-002) (scope: feature)

- **観察**: research は `background_tasks_changed` を O-6 の判断に、spec Out of Scope は「人間に諮る」にする。FR-004 の O-6 の範囲に一覧が無い。`task_progress` は O-4 だが O-4 の範囲に task の進捗が無い
- **リスク/影響**: 機械検査は ID の実在しか見ないので、範囲の合わない割当でも通る。持ち主のいない延期になる (AD-028 §5)
- **推奨アクション**: FR-004 の O-4 / O-6 の範囲に 2 つを明記し、Out of Scope と roadmap の行 (SH-010) をそろえる

### [High] Hook / Background task の行が「開始」「実行中」のまま残る negative case が無い (H-003) (scope: feature)

- **観察**: 中断・失敗・終了で `hook_response` / `task_notification` が来ない場合、過去ログに開始だけが残る場合の表示が Edge Cases にも AC にも無い。charter Journey 2 step 4
- **リスク/影響**: 終わったセッションに「実行中」が出続け、利用者が誤解する。状態を保持しない決定の下では閉じる手段も無い
- **推奨アクション**: Edge Case と AC を足す (終わりの来ていない行は「結果不明」として描く)。実現は renderer がセッションの状態を見て文言を変える、過去ログは変換の最後に `unknown` に倒す。BE-021 / BE-022 / FE-012 にも

### [High] 「後続 feature の ID も割当」と読むと KPI「表示網羅」は O-2 で自明に満たされ、M3 の「未表示ゼロ」までの残りを測る経路が無い (H-004) (scope: feature)

- **観察**: 後続の行が残っても completed にできる (利用者の決定)。charter の KPI は「未割当行が 0」のまま、roadmap M3 は「未表示情報がゼロ」、SC-001 は未割当 0 しか測らない
- **リスク/影響**: O-2 の時点で KPI が 0 になり、Tier A の `後続` 行の残りをどこも数えない。M3 の完了が測れない
- **推奨アクション**: 項目 21 の出力に割当の種類 × Tier と後続 feature の ID 別の件数を出す。charter の KPI に「Tier A の `後続` 行が 0 (M3 の完了の条件)」を足すか、roadmap M3 に読み方を書く。SC-001 の計測経路にも

### [Medium] FR-012 の「利用者の開閉を上書きしない」と、切り替え時に作り直す設計が食い違う (M-001) (scope: feature)

- **推奨アクション**: FR-012 を「新しいメッセージ・ストリーミングでは上書きしない。密度の切り替えでは全 Tool group が新しい既定に戻る」に限定し、AC にも

### [Medium] SC-003 と RK-01 / RK-04 が実機の目視 (V-4) に頼るが、目視前の対応表の書き方と SC の判定が無い (M-002) (scope: feature)

- **推奨アクション**: Assumptions に V-4 前の既定 (経路は「実行中」、備考に「過去ログは未確認 (V-4)」) を足す。AC5 を条件付きに。SC-003 を自動と V-4 に分ける

### [Medium] Hook の失敗を利用者が調べる手段が無い。exit_code の扱いも文書ごとに違う (M-003) (scope: feature)

- **推奨アクション**: `exit_code` の扱いをそろえる (出すなら許可リストに入れ data-model を直す)。失敗の行の文言に調べる場所を足すかを決め、Edge Cases に書く

### [Medium] 経路の列の `—` が Constitution XII の `bad_pattern_grep` に引っかかる (M-004) (scope: feature)

- **推奨アクション**: 経路の列の値を `なし` にするか、PATCH で grep を割当の列に絞る・削除する

### [Medium] 既定 comfortable で Tool group を開く根拠と、同じ画面に 2 つある密度の切り替えの見分け方が無い (M-005) (scope: feature)

- **推奨アクション**: 既定の根拠を Assumptions に書く。監視ビューの密度と区別できる文言・位置を FR に足し、FE-022 の観点に

### [Medium] (H) Tool group を既定で開くと、既存の R-4 テストとスクロールの安定が回帰しうる (M-006) (scope: feature)

- **観察**: `ChatScreen.test.tsx:85-88` の `expandToolGroups` は既定で閉を前提にクリックする。:454 以降の共存テストも同じ前提。FE-022 に既存テストの直しが無い。スクロールの安定の影響は目視だけ
- **推奨アクション**: FE-022 に既存テストの直しと `virtualization.test.tsx` を comfortable で通すことを足す

### [Low] SC の文言の「期待どおり」「秘密の形の文字列」が判定基準を外に預けている (L-001)

- **推奨アクション**: SC-005 は US-3 の AC を名指し、SC-006 は「FR-014 の表で出すフィールド以外の値と `NAME=value` の値が 0 件」に

### [Low] FR-014 の「対応表の tool の行と同じ箇所から参照できるように」をテストできない (L-002)

- **推奨アクション**: 「C 節の該当行の備考に data-model §4 への参照を書く」のように確かめられる形にするか削る

### [Low] SDK を上げたときの開発者の手順と、SDK が無いときの pending の扱いが無い (L-003)

- **推奨アクション**: SDK を上げたときの手順を quickstart か対応表の冒頭に書く。CI で pending を失敗とするかを明記する

### [Low] session charter に書く「状態を保持しない」は、tool の結果待ちの Map と範囲を分けて書く (L-004)

- **推奨アクション**: 「Hook / BG の状態は保持しない。tool の結果の対応づけはセッションスレッドの中で一時的に持つ (上限 256、セッションの終了で破棄)」

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `hook_progress\|task_progress\|background_tasks_changed` (specs/011) | 3 | spec.md:171, research.md:50, tasks.md:51 |
| H-001 | `1 行ずつ\|進み\|1 行にする\|1 行に保つ\|同じ id の 1 行` | 4 | spec.md:88, plan.md:11, research.md:48, tasks.md:51 |
| H-002 | `一覧\|O-6\|人間に諮る` | 3 | research.md:50, spec.md:161, spec.md:250 |
| M-004 | `ui-coverage\|bad_pattern_grep` (scripts/) | 0 | constitution.md:717 にだけある |
| M-006 | `defaultOpen\|Tool group\|tool-group` (renderer の test) | 4 | ChatScreen.test.tsx:85, :454, :455, :486 |

## Verdict

- Critical: 1
- High: 4
- Medium: 6
- Low: 4
