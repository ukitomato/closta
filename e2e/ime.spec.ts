import { expect, test } from '@playwright/test'

import { launchApp, reachActiveComposer } from './support/launch'

/**
 * X-2 / FR-001 / FR-012 / SC-001 / T006・T019・T031 — **IME 変換確定の Enter が送信にならない (既存ガード非破壊)**。
 *
 * 検証の正本は grep でなく E2E (AD-024 #18 / AD-037 D3)。assistant-ui の `ComposerPrimitive.Input` は keydown の
 * `nativeEvent.isComposing` で確定 Enter をガードする。本 feature は onKeyDown/submitMode/Input を上書きしないため
 * ガードが保たれる。**(i) idle composer と (ii) running + message queue 有効状態 (AD-037 §4 の `isRunning && hasQueue` 分岐)**
 * の両方で確認する (H-2)。
 *
 * ⚠ **要 GUI 実行・調整**: CDP の composition 注入列 (`Input.imeSetComposition` → 確定 Enter → `Input.insertText`) と
 * DOM セレクタは実描画で調整する。ヘッドレス CI では electron の GUI 起動が要る。credential-free 到達は
 * CLOSTA_E2E stub (`support/launch.ts` / AD-038 D3。app 側フック T030 が前提)。
 */

/** composition (変換中) を再現し、その状態で確定 Enter を押す。送信経路に届かないことを検証する側で assert する。 */
async function composeAndPressEnter(
  page: import('@playwright/test').Page,
  text: string
): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  // 変換中の状態を作る。
  await cdp.send('Input.imeSetComposition', {
    text,
    selectionStart: text.length,
    selectionEnd: text.length
  })
  // 変換確定の Enter — W3C 準拠 Chromium では keydown が isComposing=true (keyCode 229) で来る (AD-037 §1)。
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    windowsVirtualKeyCode: 229,
    key: 'Process'
  })
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    windowsVirtualKeyCode: 229,
    key: 'Process'
  })
}

/**
 * 送信済み = **transcript の user メッセージ** (`[data-role="user"]`。thread.aui.tsx)。
 * composer 内の変換中テキストは `[data-slot="aui_composer-shell"]` の textarea に留まるため、
 * 「送信されていない」は user メッセージ要素へスコープして確かめる (ページ全体の getByText では composer を拾う)。
 */
function sentUserMessages(
  page: import('@playwright/test').Page,
  text: string
): import('@playwright/test').Locator {
  return page.locator('[data-role="user"]').filter({ hasText: text })
}

test.describe('IME 変換確定 Enter が送信にならない (SC-001)', () => {
  test('idle: 変換中 Enter は送信されず、確定後 Enter で送信される', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      await composer.focus()

      await composeAndPressEnter(page, 'にほんご')
      // 変換確定 Enter は送信経路に届かない (送信済み user メッセージが増えない)。
      await expect(sentUserMessages(page, 'にほんご')).toHaveCount(0)

      // 確定 (commit。active composition を置換) → 確定後の Enter (isComposing=false) で送信。
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.insertText', { text: 'にほんご' })
      await page.keyboard.press('Enter')
      await expect(sentUserMessages(page, 'にほんご')).toHaveCount(1)
    } finally {
      await app.close()
    }
  })

  test('running + queue 有効: 変換中 Enter は送信/積みに回らない (AD-037 §4 / H-2)', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      // 1 通目を送って running にする (stub は応答 stream を暫く保つ想定)。
      await composer.fill('1 から 3 まで数えて')
      await page.keyboard.press('Enter')
      // running 中 (isRunning && hasQueue 分岐) に変換中 Enter → 送信も積みもしない。
      await composer.focus()
      await composeAndPressEnter(page, 'とちゅう')
      // pending (PendingQueueNotice) に「とちゅう」が積まれていない (確定していないため)。
      await expect(page.getByText('実行後に送信予定', { exact: false })).toHaveCount(0)
    } finally {
      await app.close()
    }
  })

  test('変換中のマウス送信ボタン押下でも未確定文字列を送信しない (AC-6 / T031)', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      await composer.focus()
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', {
        text: 'みかくてい',
        selectionStart: 5,
        selectionEnd: 5
      })
      // 変換中に送信ボタンをマウスで押す。
      await page.getByRole('button', { name: 'Send message' }).click()
      // 未確定文字列がそのまま user メッセージとして送信されていない (AC-6)。
      await expect(sentUserMessages(page, 'みかくてい')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})
