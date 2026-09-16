import { stat } from 'node:fs/promises'

import type { HostPath } from '@domain/runtime/path-types'

/**
 * ホスト側ファイルシステムの最小の窓 (BE-047)。
 *
 * **登録済みエントリの実在確認にしか使わない** (FR-027)。
 * 任意パスの存在を問い合わせる経路を作らないため、公開するのは `exists` 1 つだけにする。
 *
 * `app` からの動的 import (`await import('node:fs/promises')`) で済ませない。
 * 動的 import は静的な依存グラフ検証をすり抜け、
 * 「`app` がどの OS 資源に触るか」がグラフから読めなくなる。
 */
export interface HostFileSystem {
  exists(path: HostPath): Promise<boolean>
}

export function createHostFileSystem(): HostFileSystem {
  return {
    async exists(path) {
      try {
        await stat(path.value)
        return true
      } catch {
        return false
      }
    }
  }
}
