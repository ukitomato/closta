import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: true } }))

import { fixedCapabilities, probedCapabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import type { RuntimeDetector, WslFileSystem } from '@domain/runtime/interfaces'
import { wslNamespace, type NamespaceId, type WslNamespaceId } from '@domain/runtime/namespace'
import { makeRuntimePath } from '@domain/runtime/path-types'
import {
  BROWSE_SESSION_TTL_MS,
  createVerifiedRunning,
  type VerifiedRunning
} from '@domain/runtime/verified-running'

import type { HostFileSystem } from '../infra/fs/host-fs'
import type { FolderStore } from '../infra/settings/folder-store'
import { createFolderService, type FolderService } from './folder-service'
import { noMeasure } from './measure'

/**
 * ブラウズセッションのトークン検証 (SC-018 / contracts/ipc-capability.md の `token` の行)。
 *
 * 契約は `token` に 3 つを要求している。
 *
 * 1. 既知の有効なトークンであること
 * 2. **発行した送信元と一致すること**
 * 3. 有効期間内であること。**期限の検査はファイルアクセスの前**に行い、
 *    期限切れは `browse-session-expired` を返して破棄する
 *
 * **検証述語ではなく `FolderService` を組み立てて呼ぶ。**
 * `validate.test.ts` は述語を直接呼ぶ形なので、
 * 「ハンドラが実際にその検証を呼んでいるか」「検査の順序」を見られない。
 * MF-003 はそこに隠れていた。
 */

const DISTRO = 'Ubuntu-26.04'
const NS: WslNamespaceId = wslNamespace(DISTRO)
const NOW = 1_000_000

/** 発行元と、それとは別の送信元。 */
const OWNER_SENDER = 1
const OTHER_SENDER = 2

function verifiedFor(namespace: WslNamespaceId, at: number): VerifiedRunning {
  return createVerifiedRunning(namespace, at)
}

function wslDescriptor(): RuntimeDescriptor {
  return {
    id: NS,
    kind: 'wsl',
    distroName: DISTRO,
    wslVersion: 2,
    state: 'running',
    isDefault: true,
    capabilities: probedCapabilities({
      sandbox: 'none',
      missingDependencies: [],
      probedAt: NOW
    }),
    pathMapping: null,
    detectedAt: NOW
  } as RuntimeDescriptor
}

interface Harness {
  readonly service: FolderService
  /** `listDirectory` が呼ばれた回数。**呼ばれてはいけない経路の確認に使う。** */
  readonly listCalls: () => number
  readonly setNow: (value: number) => void
}

function harness(): Harness {
  let current = NOW
  let listCalls = 0

  const fs: WslFileSystem = {
    async listDirectory(target, verified, now) {
      listCalls++
      // 期限切れを service 側で止められていれば、ここには来ない。
      void verified
      void now
      return { ok: true, entries: [], cwd: target, parent: null }
    },
    async exists() {
      return true
    }
  } as unknown as WslFileSystem

  const detector: RuntimeDetector = {
    async list() {
      return { runtimes: [], enumerationIssues: [] }
    },
    async verifyRunning(ids?: readonly WslNamespaceId[]) {
      const map = new Map<WslNamespaceId, VerifiedRunning>()
      for (const id of ids ?? [NS]) map.set(id, verifiedFor(id, current))
      return map
    },
    async probe() {
      throw new Error('probe は本テストで使わない')
    }
  } as unknown as RuntimeDetector

  const store: FolderStore = {
    async load() {
      return { folders: [], issues: { skipped: 0, reasonKeys: [], backupPath: null } }
    },
    async save() {
      /* 何もしない */
    }
  } as unknown as FolderStore

  const hostFs: HostFileSystem = {
    async exists() {
      return true
    }
  }

  /*
   * **識別子を決定的にする。** 注入するようになったので (AD-023 §5 / §7) テストから
   * 固定できる。`makeFolderId` は 8 文字以上の英数字を要求する。
   */
  let idSeq = 0
  const newId = (): string => `testid${String(++idSeq).padStart(8, '0')}`

  const service = createFolderService({
    store,
    fs,
    hostFs,
    detector,
    runtimes: () => [wslDescriptor()],
    now: () => current,
    measure: noMeasure,
    newId
  })

  return {
    service,
    listCalls: () => listCalls,
    setNow: (value) => {
      current = value
    }
  }
}

async function openSession(h: Harness, sender = OWNER_SENDER): Promise<string> {
  const begun = await h.service.beginBrowse({ kind: 'wsl', distroName: DISTRO }, sender)
  if (!begun.ok) throw new Error(`beginBrowse が失敗した: ${begun.error}`)
  return begun.token
}

function rootTarget(): unknown {
  return { kind: 'root' }
}

describe('browseDirectory のトークン検証', () => {
  it('発行元から有効期間内に呼べば通る', async () => {
    const h = harness()
    const token = await openSession(h)
    const result = await h.service.browseDirectory(token, rootTarget(), OWNER_SENDER)
    expect(result.ok).toBe(true)
    expect(h.listCalls()).toBe(1)
  })

  it('未知のトークンを browse-session-expired で拒否する', async () => {
    const h = harness()
    await openSession(h)
    const result = await h.service.browseDirectory('unknown-token', rootTarget(), OWNER_SENDER)
    expect(result).toEqual({ ok: false, error: 'browse-session-expired' })
    expect(h.listCalls()).toBe(0)
  })

  it.each([
    ['文字列でない', 42],
    ['null', null],
    ['オブジェクト', { token: 'x' }]
  ])('トークンが %s なら拒否する', async (_label, token) => {
    const h = harness()
    await openSession(h)
    const result = await h.service.browseDirectory(token, rootTarget(), OWNER_SENDER)
    expect(result).toEqual({ ok: false, error: 'browse-session-expired' })
    expect(h.listCalls()).toBe(0)
  })

  it('**他の送信元**が正規のトークンを使っても拒否する', async () => {
    const h = harness()
    const token = await openSession(h, OWNER_SENDER)
    const result = await h.service.browseDirectory(token, rootTarget(), OTHER_SENDER)
    expect(result).toEqual({ ok: false, error: 'browse-session-expired' })
    // **ファイルアクセスに到達していないこと。**
    expect(h.listCalls()).toBe(0)
  })

  it('他の送信元で拒否されても、発行元からは引き続き使える', async () => {
    const h = harness()
    const token = await openSession(h, OWNER_SENDER)
    await h.service.browseDirectory(token, rootTarget(), OTHER_SENDER)
    const result = await h.service.browseDirectory(token, rootTarget(), OWNER_SENDER)
    // 他送信元の試行でセッションを破棄しない (正規の利用者を巻き込まない)。
    expect(result.ok).toBe(true)
  })

  it('**期限切れ**を browse-session-expired で拒否し、ファイルアクセスの前に止める', async () => {
    const h = harness()
    const token = await openSession(h)
    h.setNow(NOW + BROWSE_SESSION_TTL_MS + 1)

    const result = await h.service.browseDirectory(token, rootTarget(), OWNER_SENDER)
    expect(result).toEqual({ ok: false, error: 'browse-session-expired' })
    /*
     * **`distro-unreachable` ではない。** `WslFileSystem` 側の検査に任せると
     * そちらは期限切れを `distro-unreachable` に落とすため、利用者には
     * 「ディストロに接続できません」と出て「開き直せ」に辿り着けない。
     */
    expect(h.listCalls()).toBe(0)
  })

  it('期限切れのセッションは破棄され、同じトークンで再試行しても通らない', async () => {
    const h = harness()
    const token = await openSession(h)
    h.setNow(NOW + BROWSE_SESSION_TTL_MS + 1)
    await h.service.browseDirectory(token, rootTarget(), OWNER_SENDER)

    // 時計を戻しても復活しない (破棄されているため)。
    h.setNow(NOW)
    const result = await h.service.browseDirectory(token, rootTarget(), OWNER_SENDER)
    expect(result).toEqual({ ok: false, error: 'browse-session-expired' })
    expect(h.listCalls()).toBe(0)
  })

  it('有効期間の境界では通る (境界を期限切れにしない)', async () => {
    const h = harness()
    const token = await openSession(h)
    h.setNow(NOW + BROWSE_SESSION_TTL_MS)
    const result = await h.service.browseDirectory(token, rootTarget(), OWNER_SENDER)
    expect(result.ok).toBe(true)
  })

  it('所在 windows は unsupported-location を返す (入口はピッカーのみ)', async () => {
    const h = harness()
    const result = await h.service.beginBrowse({ kind: 'windows' }, OWNER_SENDER)
    expect(result).toEqual({ ok: false, error: 'unsupported-location' })
  })

  it('別ディストロの名前空間を持つ移動先を拒否する', async () => {
    const h = harness()
    const token = await openSession(h)
    const other = makeRuntimePath(wslNamespace('Ubuntu-22.04'), '/home/u')
    if (!other.ok) throw new Error('前提のパスが作れない')

    const result = await h.service.browseDirectory(
      token,
      { kind: 'current', of: { namespace: other.path.namespace, value: other.path.value } },
      OWNER_SENDER
    )
    expect(result.ok).toBe(false)
    expect(h.listCalls()).toBe(0)
  })
})

describe('前提の確認', () => {
  it('fixedCapabilities は probedAt を持つ (判定中のまま固まらない)', () => {
    expect(fixedCapabilities(NOW).probedAt).toBe(NOW)
  })

  it('NamespaceId の型が壊れていない', () => {
    const id: NamespaceId = NS
    expect(id).toBe(`wsl:${DISTRO}`)
  })
})
