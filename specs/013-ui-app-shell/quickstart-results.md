# Quickstart Results: アプリのシェル (O-7)

手順は [quickstart.md](./quickstart.md)。合否の定義は spec の SC が正本。

## 自動の検証 (SH-011) — 2026-10-05

`docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流した。

- 型検査: node / web / e2e / perf の 4 本とも 0 件
- ESLint: 0 件。dependency-cruiser: 違反 0 (350 modules)
- 全件 `vitest run`: **1926 tests passed** (O-7 で足した主なテスト: `AppShell.test.tsx` 24 / `stores/ui.test.ts` / `SessionListScreen.test.tsx` の FR-016 の 2 件)
- E2E (ビルドした実アプリ + 偽の supervisor 接続): **12 passed** (`composer-screenshot` 1 / `ime` 3 / `launch-dialog` 4 / `multi-session` 4)
  - 起動の入口はサイドバーの「新規起動」(`e2e/support/launch.ts` の `openLaunchDialog`)。稼働中の行の locator は稼働中の区画に限る (`runningRows`)
  - `multi-session` の 11 本目の拒否 (SC-001) は、ダイアログを閉じずに理由を出すので、拒否の告知を確かめた後に Esc で閉じてから行を数える

## 日本語スクリーンショット比較の基準画像の撮り直し (SC-003 / Principle VIII (B)) — 2026-10-05

`e2e/composer-screenshot.spec.ts` の `composer-fullwidth` が、シェルを入れた後に基準画像と合わなくなった (`maxDiffPixelRatio: 0.01` を超えた)。

- **差の中身**: 画像の大きさ・折り返し・行送り・余白は同じ。差は全グリフの輪郭のアンチエイリアスだけ (diff 画像で輪郭だけが赤い)
- **理由**: composer の左端の位置が、サイドバーの幅 (X-5 の一覧 256px → 280px) と右のペインの畳んだ帯 (40px) で変わり、文字のサブピクセルの位置がずれた。composer の幅 (上限 704px) は、右のペインを既定で畳むことで保っている (data-model §2)
- **撮り直さない案は採らなかった**: 余白を調整して旧位置と同じサブピクセルに合わせると、見た目のためでなく比較を通すためだけの調整になる (検出を消すだけの変更)
- **人間の見た目の承認**: 利用者が 2026-10-05 に expected / actual / diff を見て撮り直しを承認した。`--update-snapshots` で `e2e/composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png` だけを撮り直し、撮り直した後に全件の E2E が通った

## V-1 画面の ID と nav の手順が残らない (SC-005) — 2026-10-05

- `SCREENS|ScreenId|setScreen` を `src` / `e2e` / `perf` に対して Grep: **0 件** (設定のダイアログの項目の表の名前が `SECTION_SCREENS` で当たったので `SECTION_CONTENT` に直した)
- `name: /?\^?セッション起動` を同じ範囲に対して Grep: **0 件**
- 削除した `SessionScreen` を指す注記を、移した先 (`LivePane` / `RunningSessionsProvider` / `LaunchPanel`) に直した。「X-5 の `SessionScreen` から移した」の経緯の記述は残す

## V-2 記録の追随 (SC-006) — 2026-10-05

- `docs/decisions/0046-app-shell-layout.md` は **`status: accepted`** (quickstart の「proposed」は design の時点の記述。利用者が 2026-10-05 に承認した)
- roadmap の M3 に O-7 が O-3 の前 (順 12) にあり、O-3〜O-6 の依存に O-7 がある。Optional scope に OPT-panel があり、Terminal は OPT-pty が持つ
- `node scripts/constitution/check.mjs`: **ok 20 / 違反 0 / 検査対象なし 1**
- `git diff main...HEAD -- src/main/app/protocol.ts`: 空 (SC-001。CSP を変えていない)

## V-3 実機の目視 (利用者。未実施)

自動の合否に含めない。実機の操作は行っていない (アプリの dev 起動・実 `claude`・WSL)。quickstart の V-3 の項目は利用者に残す。
特に **SC-008 (WSL のディストロを実行中にして起動し、取り直さずに過去のセッションの区画にその所在のセッションが出る)** は E2E では
検出できない。component テストでは、初回の `listSessions` が `listRuntimes` の解決の前に呼ばれないことと、`listRuntimes` が失敗しても
列挙することを確かめている (`SessionListScreen.test.tsx`)。
