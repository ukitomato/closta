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

/**
 * **jsdom に無い `ResizeObserver` を補う。**
 *
 * `@assistant-ui/react` の `ThreadPrimitive.Viewport` は自動スクロール位置の保持に
 * `ResizeObserver` を使う (`mountTopAnchorReserve`)。jsdom は実装を持たないため、
 * `Thread` を mount するテストが `ReferenceError` で落ちる。
 *
 * **観測はしない。** ここで要るのは「呼べること」だけで、レイアウト計測そのものは
 * jsdom が値を持たない以上テストの対象にならない。`vi.stubGlobal` ではなく直接代入するのは、
 * `afterEach` の `unstubAllGlobals` で毎テスト消えると mount のたびに落ちるためである。
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {
      // 観測しない
    }
    unobserve(): void {
      // 観測していないので解除するものが無い
    }
    disconnect(): void {
      // 同上
    }
  }
}

/**
 * **jsdom に無い `Element.scrollTo` / `scrollIntoView` を補う。**
 *
 * `@assistant-ui/react` の `ThreadPrimitive.Viewport` は `turnAnchor` の位置合わせに
 * `viewport.scrollTo(...)` を `requestAnimationFrame` の中で呼ぶ。jsdom は実装を持たず、
 * これが rAF コールバック内の unhandled error になり、実データを持つ `Thread` を mount する
 * テストを false positive にしうる (仮想化の FE-040 でも同経路を踏む)。
 *
 * **スクロールは no-op。** jsdom はレイアウトを持たないので、位置の副作用そのものは
 * テストの対象にならない。ここで要るのは「呼べること」だけである。
 */
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function scrollTo(): void {
    // レイアウトを持たないので何もしない
  }
}
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // 同上
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
