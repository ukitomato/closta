import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  collectInputProbe,
  describeProbe,
  INPUT_DELAY_P95_MAX_MS,
  installInputProbe,
  LONG_TASK_MAX_MS,
  typeContinuously
} from './support/input-probe'
import { launchApp, openLaunchDialog, reachActiveComposer, runningRows } from './support/launch'

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

/** サイドバーの「新規起動」から、直前の起動設定 (復元済み) のまま起動する。最初の 1 本は reachActiveComposer で作る。 */
async function launchAnother(page: Page): Promise<void> {
  await openLaunchDialog(page)
  const folder = page.getByRole('combobox', { name: '作業フォルダ' })
  if ((await folder.inputValue()) === '') {
    await folder.selectOption({ index: 1 })
    await page.getByRole('combobox', { name: 'ランタイム (WSL)' }).selectOption({ index: 1 })
  }
  await page.getByRole('button', { name: '起動', exact: true }).click()
}

/** 稼働中セッションの行 (assistant-ui の ThreadList の項目。O-7 でサイドバーの稼働中の区画に限る)。 */
function rows(page: Page): Locator {
  return runningRows(page)
}

/** 行の選択 (ThreadListItem の Trigger = 行の最初のボタン。操作ボタンはその後に並ぶ)。 */
function selectRow(page: Page, index: number): Promise<void> {
  return rows(page).nth(index).getByRole('button').first().click()
}

function sentUserMessages(page: Page, text: string): Locator {
  return page.locator('[data-role="user"]').filter({ hasText: text })
}

async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByRole('textbox', { name: 'メッセージ', exact: true })
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
      await page.getByRole('textbox', { name: 'メッセージ', exact: true }).waitFor()
      // 新しいセッションの transcript には 1 本目の発話が無い。
      await expect(sentUserMessages(page, '一本目への指示')).toHaveCount(0)
      await page.getByRole('textbox', { name: 'メッセージ', exact: true }).fill('二本目の下書き')

      // 1 本目へ切り替える: 1 本目の発話と応答が見え、2 本目の下書きは持ち込まれない。
      await selectRow(page, 0)
      await expect(sentUserMessages(page, '一本目への指示')).toHaveCount(1)
      // transcript の中だけを数える (O-1 で一覧の行にも直近の活動として同じ応答の先頭行が出るため)。
      await expect(
        page.locator('[data-role="assistant"]').filter({ hasText: '（E2E stub）受け取りました。' })
      ).toHaveCount(1)
      await expect(page.getByRole('textbox', { name: 'メッセージ', exact: true })).toHaveValue('')

      // 2 本目へ戻ると下書きが戻る。
      await selectRow(page, 1)
      await expect(page.getByRole('textbox', { name: 'メッセージ', exact: true })).toHaveValue(
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
      // 拒否は起動ダイアログを閉じずに理由を出す (O-7 US-2 AC5)。行の操作の前に閉じる。
      await page.keyboard.press('Escape')
      await expect(page.getByRole('heading', { name: 'セッションを起動' })).toHaveCount(0)
      await expect(rows(page)).toHaveCount(10)

      // 起動しただけ (プロンプト未送信) の行は「プロンプト待ち」で、強制終了でなく「終了」で枠を空けられる
      // (pr-gate R1 po H-001)。終了済みの行は枠に数えないので、次の起動が通る。
      const first = rows(page).nth(0)
      await expect(first.getByTestId('session-row-status')).toHaveText('プロンプト待ち')
      await first.getByRole('button', { name: '終了', exact: true }).click()
      await expect(first.getByTestId('session-row-status')).toHaveText('終了済み')
      await launchAnother(page)
      await expect(rows(page)).toHaveCount(11)
      await page.getByRole('textbox', { name: 'メッセージ', exact: true }).waitFor()
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
      const composer = page.getByRole('textbox', { name: 'メッセージ', exact: true })
      await composer.waitFor()

      // O-1 SC-004: 監視ビューの経過時間と直近の活動 (本文の分岐) を出した comfortable の状態で流す
      // (強調は含めない — E2E の偽 supervisor は承認待ち・失敗を流さない。USER 決定 2026-10-02 design-gate H-03)。
      await expect(page.getByRole('button', { name: '詳しく' })).toHaveAttribute('aria-pressed', 'true')
      for (let i = 0; i < 10; i += 1) {
        await expect(rows(page).nth(i).getByTestId('session-row-elapsed')).toBeVisible()
        await expect(rows(page).nth(i).getByTestId('session-row-activity')).toBeVisible()
      }

      // 計測を仕込む: long task (50ms 超) と入力遅延 (SC-003。定義は e2e/support/input-probe.ts)。
      await installInputProbe(page)
      await page.evaluate(() => {
        const w = window as unknown as {
          __bigArrived: { atStart: boolean; at: number | null }
        }
        /*
         * 巨大な part の着信を計測窓の中で確かめる (pr-gate R2 po M-102)。fake は巨大な part を流した直後に 1 本目を
         * 応答待ち (done) にするので、1 本目の行が「応答待ち」に変わった時刻を着信の時刻とみなす。
         * **200ms ごとに 1 回読むだけにする** — 一覧を MutationObserver で監視すると、負荷中の再描画ごとに callback が走り、
         * 計測そのものが重くなった (実測: p95 23〜26ms → 26〜44ms、1 回は 78ms で不合格)。
         */
        const bigStatus = (): string | null =>
          document
            .querySelector('[data-testid="session-list"] [data-slot="aui_thread-list-item"]')
            ?.querySelector('[data-testid="session-row-status"]')?.textContent ?? null
        w.__bigArrived = { atStart: bigStatus() === '応答待ち', at: null }
        const poll = setInterval(() => {
          if (bigStatus() !== '応答待ち') return
          w.__bigArrived.at = performance.now()
          clearInterval(poll)
        }, 200)
      })

      // 負荷 (30 秒) の間、composer に打鍵し続ける。
      await composer.focus()
      await typeContinuously(page, 25_000)

      const result = await collectInputProbe(page)
      const bigArrived = await page.evaluate(
        () =>
          (window as unknown as { __bigArrived: { atStart: boolean; at: number | null } })
            .__bigArrived
      )
      // SC-003 の負荷に上限いっぱいの part が含まれたこと: 計測を仕込んだ時点では未着で、打鍵の間に届いた。
      expect(bigArrived.atStart).toBe(false)
      expect(bigArrived.at).not.toBeNull()
      test.info().annotations.push({
        type: 'SC-003 / O-1 SC-004',
        description: `bigArrivedAt=${bigArrived.at?.toFixed(0) ?? 'none'}ms ${describeProbe(result)}`
      })
      // SC-003: 入力遅延 p95 ≤ 50ms、long task の最大 < 100ms。件数は合否に使わず annotation に記録する
      // (実行ごとに 0〜10 件と揺れ、本機の常駐セキュリティによる揺れと区別できないため)。
      expect(result.inputSamples).toBeGreaterThan(50)
      expect(result.inputDelayP95).toBeLessThanOrEqual(INPUT_DELAY_P95_MAX_MS)
      expect(result.longTaskMax).toBeLessThan(LONG_TASK_MAX_MS)
    } finally {
      await app.close()
    }
  })

  test('compact では 10 本の行がスクロールなしで一覧に収まり、行は横にあふれず操作が行の内側にある (O-1 SC-003)', async () => {
    test.setTimeout(120_000)
    const { app, page } = await launchApp()
    try {
      await reachActiveComposer(page)
      for (let i = 1; i < 10; i += 1) await launchAnother(page)
      await expect(rows(page)).toHaveCount(10)
      await page.getByRole('button', { name: 'コンパクト' }).click()
      await expect(page.getByRole('button', { name: 'コンパクト' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      // 終わり方の告知を持つ行 (強制終了) と終了済みの行を混ぜてから幅を測る (pr-gate R1 po M-002)。compact の告知は
      // 読み上げとツールチップに出る。失敗の行 (印の横の短い理由) は E2E の偽 supervisor が失敗を流さないので
      // ここでは作れない (main を変えない。FR-010)。短い理由は `max-w-24 truncate` で幅を持たない。
      await rows(page).nth(0).getByRole('button', { name: '強制終了', exact: true }).click()
      await expect(rows(page).nth(0).getByRole('button').first()).toHaveAccessibleName(
        /強制終了しました。/
      )
      await rows(page).nth(1).getByRole('button', { name: '終了', exact: true }).click()
      await expect(rows(page).nth(1).getByTestId('session-row-status')).toHaveText('終了済み')

      const layout = await page.evaluate(() => {
        const list = document.querySelector(
          '[data-testid="session-list"] [data-slot="aui_thread-list-root"]'
        )
        if (list === null) return null
        const listBox = list.getBoundingClientRect()
        const items = [...list.querySelectorAll('[data-slot="aui_thread-list-item"]')]
        return {
          scrolls: list.scrollHeight > list.clientHeight,
          rows: items.map((row) => {
            const box = row.getBoundingClientRect()
            const buttons = [...row.querySelectorAll('[data-slot="aui_thread-list-item-actions"] button')]
            return {
              inside: box.top >= listBox.top - 1 && box.bottom <= listBox.bottom + 1,
              overflows: row.scrollWidth > row.clientWidth,
              buttonsInside: buttons.every((b) => {
                const bb = b.getBoundingClientRect()
                return bb.left >= box.left - 1 && bb.right <= box.right + 1
              })
            }
          })
        }
      })
      expect(layout).not.toBeNull()
      expect(layout?.scrolls).toBe(false)
      expect(layout?.rows).toHaveLength(10)
      for (const row of layout?.rows ?? []) {
        expect(row).toEqual({ inside: true, overflows: false, buttonsInside: true })
      }
    } finally {
      await app.close()
    }
  })
})
