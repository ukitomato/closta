# po-reviewer Review: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-012 / SC-001〜SC-005。Story は US-1 (P1) の 1 本で、AC 1〜7、Edge Cases 6 件。U-6 は 2026-10-31 に足された
  - FR-001 / FR-002 / FR-012: 起動の設定・composer・プリセットに `auto` を足す (FE-013 / FE-014 / BE-013)
  - FR-003 / FR-004 / SC-002: 許可の 4 値の検査と、昇格の値への経路が 0 件であること (BE-001〜BE-004 / BE-012)
  - FR-005〜FR-007 / SC-001 / SC-003: 確認、true のランタイムで確認を省く (U-6)、main による印の検査 (BE-010 / FE-012〜FE-014)
  - FR-008 / SC-004: Auto の帯、`allowed` でも「隔離されていない」と読める文にすること、読み上げを 1 回にすること (FE-010 / FE-015)
  - FR-009〜FR-011: AD-066・Principle III の改定・記録 (SH-001 / SH-010 / SH-011)
  - SC-005: quickstart V-3
- touched files に該当する charter / Confirmation: session charter の Mission / Journey 3 / 業務ルール :188-190 / KPI :195-219。isolation charter の KPI「権限ゲートの正しさ」(data-model §11 で書き換える)。AD-066 は proposed なので、Confirmation を読む対象に入らない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲 (Principle III の改定と AD-066 を含む)
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:5 Low:4
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage の各 optional reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

Round 2 で見たのは、Round 1 の後に入った修正である。

- **U-6 の追加**: `isAutoModeAllowed` が true のランタイムでは確認を省き、そのリスクを受け入れると明記した
- **帯の文言 (FR-008 / §9)**: `allowed` でも「隔離されていない」と読める文にした
- **読み上げの置き場所 (§5.3)**: `PermissionModeBanners key={sessionId}` の中に、常に mount する `AutoModeAnnouncer` を置く形にした
- **承諾の寿命 (§6.2)**: `autoAckRuntimeId` を mount するたびに `null` から始め、プリセットの適用・権限モードを `auto` 以外にしたとき・ランタイムの変更で消す
- **再開の経路**: renderer の配線 (§6.4) と、そのテスト (FE-013 の `LaunchDialog.resume.test.tsx`) を足した

前 round の High (読み上げ規則) は直っている。残っているのは Medium と Low だけで、どれも spec の文面 (KPI との紐付け・SC-005 の合否・Out of Scope への明記) か、回復の導線の細部である。U-6 で受け入れたリスクは利用者が承認した判断なので、ここでは蒸し返さない。

## Findings

### [Medium] User Story の benefit が charter の KPI / Journey に結び付いていない (M-001) (scope: feature) [unresolved from prev]

- **観察**: `spec.md:44` の Why this priority は「利用者が今いちばん速く欲しい機能」のままである。session charter の KPI (`charter.md:195-219`) と Journey 3 (差配) への言及は spec に無い
- **同種事象探索**: `KPI|Journey` を spec.md / data-model.md / tasks.md / quickstart.md で検索して、spec の価値の記述では 0 件 (data-model.md:266 の isolation charter の KPI の書き換えだけ)
- **リスク/影響**: 承認待ちによる停止が減ったかを、後から評価する指標が無い
- **推奨アクション**: Why に Journey 3 との対応を 1 文で書く。KPI に紐付かないなら、その旨を明記する
- **根拠**: PO-1
- **scope 根拠**: spec.md の文面

### [Medium] SC-005 に合否の基準が無い (M-002) (scope: feature) [unresolved from prev]

- **観察**: `spec.md:97` は「記録する」だけである。`plan.md:386` / `:332` (RK-05) は読み方を足したが、閾値は足していない。`quickstart.md:28` も記録だけを求める
- **同種事象探索**: `SC-005` は前 round と同じ 5 か所 (spec.md:97, plan.md:332, plan.md:386, quickstart.md:25, research.md)。どこにも合否の条件が無い
- **リスク/影響**: 全操作に承認カードが出た場合 (`auto` が実質的に効いていない場合) でも、SC-005 を満たしたことになる
- **推奨アクション**: 「init の `permissionMode` が `auto` であること」と「承認カードを経ずに実行された tool が 1 件以上あること」を合否の条件にする
- **根拠**: PO-2
- **scope 根拠**: spec.md / quickstart.md

### [Medium] renderer と main で capability がずれたとき、`auto-mode-unconfirmed` から回復できない (M-003) (scope: feature) [unresolved from prev]

- **観察**:
  - §6.2 (`data-model.md:152`) は「拒否で作り直したダイアログでも `null`」とした。この形だと、普段の拒否の後は確認が出直す
  - しかし DTO の `autoModeAllowed` が true で、main の `runtimes.snapshot()` が false のとき (`data-model.md:79` / `:151`) は次のように止まる
    1. renderer は確認不要と判定して `ack=false` を送る
    2. main が拒否する
    3. 文言 (`data-model.md:243`) に従って選び直しても、確認は出ない
  - U-6 で true の経路を正式に残したので、この食い違いが起こりうる面は前 round と変わらない
- **同種事象探索**: `auto-mode-unconfirmed` の回復の手順を書いた箇所は data-model / contracts / tasks で 0 件
- **リスク/影響**: 利用者は起動も切り替えもできないまま、同じ操作を繰り返すことになる
- **推奨アクション**: renderer が `auto-mode-unconfirmed` を受けたら、DTO にかかわらず次の 1 回は確認を出す (または runtimes を refetch する)。この規則を §6.2 / §6.3 に足し、FE-013 / FE-014 にテストを足す
- **根拠**: PO-6 (recovery flow)
- **scope 根拠**: data-model §6 と FE-013 / FE-014

### [Medium] `auto` が使えない環境での失敗が、汎用の表示のまま Out of Scope にも書かれていない (M-004) (scope: feature) [unresolved from prev]

- **観察**: `spec.md:102` (Assumptions) と `plan.md:329` (RK-02) は、失敗を今の経路で出すとしている。`spec.md:105-110` の Out of Scope には書かれていない
- **同種事象探索**: Out of Scope で `disableAutoMode|使えない` を検索して 0 件
- **リスク/影響**: 確認まで済ませた利用者が、原因の分からない失敗に行き当たる
- **推奨アクション**: Out of Scope に「`auto` を使えない環境向けの専用の表示は持たない」と明記する
- **根拠**: PO-4
- **scope 根拠**: spec.md

### [Medium] どのセッションが Auto で動いているかを、稼働中の一覧から見分けられない (M-005) (scope: feature) [unresolved from prev]

- **観察**: 帯は表示中のセッションにしか出ない (`data-model.md:125-134`)。一覧の行に表示するかどうかも、除外の宣言も spec に無い
- **同種事象探索**: `稼働中の一覧|サイドバー` を spec / data-model / tasks / quickstart で検索して 0 件
- **リスク/影響**: charter Journey 3 の差配では、隔離の無いホストで Auto が動いているセッションを一覧から見落とす
- **推奨アクション**: Out of Scope に理由を添えて明記するか、一覧の行に印を出す
- **根拠**: PO-7 / PO-4
- **scope 根拠**: spec.md

### [Medium] `lastConfig` から復元した `auto` で確認が出ることを固定するテストが無い (M-006) (scope: feature) [unresolved from prev。寿命の規則は解消、テストが未解消]

- **観察**:
  - §6.2 (`data-model.md:152`) が「`lastConfig` の復元でも `null`」と寿命を定めたので、規則の上では確認が出る
  - しかし FE-013 のテスト (`tasks.md:64`) はプリセット・ランタイムの変更・再開の形だけを扱い、`lastConfig` の経路が無い
  - spec の Edge Cases (`spec.md:63`) も、挙げているのはプリセットだけである
- **同種事象探索**: `lastConfig|前回` を tasks.md で検索して 0 件
- **リスク/影響**: U-4 の「毎回、明示の確認」が 2 回目の起動で抜けても、捕まえるテストが無い。`lastConfig` は既定の初期値 (`LaunchDialog.tsx:261`) なので、最もよく通る経路である
- **推奨アクション**: FE-013 に「`lastConfig.permissionMode = auto` でダイアログを開き、そのまま起動を押すと `'launch'` の確認が出る」を足す。spec の Edge Cases にも 1 文足す
- **根拠**: H (AC に対するテスト)、U-4
- **scope 根拠**: tasks.md FE-013 / spec.md

### [Medium] 隔離の無いホストでの Auto の承諾・拒否が、main のログに残らない (M-007) (scope: feature) [unresolved from prev]

- **観察**: data-model §4.2 (`:77-87`) にも contracts にも、`auto-mode-unconfirmed` の拒否と承諾つきの受理を記録する規定が無い
- **同種事象探索**: `ログ|log` を data-model / contracts で検索すると、`quickstart.md:22` が既存のログを参照するだけ。規定は 0 件
- **リスク/影響**: M-003 の袋小路が起きたとき、サポートが原因を切り分けられない
- **推奨アクション**: main の既存のログに、拒否と承諾つきの受理を 1 行ずつ出す。値は列挙だけにし、パスは含めない
- **根拠**: H (observability) / PO-7
- **scope 根拠**: data-model §4.2 / BE-010

### [Low] Edge Cases の 5 つ目「今の規則のまま」が、稼働中の行の扱いと食い違う (L-001) (scope: feature) [unresolved from prev]

- **観察**: `spec.md:64` の文言は前 round のままである。`plan.md:384` は直さないとしている
- **同種事象探索**: 該当は 1 件 (`spec.md:64`)
- **リスク/影響**: spec だけを読んでテストを書くと、稼働中の行の扱いを誤る
- **推奨アクション**: 「稼働中・過去の行とも初期値は `default`」と書き直す
- **根拠**: PO-3
- **scope 根拠**: spec.md

### [Low] SC-001 の「操作」の数え方の範囲が決まっていない (L-002) (scope: feature) [unresolved from prev]

- **観察**: `spec.md:93` は前 round のままである
- **同種事象探索**: 該当は 1 件
- **リスク/影響**: テストが何を数えるかが一意にならない
- **推奨アクション**: 範囲を「Auto の選択から選択の確定まで」に限る
- **根拠**: PO-2
- **scope 根拠**: spec.md

### [Low] 解決済みの `[ASSUMED]` が spec に残っている (L-003) (scope: feature) [unresolved from prev]

- **観察**: `spec.md:103` に残っている。文言は data-model §9 で決まっている
- **同種事象探索**: 該当は 1 件
- **リスク/影響**: 読み手が、文言はまだ決まっていないと誤解する
- **推奨アクション**: §9 への参照に置き換える
- **根拠**: PO-3
- **scope 根拠**: spec.md

### [Low] `refetch` で起動の時点の確認 (`'launch'`) が黙って閉じる (L-004) (scope: feature) [new]

- **観察**: `data-model.md:163` は `refetch` で `autoConfirm = null` にする。起動を押して `'launch'` の確認が出ている間に refetch が起きると、確認が消える。起動も行われず、利用者への知らせも無い
- **同種事象探索**: `refetch` を data-model で検索して 1 件 (`:163`)
- **リスク/影響**: 起動を押した結果が何も起きないように見える
- **推奨アクション**: `'launch'` の確認は refetch で閉じないか、閉じたら起動を押し直すよう示す
- **根拠**: PO-6
- **scope 根拠**: data-model §6.2

### Round 1 からの解消

- 前 round の H-001 (読み上げ規則): **resolved from prev**。`data-model.md:125-134` (§5.3) で、置き場所・`key={sessionId}`・`null → auto` の扱いを決めた。テストは `tasks.md:68` (FE-015) のセッションの切り替えと、quickstart V-1.4 / V-2.5 にある
- 前 round の M-007 (再開の経路のテスト): **resolved from prev**。`tasks.md:64` に `LaunchDialog.resume.test.tsx` の 4 項が入り、§6.4 に配線も入った
- 前 round の M-006 (`autoAckRuntimeId` の寿命): 寿命の規則は解消した。テストは未解消なので、上の M-006 として残す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `KPI\|Journey` (spec / data-model / tasks / quickstart) | 0 (価値の記述) | — |
| M-002 | `SC-005` | 5 | spec.md:97, plan.md:332, plan.md:386, quickstart.md:25, research.md |
| M-003 | `auto-mode-unconfirmed` の回復の手順 | 0 | — |
| M-004 | Out of Scope の `disableAutoMode\|使えない` | 0 | — |
| M-005 | `稼働中の一覧\|サイドバー` | 0 | — |
| M-006 | `lastConfig\|前回` (tasks.md) | 0 | — |
| M-007 | `ログ\|log` (data-model / contracts) | 0 (規定) | quickstart.md:22 (参照のみ) |
| L-001 | `今の規則のまま` | 1 | spec.md:64 |
| L-002 | SC の `操作` | 1 | spec.md:93 |
| L-003 | `ASSUMED` | 1 | spec.md:103 |
| L-004 | `refetch` (data-model) | 1 | data-model.md:163 |

## Verdict

- Critical: 0
- High: 0
- Medium: 7
- Low: 4
- Round inheritance: resolved from 1: 2 (H-001 / M-007) / unresolved: 10 (M-001〜M-006 / M-008 → 今回 M-001〜M-007、L-001〜L-003) / new: 1 (L-004)
