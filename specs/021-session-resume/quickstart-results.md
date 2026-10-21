# 021 quickstart の結果

実施日: 2026-10-21 (夜間の規則)。

## V-8 (自動の検証。マージの条件)

| 項目 | 結果 |
|---|---|
| lint (`eslint --cache .`) | 0 errors (prettier の warning は既存の CRLF 由来で全体に出ている) |
| 型検査 (node / web / e2e) | 3 本とも exit 0 |
| 依存グラフ | 違反 0 (530 modules)。初回は `ui-not-to-core` が 118 件出た: `resume.ts` が `resolvePastResumeAxes` の経由で `match` → `path-api` → `node:path` に届いていたため、軸の解決を `resume-axes.ts` に分けて renderer の読む型 (`resume.ts`) から切り離した |
| Constitution 検証 | 違反 0 (ok 20 / 検査対象なし 1。項目 14 / 15 / 16 / 18 を含む) |
| Vitest 全件 | 209 files / 3856 tests。全件の 1 回目に `LivePane.resumed.test.tsx` の 1 件が負荷で落ちた (テキストの `indexOf` の比較が別の出現に当たる)。DOM の順序の比較に直し、単独で 7/7 緑 |
| Vitest 全件 (再実行) | 2 回目は同じ test が「前の質問」の複数一致で落ちた (地図などに同じ文字列が出る)。区切りの行を境にした位置比較に直し、3 回目の全件で 209 files / 3856 tests 全緑 |
| rule fixture の照合 (`scripts/rules/run.mjs`) | exit 0 (main が 2026-10-21 に実行) |
| ビルド (`pnpm build`) | exit 0 (main) |
| E2E 全件 (main が実行) | 21 tests: 20 passed / 1 failed。落ちたのは `e2e/composer-screenshot.spec.ts:28` のみ (基準画像の本機の揺れ。main でも同じく落ちる既知の状態で、020 の quickstart-results に記録済み。基準画像はこの PR では更新しない)。`e2e/session-resume.spec.ts` は通過 |
| 境界の差分 | `QUERY_OPTION_KEYS` 12 / `LAUNCH_FAILURE_REASONS` 19 をテストが固定。ログに会話の id の値を出す箇所は無い (新設の 4 ファイルに log 呼び出し 0。変更側は固定文字列 `conversation-id-changed` のみ) |

## 実機の確認

V-0 / V-1 / V-2 / V-3 / V-4 / V-5 / V-6 / V-7 / V-9: 未実施 (利用者の実機に残す。マージを止めない)。
