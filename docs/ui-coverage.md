# ui-coverage 対応表

Claude Code (Agent SDK) が emit する情報と、その表示の対応表 (Constitution Principle XII)。O-2 ([spec 011](../specs/011-ui-coverage/spec.md)) で作った。

SDK: `@anthropic-ai/claude-agent-sdk` 0.3.270

確認日: 2026-10-03

## 凡例

**決定の正本は [AD-044](decisions/0044-ui-coverage-assignment.md)** (割当の 3 種類、行の Tier の決め方、M3 の完了の条件、機械照合する節)。**この凡例は書式の詳細の正本**で、食い違ったら AD-044 を正とする。

- **機械照合**: Constitution 検証の項目 21 (`node scripts/constitution/check.mjs`。`scripts/ui-coverage/coverage.mjs`) が CI で毎回確かめる。A・C・E 節の行の集合は SDK の型定義の名前の集合と一致すること。B・D・F 節と A' 小節は照合の外で、割当の書式だけを確かめる。入力のファイルが無いときも違反になる
- **列** (A〜E 節): `識別子 | 判別子 | Tier | 割当 | 経路 | 備考` (この順・この綴り)。F 節は `element | Tier | 使い道 | 備考`
- **使い道** (F 節。O-3 で凡例に移した): 次のどれか。複数に使うときは `/` で並べる
  - 対応表の行 (`<節> <識別子>`。例: `C BashInput`・`D message-queue`)
  - `SDK の外: <置き場所>` — SDK の emit を表示しない用途 (例: シェル・設定・他 domain の操作 UI・transcript の空と読み込み中と取得の失敗・composer の入力の部品・Thread の操作のボタン・検索と palette。O-7 で追加。pr-gate R1 ui-coverage M-005 / R3 L-101)。`<置き場所>` は AD-046 Decision 6 の語 (サイドバー・中央のヘッダ・中央の本体・右のペインのタブ・設定のダイアログ) で書き、その語で表せない置き場所 (ダイアログの中身・アプリ全体のダイアログなど) はコンポーネントの名前を添える (O-7 pr-gate R2 ui-coverage L-101)
  - `未使用` — 入れていない・描いていない。使わないと決めた element は、備考に理由と決めた feature を書く (O-3 の Thread search)
  - 備考: 取り込んだ element に手を入れたときは、何を変えたか (registry との照合の結果) を書く。照合の正本はその feature の PR の説明で、備考はその写し
- **割当** (半角のコロン):
  - `実装済み: <element> (<経路>)` — 表示を担う element。複数は `/` で区切る。**ToolFallback だけの行は Tier B / C に限る**
  - `後続: <feature ID>` — roadmap の feature の表に実在し、完了していない ID を 1 つだけ。範囲は roadmap のその行の「対応表の割当 (O-2 から)」
  - `表示不要: <理由>` — Tier C の行は `表示不要: Tier C (<理由>)`
  - 空・`未割当`・`TBD`・`—` は割当ではない
- **Tier**: `A` (Claude Code の一次概念に直結し、利用者が見ないと判断を誤る) / `B` (無くても判断を誤らない) / `C` (対象外)
- **経路**: `実行中` / `過去ログ` / `両方` / `なし` (表示していない)
- **行の単位**: A 節は `SDKMessage` のメンバー 1 つにつき 1 行 (メンバーの中の subtype は備考)。C 節は入力型 1 つにつき 1 行で、判別子に実行時の tool 名を書く
- **行にしないもの**: 他 domain の一覧・操作画面に出る値 (`SDKSessionInfo` のフィールドなど) は行にしない。ui charter の Out of scope (他 domain の操作 UI は Principle XII の判定対象にしない) による。`SDKSessionInfo` はそもそも SDK の emit (AD-020 Decision 1 の分母) の外である。O-7 の右のペインの「概要」(ui) も過去のセッションの値 (`gitBranch` / `createdAt` / `lastModified`) を出すが、一覧の行と同じ値の再掲なので行にしない (O-7 pr-gate R2 ui-coverage L-104)
- **M3 の完了の条件**: Tier A の `後続` の行のうち、割当先が M3 の feature の行が 0 (項目 21 の出力の最後の行で読む)

### SDK を上げたときの手順

**SDK の版を上げる PR は、domain を問わずこの表を同じ PR で直す** (AD-044 Consequences)。

1. `node scripts/constitution/check.mjs` の項目 21 の失敗の出力を読む (足りない行・消えた行・版の違い)
2. 足りない行を足して割当を書き、消えた行を消し、冒頭の `SDK:` の版を書き換える。**SDK が型を正当に減らしたとき** (「SDK から読めた名前が極端に少ない」で落ちる) は、`scripts/ui-coverage/coverage.mjs` の `LOWER_BOUNDS` (parse の取りこぼしを捕まえる下限。今は実数と同じ) も新しい数に直す
3. 項目 21 が ok になることを確かめる。`ui-coverage-reviewer` が pr-gate で割当の妥当性を見る
4. 過去ログの fixture と実機の 1 件で、`getSessionMessages` の返りの `timestamp` から `createdAt` が埋まることを確かめる (型に無い値。AD-051)。消えていれば AD-051 の Confirmation に従う

## A メッセージ型

`SDKMessage` (`sdk.d.ts`) の 39 メンバー。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| SDKAssistantMessage | `assistant` | A | 実装済み: Thread / MarkdownText / Reasoning / ToolGroup / MessageTimeLabel / ConversationMapTab (両方) | 両方 | 中身のブロックは B 節。実行中はメッセージ単位で更新 (X-1)。O-9: 時刻 (`timestamp`。無ければ受信時刻。過去ログは `getSessionMessages` の返りの `timestamp`。AD-051) を中央の本体に出し、右のペインのタブ『会話の地図』の行と活動の帯に使う |
| SDKUserMessage | `user` | A | 実装済み: UserMessage / tool の結果は各 tool の表示 / MessageTimeLabel / ConversationMapTab (両方) | 両方 | 実行中の利用者の本文は送信時に楽観的に出す。tool_result は O-2 から実行中も呼び出しの表示に埋める (FR-007)。O-9: 実行中の入力の時刻は SDK に渡した時刻 (renderer)、過去ログは記録の `timestamp`。ターン (入力 1 つ) を地図の行にし、所要時間を出す |
| SDKUserMessageReplay | `user` (replay) | B | 表示不要: resume 時の再送。元の user メッセージを表示している | なし | |
| SDKResultMessage | `result` | A | 実装済み: FailureBanner / UsageTab / ContextCostMeter (実行中) | 実行中 | O-4。成功・失敗はセッションの状態。失敗は理由のキー (`subtype`・`api_error_status`・同じターンの主ループの assistant の `error` から `classifyResultFailure` が決める。AD-047 Decision 1 / 014 data-model §1) で区別し、中央の FailureBanner・監視ビューの行の短い理由・読み上げに出す。費用 (`total_cost_usd`。推定)・モデルごとのトークン (`modelUsage`)・ターン数 (セッションスレッドが result を数える)・拒否の件数は `meter` の `turn` で運び、右のペインの使用量のタブ (UsageTab) と中央のヘッダの目盛り (ContextCostMeter) に出す。**`errors` は出さない (U-5)**。**`num_turns` (1 ターンの往復の数) は出さない**。**`permission_denials` は件数** (tool の名前と入力は運ばない) |
| SDKSystemMessage | `system` / `init` | B | 実装済み: 構成のタブ (実行中) | 実行中 | O-5。`model`・`mcp_servers` の名前と状態・`tools`・`skills`・`plugins` の名前と版・`slash_commands` を `meter` の `init-report` で運び、右のペインの「構成」のタブ (`InitReportTab`) に出す。MCP サーバーの `failed` / `needs-auth` は畳んだ帯のアイコンにも注意の印を付ける (015 data-model §2 / §3)。`cwd`・`plugins` の `path`・`apiKeySource` などは出さない。Tier B: 起動の設定は起動のダイアログ (X-4) で利用者が選んでいる。`permissionMode` は O-4 が権限モードの比較に使う (表示は権限モードの行と警告の帯。他のフィールドは読まない。014 data-model §2) |
| SDKPartialAssistantMessage | `stream_event` | B | 表示不要: 部分メッセージを要求しない (X-1 はメッセージ単位で更新する) | なし | `includePartialMessages` を渡していない |
| SDKCompactBoundaryMessage | `system` / `compact_boundary` | A | 実装済み: TranscriptBoundary / ConversationMapTab (両方) | 両方 | O-6。O-9: 地図の行に境界の印として出す。実行中は agents が `compact_boundary` から行を作り (`live-signals.ts` の `onSystem`)、過去ログは今の `divider` の part を同じ element に写す。手動 / 自動と前後のトークン数は実行中だけで、過去ログは数を省いた文言 (DTO が数を運ばない)。O-4 の圧縮の行 (`status` の `compact_result`) とは並べて出す (行が先、境界が後。失敗は行だけ。016 data-model §1) |
| SDKStatusMessage | `system` / `status` | A | 実装済み: SystemEventRow / UnsafeModeBanner / OverviewTab (実行中) | 実行中 | O-4。権限モードの変化 (`permissionMode`。ExitPlanMode の後など) は権限モードの行 (SystemEventRow)・「概要」の「現在の権限モード」(OverviewTab)・安全 3 値の外のときの警告の帯 (中央のヘッダの下。`CenterBanners.tsx` の UnsafeModeBanner。U-6)。圧縮中と圧縮の結果 (`compact_result`) はコンテキストの圧縮の行。`compact_error` は出さない。`status` の `requesting` は表示しない。承認とコンテキストに直結するので Tier A |
| SDKAPIRetryMessage | `system` / `api_retry` | A | 実装済み: SystemEventRow (実行中) | 実行中 | O-4。API の再試行の行 (回数・最大回数・HTTP の状態・待ち時間)。同じターンの再試行は同じ行に合成し、次の主ループの assistant か result で成功 / 失敗に閉じる。`error`・`no_response` は出さない (014 data-model §3) |
| SDKControlRequestProgressMessage | `system` / `control_request_progress` | B | 表示不要: アプリが送った制御要求の進捗の内部通知 | なし | |
| SDKModelRefusalFallbackMessage | `system` / `model_refusal_fallback` | A | 実装済み: SystemEventRow / ConversationMapTab (実行中) | 実行中 | O-6。O-9: 地図の行に拒否の印として出す。拒否の行 (fallback のモデルと scope・分類・拒否の説明を伏せ字つきで)。置き換えられた応答は `meter` の `retraction` で稼働中のストアから外す (AD-049 Decision 2)。過去ログは記録に残れば伏せ字つきの system の本文 (行は O-12) |
| SDKModelRefusalNoFallbackMessage | `system` / `model_refusal_no_fallback` | A | 実装済み: SystemEventRow / ConversationMapTab (実行中) | 実行中 | O-6。O-9: 地図の行に拒否の印として出す。拒否の行 (言い直して送り直せる旨・`content`・拒否の説明を伏せ字つきで)。過去ログは記録に残れば伏せ字つきの system の本文 (行は O-12)。O-10: `refused_user_message_uuid` があれば「編集して再試行」(composer に戻すだけ。巻き戻さない) |
| SDKLocalCommandOutputMessage | `system` / `local_command_output` | B | 後続: O-12 | なし | 過去ログは伏せ字つきの system の本文 (O-6) |
| SDKHookStartedMessage | `system` / `hook_started` | A | 実装済み: SystemEventRow (実行中) | 実行中 | SDK は既定で SessionStart / Setup の Hook だけを出す。一般の Hook (`includeHookEvents: true`) の行は O-11 で実装した (AD-054。D 節の general-hooks は V-1 で確認済み)。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKHookProgressMessage | `system` / `hook_progress` | B | 表示不要: 開始と結果の行で足りる。出力本文 (stdout / stderr) は出さない | なし | |
| SDKHookResponseMessage | `system` / `hook_response` | A | 実装済み: SystemEventRow (実行中) | 実行中 | 開始と同じ行を結果で書き換える。出力本文と終了コードは出さない。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKPluginInstallMessage | `system` / `plugin_install` | B | 実装済み: SystemEventRow (実行中) | 実行中 | O-5。プラグインのマーケットプレイスの導入の行 (category `plugin`。導入・失敗の数と最後のマーケットプレイスの名前。015 data-model §4)。`error` は出さない。アプリの起動では `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` を渡さない (AD-041 (e)) ので通常は届かない。`started` を経ない結果でも行を 1 つ作る (015 data-model §4) |
| SDKToolProgressMessage | `tool_progress` | B | 実装済み: ToolResultMarks (実行中) | 実行中 | O-4。tool の経過時間 (結果待ちの間だけ、tool の表示の見出しの右端に出す)。主ループの tool だけ (入れ子の tool は経過時間を出さない。O-11 の入れ子は結果の状態の印だけ)。セッションスレッドで tool ごとに 1 秒に 1 回まで間引く (014 data-model §2)。`tool_name`・`heartbeat`・`subagent_*` は運ばない |
| SDKAuthStatusMessage | `auth_status` | A | 実装済み: SystemEventRow (実行中) | 実行中 | O-5。認証の行 (category `auth`。認証中 → 成功 / 失敗に同じ行を書き換える。015 data-model §4)。`output` / `error` は出さない (U-4)。「認証中」を経ない失敗でも失敗の行を作る。始まりの見えない成功は行にしない |
| SDKTaskNotificationMessage | `system` / `task_notification` | A | 実装済み: SystemEventRow (実行中) | 実行中 | task の行の状態を完了・失敗・停止に書き換える。要約・出力ファイルは出さない。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKTaskStartedMessage | `system` / `task_started` | A | 実装済み: SystemEventRow (実行中) | 実行中 | 背景で始まった task (`is_backgrounded`) だけ。前景の task は Subagent・tool の結果で出る。後から背景に移った task の行は O-11 で実装した (D 節の late-backgrounded-task は V-3 で確認済み)。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKTaskUpdatedMessage | `system` / `task_updated` | A | 実装済み: SystemEventRow (実行中) | 実行中 | 行の状態だけを書き換える (説明の変更は読まない)。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKTaskProgressMessage | `system` / `task_progress` | B | 実装済み: SystemEventRow (実行中) | 実行中 | O-4。背景の task の行の種類の後ろに、使ったトークン・tool の回数・経過時間を並べる (行の更新。行の無い task への進み具合は捨てる。014 data-model §3)。要約 (`summary`)・説明・最後の tool 名は出さない。task の状態を持たない (AD-044 Decision 6)。task ごとに 1 秒に 1 回まで間引く |
| SDKBackgroundTasksChangedMessage | `system` / `background_tasks_changed` | B | 実装済み: 背景の task のタブ (実行中) | 実行中 | O-11。`meter` の種類 `background-tasks` で運び、右のペインのタブに最新の一覧を置き換えで出す (AD-056 Decision 2)。過去ログの経路は未確認 (019 quickstart V-2) |
| SDKThinkingTokensMessage | `system` / `thinking_tokens` | B | 実装済み: ThinkingIndicator (実行中) | 実行中 | O-4。実行中の transcript の末尾 (composer の上) に「思考中 約 N トークン」(推定)。次の主ループの assistant と result で消える。1 秒に 1 回まで間引く (014 data-model §2 / research R-07) |
| SDKSessionStateChangedMessage | `system` / `session_state_changed` | B | 表示不要: セッションの状態は状態通知 (SessionStatusUpdate) から一覧と表示中のセッションに出ている | なし | |
| SDKWorkerShuttingDownMessage | `system` / `worker_shutting_down` | B | 表示不要: 内部制御。supervisor の終了は `supervisor-exited` の失敗として出る | なし | |
| SDKCommandsChangedMessage | `system` / `commands_changed` | B | 実装済み: 構成のタブ (実行中) | 実行中 | O-5。slash command の一覧 (`name`・`description`・`argumentHint`) を `meter` の `commands` で運び、構成のタブのスラッシュコマンドの節に平文で出す (015 data-model §2)。`aliases` は出さない。composer の候補 (O-10): 先頭の `/` で表示中のセッションの一覧を前方一致で出し、同じ `ComposerPrimitive.Input` に載せる |
| SDKNotificationMessage | `system` / `notification` | B | 後続: O-12 | なし | |
| SDKFilesPersistedEvent | `system` / `files_persisted` | B | 後続: O-12 | なし | Checkpoints (表示だけ。巻き戻しはしない) |
| SDKToolUseSummaryMessage | `tool_use_summary` | B | 後続: O-12 | なし | |
| SDKMemoryRecallMessage | `system` / `memory_recall` | B | 後続: O-12 | なし | |
| SDKRateLimitEvent | `rate_limit_event` | A | 実装済み: QuotaBanner (実行中) | 実行中 | O-4。中央のヘッダの下の帯 (`CenterBanners.tsx` の QuotaBanner。F 節の Quota banner)。`status` が `allowed_warning` / `rejected` のとき、制限の種類・使用率・解除の時刻を出し、`allowed` が届くか解除の時刻を過ぎたら消す (014 data-model §4)。`overage*`・`limitScope`・`errorCode`・`surpassedThreshold` は出さない。claude.ai のサブスクリプションの Provider でだけ届く |
| SDKElicitationCompleteMessage | `system` / `elicitation_complete` | A | 実装済み: SystemEventRow (実行中) | 実行中 | O-10。`elicitation` の行 (サーバー名は形の検査を通したものだけ)。過去ログは O-12 の変換に従う (AD-056 Decision 1) |
| SDKPermissionDeniedMessage | `system` / `permission_denied` | A | 実装済み: DeniedNotice (実行中) | 実行中 | X-1 からの申し送り (聞かれずに拒否された操作) |
| SDKPromptSuggestionMessage | `prompt_suggestion` | B | 後続: O-12 | なし | |
| SDKMirrorErrorMessage | `system` / `mirror_error` | B | 後続: O-12 | なし | |
| SDKInformationalMessage | `system` / `informational` | A | 実装済み: SystemEventRow (実行中) | 実行中 | O-6。「知らせ」の行に `content` を伏せ字 (`redactSecrets`) と O-2 の切り詰めを通して出す (O-2 の「Hook の出力本文を出さない」の例外。AD-049 Decision 3)。同じ `tool_use_id` の知らせは 1 行にまとめ、`prevent_continuation` と `level` で見た目を分ける。過去ログは記録に残れば伏せ字つきの system の本文 (行は O-12)。UserPromptSubmit の Hook が prompt を止めた理由・Stop の Hook が続行を止めたこと (`prevent_continuation`)・slash command の出力の文言。止まった理由が分からないと判断を誤るので Tier A (中断) |
| SDKConversationResetMessage | `conversation_reset` | A | 実装済み: TranscriptBoundary / ConversationMapTab (実行中) | 実行中 | O-6。O-9: 地図の行に境界の印として出す。「ここから新しい会話です」の境界 (上の内容がコンテキストに無いとは断定しない)。`new_conversation_id` は読まない (X-6 に申し送り)。/clear・plan モードの終了などで会話が新しくなる。古い transcript がコンテキストに残っているように見えるので Tier A (セッションの境界) |

### A' union の外

`StdoutMessage` に現れるが `SDKMessage` の外の型。機械照合の外。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| SDKActiveGoalMessage | `active_goal` | B | 後続: O-12 | なし | |
| SDKKeepAliveMessage | `keep_alive` | B | 表示不要: 接続維持の内部通知 (export されていない) | なし | |
| SDKControlRequest / SDKControlResponse | `control_request` / `control_response` | B | 表示不要: 制御の封筒。中身は E 節 | なし | |
| SDKControlCancelRequest | `control_cancel_request` | B | 表示不要: 制御要求の取り消しの内部通知 (subtype を持たない) | なし | |

## B 中身のブロック

assistant / user のメッセージの content block。型は `@anthropic-ai/sdk` の beta の union にあるが、機械照合の外 (AD-044 Decision 4。照合は O-6 の design で O-11 に、O-11 の design で O-12 に送った。AD-049 Decision 1 / AD-056 Decision 1)。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| assistant/text | `text` | A | 実装済み: MarkdownText (両方) | 両方 | |
| assistant/thinking | `thinking` | A | 実装済み: Reasoning (両方) | 両方 | |
| assistant/redacted_thinking | `redacted_thinking` | B | 実装済み: Reasoning (両方) | 両方 | 文言 `[redacted thinking]`。O-2 で実行中もそろえた |
| assistant/tool_use | `tool_use` | A | 実装済み: ToolGroup / 各 tool の表示 (両方) | 両方 | tool ごとの割当は C 節。O-9: 地図の行の tool の数 (`ConversationMapTab`) |
| assistant/server_tool_use | `server_tool_use` | B | 後続: O-12 | なし | 知らないブロックとして捨てている |
| assistant/web_search_tool_result | `web_search_tool_result` | B | 後続: O-12 | なし | |
| user/text | `text` | A | 実装済み: UserMessage (両方) | 両方 | |
| user/tool_result | `tool_result` | A | 実装済み: 各 tool の表示 (両方) | 両方 | O-2 で実行中も呼び出しの表示に埋める (FR-007)。エラーと切り詰めは Terminal block・Code diff・ToolFallback・Subagent などの各表示に印を出す (O-2 pr-gate R1)。結果待ち・結果不明の印と読み上げは実装済み (O-6。`ToolResultMarks` の印と `TranscriptAnnouncer`。016 data-model §3 / §4)。対応の無い結果は結果だけの表示。O-9: 地図の行のエラーの数 (`ConversationMapTab`) |
| user/image | `image` | B | 実装済み: Image (過去ログ) | 過去ログ | 安全な data 画像の MIME だけ (svg を除く) |
| user/document | `document` | B | 後続: O-12 | 過去ログ | 今はファイル名の文字列だけ。File element は O-12 |

## C tool

`ToolInputSchemas` (`sdk-tools.d.ts`) の 45 メンバー。判別子は実行時の tool 名 (推定を含む。実データで確かめる)。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| AgentInput | `Agent` (旧 `Task`) | A | 実装済み: Subagent (両方) | 両方 | 両方の名前に当てる (O-2 FR-010)。実行中の入れ子と `getSubagentMessages` は O-11 で実装した (AD-055。D 節の subagent-nesting-live は V-4 で確認済み) |
| BashInput | `Bash` | A | 実装済み: TerminalBlock (両方) | 両方 | |
| TaskOutputInput | `TaskOutput` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ExitPlanModeInput | `ExitPlanMode` | A | 実装済み: AgentPlan (両方) | 両方 | plan の markdown の描画は実装済み (O-6。AD-049 Decision 4 による AD-035 D6 の読み替え。「原文」の切り替えつき) |
| FileEditInput | `Edit` | A | 実装済み: CodeDiff (両方) | 両方 | `MultiEdit` (入力型は無い) も CodeDiff |
| FileReadInput | `Read` | A | 実装済み: FileTool (両方) | 両方 | O-6。見出しにパスの末尾と範囲、畳んだ中身に全体のパスと結果。パスは会話由来の本文 (解決も UNC の判定もしない。AD-049 Decision 5) |
| FileWriteInput | `Write` | A | 実装済み: CodeDiff (両方) | 両方 | |
| GlobInput | `Glob` | A | 実装済み: FileTool (両方) | 両方 | O-6。結果のファイルの一覧は File tree (`FileResultTree`) |
| GrepInput | `Grep` | A | 実装済み: FileTool (両方) | 両方 | O-6。`files_with_matches` の結果は File tree、ほかの `output_mode` は text |
| TaskStopInput | `TaskStop` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ListMcpResourcesInput | `ListMcpResourcesTool` | B | 実装済み: McpToolCall (両方) | 両方 | O-5。MCP 系の組み込み tool (015 data-model §1) |
| RefreshMcpToolsInput | `RefreshMcpTools` | B | 実装済み: McpToolCall (両方) | 両方 | O-5。MCP 系の組み込み tool (015 data-model §1) |
| McpInput | `mcp__<server>__<tool>` | A | 実装済み: McpToolCall (両方) | 両方 | O-5。見出しにサーバー名 › tool 名 (構成のサーバー名の最長一致。一致が 1 つでないときは推定の印)、閉じた入力の JSON、平文の結果。振り分けは完全一致の表 → `mcp__` の判定 → ToolFallback の 2 段 (AD-048 Decision 5)。承認カードは生の名前を切り詰めずに出す。画像・resource の結果の印は出さない (U-7)。表やグラフに写さない (U-5) |
| NotebookEditInput | `NotebookEdit` | B | 実装済み: ToolFallback (両方) | 両方 | Tier B: 実行前に承認カードが入力 (対象と内容) を出し、ToolFallback が入力と結果を出す。notebook の diff 表示は無い |
| ReadMcpResourceDirInput | `ReadMcpResourceDir` | B | 実装済み: McpToolCall (両方) | 両方 | O-5。MCP 系の組み込み tool。見出しに URI の要約 (userinfo・query・hash と秘密の形の host・末尾を出さない。015 data-model §1) |
| ReadMcpResourceInput | `ReadMcpResourceTool` | B | 実装済み: McpToolCall (両方) | 両方 | O-5。MCP 系の組み込み tool。見出しに URI の要約 (015 data-model §1) |
| ReportFindingsInput | `ReportFindings` | B | 実装済み: ToolFallback (両方) | 両方 | |
| TodoWriteInput | `TodoWrite` | A | 実装済み: TodoList (両方) | 両方 | |
| WebFetchInput | `WebFetch` | A | 実装済み: WebTool (両方) | 両方 | O-6。見出しは http(s) の host だけ (パス・クエリ・資格情報・フラグメントを出さない)。畳んだ中身に伏せ字を通した URL・`prompt`・結果 |
| WebSearchInput | `WebSearch` | A | 実装済み: WebTool (両方) | 両方 | O-6。見出しに検索語とドメインの制限の件数、畳んだ中身に結果の text。Sources / Inline citation は組まない (U-5) |
| AskUserQuestionInput | `AskUserQuestion` | A | 実装済み: AskUserQuestion + ApprovalCard (両方 / 回答は実行中) | 両方 | 問いの読み取り専用の表示 (`AskUserQuestion` の部品。問い・見出し・選択肢・複数選択の印・過去ログの選ばれた回答) は O-5 で実装。O-10。回答は `updatedInput` の制約付き射影 (AD-052) |
| SendFeedbackInput | `SendFeedback` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ClaudeDesignInput | `ClaudeDesign` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ProjectsInput | `Projects` | B | 実装済み: ToolFallback (両方) | 両方 | |
| EnterPlanModeInput | `EnterPlanMode` | B | 実装済み: ToolFallback (両方) | 両方 | |
| TaskCreateInput | `TaskCreate` | A | 実装済み: TaskTool (両方) | 両方 | O-6。TodoWrite と同じ計画・進捗の概念 (Tier A。AD-019 Todo list)。TodoList の 1 項目で出す (呼び出しごと。計画の一覧は作らない。AD-056 Decision 3) |
| TaskGetInput | `TaskGet` | A | 実装済み: TaskTool (両方) | 両方 | O-6。見出しと結果の text |
| TaskUpdateInput | `TaskUpdate` | A | 実装済み: TaskTool (両方) | 両方 | O-6。TodoList の 1 項目 (状態の変化。`status` の無いものは見出しだけ) |
| TaskListInput | `TaskList` | A | 実装済み: TaskTool (両方) | 両方 | O-6。見出しと結果の text |
| REPLInput | `REPL` | B | 実装済み: ToolFallback (両方) | 両方 | |
| WorkflowInput | `Workflow` | B | 実装済み: ToolFallback (両方) | 両方 | |
| CronCreateInput | `CronCreate` | B | 実装済み: ToolFallback (両方) | 両方 | |
| CronDeleteInput | `CronDelete` | B | 実装済み: ToolFallback (両方) | 両方 | |
| CronListInput | `CronList` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ScheduleWakeupInput | `ScheduleWakeup` | B | 実装済み: ToolFallback (両方) | 両方 | |
| RemoteTriggerInput | `RemoteTrigger` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ShowOnboardingRolePickerInput | `ShowOnboardingRolePicker` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ReadNotificationsInput | `ReadNotifications` | B | 実装済み: ToolFallback (両方) | 両方 | |
| MonitorInput | `Monitor` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ProposeSkillsInput | `ProposeSkills` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ProposeGoalInput | `ProposeGoal` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ArtifactInput | `Artifact` | B | 実装済み: ToolFallback (両方) | 両方 | |
| PushNotificationInput | `PushNotification` | B | 実装済み: ToolFallback (両方) | 両方 | |
| EnterWorktreeInput | `EnterWorktree` | B | 実装済み: ToolFallback (両方) | 両方 | Tier B: 作業ディレクトリが変わることは承認カードと ToolFallback の入力・結果で出る |
| ExitWorktreeInput | `ExitWorktree` | B | 実装済み: ToolFallback (両方) | 両方 | Tier B: worktree / branch の削除 (`remove` + `discard_changes`) は実行前に承認カードが入力を出す。ToolFallback が入力と結果を出す |

## D アプリが作る経路

SDK のメッセージではなく、アプリが SDK の callback・制御・プロセスの状態から作る表示と、A 節の行の一部の機能の表示の経路 (Tier A の残りを M3 の件数に数えるための行。AD-049 による AD-044 Decision 4 の読み替え)。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| permission-request | `canUseTool` (単発) | A | 実装済み: ApprovalCard (実行中) | 実行中 | X-1 からの申し送り (承認カード)。O-10: `AskUserQuestion` (SDK の tool 名の完全一致) は答える部品と「回答を送る」(AD-052) |
| permission-request-capability | `canUseTool` (capability 付与) | A | 後続: I-3 | なし | Permission grant。M4 なので M3 の完了の条件には数えない (AD-044) |
| permission-denied | `permission_denied` (A 節) の一覧 | A | 実装済み: DeniedNotice (実行中) | 実行中 | X-1 からの申し送り (聞かれずに拒否された操作) |
| session-state | `SessionStatusUpdate` | A | 実装済み: CenterHeader の状態 (実行中) | 実行中 | O-7 で中央のヘッダ (シェルの `CenterHeader`。`RunningCenter` から) に移した。一覧の行の状態 (監視ビュー) は session の操作 UI |
| launch-failure | `failure` (理由キー) | A | 実装済み: FailureBanner (実行中) | 実行中 | O-4 で理由のキーが 18 になった (10 → 18。ターンの失敗を認証・請求・レート制限・API のエラー・実行中のエラー・3 つの上限に分ける。AD-047 Decision 1 / 014 data-model §1)。再ログインの導線は `auth-failed` と `provider-error` だけ。監視ビューの行の短い理由と読み上げも同じ理由 |
| end-forced | `end-forced` | A | 実装済み: EndNotice (実行中) | 実行中 | 強制停止・強制終了の告知 |
| interrupt-receipt | `interrupt-receipt` | B | 表示不要: 中断の受領。途中出力は transcript に残る | なし | |
| meter | `meter` (計量) | A | 実装済み: UsageTab / ContextCostMeter / QuotaBanner / UnsafeModeBanner / OverviewTab / ToolResultMarks / ThinkingIndicator (実行中) | 実行中 | O-4 (AD-047 Decision 2)。セッションスレッドが A 節の result・assistant・rate_limit_event・status / init・thinking_tokens・tool_progress から、数・真偽・列挙・モデルの id・形を検証した tool の id だけを運ぶ (許可リストの正本は 014 data-model §2)。稼働中のストアの `meters` に最新の値だけを持ち、永続化しない。状態通知には載せない。transcript の行になる出来事 (API の再試行・圧縮・権限モード・task の進み具合) は `meter` ではなく `message` の経路 (SystemEventRow) |
| message-queue | 実行中に積んだ入力 | A | 実装済み: MessageQueue (実行中) | 実行中 | X-2 |
| general-hooks | `includeHookEvents` の Hook の行 | A | 実装済み: SystemEventRow (実行中) | 実行中 | 一般の Hook の表示 (A 節の `hook_started` / `hook_response` の既定外の Hook)。O-2 pr-gate M-201。O-6 で D 節に立てた。O-11 (019) で実装。quickstart V-1 の実機で届いた (2026-10-19)。過去ログの経路は未確認 (V-2) |
| late-backgrounded-task | `task_started` の後から背景に移った task | A | 実装済み: SystemEventRow (実行中) | 実行中 | 後から背景に移った task の行。O-2 pr-gate M-201。O-6 で D 節に立てた。O-11 (019) で実装。quickstart V-3 の実機で届いた (2026-10-19)。過去ログの経路は未確認 (V-2) |
| subagent-nesting-live | `parent_tool_use_id` の実行中の入れ子 | A | 実装済み: Subagent (両方) | 両方 | 実行中の subagent の入れ子 (`getSubagentMessages`)。O-2 pr-gate M-201。O-6 で D 節に立てた。O-11 (019) で実装 (`listSubagents` / `getSubagentMessages` は AD-055)。quickstart V-4 の実機で届いた (2026-10-19) |

## E 制御要求

`SDKControlRequest` の `request` (`SDKControlRequestInner`) の 38 の subtype。UI から Claude Code を操作する経路 (AD-020 Decision 1 の「control 経路」)。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| interrupt | `interrupt` | A | 実装済み: 中断の操作と Stopped の表示 (実行中) | 実行中 | |
| can_use_tool | `can_use_tool` | A | 実装済み: ApprovalCard (実行中) | 実行中 | D 節の permission-request |
| initialize | `initialize` | B | 表示不要: 内部制御 | なし | |
| set_permission_mode | `set_permission_mode` | B | 後続: X-6 | なし | 起動時の選択は X-4 のダイアログ。実行中の切り替えは X-6 |
| set_model | `set_model` | B | 後続: X-6 | なし | |
| set_max_thinking_tokens | `set_max_thinking_tokens` | B | 後続: X-6 | なし | |
| rename_session | `rename_session` | B | 後続: X-6 | なし | セッション名 |
| set_color | `set_color` | B | 表示不要: CLI の表示色でアプリに当たる設定が無い | なし | |
| mcp_status | `mcp_status` | B | 表示不要: init の mcp_servers で足りる (AD-048) | なし | O-5。MCP サーバーの名前と状態は構成のタブ (A SDKSystemMessage)。制御要求を呼ばない (AD-048 Decision 2) |
| get_context_usage | `get_context_usage` | A | 表示不要: 制御要求を呼ばない。コンテキストの使用量は主ループの assistant の usage と result の contextWindow から推定する (U-3) | なし | Context display は assistant の usage と result の contextWindow の推定で実装済み (経路: 実行中。中央のヘッダの ContextCostMeter)。カテゴリ別の内訳は出さない (Claude Code の `/context` で見られる)。AD-047 Decision 4 |
| get_session_cost | `get_session_cost` | B | 表示不要: 制御要求を呼ばない。費用は毎ターンの result の total_cost_usd (推定) で足りる (U-3) | なし | 費用は使用量のタブ (UsageTab) と中央のヘッダの目盛り (ContextCostMeter) に出る。AD-047 Decision 4 |
| list_models | `list_models` | B | 表示不要: モデルの一覧は Provider のモデルカタログから出す (X-3 / X-4) | なし | |
| get_usage | `get_usage` | B | 表示不要: 制御要求を呼ばない。トークンとモデルごとの内訳は毎ターンの result の modelUsage で足りる (U-3) | なし | プランの全窓の利用率の一覧は出さない (レート制限に近づいたこと・超えたことは rate_limit_event の Quota banner)。AD-047 Decision 4 |
| get_binary_version | `get_binary_version` | B | 表示不要: 内部制御 | なし | |
| mcp_call | `mcp_call` | B | 表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048) | なし | |
| file_suggestions | `file_suggestions` | B | 表示不要: アプリの composer はファイル候補 (Mentions) を出さない | なし | |
| hook_callback | `hook_callback` | B | 表示不要: アプリは SDK の hook callback を登録しない | なし | |
| mcp_message | `mcp_message` | B | 表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048) | なし | |
| rewind_files | `rewind_files` | B | 表示不要: アプリは task・チェックポイントを操作しない (AD-036 §4 P3 / AD-048 / AD-049) | なし | Checkpoints は表示だけ (A SDKFilesPersistedEvent。O-12) |
| cancel_async_message | `cancel_async_message` | B | 表示不要: 内部制御 | なし | |
| read_file | `read_file` | B | 表示不要: 内部制御 | なし | |
| seed_read_state | `seed_read_state` | B | 表示不要: 内部制御 | なし | |
| mcp_set_servers | `mcp_set_servers` | B | 表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048) | なし | |
| register_repo_root | `register_repo_root` | B | 表示不要: 内部制御 | なし | |
| reload_plugins | `reload_plugins` | B | 表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048) | なし | |
| reload_skills | `reload_skills` | B | 表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048) | なし | |
| reload_output_styles | `reload_output_styles` | B | 表示不要: 内部制御 | なし | |
| mcp_reconnect | `mcp_reconnect` | B | 表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048) | なし | |
| mcp_toggle | `mcp_toggle` | B | 表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048) | なし | |
| stop_task | `stop_task` | B | 表示不要: アプリは task・チェックポイントを操作しない (AD-036 §4 P3 / AD-048 / AD-049) | なし | 実行中の task の一覧は O-11 で実装した。操作 (止める) は付けない (A SDKBackgroundTasksChangedMessage) |
| background_tasks | `background_tasks` | B | 表示不要: アプリは task・チェックポイントを操作しない (AD-036 §4 P3 / AD-048 / AD-049) | なし | `Query` の `backgroundTasks` は項目 16 の禁止 (O-5) |
| apply_flag_settings | `apply_flag_settings` | B | 表示不要: 内部制御 | なし | |
| get_settings | `get_settings` | B | 表示不要: 内部制御 | なし | |
| get_hooks_listing | `get_hooks_listing` | B | 表示不要: 設定の一覧は Claude Code の /hooks で見られる (AD-056 Decision 4) | なし | 呼ばない。一般の Hook の行は `includeHookEvents` で出す (AD-054) |
| update_settings | `update_settings` | B | 表示不要: 内部制御 | なし | |
| elicitation | `elicitation` | A | 実装済み: ElicitationCard (実行中) | なし | O-10。`onElicitation` (AD-053)。form は部分集合だけ、URL は `openExternalIfHttp` |
| request_user_dialog | `request_user_dialog` | B | 表示不要: 宣言する種類が無い (payload の形が SDK に無い。AD-053 Decision 4) | なし | O-10 で判断 |
| list_permission_rules | `list_permission_rules` | B | 後続: I-3 | なし | |

## F element の分類

assistant-ui の element の一覧 (https://www.assistant-ui.com/elements。**2026-10-03 確認で 127** (一覧の名前を数えた数。2026-10-16 に `Conversation map` を足した (128))。AD-019 の 2026-09-13 の数え方 (202) とは registry のページの構成が違い、未分類の 59 要素の一覧は残っていなかったので、今の一覧から引き直した)。Tier A の 35 (AD-019) と PLAN.md §4.3 / §4.4 の名前を当て、残りを分類した。使い道の書式は凡例の「使い道」が正本である。

| element | Tier | 使い道 | 備考 |
|---|---|---|---|
| Activity graph | B | 未使用 | O-9 で使わないと決めた (U-6)。暦の形は複数日の活動を前提にし、1 つの会話の時間に合わない |
| Agent card | B | 未使用 | |
| Agent handoff | A | 未使用 | subagent の受け渡し (PLAN §4.2)。Claude Code の subagent は会話の主導権を渡さない。入れ子は Subagent で描く (AD-056 Decision 5) |
| Agent plan | A | C ExitPlanModeInput | AgentPlan |
| Agent status | A | 未使用 | セッションの状態は一覧と表示中のセッションで出ている (D session-state) |
| Approval card | A | D permission-request | アプリは ApprovalCard を自作 (assistant-ui の版に ApprovalPrimitive が無い。X-1)。O-10: `AskUserQuestion` の答える部品 |
| Artifact card | B | 未使用 | |
| Assistant modal | C | 未使用 | PLAN §4.4 |
| Assistant sidebar | C | 未使用 | アプリの画面構成と合わない。O-7 のシェルの左右の面 (サイドバー・右のペイン) は copilot 型の会話の横置きとは役割が違う (AD-046) |
| Attachment | B | SDK の外: 中央の本体の composer と利用者のメッセージ (`thread.aui.tsx` が `attachment.aui.tsx` の部品を組み込み済み) | PLAN §4.3。attachment の adapter を設定していないので、添付は受け付けない (O-7 pr-gate R2 ui-coverage M-005 の残り) |
| Background runs | B | 未使用 | 実行中の task の一覧の候補。一覧は右のペインのタブ「背景の task」で自作した (registry の element は使わない。019 plan Constitution Check XIII) |
| Canvas | B | 未使用 | PLAN §4.3 (Canvas split) |
| Chart | C | 未使用 | MCP の結果に転用しない (AD-048 Decision 4) |
| Chat panel | C | 未使用 | アプリの画面構成と合わない。O-7 の中央の本体は Thread をそのまま置く (AD-046) |
| Checkpoints | A | A SDKFilesPersistedEvent / E rewind_files | O-12 (表示だけ。巻き戻しはしない。AD-049 Decision 6) |
| Code diff | A | C FileEditInput / FileWriteInput | CodeDiff |
| Code runner | C | 未使用 | |
| Command palette | B | SDK の外: アプリ全体のダイアログ (`features/shell/CommandPalette.tsx` が `command-palette.tsx` を組み込む。Ctrl+K) | O-3 で registry の `elements-command-palette` を採った (SH-003 の照合の写し。正本は O-3 の PR の説明。012 research R-04)。入力は combobox、候補は listbox / option で、`<style>` も `style` 属性も無い。取り込んだ中で、option の DOM の id と `aria-activedescendant` を命令の id から組まず `useId()` と添字で作る・英語の文言と 0 件の文を外して文言の表と `EmptyState` で受ける・変換中のキー (`keyCode === 229`) も見る・element の中の絞り込みを外す (一致は `matchesAllTerms`) の 4 点を直し、eslint の手書きの element の一覧に足した。外側 (Dialog・Ctrl+K・状態・候補の組み立て) は `features/shell` |
| Comparison | C | 未使用 | Generative |
| Composer | A | D message-queue | X-2 |
| Composer attachments | B | SDK の外: 中央の本体の composer (`thread.aui.tsx` の `ComposerAttachments` / `ComposerAddAttachment`) | adapter を設定していないので、添付は受け付けない (O-7 pr-gate R2 ui-coverage M-005 の残り) |
| Composer context | B | 未使用 | |
| Composer mentions | B | 未使用 | E file_suggestions |
| Composer model picker | B | 未使用 | 起動設定ダイアログで選ぶ (X-4) |
| Composer slash commands | A | D composer (候補) | O-10。registry の element は取り込まず、primitive 直接 + 自作 (候補の見た目は `features/chat`。IME のガードはライブラリ側) |
| Composer trigger popover | B | 未使用 | O-10 の照合: `Unstable_TriggerPopoverRoot` / `Unstable_TriggerPopover` の primitive を直接使い、registry の `.aui` のラッパーは取り込まない |
| Composer voice | C | 未使用 | Voice 系 |
| Computer use | C | 未使用 | |
| Confidence | C | 未使用 | Generative |
| Connection state | B | 未使用 | |
| Context breakdown | A | 未使用 | O-4 で使わないと決めた (014 research R-09)。取り込んでいない。カテゴリ別のコンテキストの内訳を出さない (E get_context_usage を呼ばない。AD-047 Decision 4 / U-3)。内訳は Claude Code の `/context` で見られる |
| Context display | A | A SDKAssistantMessage / A SDKResultMessage | O-4。中央のヘッダの行の右の目盛り (`features/shell/ContextCostMeter.tsx`)。主ループの最後の assistant の入力側の usage を、result の `modelUsage` の主モデルの `contextWindow` で割った推定 (014 data-model §4)。registry の `context-display` は採らず、文字の体裁で作った (SH-002 の照合の写し。正本は O-4 の PR の説明。014 research R-09): AUI 接続の版は新しい npm の依存 (`@assistant-ui/ai-sdk`) を要し、standalone の版は文言が英語の直書き・100% で止める・色の閾値 (65% / 85%) が 80% と違う・推定であることが出ない |
| Conversation map | B | A SDKAssistantMessage / A SDKUserMessage | O-9 で registry に増えた名前を足した (Principle XIII の Exceptions)。右のペインのタブ『会話の地図』 (`features/shell/ConversationMapTab.tsx`) をターンごとの行で自作した (SH-002 の照合の写し。正本は O-9 の PR の説明。017 research R-10): registry の `conversation-map` は AUI 接続で中央の runtime を読むので中央の外 (右のペイン) に置けず、行に時刻・所要時間・数を持たせる形とも違う |
| Conversation search | B | SDK の外: 中央のヘッダの会話内検索のバー (`features/chat/ConversationSearchBar.tsx` が `conversation-search.tsx` を組み込む。Ctrl+F) | O-3 で registry の `elements-conversation-search` を採った (SH-003 の照合の写し。正本は O-3 の PR の説明。012 research R-04)。DOM の id を作らない。取り込んだ中で、スクロールバーの一致の印 (唯一の `style`。仮想化で描かれていない範囲の高さを知らないので印の位置を決められない) と一致の前後の文を外し、英語の文言と件数の書式を文言の表で受け、閉じるボタンと入力欄へフォーカスを移す口を足して、eslint の手書きの element の一覧に足した。Enter / Shift+Enter / Esc と IME のガード・走査・強調 (CSS Custom Highlight API) は外側 (`features/chat`) |
| Cost meter | A | A SDKResultMessage | O-4。右のペインの使用量のタブ (`features/shell/UsageTab.tsx`。費用・トークン・ターン数・モデルごとの内訳・拒否の件数) と中央のヘッダの費用の目盛り (`ContextCostMeter`)。registry の `elements-cost-meter` は採らず、`dl` と文字の体裁で作った (SH-002 の照合の写し。正本は O-4 の PR の説明。014 research R-09): 構造が `dl` / `table` でない・文言が英語の直書き・「この実行」とセッションの 2 つの費用を取るが届くのはセッションの累計の推定だけ・モデルの行がキャッシュのトークンを持たない |
| Data table | C | 未使用 | MCP の結果に転用しない (AD-048 Decision 4) |
| Day separator | B | 未使用 | |
| Diagram | C | 未使用 | MCP の結果に転用しない (AD-048 Decision 4) |
| Directive text | C | 未使用 | |
| Document reference | B | B user/document | O-12 |
| Draft restore | B | D message-queue | X-2 (下書きの復元) |
| Edit message | B | SDK の外: 中央の本体の Thread の利用者のメッセージの操作 (`thread.aui.tsx` が `ActionBarPrimitive.Edit` と `EditComposer` を組み込み済み) | runtime が `onEdit` を渡さないので編集は効かない。fork / resume と合わせて X-6 で照合する (O-7 pr-gate R3 ui-coverage L-201) |
| Elicitation form | A | A SDKElicitationCompleteMessage / E elicitation | O-10 の照合: 取り込まず `features/session/ElicitationCard.tsx` に自作 (文言が英語の既定・項目の種類と `requestedSchema` の対応・フォーカスの引き渡しが承認カードと別系統) |
| Empty state | B | SDK の外: 中央の本体 (空の状態・実行中の Thread の Welcome・過去ログ)・サイドバーの過去のセッションの区画 (Thread search の一致 0 を含む)・中央のヘッダの会話内検索のバー (一致 0)・アプリ全体のダイアログの Command palette (候補 0)・起動ダイアログのプリセットの欄 (`PresetPanel`。起動の利用記録が無い / 読めない)・設定のダイアログ | O-3 で 4 つの空の状態 (Thread search・会話内検索・palette・起動の利用記録) に同じ element を使った (012 spec FR-008。文言は 012 data-model §5) |
| Error state | A | D launch-failure / SDK の外: 設定のダイアログ (4 画面の取得の失敗)・サイドバーの過去のセッションの区画・中央の本体の過去ログの取得の失敗 | D launch-failure は element ではなくアプリが自作した `FailureBanner` (`LivePane.tsx`) が描く。`ErrorState` を使うのは SDK の外の 6 か所 (設定の 4 画面・`SessionListScreen`・`ChatScreen`) (O-7 pr-gate R2 ui-coverage L-101) |
| Feedback dialog | B | 未使用 | |
| File | B | B user/document | O-12 |
| File tree | A | C GlobInput / GrepInput | O-6。registry の `file-tree.tsx` は差分の要約 (英語の「{files} files changed」・増減の数・`key={node.path}`) で意味が違うので、写して見出し・数・key を変えた別ファイル (`elements/file-result-tree.tsx` の `FileResultTree`) を `FileTool` が使う。registry の複製は除外のまま (SH-002 の照合の写し。正本は O-6 の PR の説明) |
| Flow graph | C | 未使用 | Generative |
| Follow-up suggestions | B | A SDKPromptSuggestionMessage | O-12 |
| Generative UI | C | 未使用 | Generative |
| Geo map | C | 未使用 | |
| Guardrail notice | B | 未使用 | |
| Heat graph | B | A SDKAssistantMessage / A SDKUserMessage | O-9。右のペインのタブ『会話の地図』の活動の帯 (`features/shell/ConversationMapTab.tsx`)。registry の `heat-graph` は採らず、テーマのトークンだけで塗る帯を自作した (SH-002 の照合の写し。正本は O-9 の PR の説明。017 research R-10): 月と曜日の暦の格子で、日単位の `DataPoint` が前提。1 つの会話の分単位の区間を 1 行の帯にする形と合わない |
| Image | B | B user/image | |
| Image gallery | C | 未使用 | |
| Image generation | C | 未使用 | PLAN §4.4 |
| Inline citation | A | 未使用 | WebSearch の結果の文からリンクを推測しない (O-6 U-5)。結果のブロック (`web_search_tool_result`) を扱う O-12 で判断し直す (AD-019 D1・D2 を変えない) |
| Job progress | B | 未使用 | O-4 で使わないと決めた (014 research R-09)。取り込んでいない。重みのある段階・残り時間・中止の操作を前提にするが、`task_progress` は段階も残り時間も持たず、task の中止の操作も無い。task の進み具合は task の行 (SystemEventRow) の detail で出す (A SDKTaskProgressMessage) |
| Launcher | C | 未使用 | PLAN §4.4 (Launcher bubble) |
| Link preview | B | 未使用 | |
| Loading state | B | SDK の外: 中央の本体の過去ログ・設定のダイアログ・起動ダイアログ (`LaunchDialogHost`) の起動中 (`GenerationLoader`) | |
| Logos | C | 未使用 | |
| Map answer | C | 未使用 | PLAN §4.4 |
| Markdown text | A | B assistant/text | MarkdownText |
| Math block | B | 未使用 | |
| MCP config dialog | A | 未使用 | MCP の設定を操作しない (AD-048) |
| MCP server panel | A | 未使用 | O-5 で使わないと決めた (015 research R-03。SH-002 の照合の写し。正本は O-5 の PR の説明)。取り込んでいない。見出しと状態の文言が英語の直書きで日本語の props にできない・状態の値域が `connected` / `connecting` / `needs-auth` / `failed` で SDK の `pending` / `disabled` と `unknown` を持たない・サーバーごとに `transport` と `tools` を必須とするが `init` の `mcp_servers` は名前と状態だけ。MCP サーバーの名前と状態は右のペインの構成のタブ (`features/shell/InitReportTab.tsx`) に既存の部品で出す (A SDKSystemMessage) |
| Media player | C | 未使用 | |
| Memory | B | A SDKMemoryRecallMessage | O-12 |
| Mermaid diagram | A | B assistant/text | markdown の中の図。未導入 |
| Message actions | B | SDK の外: 中央の本体の Thread の応答の操作のバー (`thread.aui.tsx` が `ActionBarPrimitive.Copy` / `Reload` と More の Export as Markdown を組み込み済み) | コピーと Markdown の書き出しは効く。再生成は runtime が `onReload` を渡さないので効かない (O-7 pr-gate R3 ui-coverage L-201) |
| Message branches | A | 未使用 | fork / resume (X-6) |
| Message pair | B | 未使用 | |
| Message queue | A | D message-queue | X-2 |
| Message timing | B | A SDKAssistantMessage / A SDKUserMessage | O-9。中央の本体の各メッセージの時刻とターンの所要時間 (`features/chat/MessageTimeLabel.tsx`)。registry の `message-timing` / `elements-message-timing` は採らず、文字の体裁で作った (SH-002 の照合の写し。正本は O-9 の PR の説明。017 research R-10): `message-timing` はストリームの統計 (`metadata.timing`) を読むが本アプリはメッセージ単位で更新する (X-1)。standalone の版は文言が英語の直書きで、メッセージの時刻と所要時間を出す形と合わない |
| Mobile composer | C | 未使用 | PLAN §4.4 |
| Model selector | A | 未使用 | 起動設定ダイアログ (X-4) は session の操作 UI |
| Number ticker | C | 未使用 | |
| Onboarding | B | 未使用 | |
| Option list | C | 未使用 | Generative |
| Orb | C | 未使用 | Voice 系 |
| Permission grant | A | D permission-request-capability | I-3 |
| Prompt library | B | 未使用 | |
| Question flow | C | 未使用 | O-10 の照合: 応答 UI にも採らず、承認カードの答える部品 `AskUserQuestionAnswer.tsx` を自作 (`header` のチップと `multiSelect` の印を持たない)。O-5 の読み取り専用の表示には採らなかった (015 research R-03): 回答の操作が中心で、`header` のチップ・`multiSelect` の印を持たず、文言が英語の直書き |
| Quota banner | A | A SDKRateLimitEvent | O-4。中央のヘッダの下の帯 (`features/shell/CenterBanners.tsx` の `QuotaBanner`。注意は `role="status"`、送れるセッションの上限は `role="alert"`)。registry の `elements-quota-banner` は採らず、文字の体裁と `role` で作った (SH-002 の照合の写し。正本は O-4 の PR の説明。014 research R-09): 「もっと得る」の button を常に描く・文言が英語の直書き・材料 (使用量と上限の数・解除までの相対時間) が届く値 (割合と解除の時刻。どちらも null がありうる) と合わない・見た目の強弱を `status` でなく割合で決める |
| Quote | B | 未使用 | PLAN §4.3 |
| Read aloud | C | 未使用 | Voice 系 |
| Reasoning | A | B assistant/thinking / assistant/redacted_thinking | Reasoning |
| Reasoning effort | A | 未使用 | effort は起動設定ダイアログ (X-4) |
| Recommendation card | C | 未使用 | Generative |
| Regenerate menu | A | 未使用 | fork (X-6)。element は入れていない。Thread の応答の操作のバーに再生成のボタン (`ActionBarPrimitive.Reload`) は組み込み済みだが、`onReload` を渡さないので効かない (Message actions の行。O-7 pr-gate R3 ui-coverage L-201) |
| Research report | C | 未使用 | Generative |
| Retrieval chunks | B | 未使用 | |
| Reviewable diff | A | C FileEditInput | CodeDiff で代替 (R-4) |
| Schedule card | C | 未使用 | Generative |
| Score breakdown | C | 未使用 | Generative |
| Scroll anchor | A | A SDKAssistantMessage | R-3 |
| Settings | B | 未使用 | registry の `elements-settings-panel` はモデル・system prompt・temperature の設定の部品で、アプリの設定 (ランタイム・作業フォルダ・Provider・組み合わせ) と合わない。O-7 の設定のダイアログは既存の Dialog で組んだ (O-7 research R-04)。実行中のモデル・thinking の切り替え (E set_model / set_max_thinking_tokens。X-6) の候補 — X-6 で Model selector / Composer model picker と合わせて照合する (pr-gate R1 ui-coverage L-001) |
| Shared conversation | C | 未使用 | |
| Shiki highlighter | A | B assistant/text | markdown のコード |
| Sources | B | 未使用 | WebSearch の結果の文からリンクを推測しない (O-6 U-5)。結果のブロックを扱う O-12 で判断し直す |
| Speaker identity | C | 未使用 | Voice 系 |
| Spec sheet | C | 未使用 | Generative |
| Stopped run | A | E interrupt | 中断 |
| Streaming text | A | A SDKAssistantMessage | メッセージ単位の更新 (X-1) |
| Subagent list | A | C AgentInput | Subagent |
| Syntax highlighter | B | 未使用 | Shiki highlighter で足りる |
| Task card | B | A SDKTaskStartedMessage | 背景の task の行 (SystemEventRow) と一覧のタブで描く (O-11) |
| Terminal block | A | C BashInput | TerminalBlock |
| Thinking indicator | A | A SDKThinkingTokensMessage | O-4 で registry の `elements-thinking-indicator` を採った (SH-002 の照合の写し。正本は O-4 の PR の説明。014 research R-09)。手を入れずに `thinking-indicator.tsx` に置き、`thread.aui.tsx` の 2 つの viewport の footer (composer の上) で「思考中 約 N トークン」を出す。`role` も live region も持たず、`<style>` も `style` 属性も無い。npm の依存なし |
| Thread | A | A SDKAssistantMessage / SDKUserMessage | |
| Thread list | A | SDK の外: サイドバーの稼働中の区画と過去のセッションの区画の行 (`thread-list.aui.tsx`。session の操作 UI) | 過去のセッションの一覧 (R-2) と監視ビュー (O-1) は session の操作 UI |
| Thread list sidebar | A | 未使用 | `threadlist-sidebar` は shadcn の SidebarProvider (開閉を cookie に保存・Ctrl+B) を要し、1 つの assistant-ui の runtime の thread list を描く。O-7 のサイドバーは 2 つの assistant-ui の runtime の一覧 (稼働中・過去) と新規起動・設定を並べ、開閉を永続化しないので、既存の `thread-list.aui.tsx` の行と Button で組んだ (O-7 research R-04。照合の正本は O-7 の PR の説明。R-2 plan の「目標レイアウト ADR が accepted になったら寄せる」の約束はこの照合で閉じた) |
| Thread search | B | 未使用 | O-3 で使わないと決めた (012 research R-04)。element は時刻のまとまりと pinned を前提にし、R-2 の登録フォルダのまとまり (002 FR-022) と合わない。O-3 の Thread search は、過去のセッションの区画 (`SessionListScreen`) に検索欄だけを足して作った (一致の規則は `features/search/`) |
| Timeline | C | 未使用 | MCP の結果に転用しない (AD-048 Decision 4) |
| Todo list | A | C TodoWriteInput / TaskCreateInput / TaskUpdateInput | TodoList。O-6 で `TaskCreate` / `TaskUpdate` の 1 項目の描き方に写した (`TaskTool`。TodoWrite の `TodoList` は変えない。SH-002 の照合の写し) |
| Tool call | A | 未使用 | O-6 で使わないと決めた (SH-002 の照合の写し。正本は O-6 の PR の説明)。結果待ち・結果不明の状態の印を出せない。tool の見出し・畳んだ中身は既存の枠と O-4 の `ToolResultMarks` で作った (`FileTool` / `WebTool` / `TaskTool`) |
| Tool error | A | B user/tool_result | エラーの結果は各 tool の表示で出す |
| Tool fallback | A | C (Tier B の tool) | ToolFallback |
| Tool group | A | B assistant/tool_use | ToolGroup。O-2 で transcript の密度 comfortable のとき既定で開く |
| Tool timeline | B | 未使用 | PLAN §4.3 |
| Tooltip icon button | B | SDK の外: 中央の本体の Thread の操作ボタン (`components/tooltip-icon-button.tsx`。コピー・編集・送信・下端へなど) | 表示の部品ではなく操作のボタンの部品 (O-7 pr-gate R2 ui-coverage M-005 の残り) |
| Trace waterfall | B | 未使用 | O-9 で使わないと決めた (U-6)。tool の開始と終わりの時刻の組を運ばない。実行中の subagent の入れ子は O-11 で Subagent の入れ子として実装した。O-11 は tool の開始と終わりの時刻の組を運ばないので、O-9 U-6 の判断の前提は変わらない |
| Typing indicator | B | 未使用 | |
| Voice conversation | C | 未使用 | Voice 系 |
| Web preview | B | 未使用 | |
| Web search | A | 未使用 | O-6 で使わないと決めた (SH-002 の照合の写し。正本は O-6 の PR の説明)。結果の組み立て (Sources / Inline citation) を前提にするが、結果は text のままで文からリンクを推測しない (U-5)。`WebSearch` は既存の枠の `WebTool` で描く (C WebSearchInput) |
