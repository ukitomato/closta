import { useCallback, useMemo } from 'react'
import { useStore } from 'zustand'

import type { ElicitationAction, ElicitationContent } from '@domain/session/elicitation'
import type { SafePermissionMode } from '@domain/session/launch-config'

import { useRunningSessionStoreApi } from './running-session-context'
import type { LiveSessionState, SessionQueue } from './running-session-store'
import { deriveSessionView, type SessionView } from './session-view'

export type { PendingPermission } from './running-session-store'

/**
 * 表示中セッション 1 本分の読み出しと制御 (X-5 / FE-002)。ストアの寿命と注入は `running-session-context.ts`。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `useLiveSession(sessionId)` は 1 セッション分だけを selector で読む — 表示していないセッションの更新で表示中の Thread を再描画しない | FR-008 / plan renderer 節 |
 * | 送信・承認・中断・終了・強制終了は**引数の sessionId に向ける** (送信した時点の表示中セッション) | FR-010 |
 * | **unmount で kill しない。reset で kill しない** — セッションの寿命は store と main (`dispose` / `killAll`) に一本化する (X-1 の「画面を離れたら kill」を撤去) | FR-008 / FR-014 |
 * | 制御は必ず preload capability の invoke を通す (port から発行しない) | AD-034 §1 / contracts C-1 |
 */

/**
 * 表示中セッション 1 本分の読み出しと制御。表示用の導出 (`runState` / `failureReason` / `ended` / `terminal` /
 * 最初のプロンプト待ち) は `SessionView` (一覧の行と同じ判定)。
 */
export interface LiveSession extends SessionView {
  readonly sessionId: string
  readonly state: LiveSessionState
  readonly queue: SessionQueue | null
  /** 保持している下書き (再描画を起こさない保持から読む。切り替えで Thread を作り直したときの復元用)。 */
  getDraft(): string
  setDraft(text: string): void
  appendUser(text: string): void
  send(text: string): void
  interrupt(): void
  respond(requestId: string, outcome: 'allow' | 'deny', answers?: readonly string[]): void
  /** MCP サーバーの問い (Elicitation) への応答 (O-10)。`content` は `accept` のときだけ (ストアに残さない)。 */
  respondElicitation(
    requestId: string,
    action: ElicitationAction,
    content?: ElicitationContent
  ): void
  end(): void
  kill(): void
  close(): void
  clearQueueRejection(): void
  /** 実行中の権限モードの切り替え (023)。 */
  setPermissionMode(mode: SafePermissionMode): void
  /** 実行中のモデルの切り替え (023)。 */
  setModel(modelId: string): void
  /** セッションの名前の変更 (023)。成功なら `true`。 */
  rename(name: string): Promise<boolean>
}

export function useLiveSession(sessionId: string): LiveSession | null {
  const store = useRunningSessionStoreApi()
  // **セッション単位の selector** (他のセッションの更新では参照が変わらず再描画しない)。
  const state = useStore(store, (s) => s.sessions[sessionId])
  const status = useStore(store, (s) => s.statuses[sessionId])

  const getDraft = useCallback(() => store.getDraft(sessionId), [store, sessionId])
  const setDraft = useCallback(
    (text: string) => store.setDraft(sessionId, text),
    [store, sessionId]
  )
  const appendUser = useCallback(
    (text: string) => store.appendUser(sessionId, text),
    [store, sessionId]
  )
  const send = useCallback((text: string) => store.send(sessionId, text), [store, sessionId])
  const interrupt = useCallback(() => store.interrupt(sessionId), [store, sessionId])
  const respond = useCallback(
    (requestId: string, outcome: 'allow' | 'deny', answers?: readonly string[]) =>
      store.respond(sessionId, requestId, outcome, answers),
    [store, sessionId]
  )
  const respondElicitation = useCallback(
    (requestId: string, action: ElicitationAction, content?: ElicitationContent) =>
      store.respondElicitation(sessionId, requestId, action, content),
    [store, sessionId]
  )
  const end = useCallback(() => store.end(sessionId), [store, sessionId])
  const kill = useCallback(() => store.kill(sessionId), [store, sessionId])
  const close = useCallback(() => store.close(sessionId), [store, sessionId])
  const clearQueueRejection = useCallback(
    () => store.clearQueueRejection(sessionId),
    [store, sessionId]
  )

  const setPermissionMode = useCallback(
    (mode: SafePermissionMode) => store.setPermissionMode(sessionId, mode),
    [store, sessionId]
  )

  const setModel = useCallback(
    (modelId: string) => store.setModel(sessionId, modelId),
    [store, sessionId]
  )

  const rename = useCallback((name: string) => store.rename(sessionId, name), [store, sessionId])

  return useMemo(() => {
    if (state === undefined) return null
    // 導出は store の純関数に一本化する (一覧と表示中セッションで判定を分けない)。
    return {
      sessionId,
      state,
      ...deriveSessionView(state, status),
      queue: store.queueOf(sessionId),
      getDraft,
      setDraft,
      appendUser,
      send,
      interrupt,
      respond,
      respondElicitation,
      end,
      kill,
      close,
      clearQueueRejection,
      setPermissionMode,
      setModel,
      rename
    }
  }, [
    state,
    status,
    store,
    sessionId,
    getDraft,
    setDraft,
    appendUser,
    send,
    interrupt,
    respond,
    respondElicitation,
    end,
    kill,
    close,
    clearQueueRejection,
    setPermissionMode,
    setModel,
    rename
  ])
}
