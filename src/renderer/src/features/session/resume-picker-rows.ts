import type { SessionIndexDTO } from '@domain/session/dto'
import { sessionTitle } from '@domain/session/summary'

import { formatSessionTime, rowTitleText } from '@/features/session-list/rows'

/** `/resume` の選ぶ画面の 1 行 (025 data-model §7.3)。 */
export interface ResumePickerRow {
  readonly targetKey: string
  readonly sessionId: string
  readonly title: string
  readonly time: string
}

/** 同じ `folderId` の `kind: 'folder'` のグループの行 (並びはグループの中の順。純関数)。 */
export function resumePickerRows(
  index: SessionIndexDTO | null,
  folderId: string
): readonly ResumePickerRow[] {
  if (index === null) return []
  return index.groups.flatMap((group) =>
    group.kind === 'folder' && group.folderId === folderId
      ? group.sessions.map((summary) => ({
          targetKey: summary.targetKey,
          sessionId: summary.sessionId,
          title: rowTitleText(sessionTitle(summary), formatSessionTime),
          time: summary.lastModified === null ? '' : formatSessionTime(summary.lastModified)
        }))
      : []
  )
}
