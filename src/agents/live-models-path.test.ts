import { normalizeLiveModels } from '@domain/provider/model-catalog'
import { describe, expect, it } from 'vitest'

import {
  decodeSupervisorEventForMain,
  decodeWorkerMessage,
  encodeSupervisorEvent
} from './supervisor-protocol'

/**
 * 層横断 (025 / contracts「テストの観点」/ H-004 / H-005):
 * セッションスレッドの制御シンクが `supportedModels()` の `ModelInfo[]` に当てる `normalizeLiveModels` の出力を、
 * 構造化複製 → 調停役の中継 (`decodeWorkerMessage` → `encodeSupervisorEvent`) → main のデコーダに通す。
 * 形の取り違え (`value` と `id`) を CI で検出する。制御シンク自体は `sdk-agent-session.test.ts` が見る。
 */

const SESSION = '11111111-1111-4111-8111-111111111111'
const REQ = '22222222-2222-4222-8222-222222222222'

const modelInfos = [
  { value: 'default', displayName: 'Default', description: 'd' },
  { value: 'sonnet[1m]', displayName: 'Sonnet', description: 'd', supportedEffortLevels: ['high'] },
  { value: 'opus', displayName: 'Opus', description: 'd', supportedEffortLevels: ['low', 'high'] }
]

describe('モデルの一覧の経路 (層横断)', () => {
  it('3 件の ModelInfo の id が同じ順で main に届き、dropped は 0', () => {
    const models = normalizeLiveModels(modelInfos)
    const posted = structuredClone({ kind: 'models-result', requestId: REQ, models })
    const relayed = decodeWorkerMessage(posted)
    expect(relayed?.kind).toBe('models-result')
    if (relayed?.kind !== 'models-result') throw new Error('unreachable')
    const line = encodeSupervisorEvent({
      kind: 'models-result',
      sessionId: SESSION,
      requestId: relayed.requestId,
      models: relayed.models
    })
    const decoded = decodeSupervisorEventForMain(line)
    expect(decoded?.kind).toBe('models-result')
    if (decoded?.kind !== 'models-result') throw new Error('unreachable')
    expect(decoded.models?.map((m) => m.id)).toEqual(['default', 'sonnet[1m]', 'opus'])
    expect(decoded.dropped).toBe(0)
  })

  it('ModelInfo の形 (value) の配列を main のデコーダに直接渡すと全件落ちる (取り違えの検出)', () => {
    const decoded = decodeSupervisorEventForMain(
      JSON.stringify({
        kind: 'models-result',
        sessionId: SESSION,
        requestId: REQ,
        models: modelInfos
      })
    )
    expect(decoded).toMatchObject({ models: [], dropped: 3 })
  })
})
