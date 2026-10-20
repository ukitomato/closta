import { stat } from 'node:fs/promises'

import type { HostPath } from '@domain/runtime/path-types'

/**
 * ホスト側ファイルシステムの最小の窓 (BE-047)。
 *
 * **任意パスの存在を問い合わせる経路を作らない。** 公開するのは `exists` 1 つだけにする。
 * 呼び出し側は 2 箇所に限る。
 *
 * | 呼び出し元 | 対象 | 根拠 |
 * |---|---|---|
 * | `folder-service` | 登録済みエントリ | R-1 FR-027 |
 * | `infra/session/target-finder` | 注入されたホームから導いた config ディレクトリ | R-2 design-gate M-001 |
 *
 * どちらも**未信頼入力ではない**。renderer から任意のパスを渡せる経路は増えていない。
 *
 * `app` からの動的 import (`await import('node:fs/promises')`) で済ませない。
 * 動的 import は静的な依存グラフ検証をすり抜け、
 * 「`app` がどの OS 資源に触るか」がグラフから読めなくなる。
 */
export interface HostFileSystem {
  exists(path: HostPath): Promise<boolean>
}

/**
 * 実在する通常のファイルか (`stat` の `isFile()`。リンクはたどる。失敗は false)。X-8 (data-model §2 / §7)。
 * `HostFileSystem` とは別に置く (その窓の形を変えない)。呼び出し元は main が持つ claude の実行ファイルのパスだけで、
 * renderer から任意のパスを渡せる経路は増えない。
 */
export async function isHostFile(path: HostPath): Promise<boolean> {
  try {
    return (await stat(path.value)).isFile()
  } catch {
    return false
  }
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
