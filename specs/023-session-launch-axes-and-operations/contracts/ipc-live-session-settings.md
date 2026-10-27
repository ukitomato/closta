# Contracts: 実行中のセッションの設定の変更 (023)

**Date**: 2026-10-27 (`/cl-plan`) | 規則の正本: [data-model.md](../data-model.md)

renderer → main の 3 つの IPC (C-1〜C-3) と、main ↔ supervisor ↔ セッションスレッドの結果の経路 (C-4)・改名の短命の子 (C-5)。どれも本文 (会話由来の文字列) を運ばない。名前は利用者が入力した 100 文字以下の値で、renderer → main → 子の一方向に 1 回だけ渡る。

## 共通の戻り値

```ts
type LiveSettingFailure =
  | 'unknown-session'   // registry に無い
  | 'invalid-value'     // 値の形・安全 3 値・カタログ・名前の規則の外 (data-model §5.2 / §5.3)
  | 'not-running'       // claude が動いていない (data-model §5.1)
  | 'not-ready'         // 起動中 (launching)
  | 'busy'              // 同じセッションの変更の結果を待っている
  | 'no-conversation'   // 名前だけ: 会話の id がまだ無い
  | 'turn-running'      // 名前だけ: ターンの実行中・承認待ち
  | 'rejected'          // SDK の Promise が reject した
  | 'session-ended'     // 結果の前にセッション・supervisor が終わった
  | 'timeout'           // 期限 (10 秒) を過ぎた
  | 'write-failed'      // 名前だけ: 書き込みの失敗・列挙対象が決まらない・所在が止まっている

type LiveSettingResult = { readonly ok: true } | { readonly ok: false; readonly reason: LiveSettingFailure }
type RenameResult = { readonly ok: true; readonly name: string } | { readonly ok: false; readonly reason: LiveSettingFailure }
```

- 理由のキーは `LIVE_SETTING_FAILURES` (domain の固定の表。並びを pin テストで固定する)
- 3 つの channel は `src/main/app/ipc.ts` の `handle()` wrapper (`:197-205`) で登録する (`handle(IPC_CHANNELS.setSessionPermissionMode, …)` ほか。`ipcMain.handle` を直接呼ばない)。送り元の検査 (`isTrustedSender`) は wrapper が行い、外れた要求は既存の channel と同じく `rejected` で throw する (`LiveSettingResult` / `RenameResult` を返さない)。`session-ipc.ts` の handler は `event` を受け取らず、送り元を見ない (今の `handleInterruptSession` ほかと同じ)

## C-1 `setSessionPermissionMode(sessionId, mode)`

- channel: `closta:setSessionPermissionMode`
- 入力: `sessionId` (Closta の行の id。UUID)・`mode` (`SafePermissionMode`)
- main: 値の検証 (data-model §5.2) → 状態の判定 (§5.1。kind `permission-mode`) → `requestId` を振って `changing` を立て、`control(sessionId, { kind: 'set-permission-mode', requestId, mode })` → 待ち (§4.2)
- 戻り値: `LiveSettingResult`
- 成功のあと、renderer の `meters.permissionMode` は本文の port の `meter` で更新される (data-model §3.3)。戻り値と `meter` の届く順は決まっていない — renderer は戻り値で `changing` を消すだけで、表示の値は `meters` から読む

## C-2 `setSessionModel(sessionId, modelId)`

- channel: `closta:setSessionModel`
- 入力: `sessionId`・`modelId` (カタログの `ModelEntry.id`)
- main: 値の検証 (§5.2。カタログと effort) → 状態の判定 (kind `model`) → SDK の値 `sdkModelOf(entry)` を決めて `control(sessionId, { kind: 'set-model', requestId, model })` → 待ち
- 戻り値: `LiveSettingResult`。成功なら renderer はストアの `currentModelId` を `modelId` にする

## C-3 `renameSession(sessionId, name)`

- channel: `closta:renameSession`
- 入力: `sessionId`・`name` (文字列)
- main: `normalizeSessionName` → 状態の判定 (kind `name`) → data-model §6.1 の 3〜6。受け付けてから結果までの間のそのセッションの `sendPrompt` は main が保留し、結果の後に送る (data-model §4.3。`sendPrompt` の channel の形は変えない)
- 戻り値: `RenameResult` (成功なら trim した名前)。renderer はストアの `name` に入れる
- 名前をログ・状態通知・本文に出さない

## C-4 結果の経路 (`src/agents/supervisor-protocol.ts`)

```ts
// セッションスレッド → 調停役スレッド
type WorkerMessage = ... | { kind: 'control-result'; requestId: string; ok: boolean }
// 調停役スレッド → main (標準出力の制御行)
type SupervisorEvent = ... | { kind: 'control-result'; sessionId: string; requestId: string; ok: boolean }
```

- `decodeWorkerMessage` / `decodeSupervisorEventForMain` は `requestId` が UUID・`ok` が真偽・`sessionId` が UUID でなければ捨てる (`conversation` の分岐と同じ形)
- 調停役スレッド (`supervisor-core.ts`) は状態通知の窓 (100ms) に入れずに即座に送る (`conversation` と同じ)。import は増やさない
- main の `SupervisorConnection` (`session-spawner.ts`) に `onControlResult(listener: (generation, sessionId, requestId, ok) => void)` を足す

## C-5 改名の短命の子 (`src/agents/rename-session.ts` / `src/main/app/rename-spawner.ts`)

- main → 子: `{ conversationId: string; name: string }` の 1 通 (子が起きてから。transcript-spawner と同じ `spawn` の後)
- 子 → main: `{ ok: boolean }` の 1 通。子はそのあと終わる
- env は `buildTranscriptEnv(process.env, configDirEnv)` の結果 (最小の許可リスト + `CLAUDE_CONFIG_DIR`)。stdio は `ignore`
- 期限 10 秒で子を止める。子の終わりの前に結果が無ければ `write-failed`
- 同時に動く改名の子は、同じセッションでは 1 つ (`changing`)。全体の上限 `MAX_CONCURRENT_RENAMES` (10) は `rename-spawner.ts` が動いている子の数で強制し、上限に達していたら子を起こさず `write-failed` (data-model §6.3)
- `rename-spawner.ts` は動いている子を追跡し、`dispose(): number` で全部を kill して待ちを `write-failed` で解く。`composition-root.ts` の `dispose` (window close / before-quit) の合計に足す (data-model §6.3。AD-034 決定 2 の形)

## C-6 e2e の capability と preload

- `src/preload/` と `src/main/app/e2e-capability.ts`・`src/renderer/src/test-support/capability.ts` に 3 つを足す (AD-038)。e2e の偽は、権限モードとモデルは受けた値で成功し、本文の port に `meter` の `permission-mode` を流す。名前は受けた値を trim して返す
- `IPC_CHANNELS` の並び (`capability.test.ts`) は `killSession` の後に 3 つを足した形で固定する
- `ClostaCapability.listSessions` の注記の「起動・改名・削除の経路は無い (FR-002)」は「過去の行の改名・削除の経路は無い (稼働中の行の改名は `renameSession`。023)」に直す
