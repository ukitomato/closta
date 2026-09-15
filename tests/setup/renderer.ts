import '@testing-library/jest-dom/vitest'

import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * renderer 単体テストの準備 (SH-016)。
 *
 * ここは **vitest の `setupFiles`** であり、毎テストの前後処理だけを持つ。
 *
 * preload のスタブ本体は `src/renderer/src/test-support/capability.ts` に置く —
 * `src` 側のテストから import する必要があり、`tests/` に置くと
 * `src → tests` の依存になってレイヤ規則に掛かる (`not-to-test`)。
 * 逆向き (`tests → src`) は許されているので、再輸出はここで行う。
 */
export { installCapability, stubCapability } from '../../src/renderer/src/test-support/capability'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
