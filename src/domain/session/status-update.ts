import { isValidSessionId } from '@domain/validation'

import { isLaunchFailureReason, type LaunchFailureReason } from './agent-session'
import { isSessionRunState, type SessionRunState } from './run-state'

/**
 * 状態通知 (SessionStatusUpdate) と、その畳み込み・受信規則 (X-5 / spec FR-004・FR-005 / AD-043 Decision 4)。
 * **純粋関数。I/O を持たない。**
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 状態通知は sessionId / run-state / 理由キー / `claudeAlive` **だけ**を持つ。会話由来の文字列を持たない | FR-004 / SC-004 |
 * | `error` とその理由キー、`claudeAlive: false` は後続の通知で上書きしない (`done` は終端として扱わず上書きしてよい) | FR-004 |
 * | `claudeAlive` は true→false の一方向にしか変わらない | FR-004 / FR-005 |
 * | main の受信規則は `acceptBatch` 1 つに置く (形・世代・registry に在る sessionId・単調性)。relay は検証を持たない | AD-023 §5 / design-gate R2 M-103 |
 * | supervisor / スレッドの異常終了の通知は `synthesizeExit` で作る (調停役スレッドと main の両方が呼ぶ) | AD-023 §5 |
 *
 * 用語は glossary の「状態通知 (SessionStatusUpdate)」。R-2 の SessionSummary (セッション要約行) とは別物。
 */

export interface SessionStatusUpdate {
  readonly sessionId: string
  readonly state: SessionRunState
  readonly reasonKey: LaunchFailureReason | null
  /** `claude` が終わっていないか。セッションスレッドは常に true を送る。false にするのは調停役スレッドと main だけ。 */
  readonly claudeAlive: boolean
}

const UPDATE_KEYS = new Set(['sessionId', 'state', 'reasonKey', 'claudeAlive'])

/** 状態通知の形の述語 (未信頼の入力の検証用)。未知のキーを持つものも拒否する。 */
export function isSessionStatusUpdate(value: unknown): value is SessionStatusUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !UPDATE_KEYS.has(key))) return false
  return (
    isValidSessionId(record.sessionId) &&
    isSessionRunState(record.state) &&
    (record.reasonKey === null || isLaunchFailureReason(record.reasonKey)) &&
    typeof record.claudeAlive === 'boolean'
  )
}

/** 既知の状態に後続の状態を重ねる。`error` / 理由キー / `claudeAlive: false` は保つ。 */
function overlay(
  prev: Pick<SessionStatusUpdate, 'state' | 'reasonKey' | 'claudeAlive'>,
  next: Pick<SessionStatusUpdate, 'state' | 'reasonKey' | 'claudeAlive'>
): Pick<SessionStatusUpdate, 'state' | 'reasonKey' | 'claudeAlive'> {
  const keepError = prev.state === 'error'
  return {
    state: keepError ? 'error' : next.state,
    reasonKey: keepError ? prev.reasonKey : next.reasonKey,
    claudeAlive: prev.claudeAlive && next.claudeAlive
  }
}

/**
 * 1 つの窓に溜まった通知を、セッションごとに最新へ畳む (調停役スレッドのバッチャが使う)。
 * 出力の順序は、各 sessionId が最初に現れた順。
 */
export function coalesceUpdates(batch: readonly SessionStatusUpdate[]): SessionStatusUpdate[] {
  const merged = new Map<string, SessionStatusUpdate>()
  for (const update of batch) {
    const prev = merged.get(update.sessionId)
    merged.set(
      update.sessionId,
      prev === undefined ? update : { sessionId: update.sessionId, ...overlay(prev, update) }
    )
  }
  return [...merged.values()]
}

/** registry が状態通知の受信に使う 1 セッション分の値。 */
export interface RegistryStatus {
  readonly generation: number
  readonly state: SessionRunState
  readonly reasonKey: LaunchFailureReason | null
  readonly claudeAlive: boolean
}

export interface AcceptedBatch {
  /** 受理し、単調性を適用した後の値 (registry と renderer に同じ値が届く)。 */
  readonly accepted: readonly SessionStatusUpdate[]
  /** 更新後の registry の状態。入力の Map は変更しない。 */
  readonly next: ReadonlyMap<string, RegistryStatus>
}

/**
 * main の状態通知の**受信規則の唯一の正本**。
 *
 * - 形の崩れた値・registry に無い sessionId・現行世代 (`generation`) でない registry エントリへの通知を捨てる
 * - `error` と理由キー、`claudeAlive: false` を保ち、`claudeAlive` の false→true を反映しない
 */
export function acceptBatch(
  registry: ReadonlyMap<string, RegistryStatus>,
  generation: number,
  batch: readonly unknown[]
): AcceptedBatch {
  const next = new Map(registry)
  const accepted: SessionStatusUpdate[] = []
  for (const candidate of batch) {
    if (!isSessionStatusUpdate(candidate)) continue
    const entry = next.get(candidate.sessionId)
    if (entry === undefined || entry.generation !== generation) continue
    const merged = overlay(entry, candidate)
    next.set(candidate.sessionId, { generation: entry.generation, ...merged })
    accepted.push({ sessionId: candidate.sessionId, ...merged })
  }
  return { accepted, next }
}

/**
 * 異常終了の通知を作る。supervisor の異常終了 (main) とセッションスレッドの異常終了 (調停役スレッド) で使う。
 * どちらも `claude` は終わっている (SH-000 (3): Worker / supervisor が終われば子は残らない)。
 */
export function synthesizeExit(
  sessionIds: readonly string[],
  reasonKey: 'supervisor-exited' | 'process-crashed'
): SessionStatusUpdate[] {
  return sessionIds.map((sessionId) => ({
    sessionId,
    state: 'error',
    reasonKey,
    claudeAlive: false
  }))
}

/**
 * main が合成した通知 (`synthesizeExit` の結果) を registry に重ねる。世代は照合しない — 合成するのは main 自身で、
 * 対象は呼び出し側が「落ちた世代のエントリ」に絞って渡す。
 */
export function applySynthesized(
  registry: ReadonlyMap<string, RegistryStatus>,
  updates: readonly SessionStatusUpdate[]
): AcceptedBatch {
  const next = new Map(registry)
  const accepted: SessionStatusUpdate[] = []
  for (const update of updates) {
    const entry = next.get(update.sessionId)
    if (entry === undefined) continue
    const merged = overlay(entry, update)
    next.set(update.sessionId, { generation: entry.generation, ...merged })
    accepted.push({ sessionId: update.sessionId, ...merged })
  }
  return { accepted, next }
}
