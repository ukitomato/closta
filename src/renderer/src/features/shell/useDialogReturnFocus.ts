import { useEffect, useRef } from 'react'

import { useUiStore, type UiState } from '@/stores/ui'

/** 開いた元が消えていたときの戻り先 (サイドバーの「設定」/「新規起動」のボタン。畳んだ帯でも同じ印を持つ)。 */
export type ShellAnchor = 'settings' | 'new-session'

/** 戻り先の印を付ける属性 (`data-shell-anchor`)。 */
export function shellAnchorProps(anchor: ShellAnchor): {
  readonly 'data-shell-anchor': ShellAnchor
} {
  return { 'data-shell-anchor': anchor }
}

/**
 * **ダイアログを閉じたときのフォーカスの戻り先** (O-7 / FR-007・FR-008 / US-3 AC2。pr-gate R1 a11y H-001 / M-003)。
 * 戻り値を `DialogContent` の `onCloseAutoFocus` に渡す。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 開いた瞬間のフォーカス (開いた元) を覚え、閉じたらそこへ戻す。Radix は `DialogTrigger` にしか戻さず、シェルのダイアログは store で開くので Trigger が無い | WCAG 2.4.3 / APG Dialog (Modal) |
 * | 開いた元が消えていたら (登録の成功で空の状態のボタンが消える・「閉じて起動し直す」のボタンが先に消える)、サイドバーの印の付いたボタンへ戻す | pr-gate R1 a11y M-003 |
 * | 閉じた時点で別の要素がフォーカスを持っていたら動かさない (起動の受け付けで中央の composer が autoFocus を取った場合) | pr-gate R1 a11y H-001 |
 */
export function useDialogReturnFocus(
  isOpen: (state: UiState) => boolean,
  fallback: ShellAnchor
): (event: Event) => void {
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(
    () =>
      useUiStore.subscribe((next, prev) => {
        // 開く操作 (クリック) の同期の中で store が変わるので、その時点のフォーカスが開いた元。
        if (isOpen(next) && !isOpen(prev)) {
          openerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
        }
      }),
    [isOpen]
  )

  return (event) => {
    event.preventDefault()
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body && active.isConnected) return
    const opener = openerRef.current
    openerRef.current = null
    if (opener !== null && opener.isConnected) {
      opener.focus()
      return
    }
    document.querySelector<HTMLElement>(`[data-shell-anchor="${fallback}"]`)?.focus()
  }
}
