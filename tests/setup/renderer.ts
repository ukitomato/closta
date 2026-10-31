import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, vi } from 'vitest'
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
 * **テストファイルの境目で、変換したモジュールを読み直す。**
 *
 * renderer project は分離しない (`vitest.config.ts` の `isolate: false`) ので、
 * モジュールの読み込み結果がファイルをまたいで残る。残すと、store の状態が次のファイルに漏れ、
 * 先に本物を読んだファイルの後では `vi.mock` が効かない。setup はファイルごとに走るので、
 * ここで一度だけ registry を空にする。`node_modules` の外部化された依存 (React / assistant-ui) は
 * Node の側で読まれるので対象にならず、共有したままになる — それが分離をやめた理由である。
 */
vi.resetModules()

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

/**
 * **ファイルの終わりに、ファイルをまたいで共有される環境を最初のファイルの状態へ戻す。**
 *
 * jsdom の `window` / `document` と DOM の prototype はファイルをまたいで残る (`isolate: false`)。
 * モジュールを読み直しても次の 3 つは残り、後のファイルを順序次第で落としていた (2026-10-31 に漏れを計測して特定)。
 *
 * - **`window` の `message` の listener** — store が React の外で付ける (`running-session-store.ts`)。
 *   残ると、次のファイルが届けた port を前のファイルの store が受けて閉じる
 * - **DOM の prototype** — user-event は読み込みごとに `HTMLElement.prototype.focus` / `blur` を包み直し、
 *   包んだ印が読み込みごとに別の `Symbol` なので包みが重なる。テストの `Object.defineProperty` / `vi.spyOn` も残る
 * - **timer の関数** — fake timer の上に付けた spy (`vi.spyOn(globalThis, 'setInterval')`) が、
 *   `useRealTimers` の後も偽の timer を包んだまま残る
 *
 * **listener は `message` だけ外す。** 全種類を外すと、共有の依存が一度だけ付ける listener (React DOM が `document` に付ける
 * `selectionchange` など。付けた印が `document` に残るので付け直さない) まで外れ、入力と IME のテストが壊れる。
 * 基準は最初のファイルで一度だけ取り (setup はファイルごとに走る)、`globalThis` に置いて共有する。
 */
const BASELINE_KEY = Symbol.for('closta.renderer-test.baseline')
const SHARED_PROTOTYPES: readonly object[] = [
  EventTarget.prototype,
  Node.prototype,
  Element.prototype,
  HTMLElement.prototype,
  HTMLInputElement.prototype,
  HTMLTextAreaElement.prototype,
  Document.prototype
]
const SHARED_GLOBALS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
  'Date'
] as const

interface SharedBaseline {
  readonly prototypes: ReadonlyMap<object, ReadonlyMap<PropertyKey, PropertyDescriptor>>
  readonly globals: ReadonlyMap<string, PropertyDescriptor>
  readonly messageListenerRemovals: Array<() => void>
}

function ownDescriptors(target: object): Map<PropertyKey, PropertyDescriptor> {
  const out = new Map<PropertyKey, PropertyDescriptor>()
  for (const key of Reflect.ownKeys(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    if (descriptor !== undefined) out.set(key, descriptor)
  }
  return out
}

function sameDescriptor(a: PropertyDescriptor | undefined, b: PropertyDescriptor): boolean {
  return a !== undefined && a.value === b.value && a.get === b.get && a.set === b.set
}

function sharedBaseline(): SharedBaseline {
  const holder = globalThis as typeof globalThis & { [BASELINE_KEY]?: SharedBaseline }
  const existing = holder[BASELINE_KEY]
  if (existing !== undefined) return existing

  // **`window` 自身のものを包む。** jsdom の `window.addEventListener` は `EventTarget.prototype` のものと別の関数で、
  // prototype を包んでも `window` への登録は見えない (2026-10-31 に、外したつもりの store が 11 個残っていたことで判明)。
  const messageListenerRemovals: Array<() => void> = []
  const add = window.addEventListener.bind(window)
  window.addEventListener = function addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    add(type, listener, options)
    if (type === 'message')
      messageListenerRemovals.push(() => window.removeEventListener(type, listener, options))
  }

  const globals = new Map<string, PropertyDescriptor>()
  for (const key of SHARED_GLOBALS) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    if (descriptor !== undefined) globals.set(key, descriptor)
  }
  const baseline: SharedBaseline = {
    prototypes: new Map(SHARED_PROTOTYPES.map((proto) => [proto, ownDescriptors(proto)])),
    globals,
    messageListenerRemovals
  }
  holder[BASELINE_KEY] = baseline
  return baseline
}

// 戻せない (configurable でない) ものがあっても残りを戻し切るため、例外を投げない `Reflect` で書き戻す。
function restoreSharedBaseline(baseline: SharedBaseline): void {
  vi.useRealTimers()
  for (const remove of baseline.messageListenerRemovals.splice(0)) remove()
  for (const [proto, saved] of baseline.prototypes) {
    for (const key of Reflect.ownKeys(proto))
      if (!saved.has(key)) Reflect.deleteProperty(proto, key)
    for (const [key, descriptor] of saved)
      if (!sameDescriptor(Object.getOwnPropertyDescriptor(proto, key), descriptor))
        Reflect.defineProperty(proto, key, descriptor)
  }
  for (const [key, descriptor] of baseline.globals)
    if (!sameDescriptor(Object.getOwnPropertyDescriptor(globalThis, key), descriptor))
      Reflect.defineProperty(globalThis, key, descriptor)
}

const baseline = sharedBaseline()
afterAll(() => {
  restoreSharedBaseline(baseline)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
