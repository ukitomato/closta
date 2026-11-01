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
  test('composer の周りの「モデル」を 2 つ目にすると、選択の値と概要のタブの現在のモデルが変わる (SC-006 / 025 SC-001)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachSettledRowOnBedrock(page)

      const select = page
        .getByTestId('composer-live-settings')
        .getByRole('combobox', { name: 'モデル' })
      await expect(page.getByTestId('center-header').getByRole('combobox')).toHaveCount(0)
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

test.describe('既定の Provider のモデルの一覧 (025 / AD-065)', () => {
  test('既定の Provider の行で、固定の 2 件が並び、2 つ目を選ぶと選択の値と概要のタブの現在のモデル (値) が変わる (SC-002)', async () => {
    const { app, page } = await launchApp()
    try {
      // 既定の Provider (起動ダイアログの初期値) で最初の応答まで進める。
      await reachSettledRow(page)

      const select = page
        .getByTestId('composer-live-settings')
        .getByRole('combobox', { name: 'モデル' })
      await expect(select.locator('option:not([disabled])')).toHaveText([
        'E2E モデル A',
        'E2E モデル B'
      ])
      await select.selectOption({ label: 'E2E モデル B' })

      await expect(select).toHaveValue('e2e-model-b')
      await page.getByRole('button', { name: '概要', exact: true }).click()
      const overview = page.getByRole('tabpanel')
      await expect(overview).toContainText('現在のモデル')
      // 既定の Provider にはカタログが無いので、概要は選んだモデルの値 (id) を出す。
      await expect(overview).toContainText('e2e-model-b')
      await expect(page.getByTestId('live-setting-error')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})

test.describe('動いているセッションの権限モード (023)', () => {
  test('composer の周りの「権限モード」を plan にすると、選択と概要のタブの現在の値が plan になる (SC-006 / 025 SC-001・SC-003)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachSettledRow(page)

      const select = page
        .getByTestId('composer-live-settings')
        .getByRole('combobox', { name: '権限モード' })
      await expect(page.getByTestId('center-header').getByRole('combobox')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '名前を変更' })).toBeVisible()
      await expect(select).toHaveValue('default')
      await select.selectOption('plan')
      // 表記は直に書かず、選択から読んだ文字列を「概要」と照合する (権限モードの名前の表は 1 か所。RK-08)。
      const planName = (await select.locator('option[value="plan"]').textContent()) ?? ''
      expect(planName).not.toBe('')

      await expect(select).toHaveValue('plan')
      // 右のペインは既定で畳んでいる。帯の「概要」のアイコンから開く。
      await page.getByRole('button', { name: '概要', exact: true }).click()
      const overview = page.getByRole('tabpanel')
      await expect(overview).toContainText('現在の権限モード')
      await expect(overview).toContainText(planName)
      await expect(page.getByTestId('live-setting-error')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})

test.describe('動いているセッションの Auto (026)', () => {
  test('Auto を選ぶと確認が出て、取り消すと送らず選択が前のまま。承諾すると帯が出て、安全な値に戻すと確認なしで帯が消える (SC-001 / SC-004)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachSettledRow(page)

      const select = page
        .getByTestId('composer-live-settings')
        .getByRole('combobox', { name: '権限モード' })
      // 表記は直に書かず、選択から読む (権限モードの名前の表は 1 か所)。
      const autoName = (await select.locator('option[value="auto"]').textContent()) ?? ''
      expect(autoName).not.toBe('')
      const confirmation = page.getByTestId('auto-mode-confirmation')
      const banner = page.getByTestId('auto-mode-banner')

      // 取り消す: 送られず (観測の値が変わらないので帯が出ない)、選択は前の値のまま。
      await select.selectOption('auto')
      await expect(confirmation).toBeVisible()
      await expect(confirmation).toContainText(autoName)
      await confirmation.getByRole('button').nth(1).click()
      await expect(confirmation).toHaveCount(0)
      await expect(select).toHaveValue('default')
      await expect(banner).toHaveCount(0)

      // 承諾する: 送られ、選択が Auto になり、帯が出る (警告の帯は出ない)。
      await select.selectOption('auto')
      await confirmation.getByRole('button', { name: autoName }).click()
      await expect(confirmation).toHaveCount(0)
      await expect(select).toHaveValue('auto')
      await expect(banner).toBeVisible()
      await expect(banner).toHaveAttribute('role', 'note')
      await expect(page.getByTestId('unsafe-mode-banner')).toHaveCount(0)

      // 安全 3 値に戻す: 確認なしで、帯が消える。
      await select.selectOption('plan')
      await expect(confirmation).toHaveCount(0)
      await expect(select).toHaveValue('plan')
      await expect(banner).toHaveCount(0)
      await expect(page.getByTestId('live-setting-error')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})
