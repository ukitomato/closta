import { describe, expect, it, vi } from 'vitest'

import type { RuntimeDescriptor, RuntimeEnumeration } from '@domain/runtime/descriptor'
import type { ProbeOutcome, RuntimeDetector } from '@domain/runtime/interfaces'
import { wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { makePathMapping, type PathMapping } from '@domain/runtime/path-mapping'
import { createVerifiedRunning, type VerifiedRunning } from '@domain/runtime/verified-running'
import { fixedCapabilities, probedCapabilities } from '@domain/runtime/capabilities'

import { noMeasure } from './measure'
import { createRuntimeStore } from './runtime-store'

/**
 * キャッシュと判定の取り回しのテスト (BE-027 / BE-028 / SC-004 / SC-005)。
 *
 * **停止中のディストロへ `probe` を発行しないことを回数で確かめる** (SC-005)。
 * 「発行しないつもり」ではなく、呼び出し記録が空であることを見る。
 */

const NOW = 1_700_000_000_000
const UBUNTU = wslNamespace('Ubuntu')
const DEBIAN = wslNamespace('Debian')

function mapping(to: WslNamespaceId): PathMapping {
  const result = makePathMapping('host', to, [{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }], NOW)
  if (!result.ok) throw new Error('fixture mapping is invalid')
  return result.mapping
}

function enumeration(): RuntimeEnumeration {
  const base = {
    kind: 'wsl' as const,
    wslVersion: 2 as const,
    isDefault: false,
    capabilities: fixedCapabilities(NOW),
    pathMapping: null,
    detectedAt: NOW
  }
  const runtimes: RuntimeDescriptor[] = [
    {
      id: 'host',
      kind: 'win32',
      state: 'running',
      isDefault: false,
      capabilities: fixedCapabilities(NOW),
      detectedAt: NOW
    },
    { ...base, id: UBUNTU, distroName: 'Ubuntu', state: 'running' },
    { ...base, id: DEBIAN, distroName: 'Debian', state: 'stopped' }
  ]
  return { runtimes, enumerationIssues: [{ rawName: '-bad', reasonKey: 'invalid-name-charset' }] }
}

interface Recorder {
  readonly detector: RuntimeDetector
  readonly listCalls: () => number
  readonly verifyCalls: () => WslNamespaceId[][]
  readonly probeCalls: () => string[]
}

/** 実行中とみなすディストロだけに確認済みの値を返す detector。 */
function recordingDetector(running: readonly WslNamespaceId[] = [UBUNTU]): Recorder {
  let listCalls = 0
  const verifyCalls: WslNamespaceId[][] = []
  const probeCalls: string[] = []

  const detector: RuntimeDetector = {
    async list() {
      listCalls += 1
      return enumeration()
    },
    async verifyRunning(ids) {
      verifyCalls.push(ids === undefined ? [] : [...ids])
      const map = new Map<WslNamespaceId, VerifiedRunning>()
      for (const id of running) map.set(id, createVerifiedRunning(id, NOW))
      return map
    },
    async probe(descriptor): Promise<ProbeOutcome> {
      probeCalls.push(descriptor.distroName)
      return {
        capabilities: probedCapabilities({
          sandbox: 'bubblewrap',
          missingDependencies: [],
          probedAt: NOW
        }),
        pathMapping: mapping(descriptor.id)
      }
    }
  }

  return {
    detector,
    listCalls: () => listCalls,
    verifyCalls: () => verifyCalls,
    probeCalls: () => probeCalls
  }
}

describe('list() / refresh()', () => {
  it('初回だけ検出し、以後はキャッシュを返す (FR-010)', async () => {
    const recorder = recordingDetector()
    const store = createRuntimeStore(recorder.detector, noMeasure)

    await store.list()
    await store.list()
    await store.list()

    // **検出時刻を鮮度判定に使った自動再検出を行わない。**
    expect(recorder.listCalls()).toBe(1)
  })

  it('明示操作の再検出でだけ検出をやり直す', async () => {
    const recorder = recordingDetector()
    const store = createRuntimeStore(recorder.detector, noMeasure)

    await store.list()
    await store.refresh()

    expect(recorder.listCalls()).toBe(2)
  })

  it('列挙不能を一覧と一緒に返す (SC-002)', async () => {
    const store = createRuntimeStore(recordingDetector().detector, noMeasure)
    const list = await store.list()

    expect(list.enumerationIssues).toEqual([{ rawName: '-bad', reasonKey: 'invalid-name-charset' }])
  })

  it('再検出で変更を通知する', async () => {
    const store = createRuntimeStore(recordingDetector().detector, noMeasure)
    const listener = vi.fn()
    store.onChanged(listener)

    await store.refresh()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('購読を解除したら通知しない', async () => {
    const store = createRuntimeStore(recordingDetector().detector, noMeasure)
    const listener = vi.fn()
    const unsubscribe = store.onChanged(listener)
    unsubscribe()

    await store.refresh()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('probeAll()', () => {
  it('verifyRunning を 1 回だけ呼び、実行中のものにだけ probe を発行する (C-1 / SC-005)', async () => {
    const recorder = recordingDetector([UBUNTU])
    const store = createRuntimeStore(recorder.detector, noMeasure)

    await store.probeAll()

    expect(recorder.verifyCalls()).toHaveLength(1)
    // **停止中の Debian には発行しない。**
    expect(recorder.probeCalls()).toEqual(['Ubuntu'])
  })

  it('判定結果とマッピングを descriptor に反映する', async () => {
    const store = createRuntimeStore(recordingDetector().detector, noMeasure)
    const list = await store.probeAll()
    const ubuntu = list.runtimes.find((r) => r.id === UBUNTU)!

    expect(ubuntu.capabilities.probeState).toBe('done')
    expect(ubuntu.capabilities.sandboxKind).toBe('bubblewrap')
    expect(ubuntu.capabilities.autoModeStatus).toBe('allowed')
    expect(ubuntu.hasPathMapping).toBe(true)
  })

  it('判定開始時に capabilities を初期状態へ戻してから probing にする', async () => {
    // **旧値を据え置かない** (data-model §3 不変条件)。通知の 1 回目で確認する。
    const store = createRuntimeStore(recordingDetector().detector, noMeasure)
    const snapshots: string[] = []
    store.onChanged((list) => {
      const ubuntu = list.runtimes.find((r) => r.id === UBUNTU)
      if (ubuntu !== undefined) snapshots.push(ubuntu.capabilities.probeState)
    })

    await store.probeAll()

    expect(snapshots[0]).toBe('probing')
    expect(snapshots[snapshots.length - 1]).toBe('done')
  })

  it('停止中しかなければ probe を 1 件も発行しない (SC-005)', async () => {
    const recorder = recordingDetector([])
    const store = createRuntimeStore(recorder.detector, noMeasure)

    await store.probeAll()
    expect(recorder.probeCalls()).toEqual([])
  })
})

describe('probeOne()', () => {
  it('停止中の識別子ではプロセスを起動せず distro-not-running を返す (SC-005)', async () => {
    const recorder = recordingDetector([UBUNTU])
    const store = createRuntimeStore(recorder.detector, noMeasure)
    await store.list()

    const result = await store.probeOne(DEBIAN)

    expect(result).toEqual({ error: 'distro-not-running' })
    expect(recorder.probeCalls()).toEqual([])
  })

  it('毎回実行状態を取り直す', async () => {
    const recorder = recordingDetector([UBUNTU])
    const store = createRuntimeStore(recorder.detector, noMeasure)
    await store.list()

    await store.probeOne(UBUNTU)
    await store.probeOne(UBUNTU)

    // 単発の再判定は**そのつど**確認する (判定バッチの 1 回とは別)。
    expect(recorder.verifyCalls()).toHaveLength(2)
    expect(recorder.probeCalls()).toEqual(['Ubuntu', 'Ubuntu'])
  })

  it('未知の識別子は distro-not-running を返す', async () => {
    const store = createRuntimeStore(recordingDetector().detector, noMeasure)
    await store.list()

    expect(await store.probeOne(wslNamespace('NoSuchDistro'))).toEqual({
      error: 'distro-not-running'
    })
  })

  it('Win32Runtime は実地判定を持たず現在の descriptor を返す', async () => {
    const recorder = recordingDetector()
    const store = createRuntimeStore(recorder.detector, noMeasure)
    await store.list()

    const result = await store.probeOne('host')

    expect(result).toMatchObject({ id: 'host', kind: 'win32' })
    expect(recorder.probeCalls()).toEqual([])
    // 実行状態の確認も要らない。
    expect(recorder.verifyCalls()).toEqual([])
  })
})
