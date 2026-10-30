# Quickstart results: 起動設定の残りの軸 (024)

**Date**: 2026-10-30 (SH-011) | **Spec**: [spec.md](./spec.md)

## 自動の検証 (SH-011)

| 項目 | 結果 |
|---|---|
| lint (`eslint --cache .`) | exit 0 (error 0 / warning 353。prettier の整形の warning のみ) |
| 型検査 (node / web) | exit 0 / 0 |
| E2E の型検査 (`-p e2e/tsconfig.json`) | exit 0 |
| 依存グラフ | 違反 0 (572 modules) |
| Constitution 検証 | 違反 0 (ok 20 / 検査対象なし 1) |
| Vitest 全件 | 235 files / 4485 tests passed |
| rule fixture の照合 (`node scripts/rules/run.mjs`) | 未実施 (main が回す) |
| E2E (要ビルド) | 未実施 (main が回す) |

## 境界の確認 (Grep)

- `QUERY_OPTION_KEYS` は `src/agents/session-core.ts` に 1 つ。options の欄は 16 (`session-core.ts:194` の記述と一致)
- `PRESET_SCHEMA_VERSION` は 2 (`src/main/infra/settings/preset-record.ts:27`)
- 名前・追加ディレクトリをログに出す箇所 (`log` / `console` の呼び出しに `title` / `additionalDirector*` を渡す行): 0 件
- renderer の `additionalDirectoryIds` は folder id の配列だけ。パスを組み立てる・入力させる箇所の増加なし
- IPC の channel・`SessionControl`・`SessionEvent`・`LAUNCH_FAILURE_REASONS`・`classifyResult`・`launch-usage.json` の store・実名の列の差分 0 は、マージ前に `git diff` で最終確認すること (本記録では全件の diff 照合は行っていない)

## 実機 (quickstart V-0〜V-6。SC-009)

| V | 結果 |
|---|---|
| V-0 準備 | 未実施 (利用者の実機に残す) |
| V-1 追加ディレクトリ (R-02a の記録を含む) | 未実施 (利用者の実機に残す) |
| V-2 ターン数の上限 | 未実施 (利用者の実機に残す) |
| V-3 起動のときの名前 | 未実施 (利用者の実機に残す) |
| V-4 費用の上限 | 未実施 (利用者の実機に残す) |
| V-5 プリセットと再開 | 未実施 (利用者の実機に残す) |
| V-6 記録しないこと | 未実施 (利用者の実機に残す) |

基準画像の差で落ちた E2E spec: 未確認 (E2E は main が実行する)。
