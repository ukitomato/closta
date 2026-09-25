import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ThreadMessageLike } from '@assistant-ui/react'

import { CAPABILITY_KEY, TRANSCRIPT_PORT_MESSAGE } from '@domain/capability'
import type { TranscriptFrameDTO } from '@domain/session/transcript-dto'
import type { FailureReason } from '@domain/session/target'

import { buildSessionRows } from '@/features/session-list/rows'
import { useSessionsStore } from '@/stores/sessions'

import { toThreadMessage } from './convert'

/**
 * 選んだセッションの transcript を取得して表示用メッセージに配線する (R-3 / FE-031)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 本文は **`MessageChannelMain` の port** で届く。invoke の戻りは handshake のみ | AD-034 決定 1 |
 * | **stale 応答を破棄する。** 選択切替後に届いた旧 token の応答は捨てる | US-1 AC-5 / data-model §8 |
 * | 失敗は状態として持つ。**retry** で同一 session を取り直す | US-1 AC-4 / M-004 |
 * | port は `window` メッセージ (`TRANSCRIPT_PORT_MESSAGE`) で main world に届く | AD-034 (contextBridge を越えられない) |
 *
 * **選択中の session は一覧の index から引く** (`buildSessionRows`)。選択 (`selectedRowKey`) は
 * `(targetKey, sessionId)` の組であり、`getTranscript` には両者を分けて渡す。
 */

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

export type TranscriptStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'failed'

export interface TranscriptView {
  readonly messages: readonly ThreadMessageLike[]
  readonly status: TranscriptStatus
  /** 失敗理由 (US-1 AC-4 の「理由つき失敗表示」)。失敗以外・理由不明は `null`。 */
  readonly reasonKey: FailureReason | null
  /** 失敗状態から同一 session を取り直す (US-1 AC-4)。 */
  retry(): void
  readonly hasSelection: boolean
}

let tokenCounter = 0
function nextToken(): string {
  tokenCounter += 1
  return `transcript-${tokenCounter}-${Date.now()}`
}

interface PortMessageData {
  readonly marker?: unknown
  readonly requestToken?: unknown
}

export function useTranscript(): TranscriptView {
  const index = useSessionsStore((s) => s.index)
  const selectedRowKey = useSessionsStore((s) => s.selectedRowKey)

  const [messages, setMessages] = useState<readonly ThreadMessageLike[]>([])
  const [status, setStatus] = useState<TranscriptStatus>('idle')
  const [reasonKey, setReasonKey] = useState<FailureReason | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  /** 現在有効な要求 token。port / handshake の応答はこれと一致するときだけ反映する。 */
  const currentToken = useRef<string | null>(null)

  /** 選択中の session を一覧から引く (`selector` の外で行う。rows.ts の注記)。 */
  const selected = useMemo(() => {
    if (selectedRowKey === null) return null
    const rows = buildSessionRows(index).rows
    return rows.find((row) => row.rowKey === selectedRowKey)?.session ?? null
  }, [index, selectedRowKey])

  /**
   * 選択・retry の変化で表示状態を作り直す。**effect 内で同期 setState しない**ため
   * render 中に調整する (React 公式「prop 変化時の state 調整」パターン)。
   * `requestKey` は `(targetKey, sessionId, retryNonce)` の組で、切替・再取得のたびに変わる。
   */
  const sessionId = selected?.sessionId ?? null
  const targetKey = selected?.targetKey ?? null
  const requestKey =
    sessionId === null || targetKey === null ? '' : `${targetKey}::${sessionId}::${retryNonce}`
  const [appliedKey, setAppliedKey] = useState('')
  if (requestKey !== appliedKey) {
    setAppliedKey(requestKey)
    setMessages([])
    setReasonKey(null)
    setStatus(requestKey === '' ? 'idle' : 'loading')
  }

  useEffect(() => {
    if (sessionId === null || targetKey === null) {
      currentToken.current = null
      return
    }

    const token = nextToken()
    currentToken.current = token

    /** port は window メッセージで届く。**自分の token の port だけを受け取る** (stale 破棄)。 */
    const onWindowMessage = (event: MessageEvent): void => {
      // 自 origin・自 window 由来のみ受ける (pr-gate security S-L-001。preload は自 origin へ transfer)。
      if (event.origin !== window.location.origin) return
      if (event.source !== window) return
      const data = event.data as PortMessageData
      if (data.marker !== TRANSCRIPT_PORT_MESSAGE || data.requestToken !== token) return
      const port = event.ports[0]
      if (port === undefined) return

      port.onmessage = (frameEvent: MessageEvent): void => {
        const frame = frameEvent.data as TranscriptFrameDTO
        /* **現在の選択と一致しない応答は破棄** (US-1 AC-5)。 */
        if (frame.requestToken !== currentToken.current) {
          port.close()
          return
        }
        if (frame.kind === 'error') {
          setReasonKey(frame.reasonKey)
          setStatus('failed')
          port.close()
          return
        }
        const converted = frame.messages.map(toThreadMessage)
        setMessages(converted)
        setStatus(converted.length === 0 ? 'empty' : 'ready')
        port.close()
      }
      port.start()
    }
    window.addEventListener('message', onWindowMessage)

    let cancelled = false
    void (async () => {
      try {
        const handshake = await capability().getTranscript(sessionId, targetKey, token)
        if (cancelled || currentToken.current !== token) return
        /* 'streaming' は port の frame を待つ。'failed' / 'empty' はここで確定。 */
        if (handshake.status === 'failed') {
          setReasonKey(handshake.reasonKey)
          setStatus('failed')
        } else if (handshake.status === 'empty') setStatus('empty')
      } catch {
        if (!cancelled && currentToken.current === token) setStatus('failed')
      }
    })()

    return () => {
      cancelled = true
      window.removeEventListener('message', onWindowMessage)
    }
  }, [requestKey, sessionId, targetKey])

  const retry = useCallback(() => setRetryNonce((nonce) => nonce + 1), [])

  return { messages, status, reasonKey, retry, hasSelection: selected !== null }
}
