import {
  isLaunchFailureReason,
  SESSION_EVENT_KINDS,
  type SessionEvent
} from '@domain/session/agent-session'
import { isSessionRunState } from '@domain/session/run-state'

import { decodeTranscriptMessage } from '@/features/chat/transcript-guard'

/**
 * port から届いた本文のデコード (X-5 / FE-001 / plan renderer 節)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 本文は**文字列化された `SessionEvent`** で届く (セッションスレッドが `JSON.stringify` し、調停役スレッドは中身を見ずに中継する)。`JSON.parse` はここで 1 回だけ、try で囲む | AD-043 Decision 2 / SH-000 (2) / Principle IX |
 * | `kind` を enum で検証し、kind ごとの形を確かめる。**失敗したら null (破棄)** — 他のセッションに影響させない | spec FR-012 / Principle IV |
 * | 本文のサニタイズは agents 側で完了済み。ここは形の検証だけを行う | X-1 FR-009 / SC-008 |
 * | `message` の part は過去ログの受け口と同じ `decodeTranscriptMessage` で検証し、外れた part を落とす | O-2 data-model §2 |
 */

type Rec = Record<string, unknown>

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function isPermissionRequest(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.input === 'string' &&
    (value.scope === 'once' || value.scope === 'capability')
  )
}

/** 本文 1 件をデコードする。形が合わなければ null。 */
export function decodeSessionEvent(raw: unknown): SessionEvent | null {
  if (typeof raw !== 'string') return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const kind = value.kind
  if (typeof kind !== 'string' || !(SESSION_EVENT_KINDS as readonly string[]).includes(kind)) {
    return null
  }
  switch (kind) {
    case 'message': {
      // part の検証 (system-event の列挙・tool-call の結果の型) は過去ログと同じ関数 (O-2 / data-model §2)。
      const message = decodeTranscriptMessage(value.message)
      return message === null ? null : { kind: 'message', message }
    }
    case 'state':
      return isSessionRunState(value.state) ? { kind: 'state', state: value.state } : null
    case 'permission-request':
      return isPermissionRequest(value.request) ? (value as unknown as SessionEvent) : null
    case 'permission-denied': {
      const denied = value.denied
      return isRecord(denied) &&
        typeof denied.toolName === 'string' &&
        typeof denied.reason === 'string'
        ? {
            kind: 'permission-denied',
            denied: { toolName: denied.toolName, reason: denied.reason }
          }
        : null
    }
    case 'interrupt-receipt':
      return isStringArray(value.stillQueued) && isStringArray(value.cancelled)
        ? { kind: 'interrupt-receipt', stillQueued: value.stillQueued, cancelled: value.cancelled }
        : null
    case 'failure':
      return isLaunchFailureReason(value.reasonKey)
        ? { kind: 'failure', reasonKey: value.reasonKey }
        : null
    case 'end-forced':
      return { kind: 'end-forced' }
    default:
      return null
  }
}
