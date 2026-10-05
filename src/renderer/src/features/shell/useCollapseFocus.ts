import { useEffect, useRef, type RefObject } from 'react'

/**
 * **面を畳む / 開くときにフォーカスを失わない** (O-7 / US-1 AC8・US-4 AC4。pr-gate R1 a11y H-002)。
 *
 * 開閉のボタンそのものは両方の状態で同じ要素に描き続ける (フォーカスと `aria-expanded` の変化が保たれる)。この hook が
 * 拾うのは、それ以外の要素 (畳んだ帯のアイコン・開いた面の中の行やタブ) がフォーカスを持ったまま開閉で消えた場合である。
 * 自動の畳み (`useAutoCollapse`) も含む。
 *
 * - フォーカスが面の中にあり、開閉の後にどこにも無くなった (`body`) ときだけ、`target()` の要素へ移す
 * - 面の外にフォーカスがあったときは動かさない (中央で入力している間に自動で畳んでも奪わない)
 */
export function useCollapseFocus(
  containerRef: RefObject<HTMLElement | null>,
  collapsed: boolean,
  target: () => HTMLElement | null
): void {
  const insideRef = useRef(false)
  useEffect(() => {
    const onFocusIn = (event: FocusEvent): void => {
      const container = containerRef.current
      insideRef.current =
        container !== null && event.target instanceof Node && container.contains(event.target)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [containerRef])

  // 最新の target を描画の外で写す (描画中に ref を書かない)。下の effect より先に宣言するので同じ commit で先に走る。
  const targetRef = useRef(target)
  useEffect(() => {
    targetRef.current = target
  })
  const firstRef = useRef(true)
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    const active = document.activeElement
    if (insideRef.current && (active === null || active === document.body)) {
      targetRef.current()?.focus()
    }
  }, [collapsed])
}
