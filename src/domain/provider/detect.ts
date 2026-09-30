import type { DetectedCandidate, ProviderProfile } from './types'

/**
 * 検出候補の**正規化・重複判定** (FR-002 / BE-002。純粋関数)。
 *
 * 検出 (infra) が返した生候補に対し、**登録済みとの重複を区別** (`alreadyRegistered`) し、同一候補を dedup する。
 * **自動登録しない** — 提示用のフラグを立てるのみ (SC-001)。**env の秘密値は運ばない** (DetectedCandidate 型が
 * 変数名・存在・所在のみ。H-10)。
 */

/** 候補の同一性キー (3 由来ごとの判別)。 */
function candidateKey(candidate: DetectedCandidate): string {
  switch (candidate.kind) {
    case 'config-dir':
      return `config-dir\u0000${candidate.namespace}\u0000${candidate.configDirValue}`
    case 'aws-profile':
      return `aws-profile\u0000${candidate.profileName}`
    case 'env-passthrough':
      return `env-passthrough\u0000${[...candidate.varNames].sort().join(',')}`
  }
}

/** 登録済み profile が候補と一致するか (3 由来ごとの照合)。 */
function isRegistered(
  candidate: DetectedCandidate,
  registered: readonly ProviderProfile[]
): boolean {
  return registered.some((profile) => {
    const cred = profile.credential
    switch (candidate.kind) {
      case 'config-dir':
        return (
          (cred.source === 'config-dir' || cred.source === 'in-app-login') &&
          profile.configDir !== undefined &&
          profile.configDir.namespace === candidate.namespace &&
          profile.configDir.value === candidate.configDirValue
        )
      case 'aws-profile':
        return cred.source === 'aws-profile' && cred.profileName === candidate.profileName
      case 'env-passthrough':
        return (
          cred.source === 'env-passthrough' &&
          [...cred.varNames].sort().join(',') === [...candidate.varNames].sort().join(',')
        )
    }
  })
}

/**
 * 検出候補を正規化する。dedup してから `alreadyRegistered` を確定する。
 */
export function normalizeDetectedCandidates(
  candidates: readonly DetectedCandidate[],
  registered: readonly ProviderProfile[]
): DetectedCandidate[] {
  const seen = new Set<string>()
  const out: DetectedCandidate[] = []
  for (const candidate of candidates) {
    const key = candidateKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...candidate, alreadyRegistered: isRegistered(candidate, registered) })
  }
  return out
}
