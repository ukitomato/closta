# po-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-29T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md

## 初回読了 viewpoint

- FR/SC:
  - US-1 (P1): FR-001〜FR-004, FR-008〜FR-010 / SC-001, SC-003, SC-007
  - US-2 (P1): FR-005〜FR-007 / SC-002
  - US-3 (P2): FR-011〜FR-013 / SC-004
  - US-4 (P2): FR-014〜FR-015 / SC-005
  - US-5 (P3): FR-016〜FR-018 / SC-006
- この feature が触る charter / Confirmation:
  - ui charter Mission (`docs/domains/ui/charter.md:48`)
  - KPI「日本語の健全性」(`:186`)
  - 不変条件「日本語で破綻しない」(`:176`)
  - AD-065 Confirmation (`docs/decisions/0065-…md:70-83`)
  - AD-037 (IME と Esc)
- A. 認可 / 認証 / secret 管理: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:4 Low:2
- F. 命名 / module / lint hookup: 該当なし: po-reviewer の担当外 (convention-reviewer が担当)
- G. optional reviewer 範囲: 該当なし: optional reviewer が担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

実機で見つかった 6 つの使いにくさを、User Story 5 本・FR 18・SC 7 で直す。
- モデルと権限モードの選択を composer の周りに移す
- 既定の Provider のセッションでも `supportedModels()` の一覧からモデルを選べるようにする
- 権限モードの名前を Claude Code の英語の表記にそろえる
- 停止ボタンを控えめにし、Esc で止められるようにする
- 320px の右のパネルを崩れない形にする
- `/resume` を足す

既存の部品と経路はできるだけそのまま使う方針である (023 の判定・X-9 の再開の流れ・assistant-ui の `cancelOnEscape`)。User Story の WHO / WHAT / WHY はどれも成り立っている。SC は大半が E2E / 単体で真偽を判定できる。

PO の観点で残る穴は主に US-2 にある。一覧を取れなかったとき・空のときに出す表示を、data-model が既存のコードと食い違ったまま決めている。

## Findings

### [High] 一覧の取得に失敗したときの理由の文言が、存在しない表のキーを指している。US-2 AC3 の「理由つき」を設計どおりに作れない (H-001) (scope: feature)

- **観察**:
  - `specs/025-ui-live-session-fixes/data-model.md:176` は、`failed` 状態の表示を `LIVE_SETTING_LABELS.failure[reason]` としている。`tasks.md:73` (FE-020) も同じ書き方である。
  - ところが既存の `src/renderer/src/features/session/labels.ts:446-450` の `LIVE_SETTING_LABELS.failure` は `Record<LiveSettingKind, string>` で、キーは `'permission-mode' | 'model' | 'name'` しか無い。
  - 一方、`reason` は `LiveSettingFailure` (`src/domain/session/live-settings.ts:50-62`。`timeout` / `rejected` / `session-ended` など) である。
  - renderer に `LiveSettingFailure` をキーにした文言の表は無い (`Record<LiveSettingFailure` で 0 件)。FE-002 で足す文言も `loadingModelList` / `emptyModelList` の 2 つだけ (`data-model.md:259-260`)。
- **同種事象探索**:
  - `Record<LiveSettingFailure` を `src` で検索: 0 件
  - `LiveSettingFailure|LIVE_SETTING_FAILURES` を `src/renderer` で検索: 0 件
  - `failure\[reason\]` を spec_dir で検索: 2 件 (`data-model.md:176`, `tasks.md:73`)
- **リスク/影響**: US-2 AC3 (`spec.md:112`) と FR-007 (`spec.md:193`) は「理由つきで押せない」ことを求めている。設計のまま実装すると、型エラーになるか、理由が `undefined` で表示されない。利用者は期限切れ・拒否・Claude Code の停止の区別がつかず、聞き直してよいのか分からない。
- **推奨アクション**:
  - data-model §6.3 / §9 に、一覧の取得の失敗の理由ごとの文言を足す。対象は少なくとも `rejected` / `timeout` / `session-ended` / `not-running` / `not-ready`。`blocker` の既存文言を使い回す分はそう書く。
  - FE-002 で文言の表に足し、FE-020 の参照先を直す。
  - FE-020 のテストに「`timeout` / `rejected` で各文言が出る」を足す。
- **根拠**: spec US-2 AC3 / FR-007、Principle XV (文言は表に置く)
- **scope 根拠**: この spec の data-model / tasks の中で直せる

### [High] 一覧を起動の effort で絞った結果が 0 件になると、「Claude Code がモデルの一覧を返しませんでした」という誤った理由が出る (H-002) (scope: feature)

- **観察**:
  - `data-model.md:87` では、main が `switchableModels(liveModels, effort)` で絞った後の値を `ok: true, models` として返す。
  - `switchableModels` は effort を指定すると、`supportedEffortLevels` を持たないモデルをすべて落とす (`src/domain/provider/model-catalog.ts:99-100`)。
  - renderer は `ready` で空のとき、無条件に「Claude Code がモデルの一覧を返しませんでした」を出す (`data-model.md:175`, `:260`)。
  - 結果として、Claude Code は一覧を返したのに effort (`max` / `xhigh` など) で全件が落ちたケースと、本当に空だったケースを区別できない。
  - spec の Edge Cases (`spec.md:171`) は「effort で絞る」と書くだけで、絞った結果が 0 件のときの表示を決めていない。plan の RK-02 も「空を返す」ケースしか扱っていない。
- **同種事象探索**: `emptyModelList|返しませんでした` を spec_dir で検索: 3 件 (`data-model.md:175`, `:260`, `tasks.md:74`)。どれも effort で絞った後の 0 件を区別していない。
- **リスク/影響**:
  - 原因を取り違えて表示するので、利用者は「Claude Code が壊れている」と判断してしまう。
  - 本当の対処 (effort を変えて起動し直す) にたどり着けない。
  - 既定の Provider で effort を指定する利用者には、US-2 の価値 (モデルを変えられる) が届かず、しかも理由も誤っている。
- **推奨アクション**:
  - `LiveModelsResult` で「受け取った件数」と「絞った後の件数」を分けるか、空の理由を区別する。
  - 0 件のとき、effort で絞って残らなかったなら、その旨の文言 (例:「起動の effort に対応するモデルがありません」) を出す。
  - spec の Edge Cases に 1 行足す。
  - BE-023 / FE-020 のテストに「Claude Code の一覧は 2 件・effort で 0 件」の行を足す。
- **根拠**: PO-4 (spec にも plan にも書かれていない negative scenario)、spec US-2 AC3
- **scope 根拠**: この spec の data-model / contracts C-7 / tasks の中で直せる

### [Medium] 一覧の取得に失敗した後に聞き直せるのは 1 回だけで、それも失敗すると、そのセッションではモデルを変える手段が無くなる (M-001) (scope: feature)

- **観察**:
  - `data-model.md:179` は「`failed` からは、選択にフォーカスが入ったときに 1 回だけ聞き直す」と決めている。
  - `tasks.md:74` も「`failed` でフォーカスごとに増えず 1 回だけ聞き直す」である。
  - 聞き直しも失敗した後の出口 (recovery flow) が書かれていない。フォーカスで聞き直されることも、利用者には示されない。
- **リスク/影響**: 一時的な期限切れが 2 回続くと、セッションを起動し直すまでモデルを変えられない (PO-6 の出口が無い)。
- **推奨アクション**: 「1 回だけ」が失敗 1 回あたりなのか、セッションを通して 1 回なのかを明記する。前者 (失敗するたびにフォーカスで 1 回) にするなら、テストの表現を直す。
- **根拠**: PO-6

### [Medium] SC-002 の「実機で 1 回切り替える」は、マージの時点で真偽を判定できない (M-002) (scope: feature)

- **観察**:
  - `spec.md:229` の SC-002 には、単体のほかに「実機で 1 回切り替える」が入っている。
  - しかし `tasks.md:9` と `tasks.md:127` は、実機ができなければ「未実施」と書いてマージしてよいとしている。
  - RK-02 / RK-03 (`plan.md:385-386`) は、`supportedModels()` の値が既定の Provider で `setModel` に通るかを、実機でしか確かめられない未確定事項として残している。
- **リスク/影響**: US-2 の価値の核 (次の応答がそのモデルで動く) が確かめられないまま「完了」になりうる。Success Criteria が満たされたかどうかを判定できない。
- **推奨アクション**: SC-002 を「自動の部分 (完了の条件)」と「実機の部分 (未実施なら roadmap の O-13 の行に未確認として残す)」に分けて書く。
- **根拠**: PO-2

### [Medium] US-3 の Esc は「ライブラリですでに動く」という仮説に立っている。利用者が報告した症状の原因を特定しないまま、コードが変わらない可能性がある (M-003) (scope: feature)

- **観察**:
  - `research.md:83` は「実機でまだ効いていないように見えたのは、停止ボタンにフォーカスが移った状態で Esc を押した場合か、そもそも試していない場合と考えられる」と推測で書いている。
  - FE-030 (`tasks.md:84`) は、偽の runtime の単体が緑なら keydown の処理を足さないとしている。
  - 原因を確かめる V-4 (`quickstart.md:27`) は「未実施」でもマージできる。
  - 既存の `ComposerInput.js:63-75` は、textarea の中で `canCancel` のときに確かに cancel を呼ぶ。ただし実アプリの queue adapter のもとで `canCancel` が true になるかは、偽の runtime では確かめられない。
- **リスク/影響**: 利用者が報告した (1)「Esc で止めたい」が、変更なし・実機の確認なしで閉じられうる。報告のときに composer の外 (停止ボタン・transcript) にフォーカスがあったのなら、FR-012 の条件のもとでは症状は変わらない。
- **推奨アクション**:
  - FE-031 の E2E を、偽の runtime ではなく実アプリの runtime の構成 (queue adapter あり) で `interruptSession` まで届くことを確かめる形にする。
  - 停止ボタンを押した後など、composer の外にフォーカスがあるとき Esc が効かないことを spec の Edge Cases に明記する (利用者が期待を誤らないように)。
- **根拠**: PO-1 / PO-4、H の「既存の振る舞いの根拠」

### [Medium] `/resume` の選ぶ画面の先頭には、今のセッション自身が出る見込みが高い。spec の AC と Edge Cases に書かれていない (M-004) (scope: feature)

- **観察**:
  - plan の RK-09 (`plan.md:392`) と research R-10 (`research.md:186`) は、今のセッション自身が一覧に出て、renderer からは除けないことを認めている。
  - 並びは新しい順 (`spec.md:241`, `data-model.md:227`) なので、今のセッションが先頭に来やすい。
  - 選んだ場合、既存の再開の経路は `already-running` を返し、既存の行を選び直すだけになる (`src/main/app/session-launch-service.ts:481`、`src/renderer/src/features/session/running-session-store.ts:862-871`)。
  - spec の US-5 AC と Edge Cases (`spec.md:168-176`) には、このケースの期待が無い。
- **リスク/影響**: 利用者が先頭の行を選び、再開ダイアログを通った後に、何も起きずに同じセッションへ戻る。不具合に見える。
- **推奨アクション**:
  - spec の Edge Cases に「今のセッション自身を選んだときは、ダイアログを通って同じセッションに戻る (既知の制限)」を書く。
  - 可能なら、選ぶ画面で稼働中の会話に印を付ける案を後続の候補として roadmap に残す。
  - FE-054 で、このケースの挙動を固定する。
- **根拠**: PO-4 / PO-6

### [Medium] composer が狭いときに入力欄・送信ボタンが崩れないという Edge Case に、SC もテストも無い (M-005) (scope: feature)

- **観察**:
  - `spec.md:170` の Edge Case と RK-05 (`plan.md:388`) は「狭い幅で確かめる」としている。
  - しかし FE-011 / FE-012 / FE-013 (`tasks.md:48-53`) に、狭い幅での計測が無い。
  - SC-007 の基準画像は、CI の画面の幅 1 種類だけである。
- **リスク/影響**: 選択 2 つと理由の行が composer の下の段に入ることで起きる崩れ (RK-05) を、検出する手段が無い。
- **推奨アクション**: FE-013 に、composer の幅を狭くした (例: サイドバーと右のパネルを開いた) 状態で、送信ボタンが見えていて入力欄の幅が一定以上あることを測る E2E を足す。
- **根拠**: PO-4、H (テスト戦略)

### [Low] SC-004 の「停止ボタンの variant が送信ボタンと違う」は、「目立たない」の代わりの指標として弱い (L-001) (scope: feature)

- **観察**: `spec.md:231` の書き方だと、`destructive` でも満たしてしまう。FE-030 は `outline` に固定しているので、実害は小さい。
- **推奨アクション**: SC-004 を「`outline` か `ghost`」と書き換える。

### [Low] plan で省略しないと決めたので、US-4 AC3 は当たらなくなった。spec には残ったまま (L-002) (scope: feature)

- **観察**:
  - `plan.md:446` は「AC3 は当たらない」と判断している。
  - `spec.md:146` の AC3 は直されておらず、tasks にも AC3 のテストが無い。
- **推奨アクション**: spec の AC3 に「plan R-07 で省略しないと決めたため当たらない」と注記する。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `Record<LiveSettingFailure` (src) | 0 | - |
| H-001 | `LiveSettingFailure\|LIVE_SETTING_FAILURES` (src/renderer) | 0 | - |
| H-001 | `failure\[reason\]` (spec_dir) | 2 | data-model.md:176, tasks.md:73 |
| H-002 | `emptyModelList\|返しませんでした` (spec_dir) | 3 | data-model.md:175, data-model.md:260, tasks.md:74 |

## Verdict

- Critical: 0
- High: 2
- Medium: 5
- Low: 2
