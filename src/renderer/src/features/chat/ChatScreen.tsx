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

import { TranscriptSettledContext } from './transcript-context'
import { TranscriptDensityToggle } from './TranscriptDensityToggle'
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
 * transcript の汎用失敗は専用値 `transcript-read-failed` (pr-gate A-M-001。列挙 `enumeration-failed` とは別概念)。
 * 到達可能性系 (`distro-not-running` 等) は `FailureReason` を R-2 と共有するが、**文言は transcript 向けに写す** —
 * とくに列挙語彙を「列挙」と出さない (transcript は列挙ではない)。
 */
function transcriptFailureDetail(reasonKey: FailureReason | null): string {
  const detail: Partial<Record<FailureReason, string>> = {
    'distro-not-running':
      'この所在 (WSL ディストロ) が停止しています。起動してから再取得してください。',
    'wsl-unavailable': 'WSL を利用できないため履歴を読めませんでした。',
    'permission-denied': '履歴ファイルへのアクセスが拒否されました。',
    'path-too-long': 'パスが長すぎて履歴を読めませんでした。',
    'stopped-midway': '読み取りが途中で打ち切られました。再取得してください。',
    // transcript 取得の汎用失敗 (専用値)。
    'transcript-read-failed': '履歴を読み込めませんでした。',
    // 保険: 万一列挙語彙が来ても「列挙」文言を出さない。
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
          {/* retry は即 loading (全画面ローダ) に遷移するため ErrorState の retrying は常に false。
              retryingLabel は描画されないので渡さない (pr-gate P-L-002)。 */}
          <ErrorState
            title="transcript を取得できませんでした"
            detail={transcriptFailureDetail(reasonKey)}
            retrying={false}
            onRetry={retry}
            retryLabel="再取得"
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
          {/* transcript の密度 (O-2 / FR-012)。実行中のペインと同じ部品・同じ値 (FR-013)。 */}
          <div className="border-border flex shrink-0 items-center justify-end border-b px-4 py-2">
            <TranscriptDensityToggle />
          </div>
          <div className="min-h-0 flex-1">
            {/* 過去ログは記録に終わりが無い行を常に「結果不明」で描く (O-2 / FR-009)。 */}
            <TranscriptSettledContext.Provider value>
              <Thread />
            </TranscriptSettledContext.Provider>
          </div>
        </AssistantRuntimeProvider>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="flex min-h-0 flex-1 items-center justify-center p-6">{children}</div>
}
