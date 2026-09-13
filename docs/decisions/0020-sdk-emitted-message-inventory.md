---
status: accepted
date: 2026-09-13
id: AD-020
deciders: ukitomato
tags: [ui, sdk, session, scope]
supersedes: []
superseded-by: []
---

# AD-020: SDK が emit するメッセージ型の実態と Tier A 表の扱い

## Context

SPIKE-12 および SPIKE-6 の結果。`@anthropic-ai/claude-agent-sdk` **0.3.270** の型定義を
一次情報として調査した。

PLAN.md §4.2 の Tier A 表は「Claude Code が emit する情報」に対する表示割当を定めているが、
**SDK の実際の型定義と照合された形跡がない**。Constitution Principle XII は
「emit される情報のうち専用表示を持たないものをゼロにする」を UI 完成の定義としており、
**その分母が何であるかは製品スコープそのものである**。

## 調査結果

### SDKMessage は 39 種のユニオン型

```ts
export declare type SDKMessage =
  SDKAssistantMessage | SDKUserMessage | SDKUserMessageReplay | SDKResultMessage
  | SDKSystemMessage | SDKPartialAssistantMessage | SDKCompactBoundaryMessage
  | SDKStatusMessage | SDKAPIRetryMessage | SDKControlRequestProgressMessage
  | SDKModelRefusalFallbackMessage | SDKModelRefusalNoFallbackMessage
  | SDKLocalCommandOutputMessage | SDKHookStartedMessage | SDKHookProgressMessage
  | SDKHookResponseMessage | SDKPluginInstallMessage | SDKToolProgressMessage
  | SDKAuthStatusMessage | SDKTaskNotificationMessage | SDKTaskStartedMessage
  | SDKTaskUpdatedMessage | SDKTaskProgressMessage | SDKBackgroundTasksChangedMessage
  | SDKThinkingTokensMessage | SDKSessionStateChangedMessage | SDKWorkerShuttingDownMessage
  | SDKCommandsChangedMessage | SDKNotificationMessage | SDKFilesPersistedEvent
  | SDKToolUseSummaryMessage | SDKMemoryRecallMessage | SDKRateLimitEvent
  | SDKElicitationCompleteMessage | SDKPermissionDeniedMessage | SDKPromptSuggestionMessage
  | SDKMirrorErrorMessage | SDKInformationalMessage | SDKConversationResetMessage;
```

### §4.2 が想定していなかったカテゴリ

| カテゴリ | 型 | なぜ重要か |
|---|---|---|
| **Hook** | `SDKHookStarted` / `HookProgress` / `HookResponse` | Claude Code の一次概念。§4 に表示の記載がない |
| **Background task** | `SDKTaskNotification` / `TaskStarted` / `TaskUpdated` / `TaskProgress` / `BackgroundTasksChanged` | 並行実行タスクの概念自体が §4 にない |
| **コンパクション** | `SDKCompactBoundaryMessage` | transcript の表示に直接影響する。R-3 / R-4 で必ず出会う |
| **自動拒否** | `SDKPermissionDeniedMessage` | **承認カードと対になる**。`dontAsk` / `auto` 分類器 / deny ルール由来の拒否 |
| **モデル拒否** | `SDKModelRefusalFallback` / `NoFallback` | ターンが壊れる経路 |
| **その他** | `MemoryRecall` / `PluginInstall` / `PromptSuggestion` / `ConversationReset` / `WorkerShuttingDown` / `ToolUseSummary` / `AuthStatus` / `SessionStateChanged` / `CommandsChanged` / `FilesPersisted` / `MirrorError` / `Informational` / `ThinkingTokens` / `LocalCommandOutput` / `UserMessageReplay` / `PartialAssistant` / `ControlRequestProgress` / `APIRetry` | |

### control_request / system subtype は約 70 種

`initialize` / `can_use_tool` / `interrupt` / `stop_task` / `cancel_async_message` /
`mcp_*` / `hook_callback` / `set_permission_mode` / `get_context_usage` / `rewind_files` ほか。
**UI から Claude Code を操作する経路の全集合**にあたる。

### SPIKE-6: PermissionMode は 6 値（§7.1 は 5 値で 1 つ欠落）

```ts
export declare type PermissionMode =
  'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
```

| 値 | 意味（型定義の記述） | 危険度 |
|---|---|---|
| `default` | 危険操作でプロンプト | 安全 |
| `acceptEdits` | ファイル編集のみ自動承認 | 中 |
| `plan` | 計画のみ、tool 実行なし | 安全 |
| **`dontAsk`** | **プロンプトを出さず、事前承認が無ければ拒否** | **安全** |
| `auto` | **モデル分類器が都度承認/拒否** | **危険** |
| `bypassPermissions` | 全チェックを迂回（`allowDangerouslySkipPermissions` 必須） | **危険** |

`EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'` — §7.1 と一致。

### AD-007 が挙げる session API はすべて実在

`listSessions` / `getSessionMessages` / `getSessionInfo` / `renameSession` / `tagSession` /
`forkSession` の存在を型定義で確認した。

## Decision

### 1. Principle XII の分母は `SDKMessage` の 39 型 + control 経路とする

`docs/ui-coverage.md` の行は **SDK の型定義から機械的に導出する**。
PLAN.md §4.2 の表を手で維持する運用にしない。**型が増えたら対応表の未割当が増える**形にする。

SDK のバージョン更新時に差分が見えるよう、対応表に **SDK バージョンを記録する**。

### 2. §4.2 の Tier A 表は「暫定」に格下げし、O-2 で SDK 型から引き直す

35 element の実在は [AD-019](0019-assistant-ui-element-inventory.md) で確認済みであり、
**element 側の選定に問題はない**。問題は **Claude Code 側の情報の列挙が不完全**だったことである。

O-2（`docs/ui-coverage.md` の確立）で、39 型を起点に element を割り当て直す。
それまで §4.2 は「Tier A の代表例」として扱う。

### 3. `dontAsk` を安全モードとして扱い、Principle III の危険モード定義を訂正する

Principle III は「`autoModeSafe === false` のランタイムで **Auto / bypass** を選択可能に
してはならない」と書いている。この「Auto」は `auto`（モデル分類器）を指すと解釈し、
**`dontAsk` は制限対象に含めない**。

`dontAsk` は「聞かずに拒否」であり、**隔離されていない環境でこそ有用**である
（承認回数を減らしつつ、未承認の操作は実行されない）。制限すると利用者の選択肢を不当に狭める。

### 4. `SDKPermissionDeniedMessage` を Tier A に加える

承認カード（Approval card）が「聞かれた」側を表示するのに対し、
**「聞かれずに拒否された」側を表示する経路が §4.2 に無かった**。
`dontAsk` / `auto` を使うと拒否は黙って起きるため、**何が拒否されたか分からないと使えない**。

## Consequences

- **M3（差配できる = 未表示ゼロ）の作業量見積もりが増える。** 39 型に対する割当が必要
- **PLAN.md §7.1 の権限モード表を 6 値に訂正する必要がある**
- Principle III の検証条件（E2E で Auto / bypass が disabled）に `dontAsk` を含めないよう注記が要る
- Hook / Background task は §4 に概念自体がない。**`session` domain の charter に
  「background task の状態管理」が要るか**を O-1 着手時に判断する
- `SDKCompactBoundaryMessage` は R-3（transcript の基本表示）で既に出会う。
  M1 の時点で最低限の表示が要る可能性がある
- SDK 0.3.270 時点の調査である。**バージョンが上がれば型は増減する**

## Open Questions

- [ ] Hook / Background task を `session` domain の責務に含めるか、別 domain にするか
- [ ] `SDKPartialAssistantMessage` は `--include-partial-messages` 有効時のみ。
      ストリーミング表示に使うか、`SDKAssistantMessage` の逐次更新で足りるか
- [ ] 39 型のうち UI 表示が不要なもの（内部制御系）をどう区別するか。
      「表示不要」と明記する欄が `docs/ui-coverage.md` に要る
- [ ] `SandboxSettings` の詳細構造（`SandboxSettingsSchema` の Zod 定義）は未展開。
      I-3（sandbox 設定）の前に確認する

## References

- SPIKE-12 / SPIKE-6（docs/roadmap.md）
- `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts`
- [AD-019](0019-assistant-ui-element-inventory.md) — element 側の実在確認
- [AD-002](0002-use-agent-sdk-not-cli.md) — SDK 経由に限定する判断
- PLAN.md §4.2（Tier A 表）、§7.1（起動設定の軸）
