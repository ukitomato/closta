# 023 quickstart-results

2026-10-28 / SH-011 (implementer)。マージの条件の検証の記録。

## 自動検証 (SC-001〜SC-008)

| 検証 | 結果 |
|---|---|
| 型検査 `tsconfig.node.json` / `tsconfig.web.json` | exit 0 / 0 |
| E2E の型検査 `e2e/tsconfig.json` | exit 0 |
| lint (`eslint --cache .`) | exit 0 (error 0 / warning 62。すべて `prettier/prettier` の整形の warning) |
| 依存グラフ (`dependency-cruise src`) | 違反 0 (555 modules)。BE-040 で `sdkModelOf` を `src/domain/provider/model-catalog.ts` に移し循環を解消 |
| Constitution 検証 | 21 項目: ok 20 / 違反 0 / 検査対象なし 1 (#5。既存) |
| 項目 21 | `後続: X-6` の行 0 (残りは `後続: I-3(M4)` 2 件)。E 節の 4 行は FR-015 のとおり (SC-007) |
| Vitest 全件 | 224 files / 4158 tests passed |
| 項目 14 | 許可に `renameSession` (6 件) |
| 項目 7 / 15 | `rename-spawner.ts` / `session-rename-service.ts` / `live-transcript-target.ts` が許可・対象に入っている |

## Grep の確認

- `ipcMain.handle` は `src/main/app/ipc.ts:210` の `handle()` の中の 1 箇所だけ
- 3 つの channel (`setSessionPermissionMode` / `setSessionModel` / `renameSession`) は `handle(` の第 1 引数として `ipc.ts` に登録されている
- 新設の 6 ファイルのログ出力は `session-rename-service.ts` の `[session] rename ok` / `rename failed` だけ (名前・会話の id・config ディレクトリを含まない)

## main で実行したもの (2026-10-28)

- rule fixture の照合 (`node scripts/rules/run.mjs`): exit 0
- ビルド (`electron-vite build`): 成功
- E2E 全件: 1 回目は 19 passed / 5 failed。落ちたのは基準画像の既知の 2 件 (`composer-screenshot.spec.ts` 641→673px、`sidebar-screenshot.spec.ts`。main でも本機で落ちる) と `live-session-settings.spec.ts` の 3 本。3 本は implementer fix で直した (名前: 保存ボタンが「応答待ち」の span の下に重なる実装の不具合 → `LiveSettingsControls.tsx` の form を `shrink-0` に / モデル・権限モード: 右のペインが畳まれていて「概要」が tab でなく button になる、spec の手順の誤り)。ビルドし直して `live-session-settings.spec.ts` は 3 passed。基準画像はこの PR では更新しない (CI の artifact から取り直す)
- 境界の差分 (`git diff b7d0dad`): `src/renderer/src/features/chat` と `src/main/infra/settings` の差分 0。`QUERY_OPTION_KEYS` / `LAUNCH_FAILURE_REASONS` / `METER_UPDATE_TYPES` の定義行に変更なし。`SessionControl` に `set-permission-mode` / `set-model` の 2 種類、`IPC_CHANNELS` に 3 つ。件数の照合は Constitution 検証の項目 14 / 16 と単体テストに依る

## pr-gate R1 の修正後 (2026-10-29、head 4428b06)

- rule fixture の照合: exit 0 (新設の `sdk-reexport` / `sdk-nonliteral-specifier` を含む)
- ビルド: 成功
- E2E 全件: 22 passed / 2 failed (基準画像の既知の 2 件 `composer-screenshot.spec.ts` / `sidebar-screenshot.spec.ts` だけ)

## 未実施 (利用者の環境に残す)

- H-002 (ヘッダの折り返し) の実際の窓での確認 (jsdom に layout が無く単体テストで確かめられない)

- quickstart V-0〜V-6 (SC-009。本番ビルド・実機の `claude`): 未実施 (利用者の実機に残す)
