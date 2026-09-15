import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * テストの設定 (SH-016)。
 *
 * **2 つの環境を分ける。**
 * - `domain` / `app` / `infra` は Node 環境。**モックゼロで書ける**ことが要件である
 *   (`domain` は I/O を持たないため。AD-023 §1 / FR-034)
 * - `ui` は jsdom 環境。**preload をスタブして** renderer 単体テストを書く
 *   (renderer は `window.closta` しか持たない。FR-039)
 *
 * テストは実装の隣に `*.test.ts` として置く。`tests/` 直下はルール検証用の
 * 違反サンプル置き場であり、通常のテストとは別物である (SH-020)。
 */

const domain = resolve('src/domain')
const rendererSrc = resolve('src/renderer/src')

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@domain': domain } },
        test: {
          name: 'node',
          environment: 'node',
          // `tests/` 側は `.test.ts` を node、`.test.tsx` を renderer に振り分ける。
          include: ['src/{domain,main,preload,agents}/**/*.test.ts', 'tests/**/*.test.ts']
        }
      },
      {
        resolve: {
          alias: {
            '@domain': domain,
            '@renderer': rendererSrc,
            '@': rendererSrc
          }
        },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          /*
           * **`threads` を使う。**
           * 既定の `forks` は 1 ファイルごとに子プロセスを起こし、
           * assistant-ui と React を含むモジュールグラフの読み込みが
           * worker の応答待ち時間 (60 秒) を超えて起動に失敗した (実測)。
           * スレッドはモジュールキャッシュを共有するので初回以降が速い。
           */
          pool: 'threads',
          include: ['src/renderer/**/*.test.{ts,tsx}', 'tests/**/*.test.tsx'],
          setupFiles: ['tests/setup/renderer.ts']
        }
      }
    ]
  }
})
