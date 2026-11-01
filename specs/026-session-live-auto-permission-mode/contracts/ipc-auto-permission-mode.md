# Contracts: 権限モードの Auto の IPC (026)

**Data model**: [../data-model.md](../data-model.md) (規則の正本)

`IPC_CHANNELS` は増やさない。既存の 3 つの口に引数を 1 つ足し、値の集合と拒否の理由のキーを広げる。送り元の検査は今の `handle()` wrapper (`ipc.ts`) のまま。

## 共通

- **`autoModeAcknowledged`** (3 つ目の引数): renderer が「隔離の無いランタイムで `auto` を選ぶ確認を承諾した」ことを載せる。main は `=== true` だけを承諾とみなし、他の値 (欠け・`false`・型の違う値) は承諾なし。承諾なしでも、確認が要らない要求 (安全 3 値・`isAutoModeAllowed` が true のランタイムの `auto`) は今どおり通る (true は sandbox を使えるという意味で、隔離の中で動くという意味ではない。spec U-6)
- 確認が要るか: `requiresAutoModeConfirmation(mode, isAutoModeAllowed(ランタイムの capabilities))` (data-model §1)。ランタイムが見つからなければ要る
- 値の集合: `SelectablePermissionMode` (`default` / `plan` / `dontAsk` / `auto`)。`acceptEdits` / `bypassPermissions` / 不明な値は今どおり形の検査で落ちる

## C-1 `launchSession(config, origin, autoModeAcknowledged?)`

| 入力 | 検査 | 結果 |
|---|---|---|
| `config` | `checkLaunchConfig` (`isValidLaunchConfig`。権限モードは許可の 4 値) | 外れたら `{ status: 'rejected', reason: 'invalid-config' }` (今のまま) |
| `origin` | `checkLaunchOrigin` (今のまま) | 計測だけ |
| `autoModeAcknowledged` | `=== true` | 確認が要るのに承諾なしなら `{ status: 'rejected', reason: 'auto-mode-unconfirmed' }`。`prepareLaunch` を呼ばず、枠を予約せず、起動を記録しない |

preload / `Capability.launchSession` の型: `launchSession(config: SessionLaunchConfig, origin?: LaunchOrigin, autoModeAcknowledged?: boolean): Promise<LaunchOutcome>`。

## C-2 `resumeSession(request, origin, autoModeAcknowledged?)`

- `request` の検査は `checkResumeRequest` (今のまま。`config` は C-1 と同じ述語)
- `already-running` / `conversation-running` の判定は今のまま印より先
- 確認が要るのに承諾なしなら `{ status: 'rejected', reason: 'auto-mode-unconfirmed' }`。`resume-service` は印を `launchService.resume(config, resolved, ack)` に素通しする

## C-3 `setSessionPermissionMode(sessionId, mode, autoModeAcknowledged?)`

| 入力 | 検査 | 結果 |
|---|---|---|
| 引数の数 | 2 または 3 | 外れたら `{ ok: false, reason: 'invalid-value' }` (今の形の検査の失敗と同じ) |
| `sessionId` | `isValidSessionId` | 同上 |
| `mode` | `isSelectablePermissionMode` | 同上 |
| 受け付け | `liveSettingBlocker('permission-mode', row)` (今のまま) | 今の理由 |
| `autoModeAcknowledged` | `=== true` | 確認が要るのに承諾なしなら `{ ok: false, reason: 'auto-mode-unconfirmed' }`。制御を送らず、`changing` を立てない |

通れば今どおり `SessionControl` の `set-permission-mode` (`mode` は許可の 4 値) を送り、`control-result` を待つ。

## C-4 セッションスレッドへの値 (main → agents)

- 起動: `LaunchQueryOptions.permissionMode: SelectablePermissionMode`。decoder は `isSelectablePermissionMode`、SDK に渡す直前は `assertSelectablePermissionMode(...)`
- 実行中: `SessionControl` の `{ kind: 'set-permission-mode', mode: SelectablePermissionMode, requestId }`。decoder と呼び出しの直前の検査は起動と同じ
- 印は agents に送らない

## C-5 拒否の理由のキー

| キー | 集合 | 文言 |
|---|---|---|
| `auto-mode-unconfirmed` | `LaunchPreflightReason` (起動・再開) | `LAUNCH_REJECT_LABELS` (data-model §9) |
| `auto-mode-unconfirmed` | `LiveSettingFailure` (実行中) | `LIVE_SETTING_LABELS` (data-model §9) |

## C-6 e2e の capability の写し (`src/main/app/e2e-capability.ts`)

- 3 つの口に 3 つ目の引数を通し、起動の service に `autoModeAllowed` (`knownRuntimes` の記述子から `isAutoModeAllowed`) を渡す。偽のランタイムはすべて `autoModeAllowed: false` のまま (`:511` 付近)
- 偽の supervisor の起動 (`:324`) は、起動の options の `permissionMode` を `meter` の `permission-mode` として 1 回流す (実機の `init` の代わり)
- 偽の `set-permission-mode` は今のまま (`:440-441`。`meter` を流して成功)
- `src/renderer/src/test-support/capability.ts` の写しも同じ引数を受ける

## C-7 renderer の通り道

- `Capability` (`src/domain/capability.ts:166`, `:179`, `:227`)・preload・`ipc.ts` (`:154`, `:158`, `:170`)・`session-ipc.ts` の deps (`:76`, `:80`, `:93`) の 3 つの口の型に 3 つ目の引数を足す
- renderer の呼び出しはストアの 3 か所 (`running-session-store.ts:840`, `:882`, `:1020`) だけ。経路は data-model §6.3 / §6.4 (`LaunchDialog` の `LaunchSource` → `LivePane` の `NewSessionDialog` → `RunningSessionsProvider` → ストア)。IPC の口の型では省略可能、renderer の中の型 (ストア・view・`LaunchSource`・`useLiveSession`) では必須の `boolean` にする (段が引数を落としたら tsc が落とす)
