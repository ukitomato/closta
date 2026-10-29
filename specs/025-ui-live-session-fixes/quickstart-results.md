# 025 quickstart の結果 (2026-10-29。夜間の規則)

## ローカルの検証 (SH-012)

| 項目 | 結果 |
|---|---|
| 型検査 `tsconfig.node.json` / `tsconfig.web.json` | exit 0 / 0 |
| E2E の型検査 (`e2e/tsconfig.json`) | exit 0 |
| lint | exit 0 (error 0・warning 24。prettier の整形の warning で、本 feature 外のファイルを含む) |
| 依存グラフ | 違反 0 (569 modules) |
| Constitution 検証 | 21 項目: ok 20 / 違反 0 / 検査対象なし 1。項目 21 ok (E 節の `list_models`・F 節の行を含む)。項目 16 ok |
| Vitest 全件 | 234 files / 4269 tests 全て通過 |
| 境界の確認 (Grep / `git diff`) | `ipcMain.handle` は `ipc.ts` の `handle()` の中の 1 箇所だけ。`handle(IPC_CHANNELS.listSessionModels` の形で登録。`scripts/constitution/allowlists.mjs` の差分 0。モデルの値のログは件数 (`count` / `dropped`) だけ。`onKeyDown` の追加は無し |

## main で実行したもの (2026-10-29〜30、ec78163 + E2E 修正)

| 項目 | 結果 |
|---|---|
| rule fixture の照合 (`node scripts/rules/run.mjs`) | exit 0 |
| ビルド (`electron-vite build`) | exit 0 |
| E2E 全件 (1 回目) | 24 pass / 5 fail。025 の 3 本 (live-session-settings:96 / resume-command:23 / right-panel:14) は implementer fix で原因を直し、ビルドし直して通過 (E2E の fake の `sessionTargetKeys` / モデル一覧の `not-ready` の聞き直し / タブ選択後の `scrollIntoView`) |
| 基準画像の差 (本機の揺れ、既知) | `composer-screenshot.spec.ts` / `sidebar-screenshot.spec.ts` (ウィンドウ 1001×642 で 1000×640 にならない)。基準画像は本機で更新しない (RK-06) |

## 実行しなかったもの

- **`PERMISSION_MODE_NAMES` の差分と Constitution XV の Exceptions (SH-011) が同じ PR にあるか**: 両方とも同じ PR に入れる (夜間の規則で推奨案を採用。RK-08 の「Constitution より先に名前の表を main に入れない」は同じ PR なので満たす)。人間のレビューは朝に

## quickstart V-1〜V-9 (実機)

すべて **未実施 (利用者の実機に残す)**。V で RK-02 / RK-03 / RK-09 に当たれば利用者に返す。
