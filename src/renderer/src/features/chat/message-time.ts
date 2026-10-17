import type { ThreadMessageLike } from '@assistant-ui/react'

import { TURN_DURATION_LABEL } from './labels'

/**
 * メッセージの時刻の写しと書式 (O-9 / AD-051。data-model §1「renderer の写し」・§5)。
 *
 * **時刻は表示だけに使い、並べ替えに使わない** (AD-051)。assistant-ui の `createdAt` は無いとき「今」になる
 * (`@assistant-ui/core` の `thread-message-like.ts:115`) ので読まない。表示とターンの導出は
 * `metadata.custom.createdAt` だけを読む (research R-04)。
 */

type MetadataOf = NonNullable<ThreadMessageLike['metadata']>

/** `metadata.custom` に別のキーを足した ThreadMessageLike (既存の `custom` と `metadata` の他のキーは保つ)。 */
function withCustom(like: ThreadMessageLike, extra: Record<string, unknown>): ThreadMessageLike {
  const metadata: MetadataOf = like.metadata ?? {}
  return { ...like, metadata: { ...metadata, custom: { ...metadata.custom, ...extra } } }
}

/** `createdAt` (assistant-ui) と `metadata.custom.createdAt` の両方に時刻 (epoch ms) を入れる。 */
export function withMessageTime(like: ThreadMessageLike, ms: number): ThreadMessageLike {
  return withCustom({ ...like, createdAt: new Date(ms) }, { createdAt: ms })
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** `metadata.custom` から時刻 (epoch ms) を読む (assistant-ui の状態の `message.metadata.custom` 用)。 */
export function readMessageTimeOf(custom: Record<string, unknown> | undefined): number | null {
  return finiteNumber(custom?.createdAt)
}

/** `metadata.custom.createdAt` の時刻 (epoch ms)。有限の数でなければ `null`。 */
export function readMessageTime(message: ThreadMessageLike): number | null {
  return readMessageTimeOf(message.metadata?.custom)
}

/**
 * renderer がメッセージを受けた時刻 (所要時間の時計。U-8 / data-model §1「renderer の受信時刻」)。
 * DTO・IPC には載せない。過去ログのメッセージは持たない。
 */
export function withReceivedAt(like: ThreadMessageLike, ms: number): ThreadMessageLike {
  return withCustom(like, { receivedAt: ms })
}

/** `metadata.custom.receivedAt` (epoch ms)。有限の数でなければ `null`。 */
export function readReceivedAt(message: ThreadMessageLike): number | null {
  return finiteNumber(message.metadata?.custom?.receivedAt)
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 短い書式。`now` と同じローカルの日付なら `HH:mm`、違えば `M/D HH:mm` (月と日は 0 で埋めない)。24 時間制。
 * `now` は表示の時点で 1 回だけ取って渡す。
 */
export function formatMessageTime(ms: number, now: number): string {
  const at = new Date(ms)
  const today = new Date(now)
  const hm = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate()
  return sameDay ? hm : `${at.getMonth() + 1}/${at.getDate()} ${hm}`
}

const FULL_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

/** 全体の書式 `YYYY/MM/DD HH:mm:ss` (ローカル)。 */
export function formatMessageTimeFull(ms: number): string {
  const parts = new Map(FULL_FORMAT.formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.get(type) ?? ''
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

/** ターンの所要時間。秒は切り捨て。3,600 秒未満は `所要 {m}:{ss}`、以上は `所要 {h}:{mm}:{ss}`。 */
export function formatTurnDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const clock = h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
  return `${TURN_DURATION_LABEL} ${clock}`
}
