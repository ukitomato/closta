import { readdir, stat } from 'node:fs/promises'

import { isSameDistro } from '@domain/runtime/namespace'
import { runtimePathOps } from '@domain/runtime/path-api'
import type { RuntimePath } from '@domain/runtime/path-types'
import type {
  DirEntry,
  ListDirErrorReason,
  ListDirResult,
  WslFileSystem
} from '@domain/runtime/interfaces'
import { checkNotExpired, type VerifiedRunning } from '@domain/runtime/verified-running'

/**
 * WSL 側のディレクトリ列挙 (BE-043 / contracts/runtime-detection.md 「ファイル列挙」)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | UNC 経由とし、`wsl.exe` を使わない | AD-015 §1 (単一ファイル読みで 50 倍速い) |
 * | **UNC パスの組み立ては自分で行わない。パス API の戻り値を受け取るだけ** | FR-025 |
 * | **有効期間内の実行中確認済みの値に対してのみ発行する** | C-3 |
 * | **確認済みの値と UNC 値が同じディストロを指すことを `isSameDistro()` で検証する** | 種別が構造的に異なる |
 * | **子・親のパスは完成した値として返す** | FR-025 |
 * | **UNC 形式はこのモジュールの内側に閉じる** | `unc:<D>` を IPC 境界へ出さない |
 * | **期限の検査はファイルアクセスの前に行う** | 期限内に実体が停止した窓での UNC アクセスは停止中ディストロを起動して成功しうる |
 */

/** 列挙の上限。巨大ディレクトリは応答サイズと SC-004 を壊す。 */
export const MAX_DIR_ENTRIES = 2000

function failure(reason: ListDirErrorReason): ListDirResult {
  return { ok: false, reason }
}

/**
 * 確認済みの値を検査する。
 *
 * **`checkVerified` ではなく `checkSameTarget` 相当を `isSameDistro` で行う。**
 * 左辺は `wsl:<D>`、右辺は変換後の `unc:<D>` で**種別が構造的に異なる**ため、
 * 境界を渡る値どうしに課す「種別まで完全一致」をここに適用すると常に偽になる。
 */
function checkAccess(
  verified: VerifiedRunning,
  target: RuntimePath,
  now: number
): ListDirErrorReason | null {
  // **期限の検査を先に行う。** 失敗検知に依存すると、停止中ディストロを起動して
  // 成功した場合に検知が発火しない (data-model §5)。
  if (!checkNotExpired(verified, now).ok) return 'distro-unreachable'
  if (!isSameDistro(verified.namespace, target.namespace)) return 'distro-unreachable'
  return null
}

/** Node のエラーコードを理由キーに落とす。**種別を区別して返す** (contracts C-5)。 */
function toReason(error: unknown): ListDirErrorReason {
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied'
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'not-found'
  if (code === 'ENAMETOOLONG') return 'path-too-long'
  // UNC 共有に届かない場合はディストロ側の問題として扱う。
  return 'distro-unreachable'
}

export function createWslFileSystem(): WslFileSystem {
  /** `RuntimePath` を UNC へ変換する。**組み立てはパス API に委ねる。** */
  function toUncValue(target: RuntimePath): string | null {
    const unc = runtimePathOps.toUnc(target)
    return unc.ok ? unc.path.value : null
  }

  return {
    async listDirectory(target, verified, now): Promise<ListDirResult> {
      const denied = checkAccess(verified, target, now)
      if (denied !== null) return failure(denied)

      const uncValue = toUncValue(target)
      if (uncValue === null) return failure('not-found')

      let dirents
      try {
        dirents = await readdir(uncValue, { withFileTypes: true })
      } catch (error) {
        return failure(toReason(error))
      }

      if (dirents.length > MAX_DIR_ENTRIES) return failure('too-many-entries')

      const entries: DirEntry[] = []
      for (const dirent of dirents) {
        /*
         * **各エントリのパスを完成した値として返す** (FR-025)。
         * 名前から呼び出し元に組み立てさせない。
         * 組み立てに失敗する名前 (セパレータを含む等) は列挙から落とす —
         * ここで落とさないと `null` を含む配列が IPC 境界を渡る。
         */
        const child = runtimePathOps.join(target, dirent.name)
        if (!child.ok) continue
        entries.push({
          name: dirent.name,
          isDirectory: dirent.isDirectory(),
          // **`wsl:<D>` の値を返す。`unc:<D>` を IPC 境界へ出さない。**
          path: child.path
        })
      }

      return {
        ok: true,
        cwd: target,
        parent: runtimePathOps.parent(target),
        entries
      }
    },

    async exists(target, verified, now): Promise<boolean> {
      if (checkAccess(verified, target, now) !== null) return false

      const uncValue = toUncValue(target)
      if (uncValue === null) return false

      try {
        await stat(uncValue)
        return true
      } catch {
        return false
      }
    }
  }
}
