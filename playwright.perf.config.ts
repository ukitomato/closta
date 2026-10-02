import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig } from '@playwright/test'

/**
 * 実機計測 (O-1 FR-012 / SC-005) の Playwright 設定。**CI では実行しない** (AD-038 D3 の CI 経路の外)。
 *
 * - 実 `claude` 10 本・WSL の実行環境・登録済みの Provider を要し、トークンを消費する。**agent は利用者の明示的な指示が
 *   あるときだけ実行する** (docs/discovery.md の Build / Test / Lint 表)
 * - `testDir: './perf'` — `e2e/` の外に置くので、CI の e2e job (spec を名指し) にも全体実行 (`-c playwright.config.ts`) にも載らない
 * - trace / screenshot / video は off、reporter は list、出力はリポジトリの外 (OS の一時ディレクトリ)。会話の本文や
 *   作業フォルダの内容を成果物に残さない (research R-07)
 */
if (process.env.CI) {
  throw new Error('perf (実機計測) は CI で実行しない (AD-038 D3 / O-1 FR-012)。')
}

export default defineConfig({
  testDir: './perf',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // 10 本の起動 + 応答中になるまでの待ち + 30 秒の窓 + 後始末。
  timeout: 300_000,
  outputDir: join(tmpdir(), 'closta-perf-results'),
  reporter: 'list',
  use: { trace: 'off', screenshot: 'off', video: 'off' }
})
