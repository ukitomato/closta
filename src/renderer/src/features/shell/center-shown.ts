import type { CenterFocus } from '@/stores/ui'

/** 中央が出している中身。 */
export type CenterShown = 'running' | 'past' | 'none'

/**
 * 中央が今出している中身 (O-7 / FR-003)。`focus` が `running` でも、選択中の稼働中のセッションが引けなければ空の状態。
 * `CenterPane` の描き分けと、Command palette の「中央に会話を出しているとき」(`chat:*` の操作の使える条件。O-3 /
 * 012 data-model §3) が同じ判定を使う。
 */
export function centerShownOf(focus: CenterFocus, hasLive: boolean): CenterShown {
  return focus === 'running' && hasLive ? 'running' : focus === 'past' ? 'past' : 'none'
}
