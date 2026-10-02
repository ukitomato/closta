import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'node:path'

/**
 * E2E harness の共通起動ヘルパ (X-2 / AD-038 D1・D3 / T030)。
 *
 * ## credential-free 到達 (AD-038 D3 / design-gate H-3 / security M-001)
 *
 * IME E2E / スクリーンショットは **有効な composer (active phase・`isDisabled: false`)** を要する。これは通常
 * `launchSession` の成功 = 実行中 WSL runtime + Claude Code 認証を前提とするが、E2E に real な資格情報・WSL・外部 API を
 * **一切持ち込まない** (Principle V)。そのため:
 *
 * - 起動時に `CLOSTA_E2E=1` を渡す。
 * - **app 側フック (実装済み。T030)**: `src/main/index.ts` は **`!app.isPackaged && process.env.CLOSTA_E2E === '1'`** のときだけ、
 *   `createComposition()` の代わりに `createE2eCapability()` (`src/main/app/e2e-capability.ts`) を配線し **`IpcDependencies` を
 *   差し替える** (fake の folder/runtime を seed / X-5 以降は**本物の起動調停** (`createSessionLaunchService`) に
 *   fake の supervisor 接続を差し、`MessageChannelMain` で合成 stream・状態通知を流す)。**preload は本番と同一** — 第 2 の exposeInMainWorld を作らず単一 capability 境界 (FR-039) を保つ。
 *   **packaged では `app.isPackaged` が true になり無効 = production-inert** (env 単独ゲートにしない。AD-038 D3)。
 *
 * ## フォント (AD-038 D4 / H-101)
 *
 * 日本語フォントはリポジトリ同梱 (`e2e/fonts/*.ttf`) を **非永続注入** (`FontFace` API + CSSOM。アプリの CSP が inline `<style>` を
 * 弾くため addStyleTag は使わず `font-src 'self' data:` に従う) で与える。OS 登録・Fonts 複製・fc-cache・パッケージマネージャ導入 等の
 * ホスト永続変更はしない (Principle VI)。
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: {
      ...process.env,
      CLOSTA_E2E: '1', // app 側フック (!app.isPackaged 限定) が stub capability を有効化する
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

/**
 * 起動 entry (フォルダ + ランタイム選択 → 起動) を通って有効 composer (active phase) に到達する。
 * CLOSTA_E2E stub が fake の folder/runtime を seed し launchSession を成功させる前提 (T030)。
 * 戻り値は composer の textarea (`aria-label="Message input"`。thread.aui.tsx の ComposerPrimitive.Input)。
 */
export async function reachActiveComposer(page: Page): Promise<import('@playwright/test').Locator> {
  // 既定画面は 'runtimes'。X-1 のセッション起動画面 (SessionScreen) へ nav で遷移する (App.tsx / stores/ui.ts)。
  await page.getByRole('button', { name: 'セッション起動' }).click()

  // 起動設定ダイアログ (X-4) のフォルダ / ランタイムを stub seed の先頭で埋めて起動する。
  // Provider / モデル / effort / 権限モードは既定のまま (既定 Provider は X-1 と同じ curated base で起動する)。
  // **select は位置でなく label で拾う** (X-5 SH-011。2 ペイン化で画面に並ぶ要素が増えても壊れない)。
  const folderSelect = page.getByRole('combobox', { name: '作業フォルダ' })
  const runtimeSelect = page.getByRole('combobox', { name: 'ランタイム (WSL)' })
  await folderSelect.selectOption({ index: 1 }) // index 0 は「選択してください」
  await runtimeSelect.selectOption({ index: 1 })
  // exact 一致にする — nav の「セッション起動」も「起動」を部分一致で拾うため (strict mode 回避)。
  await page.getByRole('button', { name: '起動', exact: true }).click()

  const composer = page.getByRole('textbox', { name: 'Message input' })
  await composer.waitFor({ state: 'visible', timeout: 30_000 })
  return composer
}
