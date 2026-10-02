# po-reviewer レビュー: セッション監視ビュー (O-1)

**Run**: 2026-10-02T17:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-004: US-1。強調、見出しとナビの件数、移動先、App の寿命の live region
  - FR-005〜FR-007: US-2。経過時間、直近の活動、枠の使用数と上限時の案内
  - FR-008〜FR-009: US-3。密度
  - FR-010: renderer の中で閉じる
  - FR-011〜FR-012: US-4。E2E と実機計測、有効な回の条件
  - FR-013: 記録の追随
  - SC-001〜SC-006: 全件
- 該当する charter / Confirmation:
  - session charter: Journey 3 (`docs/domains/session/charter.md:88-92`)、KPI「並列時の滑らかさ」(`:130`)、Scope の「監視ビュー」(`:49`)、`:176` の「X-6 / O-1 は未着手」
  - ui charter: `:42` の情報密度、`:102-105` の Journey 4
  - X-5 から継承するもの: FR-005 / FR-011 / SC-003 と `session-limit` の文言 (`src/renderer/src/features/session/labels.ts:35`)
  - AD-043 Decision 3 / 4、AD-038 D2 / D3
- A. 認可 / 認証 / secret 管理: 該当なし: PO 観点の範囲外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: PO 観点の範囲外 (直近の活動の XSS 境界は security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が担当
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:2 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が担当
- G. optional reviewer 範囲: 該当なし: optional reviewer は起動されていない。読み上げの細部は、E の UX negative に関わるものだけを E で扱った
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

R1 の後に改訂された spec / plan / tasks / data-model / research / quickstart を、PO 観点で読み直した。改訂で次の 3 つが加わった。

- グローバルのナビ「セッション起動」に承認待ちの件数を出す。live region を App の寿命に置く。一覧の見出しに失敗の件数を出す。いずれも [USER 決定 design-gate]
- 実機計測に「有効な回」の条件を足した (FR-012)
- 件数ボタンの移動先を「表示中を除く最古」に一本化した。直近の活動の定義をそろえ、送信直後の分岐を足した

[USER 決定] の 7 件は前提として扱った。その範囲の中で、価値、計測可能性、負の経路を検査した。

### R1 の High の解消状況

| R1 ID | 内容 | R2 判定 | 根拠 |
|---|---|---|---|
| H-001 | セッション画面以外では承認待ちが見えず、通知もされない | **resolved** (一部が新しい指摘 H-101 / M-101 に派生) | FR-002 のナビの件数 (`spec.md:155`)、FR-004 の App の寿命 (`spec.md:158`)、US-1 AC6 (`spec.md:72`)、FE-003 (`tasks.md:47`)、V-4 step 3 (`quickstart.md:42`) |
| H-002 | 既定の comfortable で、画面外にある失敗の行を見逃す | **resolved** | FR-003 の見出しの失敗の件数 (`spec.md:156`)、AC4 (`spec.md:70`)、SC-001 (`spec.md:239`)、FE-003 (`tasks.md:45`) |
| H-003 | 実機計測に「その回が有効か」の条件が無い | **resolved** (条件の文面は入った。ただし条件の一部を計測する経路が無い。H-102 として new) | FR-012 (`spec.md:200`)、SC-005 (`spec.md:243`)、SH-032 (`tasks.md:87`) |

### R1 の Medium / Low の解消状況

- **M-001 resolved**: 移動先を「表示中を除く最古」に一本化した (`spec.md:152`, `data-model.md:64`, `research.md:27-29`)
- **M-002 resolved**: 移れる先が無いときは押せず、理由を示す (`spec.md:130`, `spec.md:154`)
- **M-003 resolved**: X-5 の `session-limit` の文言を正本として再利用する (`spec.md:177`)
- **M-004 resolved**: 同じ更新で遷移した複数のセッションを 1 文にまとめる (`spec.md:159`, `data-model.md:68`)
- **M-005 resolved**: 本文の分岐の定義を spec と data-model にそろえた (`spec.md:171-172`, `data-model.md:28`, `data-model.md:37`)
- **M-006 一部 unresolved**: 強調を負荷 E2E から外す点は USER 決定で解消した。AC2 の「承認カードが見える」は、自動テストで検出されないまま残る (M-102)
- **L-001 resolved**: US-4 に「範囲から削らない」と明記した (`spec.md:117`)
- **L-002 resolved**: 送信直後はプロンプトの先頭行を出す (`spec.md:89`, `spec.md:170`)

## Findings

### [High] セッション画面以外を開いている間、表示中だったセッションの承認待ち・失敗は読み上げられない (H-101) (scope: feature) [new]

- **観察**:
  - FR-004 (`spec.md:157`) は、通知の対象を「表示中以外のセッション」に限る。同時に、live region を App の寿命に置き、セッション画面以外を開いている間も通知すると書く (`spec.md:158`)。
  - しかし `announcements` (`data-model.md:66-68`) は `selectedId` を引数に取り、どの画面にいても表示中のセッションを常に除く。
  - SC-001 (`spec.md:239`) も「セッション画面以外を開いている間も**同じ**」と書く。セッション画面がマウントされていない間、`selectedId` のセッションは画面のどこにも表示されていない。それでも「表示中」として通知から外れる。
- **典型的な経路**: 利用者が A にプロンプトを送り、過去セッションの一覧 (`sessions`、`App.tsx:26`) に移る。その間に A が承認待ちになる。晴眼の利用者にはナビの件数が出る。スクリーンリーダーの利用者には何も読み上げられない。直前まで作業していたセッションほど、この経路に当たる。
- **テストの穴**: FE-003 (`tasks.md:47`) は「セッション画面以外を表示している間に承認待ちになる」を観点に挙げる。しかし、そのセッションが表示中 (`selectedId`) かどうかを区別していない。
- **同種事象探索**: Grep `表示中以外|表示中を除` (specs/010、*.md) で 4 件 (`spec.md:152`, `spec.md:157`, `data-model.md:64`, `data-model.md:68`)。いずれも、どの画面にいるかを条件に入れていない。
- **リスク/影響**: US-1 AC5 / AC6 の「見逃さない」が、支援技術の利用者に限って最も起きやすい経路で成り立たない。USER 決定 H-04 の意図が半分しか実現しない。
- **推奨アクション**:
  1. FR-004 の「表示中」を「セッション画面が表示されていて、かつ選ばれているセッション」と定義し直す。
  2. `announcements` に「セッション画面が表示中か」の引数を足す (data-model §2)。
  3. FE-003 に「別の画面にいる間に、選ばれていたセッションが承認待ちになると読み上げられる」を足す。
  4. FR-002 の移動先 (`nextAwaiting`) は、セッション画面の中でだけ使うので、今のままでよい。
- **根拠**: PO-4 / PO-6 / charter Journey 3-2 / USER 決定 2026-10-02 design-gate (H-04)
- **scope 根拠**: spec FR-004 / SC-001、data-model §2、tasks FE-003 の文面で直せる

### [High] 有効な回の条件「窓の中で届いたメッセージ数」を測る経路が、どこにも定義されていない (H-102) (scope: feature) [new]

- **観察**:
  - FR-012 (`spec.md:200`) は、窓の中で届いたメッセージが 100 件以上であることを有効な回の条件にする。SC-005 (`spec.md:243`) はその数を記録の必須項目にする。SH-032 (`tasks.md:87-88`) と quickstart V-3 step 4 (`quickstart.md:32`) は、その数を「出力」として扱う。
  - しかし、どう数えるかは research R-07 にも plan にも書かれていない。R-07 が使ってよいとする手段は renderer の `page.evaluate` と行の `data-*` 属性だけである。
  - ビルドした本物の composition では、ストアは `window` に出ていない。既存の E2E の仕込みが取るのは long task と入力遅延だけで、メッセージ数は数えない。
  - DOM から数えようとしても、transcript に描画されるのは表示中の 1 本だけで、行の直近の活動は間引きと重複の除去を経た値なので、メッセージの件数にならない。
  - 数えるためにストアへ計測用の口を足すと、本番の renderer に計測の都合のコードが入る。このことは plan のどこにも書かれていない。
- **同種事象探索**: Grep `メッセージ数|メッセージの数` (specs/010、*.md) で 7 件 (`spec.md:199`, `spec.md:232`, `spec.md:243`, `research.md:53`, `tasks.md:87`, `tasks.md:88`, `quickstart.md:32`)。いずれも数え方を書いていない。
- **リスク/影響**: SC-005 の合否を分ける条件が、実装の段階で測れないと分かる。実装者はこの条件を外すか、行の状態だけで有効と判定するかに倒れやすく、R1 の H-003 で塞いだ経路が戻る。
- **推奨アクション**:
  1. research R-07 に数え方を決めて書く。(a) renderer に本文の件数だけを数える読み取り専用のカウンタを置き、perf からだけ読む (本番での扱いを plan に記録する)。(b) WSL 内の transcript の JSONL の行数の差分で数える。
  2. その方法を SH-032 の観点に足す。
  3. 下限 (100 件) を変えるときは閾値と同じく利用者に諮り、変えた値を quickstart-results に書くことを SH-033 に足す。
- **根拠**: PO-2 / charter KPI「並列時の滑らかさ」
- **scope 根拠**: research R-07 / plan / tasks SH-032・SH-033 の文面で直せる

### [Medium] セッション画面以外を開いている間、失敗には目で見える手掛かりが無い。除外とも書かれていない (M-101) (scope: feature) [new]

- **観察**: US-1 の題は「承認待ちと失敗を見逃さない」(`spec.md:57`) である。セッション画面以外を開いている間について書いているのは、承認待ちの件数がナビに出ることだけである (`spec.md:59`, `spec.md:155`)。失敗の件数はサイドバーの見出しにしか出ない (`spec.md:156`)。Edge Cases と Out of Scope は、この非対称を明示していない。
- **同種事象探索**: Grep `ナビ` (spec.md) で 6 件 (`spec.md:52, 59, 72, 155, 239, 259`)。どれも承認待ちだけに触れている。
- **リスク/影響**: 失敗したセッションは、利用者が戻るまで止まったまま放置される。USER 決定がナビを承認待ちに絞ったのか、失敗を書き漏らしたのか、文面から判別できない。
- **推奨アクション**: Edge Cases に「セッション画面以外を開いている間、失敗はナビに出さない。読み上げ (FR-004) と、戻ったときの見出しの失敗の件数で知らせる」と明記する。または、ナビに失敗の印を足すかを利用者に確認する。
- **根拠**: PO-4 / PO-6
- **scope 根拠**: spec の Edge Cases / Out of Scope の文面で直せる

### [Medium] SC-005 (実機計測の記録) を feature の完了条件として扱うかが決まっていない。閾値を割った場合の着地も無い (M-103) (scope: feature) [new]

- **観察**:
  - SH-033 (`tasks.md:90`) の担当は「利用者 (または利用者が明示的に指示した回の agent)」である。FR-012 (`spec.md:201`) は、agent が自律的には実行しないと定める。
  - 一方で、SH-033 を pr-gate と `/cl-done` の前に済ませるべきかを、spec・tasks のどこにも書いていない。
  - 閾値を割った場合について SH-033 は「原因を切り分けて記録し、利用者に諮る」とだけ書く。その結果、feature を completed にしてよいのかが定まっていない。
- **同種事象探索**: Grep `SH-033|削らない` (specs/010、*.md) で 3 件 (`spec.md:117`, `tasks.md:75`, `tasks.md:90`)。
- **リスク/影響**: 実機計測をしないまま PR が出て、3 度目の繰越になる経路が残る。
- **推奨アクション**: tasks の SH-033 に「pr-gate の前に済ませる。quickstart-results に有効な回が 3 回記録されていなければ done にしない」と書く。閾値を割った場合の分岐も spec の Edge Cases に書く。
- **根拠**: PO-5 / PO-2 / charter KPI
- **scope 根拠**: spec / tasks の文面で直せる

### [Medium] US-1 AC2 の「B の承認カードが見える」を検出する自動テストが無い (M-102) (scope: feature) [H] [unresolved from prev (M-006 の後半)]

- **観察**: US-1 AC2 (`spec.md:68`) は、件数を押した後に「B の承認カードが見える」ことを求める。FE-003 (`tasks.md:42`) は「移る」ことしか確かめない。確かめるのは目視の V-4 step 2 (`quickstart.md:41`) だけである。transcript が長いときに承認カードが可視領域に入るかの規則も無い。
- **同種事象探索**: Grep `承認カードが見える` (specs/010) で 2 件 (`spec.md:68`, `quickstart.md:41`)。自動テストの観点は 0 件。
- **リスク/影響**: この AC は未検証のまま完了扱いになる。
- **推奨アクション**: FE-003 か SessionScreen の component テストに「件数から移った先で、承認カードが描画されている」を足す。可視領域までスクロールするかを spec に書くか、V-4 の目視が正本だと明記する。
- **根拠**: reviewer-base H の義務 / PO-3
- **scope 根拠**: tasks / spec の文面で直せる

### [Low] 有効な回の判定は「窓の始まりと終わり」の 2 点で確かめるが、FR-012 は「窓の全期間」を求めている (L-101) (scope: feature) [new]

- **観察**: FR-012 は窓の全期間で 10 本が応答中であることを求める。SH-032 と R-07 は窓の始まりと終わりで確かめるだけである。応答待ち・承認待ち・失敗は計測の操作では応答中に戻らないので 2 点で足りる理由は推論できるが、書かれていない。
- **同種事象探索**: Grep `始まりと終わり` で 2 件 (`research.md:53`, `tasks.md:87`)。
- **推奨アクション**: R-07 に 2 点の確認で全期間を判定できる根拠を 1 行書く。
- **根拠**: PO-2
- **scope 根拠**: research の文面で直せる

### [Low] SC-006 の描画回数の上限「毎秒 2 回 + 1」を、500ms の試験の窓でどう評価するかが曖昧 (L-102) (scope: feature) [new]

- **観察**: SC-006 と FE-012 は、500ms の間に 20 回更新したときの上限を「毎秒 2 回 + 1」と書く。500ms の窓に換算した上限が一意に決まらない。状態の変化による描画を数に含めるかも書かれていない。
- **同種事象探索**: Grep `毎秒 2 回 \+ 1` で 2 件 (`spec.md:244`, `tasks.md:62`)。
- **推奨アクション**: 「500ms の間に 20 回更新したとき、1 行の描画は 3 回以下 (状態は変えない)」のように、窓の中の絶対数で書く。
- **根拠**: PO-3
- **scope 根拠**: spec / tasks の文面で直せる

### [Low] 「1 操作で移れる」は、セッション画面以外からは 2 操作になる (L-103) (scope: feature) [new]

- **観察**: US-1 の本文 (`spec.md:59`) は「1 操作で移れる」と書く。AC6 では、ナビを押して戻った後に、さらに見出しの件数を押す必要がある。ナビの件数を押したときに最古の承認待ちへ移るかは定義されていない。
- **同種事象探索**: Grep `1 操作` (spec.md) で 1 件 (`spec.md:59`)。
- **推奨アクション**: 「1 操作」はセッション画面の中に限ると明記する。または、ナビの件数から直接 `selectNextAwaiting` を呼ぶかを決める。
- **根拠**: PO-6
- **scope 根拠**: spec の文面で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `表示中以外\|表示中を除` (specs/010、*.md) | 4 | spec.md:152, spec.md:157, data-model.md:64, data-model.md:68 |
| H-102 | `メッセージ数\|メッセージの数` (specs/010、*.md) | 7 | spec.md:199, spec.md:232, spec.md:243, research.md:53, tasks.md:87, tasks.md:88, quickstart.md:32 |
| M-101 | `ナビ` (spec.md) | 6 | spec.md:52, 59, 72, 155, 239, 259 |
| M-102 | `承認カードが見える` (specs/010) | 2 | spec.md:68, quickstart.md:41 |
| M-103 | `SH-033\|削らない` (specs/010、*.md) | 3 | spec.md:117, tasks.md:75, tasks.md:90 |
| L-101 | `始まりと終わり` | 2 | research.md:53, tasks.md:87 |
| L-102 | `毎秒 2 回 \+ 1` | 2 | spec.md:244, tasks.md:62 |
| L-103 | `1 操作` (spec.md) | 1 | spec.md:59 |

## Verdict

- Critical: 0
- High: 2
- Medium: 3 (E: 2 / H: 1)
- Low: 3
- Round inheritance: resolved from 1: 10 (H-001 / H-002 / H-003 / M-001〜M-005 / L-001 / L-002) / unresolved: 1 (M-006 の後半 → M-102) / new: 7 (H-101 / H-102 / M-101 / M-103 / L-101 / L-102 / L-103)
