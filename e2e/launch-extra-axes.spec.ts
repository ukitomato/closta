import { expect, test } from '@playwright/test'

import { launchApp, openLaunchDialog, runningRows } from './support/launch'

/**
 * 024 — **起動設定の残りの軸の E2E** (SC-007)。US-1 (追加ディレクトリ) の本数から始め、US-2〜US-4 の本数を同じファイルに足す。
 *
 * credential-free (AD-038 D3)。CLOSTA_E2E の偽の capability が seed するフォルダ (E2E Project / E2E Windows Project)
 * とランタイム (E2E-Ubuntu) を使う。IPC は本物の main の検証 (`checkLaunchConfig`) を通る。
 */

const folder = (page: import('@playwright/test').Page) =>
  page.getByRole('combobox', { name: '作業フォルダ' })
const runtime = (page: import('@playwright/test').Page) =>
  page.getByRole('combobox', { name: 'ランタイム', exact: true })

test.describe('起動設定の残りの軸 (024)', () => {
  test('作業フォルダともう 1 つを追加ディレクトリに選んで起動し、概要のタブに表示名が出る (US-1 / SC-007)', async () => {
    const { app, page } = await launchApp()
    try {
      await openLaunchDialog(page)
      await folder(page).selectOption({ label: 'E2E Project' })
      await runtime(page).selectOption({ label: 'E2E-Ubuntu' })

      // 作業フォルダ自身は選択肢に出ない。もう 1 つの登録フォルダを選ぶ (パスの入力欄は無い)。
      const add = page.getByRole('combobox', { name: 'フォルダを追加' })
      await expect(add.locator('option', { hasText: 'E2E Project' })).toHaveCount(0)
      await add.selectOption({ label: 'E2E Windows Project' })
      await expect(page.getByRole('list', { name: '追加ディレクトリ' })).toContainText(
        'E2E Windows Project'
      )

      await page.getByRole('button', { name: '起動', exact: true }).click()
      await page
        .getByRole('textbox', { name: 'メッセージ', exact: true })
        .waitFor({ state: 'visible', timeout: 30_000 })

      // 稼働中の行が出て、概要のタブに追加ディレクトリの表示名が出る。
      await page.getByRole('button', { name: '概要', exact: true }).click()
      const overview = page.getByTestId('overview')
      await expect(overview).toBeVisible()
      await expect(overview).toContainText('追加ディレクトリ')
      await expect(overview).toContainText('E2E Windows Project')
    } finally {
      await app.close()
    }
  })

  test('ターン数 30・費用 2 で起動し、概要のタブに上限が出る。範囲外の入力では起動が押せない (US-2 / SC-007)', async () => {
    const { app, page } = await launchApp()
    try {
      await openLaunchDialog(page)
      await folder(page).selectOption({ label: 'E2E Project' })
      await runtime(page).selectOption({ label: 'E2E-Ubuntu' })

      const turns = page.getByRole('textbox', { name: 'ターン数の上限' })
      const budget = page.getByRole('textbox', { name: '費用の上限 (USD)' })
      const start = page.getByRole('button', { name: '起動', exact: true })

      await turns.fill('1001')
      await expect(start).toBeDisabled()
      await expect(page.getByText('ターン数は 1〜1000 の整数で入力してください')).toBeVisible()
      await turns.fill('30')
      await budget.fill('2')
      await expect(start).toBeEnabled()

      await start.click()
      await page
        .getByRole('textbox', { name: 'メッセージ', exact: true })
        .waitFor({ state: 'visible', timeout: 30_000 })

      await page.getByRole('button', { name: '概要', exact: true }).click()
      const overview = page.getByTestId('overview')
      await expect(overview).toBeVisible()
      await expect(overview).toContainText('ターン数の上限')
      await expect(overview).toContainText('30')
      await expect(overview).toContainText('費用の上限 (USD)')
      await expect(overview).toContainText('2.00')
    } finally {
      await app.close()
    }
  })

  test('名前を付けて起動し、稼働中の行と中央のヘッダに名前が出る (US-3 / SC-007)', async () => {
    const { app, page } = await launchApp()
    try {
      await openLaunchDialog(page)
      await folder(page).selectOption({ label: 'E2E Project' })
      await runtime(page).selectOption({ label: 'E2E-Ubuntu' })

      await page.getByRole('textbox', { name: 'セッション名' }).fill('ログインの API 修正')
      await page.getByRole('button', { name: '起動', exact: true }).click()
      await page
        .getByRole('textbox', { name: 'メッセージ', exact: true })
        .waitFor({ state: 'visible', timeout: 30_000 })

      await expect(runningRows(page).first()).toContainText('ログインの API 修正')
      await expect(page.getByTestId('center-header')).toContainText('ログインの API 修正')
    } finally {
      await app.close()
    }
  })
})
