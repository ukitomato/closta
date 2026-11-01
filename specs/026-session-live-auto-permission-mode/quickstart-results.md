# 026 quickstart の記録 (2026-11-01)

| V | 結果 |
|---|---|
| V-1 | 未実施 (利用者の実機に残す) |
| V-2 | 未実施 (利用者の実機に残す) |
| V-3 | 未実施 (利用者の実機に残す) |
| V-4 | 未実施 (利用者の実機に残す) |
| V-5 | 未実施 (利用者の実機に残す) |

## ローカル検証 (SH-012)

- 型検査 (node / web / e2e): exit 0
- lint: exit 0 (error 0 / prettier の warning 75。整形は agent が実行しない)
- 依存グラフ: 違反 0
- Constitution 検証: ok 20 / 違反 0 (項目 16 ok・項目 21 ok)
- Vitest 全件: 4573 件中 1 件が時間切れ (`LivePane.progress.test.tsx` の「仮想 (41 件以上) の footer」。20s)。単独で再実行すると 19 件とも通った (負荷による時間切れ)
- rule fixture の照合 (`test:rules`): agent は実行しない (discovery.md)。pr-gate / CI に任せる
- E2E: 要ビルドで agent は実行しない。**未実行** (人間が実行)。対象は新設の 2 本 (`e2e/launch-dialog.spec.ts` の Auto の確認 / `e2e/live-session-settings.spec.ts` の Auto 切り替え) と、`e2e-capability.ts` の meter 追加が既存 E2E の期待を壊さないことの確認。
  - SC-001 / SC-004 の E2E 側は**未計測** (単体 / component テスト側は通過済み)。PR 本文にも「SC-001 / SC-004 の E2E 側は未計測」と書く (pr-gate 026 H-004)
  - 実行したら結果をここに追記する

## マージ前の残作業

1. E2E (要ビルド): 人間がローカルで実行する
2. rule fixture の照合 (`test:rules`): pr-gate / CI に任せる
3. H-007: AD-066 を accepted にし、Constitution v1.6.0 の改定手順 2 に人間のレビューの実施日を書くまでマージしない

## マージの前の確認 (H-007)

- AD-066 (`docs/decisions/0066-…md`) は `status: proposed`。レビューで accepted にするまでマージしない
- Constitution の Sync Impact Report (v1.6.0) の改定手順 2 は「未了」。人間のレビューの実施日を書いてからマージする
