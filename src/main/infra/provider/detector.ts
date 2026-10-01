import { readFile } from 'node:fs/promises'

import { CREDENTIAL_ENV_NAMES } from '@domain/provider/forward-env'
import type { DetectedCandidate } from '@domain/provider/types'
import { hostPathOps } from '@domain/runtime/path-api'
import type { HostPath } from '@domain/runtime/path-types'

import { CONFIG_DIR_NAME } from '../session/config-dir'
import { detectCandidates } from './detect'

/**
 * 検出の I/O オーケストレータ (BE-001)。純粋な `detectCandidates` / `parseAwsProfiles` (detect.ts) に対し、
 * こちらが `~/.aws/config` の読み取り・config dir の存在確認・親 env の走査を行い値で渡す。
 *
 * **`os` / `process` / `electron` を import しない** (H-04)。ホームと親 env は composition が引数で渡す。
 * `~/.aws/config` の**読み取り失敗 (無い / 権限不足 / I/O) は `null` に落として例外にしない** (SC-009 / po L-102)。
 */

export interface ProviderDetectorDeps {
  /** ホーム (HostPath)。composition が `app.getPath('home')` を解決して渡す。 */
  readonly home: HostPath
  /** 親 env。composition が `process.env` を渡す (名前のみ走査。値は運ばない)。 */
  readonly parentEnv: Readonly<Record<string, string | undefined>>
  /** config dir の存在確認 (`hostFs.exists`)。 */
  readonly exists: (path: HostPath) => Promise<boolean>
}

function joinHost(home: HostPath, segments: readonly string[]): HostPath | null {
  let current: HostPath = home
  for (const seg of segments) {
    const r = hostPathOps.join(current, seg)
    if (!r.ok) return null
    current = r.path
  }
  return current
}

export function createProviderDetector(
  deps: ProviderDetectorDeps
): () => Promise<DetectedCandidate[]> {
  return async () => {
    // config dir (home/.claude) の存在。
    const configDir = joinHost(deps.home, [CONFIG_DIR_NAME])
    const configDirExists = configDir !== null ? await deps.exists(configDir) : false

    // ~/.aws/config の内容 (読めなければ null。SC-009)。
    let awsConfigContent: string | null = null
    const awsCfg = joinHost(deps.home, ['.aws', 'config'])
    if (awsCfg !== null) {
      try {
        awsConfigContent = await readFile(awsCfg.value, 'utf8')
      } catch {
        awsConfigContent = null
      }
    }

    // 親 env の認証系変数の**名前のみ** (存在するもの。値は運ばない。H-10)。
    const credentialEnvNames = CREDENTIAL_ENV_NAMES.filter(
      (name) => deps.parentEnv[name] !== undefined
    )

    return detectCandidates({
      home: deps.home,
      configDirExists,
      awsConfigContent,
      credentialEnvNames
    })
  }
}
