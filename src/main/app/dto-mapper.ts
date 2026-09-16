import { autoModeStatus, isAutoModeAllowed } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import type { CapabilitiesDTO, RuntimeDescriptorDTO } from '@domain/runtime/dto'

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
