# Research: アプリのシェル (O-7)

調べた日: 2026-10-04

## R-01 目標の出所と、なぜ今か

- AD-025 の「目標レイアウト (2026-09-15 に人間から提示)」が 3 ペイン (左 thread-list-sidebar・中央 Chat・右 Workspace / Panel をタブで切り替える) を記録している。「決定ではなく目標の共有。採用には ADR を要する」「最初の UI 系 feature がシェルを組み替えることになる」
- 利用者 (2026-10-04): 「今のタブビューは全部廃止されて、ThreadList と Chat 画面の UI しかないアプリになるはず」「Cursor の AgentView のイメージが近い。右ペインも入れることになるが、最初に入れたほうが良ければ入れて」
- ui charter の Principle「見た目の判断を先送りしない」
- **Decision**: M3 の O-3 の前に置く。右のペインは枠とタブの仕組みと「概要」を入れる (spec U-4)
- **Rationale**: O-3 (検索・palette)、O-4 (Quota banner・Context display・Cost meter)、O-5 (Server panel)、O-6 (TodoList・Background task) は、どれも置き場所 (サイドバー / 中央のヘッダ / 右のタブ) で中身が変わる。分割を後から変えると、それらの置き場所を書き直す

## R-02 今の構造 (2026-10-04 の読み取り)

- `App.tsx:26-34` — 画面の ID と component の表。`:51-79` 上部のナビゲーション (7 ボタン) とテーマ。`:38` `useRunningSessionStoreWiring()` を App の寿命で 1 回 (X-5 FR-008)
- `stores/ui.ts:14-38` — `SCREENS` と `SCREEN_LABELS`。`:85` `seedFolderDraft` は `screen: 'folders'` に移す
- `SessionScreen.tsx:89-127` — `AssistantRuntimeProvider` (稼働中の thread list の runtime) の内側に、左の `RunningSessionList` (w-64) と右の表示中のセッションのペイン。未選択なら `LaunchDialog` を中央に描く
- `SessionListScreen.tsx:736,1044` — 行を選ぶと `setScreen('chat')`、フォルダ未登録の空の表示から `setScreen('folders')`
- `useTranscript.ts:66-81` — 過去ログは `stores/sessions.ts` の `selectedRowKey` から選ぶ
- E2E: `e2e/support/launch.ts:47` と `launch-dialog.spec.ts:18` が nav の「セッション起動」を押す。`multi-session.spec.ts:29` は「新規起動」(稼働中の一覧の `ThreadListNew`)。スクリーンショットは composer の領域だけ (`composer-screenshot.spec.ts:52`)

## R-03 runtime の provider の置き方

- 事実: 稼働中の一覧 (`RunningSessionList`) と表示中のセッションのペインは、同じ `AssistantRuntimeProvider` (稼働中の thread list の runtime) の内側にある。新しいシェルでは、一覧はサイドバー、ペインは中央に分かれる
- **Decision**: 稼働中の runtime の provider をシェルの全体を包む位置に上げる (`features/session/RunningSessionsProvider.tsx` に切り出し、`App` から使う)。過去の一覧と過去ログの transcript は、今どおり自分の provider を内側に持つ (入れ子)
- **Risk**: 入れ子の `AssistantRuntimeProvider` で、内側の component が外側の runtime を拾う。今の `SessionListScreen` / `ChatScreen` は自分の provider の内側でだけ assistant-ui の hook を呼ぶことを、component テストで確かめる (plan RK-02)

## R-04 element (Principle XIII)

- F 節: `Thread list sidebar` (A・未使用)、`Settings` (B・未使用)、`Empty state` (B・未使用)。registry に resizable の element があるかは実装の最初に確かめる
- **Decision**: `thread-list-sidebar` の生成物をサイドバーの枠に使う (中の一覧は今の 2 つの component)。設定は `Settings` を先に確かめ、合わなければ既存の Dialog。分割は registry の resizable か shadcn の `resizable` (react-resizable-panels) を先に確かめる。足す依存は plan に書く

## R-05 Cursor の Agent View との対応

| Cursor | 本 feature |
|---|---|
| 左の agent の一覧 (実行中と履歴) | サイドバーの稼働中と過去のセッションの区画 |
| 中央の会話 | 中央 (実行中の Chat / 過去ログ) |
| 右の Changes / Browser / Terminal | 右のペインのタブ (本 feature は「概要」だけ。他は OPT-panel) |
| 新しい agent | サイドバーの「新規起動」 |
