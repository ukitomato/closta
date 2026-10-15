import { useEffect, useRef, useState } from 'react'

import { useAuiState } from '@assistant-ui/react'

import {
  collectAnnouncements,
  composeAnnouncement,
  type Announcement,
  type AnnounceableMessage
} from './transcript-announcements'

/**
 * 見ているセッションの transcript に新しく起きた出来事の読み上げ (O-6 / FE-031 / 016 data-model §4「読み上げ」)。
 * 見ているセッション (`watchedId`) の thread の中に 1 つだけ置く (過去ログには置かない)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `aria-live="polite"`。1 秒に 1 回までにまとめる (複数なら件数の文) | data-model §4 |
 * | 描画した時点の出来事を基準に、差分だけを読む。最初の描画・「さらに表示」で現れた古いメッセージは読まない | 同上 |
 * | 文は固定の文言・既知の列挙・件数だけ (`content`・説明・`prompt`・パス・Hook 名を入れない) | 同上 |
 * | O-7 の `SessionAttentionAnnouncer`・`SessionScreen` の `role="alert"`・承認カードの `alertdialog` と重ねない | 同上 |
 */

const THROTTLE_MS = 1000

export function TranscriptAnnouncer(): React.JSX.Element {
  const messages = useAuiState((s) => s.thread.messages) as readonly AnnounceableMessage[]
  const [announcement, setAnnouncement] = useState<{ readonly seq: number; readonly text: string }>(
    {
      seq: 0,
      text: ''
    }
  )

  const seenRef = useRef<Set<string> | null>(null)
  const previousIdsRef = useRef<readonly string[]>([])
  const queueRef = useRef<Announcement[]>([])
  const lastFlushRef = useRef<number>(Number.NEGATIVE_INFINITY)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    const flush = (): void => {
      timerRef.current = null
      const text = composeAnnouncement(queueRef.current)
      queueRef.current = []
      if (text === '') return
      lastFlushRef.current = Date.now()
      seqRef.current += 1
      setAnnouncement({ seq: seqRef.current, text })
    }

    const items = collectAnnouncements(messages)
    const ids = messages.map((m) => m.id)
    const previousIds = previousIdsRef.current
    previousIdsRef.current = ids

    // 最初の描画と、空の thread に最初のメッセージが載った (読み込み) ときは、基準にするだけで読まない。
    if (seenRef.current === null || previousIds.length === 0) {
      const seen = seenRef.current ?? new Set<string>()
      for (const item of items) seen.add(item.key)
      seenRef.current = seen
      return
    }

    const seen = seenRef.current
    const previousSet = new Set(previousIds)
    const firstKnown = previousIds[0]
    const firstKnownIndex = firstKnown === undefined ? -1 : ids.indexOf(firstKnown)
    const fresh: Announcement[] = []
    for (const item of items) {
      if (seen.has(item.key)) continue
      seen.add(item.key)
      // 既知の最初のメッセージより前に新しく現れたもの (「さらに表示」で読み込んだ古いメッセージ) は読まない。
      if (!previousSet.has(item.messageId) && ids.indexOf(item.messageId) < firstKnownIndex)
        continue
      fresh.push(item)
    }
    if (fresh.length === 0) return
    queueRef.current.push(...fresh)
    if (timerRef.current !== null) return
    const wait = Math.max(0, lastFlushRef.current + THROTTLE_MS - Date.now())
    if (wait === 0) flush()
    else timerRef.current = setTimeout(flush, wait)
  }, [messages])

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    []
  )

  return (
    <div data-slot="transcript-announcer" aria-live="polite" aria-atomic="true" className="sr-only">
      <span key={announcement.seq}>{announcement.text}</span>
    </div>
  )
}
