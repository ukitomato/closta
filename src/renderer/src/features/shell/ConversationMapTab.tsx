import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'

import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'

import { activityBins, type ActivityBin } from '@/features/chat/activity-bins'
import { useCenterConversation } from '@/features/chat/center-conversation'
import { SYSTEM_EVENT_CATEGORY_LABELS } from '@/features/chat/labels'
import { formatMessageTime, formatTurnDuration } from '@/features/chat/message-time'
import type { Turn } from '@/features/chat/turns'

import { CONVERSATION_MAP_LABELS, turnRowName } from './labels'
import { useThrottledConversation } from './useThrottledConversation'

/**
 * 右のペインの「会話の地図」のタブ (O-9 / 017 data-model §3 / §6「地図のタブ」。spec FR-008〜FR-011)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 値は中央の会話の公開口 (`center-conversation.ts`) から読む。過去ログを取得し直さない | AD-034 / data-model §6 |
 * | 購読した値は前縁と後縁で 500ms に 1 回までに間引く。会話が替わるときは即時 | research R-12 |
 * | 一覧は `@tanstack/react-virtual` で仮想化 (overscan 8)。フォーカスのある行は範囲の外でも常に描く | data-model §6 / RK-08 |
 * | roving tabindex。↑↓・PageUp / PageDown・Home / End。IME の変換中のキーは無視 (Enter / Space も) | Principle VIII |
 * | 行を選ぶと `navigateTo(ターンの id)` (O-3 と同じ経路)。フォーカスは地図に残し、`aria-current` は最後に地図から移った行だけ | US-2 AC1〜AC3 |
 * | フォーカスと選んだ行は行の id で覚え、行が消えたら同じ番号か直前の行 | data-model §6 |
 * | 入力の先頭は React の text として描く (HTML として解釈しない) | data-model §3 |
 */

/** 地図の更新の間引き (research R-12)。 */
export const CONVERSATION_MAP_THROTTLE_MS = 500
const ROW_HEIGHT = 56
const OVERSCAN = 8

/** id と、消えたときの代わりの番号 (同じ番号か直前の行)。`key` は会話 (切り替えで無効にする)。 */
interface RowMark {
  readonly key: string
  readonly id: string
  readonly index: number
}

function isComposing(event: ReactKeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

export function ConversationMapTab(): React.JSX.Element {
  const published = useCenterConversation()
  const { value, now } = useThrottledConversation(published, CONVERSATION_MAP_THROTTLE_MS)
  // 間引き後の値で区間を作る (FE-022 の間引きの後。メッセージの数に比例する 1 回の走査)。
  const messages = value?.messages
  const bins = useMemo(() => (messages === undefined ? [] : activityBins(messages)), [messages])
  if (value === null) {
    return (
      <p className="text-muted-foreground p-3 text-sm" data-testid="conversation-map-empty">
        {CONVERSATION_MAP_LABELS.emptyNoConversation}
      </p>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ActivityBand
        key={value.conversationKey}
        bins={bins}
        navigateTo={value.navigateTo}
        now={now}
      />
      <TurnList
        conversationKey={value.conversationKey}
        turns={value.turns}
        navigateTo={value.navigateTo}
        now={now}
      />
    </div>
  )
}

/** 濃さ 0〜4 の棒の高さ (色だけに頼らない。WCAG 1.4.1) と、テーマのトークンの不透明度 (FR-013)。 */
const BIN_BAR_CLASS = [
  'h-1 bg-muted',
  'h-2 bg-primary/25',
  'h-4 bg-primary/50',
  'h-6 bg-primary/75',
  'h-8 bg-primary'
] as const

/** 活動の帯 (O-9 US-3 / data-model §6「活動の帯」)。区間が無いときは空の状態の文言。 */
function ActivityBand({
  bins,
  navigateTo,
  now
}: {
  readonly bins: readonly ActivityBin[]
  readonly navigateTo: (messageId: string) => void
  readonly now: number
}): React.JSX.Element {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(0)
  if (bins.length === 0) {
    return (
      <p
        className="text-muted-foreground shrink-0 p-3 text-sm"
        data-testid="conversation-map-band-empty"
      >
        {CONVERSATION_MAP_LABELS.bandEmpty}
      </p>
    )
  }
  const last = bins.length - 1
  const tabbable = Math.min(active, last)
  const moveTo = (index: number): void => {
    const clamped = Math.max(0, Math.min(last, index))
    setActive(clamped)
    buttonsRef.current[clamped]?.focus()
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (isComposing(event)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        moveTo(index + 1)
        return
      case 'ArrowLeft':
        event.preventDefault()
        moveTo(index - 1)
        return
      case 'Home':
        event.preventDefault()
        moveTo(0)
        return
      case 'End':
        event.preventDefault()
        moveTo(last)
        return
      default:
    }
  }
  return (
    <div
      role="toolbar"
      aria-label={CONVERSATION_MAP_LABELS.band}
      aria-orientation="horizontal"
      className="flex h-10 shrink-0 items-end gap-px border-b p-1"
      data-testid="conversation-map-band"
    >
      {bins.map((bin) => {
        const disabled = bin.targetId === null
        return (
          <button
            key={bin.index}
            ref={(el) => {
              buttonsRef.current[bin.index] = el
            }}
            type="button"
            data-bin-index={bin.index}
            tabIndex={bin.index === tabbable ? 0 : -1}
            aria-label={CONVERSATION_MAP_LABELS.binName(
              formatMessageTime(bin.start, now),
              formatMessageTime(bin.end, now),
              bin.activity
            )}
            aria-disabled={disabled ? 'true' : undefined}
            className="focus-visible:ring-ring flex h-full min-w-0 flex-1 items-end outline-none focus-visible:ring-2"
            onFocus={() => setActive(bin.index)}
            onClick={() => {
              if (bin.targetId !== null) navigateTo(bin.targetId)
            }}
            onKeyDown={(event) => onKeyDown(event, bin.index)}
          >
            <span className={`w-full rounded-sm ${BIN_BAR_CLASS[bin.level]}`} />
          </button>
        )
      })}
    </div>
  )
}

function TurnList({
  conversationKey,
  turns,
  navigateTo,
  now
}: {
  readonly conversationKey: string
  readonly turns: readonly Turn[]
  readonly navigateTo: (messageId: string) => void
  readonly now: number
}): React.JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const [activeMark, setActiveMark] = useState<RowMark | null>(null)
  const [currentMark, setCurrentMark] = useState<RowMark | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)

  // roving tabindex の行: 覚えた行 (id)。消えていれば同じ番号か直前の行。無ければ aria-current の行、それも無ければ先頭。
  const last = turns.length - 1
  const current = currentMark?.key === conversationKey ? currentMark : null
  const currentIndex = current === null ? -1 : turns.findIndex((t) => t.id === current.id)
  const active = activeMark?.key === conversationKey ? activeMark : null
  let activeIndex = 0
  if (active !== null) {
    const found = turns.findIndex((t) => t.id === active.id)
    activeIndex = found !== -1 ? found : Math.min(active.index, last)
  } else if (currentIndex !== -1) {
    activeIndex = currentIndex
  }
  if (activeIndex < 0) activeIndex = 0

  // フォーカスのある (tabbable な) 行は範囲の外でも描く (RK-08)。
  const rangeExtractor = useCallback(
    (range: Range): number[] => {
      const base = defaultRangeExtractor(range)
      if (activeIndex < range.count && !base.includes(activeIndex)) {
        base.push(activeIndex)
        base.sort((a, b) => a - b)
      }
      return base
    },
    [activeIndex]
  )

  // react-virtual は memo 化できない関数を返す (thread.aui.tsx と同じ既知の制約)。
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: turns.length,
    getItemKey: (index) => turns[index]?.id ?? index,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollerRef.current,
    initialRect: { height: 400, width: 300 },
    overscan: OVERSCAN,
    rangeExtractor
  })

  // キー操作で動かした行へフォーカスを移す (行は rangeExtractor で必ず描かれている)。
  const focusActiveRow = useEffectEvent(() => {
    const id = turns[activeIndex]?.id
    const list = listRef.current
    if (id === undefined || list === null) return
    // id をセレクタに埋め込まず、`dataset` で照合する (CWE-74。`findMessageElement` と同じ)。
    const buttons = list.querySelectorAll<HTMLElement>('[data-turn-id]')
    for (let i = 0; i < buttons.length; i += 1) {
      if (buttons[i]?.dataset.turnId === id) {
        buttons[i]?.focus()
        return
      }
    }
  })
  useEffect(() => {
    if (focusRequest !== 0) focusActiveRow()
  }, [focusRequest])

  const moveTo = (index: number): void => {
    const clamped = Math.max(0, Math.min(last, index))
    const turn = turns[clamped]
    if (turn === undefined) return
    setActiveMark({ key: conversationKey, id: turn.id, index: clamped })
    virtualizer.scrollToIndex(clamped)
    setFocusRequest((n) => n + 1)
  }

  const activate = (index: number): void => {
    const turn = turns[index]
    if (turn === undefined) return
    setActiveMark({ key: conversationKey, id: turn.id, index })
    setCurrentMark({ key: conversationKey, id: turn.id, index })
    navigateTo(turn.id)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    // 変換中のキーは何もしない (`preventDefault` もしない。Principle VIII)。
    if (isComposing(event)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const range = virtualizer.range
    const page = range === null ? 1 : Math.max(1, range.endIndex - range.startIndex)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveTo(index + 1)
        return
      case 'ArrowUp':
        event.preventDefault()
        moveTo(index - 1)
        return
      case 'PageDown':
        event.preventDefault()
        moveTo(index + page)
        return
      case 'PageUp':
        event.preventDefault()
        moveTo(index - page)
        return
      case 'Home':
        event.preventDefault()
        moveTo(0)
        return
      case 'End':
        event.preventDefault()
        moveTo(last)
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        activate(index)
        return
      default:
    }
  }

  if (turns.length === 0) {
    return (
      <p className="text-muted-foreground p-3 text-sm" data-testid="conversation-map-no-turns">
        {CONVERSATION_MAP_LABELS.emptyNoTurns}
      </p>
    )
  }

  return (
    <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto" data-testid="conversation-map">
      <ol
        ref={listRef}
        aria-label={CONVERSATION_MAP_LABELS.list}
        className="relative m-0 w-full list-none p-0"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const turn = turns[item.index]
          if (turn === undefined) return null
          return (
            <li
              key={item.key}
              aria-setsize={turns.length}
              aria-posinset={item.index + 1}
              className="absolute top-0 left-0 w-full"
              style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
            >
              <TurnRow
                turn={turn}
                now={now}
                tabbable={item.index === activeIndex}
                isCurrent={item.index === currentIndex}
                onFocus={() =>
                  setActiveMark({ key: conversationKey, id: turn.id, index: item.index })
                }
                onClick={() => activate(item.index)}
                onKeyDown={(event) => onKeyDown(event, item.index)}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function TurnRow({
  turn,
  now,
  tabbable,
  isCurrent,
  onFocus,
  onClick,
  onKeyDown
}: {
  readonly turn: Turn
  readonly now: number
  readonly tabbable: boolean
  readonly isCurrent: boolean
  readonly onFocus: () => void
  readonly onClick: () => void
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  const time = turn.startedAt === null ? null : formatMessageTime(turn.startedAt, now)
  const duration = turn.durationMs === null ? null : formatTurnDuration(turn.durationMs)
  const marks = turn.marks.map((mark) => SYSTEM_EVENT_CATEGORY_LABELS[mark])
  const name = turnRowName({
    time,
    head: turn.head,
    duration,
    toolCount: turn.toolCount,
    errorCount: turn.errorCount,
    marks
  })
  return (
    <button
      type="button"
      data-turn-id={turn.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={name}
      aria-current={isCurrent ? 'true' : undefined}
      className="hover:bg-accent focus-visible:ring-ring aria-[current=true]:bg-accent flex h-full w-full flex-col justify-center gap-0.5 px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
      onFocus={onFocus}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        // Space の離した時の click を出さない (活性化は keydown で済ませる)。
        if (event.key === ' ') event.preventDefault()
      }}
    >
      <span className="truncate">{turn.head}</span>
      <span className="text-muted-foreground flex min-w-0 gap-2 text-xs">
        {time !== null && <span>{time}</span>}
        {duration !== null && <span>{duration}</span>}
        {turn.toolCount > 0 && <span>{CONVERSATION_MAP_LABELS.toolCount(turn.toolCount)}</span>}
        {turn.errorCount > 0 && <span>{CONVERSATION_MAP_LABELS.errorCount(turn.errorCount)}</span>}
        {marks.map((mark) => (
          <span key={mark}>{mark}</span>
        ))}
      </span>
    </button>
  )
}
