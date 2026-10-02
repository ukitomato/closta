import { BrowserWindow, shell } from 'electron'
import icon from '@resources/icon.png?asset'

import { resolveBuildPath } from '@domain/runtime/path-api'

import { decideNavigation } from './navigation-policy'
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

/**
 * OS の既定ハンドラへ渡すのは **http(s) のみ**にする (pr-gate security H-004 / CWE-749)。
 *
 * R-3 以降は会話由来 (攻撃者制御可能) の markdown リンクを描画する。renderer 側の URL allowlist
 * (`safe-url.ts`) が第一防御だが、main の `shell.openExternal` は OS ハンドラを起動する信頼境界であり、
 * renderer フィルタと**独立した最終防御**を持つ (`file:` / `smb:` / カスタム scheme を OS へ渡さない)。
 */
function openExternalIfHttp(url: string): void {
  let protocol: string
  try {
    protocol = new URL(url).protocol
  } catch {
    return
  }
  if (protocol === 'http:' || protocol === 'https:') void shell.openExternal(url)
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
    openExternalIfHttp(url)
    return { action: 'deny' }
  })

  /*
   * **トップレベル遷移はすべて拒否する** (X-5 / design-gate R3-H-02)。renderer は SPA で、正当な文書遷移を持たない。
   * 同一 origin の遷移 (会話由来 markdown の相対リンクなど) も拒否する — 許すと文書が入れ替わり、renderer の保持と
   * 全セッションの port が失われる (index.ts は文書の入れ替わりで全セッションを止める)。
   * 配信元 origin の外の http(s) だけを OS の既定ブラウザへ委譲する。再読み込みは `will-navigate` を発火しない。
   */
  window.webContents.on('will-navigate', (event, url) => {
    // 判定は純関数 (navigation-policy.ts) が持ち、負例を単体で固定する (pr-gate R1 security M-001)。
    const decision = decideNavigation(url, allowedOrigins())
    if (decision.prevent) event.preventDefault()
    if (decision.openExternal) openExternalIfHttp(url)
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
