import { useEffect, useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  createMessageQueue,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike
} from '@assistant-ui/react'

/**
 * X-2 / FR-004 / FR-005 / T011・T012 — native message queue の実挙動を経験的に固定する。
 *
 * - 実行中 (isRunning) の送信は runtime の `append` が **steer lane** (`adapter.steerItems`) に回す
 *   (`message.steer ?? isRunning`)。`ComposerPrimitive.Queue` の表示ソース `composer.queue` (queue lane `items`) には
 *   出ない → **実行中 pending の可視化は steer lane を別途表示する必要がある** (LivePane の PendingQueueNotice。研究 R-02 修正案(a))。
 * - 現ターン完了 (isRunning→false で notifyIdle) で dispatch (driver.run) される (次ターン送信。FR-005)。
 * - `driver.cancel` を渡さないため実行中送信は割り込まない (interrupt→steer しない。FR-005)。
 */

function textOf(message: AppendMessage): string {
  return message.content.map((p) => (p.type === 'text' ? p.text : '')).join('')
}

/* テストから composer を操作し pending を観測するための capture (const オブジェクトを effect で更新)。 */
const cap: { aui: ReturnType<typeof useAui> | null; composerQueueLen: number } = {
  aui: null,
  composerQueueLen: -1
}
function Capture(): null {
  const aui = useAui()
  const qlen = useAuiState((s) => s.composer.queue.length)
  useEffect(() => {
    cap.aui = aui
    cap.composerQueueLen = qlen
  })
  return null
}

function Harness({
  isRunning,
  mq
}: {
  readonly isRunning: boolean
  readonly mq: ReturnType<typeof createMessageQueue>
}): React.JSX.Element {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (m) => m,
    isRunning,
    queue: mq.adapter,
    onNew: async () => {}
  })
  const prev = useRef(false)
  useEffect(() => {
    if (isRunning && !prev.current) mq.notifyBusy()
    else if (!isRunning && prev.current) mq.notifyIdle()
    prev.current = isRunning
  }, [isRunning, mq])
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Capture />
    </AssistantRuntimeProvider>
  )
}

describe('native message queue の挙動 (FR-004 / FR-005 / T011・T012)', () => {
  it('実行中送信は steer lane に載り (composer.queue には出ない)、完了で次ターン dispatch される', async () => {
    const dispatched: string[] = []
    const mq = createMessageQueue({ run: (m) => dispatched.push(textOf(m)) })

    const { rerender } = render(<Harness isRunning={true} mq={mq} />)
    await waitFor(() => expect(cap.aui).not.toBeNull())

    await act(async () => {
      cap.aui!.composer.setText('次の指示')
      cap.aui!.composer.send()
    })
    await new Promise((r) => setTimeout(r, 50))

    // characterization: 実行中送信は steer lane に入る。ComposerPrimitive.Queue の表示ソース composer.queue には出ない。
    expect(mq.adapter.steerItems.length).toBe(1)
    expect(mq.adapter.items.length).toBe(0)
    expect(cap.composerQueueLen).toBe(0)
    expect(dispatched).toEqual([]) // 実行中は dispatch しない (次ターンまで待つ)

    // FR-005: 完了 → notifyIdle → 同一セッションの次ターンとして dispatch される。
    rerender(<Harness isRunning={false} mq={mq} />)
    await waitFor(() => expect(dispatched).toEqual(['次の指示']))
  })

  it('isDisabled (error/killed) では composer 入力が無効化され利用者が送信できない (FR-006 / C-3)', async () => {
    // 終端の「積めない」保証は **UI 側の input 無効化** による (利用者は打てない/送れない)。
    // runtime の isDisabled は programmatic な composer.send() 自体は gate しないため (下の clear テストが補完)、
    // ここでは利用者に露出する DOM の disabled を固定する。
    const mq = createMessageQueue({ run: () => {} })

    const { rerender } = render(<ComposerHarness isRunning={false} isDisabled={true} mq={mq} />)
    expect(screen.getByRole('textbox', { name: 'composer' })).toBeDisabled()

    // 非終端では入力できる (偽の緑でないことの担保)。
    rerender(<ComposerHarness isRunning={false} isDisabled={false} mq={mq} />)
    expect(screen.getByRole('textbox', { name: 'composer' })).toBeEnabled()
  })

  it('終端の clear() で未 dispatch 項目が破棄され次ターンに持ち越さない (R2-M-002 / C-3)', async () => {
    const dispatched: string[] = []
    const mq = createMessageQueue({ run: (m) => dispatched.push(textOf(m)) })

    // 実行中に 1 件積む (steer lane)。
    render(<Harness isRunning={true} mq={mq} />)
    await waitFor(() => expect(cap.aui).not.toBeNull())
    await act(async () => {
      cap.aui!.composer.setText('破棄される入力')
      cap.aui!.composer.send()
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(mq.adapter.steerItems.length).toBe(1)

    // 終端で LiveThread が呼ぶ clear() 相当。未 dispatch を破棄する。
    act(() => mq.clear())
    expect(mq.adapter.steerItems.length).toBe(0)
    expect(mq.adapter.items.length).toBe(0)

    // その後 idle になっても持ち越し dispatch は起きない。
    act(() => mq.notifyIdle())
    await new Promise((r) => setTimeout(r, 50))
    expect(dispatched).toEqual([])
  })

  it('中断 (notifyCancelled) 後は notifyIdle でも dispatch せず still_queued として残る (FR-006 / po-N-001 / po-H-201)', async () => {
    // 中断は notifyCancelled で queue を pause する。続く busy 立下りの notifyIdle が来ても、積んだ入力は
    // dispatch されず steer lane に残る (= still_queued。次の send まで drain 再開しない)。RunningSessionsProvider の中断が
    // notifyCancelled → interrupt を単一 locus で呼ぶことの土台となる native 挙動を固定する。
    const dispatched: string[] = []
    const mq = createMessageQueue({ run: (m) => dispatched.push(textOf(m)) })

    const { rerender } = render(<Harness isRunning={true} mq={mq} />)
    await waitFor(() => expect(cap.aui).not.toBeNull())
    await act(async () => {
      cap.aui!.composer.setText('中断で残す入力')
      cap.aui!.composer.send()
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(mq.adapter.steerItems.length).toBe(1)

    // 中断: notifyCancelled で pause。その後 busy 立下り (isRunning=false) で Harness の effect が notifyIdle を呼ぶ。
    act(() => mq.notifyCancelled())
    rerender(<Harness isRunning={false} mq={mq} />)
    await new Promise((r) => setTimeout(r, 50))

    // dispatch されず steer lane に残る = still_queued 維持 (中断で誤 dispatch しない)。
    expect(dispatched).toEqual([])
    expect(mq.adapter.steerItems.length).toBe(1)
  })
})

/** composer 入力の DOM disabled を観測するためのハーネス (isDisabled の UI 反映を見る)。 */
function ComposerHarness({
  isRunning,
  isDisabled,
  mq
}: {
  readonly isRunning: boolean
  readonly isDisabled: boolean
  readonly mq: ReturnType<typeof createMessageQueue>
}): React.JSX.Element {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (m) => m,
    isRunning,
    isDisabled,
    queue: mq.adapter,
    onNew: async () => {}
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerPrimitive.Root>
        <ComposerPrimitive.Input aria-label="composer" />
      </ComposerPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
