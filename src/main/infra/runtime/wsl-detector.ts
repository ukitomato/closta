import {
  type Capabilities,
  type MissingDependency,
  type SandboxKind,
  beginProbing,
  isDependencyName,
  missingDependency,
  probeFailed,
  probedCapabilities,
  fixedCapabilities
} from '@domain/runtime/capabilities'
import type {
  EnumerationIssue,
  RuntimeDescriptor,
  RuntimeEnumeration
} from '@domain/runtime/descriptor'
import type { ProbeOutcome, RuntimeDetector } from '@domain/runtime/interfaces'
import { isValidDistroName, wslNamespace, type WslNamespaceId } from '@domain/runtime/namespace'
import { makePathMapping, type PathMapping } from '@domain/runtime/path-mapping'
import { isUnderAnyPrefix } from '@domain/workspace/prefix-match'
import {
  checkVerified,
  createVerifiedRunning,
  type VerifiedRunning
} from '@domain/runtime/verified-running'

import { createWin32Descriptor } from './win32'
import type { WslCli } from './wsl-cli'
import {
  parseMountEntries,
  parseNames,
  parseProbeOutput,
  parseRunningNames,
  parseVerbose
} from './wsl-output'

/**
 * `RuntimeDetector` の実装 (BE-022 / BE-023 / BE-025 / BE-026 / BE-029)。
 *
 * **呼び出し回数を契約で固定している** (contracts/runtime-detection.md C-1)。
 *
 * | 段階 | 回数 |
 * |---|---|
 * | `list()` | **3** (並列) |
 * | `verifyRunning()` (一括) | **1** |
 * | `probe(distro)` | **1** (ディストロあたり) |
 *
 * **回数をディストロ数にも利用者の操作回数にも比例させてはならない** (FR-010)。
 */

export interface DetectorDeps {
  readonly cli: WslCli
  /** 時刻。注入するのは capabilities の `probedAt` と確認済みの値の期限を試験可能にするため。 */
  readonly now: () => number
}

/**
 * `probe` の期限。`VerifiedRunning` の既定 TTL (30 秒) をそのまま使う。
 * 判定バッチは `verifyRunning` の直後に発行されるため余裕がある。
 */
const PROBE_VERIFICATION_TTL_MS = 30_000

export function createRuntimeDetector(deps: DetectorDeps): RuntimeDetector {
  const { cli, now } = deps

  return {
    async list(): Promise<RuntimeEnumeration> {
      const detectedAt = now()
      const win32 = createWin32Descriptor(detectedAt)

      // **3 系統を並列に 1 回ずつ。** 直列にすると固定コスト 1.5 秒が 3 倍になる。
      const [names, running, verbose] = await Promise.all([
        cli.listNames(),
        cli.listRunning(),
        cli.listVerbose()
      ])

      /*
       * **名前の列挙が失敗したら `Win32Runtime` のみを返す。例外を投げない**
       * (FR-012 / SC-015)。WSL 未搭載のホストがこの経路を通る。
       */
      if (!names.ok) return { runtimes: [win32], enumerationIssues: [] }

      const rawNames = parseNames(names.stdout)

      /*
       * **文字種を列挙の時点で検証する** (data-model §4)。
       * 満たさない名前は descriptor を作らず、**列挙不能として理由つきで返す** —
       * 黙って落とすと `wsl -l -v` との 1 対 1 が破れ、利用者は原因が名前だと気付けない。
       */
      const validNames: string[] = []
      const enumerationIssues: EnumerationIssue[] = []
      for (const rawName of rawNames) {
        if (isValidDistroName(rawName)) validNames.push(rawName)
        else enumerationIssues.push({ rawName, reasonKey: 'invalid-name-charset' })
      }

      // **実行状態は実行中の列挙との積集合で決める。** 状態文字列を読まない (C-2)。
      const runningNames = running.ok ? parseRunningNames(running.stdout) : new Set<string>()

      /*
       * バージョン列挙だけが失敗した場合は `wslVersion: null` とし、
       * **実地判定を行わず** `probeState: failed` にする (C-5)。
       * WSL1 と WSL2 を区別できない以上、WSL1 の固定値も WSL2 の実地判定も根拠を欠く。
       */
      const verboseEntries = verbose.ok ? parseVerbose(verbose.stdout, validNames) : []
      const byName = new Map(verboseEntries.map((entry) => [entry.name, entry]))

      const runtimes: RuntimeDescriptor[] = [win32]
      for (const name of validNames) {
        const entry = byName.get(name)
        const wslVersion = entry?.version ?? null
        runtimes.push({
          id: wslNamespace(name),
          kind: 'wsl',
          distroName: name,
          wslVersion,
          state: runningNames.has(name) ? 'running' : 'stopped',
          isDefault: entry?.isDefault ?? false,
          // バージョン不明は判定失敗。それ以外は未判定 (data-model §3 の表)。
          capabilities: wslVersion === null ? probeFailed() : beginProbing(),
          pathMapping: null,
          detectedAt
        })
      }

      return { runtimes, enumerationIssues }
    },

    async verifyRunning(ids): Promise<ReadonlyMap<WslNamespaceId, VerifiedRunning>> {
      /*
       * **実行中確認済みの値を作る唯一の経路。**
       * 引数の有無にかかわらず**呼び出しは 1 回**である。
       * ディストロごとに呼ぶと C-1 の予算を壊す。
       */
      const result = await cli.listRunning()
      const verifiedAt = now()
      const map = new Map<WslNamespaceId, VerifiedRunning>()
      if (!result.ok) return map

      const wanted = ids === undefined ? null : new Set<WslNamespaceId>(ids)
      for (const name of parseRunningNames(result.stdout)) {
        if (!isValidDistroName(name)) continue
        const id = wslNamespace(name)
        if (wanted !== null && !wanted.has(id)) continue
        map.set(id, createVerifiedRunning(id, verifiedAt))
      }
      return map
    },

    async probe(descriptor, verified): Promise<ProbeOutcome> {
      /*
       * **入口で確認済みの値を検査する** (C-3)。
       * 期限と対象の両方を見る — 正規の値を別ディストロに流用する経路も塞ぐ。
       */
      const check = checkVerified(verified, descriptor.id, now(), PROBE_VERIFICATION_TTL_MS)
      if (!check.ok) return { capabilities: probeFailed(), pathMapping: null }

      /*
       * バージョン不明では判定の根拠が無い。**呼び出しを発行しない** (C-5)。
       */
      if (descriptor.wslVersion === null) {
        return { capabilities: probeFailed(), pathMapping: null }
      }

      const result = await cli.runProbe(descriptor.distroName)
      if (!result.ok) return { capabilities: probeFailed(), pathMapping: null }

      const parsed = parseProbeOutput(result.stdout)
      if (!parsed.ok) return { capabilities: probeFailed(), pathMapping: null }

      const probedAt = now()

      /*
       * **マッピングを先に確定させる** (順序制約。FR-005 / research R-02)。
       * 必須依存の解決パスが Windows マウント配下かどうかの判定に使うため、
       * 依存の判定より前に必要である。
       */
      const mapping = buildMapping(descriptor.id, parsed.output.mountLines, probedAt)
      if (mapping === null) {
        // **部分的に欠けたマッピングを採用しない** (C-5)。
        return { capabilities: probeFailed(), pathMapping: null }
      }

      /*
       * **実行中の WSL1 にもマッピング取得のために呼び出しを発行する** (data-model §3)。
       * FR-004 が免除するのは sandbox 判定の実地テストであって、
       * パス変換のマッピングではない。capabilities は固定値を採る。
       */
      if (descriptor.wslVersion === 1) {
        return { capabilities: fixedCapabilities(probedAt), pathMapping: mapping }
      }

      const capabilities = deriveWsl2Capabilities(parsed.output.values, mapping, probedAt)
      if (capabilities === null) {
        // 未知の依存名が返った場合など。**出力由来の文字列を UI へ直達させない。**
        return { capabilities: probeFailed(), pathMapping: null }
      }
      return { capabilities, pathMapping: mapping }
    }
  }
}

/** マウント情報から `host → wsl:<D>` のマッピングを組み立てる。 */
function buildMapping(
  id: WslNamespaceId,
  mountLines: readonly string[],
  acquiredAt: number
): PathMapping | null {
  const entries = parseMountEntries(mountLines).map((entry) => ({
    fromPrefix: entry.hostPrefix,
    toPrefix: entry.mountPoint
  }))
  const result = makePathMapping('host', id, entries, acquiredAt)
  return result.ok ? result.mapping : null
}

/**
 * WSL2 実行中の実地判定 (AD-015 §8 / data-model §3)。
 *
 * すべて満たしたときのみ `sandbox: 'bubblewrap'`。
 *
 * 1. `bwrap` が存在する — **解決パスが当該ディストロの Windows マウント配下でないこと**
 * 2. `socat` が存在する — 同上
 * 3. 非特権 user namespace の作成が制限されていない
 * 4. 実際に user namespace を作成できる
 *
 * **除外条件に特定のマウント位置を書かない** (FR-024)。マウント位置は設定で変更でき、
 * `/mnt/` を条件に書くと変更した環境で偽陽性が通る。マッピングを基準にする。
 *
 * 未知の依存名が返った場合は `null` を返し、呼び出し元が判定失敗に倒す。
 */
function deriveWsl2Capabilities(
  values: ReadonlyMap<string, string>,
  mapping: PathMapping,
  probedAt: number
): Capabilities | null {
  const missing: MissingDependency[] = []

  for (const name of ['bwrap', 'socat']) {
    if (!isDependencyName(name)) return null
    const resolved = values.get(name) ?? ''
    if (resolved.length === 0) {
      missing.push(missingDependency(name))
      continue
    }
    /*
     * **Windows マウント配下に解決されたものは不在として扱う。**
     * WSL は既定で Windows の PATH を Linux 側に追加するため、
     * `command -v socat` が Windows 側の実行ファイルを返しうる。
     * これを「存在する」と扱うと、Linux 側に必須依存が無いまま sandbox ありと表明される。
     *
     * ここで見るのは `host → wsl:<D>` のマッピングの**行き先側**であるため、
     * 逆向きのマッピングを組み立てて照合する。
     */
    if (isUnderAnyPrefix(reverse(mapping), resolved)) {
      missing.push(missingDependency(name))
    }
  }

  /*
   * 判定 3。**キー不在は「制限なし」** (AD-015 §8) だが、
   * それが言えるのは確認が正常に行われたうえでの話である。
   * スクリプトは読めたかどうかを別の項目で返しており、両方を見る。
   */
  const readable = values.get('userns_restrict_readable') === 'yes'
  const restricted = readable && values.get('userns_restrict')?.trim() === '1'

  // 判定 4。存在確認だけでは不十分で、実地作成が要る。
  const canCreate = values.get('userns_create') === 'ok'

  const sandbox: SandboxKind =
    missing.length === 0 && !restricted && canCreate ? 'bubblewrap' : 'none'

  return probedCapabilities({ sandbox, missingDependencies: missing, probedAt })
}

/**
 * マッピングの向きを入れ替える。
 *
 * 接頭辞照合は `from` 側の意味論でセパレータを決めるため、
 * ランタイム側の値を照合するには向きを反転させた形が要る。
 * **entries の順序と内容は保つ** — 最長一致の結果を変えないため。
 */
function reverse(mapping: PathMapping): PathMapping {
  return {
    from: mapping.to,
    to: mapping.from,
    entries: mapping.entries.map((entry) => ({
      fromPrefix: entry.toPrefix,
      toPrefix: entry.fromPrefix
    })),
    acquiredAt: mapping.acquiredAt
  }
}
