import { useEffect, useState } from 'react'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'

import type { FailureReason } from '@domain/session/target'

import { EmptyState, EmptyStateGreeting } from '@/components/assistant-ui/elements/empty-state'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'

import { useTranscript } from './useTranscript'

/**
 * 選んだセッションの過去 transcript を assistant-ui で表示する画面 (R-3 / FE-032)。
 *
 * ランタイムは AD-023 の決定どおり `useExternalStoreRuntime`。過去ログを
 * `getSessionMessages()` から取り (R-3 / AD-034)、`ThreadMessageLike` に変換して流し込む。
 *
 * **composer の送信経路は閉じたまま (`isDisabled: true`)** — 本 feature は過去ログの表示であり
 * 送信しない。送信は X-1、IME ガードと E2E は X-2 が載せる
 * (Principle VIII / [AD-024](../../../../docs/decisions/0024-constitution-verification-paths.md) #18)。
 * この前提を `ChatScreen.test.tsx` が守る。
 */

/**
 * 失敗理由を transcript 文脈の日本語にする (US-1 AC-4 / FR-013)。
 *
 * **R-2 の列挙語彙 (`FailureReason`) を再利用しているが、transcript 向けの文言に写す** —
 * とくに `enumeration-failed` を「列挙に失敗」と出さない (transcript は列挙ではない。code-gate L-001)。
 * 理由専用の `FailureReason` 値を切るかは architecture と調整する follow-up。
 */
function transcriptFailureDetail(reasonKey: FailureReason | null): string {
  const detail: Partial<Record<FailureReason, string>> = {
    'distro-not-running':
      'この所在 (WSL ディストロ) が停止しています。起動してから再取得してください。',
    'wsl-unavailable': 'WSL を利用できないため履歴を読めませんでした。',
    'permission-denied': '履歴ファイルへのアクセスが拒否されました。',
    'path-too-long': 'パスが長すぎて履歴を読めませんでした。',
    'stopped-midway': '読み取りが途中で打ち切られました。再取得してください。',
    'enumeration-failed': '履歴を読み込めませんでした。'
  }
  return reasonKey === null
    ? '履歴を読み込めませんでした。再取得してください。'
    : (detail[reasonKey] ?? '履歴を読み込めませんでした。再取得してください。')
}

/** ローダのアニメーション用の tick。取得中だけ回す。 */
function useTick(active: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTick((value) => value + 1), 90)
    return () => clearInterval(timer)
  }, [active])
  return tick
}

export function ChatScreen(): React.JSX.Element {
  const { messages, status, reasonKey, retry, hasSelection } = useTranscript()
  const tick = useTick(status === 'loading')

  const runtime = useExternalStoreRuntime({
    messages: messages as ThreadMessageLike[],
    isRunning: false,
    /** **スレッド全体を無効にする。** composer の入力・添付・送信がすべて閉じる (FR-014)。 */
    isDisabled: true,
    convertMessage: (message) => message,
    onNew: () => {
      /* **到達しない。** `isDisabled: true` が送信を閉じている。退行を黙らせないため throw する。 */
      throw new Error('composer は R-3 では無効である (isDisabled が効いていない)')
    }
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hasSelection ? (
        <Centered>
          <EmptyState>
            <EmptyStateGreeting>セッションを選ぶと会話が表示されます</EmptyStateGreeting>
          </EmptyState>
        </Centered>
      ) : status === 'failed' ? (
        <Centered>
          <ErrorState
            title="transcript を取得できませんでした"
            detail={transcriptFailureDetail(reasonKey)}
            retrying={false}
            onRetry={retry}
            retryLabel="再取得"
            retryingLabel="再取得中"
          />
        </Centered>
      ) : status === 'loading' ? (
        <Centered>
          <GenerationLoader label="transcript を読み込み中…" tick={tick} />
        </Centered>
      ) : status === 'empty' ? (
        <Centered>
          <EmptyState>
            <EmptyStateGreeting>このセッションにはメッセージがありません</EmptyStateGreeting>
          </EmptyState>
        </Centered>
      ) : (
        <AssistantRuntimeProvider runtime={runtime}>
          <div className="min-h-0 flex-1">
            <Thread />
          </div>
        </AssistantRuntimeProvider>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="flex min-h-0 flex-1 items-center justify-center p-6">{children}</div>
}
