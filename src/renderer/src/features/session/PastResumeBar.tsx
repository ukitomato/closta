import { useEffect, useId, useState } from 'react'

import { CAPABILITY_KEY, type PastResumeDTO } from '@domain/capability'

import { Button } from '@/components/ui/button'
import { useUiStore, type FolderDraftSeed } from '@/stores/ui'

import { RESUME_LABELS, RESUME_UNAVAILABLE_LABELS } from './labels'
import { useRunningSessionStoreApi } from './running-session-context'

/**
 * **過去の行の「再開」の帯** (X-9 / FE-012 / data-model §9.1・§9.2)。中央の過去ログの画面 (`PastCenter`) の本文の下に置く。
 * 中央のヘッダ (`CenterHeader`) には置かない (ヘッダに操作を置かない規則)。
 *
 * - 過去の行を選ぶたびに `resolvePastResume` を **1 回**呼ぶ (一覧の全行には呼ばない)。選び直したら古い答えを捨てる
 * - `ok: true` で押せる「再開」。押すと再開の形の起動ダイアログを開く (source = 過去の行・`fixed` = 答えの 3 つの id)
 * - `ok: false` で押せない「再開」と理由 (`aria-describedby` で結ぶ)。`folder-unregistered` だけ「作業フォルダとして登録」を並べる
 * - 取得中は押せない「再開」(理由は出さない)
 *
 * 会話の id は DOM に出さない (値は起動ダイアログの状態に運ぶだけ)。
 */

type Answer =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly result: PastResumeDTO }

export function PastResumeBar({
  targetKey,
  conversationId,
  registerSeed
}: {
  readonly targetKey: string
  readonly conversationId: string
  /** 登録フォルダの初期値 (`registerSeedOf`)。`folder-unregistered` のときだけ使う。 */
  readonly registerSeed: FolderDraftSeed | null
}): React.JSX.Element {
  const store = useRunningSessionStoreApi()
  const setLaunchOpen = useUiStore((s) => s.setLaunchOpen)
  const seedFolderDraft = useUiStore((s) => s.seedFolderDraft)
  const reasonId = useId()
  const key = `${targetKey}|${conversationId}`
  const [answer, setAnswer] = useState<{ readonly key: string; readonly value: Answer } | null>(
    null
  )

  useEffect(() => {
    let cancelled = false
    window[CAPABILITY_KEY]
      .resolvePastResume(targetKey, conversationId)
      .then((result) => {
        if (!cancelled) setAnswer({ key, value: { status: 'ready', result } })
      })
      .catch(() => {
        if (!cancelled)
          setAnswer({
            key,
            value: { status: 'ready', result: { ok: false, reason: 'source-unknown' } }
          })
      })
    return () => {
      cancelled = true
    }
  }, [key, targetKey, conversationId])

  // 選び直した直後は、前の行の答えを出さず取得中として描く。
  const current: Answer = answer !== null && answer.key === key ? answer.value : { status: 'loading' }
  const result = current.status === 'ready' ? current.result : null
  const reason = result !== null && !result.ok ? result.reason : null

  const open = (): void => {
    if (result === null || !result.ok) return
    store.openResume({
      source: { kind: 'past', targetKey, conversationId },
      fixed: {
        folderId: result.folderId,
        runtimeId: result.runtimeId,
        providerId: result.providerId
      },
      initial: null,
      initialOrigin: 'manual',
      replaces: null
    })
    setLaunchOpen(true)
  }

  return (
    <div
      role="group"
      aria-label={RESUME_LABELS.barLabel}
      className="border-border flex flex-wrap items-center gap-2 border-t px-4 py-2"
      data-testid="past-resume-bar"
    >
      <Button
        type="button"
        size="sm"
        disabled={result === null || !result.ok}
        aria-describedby={reason !== null ? reasonId : undefined}
        onClick={open}
      >
        {RESUME_LABELS.action}
      </Button>
      {reason !== null && (
        <p id={reasonId} className="text-muted-foreground flex-1 text-sm" data-testid="past-resume-reason">
          {RESUME_UNAVAILABLE_LABELS[reason]}
        </p>
      )}
      {reason === 'folder-unregistered' && registerSeed !== null && (
        <Button type="button" variant="outline" size="sm" onClick={() => seedFolderDraft(registerSeed)}>
          作業フォルダとして登録
        </Button>
      )}
    </div>
  )
}
