import { describe, expect, it } from 'vitest'

import { autoModeStatus, isAutoModeAllowed } from '@domain/runtime/capabilities'
import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import { wslNamespace } from '@domain/runtime/namespace'
import type { VerifiedRunning } from '@domain/runtime/verified-running'

import { createRuntimeDetector } from './wsl-detector'
import type { WslCli, WslResult } from './wsl-cli'

/**
 * capabilities 判定のテスト (BE-021 / SC-003 / SC-015)。
 *
 * **プロセス起動レイヤを差し替える。** `WslCli` を置き換えれば、
 * WSL 未搭載のホスト・停止中・判定出力の不完全・必須依存が Windows マウント配下に
 * 解決される場合などを、実 WSL なしで検証できる。
 *
 * **呼び出し回数も検証する** (contracts C-1)。回数は契約であり、実装詳細ではない。
 */

const ok = (stdout: string): WslResult => ({ ok: true, stdout })
const failed = (): WslResult => ({ ok: false, reason: 'nonzero-exit', exitCode: 1 })

const NAMES = 'Ubuntu-26.04\r\nDebian\r\n'
const RUNNING = 'Ubuntu-26.04\r\n'
const VERBOSE =
  '  NAME               STATE           VERSION\r\n' +
  '* Ubuntu-26.04       Running         2\r\n' +
  '  Debian             Stopped         1\r\n'

/** マウント情報 1 行。ドライブ `C:` が `/mnt/c` に対応する。 */
const MOUNTS = 'C:\\134 /mnt/c 9p rw,noatime,aname=drvfs;path=C:\\134;uid=1000 0 0'

function probeOutput(
  overrides: Partial<Record<string, string>> = {},
  mounts: readonly string[] = [MOUNTS]
): string {
  const values: Record<string, string> = {
    bwrap: '/usr/bin/bwrap',
    socat: '/usr/bin/socat',
    userns_restrict_readable: 'no',
    userns_restrict: '',
    userns_create: 'ok',
    ...overrides
  }
  return [
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    'mounts_begin=1',
    ...mounts,
    'mounts_end=1',
    'done=1'
  ].join('\r\n')
}

interface Calls {
  listNames: number
  listRunning: number
  listVerbose: number
  runProbe: string[]
}

function stubCli(
  responses: Partial<{
    listNames: WslResult
    listRunning: WslResult
    listVerbose: WslResult
    runProbe: WslResult
  }> = {}
): { cli: WslCli; calls: Calls } {
  const calls: Calls = { listNames: 0, listRunning: 0, listVerbose: 0, runProbe: [] }
  const cli: WslCli = {
    async listNames() {
      calls.listNames += 1
      return responses.listNames ?? ok(NAMES)
    },
    async listRunning() {
      calls.listRunning += 1
      return responses.listRunning ?? ok(RUNNING)
    },
    async listVerbose() {
      calls.listVerbose += 1
      return responses.listVerbose ?? ok(VERBOSE)
    },
    async runProbe(distroName) {
      calls.runProbe.push(distroName)
      return responses.runProbe ?? ok(probeOutput())
    }
  }
  return { cli, calls }
}

const NOW = 1_700_000_000_000
const detectorAt = (cli: WslCli, now: number = NOW): ReturnType<typeof createRuntimeDetector> =>
  createRuntimeDetector({ cli, now: () => now })

function wslDescriptor(overrides: Partial<WslRuntimeDescriptor> = {}): WslRuntimeDescriptor {
  return {
    id: wslNamespace('Ubuntu-26.04'),
    kind: 'wsl',
    distroName: 'Ubuntu-26.04',
    wslVersion: 2,
    state: 'running',
    isDefault: true,
    capabilities: {
      probeState: 'idle',
      sandbox: 'unknown',
      autoModeSafe: 'unknown',
      seccompFilter: 'unknown',
      missingDependencies: [],
      probedAt: null
    },
    pathMapping: null,
    detectedAt: NOW,
    ...overrides
  }
}

describe('list()', () => {
  it('3 系統を 1 回ずつ呼ぶ (C-1)', async () => {
    const { cli, calls } = stubCli()
    await detectorAt(cli).list()
    expect(calls).toMatchObject({ listNames: 1, listRunning: 1, listVerbose: 1 })
    expect(calls.runProbe).toEqual([])
  })

  it('Win32Runtime と WSL ディストロを返す', async () => {
    const { cli } = stubCli()
    const result = await detectorAt(cli).list()
    expect(result.runtimes.map((r) => r.id)).toEqual(['host', 'wsl:Ubuntu-26.04', 'wsl:Debian'])
  })

  it('Win32Runtime は判定済みで無人実行不可を表明する (FR-004)', async () => {
    const { cli } = stubCli()
    const result = await detectorAt(cli).list()
    const host = result.runtimes.find((r) => r.id === 'host')!

    expect(host.capabilities.probeState).toBe('done')
    expect(host.capabilities.probedAt).toBe(NOW)
    expect(host.capabilities.autoModeSafe).toBe(false)
    // **未判定と「判定したうえで不可」を区別する** (FR-003)。
    expect(autoModeStatus(host.capabilities)).toBe('unavailable')
    expect(isAutoModeAllowed(host.capabilities)).toBe(false)
  })

  it('実行状態は実行中の列挙との積集合で決める (状態列を読まない)', async () => {
    const { cli } = stubCli()
    const result = await detectorAt(cli).list()
    const byId = new Map(result.runtimes.map((r) => [r.id, r]))

    expect(byId.get('wsl:Ubuntu-26.04')!.state).toBe('running')
    expect(byId.get('wsl:Debian')!.state).toBe('stopped')
  })

  it('WSL が利用できないときは例外を投げず Win32Runtime のみを返す (FR-012 / SC-015)', async () => {
    const { cli } = stubCli({ listNames: { ok: false, reason: 'not-installed', exitCode: null } })
    const result = await detectorAt(cli).list()

    expect(result.runtimes).toHaveLength(1)
    expect(result.runtimes[0].id).toBe('host')
    expect(result.enumerationIssues).toEqual([])
  })

  it('文字種を満たさない名前は descriptor を作らず列挙不能として返す (data-model §4)', async () => {
    const { cli } = stubCli({ listNames: ok('Ubuntu\r\n-evil\r\nbad:name\r\nback\\slash\r\n') })
    const result = await detectorAt(cli).list()

    expect(result.runtimes.map((r) => r.id)).toEqual(['host', 'wsl:Ubuntu'])
    expect(result.enumerationIssues).toEqual([
      { rawName: '-evil', reasonKey: 'invalid-name-charset' },
      { rawName: 'bad:name', reasonKey: 'invalid-name-charset' },
      { rawName: 'back\\slash', reasonKey: 'invalid-name-charset' }
    ])
  })

  it('バージョン列挙だけが失敗したら wslVersion: null で判定失敗にする (C-5)', async () => {
    const { cli } = stubCli({ listVerbose: failed() })
    const result = await detectorAt(cli).list()
    const distro = result.runtimes.find((r) => r.id === 'wsl:Ubuntu-26.04')!

    expect(distro.kind === 'wsl' && distro.wslVersion).toBeNull()
    expect(distro.capabilities.probeState).toBe('failed')
    expect(distro.capabilities.sandbox).toBe('unknown')
    expect(distro.capabilities.autoModeSafe).toBe('unknown')
  })

  it('実行中の列挙だけが失敗したら全て停止中として扱う (安全側)', async () => {
    const { cli } = stubCli({ listRunning: failed() })
    const result = await detectorAt(cli).list()
    expect(
      result.runtimes.filter((r) => r.kind === 'wsl').every((r) => r.state === 'stopped')
    ).toBe(true)
  })
})

describe('verifyRunning()', () => {
  it('引数の有無にかかわらず呼び出しは 1 回 (C-1)', async () => {
    const { cli, calls } = stubCli()
    const detector = detectorAt(cli)

    await detector.verifyRunning()
    expect(calls.listRunning).toBe(1)

    await detector.verifyRunning([wslNamespace('Ubuntu-26.04'), wslNamespace('Debian')])
    expect(calls.listRunning).toBe(2)
  })

  it('実行中のものだけに確認済みの値を作る', async () => {
    const { cli } = stubCli()
    const verified = await detectorAt(cli).verifyRunning()

    expect([...verified.keys()]).toEqual(['wsl:Ubuntu-26.04'])
    expect(verified.get(wslNamespace('Ubuntu-26.04'))!.namespace).toBe('wsl:Ubuntu-26.04')
    expect(verified.get(wslNamespace('Debian'))).toBeUndefined()
  })

  it('確認が失敗したら確認済みの値を 1 つも作らない', async () => {
    const { cli } = stubCli({ listRunning: failed() })
    const verified = await detectorAt(cli).verifyRunning()
    expect(verified.size).toBe(0)
  })
})

describe('probe()', () => {
  async function verifiedFor(
    cli: WslCli,
    name: string,
    now: number = NOW
  ): Promise<VerifiedRunning> {
    const verified = await detectorAt(cli, now).verifyRunning()
    return verified.get(wslNamespace(name))!
  }

  it('4 項目すべてを満たしたときのみ bubblewrap と表明する (AD-015 §8)', async () => {
    const { cli, calls } = stubCli()
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.sandbox).toBe('bubblewrap')
    expect(outcome.capabilities.autoModeSafe).toBe(true)
    expect(outcome.capabilities.probedAt).toBe(NOW)
    expect(outcome.pathMapping?.entries).toEqual([{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }])
    // **ディストロあたり 1 回** (C-1)。
    expect(calls.runProbe).toEqual(['Ubuntu-26.04'])
  })

  it('bwrap が不在なら sandbox なしとし不足依存を返す', async () => {
    const { cli } = stubCli({ runProbe: ok(probeOutput({ bwrap: '' })) })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.sandbox).toBe('none')
    expect(outcome.capabilities.autoModeSafe).toBe(false)
    expect(outcome.capabilities.missingDependencies).toEqual([
      { name: 'bwrap', docAnchor: 'bubblewrap' }
    ])
  })

  it('依存が Windows マウント配下に解決されたら不在として扱う (FR-005)', async () => {
    // WSL は既定で Windows の PATH を Linux 側に足すため `command -v` が
    // Windows 側の実行ファイルを返しうる。これを「存在する」と扱ってはならない。
    const { cli } = stubCli({
      runProbe: ok(probeOutput({ socat: '/mnt/c/tools/socat.exe' }))
    })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.sandbox).toBe('none')
    expect(outcome.capabilities.missingDependencies).toEqual([
      { name: 'socat', docAnchor: 'socat' }
    ])
  })

  it('非既定のマウント位置でも同じ除外が効く (位置を決め打ちしない)', async () => {
    const { cli } = stubCli({
      runProbe: ok(
        probeOutput({ socat: '/windows/c/tools/socat.exe' }, [
          'C:\\134 /windows/c 9p rw,aname=drvfs;path=C:\\134 0 0'
        ])
      )
    })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.missingDependencies).toEqual([
      { name: 'socat', docAnchor: 'socat' }
    ])
  })

  it('マウント位置の外に解決された依存は存在として扱う', async () => {
    const { cli } = stubCli({ runProbe: ok(probeOutput({ socat: '/usr/local/bin/socat' })) })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.sandbox).toBe('bubblewrap')
  })

  it('user namespace が制限されていれば sandbox なしとする', async () => {
    const { cli } = stubCli({
      runProbe: ok(probeOutput({ userns_restrict_readable: 'yes', userns_restrict: '1' }))
    })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.sandbox).toBe('none')
    // 依存は揃っているので不足依存は空。案内すべきは制限の解除である。
    expect(outcome.capabilities.missingDependencies).toEqual([])
  })

  it('キーが読めなければ制限なしとして扱う (AD-015 §8)', async () => {
    const { cli } = stubCli({
      runProbe: ok(probeOutput({ userns_restrict_readable: 'no', userns_restrict: '' }))
    })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.sandbox).toBe('bubblewrap')
  })

  it('user namespace の実地作成に失敗したら sandbox なしとする (存在確認だけでは不十分)', async () => {
    const { cli } = stubCli({ runProbe: ok(probeOutput({ userns_create: 'fail' })) })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.sandbox).toBe('none')
  })

  it('判定出力が不完全なら判定失敗にし未判定へ戻す (C-5)', async () => {
    const { cli } = stubCli({ runProbe: ok('bwrap=/usr/bin/bwrap\r\n') })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.probeState).toBe('failed')
    expect(outcome.capabilities.sandbox).toBe('unknown')
    expect(outcome.capabilities.autoModeSafe).toBe('unknown')
    expect(outcome.pathMapping).toBeNull()
  })

  it('マウント情報が空ならマッピング取得失敗として判定失敗にする', async () => {
    // **部分的に欠けたマッピングを採用しない** (C-5)。
    const { cli } = stubCli({ runProbe: ok(probeOutput({}, [])) })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.probeState).toBe('failed')
    expect(outcome.pathMapping).toBeNull()
  })

  it('呼び出しが非 0 終了なら判定失敗にする', async () => {
    const { cli } = stubCli({ runProbe: failed() })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.probeState).toBe('failed')
  })

  it('実行中の WSL1 は固定値を採りつつマッピングは取得する (FR-004 / data-model §3)', async () => {
    const { cli, calls } = stubCli()
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor({ wslVersion: 1 }), verified)

    expect(outcome.capabilities.probeState).toBe('done')
    expect(outcome.capabilities.sandbox).toBe('none')
    expect(outcome.capabilities.autoModeSafe).toBe(false)
    expect(outcome.capabilities.probedAt).toBe(NOW)
    // **免除されるのは sandbox 判定であってマッピングの取得ではない。**
    expect(outcome.pathMapping?.entries).toEqual([{ fromPrefix: 'C:\\', toPrefix: '/mnt/c' }])
    expect(calls.runProbe).toEqual(['Ubuntu-26.04'])
  })

  it('バージョン不明では呼び出しを発行せず判定失敗にする (C-5)', async () => {
    const { cli, calls } = stubCli()
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor({ wslVersion: null }), verified)

    expect(outcome.capabilities.probeState).toBe('failed')
    expect(calls.runProbe).toEqual([])
  })

  it('確認済みの値を別ディストロに流用できない (C-3 / data-model §5)', async () => {
    // **偽造ではなく正規の値の流用**。これを止めるために値が識別子を保持している。
    const { cli, calls } = stubCli({ listRunning: ok('Ubuntu-26.04\r\nDebian\r\n') })
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(
      wslDescriptor({ id: wslNamespace('Debian'), distroName: 'Debian' }),
      verified
    )

    expect(outcome.capabilities.probeState).toBe('failed')
    // **停止中ディストロへ呼び出しを発行していないこと** (SC-005)。
    expect(calls.runProbe).toEqual([])
  })

  it('期限切れの確認済みの値では呼び出しを発行しない (C-3)', async () => {
    const { cli, calls } = stubCli()
    const verified = await verifiedFor(cli, 'Ubuntu-26.04', NOW)
    // 確認から 31 秒後。TTL は 30 秒。
    const outcome = await detectorAt(cli, NOW + 31_000).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.probeState).toBe('failed')
    expect(calls.runProbe).toEqual([])
  })

  it('再判定中は安全側に倒れる (未判定を許可と読ませない)', async () => {
    // `beginProbing()` の状態で許可を問うと必ず false になることを確かめる。
    const probing = wslDescriptor().capabilities
    expect(isAutoModeAllowed({ ...probing, probeState: 'probing' })).toBe(false)
    expect(autoModeStatus({ ...probing, probeState: 'probing' })).toBe('undetermined')
  })

  it('seccomp は R-1 では常に未判定 (FR-006)', async () => {
    const { cli } = stubCli()
    const verified = await verifiedFor(cli, 'Ubuntu-26.04')
    const outcome = await detectorAt(cli).probe(wslDescriptor(), verified)

    expect(outcome.capabilities.seccompFilter).toBe('unknown')
    // 任意依存なので sandbox の可否に影響させない。
    expect(outcome.capabilities.sandbox).toBe('bubblewrap')
  })
})
