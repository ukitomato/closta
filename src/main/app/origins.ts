import { app } from 'electron'

/**
 * renderer の配信元と、IPC の送信元として許可する origin (FR-039 / FR-040)。
 *
 * **許可する origin の集合は本ファイルの 1 定数に集約する。**
 * 送信元の検証は「配信元 origin の main frame からの呼び出しである」ことの確認であり、
 * **環境で検証を無効化する分岐を作らない** — 無効化の分岐は出荷物でも条件 1 つで外せる形になる。
 *
 * 開発ビルドでは electron-vite の dev サーバから配信されるため、その origin を
 * 集合に含める。これは検証の無効化ではなく**配信元の追加**である。
 * (round 5 の gate で実測: `pnpm dev` の renderer は `http://localhost:5173/` から配信される。)
 */

/** アプリ内で登録するカスタムプロトコルのスキーム。`file://` は使わない (FR-040)。 */
export const APP_SCHEME = 'closta'

/** パッケージ済みビルドの配信元 origin。 */
export const PACKAGED_ORIGIN = `${APP_SCHEME}://app`

/**
 * 開発ビルドかどうか。
 *
 * **`app.isPackaged` を使う。** 環境変数で判定すると、出荷物でも環境変数 1 つで
 * 開発時の緩和を有効化できてしまう (round 5 security E-H004)。
 */
export function isDevBuild(): boolean {
  return !app.isPackaged
}

/** 開発ビルドの配信元 origin。electron-vite が `ELECTRON_RENDERER_URL` で渡す。 */
export function devServerOrigin(): string | null {
  if (!isDevBuild()) return null
  const url = process.env['ELECTRON_RENDERER_URL']
  if (url === undefined || url.length === 0) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * 許可する origin の集合。
 *
 * SH-014 の検証項目は「送信元 origin 定数が 1 つであること」を確認する —
 * 集合がここ以外に現れたら、検証を迂回する分岐が生まれている。
 */
export function allowedOrigins(): readonly string[] {
  const origins = [PACKAGED_ORIGIN]
  const dev = devServerOrigin()
  if (dev !== null) origins.push(dev)
  return origins
}

/** renderer を読み込む URL。 */
export function rendererEntryUrl(): string {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (isDevBuild() && url !== undefined && url.length > 0) return url
  return `${PACKAGED_ORIGIN}/index.html`
}
