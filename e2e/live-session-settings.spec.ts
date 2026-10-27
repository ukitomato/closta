import { expect, test, type Page } from '@playwright/test'

import { launchApp, openLaunchDialog, reachActiveComposer, runningRows } from './support/launch'

/**
 * 023 / FE-012・FE-021 — **動いているセッションの権限モード・モデルの切り替えの E2E** (SC-006。contracts C-6)。
 *
 * credential-free (AD-038 D3)。本物の起動調停と本物の制御の結果の待ち (`requestControl`) に fake の supervisor 接続
 * (`src/main/app/e2e-capability.ts`) を差して動かす。実機の `claude` は要らない。
 * 最初のプロンプトを送って「応答待ち」になった行 (`launching` を抜けた行) で切り替える。
 */

/** 最初のプロンプトを送り、行が「応答待ち」になるまで待つ (変更を受け付ける状態)。 */
async function reachSettledRow(page: Page): Promise<void> {
  const composer = await reachActiveComposer(page)
  await composer.fill('こんにちは')
  await composer.press('Enter')
  await expect(runningRows(page).nth(0).getByTestId('session-row-status')).toHaveText('応答待ち')
}

/**
 * Provider (E2E Bedrock) とモデル (E2E Sonnet) を選んで起動し、行が「応答待ち」になるまで待つ。
 * モデルの切り替えは起動の Provider のカタログを使うので、既定 Provider (カタログ無し) では試せない。
 */
async function reachSettledRowOnBedrock(page: Page): Promise<void> {
  await openLaunchDialog(page)
  await page.getByRole('combobox', { name: '作業フォルダ' }).selectOption({ index: 1 })
  await page.getByRole('combobox', { name: 'ランタイム', exact: true }).selectOption({
    label: 'E2E-Ubuntu'
  })
  await page.getByRole('combobox', { name: 'Provider' }).selectOption({ label: 'E2E Bedrock' })
  await page.getByRole('combobox', { name: 'モデル' }).selectOption({ label: 'E2E Sonnet' })
  await page.getByRole('button', { name: '起動', exact: true }).click()
  const composer = page.getByRole('textbox', { name: 'メッセージ', exact: true })
  await composer.waitFor({ state: 'visible', timeout: 30_000 })
  await composer.fill('こんにちは')
  await composer.press('Enter')
  await expect(runningRows(page).nth(0).getByTestId('session-row-status')).toHaveText('応答待ち')
}

/** 会話の id を持つ合成プロンプトを送り、行が「応答待ち」になるまで待つ (名前を付けられる状態)。 */
async function reachSettledRowWithConversation(page: Page): Promise<void> {
  const composer = await reachActiveComposer(page)
  await composer.fill('__e2e_conversation__')
  await composer.press('Enter')
  await expect(runningRows(page).nth(0).getByTestId('session-row-status')).toHaveText('応答待ち')
}

test.describe('動いているセッションの名前 (023)', () => {
  test('「名前を変更」から名前を保存すると、ヘッダと稼働中の行に名前が出る (SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachSettledRowWithConversation(page)

      await page.getByRole('button', { name: '名前を変更' }).click()
      await page.getByRole('textbox', { name: '名前' }).fill('  調査メモ  ')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      await expect(page.getByTestId('session-title')).toHaveText('調査メモ')
      await expect(runningRows(page).nth(0)).toContainText('調査メモ')
      await expect(page.getByTestId('live-setting-error')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})

test.describe('動いているセッションのモデル (023)', () => {
  test('ヘッダの「モデル」を 2 つ目にすると、ヘッダの値と概要のタブの現在のモデルが変わる (SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachSettledRowOnBedrock(page)

      const select = page.getByTestId('center-header').getByRole('combobox', { name: 'モデル' })
      await expect(select.locator('option')).toHaveText(['E2E Sonnet', 'E2E Haiku'])
      await expect(select).toHaveValue('e2e-sonnet')
      await select.selectOption({ label: 'E2E Haiku' })

      await expect(select).toHaveValue('e2e-haiku')
      // 右のペインは既定で畳んでいる。帯の「概要」のアイコンから開く。
      await page.getByRole('button', { name: '概要', exact: true }).click()
      const overview = page.getByRole('tabpanel')
      await expect(overview).toContainText('現在のモデル')
      await expect(overview).toContainText('E2E Haiku')
      await expect(page.getByTestId('live-setting-error')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})

test.describe('動いているセッションの権限モード (023)', () => {
  test('ヘッダの「権限モード」を plan にすると、ヘッダと概要のタブの現在の値が plan になる (SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachSettledRow(page)

      const select = page.getByTestId('center-header').getByRole('combobox', { name: '権限モード' })
      await expect(select).toHaveValue('default')
      await select.selectOption('plan')

      await expect(select).toHaveValue('plan')
      // 右のペインは既定で畳んでいる。帯の「概要」のアイコンから開く。
      await page.getByRole('button', { name: '概要', exact: true }).click()
      const overview = page.getByRole('tabpanel')
      await expect(overview).toContainText('現在の権限モード')
      await expect(overview).toContainText('計画のみ (実行しない)')
      await expect(page.getByTestId('live-setting-error')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})
