import { expect, test, type Page } from '@playwright/test'

import { launchApp, reachActiveComposer } from './support/launch'

/**
 * 025 / FE-054 — **`/resume` で過去のセッションを選んで再開する** E2E (SC-006。US-5)。
 *
 * credential-free。fake の capability (`src/main/app/e2e-capability.ts`) は、登録フォルダ (`E2E Project`) の固定の索引の
 * 行 3 件を持ち、その行の再開の軸を解ける。選んだ後は再開の形の起動ダイアログが開くところまで確かめる (起動はしない)。
 * 稼働中の行の再開は `session-resume.spec.ts`。
 */

const PICKER = 'resume-picker'

async function sendResume(page: Page): Promise<void> {
  const composer = page.getByRole('textbox', { name: 'メッセージ', exact: true })
  // 末尾の空白で候補の popover を閉じてから送る (Enter が候補の確定に取られない)。
  await composer.fill('/resume ')
  await composer.press('Enter')
}

test.describe('/resume (025)', () => {
  test('送信は Claude Code に送られず、選ぶ画面で 1 つ選ぶと再開の形の起動ダイアログが開く (SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      await reachActiveComposer(page)
      await sendResume(page)

      const picker = page.getByTestId(PICKER)
      await expect(picker).toBeVisible()
      // transcript に利用者の発話の行が増えない (送られていない)。
      await expect(page.getByText('/resume', { exact: true })).toHaveCount(0)

      // 同じフォルダの過去のセッション 3 件だけが並ぶ (Windows 版のフォルダの行は出ない)。
      await expect(picker.getByRole('option')).toHaveCount(3)
      await expect(picker.getByText('Windows 版のビルド手順 2026')).toHaveCount(0)

      await picker.getByRole('option', { name: /テストを 3 段の並列に分ける/ }).click()

      await expect(page.getByRole('heading', { name: 'セッションを再開' })).toBeVisible()
      await expect(page.getByTestId(PICKER)).toHaveCount(0)
    } finally {
      await app.close()
    }
  })

  test('Esc で閉じると composer に戻り、入力は空 (SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      await sendResume(page)
      await expect(page.getByTestId(PICKER)).toBeVisible()

      await page.keyboard.press('Escape')

      await expect(page.getByTestId(PICKER)).toHaveCount(0)
      await expect(composer).toBeFocused()
      await expect(composer).toHaveValue('')
    } finally {
      await app.close()
    }
  })
})
