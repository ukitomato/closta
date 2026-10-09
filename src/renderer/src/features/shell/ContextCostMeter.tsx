import type { ModelMeter } from '@domain/session/meter'

import { useSessionMeters } from '@/features/session/useSessionMeters'
import { cn } from '@/lib/utils'

import { CONTEXT_COST_METER_LABELS, formatCostUsd } from './labels'

/** 中央のヘッダの目盛りが読む、稼働中のセッションの値 (`CenterHeader` の `live` から渡す)。 */
export interface ContextCostMeterProps {
  readonly sessionId: string
  /** 起動の設定のモデル id (既定なら null)。主モデルの照合に使う。 */
  readonly modelId: string | null
}

/**
 * **コンテキストと費用の目盛り** (O-4 / 014 spec FR-009 / US-3 AC2。data-model §4「コンテキストと費用の目盛り」)。
 * 中央のヘッダの行の右に置く。稼働中のセッションだけで描く (`CenterHeader` が `live` のあるときだけ置く)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | コンテキストは主ループの最後の assistant の入力側のトークン (`contextUsed`) を主モデルの `contextWindow` で割る | data-model §4 |
 * | 主モデルは起動の設定のモデル id と `models` の id を 完全一致 → 末尾の `[…]` を外して一致 → 出力トークン最多 の順で選ぶ | data-model §4 |
 * | `contextWindow` が 0・`contextUsed` が null ならコンテキストの目盛りを出さない。80% 以上で注意の見た目、100% を超えたら数を出さない | data-model §4 |
 * | 費用は `lastTurn` があれば出す。`lastTurn` も `contextUsed` も無ければ何も出さない (ヘッダに空の印を置かない) | data-model §4 |
 * | 推定であることを `aria-label` と `title` で伝える。live region にしない (ターンごとに読み上げない) | spec FR-009 / data-model §4 |
 * | 1 セッションの値だけを selector で読む (他のセッションの計量の更新で描き直さない) | spec US-3 AC4 |
 */
export function ContextCostMeter({
  sessionId,
  modelId
}: ContextCostMeterProps): React.JSX.Element | null {
  const lastTurn = useSessionMeters(sessionId, (meters) => meters.lastTurn)
  const contextUsed = useSessionMeters(sessionId, (meters) => meters.contextUsed)
  // `contextWindow` は `lastTurn` の内訳にしか無いので、`lastTurn` が無ければコンテキストの目盛りも出せない。
  if (lastTurn === null) return null
  const main = mainModelOf(lastTurn.models, modelId)
  const context =
    main === null || contextUsed === null ? null : contextViewOf(contextUsed, main.contextWindow)
  const cost = CONTEXT_COST_METER_LABELS.costMeter(formatCostUsd(lastTurn.costUsd))
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs" data-testid="context-cost-meter">
      {context !== null && (
        <span
          role="meter"
          aria-label={CONTEXT_COST_METER_LABELS.contextMeterLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={context.valueNow}
          aria-valuetext={context.text}
          title={`${CONTEXT_COST_METER_LABELS.contextMeterLabel}: ${context.text}`}
          data-testid="context-meter"
          data-tone={context.caution ? 'caution' : 'normal'}
          className={cn(
            'whitespace-nowrap',
            context.caution
              ? 'font-medium text-amber-800 dark:text-amber-300'
              : 'text-muted-foreground'
          )}
        >
          {context.text}
        </span>
      )}
      <span
        role="group"
        aria-label={CONTEXT_COST_METER_LABELS.costMeterLabel}
        title={`${CONTEXT_COST_METER_LABELS.costMeterLabel}: ${cost}`}
        data-testid="cost-meter"
        className="text-muted-foreground whitespace-nowrap"
      >
        {cost}
      </span>
    </div>
  )
}

/** 末尾の context の指定 (`[1m]` など) を外したモデルの id。 */
function withoutContextSuffix(id: string): string {
  return id.replace(/\[[^\]]*\]$/, '')
}

/**
 * 主モデル (014 data-model §4)。起動の設定のモデル id と内訳の id を 1. 完全一致 2. 両方の末尾の `[…]` を外して一致 の順で
 * 照合し、どれも一致しない (alias で起動した・起動の設定にモデルが無い) ときは出力トークンの最も多い行 (同じ数なら先の行)。
 */
function mainModelOf(
  models: readonly ModelMeter[],
  launchModelId: string | null
): ModelMeter | null {
  if (launchModelId !== null) {
    const exact = models.find((m) => m.modelId === launchModelId)
    if (exact !== undefined) return exact
    const base = withoutContextSuffix(launchModelId)
    const loose = models.find((m) => withoutContextSuffix(m.modelId) === base)
    if (loose !== undefined) return loose
  }
  let top: ModelMeter | null = null
  for (const m of models) if (top === null || m.output > top.output) top = m
  return top
}

interface ContextView {
  readonly text: string
  /** `aria-valuenow` (0〜100。100% を超えたら 100)。 */
  readonly valueNow: number
  readonly caution: boolean
}

/**
 * コンテキストの目盛りの見え方 (014 data-model §4)。`contextWindow` が 0 なら null (出さない)。割合は整数の比で決める
 * (`ratio >= 0.8` と `ratio > 1` を浮動小数の丸めに左右させない)。表示は切り捨ての整数の %。
 */
function contextViewOf(used: number, contextWindow: number): ContextView | null {
  if (contextWindow <= 0) return null
  const over = used > contextWindow
  const caution = used * 10 >= contextWindow * 8
  if (over) return { text: CONTEXT_COST_METER_LABELS.contextOver, valueNow: 100, caution }
  const pct = Math.floor((used * 100) / contextWindow)
  return { text: CONTEXT_COST_METER_LABELS.contextMeter(pct), valueNow: pct, caution }
}
