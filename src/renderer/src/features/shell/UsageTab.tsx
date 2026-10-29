import { MAX_METER_PERMISSION_DENIALS, type ModelMeter } from '@domain/session/meter'

import { LAUNCH_AXIS_LABELS } from '@/features/session/labels'
import { useRunningSessionsView } from '@/features/session/running-sessions-view'
import { useSessionMeters, type TurnMeter } from '@/features/session/useSessionMeters'
import { useUiStore } from '@/stores/ui'

import { formatCostUsd, formatCount, USAGE_LABELS } from './labels'

/**
 * 右のペインの「使用量」のタブ (O-4 / 014 spec FR-008 / US-3 AC1・AC3〜AC5。data-model §4「使用量のタブ」/ §5)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 値は表示中の稼働中のセッションの `meters.lastTurn` と稼働中のストアの `denied` から出す。新しい IPC を足さない | data-model §4 |
 * | 過去は「実行中だけ」、未選択は「選ぶと出る」、`lastTurn` が無ければ「最初の応答の後」の空の状態 | spec US-3 AC3 / AC5 |
 * | 1 セッションの値だけを selector で読む (切り替えても値が混ざらない) | spec US-3 AC4 |
 * | 表の構造は `dl`。モデルの id と数はテキストとして描く (HTML として解釈しない) | data-model §4 |
 * | 費用は `ja-JP` の書式で小数 4 桁まで。推定であり請求ではないと添える | data-model §4 / §5 |
 * | 拒否は 2 行: 聞かれずに拒否された操作 (`denied` の長さ) と SDK の記録の合計 (`permissionDenials`。上限で「以上」) | research R-08 |
 */
export function UsageTab(): React.JSX.Element {
  const focus = useUiStore((s) => s.focus)
  if (focus === 'running') return <RunningUsage />
  if (focus === 'past') return <Note testId="usage-live-only">{USAGE_LABELS.usageLiveOnly}</Note>
  return <Note testId="usage-empty">{USAGE_LABELS.usageEmpty}</Note>
}

function Note({
  testId,
  children
}: {
  readonly testId: string
  readonly children: string
}): React.JSX.Element {
  return (
    <p className="text-muted-foreground p-3 text-sm" data-testid={testId}>
      {children}
    </p>
  )
}

function RunningUsage(): React.JSX.Element {
  const view = useRunningSessionsView()
  const live = view.live
  const lastTurn = useSessionMeters(live?.sessionId ?? null, (meters) => meters.lastTurn)
  if (live === null) return <Note testId="usage-empty">{USAGE_LABELS.usageEmpty}</Note>
  if (lastTurn === null)
    return <Note testId="usage-await-first">{USAGE_LABELS.usageAwaitFirst}</Note>
  return <UsageOf lastTurn={lastTurn} deniedAuto={live.state.denied.length} />
}

interface Item {
  readonly label: string
  readonly value: React.ReactNode
}

function Items({
  items,
  testId
}: {
  readonly items: readonly Item[]
  readonly testId?: string
}): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5" data-testid={testId}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground min-w-0 break-words">{item.label}</dt>
          <dd className="text-end whitespace-nowrap tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 4 つのトークン数 (入力 / 出力 / キャッシュの読み込み / キャッシュの作成)。 */
function tokenItems(tokens: {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheCreation: number
}): Item[] {
  return [
    { label: USAGE_LABELS.tokenInput, value: formatCount(tokens.input) },
    { label: USAGE_LABELS.tokenOutput, value: formatCount(tokens.output) },
    { label: USAGE_LABELS.tokenCacheRead, value: formatCount(tokens.cacheRead) },
    { label: USAGE_LABELS.tokenCacheCreation, value: formatCount(tokens.cacheCreation) }
  ]
}

/** 内訳の合計 (トークンの累計)。各値は検証を通った安全な整数なので、和は 16 件でも有限。 */
function totalsOf(models: readonly ModelMeter[]): {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
} {
  const total = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  for (const m of models) {
    total.input += m.input
    total.output += m.output
    total.cacheRead += m.cacheRead
    total.cacheCreation += m.cacheCreation
  }
  return total
}

const costText = (usd: number): string => USAGE_LABELS.costValue(formatCostUsd(usd))

function UsageOf({
  lastTurn,
  deniedAuto
}: {
  readonly lastTurn: TurnMeter
  readonly deniedAuto: number
}): React.JSX.Element {
  const deniedTotal =
    lastTurn.permissionDenials >= MAX_METER_PERMISSION_DENIALS
      ? USAGE_LABELS.countAtLeast(formatCount(MAX_METER_PERMISSION_DENIALS))
      : USAGE_LABELS.countValue(formatCount(lastTurn.permissionDenials))
  const beforeTokens: Item[] = [
    { label: USAGE_LABELS.usageCost, value: costText(lastTurn.costUsd) }
  ]
  const items: Item[] = [
    { label: USAGE_LABELS.usageTurns, value: formatCount(lastTurn.turns) },
    {
      label: USAGE_LABELS.usageDeniedAuto,
      value: USAGE_LABELS.countValue(formatCount(deniedAuto))
    },
    { label: USAGE_LABELS.usageDeniedTotal, value: deniedTotal }
  ]
  return (
    <div className="space-y-3 p-3 text-xs" data-testid="usage">
      <Items items={beforeTokens} />
      {/* トークンの内訳は値の dd の中に入れ子にせず、親の格子の外の行に字下げで置く (025 data-model §8) */}
      <div className="space-y-1.5">
        <p className="text-muted-foreground">{USAGE_LABELS.usageTokens}</p>
        <div className="ps-3">
          <Items items={tokenItems(totalsOf(lastTurn.models))} testId="usage-tokens" />
        </div>
      </div>
      <Items items={items} />
      <p className="text-muted-foreground" data-testid="usage-estimate-note">
        {USAGE_LABELS.usageEstimateNote}
      </p>
      {lastTurn.models.length > 0 && (
        <section aria-labelledby="usage-models-heading" className="space-y-2">
          <h3 id="usage-models-heading" className="font-medium">
            {USAGE_LABELS.usageModels}
          </h3>
          <ul className="space-y-2" data-testid="usage-models">
            {lastTurn.models.map((m, index) => (
              // 内訳の id は検証済みのモデルの id。重なりうるので並びの位置と組にする。
              <li key={`${index}:${m.modelId}`} className="space-y-1">
                <p className="font-mono break-all" title={m.modelId}>
                  <span className="sr-only">{LAUNCH_AXIS_LABELS.model}: </span>
                  {m.modelId}
                </p>
                <Items
                  items={[
                    ...tokenItems(m),
                    { label: USAGE_LABELS.modelCost, value: costText(m.costUsd) }
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
