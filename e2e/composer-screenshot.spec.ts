import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { launchApp, reachActiveComposer } from './support/launch'

/**
 * X-2 / FR-002 / FR-010 / SC-002 / T008 — **全角混在で composer のレイアウトが崩れない (日本語スクリーンショット比較)**。
 *
 * 基準画像は同梱フォントで撮り commit する (AD-038 D4/D5)。フォントは **非永続注入** で与える — アプリの CSP
 * (`style-src 'self'`) が inline `<style>` を禁じるため addStyleTag は使えず、**FontFace API + CSSOM** で入れる
 * (`font-src 'self' data:` に従う)。OS 登録・Fonts 複製・fc-cache・パッケージマネージャ導入はしない (Principle VI。H-101)。
 * 基準画像に会話本文・config 由来情報を含めない (H-3)。
 *
 * ⚠ **要 GUI 実行・調整**: 初回は `--update-snapshots` で基準画像を生成し、**視覚的妥当性 (全角の行送り・折返しの見え) を
 * 人間が承認**してから commit する (quickstart V-2 / 人間 deferred。R-3 rubric-b と同じ扱い)。承認者・根拠を quickstart-results.md に記録。
 * 同梱フォント `e2e/fonts/NotoSansJP-Regular.ttf` (等) を用意すること。
 */

const FULL_WIDTH_MIXED = [
  '日本語と英数字 ABC123 が混在するテキスト。',
  '全角記号（）「」！？と半角 ()[]!? の混在、',
  '絵文字 😀🎌 も含む長い行で折返しと行送りを確認する。'
].join('\n')

test.describe('全角混在レイアウト (SC-002)', () => {
  test('全角・半角・絵文字混在の composer が基準画像と一致する', async () => {
    const { app, page } = await launchApp()
    try {
      const composer = await reachActiveComposer(page)
      await composer.fill(FULL_WIDTH_MIXED)

      // **同梱フォントを CSP を壊さずに非永続注入する。** アプリの CSP は `style-src 'self'` で inline `<style>` を禁じるため
      // Playwright の `addStyleTag` (inline style) は使えない (実走で発覚)。一方 `font-src 'self' data:` は data URL フォントを
      // 許すので、**FontFace API (script 経由) で font を登録し、font-family は CSSOM (`el.style`) で当てる** — どちらも
      // CSP style-src に抵触しない。OS 登録・Fonts 複製・fc-cache・パッケージマネージャ導入はしない (Principle VI / H-101 / AD-038 D4)。
      const fontBase64 = readFileSync(resolve('e2e/fonts/NotoSansJP-Regular.ttf')).toString(
        'base64'
      )
      await page.evaluate(async (b64) => {
        const ff = new FontFace('E2E-JP', `url(data:font/ttf;base64,${b64}) format('truetype')`)
        await ff.load()
        document.fonts.add(ff)
        document.querySelectorAll<HTMLElement>('.aui-composer-input').forEach((el) => {
          el.style.setProperty('font-family', "'E2E-JP', sans-serif", 'important')
        })
        await document.fonts.ready
      }, fontBase64)

      // composer の shell を対象に基準画像比較 (会話本文は含めない = credential/config-free)。
      const shell = page.locator('[data-slot="aui_composer-shell"]')
      await expect(shell).toHaveScreenshot('composer-fullwidth.png')
    } finally {
      await app.close()
    }
  })
})
