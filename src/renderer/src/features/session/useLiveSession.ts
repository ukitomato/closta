import { useCallback, useEffect, useRef, useState } from 'react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { CAPABILITY_KEY, SESSION_PORT_MESSAGE } from '@domain/capability'
import type {
  LaunchFailureReason,
  PermissionDeniedInfo,
  SessionEvent,
  SessionLaunchRejectReason
} from '@domain/session/agent-session'
import type { SessionRunState } from '@domain/session/run-state'

import { toThreadMessage } from '@/features/chat/convert'

/**
 * 単一ライブセッションの起動 + ストリーミング配線 (X-1 / FE-001・FE-002・FE-010・FE-011・FE-020・FE-021・FE-030)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 本文 (`SessionEvent`) は **`MessageChannelMain` の port** で agents↔renderer 直通に届く | AD-036 §2 / contracts C-2 |
 * | 制御 (send/interrupt/kill/respond) は必ず **preload capability の invoke** を通す (port から発行しない) | AD-034 §1 / contracts C-1 |
 * | port は `window` メッセージ (`SESSION_PORT_MESSAGE`) で main world に届く | contextBridge を越えられないため |
 * | **本文サニタイズは agents 側で完了済み** — ここは表示 DTO を assistant-ui 形に写すだけ | FR-009 / SC-008 |
 *
 * **単一セッション不変** (FR-019): 稼働中は 1 本のみ。main が二重起動を `session-active` で拒否する。
 * ここは 1 本のライフサイクルだけを持つ。
 */

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

/** 画面フェーズ。`entry` は起動前の選択、`launching` は ~2.7s の起動窓 (FR-019 の UI 反映)。 */
export type SessionPhase = 'entry' | 'launching' | 'active' | 'rejected'

/** 承認カード表示用 (サニタイズ済み plain text。H-05)。 */
export interface PendingPermission {
  readonly requestId: string
  readonly toolName: string
  readonly input: string
  readonly scope: 'once' | 'capability'
}

export interface LiveSession {
  readonly phase: SessionPhase
  readonly runState: SessionRunState
  readonly messages: readonly ThreadMessageLike[]
  readonly pending: PendingPermission | null
  readonly denied: readonly PermissionDeniedInfo[]
  /** 実行時失敗の理由キー (`failure` SessionEvent 由来)。 */
  readonly failureReason: LaunchFailureReason | null
  /** 起動が拒否された理由 (launch handshake 由来。VerifiedRunning/distro 不一致など)。 */
  readonly rejectReason: SessionLaunchRejectReason | null
  /** 強制終了済みか。true のとき composer を無効化し終端を明示する (H-401)。 */
  readonly killed: boolean
  /** composer の下書き (未送信テキスト)。Thread 再構成をまたいで保持する (X-2 / FR-007。メモリ内限定)。 */
  readonly draft: string
  /** 下書きを更新する (composer の onChange から。メモリ内限定・境界/ログに出さない。FR-008)。 */
  setDraft(text: string): void
  launch(folderId: string, runtimeId: string): Promise<void>
  /** 送信と同時にユーザ発話を楽観表示する (agents の user echo は取らないため。FE-002)。 */
  appendUser(text: string): void
  send(text: string): void
  interrupt(): void
  kill(): void
  respond(requestId: string, outcome: 'allow' | 'deny'): void
  /** 起動前の選択画面へ戻す (終了/失敗後の再起動導線)。 */
  reset(): void
}

/** 同 id は差し替え、新規は末尾へ (逐次生成のメッセージ単位更新。AD-020 / H-06)。 */
function upsertMessage(
  prev: readonly ThreadMessageLike[],
  next: ThreadMessageLike
): ThreadMessageLike[] {
  const index = prev.findIndex((m) => m.id !== undefined && m.id === next.id)
  if (index === -1) return [...prev, next]
  const copy = [...prev]
  copy[index] = next
  return copy
}

interface BufferedPort {
  readonly sessionId: string
  readonly port: MessagePort
}

interface SessionPortData {
  readonly marker?: unknown
  readonly sessionId?: unknown
}

export function useLiveSession(): LiveSession {
  const [phase, setPhase] = useState<SessionPhase>('entry')
  const [runState, setRunState] = useState<SessionRunState>('idle')
  const [messages, setMessages] = useState<readonly ThreadMessageLike[]>([])
  const [pending, setPending] = useState<PendingPermission | null>(null)
  const [denied, setDenied] = useState<readonly PermissionDeniedInfo[]>([])
  const [failureReason, setFailureReason] = useState<LaunchFailureReason | null>(null)
  const [rejectReason, setRejectReason] = useState<SessionLaunchRejectReason | null>(null)
  // **強制終了したか。** kill() は worker を落とすが、その `done` state イベントは port を先に閉じるため
  // renderer に届かない。UI をローカルで終端に落とす標識にする (pr-gate po H-401)。
  const [killed, setKilled] = useState(false)
  // **下書きは useLiveSession に持つ** (SessionScreen の親 hook。phase/isDisabled で LiveThread や
  // useExternalStoreRuntime が再構成されても保持される。X-2 / FR-007)。会話由来テキストなので
  // 境界・ログ・永続層に出さない (Principle V / FR-008)。
  const [draft, setDraftValue] = useState('')

  const sessionIdRef = useRef<string | null>(null)
  const portRef = useRef<MessagePort | null>(null)
  /** launch handshake より先に届いた port を待避する (postMessage と invoke 解決の順序が保証されないため)。 */
  const bufferedRef = useRef<BufferedPort | null>(null)

  const applyEvent = useCallback((event: SessionEvent): void => {
    switch (event.kind) {
      case 'state':
        setRunState(event.state)
        break
      case 'message':
        setMessages((prev) => upsertMessage(prev, toThreadMessage(event.message)))
        break
      case 'permission-request':
        setPending({
          requestId: event.request.requestId,
          toolName: event.request.toolName,
          input: event.request.input,
          scope: event.request.scope
        })
        break
      case 'permission-denied':
        setDenied((prev) => [...prev, event.denied])
        break
      case 'failure':
        setFailureReason(event.reasonKey)
        // **承認待ちを畳む** (pr-gate po M-401)。awaiting 中に provider-error/stream 例外が来ると
        // FailureBanner と ApprovalCard が競合表示になる。terminal failure では承認カードを消す。
        setPending(null)
        break
      case 'interrupt-receipt':
        // 途中出力は保持され、承認待ち/キュー済みは state で反映される (FR-015)。表示は最小。
        break
    }
  }, [])

  const wirePort = useCallback(
    (port: MessagePort): void => {
      portRef.current = port
      port.onmessage = (ev: MessageEvent): void => applyEvent(ev.data as SessionEvent)
      port.start()
    },
    [applyEvent]
  )

  useEffect(() => {
    const onWindowMessage = (event: MessageEvent): void => {
      // 自 origin・自 window 由来のみ (preload は自 origin へ transfer。pr-gate S-L-001)。
      if (event.origin !== window.location.origin || event.source !== window) return
      const data = event.data as SessionPortData
      if (data.marker !== SESSION_PORT_MESSAGE || typeof data.sessionId !== 'string') return
      const port = event.ports[0]
      if (port === undefined) return
      if (sessionIdRef.current === data.sessionId) wirePort(port)
      // まだ handshake が返っていない (sessionId 未確定)。待避して launch で拾う。
      else bufferedRef.current = { sessionId: data.sessionId, port }
    }
    window.addEventListener('message', onWindowMessage)
    return () => window.removeEventListener('message', onWindowMessage)
  }, [wirePort])

  // **unmount 時に稼働セッションを kill する** (画面遷移で SessionScreen が unmount される経路。
  // これが無いと supervisor が孤児化し、単一セッション不変で再起動も拒否される (pr-gate C-001 / FR-017)。
  useEffect(() => {
    return () => {
      const id = sessionIdRef.current
      if (id !== null) void capability().killSession(id)
      portRef.current?.close()
      portRef.current = null
    }
  }, [])

  const launch = useCallback(
    async (folderId: string, runtimeId: string): Promise<void> => {
      // 前回の残りを片付けてから起動する。
      // (bufferedRef はここで null 化しない — TS の control-flow が `.current` を `null` に固定し、
      //  後段の buffered 取り出しが never になるため。別 sessionId の残りは line の照合で弾かれ無害。)
      portRef.current?.close()
      portRef.current = null
      sessionIdRef.current = null
      setMessages([])
      setDenied([])
      setPending(null)
      setFailureReason(null)
      setRejectReason(null)
      setKilled(false)
      setDraftValue('') // 新規起動で下書きは持ち越さない (X-2 / R2-M-002 の discard 相当)
      setRunState('launching')
      setPhase('launching')

      let handshake
      try {
        handshake = await capability().launchSession(folderId, runtimeId)
      } catch {
        setRejectReason('launch-failed')
        setPhase('rejected')
        return
      }

      if (handshake.status === 'rejected') {
        setRejectReason(handshake.reasonKey)
        setPhase('rejected')
        return
      }

      sessionIdRef.current = handshake.sessionId
      setPhase('active')
      // handshake より先に port が届いていたら拾う (順序非保証への対処)。
      const buffered = bufferedRef.current
      if (buffered !== null && buffered.sessionId === handshake.sessionId) {
        bufferedRef.current = null
        wirePort(buffered.port)
      }
    },
    [wirePort]
  )

  const userSeqRef = useRef(0)
  const appendUser = useCallback((text: string): void => {
    userSeqRef.current += 1
    const message: ThreadMessageLike = {
      role: 'user',
      content: [{ type: 'text', text }],
      id: `user-${userSeqRef.current}`
    }
    setMessages((prev) => upsertMessage(prev, message))
  }, [])

  const send = useCallback((text: string): void => {
    const id = sessionIdRef.current
    if (id !== null) void capability().sendPrompt(id, text)
  }, [])

  const setDraft = useCallback((text: string): void => setDraftValue(text), [])

  const interrupt = useCallback((): void => {
    const id = sessionIdRef.current
    if (id !== null) void capability().interruptSession(id)
  }, [])

  const kill = useCallback((): void => {
    const id = sessionIdRef.current
    if (id !== null) void capability().killSession(id)
    portRef.current?.close()
    portRef.current = null
    // **UI をローカルで終端に落とす** (pr-gate po H-401)。worker の `done` state は port を先に閉じるため
    // 届かず runState が更新されない。killed を立てて composer を無効化し「強制終了しました」を明示する
    // (worker は kill 後に exit し registry から外れるため送信は無効。復帰は SessionControls の「閉じる」)。
    setKilled(true)
    setRunState('done')
  }, [])

  const respond = useCallback((requestId: string, outcome: 'allow' | 'deny'): void => {
    const id = sessionIdRef.current
    // X-1 の要求 scope は常に `once` (capability 付与は X-4)。承認カードが唯一の承認経路。
    if (id !== null) void capability().respondPermission(id, requestId, outcome, 'once')
    setPending(null)
  }, [])

  const reset = useCallback((): void => {
    // **稼働セッションが在れば先に kill してから畳む** (「閉じる」経路。pr-gate C-001 / FR-017)。
    // これを欠くと supervisor が孤児化し、sessionIdRef を null 化した後は UI から kill 不能になり
    // 単一セッション不変で再起動も拒否される (ソフトロック)。
    const id = sessionIdRef.current
    if (id !== null) void capability().killSession(id)
    portRef.current?.close()
    portRef.current = null
    bufferedRef.current = null
    sessionIdRef.current = null
    setPhase('entry')
    setRunState('idle')
    setMessages([])
    setDenied([])
    setPending(null)
    setFailureReason(null)
    setRejectReason(null)
    setKilled(false)
    setDraftValue('') // reset で下書きも破棄 (次セッションへ持ち越さない。X-2 / R2-M-002)
  }, [])

  // 終了状態 (error/done) に達しても port は閉じない — done からの継続送信 (FR-015) を許すため。
  // kill / reset のみが port を閉じる。

  return {
    phase,
    runState,
    messages,
    pending,
    denied,
    failureReason,
    rejectReason,
    killed,
    draft,
    setDraft,
    launch,
    appendUser,
    send,
    interrupt,
    kill,
    respond,
    reset
  }
}
