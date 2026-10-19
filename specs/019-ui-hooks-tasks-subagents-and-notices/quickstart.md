# Quickstart: Hook・背景の task・実行中の subagent の表示 (O-11)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流す。以下は自動で見ない確認。

**前提**: spec の U-1〜U-11 と AD-054 / AD-055 / AD-056 は 2026-10-17 に利用者が承認した (FR-015)。

## V-0 境界の差分 (SC-004)

- `SESSION_EVENT_KINDS` (O-10 の後の 9)・`SessionControl` の種類・`TRANSCRIPT_PART_FIELDS`・`TRANSCRIPT_MESSAGE_FIELDS`・`PermissionRequest` のフィールド・`toPermissionResult` の出力の差分が 0。IPC・preload・main の差分が 0 (`git diff --stat main -- src/main src/preload` と型の固定テスト)
- `QUERY_OPTION_KEYS` が `includeHookEvents` / `forwardSubagentText` の 2 つだけ増えている (main の 9 キー (AD-053 の `onElicitation` を含む) から 11 キー)
- `AGENT_SDK_ALLOWED_CALLS` が `listSubagents` / `getSubagentMessages` の 2 つだけ増え、`AGENT_SDK_CALL_FILES` の fixture 4 本 (2 つの API を外で呼ぶもの・2 つ目の import 文・許可の名前の別名) で項目 14 が発火する。`read-transcript.ts` の外に 2 つの呼び出しが無い
- `MeterUpdate` の種類が `background-tasks` の 1 つだけ (9 → 10)、`SYSTEM_EVENT_CATEGORIES` が `backgrounded-task` の 1 つだけ (12 → 13)、`PANEL_TABS` が `background-tasks` の 1 つだけ (4 → 5) 増えている
- `sdk-agent-session.ts` の `Query` のメソッドの呼び出しが `interrupt` だけ (項目 16 が ok)

## V-0b 対応表 (SC-005)

`node scripts/constitution/check.mjs` の項目 21 が ok で、出力の割当先に O-11 が 0 件、M3 の完了の条件の残りが 0、O-12 の行が数えられている。

## 実機の目視 (利用者。自動の合否に含めない。本番ビルドで)

各項目の結果は `quickstart-results.md` に記録する。太字は記録が後の判断の材料になる項目。

**完了の PR の条件** (spec FR-012 / SC-005): V-1 (一般の Hook の行が出た)・V-3 (「背景に移した」の行が出た)・V-4 (subagent のメッセージが入れ子に出た) の記録が「届いた」であること。記録が無い・「届かない」の行は対応表で `実装済み` にせず、完了の PR を出さずに利用者に返す。V-5 は条件にしない。

### V-1 一般の Hook (US-1)

- PreToolUse / PostToolUse / Stop の Hook を設定し、tool の前後と応答の終わりに Hook の行が出て、成功・失敗が書き換わること
- **`hook_name` の実際の値を記録する** (`PreToolUse:Bash` の形か、コマンドの文字列か。O-2 V-4 の未記録の項目)。名前が伏せられた行で「Hook (PreToolUse) 1」「… 2」と番号が付くこと
- 失敗する Hook (exit 1) で、行が注意の見た目になり、ナレーターで読み上げられること。成功した Hook は読み上げないこと
- Hook の stdout / stderr に目印の文字列を出させ、DOM (開発者ツールの検索) に出ないこと

### V-2 過去ログの Hook / task の行 (FR-012 / SC-005)

- V-1 と V-3 のセッションを過去ログで開き、**Hook の行・背景の task の行・後から背景に移った task の行が残るかを記録する**。残れば対応表の経路を「両方」に直す (data-model §4)

### V-3 背景の task (US-2)

- `run_in_background` の Bash を走らせ、task の行と「背景の task」のタブに出ること。**行と一覧にコマンドの名前 (`npm` など) が出て、引数が出ないこと**
- 長い Bash を前景で始めて Ctrl+B などで背景に移し、**「背景に移した」の行が出るかを記録する** (`task_updated` の `patch.is_backgrounded` が届くか)
- 背景の subagent を走らせ、一覧に出て、終わると消えること。タブの見出しの件数が変わること
- セッションを終えて、タブが「セッションは動いていません」になること。同じセッションを再開して一覧が空から始まること
- **ambient の task が一覧に出ないこと (起こせなければ「未確認」)**

### V-4 実行中の subagent の入れ子 (US-3)

- subagent (`Agent` tool) を使う依頼で、subagent の発言・thinking・tool の呼び出しが親の Subagent の表示の中に出て、主ループに平らに並ばないこと
- **subagent の text が `parent_tool_use_id` 付きで届くかを記録する** (`forwardSubagentText` の効き。agents のデバッグログではなく表示で確かめる)
- 入れ子の中の Read / Bash が主ループと同じ専用の表示で出て、結果待ちの印が出ること
- subagent の中で subagent を起動させ、入れ子が 2 段になること
- subagent の中の tool の前後で Hook が走ったとき、Hook の行が主ループに出ること (US-1 AC5)
- **長い subagent (大きなファイルを何度も Read させる) で、入れ子が上限に当たるか・切り詰めの印が出るか・送り直しの回数と体感 (重さ) を記録する** (US-3 AC6 / plan RK-04。重ければ完了の PR の前に利用者に返す)
- 「会話の地図」のタブの活動の帯が、subagent の tool を数えないこと (実行中と過去ログで同じ重み。data-model §3.3 の時刻の行)
- **subagent の user のメッセージに合成のもの (Hook の追加の文脈・system reminder など) が届くかを記録する** (表示には出ないこと。US-3 AC7 / U-11)

### V-5 subagent の中の圧縮の境界 (US-3 AC3)

- **subagent の中で圧縮が起きたとき、system のメッセージが親の帰属つきで届くかを記録する** (SDK 0.3.270 の型には帰属が無い。research R-09)。起こせなければ「未確認」と書く

### V-6 過去ログの subagent (US-3 AC4 / U-8)

- V-4 のセッションを過去ログで開き、subagent の本文が入れ子に出ること
- **入れ子の subagent (subagent の中の subagent) のファイルを `listSubagents` が列挙するかを記録する** (`agentRelPath` の下のファイル。`sdk.mjs:202`)
- 32 を超える subagent を使ったセッションがあれば、33 件目以降が今どおり (Task のカードだけ) になること (無ければ「未確認」)

### V-7 O-8 の観測点 (FR-016)

- 一般の Hook と subagent の本文で 1 ターンの `receivedMessages` がどれくらい増えるかを記録する (roadmap の O-8 の行の (c))
