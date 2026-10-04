# Research: 会話の境界と tool の専用表示の第 2 弾 (O-6)

調べた日: 2026-10-04 (夜間の自走)。design-gate R1 の後に R-06〜R-12 を足した。

## R-01 範囲の分割 (U-1)

- 対応表の `後続: O-6` は 30 行 (Tier A 14: `compact_boundary`・`model_refusal_fallback`・`model_refusal_no_fallback`・`informational`・`conversation_reset`・`Read`・`Glob`・`Grep`・`WebFetch`・`WebSearch`・`TaskCreate`・`TaskGet`・`TaskUpdate`・`TaskList`)。O-2 の quickstart-results V-1 の件数 (O-6 30 [Tier A 14])
- roadmap の O-6 の行には、さらに O-2 の pr-gate R2 / R3 の項目と V-4 の 4 項目がある
- Tier A の `実装済み` の行の備考で O-6 に回した残りが 5 行ある (ui-coverage.md:53 一般の Hook・:60 後から背景に移った task・:104 結果の状態・:114 実行中の subagent の入れ子・:117 Agent plan の markdown)。O-2 pr-gate M-201 は「項目 21 の M3 の件数がこれを数えない → O-6 の design で D 節に行を起こすか凡例に規定」とした
- **Decision**: Tier A 14 行と表示の状態を O-6 に、残りを O-11 に (AD-049 Decision 1)。備考の 5 行のうち :104 / :117 は O-6 で解消し、残る 3 つは D 節に Tier A の `後続: O-11` の行を立てる (data-model §5)
- **Rationale**: M3 の完了の条件は Tier A の `後続` の行だけで判定する (AD-044 Decision 3)。D 節に立てないと、3 つが出ないまま M3 が閉じる

## R-02 V-4 の結果

- `specs/011-ui-coverage/quickstart-results.md` の V-4: 利用者の判定は「いい感じ」。transcript の追従の不具合を R-3 由来と特定して直した (PR「fix(ui): follow transcript bottom with default turn anchor」)。📝 の 4 項目 (並列の結果の届き方・`hook_name` の値・`Agent` / `Task`・過去ログの Hook / task の行) は**未記録**
- **Decision**: 未確認として扱う。本 feature に関わる 2 つ (並列の結果・`Agent` / `Task`) は両方の形に耐える規則にする。残り 2 つ (`hook_name`・過去ログの Hook / task) は O-11

## R-03 SDK の型 (0.3.270)

- `compact_boundary`: `compact_metadata.trigger` (`manual` / `auto`)・`pre_tokens`・`post_tokens?`・`preserved_*` (再開のときの relink の情報。表示に要らない)
- `conversation_reset`: `new_conversation_id` だけ。SDK は「新しい id の下に transcript を作り直し、題をリセットせよ」と言う (`sdk.d.ts:4747`)
- `model_refusal_fallback`: `direction` (`retry` だけが今は出る。`revert` / `sticky` は互換のため残る)・`scope` (`session` / `local`。無ければ `session`)・`fallback_model`・`api_refusal_category` (開いた文字列)・`api_refusal_explanation` (「Unstable human prose — display only」)・`retracted_message_uuids` (「remove these messages from transcript state on receipt」。tool_result の tombstone の id も含む)・`refused_user_message_uuid` (編集して再試行の対象)
- assistant メッセージの `supersedes` (`sdk.d.ts:3370`): 「Evict the named messages on arrival … Idempotent with the end-of-turn model_refusal_fallback notice」
- `informational`: `content`・`level` (`info` / `notice` / `suggestion` / `warning`)・`tool_use_id` (同じ tool の進み具合の重複を除く)・`prevent_continuation`。SDK の説明は「hook feedback (e.g. a UserPromptSubmit hook's block reason), slash-command output」(`sdk.d.ts:4853`)
- tool の入力: `Read` (`file_path`・`offset`・`limit`・`pages`)、`Glob` (`pattern`・`path`)、`Grep` (`pattern`・`path`・`glob`・`output_mode` ほか)、`WebFetch` (`url`・`prompt`)、`WebSearch` (`query`・ドメインの制限)、`TaskCreate` (`subject`・`description`・`activeForm`)、`TaskUpdate` (`taskId`・`subject?`・`status` (`pending` / `in_progress` / `completed` / `deleted`) ほか)。タスクの id は `TaskCreate` の結果にだけある

## R-04 取り消しの運び方

- O-2 の行の `name` / `detail` は 120 コードポイントで切り詰める (011 data-model §2) ので、id の列を運べない
- O-4 の `meter` は 1 秒に 20 件の上限と間引きがあり、保留を `finish()` で捨てる (014 data-model §2)。取り消しは最新の値で置き換えられない 1 回限りの指示なので、O-5 の `init-report` / `commands` と同じく上限から外す
- agents の tool の結果の追跡 (`live-tool-results.ts:108-121`) は、結果が届くと覚えている assistant メッセージを同じ id で送り直す。renderer の `upsertMessage` は知らない id を末尾に足す。取り消しの後に結果が届くと、外したメッセージが戻る
- **Decision**: O-4 の `meter` に `retraction` を足し、上限に掛けない。agents の追跡と renderer のストアの両方で取り消した id を覚え、戻さない (data-model §1。AD-049 Decision 2)。`SessionEvent` の種類は増えない
- **Alternatives**: `SessionEvent` に新しい種類 `retraction` を足す — 種類の pin を変え、O-4 / O-5 の「種類を増やさない」の方針と合わない。meter の上限から外せば同じ確実さで届く

## R-05 element (Principle XIII)

- F 節: File tree (A)・Tool call (A)・Web search (A) の使い道を本 feature に。Todo list (A。R-4 で採用済み) を `TaskCreate` / `TaskUpdate` にも使う。Inline citation / Sources は WebSearch の結果の形を推測しないので使わない (U-5)
- Compaction boundary: registry に専用の element があるかを実装の最初に確かめる。無ければ既存の divider の見た目を広げる

## R-06 Agent plan を MarkdownText で描く方式 (U-4。AD-035 D6 の読み替え)

- AD-035 D6 が plain text を選んだ理由: `MarkdownText` (`markdown-text.tsx:41-61`) は本文を props で受けず、text part の context から描く
- `@assistant-ui/react` は `TextMessagePartProvider` (`{ text: string; isRunning?: boolean }`。`@assistant-ui/core/react` の再 export) を export している。これで plan の文字列を text part の context に包めば、既存の `MarkdownText` (R-3 の `safeUrlTransform`・rehype-raw を足さない設定) をそのまま通せる
- markdown では生 HTML・HTML のコメント・参照定義が描かれず、本文の一部が見えなくなる。承認カードの生の入力は狭い枠の中の JSON なので、計画を読むのは transcript になる
- **Decision**: `TextMessagePartProvider` + 既存の `MarkdownText`。新しい描画口を作らない。「原文」の切り替えで plain text を出す (data-model §2)
- **確かめること (実装の最初)**: provider の中で `MarkdownText` が描け、`safeUrlTransform` が効くこと (R-3 の XSS の fixture 一式を Agent plan に当てる)

## R-07 圧縮の行 (O-4) と境界 (本 feature) を並べるか

- O-4 は統合するか並べるかを O-6 に任せた (014 data-model §3)
- O-4 の行は進み具合で、圧縮中・完了・失敗を出す。境界は会話の区切りで、成功したときだけ届く
- **Decision**: 並べる。行が先、境界が後 (届く順)。失敗のときは行だけが残るので、統合すると失敗が出せない
- **Alternatives**: 成功した行を境界に置き換える (1 回の `/compact` で 2 つ出るのを避けられるが、行の合成の規則に例外が要る)

## R-08 tool の入力と結果のパス

- R-2 FR-042 は「UNC 形式のパスを IPC 境界に出してはならない」で、アプリ自身のパスの値の規則。境界で守られている (`SessionListScreen.tsx:139`)
- UNC の判定の唯一の入口 `classifyRawPath` (`path-api.ts:177`) は `node:path` に依り、renderer から届かない (`ui-not-to-core`)。agents も UNC を扱えない (項目 13 / AD-028 §3)。AD-032 は文字を落とす方式を退けた
- tool の入力のパスは会話由来の本文で、今も ToolFallback の `argsText`・Code diff (`code-diff.aui.tsx:126`) で生のまま出ている
- **Decision**: パスは本文として出し、UNC を判定も除去もしない。見出しは末尾だけ (`pathTail`)。AD-049 Decision 5

## R-09 File tree を結果の text から作る (U-5 との違い)

- `Glob` / `Grep` (`files_with_matches`) の結果は 1 行 1 ファイルの一覧で、件数の見出しや打ち切りの注記が混ざりうる
- WebSearch で Sources を組まないのは、文章の中からリンクを推測する必要があるため (U-5)
- **Decision**: 区切りを含む行を項目、それ以外を注記にし、項目が 0 件なら text のまま出す (data-model §2)。推測が外れても全部の行がどこかに見える。階層は組まない (パスを分解しない。prototype の汚染も起きない)

## R-10 過去ログの `informational`・拒否・会話の作り直し

- 過去ログの取得は `getSessionMessages(…, { includeSystemMessages: true })` (`read-transcript.ts:70`)。SDK は「compact boundaries, informational notices」を含むと言う (`sdk.d.ts:820-822`)
- 今の変換 (`transcript.ts:181-208`) は Hook / task と圧縮だけを扱う。実データにどの型が残るかは未確認 (V-4 と同じ)
- **Decision**: 本 feature は実行中だけ。V-3 で残るかを記録し、残るなら O-11 で domain の純関数にして両方の経路に当てる

## R-11 `conversation_reset` の `new_conversation_id`

- アプリは SDK の会話の id を追っていない (`src` で `session_id|sdkSessionId` → 0 件)。セッションの識別はアプリの `sessionId`
- **Decision**: 読まない。境界の表示だけにする。/clear の後に過去ログの一覧で会話が分かれるかを V-3 で記録し、X-6 (再開・分岐) に申し送る

## R-12 取り消しの id の形

- 実行中のメッセージの id は SDK の `uuid` (`live-message.ts:76`)。SDK は「one uuid per normalized SDK message; multi-block messages carry per-block derived uuids」と言う。派生した id の形は書かれていない
- **Decision**: 形の検査は O-4 の `toolUseId` と同じ `^[A-Za-z0-9_-]{1,128}$` に広げる。fixture で、SDK の `uuid` と稼働中のストアの id が一致することを固定する。落ちた件数を開発用のログに数だけ残す
