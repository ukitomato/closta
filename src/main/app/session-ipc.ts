import type { SessionIndexDTO } from '@domain/session/dto'
import type { FailureReason } from '@domain/session/target'
import { isValidRequestToken, isValidSessionId } from '@domain/validation'

import type { TranscriptResult } from './transcript-service'
import { isKnownTargetKey, isValidSessionOffset } from './validate'

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
