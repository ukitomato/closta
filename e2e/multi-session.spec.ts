import { expect, test, type Locator, type Page } from '@playwright/test'

import { launchApp, reachActiveComposer } from './support/launch'

/**
 * X-5 / SH-020・FE-020 — **マルチセッションの E2E** (SC-001 / SC-003 / SC-006)。
 *
 * credential-free (AD-038 D3)。**本物の起動調停** (`createSessionLaunchService`: 上限・制御の宛先・状態通知の受信規則) に
 * fake の supervisor 接続 (`src/main/app/e2e-capability.ts`) を差して動かす (USER 決定 design-gate R1)。
 * supervisor 内部 (スレッド・本文の中継) は通らない — それは supervisor の単体と quickstart が確かめる。
 *
 * 合成プロンプト (e2e-capability.ts): `__e2e_load__` は 20 件/秒・1 件約 1KB の本文を 30 秒流し、`__e2e_big__` は
 * 上限いっぱい (`BODY_MAX_BYTES`) の part を 1 回流す。
 */

const LOAD_PROMPT = '__e2e_load__'
const BIG_PROMPT = '__e2e_big__'

/** 一覧の「新規起動」から、直前の起動設定 (復元済み) のまま起動する。最初の 1 本は reachActiveComposer で作る。 */
async function launchAnother(page: Page): Promise<void> {
  await page.getByRole('button', { name: '新規起動' }).click()
  await page.getByRole('heading', { name: 'セッションを起動' }).waitFor()
  const folder = page.getByRole('combobox', { name: '作業フォルダ' })
  if ((await folder.inputValue()) === '') {
    await folder.selectOption({ index: 1 })
    await page.getByRole('combobox', { name: 'ランタイム (WSL)' }).selectOption({ index: 1 })
  }
  await page.getByRole('button', { name: '起動', exact: true }).click()
}

/** 稼働中セッションの行 (assistant-ui の ThreadList の項目)。 */
function rows(page: Page): Locator {
  return page.locator('[data-slot="aui_thread-list-item"]')
}

/** 行の選択 (ThreadListItem の Trigger = 行の最初のボタン。操作ボタンはその後に並ぶ)。 */
function selectRow(page: Page, index: number): Promise<void> {
  return rows(page).nth(index).getByRole('button').first().click()
}

function sentUserMessages(page: Page, text: string): Locator {
  return page.locator('[data-role="user"]').filter({ hasText: text })
}

async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByRole('textbox', { name: 'Message input' })
  await composer.fill(text)
  await composer.press('Enter')
  await expect(sentUserMessages(page, text)).toHaveCount(1)
}

test.describe('マルチセッション (X-5)', () => {
  test('2 本を起動して切り替え、送信は表示中のセッションにだけ届き、下書きは分かれる (SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachActiveComposer(page)
      await send(page, '一本目への指示')

      await launchAnother(page)
      await expect(rows(page)).toHaveCount(2)
      await page.getByRole('textbox', { name: 'Message input' }).waitFor()
      // 新しいセッションの transcript には 1 本目の発話が無い。
      await expect(sentUserMessages(page, '一本目への指示')).toHaveCount(0)
      await page.getByRole('textbox', { name: 'Message input' }).fill('二本目の下書き')

      // 1 本目へ切り替える: 1 本目の発話と応答が見え、2 本目の下書きは持ち込まれない。
      await selectRow(page, 0)
      await expect(sentUserMessages(page, '一本目への指示')).toHaveCount(1)
      await expect(page.getByText('（E2E stub）受け取りました。')).toHaveCount(1)
      await expect(page.getByRole('textbox', { name: 'Message input' })).toHaveValue('')

      // 2 本目へ戻ると下書きが戻る。
      await selectRow(page, 1)
      await expect(page.getByRole('textbox', { name: 'Message input' })).toHaveValue(
        '二本目の下書き'
      )

      // 行の操作が押せる (操作の段が隣の行に重ならない。実機で見つかった表示崩れの回帰)。応答待ちの 1 本目を終了する。
      await expect(rows(page).nth(0).getByTestId('session-row-status')).toHaveText('応答待ち')
      await rows(page).nth(0).getByRole('button', { name: '終了', exact: true }).click()
      await expect(rows(page).nth(0).getByTestId('session-row-status')).toHaveText('終了済み')
    } finally {
      await app.close()
    }
  })

  test('11 本目は session-limit で拒否され、行は 10 のまま (SC-001)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachActiveComposer(page)
      for (let i = 1; i < 10; i += 1) {
        await launchAnother(page)
        await expect(rows(page)).toHaveCount(i + 1)
      }
      await launchAnother(page)
      await expect(page.getByRole('alert')).toContainText('10 件まで')
      await expect(rows(page)).toHaveCount(10)

      // 起動しただけ (プロンプト未送信) の行は「プロンプト待ち」で、強制終了でなく「終了」で枠を空けられる
      // (pr-gate R1 po H-001)。終了済みの行は枠に数えないので、次の起動が通る。
      const first = rows(page).nth(0)
      await expect(first.getByTestId('session-row-status')).toHaveText('プロンプト待ち')
      await first.getByRole('button', { name: '終了', exact: true }).click()
      await expect(first.getByTestId('session-row-status')).toHaveText('終了済み')
      await launchAnother(page)
      await expect(rows(page)).toHaveCount(11)
      await page.getByRole('textbox', { name: 'Message input' }).waitFor()
    } finally {
      await app.close()
    }
  })

  test('10 本が本文を流している間も、表示中のセッションの入力が滑らか (SC-003)', async () => {
    test.setTimeout(180_000)
    const { app, page } = await launchApp()
    try {
      await reachActiveComposer(page)
      for (let i = 1; i < 10; i += 1) await launchAnother(page)
      await expect(rows(page)).toHaveCount(10)

      // 1 本目に上限いっぱいの part、残り 9 本に負荷を流す。最後に 10 本目を表示して入力する。
      // 巨大な part は fake が送信の 15 秒後に流す — 計測 (打鍵 25 秒) の窓の中で届く (pr-gate R1 po H-002)。
      for (let i = 0; i < 10; i += 1) {
        await selectRow(page, i)
        await send(page, i === 0 ? BIG_PROMPT : LOAD_PROMPT)
      }
      await selectRow(page, 9)
      const composer = page.getByRole('textbox', { name: 'Message input' })
      await composer.waitFor()

      // 計測を仕込む: long task (50ms 超) と、keydown の timeStamp から値の反映後の最初の rAF までの入力遅延 (SC-003)。
      await page.evaluate(() => {
        const w = window as unknown as {
          __longTasks: number[]
          __inputDelays: number[]
          __bigArrived: { atStart: boolean; at: number | null }
        }
        w.__longTasks = []
        w.__inputDelays = []
        /*
         * 巨大な part の着信を計測窓の中で確かめる (pr-gate R2 po M-102)。fake は巨大な part を流した直後に 1 本目を
         * 応答待ち (done) にするので、1 本目の行が「応答待ち」に変わった時刻を着信の時刻とみなす。
         * **200ms ごとに 1 回読むだけにする** — 一覧を MutationObserver で監視すると、負荷中の再描画ごとに callback が走り、
         * 計測そのものが重くなった (実測: p95 23〜26ms → 26〜44ms、1 回は 78ms で不合格)。
         */
        const bigStatus = (): string | null =>
          document
            .querySelector('[data-slot="aui_thread-list-item"]')
            ?.querySelector('[data-testid="session-row-status"]')?.textContent ?? null
        w.__bigArrived = { atStart: bigStatus() === '応答待ち', at: null }
        const poll = setInterval(() => {
          if (bigStatus() !== '応答待ち') return
          w.__bigArrived.at = performance.now()
          clearInterval(poll)
        }, 200)
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

      // 負荷 (30 秒) の間、composer に打鍵し続ける。
      await composer.focus()
      const until = Date.now() + 25_000
      while (Date.now() < until) {
        await page.keyboard.type('abcdefghij', { delay: 40 })
        await page.keyboard.press('Control+A')
        await page.keyboard.press('Backspace')
      }

      const { longTasks, inputDelays, bigArrived } = await page.evaluate(() => {
        const w = window as unknown as {
          __longTasks: number[]
          __inputDelays: number[]
          __bigArrived: { atStart: boolean; at: number | null }
        }
        return { longTasks: w.__longTasks, inputDelays: w.__inputDelays, bigArrived: w.__bigArrived }
      })
      // SC-003 の負荷に上限いっぱいの part が含まれたこと: 計測を仕込んだ時点では未着で、打鍵の間に届いた。
      expect(bigArrived.atStart).toBe(false)
      expect(bigArrived.at).not.toBeNull()
      const sorted = [...inputDelays].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Number.POSITIVE_INFINITY
      test.info().annotations.push({
        type: 'SC-003',
        description: `bigArrivedAt=${bigArrived.at?.toFixed(0) ?? 'none'}ms longTasks=${longTasks.length} (max ${Math.max(0, ...longTasks).toFixed(1)}ms) inputDelay.p95=${p95.toFixed(1)}ms n=${inputDelays.length}`
      })
      // SC-003: 入力遅延 p95 ≤ 50ms、long task の最大 < 100ms。件数は合否に使わず annotation に記録する
      // (実行ごとに 0〜10 件と揺れ、本機の常駐セキュリティによる揺れと区別できないため)。
      expect(inputDelays.length).toBeGreaterThan(50)
      expect(p95).toBeLessThanOrEqual(50)
      expect(Math.max(0, ...longTasks)).toBeLessThan(100)
    } finally {
      await app.close()
    }
  })
})
