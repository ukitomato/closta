import type { TranscriptPartDTO } from '@domain/session/transcript-dto'

import { isSystemEventFields } from './transcript-guard'
import { ANNOUNCER_LABELS, SYSTEM_EVENT_STATUS_LABELS } from './labels'

/**
 * 読み上げの対象の取り出しと文の組み立て (O-6 / FE-031 / 016 data-model §4「読み上げ」)。純関数。
 *
 * - 読むもの: tool の結果のエラー、圧縮・会話の作り直し・拒否の行、`prevented` の知らせ、Hook / task の行が終わりの状態に
 *   なったこと
 * - 読まないもの: 結果不明 (記録に終わりが来ないだけで、データは変わらない)、承認、O-4 / O-5 の行、`notice` / `warning`
 * - 中身は固定の文言・既知の列挙・件数だけ。tool 名は `^[A-Za-z0-9_-]{1,64}$` に合うときだけ出す
 */

export type AnnouncementKind = 'tool-error' | 'hook-end' | 'task-end' | 'other'

export interface Announcement {
  /** 同じ出来事を二重に読まないための鍵。 */
  readonly key: string
  readonly messageId: string
  readonly kind: AnnouncementKind
  /** 1 件のときの文。 */
  readonly sentence: string
}

/** thread のメッセージのうち、ここで読む形 (assistant-ui の `ThreadMessage` の部分)。 */
export interface AnnounceableMessage {
  readonly id: string
  readonly content: unknown
}

const SAFE_TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/

const ENDED_STATUSES: ReadonlySet<string> = new Set([
  'failed',
  'killed',
  'stopped',
  'completed',
  'succeeded',
  'cancelled'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toolDisplayName(name: unknown): string {
  return typeof name === 'string' && SAFE_TOOL_NAME.test(name) ? name : ANNOUNCER_LABELS.unknownTool
}

function rowAnnouncement(messageId: string, data: RowFields | null): Announcement | null {
  if (data === null) return null
  const { category, status } = data
  const make = (key: string, kind: AnnouncementKind, sentence: string): Announcement => ({
    key: `row:${messageId}:${key}`,
    messageId,
    kind,
    sentence
  })
  switch (category) {
    case 'compact-boundary':
      return make('boundary', 'other', ANNOUNCER_LABELS.compactBoundary)
    case 'conversation-reset':
      return make('reset', 'other', ANNOUNCER_LABELS.conversationReset)
    case 'refusal':
      return make('refusal', 'other', ANNOUNCER_LABELS.refusal)
    case 'informational':
      return status === 'prevented' ? make('prevented', 'other', ANNOUNCER_LABELS.prevented) : null
    case 'hook':
    case 'task': {
      if (status === null || !ENDED_STATUSES.has(status)) return null
      const label = SYSTEM_EVENT_STATUS_LABELS[status]
      return category === 'hook'
        ? make(`hook:${status}`, 'hook-end', ANNOUNCER_LABELS.hookEnded(label))
        : make(`task:${status}`, 'task-end', ANNOUNCER_LABELS.taskEnded(label))
    }
    default:
      return null
  }
}

type RowFields = Omit<Extract<TranscriptPartDTO, { type: 'system-event' }>, 'type'>

function readRow(part: Record<string, unknown>): RowFields | null {
  if (part.type !== 'data' || part.name !== 'system-event') return null
  return isSystemEventFields(part.data) ? part.data : null
}

/** メッセージの列から、今読む対象になりうる出来事を全部取り出す (差分は呼び出し側が取る)。 */
export function collectAnnouncements(
  messages: readonly AnnounceableMessage[]
): readonly Announcement[] {
  const out: Announcement[] = []
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const part of message.content as readonly unknown[]) {
      if (!isRecord(part)) continue
      if (part.type === 'tool-call') {
        if (
          part.isError === true &&
          part.result !== undefined &&
          typeof part.toolCallId === 'string'
        ) {
          out.push({
            key: `tool:${part.toolCallId}`,
            messageId: message.id,
            kind: 'tool-error',
            sentence: ANNOUNCER_LABELS.toolError(toolDisplayName(part.toolName))
          })
        }
        continue
      }
      const row = rowAnnouncement(message.id, readRow(part))
      if (row !== null) out.push(row)
    }
  }
  return out
}

/** 同じ 1 秒にまとめた出来事から文を作る。 */
export function composeAnnouncement(events: readonly Announcement[]): string {
  if (events.length === 0) return ''
  if (events.length === 1) return events[0]?.sentence ?? ''
  if (events.every((e) => e.kind === 'tool-error'))
    return ANNOUNCER_LABELS.toolErrors(events.length)
  return ANNOUNCER_LABELS.mixed(events.length)
}
