# Quickstart: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Spec**: [spec.md](spec.md) / **Plan**: [plan.md](plan.md)

コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の「agent 用」列 (node で直接呼ぶ形)。結果は `quickstart-results.md` に書く。

## V-1. 境界の差分 (SC-010)

`git diff main...HEAD` で次を確かめる。

- `src/agents/session-core.ts` の `QUERY_OPTION_KEYS` が 9 キーで、増えたのは `onElicitation` だけ。`onUserDialog` / `supportedDialogKinds` の綴りは `src/agents/` の非テストのコードに 0 件
- `SESSION_EVENT_KINDS` が 9 (`elicitation-request`)、`SessionControl` の種類が 6 (`respond-elicitation`)
- `IPC_CHANNELS` の増分は `respondElicitation` だけ。`src/preload/index.ts` の増分は `respondElicitation` と `respondPermission` の引数だけ。戻り値はどちらも `Promise<void>` (spec U-9)。新しい handler は `ipc.ts` の `handle()` で登録されている
- 検証の述語 (`isPermissionAnswers` / `isElicitationAction` / `isElicitationContent`) は domain に 1 つずつで、`validate.ts`・renderer・agents はそれを import している (同じ規則が別の場所に書かれていない。U-9)
- `docs/decisions/0052-*.md` / `0053-*.md` の frontmatter が `status: accepted` (日付つき)
- 差分 0: `AGENT_SDK_ALLOWED_CALLS`・`QUERY_MUTATION_METHODS` (22)・`METER_UPDATE_TYPES` (9)・`TRANSCRIPT_PART_FIELDS`・`queryHandle` の型 (`interrupt` と非同期の反復だけ)
- `updatedInput` の綴りは `src/domain/session/agent-session.ts` (射影) とそのテストだけ。`updatedPermissions` は src の非テストのコードに 0 件 (コメントを除く)

## V-2. 自動の検証

```
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false
node node_modules/eslint/bin/eslint.js --cache .
node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src
node node_modules/vitest/vitest.mjs run
node scripts/constitution/check.mjs
node scripts/rules/run.mjs
node node_modules/typescript/bin/tsc --noEmit -p e2e/tsconfig.json
```

- `check.mjs` の項目 16 が ok (`updatedInput` の backstop を含む)、項目 21 が ok で、出力の後続の件数に O-10 が無く、`M3 の完了の条件の残り: 3` (SC-009)
- `scripts/rules/run.mjs` で新しい違反の fixture (`sdk-updated-input`) が項目 16 を発火させる (SC-002)
- 要ビルドの E2E (`node node_modules/@playwright/test/cli.js test -c playwright.config.ts`) は CI の e2e の job で緑を確かめる (IME の変換中の `/` の場合と、日本語の名前の locator。SC-006 / SC-007)。本機では CI の基準画像の差が出うる (CI red on main の記録のとおり、基準画像は CI の artifact から取る)

## V-3. 実機の目視 (本番ビルド。利用者の作業)

起こせなかった項目は「未確認」と書いて残す。

| # | 確かめること | 記録すること |
|---|---|---|
| 1 | `AskUserQuestion` を出させ (「選択肢で聞いて」と頼む)、承認カードで答えて「回答を送る」 | Claude が受け取った tool_result の中身 (回答の書式。O-5 V-3 から預かった項目)・次の応答が回答を前提に進んだか |
| 2 | `multiSelect` の問いで 2 つ選んで送る | tool_result の書式 (`", "` でつないだ値が Claude Code の書式と比べてどうか) |
| 3 | 「その他」に自由に書いて送る | tool_result に書いた文が入るか |
| 4 | 起動の権限モード `dontAsk` / `plan` で `AskUserQuestion` が承認の要求として届くか | 届いた / 届かなかった (届かなければ今どおり) |
| 5 | Elicitation を送る MCP サーバー (form) を設定して答える | カードの見え方・`accept` で tool が進んだか・断る / 取り消すの結果 |
| 6 | URL の Elicitation (MCP の認証など) で「ブラウザで手続きをする」 | 既定のブラウザで開いたか・押した時点でカードが外れ承認待ちが解けたか (U-8)・サーバーが `accept` の後に手続きを待ったか・`elicitation_complete` の行が出たか (届く順) |
| 7 | 問いのカードが出ている間に中断する | カードが外れ、tool の結果が取り消しになったか |
| 8 | composer で `/` と打ち、候補から選ぶ。IME (Microsoft IME) で変換中に `/` を含む文字を打つ | 候補の見え方・変換中に候補が出ないこと |
| 9 | サイドバーの行にフォーカスを置いたまま、表示中のセッションのキューの入力が送られてターンが始まる | フォーカスが動かないこと |
| 10 | ナレーターで composer のボタンを読む | 日本語の名前で読まれること |
| 11 | モデルの拒否を起こし (起こせなければ未確認)、「編集して再試行」 | `refused_user_message_uuid` が届くか・文が composer に戻るか |

form の Elicitation に目印の値 (例 `O10-MARKER-xyz`) を入れて送ったあと、ユーザデータディレクトリの下と、開発ビルドのコンソールの出力に目印が無いことも見る (SC-004 の実機の補足。正本は自動のテスト)。
