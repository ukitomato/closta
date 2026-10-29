import type { PastResumeDTO } from '@domain/capability'

import type { RunningSessionStore } from './running-session-store'

/**
 * 過去のセッションの再開を始める (X-9 / 025 data-model §7.4 / research R-10)。`PastResumeBar` (過去の行の「再開」) と
 * `ResumePickerDialog` (`/resume`) が共有する。`resolvePastResume` の答えを受け、ok なら再開の形の起動ダイアログを開く。
 *
 * @returns ok なら `null`、ok でなければ理由 (呼び出し側が `RESUME_UNAVAILABLE_LABELS[reason]` を出す。何も開かない)
 */
export function startPastResume(
  deps: {
    readonly store: Pick<RunningSessionStore, 'openResume'>
    readonly setLaunchOpen: (open: boolean) => void
  },
  targetKey: string,
  conversationId: string,
  result: PastResumeDTO
): Extract<PastResumeDTO, { ok: false }>['reason'] | null {
  if (!result.ok) return result.reason
  deps.store.openResume({
    source: { kind: 'past', targetKey, conversationId },
    fixed: {
      folderId: result.folderId,
      runtimeId: result.runtimeId,
      providerId: result.providerId
    },
    initial: null,
    initialOrigin: 'manual',
    replaces: null
  })
  deps.setLaunchOpen(true)
  return null
}
