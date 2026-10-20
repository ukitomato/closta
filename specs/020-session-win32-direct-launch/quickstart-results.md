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
| rule fixture の照合 (`test:rules`) | 未実施 (agent は実行しない。pr-gate / CI に任せる) |
| E2E (要ビルド) | 未実施 (agent はビルドを実行しない。メインでの実行が要る) |
| 基準画像の差 | 未確認 (E2E 未実施のため) |

## 実機 (quickstart V-0〜V-9)

すべて **未実施** (2026-10-21 の夜間の規則。V-1 (SC-001) と V-3 (SC-004) を含む。利用者の実機に残る)。
