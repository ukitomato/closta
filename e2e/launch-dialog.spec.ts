import { expect, test, type Page } from '@playwright/test'

import { launchApp, openLaunchDialog } from './support/launch'

/**
 * X-4 / SH-022 — **起動設定ダイアログの E2E** (SC-001 / SC-002 / SC-004。charter KPI「依存解決の正しさ」)。
 *
 * credential-free (AD-038 D3)。CLOSTA_E2E stub (`src/main/app/e2e-capability.ts`) が次を seed する。
 * - フォルダ: E2E Project (WSL: E2E-Ubuntu) / E2E Windows Project
 * - ランタイム: E2E-Ubuntu / E2E-Debian
 * - Provider: E2E Bedrock (両方から到達可) / E2E Debian 専用 (E2E-Debian からだけ到達可)
 * - プリセット: メモリ内。削除済み Provider を参照する「E2E 削除済み Provider」を 1 件 seed する
 *
 * **IPC は本物の main 側検証を通る** (`checkLaunchConfig` / `checkPreset` / `findRuntime`)。preload も本番と同一。
 */

/** サイドバーの「新規起動」から開く (O-7)。 */
function openDialog(page: Page): Promise<void> {
  return openLaunchDialog(page)
}

// select は位置でなく label で拾う (X-5 SH-011)。
const folder = (page: Page) => page.getByRole('combobox', { name: '作業フォルダ' })
const runtime = (page: Page) => page.getByRole('combobox', { name: 'ランタイム', exact: true })
const provider = (page: Page) => page.getByRole('combobox', { name: 'Provider' })
const model = (page: Page) => page.getByRole('combobox', { name: 'モデル' })

test.describe('起動設定ダイアログ (X-4)', () => {
  test('到達できない Provider は選択肢に出ず、Provider を切り替えるとモデル選択肢が差し替わる (SC-001)', async () => {
    const { app, page } = await launchApp()
    try {
      await openDialog(page)
      await folder(page).selectOption({ label: 'E2E Project' })
      await runtime(page).selectOption({ label: 'E2E-Ubuntu' })

      // E2E-Ubuntu から到達できない Provider は選択肢に 0 件で、除外理由が示される。
      await expect(page.getByRole('list', { name: '選べない Provider' })).toContainText(
        'E2E Debian 専用'
      )
      await expect(provider(page).locator('option', { hasText: 'E2E Debian 専用' })).toHaveCount(0)

      // 既定 Provider はカタログを持たない → モデルは「既定」のみ。
      await expect(model(page).locator('option')).toHaveCount(1)
      await provider(page).selectOption({ label: 'E2E Bedrock' })
      await expect(model(page).locator('option')).toHaveText(['既定', 'E2E Sonnet', 'E2E Haiku'])
    } finally {
      await app.close()
    }
  })

  test('上流の軸を変えると無効な下流が既定に戻り、通知される (SC-002 / KPI 依存解決の正しさ)', async () => {
    const { app, page } = await launchApp()
    try {
      await openDialog(page)
      await folder(page).selectOption({ label: 'E2E Windows Project' })
      await runtime(page).selectOption({ label: 'E2E-Debian' })
      await provider(page).selectOption({ label: 'E2E Debian 専用' })

      // ランタイムを E2E-Ubuntu に変えると、E2E Debian 専用は到達不可になり既定へ戻る。
      await runtime(page).selectOption({ label: 'E2E-Ubuntu' })
      await expect(page.getByRole('status', { name: '既定に戻した軸' })).toContainText(
        '到達できない'
      )
      await expect(provider(page)).toHaveValue('')

      // Provider の reset は起動前に確認を要する (黙って既定で起動しない。US-2 AC3)。
      await page.getByRole('button', { name: '起動', exact: true }).click()
      await expect(
        page.getByRole('alertdialog', { name: '既定 Provider での起動の確認' })
      ).toBeVisible()
      await page.getByRole('button', { name: '戻って選び直す' }).click()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })

  test('Windows (ホスト) を選んでも権限モードは default / plan / dontAsk / auto の 4 つだけで、acceptEdits / bypassPermissions は無い (Principle III / X-8 / 026 SC-004)', async () => {
    const { app, page } = await launchApp()
    try {
      await openDialog(page)
      await folder(page).selectOption({ label: 'E2E Windows Project' })
      await runtime(page).selectOption({ label: 'Windows (ホスト)' })
      const modes = page.getByRole('combobox', { name: '権限モード' })
      await expect(modes.locator('option')).toHaveCount(4)
      await expect(modes.locator('option[value="default"]')).toHaveCount(1)
      await expect(modes.locator('option[value="plan"]')).toHaveCount(1)
      await expect(modes.locator('option[value="dontAsk"]')).toHaveCount(1)
      await expect(modes.locator('option[value="auto"]')).toHaveCount(1)
      await expect(modes.locator('option[value="acceptEdits"]')).toHaveCount(0)
      await expect(modes.locator('option[value="bypassPermissions"]')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })

  test('Windows (ホスト) で Auto を選ぶと確認が出て、取り消すと前の値のまま。承諾して起動すると Auto の帯が出る (026 SC-001 / SC-004)', async () => {
    const { app, page } = await launchApp()
    try {
      await openDialog(page)
      await folder(page).selectOption({ label: 'E2E Windows Project' })
      await runtime(page).selectOption({ label: 'Windows (ホスト)' })
      const modes = page.getByRole('combobox', { name: '権限モード' })
      // 表記は直に書かず、選択から読む (権限モードの名前の表は 1 か所)。
      const autoName = (await modes.locator('option[value="auto"]').textContent()) ?? ''
      expect(autoName).not.toBe('')
      const confirmation = page.getByTestId('auto-mode-confirmation')

      // 取り消すと前の値のまま (確認の 2 つ目のボタンが取り消し)。
      await modes.selectOption('auto')
      await expect(confirmation).toBeVisible()
      await expect(confirmation).toContainText(autoName)
      await expect(modes).toHaveValue('default')
      await confirmation.getByRole('button').nth(1).click()
      await expect(confirmation).toHaveCount(0)
      await expect(modes).toHaveValue('default')

      // 承諾すると値が Auto になり、起動の確認は重ねて出ない。
      await modes.selectOption('auto')
      await confirmation.getByRole('button', { name: autoName }).click()
      await expect(confirmation).toHaveCount(0)
      await expect(modes).toHaveValue('auto')
      await page.getByRole('button', { name: '起動', exact: true }).click()
      await expect(confirmation).toHaveCount(0)

      // 起動した行の最初の観測 (偽の supervisor が頼んだ権限モードを流す) で Auto の帯が中央のヘッダの下に出る。
      const banner = page.getByTestId('auto-mode-banner')
      await expect(banner).toBeVisible({ timeout: 30_000 })
      await expect(banner).toHaveAttribute('role', 'note')
      await expect(page.getByTestId('unsafe-mode-banner')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })

  test('プリセットを保存 → 適用 → 起動できる (SC-004)', async () => {
    const { app, page } = await launchApp()
    try {
      await openDialog(page)
      await folder(page).selectOption({ label: 'E2E Project' })
      await runtime(page).selectOption({ label: 'E2E-Ubuntu' })
      await provider(page).selectOption({ label: 'E2E Bedrock' })
      await model(page).selectOption({ label: 'E2E Sonnet' })
      await page.getByRole('combobox', { name: '権限モード' }).selectOption('plan')

      await page.getByTestId('preset-name').fill('E2E プリセット')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await expect(page.getByTestId('preset-list')).toContainText('E2E プリセット')

      // 軸を崩してから適用すると、保存した全軸が復元される。
      await folder(page).selectOption({ label: 'E2E Windows Project' })
      await page.getByRole('combobox', { name: '権限モード' }).selectOption('default')
      await page
        .getByTestId('preset-list')
        .getByRole('listitem')
        .filter({ hasText: 'E2E プリセット' })
        .getByRole('button', { name: '適用' })
        .click()
      await expect(folder(page)).toHaveValue('e2e-folder')
      await expect(model(page)).toHaveValue('e2e-sonnet')
      await expect(page.getByRole('combobox', { name: '権限モード' })).toHaveValue('plan')

      // 起動 (main の検証を通り、合成 stream の composer に到達する)。
      await page.getByRole('button', { name: '起動', exact: true }).click()
      await page
        .getByRole('textbox', { name: 'メッセージ', exact: true })
        .waitFor({ state: 'visible', timeout: 30_000 })
    } finally {
      await app.close()
    }
  })

  test('削除済み Provider を含むプリセットを適用 → リセット通知 → 起動で既定 Provider の確認が出る (US-2 AC2・AC3 / SC-004)', async () => {
    const { app, page } = await launchApp()
    try {
      await openDialog(page)
      // seed のプリセット (削除済み Provider `e2e-removed` を参照する) を適用する。起動はしない (FR-011)。
      await page
        .getByTestId('preset-list')
        .getByRole('listitem')
        .filter({ hasText: 'E2E 削除済み Provider' })
        .getByRole('button', { name: '適用' })
        .click()
      await expect(folder(page)).toHaveValue('e2e-folder')

      // Provider は既定に戻り、理由が通知される。
      await expect(page.getByRole('status', { name: '既定に戻した軸' })).toContainText(
        '削除されていた'
      )
      await expect(provider(page)).toHaveValue('')

      // 起動は既定 Provider での確認を経る (黙って既定の資格情報・課金先で起動しない)。
      await page.getByRole('button', { name: '起動', exact: true }).click()
      const confirm = page.getByRole('alertdialog', { name: '既定 Provider での起動の確認' })
      await expect(confirm).toContainText('既定の資格情報と課金先')
      await confirm.getByRole('button', { name: '既定 Provider で起動する' }).click()
      await page
        .getByRole('textbox', { name: 'メッセージ', exact: true })
        .waitFor({ state: 'visible', timeout: 30_000 })
    } finally {
      await app.close()
    }
  })
})
