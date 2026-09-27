import type { SessionControl } from '@domain/session/agent-session'
import type { SessionIndexDTO } from '@domain/session/dto'
import type { FailureReason } from '@domain/session/target'
import { isValidPromptText, isValidRequestToken, isValidSessionId } from '@domain/validation'

import type { LaunchOutcome } from './session-launch-service'
import type { TranscriptResult } from './transcript-service'
import {
  isKnownTargetKey,
  isPermissionOutcome,
  isPermissionScope,
  isValidSessionOffset
} from './validate'

/**
 * セッション一覧の IPC ハンドラ本体 (BE-028 / BE-029)。
 *
 * **`electron` を import しない。** チャンネルへの登録は `ipc.ts` が行い、
 * ここには「引数をどう検証して何を呼ぶか」だけを置く。
 *
 * 分けてある理由は 1 つで、**SC-010 の計測経路を成立させる**ためである。
 * SC-010 は「preload をスタブせず main 側ハンドラを直接呼ぶ」ことを要求するが、
 * `ipc.ts` は `ipcMain` を import するため Vitest の node 環境で読み込めない。
 * 検証関数だけをテストすると、**ハンドラがその検証関数を呼んでいるか**が
 * 検査されないまま残る — 表の各行を測ったことにならない。
 *
 * **検証の実装は `validate.ts` に集約する** (FR-043)。ここには条件を書かない。
 */

export interface SessionIpcDeps {
  listSessions(): Promise<SessionIndexDTO>
  refreshSessions(): Promise<SessionIndexDTO>
  fetchMoreSessions(targetKey: string, offset: number): Promise<SessionIndexDTO>
  /** 未信頼入力の照合に使う集合。**停止中の所在の `key` も含む。** */
  sessionTargetKeys(): readonly string[]
  /** transcript 取得 (R-3 / AD-034)。**本文は port 経由**、戻り値の handshake は本文を含まない。 */
  getTranscript(
    sessionId: string,
    targetKey: string,
    requestToken: string
  ): Promise<TranscriptResult>

  /* ── セッション起動 + 制御 (X-1 / contracts C-1) ── */

  /** 起動を調停する (VerifiedRunning + distro 一致 + 登録 + 単一セッション不変を検証)。本文は port。 */
  launchSession(folderId: string, runtimeId: string): Promise<LaunchOutcome>
  /** 制御を該当セッションへ送る。未知 / 終了済み sessionId なら `false`。 */
  controlSession(sessionId: string, control: SessionControl): boolean
}

function failedTranscript(requestToken: string, reasonKey: FailureReason): TranscriptResult {
  return { handshake: { status: 'failed', requestToken, reasonKey }, port: null }
}

/**
 * `getTranscript(sessionId, targetKey, requestToken)` (R-3 / BE-024 / [contracts/ipc-transcript.md](../../../specs/003-ui-transcript-rendering/contracts/ipc-transcript.md))。
 *
 * **検証を通らない入力では取得プロセスを起こさず失敗 handshake を返す** (port は `null`)。
 * - `sessionId` は **UUID 形式に一致**すること (path traversal 防止。FR-017 / security H-002)
 * - `targetKey` は既知集合との完全一致 (`isKnownTargetKey`。任意パスとして解釈しない)
 * - `requestToken` は非空文字列 (stale 破棄の照合鍵)
 *
 * **本体を `ipc.ts` から分けてある** — `ipc.ts` は `ipcMain` を import するため Vitest で読めない。
 * port の transfer (`event.sender.postMessage`) だけが `ipc.ts` に残り、検証と service 呼び出しはここで試せる。
 * 返り値の `port` (`MessagePortMain`) は型のみで扱い、実際の transfer は `ipc.ts` が行う。
 */
export async function handleGetTranscript(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<TranscriptResult> {
  const requestToken = args[2]
  if (!isValidRequestToken(requestToken)) {
    return failedTranscript('', 'transcript-read-failed')
  }
  if (!isValidSessionId(args[0])) return failedTranscript(requestToken, 'transcript-read-failed')
  if (!isKnownTargetKey(deps.sessionTargetKeys(), args[1])) {
    return failedTranscript(requestToken, 'transcript-read-failed')
  }
  return deps.getTranscript(args[0], args[1], requestToken)
}

/**
 * `fetchMoreSessions(targetKey, offset)`。
 *
 * **不正な入力では列挙を発行せず、現在のキャッシュを返す。**
 * 例外や理由つきの拒否にしないのは、応答の差から
 * 「どの `targetKey` が存在するか」を renderer が数えられるためである。
 * 停止中の所在の `key` は既知であり照合を通るが、**起動ゲートが列挙を止める**
 * (`session-enumerator` の `checkLaunchAllowed`)。ここで所在の実行状態を見ない —
 * 見ると実行状態の判定が 2 箇所に分かれる。
 */
export async function handleFetchMoreSessions(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<SessionIndexDTO> {
  if (!isKnownTargetKey(deps.sessionTargetKeys(), args[0])) return deps.listSessions()
  if (!isValidSessionOffset(args[1])) return deps.listSessions()
  return deps.fetchMoreSessions(args[0], args[1])
}

/** `listSessions()`。**引数を取らない** — 受け取ると検証対象が増える。 */
export async function handleListSessions(deps: SessionIpcDeps): Promise<SessionIndexDTO> {
  return deps.listSessions()
}

/** `refreshSessions()`。連打の抑制は `session-enumerator` の責務である (C-6)。 */
export async function handleRefreshSessions(deps: SessionIpcDeps): Promise<SessionIndexDTO> {
  return deps.refreshSessions()
}

/* ── セッション起動 + 制御 (X-1 / BE-006・BE-007・BE-011・BE-021) ─────── */

/**
 * `launchSession(folderId, runtimeId)` (BE-007 の入口。US-1 の安全ゲート)。
 *
 * **folderId / runtimeId は文字列であること**を確認し、登録済み集合との一致 (folderId) と
 * 検出済み descriptor との一致 (runtimeId)・VerifiedRunning・所在 distro 一致・単一セッション不変は
 * `launchSession` (→ prepareLaunch / service) が **登録の SSoT に対して**判定する (二重管理を避ける)。
 * 型不正はプロセスを起こさず `unknown-target` で拒否する。**戻り値の `port` の transfer は `ipc.ts`。**
 */
export async function handleLaunchSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<LaunchOutcome> {
  if (typeof args[0] !== 'string' || typeof args[1] !== 'string') {
    return { status: 'rejected', reason: 'unknown-target' }
  }
  return deps.launchSession(args[0], args[1])
}

/**
 * `sendPrompt(sessionId, text)` (BE-006)。
 *
 * **不正な入力ではプロセスへ送らない。** sessionId が UUID 形式・text が非空/非空白かつバイト長上限内。
 * running / awaiting_permission 中の queue 積みは agents 側 (状態機械) が担う。
 */
export async function handleSendPrompt(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  if (!isValidPromptText(args[1])) return
  deps.controlSession(args[0], { kind: 'send-prompt', text: args[1] })
}

/**
 * `respondPermission(sessionId, requestId, outcome, scope)` (BE-011)。**唯一の承認経路。**
 *
 * **`outcome` / `scope` を明示述語で enum 検証** (`as` 禁止。H-04)。requestId は awaiting 中の要求との一致を
 * agents (pending Map を保持) が最終判定する — main は本文経路 (port) を持たないため requestId の妥当性は
 * 形状 (非空・上限内) のみ検証し、実在照合は agents の defense-in-depth に委ねる (Principle IX / contracts C-2)。
 */
export async function handleRespondPermission(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  if (!isValidRequestToken(args[1])) return
  if (!isPermissionOutcome(args[2])) return
  if (!isPermissionScope(args[3])) return
  deps.controlSession(args[0], {
    kind: 'respond-permission',
    decision: { requestId: args[1], outcome: args[2], scope: args[3] }
  })
}

/** `interruptSession(sessionId)` (BE-021)。中断は kill とは別経路 (FR-015/016)。 */
export async function handleInterruptSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  deps.controlSession(args[0], { kind: 'interrupt' })
}

/** `killSession(sessionId)` (BE-021)。強制終了。agents が保持する `SpawnedProcess` (wsl) を直接 kill する。 */
export async function handleKillSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  deps.controlSession(args[0], { kind: 'kill' })
}
