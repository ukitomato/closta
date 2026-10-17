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

  test('変換中に / を含む文字を打っても候補が出ず、Enter は変換の確定に使われる (O-10 SC-006)', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      await composer.focus()
      await composeAndPressEnter(page, '/にほんご')
      // コマンドの候補は出ず (ライブラリの isComposing のガード)、Enter は送信にも候補の選択にも使われない。
      await expect(page.locator('[data-slot="composer-command-popover"]')).toHaveCount(0)
      await expect(sentUserMessages(page, 'にほんご')).toHaveCount(0)
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
      await page.getByRole('button', { name: '送信' }).click()
      // 未確定文字列がそのまま user メッセージとして送信されていない (AC-6)。
      await expect(sentUserMessages(page, 'みかくてい')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})

/**
 * O-3 / 012 SC-002 / US-2 AC7 — **会話内検索のバーで変換確定の Enter が次の一致への移動にならない**。
 * 検索のバーの Enter / Shift+Enter / Esc は `isComposing` / 229 のときに何もしない (`ConversationSearchProvider`)。
 * jsdom はキーの発火順を再現しないので、実描画の Chromium で確かめる (plan RK-06)。
 */
test.describe('会話内検索のバーの IME (012 SC-002)', () => {
  test('検索のバーで変換中に Enter を押しても次の一致へ移らず、変換が確定できる', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      // 一致が 2 つある本文を transcript に置く (E2E stub の応答の文には語が無い)。
      await composer.fill('りんご と りんご')
      await page.keyboard.press('Enter')
      await expect(sentUserMessages(page, 'りんご と りんご')).toHaveCount(1)

      // 中央のヘッダの検索のボタンで検索のバーを開く (入力欄にフォーカスが移る)。
      await page
        .getByTestId('center-header')
        .getByRole('button', { name: '会話内を検索', exact: true })
        .click()
      const searchBar = page.getByTestId('conversation-search')
      const searchInput = searchBar.getByRole('searchbox', { name: '会話内を検索', exact: true })
      const position = searchBar.getByRole('status')
      await expect(searchInput).toBeFocused()

      // 変換中の状態で語を入れる (未確定の文字列でも、間引きの後に件数と位置が出る)。
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', {
        text: 'りんご',
        selectionStart: 3,
        selectionEnd: 3
      })
      await expect(position).toHaveText('1 / 2 件')

      // 変換確定の Enter (isComposing=true / keyCode 229) は次の一致への移動にならない。
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
      // 間引き (150ms) を越えて待ってから、位置が動いていないことを確かめる (動かないことの確認なので待つ)。
      await page.waitForTimeout(400)
      await expect(position).toHaveText('1 / 2 件')

      // 変換を確定できる (確定した語が入力欄に残り、位置もそのまま)。
      await cdp.send('Input.insertText', { text: 'りんご' })
      await expect(searchInput).toHaveValue('りんご')
      await expect(position).toHaveText('1 / 2 件')

      // 確定した後の Enter (変換していない) は次の一致へ移る (ガードが変換中のキーだけを止めている)。
      await page.keyboard.press('Enter')
      await expect(position).toHaveText('2 / 2 件')
    } finally {
      await app.close()
    }
  })
})

/**
 * O-3 / 012 SC-003 / US-3 AC5 — **composer で変換中に Ctrl+K を押しても Command palette が開かない**。
 * palette の Ctrl+K は `window` の keydown (capture) で受け、`isComposing` / 229 のときは何もしない (`preventDefault` も
 * しない。`CommandPalette`)。jsdom はキーの発火順を再現しないので、実描画の Chromium で確かめる (plan RK-06)。
 */
test.describe('Command palette の Ctrl+K と IME (012 SC-003)', () => {
  test('composer で変換中に Ctrl+K を押しても palette が開かず、変換が確定できる', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      await composer.focus()
      const paletteDialog = page.getByRole('dialog', { name: 'コマンド', exact: true })

      // 変換中の状態を作る。
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', {
        text: 'にほんご',
        selectionStart: 4,
        selectionEnd: 4
      })

      // 変換中に Ctrl+K (Blink は変換中の keydown に isComposing=true を付ける)。palette は開かない。
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        modifiers: 2,
        key: 'k',
        code: 'KeyK',
        windowsVirtualKeyCode: 75
      })
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        modifiers: 2,
        key: 'k',
        code: 'KeyK',
        windowsVirtualKeyCode: 75
      })
      // 開かないことの確認なので、ダイアログの描画を待てるだけ待ってから数える。
      await page.waitForTimeout(400)
      await expect(paletteDialog).toHaveCount(0)
      await expect(composer).toBeFocused()

      // 変換を確定できる (確定した語が composer に残る)。
      await cdp.send('Input.insertText', { text: 'にほんご' })
      await expect(composer).toHaveValue('にほんご')

      // 確定した後の Ctrl+K (変換していない) は palette を開く (ガードが変換中のキーだけを止めている)。
      await page.keyboard.press('Control+K')
      await expect(paletteDialog).toBeVisible()
      await expect(
        paletteDialog.getByRole('combobox', { name: '操作やセッションを探す', exact: true })
      ).toBeFocused()

      // Esc で閉じると composer へ戻り、確定した語はそのまま。
      await page.keyboard.press('Escape')
      await expect(paletteDialog).toHaveCount(0)
      await expect(composer).toBeFocused()
      await expect(composer).toHaveValue('にほんご')
    } finally {
      await app.close()
    }
  })
})
