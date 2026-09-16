import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// domain は全プロセスに配られる。I/O を持たないため main / preload / renderer の
// いずれからも同じ別名で参照できるようにする (AD-023 §1)。
const domain = resolve('src/domain')

// `?asset` で取り込む同梱リソース。**相対パスで書かない** — 相対指定は
// レイヤ検証 (eslint-plugin-boundaries) がビルドツールの仮想モジュールとして
// 分類できず、依存グラフの穴になる。別名にすると「外部」と判定される。
const resources = resolve('resources')

export default defineConfig({
  main: {
    resolve: {
      alias: { '@domain': domain, '@resources': resources }
    }
  },
  preload: {
    resolve: {
      alias: { '@domain': domain }
    },
    // preload は CommonJS で出力する。electron-vite の既定と同じ値だが、
    // `sandbox: true` と両立する唯一の形であるため既定に依存せず固定する
    // (ESM preload は `.mjs` + unsandboxed を要求する。AD-023 の検証済み事実)。
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // assistant-ui の element は `@/components/...` / `@/lib/utils` を import する。
        // shadcn 規約の `@` を renderer のソースルートに向ける。
        '@': resolve('src/renderer/src'),
        '@domain': domain
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
