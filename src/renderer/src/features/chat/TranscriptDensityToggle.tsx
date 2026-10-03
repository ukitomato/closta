import { useId } from 'react'

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
 * - **group 名「transcript の表示」を見える見出しとして出し、group の名前にも使う** — 監視ビューの行の密度
 *   (「表示の密度」) と見た目でも区別する (US-3 AC5 / pr-gate R1 po M-001)。各ボタンの `title` で何が開閉するかを示す
 * - 値は `stores/ui` に持つ (永続化しない。セッションの切り替え・過去ログとの行き来で保つ。FR-013)
 */
export function TranscriptDensityToggle(): React.JSX.Element {
  const density = useUiStore((s) => s.transcriptDensity)
  const setDensity = useUiStore((s) => s.setTranscriptDensity)
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="flex shrink-0 items-center gap-0.5">
      <span id={labelId} className="text-muted-foreground me-1 text-xs">
        {TRANSCRIPT_DENSITY_LABELS.group}
      </span>
      {DENSITIES.map((d) => (
        <Button
          key={d}
          type="button"
          size="xs"
          variant={density === d ? 'secondary' : 'ghost'}
          aria-pressed={density === d}
          title={
            d === 'comfortable'
              ? TRANSCRIPT_DENSITY_LABELS.comfortableHint
              : TRANSCRIPT_DENSITY_LABELS.compactHint
          }
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
