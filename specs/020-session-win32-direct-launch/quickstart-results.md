# Quickstart results: 020 Win32Runtime の直接起動 (X-8)

## ローカルの verify (implementer、2026-10-21)

| 項目 | 結果 |
|---|---|
| lint (`--quiet`) | exit 0 |
| 型検査 (node / web) | exit 0 / 0 |
| E2E の型検査 (`e2e/tsconfig.json`) | exit 0 |
| 依存グラフ | 違反 0 (516 modules) |
| Constitution 検証 | 21 項目: ok 20 / 違反 0 / 検査対象なし 1 (項目 3 の違反 2 件は `WSL_LAUNCH_KIND` の導入で解消) |
| Vitest 全件 | 201 files / 3660 tests passed |
| rule fixture の照合 (`test:rules`) | exit 0 (main で実行。2026-10-21) |
| ビルド (`pnpm build`) | exit 0 (main で実行) |
| E2E (要ビルド) | 1 回目: 18 件中 15 passed / 3 failed。`multi-session.spec.ts:97` (session-limit) は本 feature の退行 (起動ダイアログが一覧の読み込み中に `folder-missing` / `runtime-missing` を出していた) で、`LaunchDialog.tsx` を直した。2 回目 (3 spec): `multi-session.spec.ts` は全件 passed |
| 基準画像の差 | `composer-screenshot.spec.ts:28` (幅 641px → 673px) と `sidebar-screenshot.spec.ts:52` (ウィンドウ 1000×640 → 1001×642) が落ちる。**main (79babdf〜0ba52bd のビルド) でも同じ 2 件が同じ寸法で落ちる**ことを確かめた (2026-10-21) ので、本 feature の原因ではなく本機の画面の揺れ。基準画像は更新しない (CI が直ったら CI の artifact から取り直す) |
| 最終 verify (pr-gate の修正 c49190c の後、本枝でビルドし直して E2E 全件) | ビルド exit 0。E2E 18 件中 16 passed / 2 failed (上の基準画像 2 件だけ) |

## 実機 (quickstart V-0〜V-9)

すべて **未実施** (2026-10-21 の夜間の規則。V-1 (SC-001) と V-3 (SC-004) を含む。利用者の実機に残る)。
