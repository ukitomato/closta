import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import {
  SESSION_CLOCK_INTERVAL_MS,
  useSessionClock,
  useSessionClockTicking
} from './useSessionClock'

/** O-1 FE-010 — 監視ビューの時計 (1 つだけ・一覧がマウントされている間だけ動く。research R-03)。 */

afterEach(() => {
  vi.useRealTimers()
})

function Ticker(): null {
  useSessionClockTicking()
  return null
}

function Seconds({ from }: { readonly from: number }): React.JSX.Element {
  const sec = useSessionClock((now) => Math.floor((now - from) / 1000))
  return <span data-testid="sec">{sec}</span>
}

describe('useSessionClock', () => {
  it('1 秒ごとに進み、selector の値が変わったときだけ表示が変わる', () => {
    vi.useFakeTimers()
    const from = Date.now()
    render(
      <>
        <Ticker />
        <Seconds from={from} />
      </>
    )
    expect(screen.getByTestId('sec')).toHaveTextContent('0')
    act(() => vi.advanceTimersByTime(SESSION_CLOCK_INTERVAL_MS * 3))
    expect(screen.getByTestId('sec')).toHaveTextContent('3')
  })

  it('動かしている部品が全部外れたら止まり、複数の部品が動かしても時計は 1 つ', () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(globalThis, 'setInterval')
    const view = render(
      <>
        <Ticker />
        <Ticker />
      </>
    )
    expect(spy).toHaveBeenCalledTimes(1)
    const clear = vi.spyOn(globalThis, 'clearInterval')
    view.unmount()
    expect(clear).toHaveBeenCalledTimes(1)
  })
})
