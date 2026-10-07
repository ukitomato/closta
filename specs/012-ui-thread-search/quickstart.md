# Quickstart: Thread 検索と探す操作 (O-3)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の「agent 用」の列で流す (lint・型検査 2 本・依存グラフ・Constitution 検証・Vitest・E2E の型検査。E2E は要ビルドで CI の e2e job)。以下は自動では見ない確認。

## V-1 境界の差分 (SC-006)

`git diff main...HEAD -- src/domain/capability.ts src/preload src/main/app/ipc.ts src/main/app/session-ipc.ts src/domain/session/launch-config.ts src/domain/session/agent-session.ts` を読み、次を確かめる。

- `IPC_CHANNELS` の追加は `getLaunchUsage` の 1 つだけ (チャネルの集合の固定テストも同じ集合)
- `launchSession` の引数の追加は `origin` の 1 つだけで、`SessionLaunchConfig` の型の差分が 0
- `ipc.ts` に起動元の検証と記録の呼び出しが増えていない (`session-ipc.ts` の `handleLaunchSession` に置く)。新しいチャネルも `handle()` (送信元の検査) を通る
- `SessionEvent` の種類・query の options のキーの差分が 0

## V-2 記録の追随 (SC-007)

- `docs/decisions/0045-ui-labels-no-i18n-resources.md` が `status: accepted` で、Confirmation に直書きの基準線 (実装の最初に数えた件数) がある
- Constitution XV が AD-045 に合わせて MINOR で改められ (v1.4.0)、Amendment trail がある。改定は architecture-reviewer を交えた人間のレビューを経ている (改定手順 2)
- `node scripts/constitution/check.mjs` が通り、項目 21 (対応表) が ok
- roadmap に O-8 / O-9 の行があり、O-3 の行に義務 (O-1 から) (2) が残っていない。`#o3-kpi-smoothness` を指していたリンク (session charter・010 quickstart-results・roadmap の実機計測ハーネスの項目) が O-8 の行を指す
- session charter の KPI「再利用率」の文言が U-6 の数え方 (プリセットを適用した起動が、適用しない起動を上回る) で、計測経路がプリセットの欄と `launch-usage.json`
- session charter の計測経路の注記に次の 4 点がある (spec FR-016 / plan 申し送り #14)
  - 判定の期間はプリセットの欄の直近 30 日の 2 つの回数
  - 最低件数と判定の時期を持たない
  - 数える単位は受け付けた起動の要求 (FR-010)
  - 前回の設定を変えずに起動し直した起動は、前回の起動元に数える (FR-009)
- glossary の「起動元」が同じ数え方 (FR-009) を引き、Launch notice の「含まない起動の初期値」に `launch.lastOrigin` がある
- `docs/ui-coverage.md` の F 節: Thread search / Conversation search / Command palette / Empty state の使い道 (使わないものは理由) が本 feature の結論で、Activity graph / Heat graph / Message timing / Trace waterfall の備考が O-9

## V-3 実機の目視 (利用者。自動の合否に含めない。**本番ビルド (packaged) で行う** — 本番の CSP でだけ落ちるものがあるため)

- 実アプリで Ctrl+K・Ctrl+F・検索欄の Enter / Esc が IME の変換中に反応しないこと (Microsoft IME)
- 長い過去ログで、会話内検索の強調が markdown の描画 (コード・表・リスト) の中でも見え、現在の一致が区別できること。強調が本番の CSP で消えないこと
- 実行中のセッションで、窓の外 (「さらに表示」の先) の一致に移れること
- 過去のセッションが 50 件以上ある状態で、目当てを語 1〜2 個で絞れたか (O-9 の本文の横断検索の要否の判断の材料。結果を quickstart-results に書く)
- 稼働中の区画が伸びて過去の区画が縮んだとき、見出しと検索欄が見え、行の題のツールチップがキーボードのフォーカスでも出ること
- プリセットを適用して起動 → プリセットの欄の回数が増えること。`launch-usage.json` を開き、版と日付と 2 つの回数のほかに何も無いこと
