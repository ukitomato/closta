import type { Page } from '@playwright/test'

/**
 * 入力の滑らかさの計測 (X-5 SC-003 の定義。O-1 SH-030 で `e2e/multi-session.spec.ts` から切り出した)。
 * E2E (偽の supervisor 接続) と実機計測 (`perf/real-sessions.spec.ts`) で**同じ定義**を使う。
 *
 * - long task: PerformanceObserver の `longtask` のうち 50ms 超
 * - 入力遅延: `keydown` の timeStamp から、値が反映された後の最初の `requestAnimationFrame` まで
 *
 * 計測は renderer の `page.evaluate` だけで仕込む (main の文脈を使わない)。会話由来の値を読まない。
 */

interface ProbeWindow {
  __longTasks: number[]
  __inputDelays: number[]
}

/** 計測を仕込む。以後の long task と打鍵を記録する。 */
export async function installInputProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as ProbeWindow
    w.__longTasks = []
    w.__inputDelays = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) w.__longTasks.push(entry.duration)
      }
    }).observe({ type: 'longtask' })
    // document の capture で拾う (composer の textarea が再マウントされても計測が外れない)。
    let pending: number | null = null
    document.addEventListener('keydown', (e) => (pending = e.timeStamp), true)
    document.addEventListener(
      'input',
      () => {
        const start = pending
        if (start === null) return
        pending = null
        requestAnimationFrame(() => w.__inputDelays.push(performance.now() - start))
      },
      true
    )
  })
}

/** 打鍵を続ける (10 文字打って消す、を `durationMs` の間繰り返す)。composer にフォーカスがある前提。 */
export async function typeContinuously(page: Page, durationMs: number): Promise<void> {
  const until = Date.now() + durationMs
  while (Date.now() < until) {
    await page.keyboard.type('abcdefghij', { delay: 40 })
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
  }
}

export interface InputProbeResult {
  readonly inputDelayP95: number
  readonly inputSamples: number
  readonly longTaskMax: number
  readonly longTaskCount: number
}

/** 記録を集計する (p95・long task の最大と件数)。 */
export async function collectInputProbe(page: Page): Promise<InputProbeResult> {
  const { longTasks, inputDelays } = await page.evaluate(() => {
    const w = window as unknown as ProbeWindow
    return { longTasks: w.__longTasks, inputDelays: w.__inputDelays }
  })
  const sorted = [...inputDelays].sort((a, b) => a - b)
  return {
    inputDelayP95: sorted[Math.floor(sorted.length * 0.95)] ?? Number.POSITIVE_INFINITY,
    inputSamples: inputDelays.length,
    longTaskMax: Math.max(0, ...longTasks),
    longTaskCount: longTasks.length
  }
}

/** X-5 SC-003 の閾値 (入力遅延 p95 ≤ 50ms・long task の最大 < 100ms。件数は記録のみ)。 */
export const INPUT_DELAY_P95_MAX_MS = 50
export const LONG_TASK_MAX_MS = 100

export function describeProbe(result: InputProbeResult): string {
  return `longTasks=${result.longTaskCount} (max ${result.longTaskMax.toFixed(1)}ms) inputDelay.p95=${result.inputDelayP95.toFixed(1)}ms n=${result.inputSamples}`
}
