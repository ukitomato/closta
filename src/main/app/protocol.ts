import { readFile } from 'node:fs/promises'
import { protocol } from 'electron'

import { hostPathOps, isValidHostSegment, resolveBuildPath } from '@domain/runtime/path-api'
import type { HostPath } from '@domain/runtime/path-types'

import { APP_SCHEME, devServerOrigin } from './origins'

/**
 * renderer をカスタムプロトコルで配信する (FR-040 / AD-023 のセキュリティ要件 6)。
 *
 * `file://` を使わないのは、`file://` の緩い同一オリジン扱いを避けるためである。
 * ただし**スキームを変えただけでは何も守れない** — ハンドラが要求パスを
 * そのままファイルシステムに結合すると、任意ファイルが renderer に入る。
 */

/**
 * Content-Security-Policy。
 *
 * 「絞る」とだけ決めると、満たしたまま防御効果を 0 にできる (FR-040)。directive を明示する。
 *
 * **`unsafe-eval` は両環境で禁じる。**
 *
 * **`unsafe-inline` は開発ビルドの `script-src` / `style-src` に限り許す。**
 * これは実測に基づく。`@vitejs/plugin-react` の React Refresh preamble と
 * Vite client はインライン script / style を使うため、禁じると開発ビルドで
 * `@vitejs/plugin-react can't detect preamble` となり**アプリが起動しない**。
 * 公式の dev フロー (AD-023 が土台とするもの) と両立しない。
 *
 * 緩和は**本関数の 1 箇所にのみ現れる**。ゲートは `app.isPackaged` であり
 * 環境変数ではない — 環境変数だと出荷物でも 1 つで有効化できてしまう。
 * SH-014 の検証項目は「`unsafe-inline` が本関数の dev 分岐以外に現れないこと」と
 * 「`unsafe-eval` がどこにも現れないこと」を確認する。
 */
export function contentSecurityPolicy(devOrigin: string | null): string {
  const self = "'self'"
  const isDev = devOrigin !== null

  const script = [self]
  const style = [self]
  const connect: string[] = []
  const img = [self, 'data:']

  if (isDev) {
    script.push(devOrigin, "'unsafe-inline'")
    style.push(devOrigin, "'unsafe-inline'")
    // Vite の HMR は WebSocket を張る。
    connect.push(devOrigin, devOrigin.replace(/^http/, 'ws'))
  }

  return [
    "default-src 'none'",
    `script-src ${script.join(' ')}`,
    `style-src ${style.join(' ')}`,
    `img-src ${img.join(' ')}`,
    `font-src ${self} data:`,
    `connect-src ${connect.length === 0 ? "'none'" : connect.join(' ')}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

/**
 * スキームを特権スキームとして登録する。**`app.whenReady()` より前に呼ぶ。**
 * standard / secure を宣言しないと相対 URL の解決と Secure Context が成立しない。
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
}

function mimeTypeOf(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot < 0 ? '' : name.slice(dot).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * 要求 URL を同梱 renderer 出力配下のパスへ解決する。
 *
 * **正規化後も出力ディレクトリ配下に収まる要求だけを解決する。**
 *
 * 脱出の試みは 3 段で止まる。**どの段も単独では足りない。**
 *
 * | 段 | 止まるもの |
 * |---|---|
 * | `new URL()` の正規化 | 素の `..` と `%2e%2e` (WHATWG URL がセグメントを畳む) |
 * | `decodeURIComponent` 後のセグメント検証 | セパレータまで符号化した形 (`%2e%2e%2f`)、NUL、制御文字 |
 * | `isValidHostSegment` | **`:` を含む形** — `index.html:stream` は代替データストリームを、`C:` はドライブ相対を指す |
 *
 * **3 段目が要る理由**: `:` を通すと、接頭辞照合 (`startsWith`) は成立するのに
 * パスが指すものが同梱ファイルではなくなる。封じ込めを接頭辞だけで守ろうとすると漏れる。
 *
 * `hostPathOps.join` も同じ検証を行うため、結合自体が二重の防御になる。
 */
export function resolveRequest(rendererDir: HostPath, requestUrl: string): HostPath | null {
  let pathname: string
  try {
    pathname = new URL(requestUrl).pathname
  } catch {
    return null
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // 不正な percent-encoding。拒否する。
    return null
  }

  const segments = decoded.split('/').filter((s) => s.length > 0)
  const target = segments.length === 0 ? ['index.html'] : segments

  for (const segment of target) {
    if (!isValidHostSegment(segment)) return null
  }

  const joined = hostPathOps.join(rendererDir, ...target)
  if (!joined.ok) return null

  // 封じ込めの再確認。`join` が `..` を拒否しているため構造上ここは通るが、
  // 「スキームを変えただけでは守れない」ことを検査として残す。
  const base = rendererDir.value.endsWith('\\') ? rendererDir.value : `${rendererDir.value}\\`
  if (!joined.path.value.startsWith(base)) return null

  return joined.path
}

/** 同梱 renderer 出力ディレクトリ。`out/main` からの相対参照 (コード上のリテラル)。 */
export function rendererOutputDir(baseDir: string): HostPath | null {
  const resolved = resolveBuildPath(baseDir, '..', 'renderer')
  return resolved.ok ? resolved.path : null
}

/**
 * プロトコルハンドラを登録する。**`app.whenReady()` の後に呼ぶ。**
 *
 * 開発ビルドでは renderer を dev サーバから読むためこのハンドラは使われないが、
 * **登録は両環境で行う** — 環境で分岐させると片方だけ検証されない構成が生まれる。
 */
export function registerAppProtocol(baseDir: string): void {
  const rendererDir = rendererOutputDir(baseDir)

  protocol.handle(APP_SCHEME, async (request) => {
    if (rendererDir === null) return new Response(null, { status: 500 })

    const target = resolveRequest(rendererDir, request.url)
    if (target === null) return new Response(null, { status: 403 })

    try {
      const body = await readFile(target.value)
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': mimeTypeOf(target.value),
          'Content-Security-Policy': contentSecurityPolicy(devServerOrigin())
        }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
