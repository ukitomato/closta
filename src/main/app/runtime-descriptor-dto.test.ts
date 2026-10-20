import { describe, expect, it } from 'vitest'

import { createWin32 } from '@domain/workspace/__fixtures__/runtime'
import { fixedCapabilities } from '@domain/runtime/capabilities'
import { wslNamespace } from '@domain/runtime/namespace'
import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'

import { toRuntimeDescriptorDTO } from './dto-mapper'

/** 集合を変えるには ADR が要る (AD-058)。 */
const DTO_KEYS = [
  'capabilities',
  'claudeOverridden',
  'claudeStatus',
  'detectedAt',
  'distroName',
  'hasPathMapping',
  'id',
  'isDefault',
  'kind',
  'state',
  'wslVersion'
]

const CLAUDE_PATH = 'C:\\Users\\SECRET-MARK\\.local\\bin\\claude.exe'

describe('toRuntimeDescriptorDTO の claude の状態 (X-8 / contracts C-3)', () => {
  it('DTO のキーの集合は 11 (集合を変えるには ADR が要る。AD-058)', () => {
    const dto = toRuntimeDescriptorDTO(createWin32(1))
    expect(Object.keys(dto).sort()).toEqual(DTO_KEYS)
  })

  it.each([
    ['found', CLAUDE_PATH, false],
    ['found', CLAUDE_PATH, true],
    ['not-found', null, false],
    ['shim-only', null, false],
    ['override-invalid', null, true]
  ] as const)('%s (overridden=%s 相当) の出力にパスが無い', (status, path, overridden) => {
    const dto = toRuntimeDescriptorDTO(
      createWin32(1, { claudePath: path, claudeStatus: status, claudeOverridden: overridden })
    )
    expect(dto.claudeStatus).toBe(status)
    expect(dto.claudeOverridden).toBe(overridden)
    expect(Object.keys(dto)).not.toContain('claudePath')
    expect(JSON.stringify(dto)).not.toContain('SECRET-MARK')
  })

  it('WSL の descriptor は claudeStatus: null / claudeOverridden: false', () => {
    const wsl: WslRuntimeDescriptor = {
      id: wslNamespace('Ubuntu'),
      kind: 'wsl',
      distroName: 'Ubuntu',
      wslVersion: 2,
      state: 'running',
      isDefault: true,
      capabilities: fixedCapabilities(1),
      pathMapping: null,
      detectedAt: 1
    }
    const dto = toRuntimeDescriptorDTO(wsl)
    expect(dto.claudeStatus).toBeNull()
    expect(dto.claudeOverridden).toBe(false)
  })
})
