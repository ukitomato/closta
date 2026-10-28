import {
  isLaunchFailureReason,
  type LaunchFailureReason,
  type SessionControl
} from '@domain/session/agent-session'
import { isSessionRunState, type SessionRunState } from '@domain/session/run-state'
import type { SessionStatusUpdate } from '@domain/session/status-update'
import { isValidSessionId } from '@domain/validation'

import { decodeSessionControl } from './session-core'
import type { OpaqueBody } from './transport'

/**
 * supervisor の**メッセージのエンコード / デコードを置く唯一の場所** (X-5 / AD-043 Decision 2・4)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 制御行 (main / 標準入出力 → 調停役スレッド) のデコードはここだけで行う。調停役スレッドの本体 (`supervisor.ts` / `supervisor-core.ts`) は `JSON.parse` を持たない | check.mjs 項目 18 / SC-002 |
 * | **本文 (`event`) を受け付けない** — 制御行のデコーダは本文の kind を拒否し、Worker メッセージのデコーダは本文の payload の中身を読まない (string であることだけを確かめる) | FR-002 / AD-031 §2 |
 * | 行は必ず `JSON.stringify` で組む。文字列連結しない (本文の改行・引用符で行を偽造させない) | security design-gate R1 L-002 |
 *
 * 本文は `OpaqueBody` (branded string) で運ぶ。中身を解釈する関数にこの型を渡す経路を作らない。
 */

/** 調停役スレッドが解釈せずに中継する本文 (型の置き場は列挙と共有の transport)。 */
export type { OpaqueBody } from './transport'

/* ── main (または標準入出力) → 調停役スレッド ─────────────────────── */

export type SupervisorRequest =
  | {
      readonly kind: 'launch'
      readonly sessionId: string
      /** セッションスレッドへそのまま渡す起動指示 (検証はセッションスレッドの decoder が行う)。 */
      readonly spec: Readonly<Record<string, unknown>>
      readonly options: Readonly<Record<string, unknown>>
    }
  | { readonly kind: 'control'; readonly sessionId: string; readonly control: SessionControl }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 制御行をデコードする。`launch` / `control` 以外 (本文の `event` を含む) と形の崩れは `null`。 */
export function decodeSupervisorRequest(line: string): SupervisorRequest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  const record = asRecord(parsed)
  if (record === null || !isValidSessionId(record.sessionId)) return null
  if (record.kind === 'launch') {
    const spec = asRecord(record.spec)
    const options = asRecord(record.options)
    if (spec === null || options === null) return null
    return { kind: 'launch', sessionId: record.sessionId, spec, options }
  }
  if (record.kind === 'control') {
    const control = decodeSessionControl(record.control)
    return control === null ? null : { kind: 'control', sessionId: record.sessionId, control }
  }
  return null
}

export function encodeSupervisorRequest(request: SupervisorRequest): string {
  return JSON.stringify(request)
}

/* ── セッションスレッド → 調停役スレッド ─────────────────────────── */

export type WorkerMessage =
  | { readonly kind: 'event'; readonly payload: OpaqueBody }
  | {
      readonly kind: 'status'
      readonly state: SessionRunState
      readonly reasonKey: LaunchFailureReason | null
      readonly claudeAlive: boolean
    }
  | { readonly kind: 'child-exited' }
  | { readonly kind: 'ended' }
  /** 会話の id (X-9 / AD-059)。最初の `system/init` の `session_id` を UUID の形で検査した値。 */
  | { readonly kind: 'conversation'; readonly conversationId: string }
  /** 実行中の設定の切り替えの結果 (023 / AD-062)。requestId は main が振った UUID。理由は運ばない。 */
  | { readonly kind: 'control-result'; readonly requestId: string; readonly ok: boolean }

/**
 * セッションスレッドからの構造化メッセージを検証する。未知の kind・形の崩れは `null`。
 * **`event` は payload が string であることだけを確かめ、中身を読まない。** sessionId は受け取らない —
 * 調停役スレッドが Worker インスタンスから付ける。
 */
export function decodeWorkerMessage(value: unknown): WorkerMessage | null {
  const record = asRecord(value)
  if (record === null) return null
  switch (record.kind) {
    case 'event':
      return typeof record.payload === 'string'
        ? { kind: 'event', payload: record.payload as OpaqueBody }
        : null
    case 'status':
      if (!isSessionRunState(record.state)) return null
      if (record.reasonKey !== null && !isLaunchFailureReason(record.reasonKey)) return null
      if (typeof record.claudeAlive !== 'boolean') return null
      return {
        kind: 'status',
        state: record.state,
        reasonKey: record.reasonKey,
        claudeAlive: record.claudeAlive
      }
    case 'child-exited':
      return { kind: 'child-exited' }
    case 'ended':
      return { kind: 'ended' }
    case 'conversation':
      return isValidSessionId(record.conversationId)
        ? { kind: 'conversation', conversationId: record.conversationId }
        : null
    case 'control-result':
      return isValidSessionId(record.requestId) && typeof record.ok === 'boolean'
        ? { kind: 'control-result', requestId: record.requestId, ok: record.ok }
        : null
    default:
      return null
  }
}

/* ── 調停役スレッド → main (または標準入出力) ─────────────────────── */

export type SupervisorEvent =
  | { readonly kind: 'status-batch'; readonly updates: readonly SessionStatusUpdate[] }
  | { readonly kind: 'thread-ended'; readonly sessionId: string }
  /** 会話の id (X-9 / AD-059)。窓で束ねず即座に送る。値を解釈・記録しない。 */
  | {
      readonly kind: 'conversation'
      readonly sessionId: string
      readonly conversationId: string
    }
  /** 実行中の設定の切り替えの結果 (023)。窓で束ねず即座に送る。 */
  | {
      readonly kind: 'control-result'
      readonly sessionId: string
      readonly requestId: string
      readonly ok: boolean
    }
  /** 標準入出力経路だけで使う本文の行。Electron 経路では本文は port へ送り、この行を作らない。 */
  | { readonly kind: 'event'; readonly sessionId: string; readonly payload: OpaqueBody }

export function encodeSupervisorEvent(event: SupervisorEvent): string {
  return JSON.stringify(event)
}

/**
 * main 側で supervisor の行をデコードする (本文を運ばないメタデータに限る。AD-031 §2)。
 * `event` (標準入出力経路の本文行) は main では受け付けない — Electron 経路では作られない行であり、来たら捨てる。
 * 状態通知の形の検証は main の受信規則 (`acceptBatch`) が行うので、ここでは配列であることだけを確かめる。
 */
export function decodeSupervisorEventForMain(line: string):
  | { readonly kind: 'status-batch'; readonly updates: readonly unknown[] }
  | { readonly kind: 'thread-ended'; readonly sessionId: string }
  | {
      readonly kind: 'conversation'
      readonly sessionId: string
      readonly conversationId: string
    }
  | {
      readonly kind: 'control-result'
      readonly sessionId: string
      readonly requestId: string
      readonly ok: boolean
    }
  | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  const record = asRecord(parsed)
  if (record === null) return null
  if (record.kind === 'status-batch' && Array.isArray(record.updates)) {
    return { kind: 'status-batch', updates: record.updates as unknown[] }
  }
  if (record.kind === 'thread-ended' && isValidSessionId(record.sessionId)) {
    return { kind: 'thread-ended', sessionId: record.sessionId }
  }
  if (
    record.kind === 'conversation' &&
    isValidSessionId(record.sessionId) &&
    isValidSessionId(record.conversationId)
  ) {
    return {
      kind: 'conversation',
      sessionId: record.sessionId,
      conversationId: record.conversationId
    }
  }
  if (
    record.kind === 'control-result' &&
    isValidSessionId(record.sessionId) &&
    isValidSessionId(record.requestId) &&
    typeof record.ok === 'boolean'
  ) {
    return {
      kind: 'control-result',
      sessionId: record.sessionId,
      requestId: record.requestId,
      ok: record.ok
    }
  }
  return null
}
