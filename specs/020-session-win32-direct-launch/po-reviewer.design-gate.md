# po-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-20T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 と SC-001〜SC-006 はすべて本 feature の対象。対応は次のとおり。
  - US-1: FR-001/002/003/013/016、SC-001/006
  - US-2: FR-004〜007、SC-002
  - US-3: FR-010〜012、SC-004
  - US-4: FR-008/009、SC-003/005
- touched files に当たる charter / Confirmation:
  - session charter の Journey 1 / 2 / 3
  - session charter の Related Specs X-8 (`docs/domains/session/charter.md:337-339`)
  - AD-058 Decision 3 (保証の範囲)、Confirmation (単体 + quickstart V-1〜V-9)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:4 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: E の範囲だけを見た (WCAG と空の状態は a11y / ux-reviewer の担当)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0 (M-003 / M-004 の観測と検証の穴。下の Findings に含めて数えている)

## スコープ要約

Round 1 の High 3 件 (H-001 / H-002 / H-003) は 3 件とも直っていた。

- **H-001 (FR-011)**: FR-011 (`spec.md:179`) は、AD-058 Decision 3 と data-model §9.4 (`data-model.md:370-377`) の表に合わせて、保証する終わり方と best-effort の終わり方に分けて書き直されている。
- **H-002 (起動ダイアログの理由と直し方)**:
  - data-model §10.1 (`data-model.md:385-389`) は、プリセットの有無に依らず、理由と直し方と `where-to-fix` を選択欄の下に常に出す、と定めている。
  - FE-010 のテスト (`tasks.md:43`) は、プリセットなしの 3 つの状態と `aria-describedby` を確かめる。
- **H-003 (SC-004 が測られないまま完了できる)**:
  - SC-004 (`spec.md:207`) に「5 秒以内に 0 件」という時間の条件が入った。
  - 合否の決め方 (単体は順序と引数、実機 V-3 は 0 件と 5 秒) が明記された。
  - SC-001 と SC-004 の実機の部分 (V-1 / V-3) は `/cl-done` の前に必須になった。書かれている場所は `spec.md:204`、`:207`、`tasks.md:9`、`:96`、`quickstart.md:6`、`:20`、`:43`。

Round 1 の Medium 4 件と Low 2 件は手が入っていない。AD-050 により Medium / Low は gate で直さないので、どれも unresolved として引き継ぐ。新しい指摘は Low が 1 件だけ。

## Findings

### [Medium] 設定ファイルが読めないとき、指定が黙って消えて自動の探索に戻る (M-001) (scope: feature) [unresolved from prev]
- **観察**:
  - `data-model.md:99-102` では、`parse-failed` / `newer-version` / `read-failed` のどれも「指定なし」として扱う。
  - その結果は UI に出ず、`claudeOverridden` は false になる。
  - Edge Cases (`spec.md:143-151`) にもこの場合が書かれていない。
  - これは FR-006 (`spec.md:168`) の「指定の誤りを黙って隠さない」の趣旨と食い違う。
- **推奨アクション**: Round 1 と同じ。`override-invalid` 相当として扱うか、カードに「設定を読めませんでした」の行を出す。少なくとも、この扱いを Edge Cases に書く。

### [Medium] claude.exe が起動してすぐ終わる場合 (Git Bash が無いなど) の理由と文言が決まっていない (M-002) (scope: feature) [unresolved from prev]
- **観察**:
  - `spec.md:198` は「Git Bash が無い環境の案内は Claude Code 自身の出すエラーに任せる」と書いたまま変わっていない。
  - ところが Closta は失敗の文字列を運ばない (session charter)。そのため、その案内は利用者に届かない。
- **推奨アクション**: Round 1 と同じ。Edge Cases に「起動直後に異常終了する」場合を足し、そのときの理由のキーと文言を決める。

### [Medium] プロセス木の停止の失敗が stderr の 1 行だけで、どこで読めるかが書かれていない (M-003) (scope: feature) [unresolved from prev]
- **観察**:
  - 記録は stderr の 1 行だけである (`data-model.md:343`)。
  - US-3 AC4 (`spec.md:124`) の「記録される」が、どこで読めるのかが書かれていない。
  - UI に告知も出ない。
- **推奨アクション**: Round 1 と同じ。stderr がどのログに残るかを quickstart か AD-058 に書く。UI に通知を出さないなら、その旨を Out of Scope に書く。

### [Medium] 10 本を同時に止めるアプリの終了の負荷が検証されていない (M-004) (scope: feature) [unresolved from prev]
- **観察**:
  - `plan.md:261` の RK-07 は、今も「通常は taskkill が数百 ms で終わる」という見積もりのままである。
  - quickstart V-3 (`quickstart.md:43-52`) は今も 1 本のセッションでしか確かめていない。
  - SC-004 は「アプリの終了で 5 秒以内に 0 件」を合否の条件にした。そのため、複数本の場合が確かめられていないことが、Round 1 より合否に直接響くようになった。それでも SC-004 は「そのセッションの」1 本単位で書かれているので、Medium のままにする。
- **推奨アクション**: V-3 の「アプリの終了」に、Win32 のセッションを複数本 (3〜10 本) 動かした状態の観測を足し、結果を RK-07 に戻す。

### [Low] V-7 で、登録したフォルダの下に出ることを確かめていない (L-001) (scope: feature) [unresolved from prev]
- **観察**: `quickstart.md:71` は「セッション一覧の列挙に出る」ことまでしか確かめていない。

### [Low] 日本語と空白を含む作業フォルダでの実機の確認が無い (L-002) (scope: feature) [unresolved from prev]
- **観察**: `quickstart.md:20-27` の V-1 に、その手順が無い。単体のテストは BE-001 / BE-010 で足りている。

### [Low] 起動ダイアログの `where-to-fix` が文言だけで、ランタイム一覧への導線が無い (L-003) (scope: feature) [new]
- **観察**:
  - `data-model.md:411` の `where-to-fix` は「ランタイム一覧の…カードで…できます」という案内の文だけである。
  - 起動ダイアログからランタイム一覧へ移る操作 (リンクやボタン) は、§10.1 にも FE-010 にも無い。
  - FR-007 の要件 (理由と直し方を出す) は満たしているので Low とする。
- **推奨アクション**: 任意。既存の画面遷移の部品でランタイム一覧へのリンクを添えるかどうかを決める。添えないなら現状のままでよい。

## H (テスト / 回帰) の所見

- H-002 と H-003 の検出に要るテストと手順は揃った。
  - 起動ダイアログで理由と直し方を出すことは、FE-010 の component テストで確かめる (`tasks.md:43`)。
  - SC-004 の単体の部分は BE-030 で確かめる (`tasks.md:71`)。
  - SC-004 の実機の部分は V-3 で確かめ、`/cl-done` の前に必須になっている。
- 残っている穴は 2 つ: 停止の失敗を観測する場所 (M-003) と、複数本を同時に止めたときの時間の計測 (M-004)。
- WSL の回帰 (FR-016 / SC-006) は、既存のテストを書き換えずに通すことと V-9 で担保する構成のまま。E の観点で足りない点は無い。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (prev H-001 の確認) | `保証しない\|異常終了` (data-model) | 2 | specs/020-session-win32-direct-launch/data-model.md:376, :377 (spec.md:179 と一致) |
| (prev H-002 の確認) | `理由と直し方\|where-to-fix` (data-model) | 6 | data-model.md:386, :387, :389, :398, :403, :411 |
| M-004 | `RK-07\|10 本` (plan) | 1 | plan.md:261 |

Critical は 0 件なので、cascade_enforce の対象は無い。

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 3
- Round inheritance: resolved from 1: 3 (H-001 / H-002 / H-003) / unresolved: 6 (M-001〜M-004 / L-001 / L-002) / new: 1 (L-003)
