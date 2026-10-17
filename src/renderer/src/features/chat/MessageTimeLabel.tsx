import { useState } from 'react'

import { useAuiState } from '@assistant-ui/react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { useTurnDuration } from './conversation-time-context'
import { MESSAGE_TIME_LABELS } from './labels'
import {
  formatMessageTime,
  formatMessageTimeFull,
  formatTurnDuration,
  readMessageTimeOf
} from './message-time'

/**
 * メッセージの時刻 (と、ターンの始まりなら所要時間) (O-9 FR-006 / FR-007 / data-model §6「中央の時刻と所要時間」)。
 *
 * - 時刻は `metadata.custom.createdAt` だけを読む。無ければ要素を作らない (今と同じ表示)
 * - `<time dateTime>` に短い書式。`tabIndex={0}` で hover と focus のときに全体の書式を Tooltip で出す。支援技術の名前は全体の書式
 * - data part だけのメッセージ (過去ログの境界の divider) には出さない
 * - `now` は表示の時点で 1 回だけ取る (描画ごとに時計を読まない)
 */
export function MessageTimeLabel({
  withDuration = false,
  className
}: {
  /** 利用者のメッセージ: ターンの所要時間を添える。 */
  readonly withDuration?: boolean
  readonly className?: string
}): React.JSX.Element | null {
  const id = useAuiState((s) => s.message.id)
  const createdAt = useAuiState((s) => readMessageTimeOf(s.message.metadata?.custom))
  const hasBody = useAuiState((s) => s.message.content.some((part) => part.type !== 'data'))
  const duration = useTurnDuration(withDuration ? id : undefined)
  const [now] = useState(() => Date.now())
  if (createdAt === null || !hasBody) return null

  const full = formatMessageTimeFull(createdAt)
  return (
    <span
      data-slot="message-time"
      className={cn('text-muted-foreground inline-flex items-center gap-1 text-xs', className)}
    >
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <time dateTime={new Date(createdAt).toISOString()} tabIndex={0}>
              <span aria-hidden="true">{formatMessageTime(createdAt, now)}</span>
              <span className="sr-only">{`${MESSAGE_TIME_LABELS.fullPrefix} ${full}`}</span>
            </time>
          </TooltipTrigger>
          <TooltipContent>{full}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {duration !== null && (
        <>
          <span aria-hidden="true">·</span>
          <span data-slot="turn-duration">{formatTurnDuration(duration)}</span>
        </>
      )}
    </span>
  )
}
