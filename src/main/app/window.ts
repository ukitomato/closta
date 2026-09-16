import { BrowserWindow, shell } from 'electron'
import icon from '@resources/icon.png?asset'

import { resolveBuildPath } from '@domain/runtime/path-api'

import { allowedOrigins, devServerOrigin, rendererEntryUrl } from './origins'
import { contentSecurityPolicy } from './protocol'

/**
 * ウィンドウ生成 (FR-039 / FR-040 / AD-023 のセキュリティ要件)。
 *
 * `webPreferences` は既定値に頼らず明示する。
 * `setWindowOpenHandler` は scaffold 由来の防御であり**維持する** —
 * CSP の `frame-ancestors` / `base-uri` はトップレベル遷移と新規ウィンドウ生成を覆わない。
 */

/** preload の出力先。`out/main` からの相対参照 (コード上のリテラル)。 */
function preloadPath(baseDir: string): string | null {
  const resolved = resolveBuildPath(baseDir, '..', 'preload', 'index.js')
  return resolved.ok ? resolved.path.value : null
}

export function createMainWindow(baseDir: string): BrowserWindow {
  const preload = preloadPath(baseDir)

  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}), // platform-ok: Linux だけが BrowserWindow に icon を要する (Electron の規約)
    webPreferences: {
      ...(preload === null ? {} : { preload }),
      // AD-023 の Electron セキュリティ要件 / FR-039。既定値に頼らず明示する。
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  // **外部 URL への遷移と新規ウィンドウ生成を拒否する** (AD-023 のチェックリスト項目)。
  // 外部リンクは OS の既定ブラウザへ委譲する。
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // トップレベル遷移も配信元 origin の外へは行かせない。
  window.webContents.on('will-navigate', (event, url) => {
    const origins = allowedOrigins()
    let origin: string
    try {
      origin = new URL(url).origin
    } catch {
      event.preventDefault()
      return
    }
    if (!origins.includes(origin)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  // dev サーバから配信する場合、CSP はレスポンスヘッダで付かないため
  // ここで注入する。パッケージ済みビルドはプロトコルハンドラが付ける。
  const dev = devServerOrigin()
  if (dev !== null) {
    window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [contentSecurityPolicy(dev)]
        }
      })
    })
  }

  void window.loadURL(rendererEntryUrl())

  return window
}
