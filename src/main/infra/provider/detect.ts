import type { DetectedCandidate } from '@domain/provider/types'
import { hostPathOps } from '@domain/runtime/path-api'
import type { HostPath } from '@domain/runtime/path-types'

import { CONFIG_DIR_NAME } from '../session/config-dir'

/**
 * 認証の痕跡を**検出候補**として組み立てる (FR-002 / BE-001)。**提示のみ・自動登録しない** (SC-001)。
 *
 * **`os` / `process` / `electron` を import しない** (H-04 / R-04。config-dir.ts と同じ規則) — ホーム、
 * `~/.aws/config` の内容、親 env から拾った認証系変数名は**すべて引数で受け取る** (composition root が
 * OS 依存の解決を行い値で渡す。provider infra に platform 分岐を持ち込まない)。
 * **env の秘密「値」を運ばない** — 変数名のみを扱う (H-10 / FR-002)。破損した `~/.aws/config` はスキップし
 * 他候補を継続する (SC-009。パース失敗を `null`/空に落として例外にしない)。
 */

/**
 * `~/.aws/config` の profile 名を抽出する純粋関数。INI の `[profile <name>]` と `[default]` を拾う
 * (`~/.aws/config` の綴り)。破損行は無視して読める分を返す (SC-009)。
 */
export function parseAwsProfiles(content: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*\[\s*(?:profile\s+)?([^\]]+?)\s*\]\s*$/.exec(line)
    if (m === null) continue
    const name = m[1].trim()
    if (name.length === 0 || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

export interface DetectInput {
  /** ホーム (HostPath)。composition が `os.homedir()` を解決して渡す (H-04)。 */
  readonly home: HostPath
  /** `home/.claude` が存在するか (composition が fs で確認)。 */
  readonly configDirExists: boolean
  /** `~/.aws/config` の内容。読めなければ `null` (無い / 権限不足 / I/O)。 */
  readonly awsConfigContent: string | null
  /** 親 env から拾った認証系変数の**名前のみ** (値は運ばない。H-10)。 */
  readonly credentialEnvNames: readonly string[]
}

/**
 * 検出候補を組み立てる。infra は候補を提示するのみ — `alreadyRegistered` の確定と dedup は
 * `domain` の `normalizeDetectedCandidates` が行う (登録済みとの照合は登録簿を要するため)。
 */
export function detectCandidates(input: DetectInput): DetectedCandidate[] {
  const candidates: DetectedCandidate[] = []

  // (1) config ディレクトリ候補 (home/.claude)。存在するときのみ提示。
  if (input.configDirExists) {
    const joined = hostPathOps.join(input.home, CONFIG_DIR_NAME)
    if (joined.ok) {
      candidates.push({
        kind: 'config-dir',
        displayLabel: joined.path.value,
        configDirValue: joined.path.value,
        namespace: joined.path.namespace,
        alreadyRegistered: false
      })
    }
  }

  // (2) `~/.aws/config` のプロファイル (破損はスキップして読める分。SC-009)。
  if (input.awsConfigContent !== null) {
    for (const profileName of parseAwsProfiles(input.awsConfigContent)) {
      candidates.push({
        kind: 'aws-profile',
        displayLabel: profileName,
        profileName,
        alreadyRegistered: false
      })
    }
  }

  // (3) 既存の認証系 env (変数名のみ。値は運ばない。H-10)。
  if (input.credentialEnvNames.length > 0) {
    candidates.push({
      kind: 'env-passthrough',
      displayLabel: `環境変数 (${input.credentialEnvNames.length})`,
      varNames: [...input.credentialEnvNames],
      alreadyRegistered: false
    })
  }

  return candidates
}
