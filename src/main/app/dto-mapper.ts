import { autoModeStatus, isAutoModeAllowed } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import type { CapabilitiesDTO, RuntimeDescriptorDTO } from '@domain/runtime/dto'
import { pathParts } from '@domain/runtime/path-types'
import { originDisplay, originPath } from '@domain/session/cwd-origin'
import type { EnumerationOutcomeDTO, SessionGroupDTO, SessionSummaryDTO } from '@domain/session/dto'
import type { SessionGroup } from '@domain/session/group'
import type { SessionSummary } from '@domain/session/summary'
import type { EnumerationOutcome } from '@domain/session/target'

/**
 * `domain` の値を IPC 境界を渡る形へ写す (`app` レイヤ)。
 *
 * **生の `autoModeSafe` を渡さない** — `unknown` は JavaScript で truthy であり真偽判定が誤る。
 * ゲート判定用の `autoModeAllowed` と表示用の `autoModeStatus` を別フィールドで渡す。
 *
 * **`PathMapping` の中身を渡さない** — `hasPathMapping` の真偽だけを渡す。
 * 変換は main 側の `domain` 純粋関数で行う。
 */

function toCapabilitiesDTO(descriptor: RuntimeDescriptor): CapabilitiesDTO {
  const c = descriptor.capabilities
  return {
    probeState: c.probeState,
    // 閉じた参照キー。renderer が FR-047 に従って訳出する。
    // **ここから `autoModeSafe` 相当を再導出してはならない** (不変条件)。
    sandboxKind: c.sandbox,
    seccompStatus: c.seccompFilter,
    missingDependencies: c.missingDependencies.map((d) => ({
      name: d.name,
      docAnchor: d.docAnchor
    })),
    probedAt: c.probedAt,
    autoModeAllowed: isAutoModeAllowed(c),
    autoModeStatus: autoModeStatus(c)
  }
}

export function toRuntimeDescriptorDTO(descriptor: RuntimeDescriptor): RuntimeDescriptorDTO {
  return {
    id: descriptor.id,
    kind: descriptor.kind,
    distroName: descriptor.kind === 'wsl' ? descriptor.distroName : null,
    wslVersion: descriptor.kind === 'wsl' ? descriptor.wslVersion : null,
    state: descriptor.state,
    isDefault: descriptor.isDefault,
    capabilities: toCapabilitiesDTO(descriptor),
    hasPathMapping: descriptor.kind === 'wsl' ? descriptor.pathMapping !== null : false,
    detectedAt: descriptor.detectedAt
  }
}

/* ── セッション列挙 (R-2 / BE-026) ─────────────────────────────── */

/**
 * `SessionSummary` を DTO へ写す。
 *
 * **表示用の生値を運ぶのは `cwdDisplay` の 1 種類だけである** (FR-042 / SC-011)。
 * `rawCwd` のような名前で UNC 形式を境界に出す穴を作らない。
 * `cwd` は所在が決まる出自のときだけ値を持ち、**名前空間を明示して運ぶ**
 * (brand は境界で退化するため)。
 */
export function toSessionSummaryDTO(session: SessionSummary): SessionSummaryDTO {
  const path = originPath(session.origin)
  return {
    sessionId: session.sessionId,
    targetKey: session.targetKey,
    targetLabel: session.targetLabel,
    summary: session.summary,
    firstPrompt: session.firstPrompt,
    customTitle: session.customTitle,
    lastModified: session.lastModified,
    createdAt: session.createdAt,
    fileSize: session.fileSize,
    gitBranch: session.gitBranch,
    tag: session.tag,
    cwd: path === null ? null : pathParts(path),
    cwdDisplay: originDisplay(session.origin),
    originKind: session.origin.kind,
    programmatic: session.source.programmatic,
    worktree: session.source.worktree,
    normalized: {
      truncated: session.normalized.truncated,
      controlCharsRemoved: session.normalized.controlCharsRemoved
    }
  }
}

/** グループを DTO へ写す。**4 種を 2 種に潰さない** (FR-022 / FR-025 / FR-028)。 */
export function toSessionGroupDTO(group: SessionGroup): SessionGroupDTO {
  const sessions = group.sessions.map(toSessionSummaryDTO)
  switch (group.kind) {
    case 'folder':
      return { kind: 'folder', folderId: group.folderId, boundary: group.boundary, sessions }
    case 'pending':
      return {
        kind: 'pending',
        location: group.location,
        reasonKey: group.reasonKey,
        sessions
      }
    case 'unregistered':
      return {
        kind: 'unregistered',
        cwdKey: group.cwdKey,
        cwd: group.cwd === null ? null : pathParts(group.cwd),
        cwdDisplay: group.cwdDisplay,
        location: group.location,
        sessions
      }
    case 'unknown':
      return { kind: 'unknown', reasonKey: group.reasonKey, sessions }
  }
}

/**
 * 所在ごとの成否を DTO へ写す。
 *
 * **config ディレクトリの実体パスを渡さない** (FR-042)。
 * 不透明な `targetKey` と表示用の `targetLabel` だけを渡す —
 * `TargetOutcome.configDir` は**意図的に捨てている**。
 */
export function toEnumerationOutcomeDTOs(
  outcome: EnumerationOutcome
): readonly EnumerationOutcomeDTO[] {
  return outcome.outcomes.map((target) => ({
    location: target.location,
    targetKey: target.key,
    targetLabel: target.label,
    status: target.status,
    reasonKey: target.reasonKey,
    count: target.count,
    truncated: target.truncated,
    fetchedAt: outcome.fetchedAt
  }))
}
