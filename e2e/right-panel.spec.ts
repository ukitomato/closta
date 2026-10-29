import { expect, test } from '@playwright/test'

import { launchApp, reachActiveComposer, runningRows } from './support/launch'

/**
 * 025 / FE-042 — **右のパネル (幅 320px) が崩れない** E2E (SC-005。US-4)。
 *
 * credential-free。fake の supervisor 接続 (`src/main/app/e2e-capability.ts`) が、合成の会話プロンプトの後に
 * 7 桁以上のトークンとモデル別の内訳 2 件を持つ `turn` の meter を流す。
 * 高さは「1 行分」を、その要素の `line-height` の 1.5 倍未満かどうかで確かめる (折り返すと 2 行以上になる)。
 */

test.describe('右のパネル (025)', () => {
  test('タブの名前が 1 行で、端のタブが ←/→ で見える範囲に入り、使用量の値が折り返さない (SC-005)', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      await composer.fill('__e2e_conversation__')
      await composer.press('Enter')
      await expect(runningRows(page).nth(0).getByTestId('session-row-status')).toHaveText(
        '応答待ち'
      )

      // 右のパネルは既定で畳んでいる。帯のアイコンから開く。
      await page.getByRole('button', { name: '概要', exact: true }).click()
      const tablist = page.getByRole('tablist')
      await expect(tablist).toBeVisible()

      const tabs = tablist.getByRole('tab')
      const count = await tabs.count()
      expect(count).toBeGreaterThan(1)

      // 各タブの高さが 1 行分 (行の高さの 1.5 倍未満)。
      for (let i = 0; i < count; i += 1) {
        const ok = await tabs.nth(i).evaluate((el) => {
          const style = getComputedStyle(el)
          const lineHeight = Number.parseFloat(style.lineHeight)
          const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
          const line = Number.isFinite(lineHeight) ? lineHeight : Number.parseFloat(style.fontSize) * 1.5
          return (el.getBoundingClientRect().height - padding) / line < 1.5
        })
        expect(ok).toBe(true)
      }

      // 端のタブを ←/→ で選ぶと、見える範囲に入る。
      await tabs.nth(0).focus()
      await page.keyboard.press('ArrowLeft') // 先頭から反対の端 (末尾) へ回る
      const last = tabs.nth(count - 1)
      await expect(last).toBeFocused()
      await expect(last).toHaveAttribute('aria-selected', 'true')
      const inView = async (index: number): Promise<boolean> =>
        tabs.nth(index).evaluate((el) => {
          const box = el.getBoundingClientRect()
          const list = el.parentElement?.getBoundingClientRect()
          return list !== undefined && box.left >= list.left - 1 && box.right <= list.right + 1
        })
      expect(await inView(count - 1)).toBe(true)
      await page.keyboard.press('ArrowRight') // 末尾から先頭へ回る
      await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')
      expect(await inView(0)).toBe(true)

      // 使用量の値が折り返さない。
      await tablist.getByRole('tab', { name: '使用量' }).click()
      const usage = page.getByTestId('usage')
      await expect(usage).toBeVisible()
      const values = usage.locator('dd')
      const valueCount = await values.count()
      expect(valueCount).toBeGreaterThan(8)
      for (let i = 0; i < valueCount; i += 1) {
        const ok = await values.nth(i).evaluate((el) => {
          const style = getComputedStyle(el)
          const lineHeight = Number.parseFloat(style.lineHeight)
          const line = Number.isFinite(lineHeight) ? lineHeight : Number.parseFloat(style.fontSize) * 1.5
          return el.getBoundingClientRect().height / line < 1.5
        })
        expect(ok).toBe(true)
      }
      await expect(usage.getByTestId('usage-models').locator('li')).toHaveCount(2)
    } finally {
      await app.close()
    }
  })
})
