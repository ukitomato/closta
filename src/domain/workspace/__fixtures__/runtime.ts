import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { Win32ClaudeStatus, Win32RuntimeDescriptor } from '@domain/runtime/descriptor'

/**
 * テスト用の descriptor 生成 (BE-051 / SC-006)。
 *
 * **`infra` の `createWin32Descriptor` を `domain` のテストから呼べない** —
 * `domain → infra` は AD-023 §7 が禁じており、テストも同じ規則に従う。
 * 同じ値をここで組み立てる。
 */
export function createWin32(
  now: number,
  claude: {
    readonly claudePath: string | null
    readonly claudeStatus: Win32ClaudeStatus
    readonly claudeOverridden: boolean
  } = { claudePath: null, claudeStatus: 'not-found', claudeOverridden: false }
): Win32RuntimeDescriptor {
  return {
    id: 'host',
    kind: 'win32',
    state: 'running',
    isDefault: false,
    capabilities: fixedCapabilities(now),
    detectedAt: now,
    ...claude
  }
}
