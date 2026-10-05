import { useEffect, useRef, type RefObject } from 'react'

/**
 * **面の中身が入れ替わるときにフォーカスを失わない** (O-7 / US-1 AC8・US-4 AC4。pr-gate R1 a11y H-002 / R2 a11y M-102)。
 *
 * | 使う所 | `trigger` | 拾う場合 |
 * |---|---|---|
 * | サイドバー・右のペイン | 畳んでいるか | 畳んだ帯のアイコン・開いた面の中の行やタブがフォーカスを持ったまま開閉で消えた (自動の畳み `useAutoCollapse` も含む)。開閉のボタンそのものは両方の状態で同じ要素なので消えない |
 * | 中央 | 出している中身の種類 | 押した「閉じる」が中央の中身ごと消えた・表示中の過去の行が一覧の再取得で消えた |
 *
 * - フォーカスが面の中にあり、`trigger` が変わった後にどこにも無くなった (`body`)、または `hidden` の中に残った
 *   (畳んだサイドバーは中身を `hidden` で隠す。ブラウザが隠れた要素からフォーカスを外すのは次の描画の時点) ときだけ、
 *   `target()` の要素へ移す
 * - 面の外にフォーカスがあったときは動かさない (中央で入力している間に自動で畳んでも奪わない)
 */
export function useFocusRescue(
  containerRef: RefObject<HTMLElement | null>,
  trigger: unknown,
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
    if (insideRef.current && focusLost(document.activeElement)) targetRef.current()?.focus()
  }, [trigger])
}

/** フォーカスがどこにも無いか、隠れた要素に残っている (`hidden` の中・切り離された要素)。 */
export function focusLost(active: Element | null): boolean {
  return (
    active === null ||
    active === document.body ||
    !active.isConnected ||
    active.closest('[hidden]') !== null
  )
}
