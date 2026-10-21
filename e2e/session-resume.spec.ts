import { expect, test, type Locator, type Page } from '@playwright/test'

import { launchApp, openLaunchDialog, reachActiveComposer, runningRows } from './support/launch'

/**
 * X-9 / FE-021 — **稼働中の行の再開の E2E** (SC-006。spec 021)。
 *
 * credential-free (AD-038 D3)。本物の起動調停・本物の再開の調停 (`createResumeService`) に fake の supervisor 接続
 * (`src/main/app/e2e-capability.ts`) を差して動かす。実機の `claude` は要らない。
 *
 * 合成プロンプト `__e2e_conversation__` を送ると、fake の supervisor 接続が固定の会話の id を 1 回送る
 * (本物のセッションスレッドの最初の `init` の代わり)。終了した行に「再開」が出る。
 */

const CONVERSATION_PROMPT = '__e2e_conversation__'

function rows(page: Page): Locator {
  return runningRows(page)
}

function composerOf(page: Page): Locator {
  return page.getByRole('textbox', { name: 'メッセージ', exact: true })
}

/** 2 本目以降の起動 (直前の起動設定のまま)。 */
async function launchAnother(page: Page): Promise<void> {
  await openLaunchDialog(page)
  const folder = page.getByRole('combobox', { name: '作業フォルダ' })
  if ((await folder.inputValue()) === '') {
    await folder.selectOption({ index: 1 })
    await page
      .getByRole('combobox', { name: 'ランタイム', exact: true })
      .selectOption({ label: 'E2E-Ubuntu' })
  }
  await page.getByRole('button', { name: '起動', exact: true }).click()
  await composerOf(page).waitFor()
}

/** 表示中の行に合成プロンプトを送り、応答待ちになるまで待つ (会話の id を持つ行になる)。 */
async function sendConversationPrompt(page: Page, index: number): Promise<void> {
  const composer = composerOf(page)
  await composer.fill(CONVERSATION_PROMPT)
  await composer.press('Enter')
  await expect(rows(page).nth(index).getByTestId('session-row-status')).toHaveText('応答待ち')
}

async function endRow(page: Page, index: number): Promise<void> {
  const row = rows(page).nth(index)
  await row.getByRole('button', { name: '終了', exact: true }).click()
  await expect(row.getByTestId('session-row-status')).toHaveText('終了済み')
}

/** 行の「再開」を押し、再開の形のダイアログで「再開する」を押す。 */
async function resumeRow(page: Page, index: number): Promise<void> {
  await rows(page).nth(index).getByRole('button', { name: '再開', exact: true }).click()
  await page.getByRole('heading', { name: 'セッションを再開' }).waitFor()
  await page.getByRole('button', { name: '再開する', exact: true }).click()
}

test.describe('稼働中の行の再開 (X-9)', () => {
  test('受け付けると元の行が消えて新しい行が選ばれる (SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachActiveComposer(page)
      await sendConversationPrompt(page, 0)
      await endRow(page, 0)

      await resumeRow(page, 0)

      await expect(page.getByRole('heading', { name: 'セッションを再開' })).toHaveCount(0)
      await expect(rows(page)).toHaveCount(1)
      await expect(rows(page).nth(0).getByTestId('session-row-status')).toHaveText('プロンプト待ち')
      await expect(rows(page).nth(0).getByRole('button').first()).toHaveAttribute(
        'aria-current',
        'true'
      )
    } finally {
      await app.close()
    }
  })

  test('上限で拒否されたら理由が出て元の行が残る (SC-006)', async () => {
    test.setTimeout(120_000)
    const { app, page } = await launchApp()
    try {
      await reachActiveComposer(page)
      await sendConversationPrompt(page, 0)
      await endRow(page, 0)
      // 終了済みの行は枠に数えない。あと 10 本起動して枠を埋める。
      for (let i = 1; i <= 10; i += 1) {
        await launchAnother(page)
        await expect(rows(page)).toHaveCount(i + 1)
      }

      await resumeRow(page, 0)
      await expect(page.getByRole('alert')).toContainText('10 件まで')
      // ダイアログは開いたまま。閉じても元の行が残る。
      await page.keyboard.press('Escape')
      await expect(page.getByRole('heading', { name: 'セッションを再開' })).toHaveCount(0)
      await expect(rows(page)).toHaveCount(11)
      await expect(rows(page).nth(0).getByTestId('session-row-status')).toHaveText('終了済み')
      await expect(
        rows(page).nth(0).getByRole('button', { name: '再開', exact: true })
      ).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('同じ会話が動いていれば起動せず、その行を選ぶ (SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      // 行 0 は動いたまま (同じ会話の id を持つ)。行 1 は同じ会話の id で終了済み。行 2 は会話の id を持たず選択中。
      await reachActiveComposer(page)
      await sendConversationPrompt(page, 0)
      await launchAnother(page)
      await sendConversationPrompt(page, 1)
      await endRow(page, 1)
      await launchAnother(page)
      await expect(rows(page)).toHaveCount(3)
      await expect(rows(page).nth(2).getByRole('button').first()).toHaveAttribute(
        'aria-current',
        'true'
      )

      await resumeRow(page, 1)

      await expect(page.getByRole('heading', { name: 'セッションを再開' })).toHaveCount(0)
      // 起動していない (行は 3 のまま)。動いている行 0 が選ばれ、終了済みの行 1 は残る。
      await expect(rows(page)).toHaveCount(3)
      await expect(rows(page).nth(0).getByRole('button').first()).toHaveAttribute(
        'aria-current',
        'true'
      )
      await expect(rows(page).nth(1).getByTestId('session-row-status')).toHaveText('終了済み')
    } finally {
      await app.close()
    }
  })
})
