import { defineConfig } from '@playwright/test'

/**
 * Playwright + Electron の E2E 設定 (X-2 / AD-038 D1)。
 *
 * - **`_electron.launch` でアプリ同梱の Electron/Chromium を起動する** — `playwright install` の独立ブラウザ取得はしない
 *   (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` 相当。供給網面を増やさない。AD-038 D1 / design-gate L-5)。
 * - Electron は単一インスタンスのため `fullyParallel: false` / `workers: 1`。
 * - スクリーンショット比較は基準画像をリポジトリ (`e2e/__screenshots__/`) に commit する (AD-038 D5)。
 * - **導入**: `pnpm add -D @playwright/test` (postinstall のブラウザ取得は不要)。`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`。
 *
 * このハーネスの scope は Principle VIII の 2 項目 (IME E2E / 日本語スクリーンショット) のみ (AD-038 D6)。
 * スクロール安定 E2E / Principle IX 到達集合検査は載せない (roadmap の deferred feature)。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: {
    // 日本語フォント/描画差の許容は最小に。基準画像は同梱フォントで撮る (AD-038 D4)。
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 }
  },
  reporter: process.env.CI ? 'github' : 'list'
})
