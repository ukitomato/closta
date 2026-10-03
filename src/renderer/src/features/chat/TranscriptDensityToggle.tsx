import { Button } from '@/components/ui/button'
import { useUiStore, type TranscriptDensity } from '@/stores/ui'

import { TRANSCRIPT_DENSITY_LABELS } from './labels'

const DENSITIES = ['comfortable', 'compact'] as const satisfies readonly TranscriptDensity[]

/**
 * transcript の情報密度の切り替え (O-2 / FR-012 / US-3)。表示中セッションのペインと過去ログの画面のヘッダに置く
 * (同じ部品)。
 *
 * - Principle XIII: 導入済みの `Button` + `aria-pressed` の 2 値 (O-1 の監視ビューの密度の切り替えと同じ形)。
 *   独自のトークンを足さない
 * - **group 名「transcript の表示」で監視ビューの行の密度 (「表示の密度」) と区別する** (US-3 AC5)
 * - 値は `stores/ui` に持つ (永続化しない。セッションの切り替え・過去ログとの行き来で保つ。FR-013)
 */
export function TranscriptDensityToggle(): React.JSX.Element {
  const density = useUiStore((s) => s.transcriptDensity)
  const setDensity = useUiStore((s) => s.setTranscriptDensity)
  return (
    <div
      role="group"
      aria-label={TRANSCRIPT_DENSITY_LABELS.group}
      className="flex shrink-0 gap-0.5"
    >
      {DENSITIES.map((d) => (
        <Button
          key={d}
          type="button"
          size="xs"
          variant={density === d ? 'secondary' : 'ghost'}
          aria-pressed={density === d}
          onClick={() => {
            if (density !== d) setDensity(d)
          }}
        >
          {d === 'comfortable'
            ? TRANSCRIPT_DENSITY_LABELS.comfortable
            : TRANSCRIPT_DENSITY_LABELS.compact}
        </Button>
      ))}
    </div>
  )
}
