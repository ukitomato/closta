import { beginProbing, probeFailed, type Capabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import type { RuntimeDetector } from '@domain/runtime/interfaces'
import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'
import type { NamespaceId, WslNamespaceId } from '@domain/runtime/namespace'

import { toRuntimeDescriptorDTO } from './dto-mapper'
import type { Measure } from './measure'

/**
 * 検出結果のキャッシュと判定の取り回し (BE-027 / BE-028 / contracts C-1 / C-6)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | キャッシュキーにランタイム識別子 (ディストロ名を含む) を使う | FR-011 |
 * | **再検出はユーザの明示操作に限る**。検出時刻を鮮度判定に使った自動再検出を行わない | FR-010 |
 * | キャッシュはメモリ上。ディスクに永続化しない | spec `## Assumptions` |
 * | **descriptor が更新されたら束ねていた `AgentRuntime` を破棄する** | data-model §7 |
 *
 * **`app` レイヤに置く。** AD-023 §5 は UseCase レイヤを作らないと決めており、
 * 状態を持つ調停は結線層が担う。`infra` に置くと検出の実装が状態を抱える形になり、
 * `RuntimeDetector` が「値を返す」という契約から外れる。
 */

export type ProbeOneResult = RuntimeDescriptorDTO | { readonly error: 'distro-not-running' }

export interface RuntimeStore {
  /** キャッシュを返す。未検出なら 1 回だけ検出する。 */
  list(): Promise<RuntimeListDTO>
  /** 明示操作による再検出 (FR-010)。 */
  refresh(): Promise<RuntimeListDTO>
  /** 判定バッチ。**`verifyRunning` を 1 回**呼んでから実行中のものに並列発行する (C-1)。 */
  probeAll(): Promise<RuntimeListDTO>
  /** 単発の再判定。**毎回実行状態を取り直す。** */
  probeOne(id: NamespaceId): Promise<ProbeOneResult>
  /** 現在の descriptor 集合。未信頼入力の照合に使う。 */
  snapshot(): readonly RuntimeDescriptor[]
  /** 変更通知。`app` が renderer への送信に繋ぐ。 */
  onChanged(listener: (list: RuntimeListDTO) => void): () => void
}

/**
 * @param measure 計測関数。**注入する** — `electron` の `app.isPackaged` に
 *   依存する判定を store の内側へ持ち込まないため (FR-038)。
 */
export function createRuntimeStore(detector: RuntimeDetector, measure: Measure): RuntimeStore {
  /** キャッシュ本体。**`id` を鍵にする** (FR-011)。 */
  let byId = new Map<NamespaceId, RuntimeDescriptor>()
  let issues: RuntimeListDTO['enumerationIssues'] = []
  /**
   * WSL の利用可否。**`detect()` でしか書き換えない。**
   * 判定 (`probeAll` / `probeOne`) は descriptor だけを差し替えるので、
   * 判定の進行でこの値が消えない。
   */
  let wslAvailability: RuntimeListDTO['wslAvailability'] = 'available'
  let detected = false

  const listeners = new Set<(list: RuntimeListDTO) => void>()

  function toDTO(): RuntimeListDTO {
    return {
      runtimes: [...byId.values()].map(toRuntimeDescriptorDTO),
      enumerationIssues: [...issues],
      wslAvailability
    }
  }

  function notify(): void {
    const dto = toDTO()
    for (const listener of listeners) listener(dto)
  }

  /**
   * descriptor を差し替える。
   *
   * **`AgentRuntime` はここで暗黙に破棄される** — 本 store は `AgentRuntime` を
   * 保持せず、必要なときに descriptor から都度組み立てる方針を採っている
   * (data-model §7)。保持すると更新のたびに破棄漏れを作る。
   */
  function replace(id: NamespaceId, next: RuntimeDescriptor): void {
    byId.set(id, next)
  }

  async function detect(): Promise<void> {
    const enumeration = await detector.list()
    byId = new Map(enumeration.runtimes.map((runtime) => [runtime.id as NamespaceId, runtime]))
    issues = enumeration.enumerationIssues.map((issue) => ({
      rawName: issue.rawName,
      reasonKey: issue.reasonKey
    }))
    wslAvailability = enumeration.wslAvailability
    detected = true
  }

  /** 判定対象。WSL かつバージョンが判明しているもの。 */
  function probeTargets(): readonly WslRuntimeDescriptor[] {
    return [...byId.values()].filter(
      (runtime): runtime is WslRuntimeDescriptor =>
        runtime.kind === 'wsl' && runtime.wslVersion !== null
    )
  }

  function withCapabilities(
    descriptor: WslRuntimeDescriptor,
    capabilities: Capabilities,
    pathMapping: WslRuntimeDescriptor['pathMapping']
  ): WslRuntimeDescriptor {
    return { ...descriptor, capabilities, pathMapping }
  }

  return {
    async list() {
      if (detected) {
        // キャッシュ再表示。**検出時刻を鮮度判定に使わない** (FR-010)。
        // 初回描画とは予算が違う (100 ミリ秒) ので計測点も分ける。
        return measure('list-runtimes-cached', async () => toDTO())
      }
      return measure('list-runtimes', async () => {
        await detect()
        return toDTO()
      })
    },

    async refresh() {
      return measure('refresh-runtimes', async () => {
        await detect()
        notify()
        return toDTO()
      })
    },

    async probeAll() {
      return measure('probe-batch', async () => {
        if (!detected) await detect()

        const targets = probeTargets()
        if (targets.length === 0) return toDTO()

        /*
         * **`verifyRunning` は 1 回だけ。** ディストロごとに呼ぶと C-1 の予算を壊す。
         * 停止中のものには `probe` を発行しない (SC-005)。
         */
        const verified = await measure('probe-batch-verify', () =>
          detector.verifyRunning(targets.map((t) => t.id))
        )

        // 判定開始時に capabilities を初期状態へ戻す (data-model §3 不変条件)。
        for (const target of targets) {
          if (!verified.has(target.id)) continue
          replace(target.id, withCapabilities(target, beginProbing(), null))
        }
        notify()

        await measure('probe-batch-run', () =>
          Promise.all(
            targets.map(async (target) => {
              const token = verified.get(target.id)
              if (token === undefined) return
              const current = byId.get(target.id)
              if (current === undefined || current.kind !== 'wsl') return

              const outcome = await detector.probe(current, token)
              replace(
                target.id,
                withCapabilities(current, outcome.capabilities, outcome.pathMapping)
              )
            })
          )
        )

        notify()
        return toDTO()
      })
    },

    async probeOne(id) {
      return measure('probe-one', async () => {
        if (!detected) await detect()

        const target = byId.get(id)
        if (target === undefined) return { error: 'distro-not-running' as const }

        // `Win32Runtime` は実地判定を持たない。現在の descriptor をそのまま返す。
        if (target.kind === 'win32') return toRuntimeDescriptorDTO(target)

        if (target.wslVersion === null) {
          // バージョン不明では判定の根拠が無い。状態はそのまま返す。
          return toRuntimeDescriptorDTO(target)
        }

        /*
         * **単発の再判定では毎回実行状態を取り直す** (SC-004 / SC-005)。
         * 停止中なら**プロセスを起動せず**「起動が必要」を返す。
         */
        const verified = await detector.verifyRunning([target.id as WslNamespaceId])
        const token = verified.get(target.id)
        if (token === undefined) {
          replace(target.id, { ...target, state: 'stopped', capabilities: probeFailed() })
          notify()
          return { error: 'distro-not-running' as const }
        }

        const probing = withCapabilities({ ...target, state: 'running' }, beginProbing(), null)
        replace(target.id, probing)
        notify()

        const outcome = await detector.probe(probing, token)
        const next = withCapabilities(probing, outcome.capabilities, outcome.pathMapping)
        replace(target.id, next)
        notify()
        return toRuntimeDescriptorDTO(next)
      })
    },

    snapshot() {
      return [...byId.values()]
    },

    onChanged(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
