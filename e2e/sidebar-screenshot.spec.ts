import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { launchApp, openLaunchDialog, reachActiveComposer, runningRows } from './support/launch'

/**
 * O-3 / SH-010 — **サイドバーの過去のセッションの区画** (FR-018 / SC-008 / 012 data-model §7)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 過去の一覧は E2E の偽の capability の固定の索引 (`e2e-capability.ts` の `e2eSessionIndex`)。合成の題と表示用の値だけで、会話の本文・設定の値・資格情報を含めない | AD-038 / H-3 |
 * | 撮る前に主ウィンドウの**内容の大きさを固定する** (CI のランナーは画面が 768px で、既定のウィンドウが縮む)。サイドバーの幅は固定 (280px) なので、区画の大きさが CI と本機で揃う | data-model §7 / 013 quickstart-results |
 * | 同梱フォントは `composer-screenshot.spec.ts` と同じく FontFace + CSSOM で当てる (アプリの CSP `style-src 'self'` が inline `<style>` を禁じる)。OS 登録などのホスト永続変更はしない | AD-038 D4 / Principle VI |
 * | 取得時刻の行 (`role="status"`) は mask する (表記がタイムゾーンで変わる)。行は `createdAt: null` で時刻を出さない | data-model §7 |
 * | グループの見出しと行は、既定の高さでは区画のスクロールの下 (取得時刻・列挙の結果・絞り込みの下) にある。撮る前に、**レイアウトは変えずに**区画のスクロールの領域をグループの並びの上端まで送る (利用者がスクロールした状態と同じ)。最初のグループの見出しと最初の行が欠けずに見えることを確かめてから撮る | spec FR-018 / data-model §7 / 012 pr-gate R1 C-001 |
 * | **基準画像は本機で作らない。** CI の e2e job の artifact から取る (本機の描画は揺れる) | spec FR-018 / 013 quickstart-results |
 * | 全画面は撮らない (O-4〜O-6 が右のペインと中央のヘッダを変えるたびに取り直しになる) | spec FR-018 |
 */

/** 撮るときの主ウィンドウの内容の大きさ。CI の画面 (1024×768。タスクバーを除く) に収まる値。 */
const CONTENT_SIZE = { width: 1000, height: 640 } as const

const PAST_ROW = '[data-slot="aui_thread-list-item"]'

/** サイドバーの「新規起動」から、直前の起動設定 (復元済み) のまま起動する (`multi-session.spec.ts` と同じ手順)。 */
async function launchAnother(page: Page): Promise<void> {
  await openLaunchDialog(page)
  const folder = page.getByRole('combobox', { name: '作業フォルダ' })
  if ((await folder.inputValue()) === '') {
    await folder.selectOption({ index: 1 })
    await page.getByRole('combobox', { name: 'ランタイム (WSL)' }).selectOption({ index: 1 })
  }
  await page.getByRole('button', { name: '起動', exact: true }).click()
}

/** `inner` の上端と下端が `outer` の中にあるか (1px の丸めを許す)。 */
function verticallyInside(
  inner: { y: number; height: number } | null,
  outer: { y: number; height: number } | null
): boolean {
  if (inner === null || outer === null) return false
  return inner.y >= outer.y - 1 && inner.y + inner.height <= outer.y + outer.height + 1
}

function pastSessions(page: Page): Locator {
  return page.getByTestId('past-sessions')
}

test.describe('サイドバーの過去のセッションの区画 (O-3 / FR-018 / SC-008)', () => {
  test('過去のセッションの区画 (見出し・検索欄・グループの見出し・行) が基準画像と一致する (FR-018)', async () => {
    const { app, page } = await launchApp()
    try {
      await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height)
      }, CONTENT_SIZE)
      await expect
        .poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]))
        .toEqual([CONTENT_SIZE.width, CONTENT_SIZE.height])

      const past = pastSessions(page)
      // 固定の索引: 登録フォルダの 4 行が描かれ、未登録の 2 行は既定で畳む。全部を読めたので列挙の結果は 1 行の要約。
      await expect(past.locator(PAST_ROW)).toHaveCount(4)
      await expect(past.getByText('列挙の結果: 2 件の対象をすべて読めました')).toBeVisible()

      const fontBase64 = readFileSync(resolve('e2e/fonts/NotoSansJP-Regular.ttf')).toString(
        'base64'
      )
      await page.evaluate(async (b64) => {
        const ff = new FontFace('E2E-JP', `url(data:font/ttf;base64,${b64}) format('truetype')`)
        await ff.load()
        document.fonts.add(ff)
        const root = document.querySelector<HTMLElement>('[data-testid="past-sessions"]')
        root?.style.setProperty('font-family', "'E2E-JP', sans-serif", 'important')
        root?.querySelectorAll<HTMLElement>('*').forEach((el) => {
          el.style.setProperty('font-family', "'E2E-JP', sans-serif", 'important')
        })
        await document.fonts.ready
      }, fontBase64)

      // グループの並び (過去の区画の thread-list の root) を、区画のスクロールの領域の上の余白の位置まで送る。フォントを当てた
      // 後に送る (字幅で高さが変わるため)。送り先は内容と大きさで決まるので、実行ごとに揃う。
      const groups = past.locator('[data-slot="aui_thread-list-root"]')
      await groups.evaluate((el) => {
        let scroller = el.parentElement
        while (scroller !== null && getComputedStyle(scroller).overflowY !== 'auto') {
          scroller = scroller.parentElement
        }
        if (scroller === null) throw new Error('過去の区画のスクロールの領域が見つかりません')
        const gap = parseFloat(getComputedStyle(scroller).paddingTop)
        scroller.scrollTop +=
          el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - gap
      })
      // FR-018 の対象が画像に入っていること: 最初のグループの見出しと最初の行が欠けずに見える。
      await expect(groups.getByRole('heading', { level: 3 }).first()).toBeInViewport({ ratio: 1 })
      await expect(past.locator(PAST_ROW).first()).toBeInViewport({ ratio: 1 })

      await expect(past).toHaveScreenshot('sidebar-past-sessions.png', {
        mask: [past.getByRole('status').filter({ hasText: '取得時刻' })]
      })
    } finally {
      await app.close()
    }
  })

  test('既定のウィンドウで稼働中の区画に compact の 10 行を出しても、過去の区画の見出しと検索欄が見え、スクロールで最初の行に届く (SC-008)', async () => {
    test.setTimeout(120_000)
    const { app, page } = await launchApp()
    try {
      // `multi-session.spec.ts` の compact の 10 本と同じ手順 (O-1 SC-003)。
      await reachActiveComposer(page)
      for (let i = 1; i < 10; i += 1) await launchAnother(page)
      await expect(runningRows(page)).toHaveCount(10)
      await page.getByRole('button', { name: 'コンパクト' }).click()
      await expect(page.getByRole('button', { name: 'コンパクト' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )

      const past = pastSessions(page)
      const sectionBox = await past.boundingBox()
      const heading = past.getByRole('heading', { name: '過去のセッション', exact: true })
      const search = past.getByRole('searchbox', { name: 'セッションを検索' })
      await expect(heading).toBeVisible()
      await expect(search).toBeVisible()
      expect(verticallyInside(await heading.boundingBox(), sectionBox)).toBe(true)
      expect(verticallyInside(await search.boundingBox(), sectionBox)).toBe(true)

      // 区画の中をスクロールして最初の行に届く (行の上端が区画の中に入り、見える)。
      const firstRow = past.locator(PAST_ROW).first()
      await firstRow.scrollIntoViewIfNeeded()
      await expect(firstRow).toBeVisible()
      const rowBox = await firstRow.boundingBox()
      expect(rowBox).not.toBeNull()
      expect(sectionBox).not.toBeNull()
      if (rowBox !== null && sectionBox !== null) {
        expect(rowBox.y).toBeGreaterThanOrEqual(sectionBox.y - 1)
        expect(rowBox.y).toBeLessThan(sectionBox.y + sectionBox.height)
      }
      // 見出しと検索欄はスクロールしても区画の上端に残る (固定)。
      expect(verticallyInside(await heading.boundingBox(), sectionBox)).toBe(true)
      expect(verticallyInside(await search.boundingBox(), sectionBox)).toBe(true)
    } finally {
      await app.close()
    }
  })
})
