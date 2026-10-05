# Quickstart Results: アプリのシェル (O-7)

手順は [quickstart.md](./quickstart.md)。合否の定義は spec の SC が正本。

## 自動の検証 (SH-011) — 2026-10-06 (pr-gate R1 の修正の後の値)

`docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流した。

- 型検査: node / web / e2e / perf の 4 本とも 0 件
- ESLint: 0 件。dependency-cruiser: 違反 0 (358 modules)
- Constitution 検証: ok 20 / 違反 0 / 検査対象なし 1
- 全件 `vitest run`: **119 files / 1960 tests passed** (メモリが足りず 1 回止められたので `--maxWorkers=2` で流した。O-7 で足した主なテスト: `AppShell.test.tsx` 41 / `stores/ui.test.ts` / `SessionListScreen.test.tsx` の FR-016 の 3 件 / `panel-tabs.test.ts` / `shell-layout.test.ts` / `session-list/group-label.test.ts` / `session-list/rows.test.ts`)
- E2E (ビルドした実アプリ + 偽の supervisor 接続): **11 passed / 1 failed** (`ime` 3 / `launch-dialog` 4 / `multi-session` 4 が合格。`composer-screenshot` は下の「基準画像」のとおり本機と CI の 1px の差で落ちる)
  - **SC-003 / O-1 SC-004 の計測値** (session charter KPI「並列時の滑らかさ」の E2E の側。O-3 の義務 (2)(c) の比較の基準。pr-gate R1 architecture M-003):

    | 回 | 入力遅延 p95 | long task (50ms 超) の件数 / 最大 | 打鍵 n | 巨大な part の着信 |
    |---|---|---|---|---|
    | 2026-10-05 (code-gate の後のビルド) | 21.5ms | 1 / 75.0ms | 352 | 26.2 秒 |
    | 2026-10-06 (pr-gate R1 の修正の後のビルド) | 17.0ms | 0 / 0.0ms | 428 | 25.8 秒 |

    閾値 (p95 ≤ 50ms・最大 < 100ms) を割った 1 回 (2026-10-05。同時にほかのプロセスを起こしていた) の値は出力の末尾を切っていたので残っていない。X-5 は 0〜10 件、O-1 は 33 件 (O-1 quickstart-results V-2)
  - 起動の入口はサイドバーの「新規起動」(`e2e/support/launch.ts` の `openLaunchDialog`。perf も同じ関数を使う)。稼働中の行の locator は稼働中の区画に限る (`runningRows`)
  - `multi-session` の 11 本目の拒否 (SC-001) は、ダイアログを閉じずに理由を出すので、拒否の告知を確かめた後に Esc で閉じてから行を数える
  - 途中の 1 回は、同時にほかのプロセス (gate のスクリプト・reviewer の git) を起こしていたときに SC-003 (入力遅延 p95) が閾値を超え、Playwright の worker が異常終了 (0xC0000409) して E2E のアプリが 3 つ残った。残ったアプリ (E2E が起動した `electron.exe`。偽の supervisor) を止めてから `multi-session` を単独で流すと 4 passed、ほかのプロセスを起こさずに全件を流すと `multi-session` は 4 passed

## 日本語スクリーンショット比較の基準画像 (SC-003 / Principle VIII (B)) — 2026-10-05

**基準画像は変えない (main のまま)。** 一度は本機で撮り直したが、原因の見立てが誤っていたので取り消した。

- **経緯**: シェルを入れた後に `composer-fullwidth` が本機で落ち、差は全グリフの輪郭のアンチエイリアスだけだった。composer の左端の位置の変化 (サイドバー 256 → 280px、右の帯 40px) によるサブピクセルのずれと見立て、利用者の見た目の承認を得て本機で撮り直した (f82c8dc)
- **見立てが誤っていた**: その後、変更の無い f82c8dc のビルドでも、撮り直した基準画像と 2331 画素 (0.03) の差で落ちるようになった (同じビルドが 1 時間前には合格していた)。本機の描画が時間で揺れている。さらに本機の今の描画 (673×134px) を main の基準画像 (CI の描画。673×135px) と縦 1px ずらして比べると、差は **73 画素**だけだった — O-7 のレイアウトで composer の描画は変わっていない
- **2026-10-06 の再確認**: 本機の今の描画は、2026-10-05 15:20 に本機で撮り直した画像 (f82c8dc) と**画素が完全に一致**した (差 0)。一方で 2026-10-05 の 17 時台の描画は main の基準画像と縦 1px ずらして 73 画素の差だった。本機の描画は 2 つの状態を行き来しており、どちらも O-7 のコードの変更と関係なく現れる (同じビルドで両方が出た)。本機で撮った画像を基準にしない判断を裏づける
- **対応**: 基準画像を main のもの (O-1 の PR #10 で CI の artifact から取った 673×135px) に戻した。本機ではこのテストは高さ 1px の差で落ちる (main でも同じ。O-1 quickstart-results の記録と memory の「本機で 1px の差で落ちても異常ではない」)。合否は PR の CI (windows-latest) で見る
- **CI で落ちた場合**: CI の失敗時の artifact (`e2e-test-results`) の actual を見て、O-7 起因の差かを切り分ける。撮り直すなら、本機ではなく CI の artifact から取り、利用者の見た目の承認を得て、ここに記録する
- 撮り直しに対する 2026-10-05 の利用者の承認は、誤った見立てに基づくものだったので使わない

## V-1 画面の ID と nav の手順が残らない (SC-005) — 2026-10-05

- `\b(SCREENS|ScreenId|setScreen)\b` を `src` / `e2e` / `perf` に対して Grep: **0 件** (初回は単語の境界の無い grep で、設定のダイアログの項目の表の名前 `SECTION_SCREENS` が当たった。名前は `SETTINGS_SECTION_CONTENT` に直し、grep に単語の境界を付けた。code-gate convention L-009)
- `name: /?\^?セッション起動` を同じ範囲に対して Grep: **0 件**
- 削除した `SessionScreen` を指す注記を、移した先 (`LivePane` / `RunningSessionsProvider` / `LaunchDialogContent`) に直した。「X-5 の `SessionScreen` から移した」の経緯の記述は残す

## V-2 記録の追随 (SC-006) — 2026-10-05

- `docs/decisions/0046-app-shell-layout.md` は **`status: accepted`** (quickstart の「proposed」は design の時点の記述。利用者が 2026-10-05 に承認した)
- roadmap の M3 に O-7 が O-3 の前 (順 12) にあり、O-3〜O-6 の依存に O-7 がある。Optional scope に OPT-panel があり、Terminal は OPT-pty が持つ
- `node scripts/constitution/check.mjs`: **ok 20 / 違反 0 / 検査対象なし 1**
- `git diff main...HEAD -- src/main/app/protocol.ts`: 空 (SC-001。CSP を変えていない)

## V-3 実機の目視 (利用者) — 2026-10-05: **全項目 OK**

利用者が pr-gate R1 の修正を含む作業ツリーをアプリの dev 起動 (`pnpm dev`) で確かめ、次の全項目が OK と報告した。agent は実機の操作をしていない (dev 起動は利用者が行った)。

| # | 観点 | 結果 |
|---|---|---|
| 1 | 3 面の見た目が Cursor の Agent View の意図に近い (サイドバー 280px・中央・右は既定で畳んだ帯)。**AD-046 Confirmation** | OK |
| 2 | WSL のディストロを実行中にして起動し、取り直さずに過去のセッションの区画にその所在のセッションが出る。**SC-008** (E2E では検出できない) | OK |
| 3 | 実 `claude` を 2 本起動し、稼働中と過去を行き来しても会話・下書き・キューが途切れない | OK |
| 4 | 右を開いた状態でウィンドウを狭めると、右 → サイドバーの順に自動で畳まれる | OK |
| 5 | 長い日本語の題・フォルダ名でサイドバー・中央のヘッダ・概要が崩れない (280px で横スクロールが出ない) (Principle VIII) | OK |
| 6 | 起動の直後、過去のセッションの区画が「取得中…」になり、検出が終わると一覧に替わる (pr-gate R1 ux H-002) | OK |
| 7 | 設定を開いている間に承認待ちになると、設定の左上に件数の印が出る (pr-gate R1 ux H-001) | OK |
| 8 | キーボード: 開閉のボタンを押してもフォーカスが残る・起動ダイアログを Esc で閉じると「新規起動」に戻る・最初の Tab で「会話へ移動」が出る (pr-gate R1 a11y H-001 / H-002 / M-005) | OK |
| 9 | フォルダが 0 件のとき、中央の主なボタンが「作業フォルダを登録する」 (pr-gate R1 ux M-001) | OK |

component テストでは、初回の `listSessions` が `listRuntimes` の解決の前に呼ばれないこと、`listRuntimes` が失敗しても列挙すること、待っている間も取得中であることを確かめている (`SessionListScreen.test.tsx`)。
