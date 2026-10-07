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
const agents = resolve('src/agents')
const rendererSrc = resolve('src/renderer/src')

// 判定は時間に依らない。本機の常駐の security スタックの負荷の下で、全件実行のときだけ重いテストが既定の 5s を超える (renderer の jsdom 描画 virtualization 9.5s・LivePane 5.4s、node の live-tool-results / sdk-agent-session。単独では pass。012 の前後で差は無い。012 code-gate MF-001) ので上限を 20s にする。
const TEST_TIMEOUT_MS = 20_000

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@domain': domain, '@agents': agents } },
        test: {
          name: 'node',
          environment: 'node',
          /*
           * **`threads` を使う。**
           * 既定の `forks` は 1 ファイルごとに子プロセスを起こす。
           * このマシンは常駐 security スタックがプロセス生成を hook しており
           * 1 spawn あたり 400〜2,400ms かかるため、29 ファイル分の起動が
           * 実行時間を支配していた (実測 `forks` 28.81s / transform 93% →
           * `threads` 2.05s)。
           * この project のテストは `process.chdir` / `process.env` の書き換え /
           * `process.exit` / `worker_threads` を使わないため、
           * プロセス分離を落としても影響しない (661 テスト全 pass を確認済)。
           * 例外: `tests/ui-coverage/item21.test.ts` (O-2) は Constitution 検証の配線の発火を確かめるため
           * `child_process.spawnSync` で `check.mjs` を一時ディレクトリで起こす。テストのプロセスの状態は変えない。
           */
          pool: 'threads',
          testTimeout: TEST_TIMEOUT_MS,
          // `tests/` 側は `.test.ts` を node、`.test.tsx` を renderer に振り分ける。
          // `perf/*.test.ts` は実機計測の判定の純関数 (O-1。実機の spec `*.spec.ts` は Playwright で、ここでは拾わない)。
          include: [
            'src/{domain,main,preload,agents}/**/*.test.ts',
            'tests/**/*.test.ts',
            'perf/**/*.test.ts'
          ]
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
          testTimeout: TEST_TIMEOUT_MS,
          include: ['src/renderer/**/*.test.{ts,tsx}', 'tests/**/*.test.tsx'],
          setupFiles: ['tests/setup/renderer.ts']
        }
      }
    ]
  }
})
