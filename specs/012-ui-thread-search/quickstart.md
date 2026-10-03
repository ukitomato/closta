# Quickstart: Thread 検索と探す操作 (O-3)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流す。以下は自動で見ない確認。

## V-1 境界の差分 (SC-006)

`git diff main...HEAD -- src/domain/capability.ts src/preload src/main/app/ipc.ts` を読み、次を確かめる。

- `IPC_CHANNELS` の追加は `getLaunchUsage` の 1 つだけ
- `launchSession` の引数の追加は `origin` の 1 つだけで、`SessionLaunchConfig` の型の差分が 0
- `SessionEvent` の種類・query の options のキーの差分が 0

## V-2 記録の追随 (SC-007)

- `docs/decisions/0045-ui-labels-no-i18n-resources.md` が `status: proposed` (利用者が accepted にするまで Constitution XV を変えない)
- `node scripts/constitution/check.mjs` の項目 21 が ok
- roadmap に O-8 / O-9 の行があり、O-3 の行に義務 (O-1 から) (2) が残っていない。`#o3-kpi-smoothness` を指していたリンク (session charter・010 quickstart-results) が O-8 の行を指す

## V-3 実機の目視 (利用者。自動の合否に含めない)

- 実アプリで Ctrl+K・Ctrl+F が IME の変換中に反応しないこと (Microsoft IME)
- 長い過去ログで、会話内検索の強調が markdown の描画 (コード・表) の中でも見えること
- プリセットを適用して起動 → プリセットの欄の回数が増えること。`launch-usage.json` を開き、日付と 2 つの回数のほかに何も無いこと
