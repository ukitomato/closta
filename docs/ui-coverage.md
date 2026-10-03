# ui-coverage 対応表

Claude Code (Agent SDK) が emit する情報と、その表示の対応表 (Constitution Principle XII)。O-2 ([spec 011](../specs/011-ui-coverage/spec.md)) で作った。

SDK: `@anthropic-ai/claude-agent-sdk` 0.3.270

確認日: 2026-10-03

## 凡例

**決定の正本は [AD-044](decisions/0044-ui-coverage-assignment.md)** (割当の 3 種類、行の Tier の決め方、M3 の完了の条件、機械照合する節)。**この凡例は書式の詳細の正本**で、食い違ったら AD-044 を正とする。

- **機械照合**: Constitution 検証の項目 21 (`node scripts/constitution/check.mjs`。`scripts/ui-coverage/coverage.mjs`) が CI で毎回確かめる。A・C・E 節の行の集合は SDK の型定義の名前の集合と一致すること。B・D・F 節と A' 小節は照合の外で、割当の書式だけを確かめる。入力のファイルが無いときも違反になる
- **列** (A〜E 節): `識別子 | 判別子 | Tier | 割当 | 経路 | 備考` (この順・この綴り)。F 節は `element | Tier | 使い道 | 備考`
- **割当** (半角のコロン):
  - `実装済み: <element> (<経路>)` — 表示を担う element。複数は `/` で区切る。**ToolFallback だけの行は Tier B / C に限る**
  - `後続: <feature ID>` — roadmap の feature の表に実在し、完了していない ID を 1 つだけ。範囲は roadmap のその行の「対応表の割当 (O-2 から)」
  - `表示不要: <理由>` — Tier C の行は `表示不要: Tier C (<理由>)`
  - 空・`未割当`・`TBD`・`—` は割当ではない
- **Tier**: `A` (Claude Code の一次概念に直結し、利用者が見ないと判断を誤る) / `B` (無くても判断を誤らない) / `C` (対象外)
- **経路**: `実行中` / `過去ログ` / `両方` / `なし` (表示していない)
- **行の単位**: A 節は `SDKMessage` のメンバー 1 つにつき 1 行 (メンバーの中の subtype は備考)。C 節は入力型 1 つにつき 1 行で、判別子に実行時の tool 名を書く
- **行にしないもの**: 他 domain の一覧・操作画面に出る値 (`SDKSessionInfo` のフィールドなど) は行にしない。ui charter の Out of scope (他 domain の操作 UI は Principle XII の判定対象にしない) による
- **M3 の完了の条件**: Tier A の `後続` の行のうち、割当先が M3 の feature の行が 0 (項目 21 の出力の最後の行で読む)

### SDK を上げたときの手順

**SDK の版を上げる PR は、domain を問わずこの表を同じ PR で直す** (AD-044 Consequences)。

1. `node scripts/constitution/check.mjs` の項目 21 の失敗の出力を読む (足りない行・消えた行・版の違い)
2. 足りない行を足して割当を書き、消えた行を消し、冒頭の `SDK:` の版を書き換える。**SDK が型を正当に減らしたとき** (「SDK から読めた名前が極端に少ない」で落ちる) は、`scripts/ui-coverage/coverage.mjs` の `LOWER_BOUNDS` (parse の取りこぼしを捕まえる下限。今は実数と同じ) も新しい数に直す
3. 項目 21 が ok になることを確かめる。`ui-coverage-reviewer` が pr-gate で割当の妥当性を見る

## A メッセージ型

`SDKMessage` (`sdk.d.ts`) の 39 メンバー。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| SDKAssistantMessage | `assistant` | A | 実装済み: Thread / MarkdownText / Reasoning / ToolGroup (両方) | 両方 | 中身のブロックは B 節。実行中はメッセージ単位で更新 (X-1) |
| SDKUserMessage | `user` | A | 実装済み: UserMessage / tool の結果は各 tool の表示 (両方) | 両方 | 実行中の利用者の本文は送信時に楽観的に出す。tool_result は O-2 から実行中も呼び出しの表示に埋める (FR-007) |
| SDKUserMessageReplay | `user` (replay) | B | 表示不要: resume 時の再送。元の user メッセージを表示している | なし | |
| SDKResultMessage | `result` | A | 後続: O-4 | なし | 成功・失敗はセッションの状態として出ているが、**失敗は理由を区別せず「Provider の認証/接続」のエラーとして出ている** (`session-core.ts` の `classifyResult`)。失敗の理由 (subtype・`errors`)・費用・使用量・ターン数・`permission_denials` は O-4 |
| SDKSystemMessage | `system` / `init` | B | 後続: O-5 | なし | `mcp_servers` / `slash_commands` / `tools` / `model` は O-5 (Server panel・コマンド・セッションの構成)。Tier B: 起動の設定は起動のダイアログ (X-4) で利用者が選んでいる |
| SDKPartialAssistantMessage | `stream_event` | B | 表示不要: 部分メッセージを要求しない (X-1 はメッセージ単位で更新する) | なし | `includePartialMessages` を渡していない |
| SDKCompactBoundaryMessage | `system` / `compact_boundary` | A | 後続: O-6 | 過去ログ | 過去ログは最小の区切り (divider) で出る。専用 element と実行中の表示は O-6 |
| SDKStatusMessage | `system` / `status` | A | 後続: O-4 | なし | 権限モードの変化 (`permissionMode`。ExitPlanMode の後など)・圧縮中・圧縮の失敗 (`compact_result` / `compact_error`) を運ぶ。承認とコンテキストに直結するので Tier A |
| SDKAPIRetryMessage | `system` / `api_retry` | A | 後続: O-4 | なし | |
| SDKControlRequestProgressMessage | `system` / `control_request_progress` | B | 表示不要: アプリが送った制御要求の進捗の内部通知 | なし | |
| SDKModelRefusalFallbackMessage | `system` / `model_refusal_fallback` | A | 後続: O-6 | なし | |
| SDKModelRefusalNoFallbackMessage | `system` / `model_refusal_no_fallback` | A | 後続: O-6 | なし | |
| SDKLocalCommandOutputMessage | `system` / `local_command_output` | B | 後続: O-6 | なし | |
| SDKHookStartedMessage | `system` / `hook_started` | A | 実装済み: SystemEventRow (実行中) | 実行中 | SDK は既定で SessionStart / Setup の Hook だけを出す。一般の Hook (`includeHookEvents`) は O-6。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKHookProgressMessage | `system` / `hook_progress` | B | 表示不要: 開始と結果の行で足りる。出力本文 (stdout / stderr) は出さない | なし | |
| SDKHookResponseMessage | `system` / `hook_response` | A | 実装済み: SystemEventRow (実行中) | 実行中 | 開始と同じ行を結果で書き換える。出力本文と終了コードは出さない。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKPluginInstallMessage | `system` / `plugin_install` | B | 後続: O-5 | なし | |
| SDKToolProgressMessage | `tool_progress` | B | 後続: O-4 | なし | tool の経過時間 |
| SDKAuthStatusMessage | `auth_status` | A | 後続: O-5 | なし | |
| SDKTaskNotificationMessage | `system` / `task_notification` | A | 実装済み: SystemEventRow (実行中) | 実行中 | task の行の状態を完了・失敗・停止に書き換える。要約・出力ファイルは出さない。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKTaskStartedMessage | `system` / `task_started` | A | 実装済み: SystemEventRow (実行中) | 実行中 | 背景で始まった task (`is_backgrounded`) だけ。前景の task は Subagent・tool の結果で出る。後から背景に移った task は O-6。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKTaskUpdatedMessage | `system` / `task_updated` | A | 実装済み: SystemEventRow (実行中) | 実行中 | 行の状態だけを書き換える (説明の変更は読まない)。過去ログの変換は実装済み (`transcript.ts`)。実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す |
| SDKTaskProgressMessage | `system` / `task_progress` | B | 後続: O-4 | なし | |
| SDKBackgroundTasksChangedMessage | `system` / `background_tasks_changed` | B | 後続: O-6 | なし | 実行中の task の一覧の要否は O-6 で判断する |
| SDKThinkingTokensMessage | `system` / `thinking_tokens` | B | 後続: O-4 | なし | |
| SDKSessionStateChangedMessage | `system` / `session_state_changed` | B | 表示不要: セッションの状態は状態通知 (SessionStatusUpdate) から一覧と表示中のセッションに出ている | なし | |
| SDKWorkerShuttingDownMessage | `system` / `worker_shutting_down` | B | 表示不要: 内部制御。supervisor の終了は `supervisor-exited` の失敗として出る | なし | |
| SDKCommandsChangedMessage | `system` / `commands_changed` | B | 後続: O-5 | なし | slash command の一覧 |
| SDKNotificationMessage | `system` / `notification` | B | 後続: O-6 | なし | |
| SDKFilesPersistedEvent | `system` / `files_persisted` | B | 後続: O-6 | なし | Checkpoints |
| SDKToolUseSummaryMessage | `tool_use_summary` | B | 後続: O-6 | なし | |
| SDKMemoryRecallMessage | `system` / `memory_recall` | B | 後続: O-6 | なし | |
| SDKRateLimitEvent | `rate_limit_event` | A | 後続: O-4 | なし | Quota banner |
| SDKElicitationCompleteMessage | `system` / `elicitation_complete` | A | 後続: O-5 | なし | Elicitation form |
| SDKPermissionDeniedMessage | `system` / `permission_denied` | A | 実装済み: DeniedNotice (実行中) | 実行中 | X-1 からの申し送り (聞かれずに拒否された操作) |
| SDKPromptSuggestionMessage | `prompt_suggestion` | B | 後続: O-6 | なし | |
| SDKMirrorErrorMessage | `system` / `mirror_error` | B | 後続: O-6 | なし | |
| SDKInformationalMessage | `system` / `informational` | A | 後続: O-6 | なし | UserPromptSubmit の Hook が prompt を止めた理由・Stop の Hook が続行を止めたこと (`prevent_continuation`)・slash command の出力の文言。止まった理由が分からないと判断を誤るので Tier A (中断) |
| SDKConversationResetMessage | `conversation_reset` | A | 後続: O-6 | なし | /clear・plan モードの終了などで会話が新しくなる。古い transcript がコンテキストに残っているように見えるので Tier A (セッションの境界) |

### A' union の外

`StdoutMessage` に現れるが `SDKMessage` の外の型。機械照合の外。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| SDKActiveGoalMessage | `active_goal` | B | 後続: O-6 | なし | |
| SDKKeepAliveMessage | `keep_alive` | B | 表示不要: 接続維持の内部通知 (export されていない) | なし | |
| SDKControlRequest / SDKControlResponse | `control_request` / `control_response` | B | 表示不要: 制御の封筒。中身は E 節 | なし | |
| SDKControlCancelRequest | `control_cancel_request` | B | 表示不要: 制御要求の取り消しの内部通知 (subtype を持たない) | なし | |

## B 中身のブロック

assistant / user のメッセージの content block。型は `@anthropic-ai/sdk` の beta の union にあるが、機械照合の外 (AD-044 Decision 4。照合は O-6)。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| assistant/text | `text` | A | 実装済み: MarkdownText (両方) | 両方 | |
| assistant/thinking | `thinking` | A | 実装済み: Reasoning (両方) | 両方 | |
| assistant/redacted_thinking | `redacted_thinking` | B | 実装済み: Reasoning (両方) | 両方 | 文言 `[redacted thinking]`。O-2 で実行中もそろえた |
| assistant/tool_use | `tool_use` | A | 実装済み: ToolGroup / 各 tool の表示 (両方) | 両方 | tool ごとの割当は C 節 |
| assistant/server_tool_use | `server_tool_use` | B | 後続: O-6 | なし | 知らないブロックとして捨てている |
| assistant/web_search_tool_result | `web_search_tool_result` | B | 後続: O-6 | なし | |
| user/text | `text` | A | 実装済み: UserMessage (両方) | 両方 | |
| user/tool_result | `tool_result` | A | 実装済み: 各 tool の表示 (両方) | 両方 | O-2 で実行中も呼び出しの表示に埋める (FR-007)。エラーと切り詰めは Terminal block・Code diff・ToolFallback・Subagent などの各表示に印を出す (O-2 pr-gate R1)。対応の無い結果は結果だけの表示 |
| user/image | `image` | B | 実装済み: Image (過去ログ) | 過去ログ | 安全な data 画像の MIME だけ (svg を除く) |
| user/document | `document` | B | 後続: O-6 | 過去ログ | 今はファイル名の文字列だけ。File element は O-6 |

## C tool

`ToolInputSchemas` (`sdk-tools.d.ts`) の 45 メンバー。判別子は実行時の tool 名 (推定を含む。実データで確かめる)。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| AgentInput | `Agent` (旧 `Task`) | A | 実装済み: Subagent (両方) | 両方 | 両方の名前に当てる (O-2 FR-010)。実行中の入れ子と `getSubagentMessages` は O-6 |
| BashInput | `Bash` | A | 実装済み: TerminalBlock (両方) | 両方 | |
| TaskOutputInput | `TaskOutput` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ExitPlanModeInput | `ExitPlanMode` | A | 実装済み: AgentPlan (両方) | 両方 | plan の markdown の描画は O-6 (AD-035 D6) |
| FileEditInput | `Edit` | A | 実装済み: CodeDiff (両方) | 両方 | `MultiEdit` (入力型は無い) も CodeDiff |
| FileReadInput | `Read` | A | 後続: O-6 | 両方 | 今は ToolFallback。File tree は O-6 |
| FileWriteInput | `Write` | A | 実装済み: CodeDiff (両方) | 両方 | |
| GlobInput | `Glob` | A | 後続: O-6 | 両方 | 今は ToolFallback |
| GrepInput | `Grep` | A | 後続: O-6 | 両方 | 今は ToolFallback |
| TaskStopInput | `TaskStop` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ListMcpResourcesInput | `ListMcpResourcesTool` | B | 後続: O-5 | 両方 | 今は ToolFallback |
| RefreshMcpToolsInput | `RefreshMcpTools` | B | 後続: O-5 | 両方 | 今は ToolFallback。MCP 系の組み込み tool として O-5 の範囲 |
| McpInput | `mcp__<server>__<tool>` | A | 後続: O-5 | 両方 | 今は ToolFallback |
| NotebookEditInput | `NotebookEdit` | B | 実装済み: ToolFallback (両方) | 両方 | Tier B: 実行前に承認カードが入力 (対象と内容) を出し、ToolFallback が入力と結果を出す。notebook の diff 表示は無い |
| ReadMcpResourceDirInput | `ReadMcpResourceDir` | B | 後続: O-5 | 両方 | 今は ToolFallback |
| ReadMcpResourceInput | `ReadMcpResourceTool` | B | 後続: O-5 | 両方 | 今は ToolFallback |
| ReportFindingsInput | `ReportFindings` | B | 実装済み: ToolFallback (両方) | 両方 | |
| TodoWriteInput | `TodoWrite` | A | 実装済み: TodoList (両方) | 両方 | |
| WebFetchInput | `WebFetch` | A | 後続: O-6 | 両方 | 今は ToolFallback |
| WebSearchInput | `WebSearch` | A | 後続: O-6 | 両方 | 今は ToolFallback |
| AskUserQuestionInput | `AskUserQuestion` | A | 後続: O-5 | 両方 | 応答の UI が要る。今は ToolFallback |
| SendFeedbackInput | `SendFeedback` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ClaudeDesignInput | `ClaudeDesign` | B | 実装済み: ToolFallback (両方) | 両方 | |
| ProjectsInput | `Projects` | B | 実装済み: ToolFallback (両方) | 両方 | |
| EnterPlanModeInput | `EnterPlanMode` | B | 実装済み: ToolFallback (両方) | 両方 | |
| TaskCreateInput | `TaskCreate` | A | 後続: O-6 | 両方 | TodoWrite と同じ計画・進捗の概念 (Tier A。AD-019 Todo list)。今は ToolFallback。TodoList で出すのは O-6 |
| TaskGetInput | `TaskGet` | A | 後続: O-6 | 両方 | TaskCreate と同じ。今は ToolFallback |
| TaskUpdateInput | `TaskUpdate` | A | 後続: O-6 | 両方 | TaskCreate と同じ (状態の変化)。今は ToolFallback |
| TaskListInput | `TaskList` | A | 後続: O-6 | 両方 | TaskCreate と同じ。今は ToolFallback |
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

SDK のメッセージではなく、アプリが SDK の callback・制御・プロセスの状態から作る表示。

| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |
|---|---|---|---|---|---|
| permission-request | `canUseTool` (単発) | A | 実装済み: ApprovalCard (実行中) | 実行中 | X-1 からの申し送り (承認カード) |
| permission-request-capability | `canUseTool` (capability 付与) | A | 後続: I-3 | なし | Permission grant。M4 なので M3 の完了の条件には数えない (AD-044) |
| permission-denied | `permission_denied` (A 節) の一覧 | A | 実装済み: DeniedNotice (実行中) | 実行中 | X-1 からの申し送り (聞かれずに拒否された操作) |
| session-state | `SessionStatusUpdate` | A | 実装済み: SessionScreen の状態 (実行中) | 実行中 | 一覧の行の状態 (監視ビュー) は session の操作 UI |
| launch-failure | `failure` (理由キー) | A | 実装済み: FailureBanner (実行中) | 実行中 | |
| end-forced | `end-forced` | A | 実装済み: EndNotice (実行中) | 実行中 | 強制停止・強制終了の告知 |
| interrupt-receipt | `interrupt-receipt` | B | 表示不要: 中断の受領。途中出力は transcript に残る | なし | |
| message-queue | 実行中に積んだ入力 | A | 実装済み: MessageQueue (実行中) | 実行中 | X-2 |

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
| mcp_status | `mcp_status` | B | 後続: O-5 | なし | |
| get_context_usage | `get_context_usage` | A | 後続: O-4 | なし | Context display |
| get_session_cost | `get_session_cost` | B | 後続: O-4 | なし | |
| list_models | `list_models` | B | 表示不要: モデルの一覧は Provider のモデルカタログから出す (X-3 / X-4) | なし | |
| get_usage | `get_usage` | B | 後続: O-4 | なし | |
| get_binary_version | `get_binary_version` | B | 表示不要: 内部制御 | なし | |
| mcp_call | `mcp_call` | B | 後続: O-5 | なし | |
| file_suggestions | `file_suggestions` | B | 表示不要: アプリの composer はファイル候補 (Mentions) を出さない | なし | |
| hook_callback | `hook_callback` | B | 表示不要: アプリは SDK の hook callback を登録しない | なし | |
| mcp_message | `mcp_message` | B | 後続: O-5 | なし | |
| rewind_files | `rewind_files` | B | 後続: O-6 | なし | Checkpoints |
| cancel_async_message | `cancel_async_message` | B | 表示不要: 内部制御 | なし | |
| read_file | `read_file` | B | 表示不要: 内部制御 | なし | |
| seed_read_state | `seed_read_state` | B | 表示不要: 内部制御 | なし | |
| mcp_set_servers | `mcp_set_servers` | B | 後続: O-5 | なし | |
| register_repo_root | `register_repo_root` | B | 表示不要: 内部制御 | なし | |
| reload_plugins | `reload_plugins` | B | 後続: O-5 | なし | |
| reload_skills | `reload_skills` | B | 後続: O-5 | なし | |
| reload_output_styles | `reload_output_styles` | B | 表示不要: 内部制御 | なし | |
| mcp_reconnect | `mcp_reconnect` | B | 後続: O-5 | なし | |
| mcp_toggle | `mcp_toggle` | B | 後続: O-5 | なし | |
| stop_task | `stop_task` | B | 後続: O-6 | なし | 実行中の task の一覧と合わせて判断する |
| background_tasks | `background_tasks` | B | 後続: O-6 | なし | |
| apply_flag_settings | `apply_flag_settings` | B | 表示不要: 内部制御 | なし | |
| get_settings | `get_settings` | B | 表示不要: 内部制御 | なし | |
| get_hooks_listing | `get_hooks_listing` | B | 後続: O-6 | なし | 一般の Hook の表示と合わせる |
| update_settings | `update_settings` | B | 表示不要: 内部制御 | なし | |
| elicitation | `elicitation` | A | 後続: O-5 | なし | Elicitation form |
| request_user_dialog | `request_user_dialog` | B | 後続: O-5 | なし | |
| list_permission_rules | `list_permission_rules` | B | 後続: I-3 | なし | |

## F element の分類

assistant-ui の element の一覧 (https://www.assistant-ui.com/elements。**2026-10-03 確認で 127** (一覧の名前を数えた数)。AD-019 の 2026-09-13 の数え方 (202) とは registry のページの構成が違い、未分類の 59 要素の一覧は残っていなかったので、今の一覧から引き直した)。Tier A の 35 (AD-019) と PLAN.md §4.3 / §4.4 の名前を当て、残りを分類した。使い道は対応表の行か `未使用`。

| element | Tier | 使い道 | 備考 |
|---|---|---|---|
| Activity graph | B | 未使用 | O-3 (活動の heat graph) で判断 |
| Agent card | B | 未使用 | |
| Agent handoff | A | 未使用 | subagent の受け渡し (PLAN §4.2)。O-6 の入れ子と合わせる |
| Agent plan | A | C ExitPlanModeInput | AgentPlan |
| Agent status | A | 未使用 | セッションの状態は一覧と表示中のセッションで出ている (D session-state) |
| Approval card | A | D permission-request | アプリは ApprovalCard を自作 (assistant-ui の版に ApprovalPrimitive が無い。X-1) |
| Artifact card | B | 未使用 | |
| Assistant modal | C | 未使用 | PLAN §4.4 |
| Assistant sidebar | C | 未使用 | アプリの画面構成と合わない |
| Attachment | B | 未使用 | PLAN §4.3 |
| Background runs | B | 未使用 | 実行中の task の一覧 (O-6 で判断) の候補 |
| Canvas | B | 未使用 | PLAN §4.3 (Canvas split) |
| Chart | C | 未使用 | MCP の結果への転用は O-5 で判断 |
| Chat panel | C | 未使用 | アプリの画面構成と合わない |
| Checkpoints | A | A SDKFilesPersistedEvent / E rewind_files | O-6 |
| Code diff | A | C FileEditInput / FileWriteInput | CodeDiff |
| Code runner | C | 未使用 | |
| Command palette | B | 未使用 | O-3 |
| Comparison | C | 未使用 | Generative |
| Composer | A | D message-queue | X-2 |
| Composer attachments | B | 未使用 | |
| Composer context | B | 未使用 | |
| Composer mentions | B | 未使用 | E file_suggestions |
| Composer model picker | B | 未使用 | 起動設定ダイアログで選ぶ (X-4) |
| Composer slash commands | A | A SDKCommandsChangedMessage | O-5 |
| Composer trigger popover | B | 未使用 | |
| Composer voice | C | 未使用 | Voice 系 |
| Computer use | C | 未使用 | |
| Confidence | C | 未使用 | Generative |
| Connection state | B | 未使用 | |
| Context breakdown | A | E get_context_usage | O-4 |
| Context display | A | E get_context_usage | O-4 |
| Conversation search | B | 未使用 | O-3 |
| Cost meter | A | A SDKResultMessage | O-4 |
| Data table | C | 未使用 | MCP の結果への転用は O-5 で判断 |
| Day separator | B | 未使用 | |
| Diagram | C | 未使用 | MCP の結果への転用は O-5 で判断 |
| Directive text | C | 未使用 | |
| Document reference | B | B user/document | O-6 |
| Draft restore | B | D message-queue | X-2 (下書きの復元) |
| Edit message | B | 未使用 | |
| Elicitation form | A | A SDKElicitationCompleteMessage / E elicitation | O-5 |
| Empty state | B | 未使用 | O-3 |
| Error state | A | D launch-failure | FailureBanner |
| Feedback dialog | B | 未使用 | |
| File | B | B user/document | O-6 |
| File tree | A | C FileReadInput / GlobInput / GrepInput | O-6 |
| Flow graph | C | 未使用 | Generative |
| Follow-up suggestions | B | A SDKPromptSuggestionMessage | O-6 |
| Generative UI | C | 未使用 | Generative |
| Geo map | C | 未使用 | |
| Guardrail notice | B | 未使用 | |
| Heat graph | B | 未使用 | O-3 |
| Image | B | B user/image | |
| Image gallery | C | 未使用 | |
| Image generation | C | 未使用 | PLAN §4.4 |
| Inline citation | A | C WebSearchInput | O-6 |
| Job progress | B | A SDKTaskProgressMessage | O-4 の候補 |
| Launcher | C | 未使用 | PLAN §4.4 (Launcher bubble) |
| Link preview | B | 未使用 | |
| Loading state | B | 未使用 | |
| Logos | C | 未使用 | |
| Map answer | C | 未使用 | PLAN §4.4 |
| Markdown text | A | B assistant/text | MarkdownText |
| Math block | B | 未使用 | |
| MCP config dialog | A | A SDKSystemMessage | O-5 |
| MCP server panel | A | A SDKSystemMessage / E mcp_status | O-5 |
| Media player | C | 未使用 | |
| Memory | B | A SDKMemoryRecallMessage | O-6 |
| Mermaid diagram | A | B assistant/text | markdown の中の図。未導入 |
| Message actions | B | 未使用 | |
| Message branches | A | 未使用 | fork / resume (X-6) |
| Message pair | B | 未使用 | |
| Message queue | A | D message-queue | X-2 |
| Message timing | B | 未使用 | O-3 |
| Mobile composer | C | 未使用 | PLAN §4.4 |
| Model selector | A | 未使用 | 起動設定ダイアログ (X-4) は session の操作 UI |
| Number ticker | C | 未使用 | |
| Onboarding | B | 未使用 | |
| Option list | C | 未使用 | Generative |
| Orb | C | 未使用 | Voice 系 |
| Permission grant | A | D permission-request-capability | I-3 |
| Prompt library | B | 未使用 | |
| Question flow | C | 未使用 | `AskUserQuestion` の応答 UI の候補は O-5 で判断 |
| Quota banner | A | A SDKRateLimitEvent | O-4 |
| Quote | B | 未使用 | PLAN §4.3 |
| Read aloud | C | 未使用 | Voice 系 |
| Reasoning | A | B assistant/thinking / assistant/redacted_thinking | Reasoning |
| Reasoning effort | A | 未使用 | effort は起動設定ダイアログ (X-4) |
| Recommendation card | C | 未使用 | Generative |
| Regenerate menu | A | 未使用 | fork (X-6) |
| Research report | C | 未使用 | Generative |
| Retrieval chunks | B | 未使用 | |
| Reviewable diff | A | C FileEditInput | CodeDiff で代替 (R-4) |
| Schedule card | C | 未使用 | Generative |
| Score breakdown | C | 未使用 | Generative |
| Scroll anchor | A | A SDKAssistantMessage | R-3 |
| Settings | B | 未使用 | |
| Shared conversation | C | 未使用 | |
| Shiki highlighter | A | B assistant/text | markdown のコード |
| Sources | B | C WebSearchInput | O-6 |
| Speaker identity | C | 未使用 | Voice 系 |
| Spec sheet | C | 未使用 | Generative |
| Stopped run | A | E interrupt | 中断 |
| Streaming text | A | A SDKAssistantMessage | メッセージ単位の更新 (X-1) |
| Subagent list | A | C AgentInput | Subagent |
| Syntax highlighter | B | 未使用 | Shiki highlighter で足りる |
| Task card | B | A SDKTaskStartedMessage | 背景の task の行 (O-2 は SystemEventRow)。O-6 で一覧と合わせて判断 |
| Terminal block | A | C BashInput | TerminalBlock |
| Thinking indicator | A | B assistant/thinking | 応答中の印 |
| Thread | A | A SDKAssistantMessage / SDKUserMessage | |
| Thread list | A | 未使用 | 過去のセッションの一覧 (R-2) は session の操作 UI |
| Thread list sidebar | A | 未使用 | 同上 |
| Thread search | B | 未使用 | O-3 |
| Timeline | C | 未使用 | MCP の結果への転用は O-5 で判断 |
| Todo list | A | C TodoWriteInput | TodoList |
| Tool call | A | C FileReadInput | O-6 |
| Tool error | A | B user/tool_result | エラーの結果は各 tool の表示で出す |
| Tool fallback | A | C (Tier B の tool) | ToolFallback |
| Tool group | A | B assistant/tool_use | ToolGroup。O-2 で transcript の密度 comfortable のとき既定で開く |
| Tool timeline | B | 未使用 | PLAN §4.3 |
| Tooltip icon button | B | 未使用 | |
| Trace waterfall | B | 未使用 | O-3 |
| Typing indicator | B | 未使用 | |
| Voice conversation | C | 未使用 | Voice 系 |
| Web preview | B | 未使用 | |
| Web search | A | C WebSearchInput | O-6 |
