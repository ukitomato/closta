import { describe, expect, it, vi } from 'vitest'

import type { RuntimeListDTO } from '@domain/runtime/dto'

import { createWin32ClaudePathService } from './win32-claude-path-service'

const LIST = { wslAvailability: 'available', runtimes: [], enumerationIssues: [] } as RuntimeListDTO
const EXE = 'C:\\Users\\u\\.local\\bin\\claude.exe'

function setup(options: { chosen?: string | null; saveFails?: boolean } = {}): {
  service: ReturnType<typeof createWin32ClaudePathService>
  save: ReturnType<typeof vi.fn<(path: string | null) => Promise<void>>>
  refresh: ReturnType<typeof vi.fn<() => Promise<RuntimeListDTO>>>
} {
  const save = vi.fn<(path: string | null) => Promise<void>>(async () => {
    if (options.saveFails) throw new Error(`EPERM ${EXE}`)
  })
  const refresh = vi.fn<() => Promise<RuntimeListDTO>>(async () => LIST)
  const service = createWin32ClaudePathService({
    chooseFile: async () => (options.chosen === undefined ? EXE : options.chosen),
    save,
    refresh
  })
  return { service, save, refresh }
}

describe('Win32 claude path service (C-1 / C-2)', () => {
  it('取り消しは cancelled で保存も再検出もしない', async () => {
    const { service, save, refresh } = setup({ chosen: null })
    expect(await service.pick()).toEqual({ status: 'cancelled' })
    expect(save).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('.exe でないものは rejected で保存しない', async () => {
    const { service, save } = setup({ chosen: 'C:\\a\\claude.cmd' })
    expect(await service.pick()).toEqual({ status: 'rejected', reason: 'not-exe' })
    expect(save).not.toHaveBeenCalled()
  })

  it('保存の失敗は save-failed (理由・パスを返さない)', async () => {
    const { service, refresh } = setup({ saveFails: true })
    const result = await service.pick()
    expect(result).toEqual({ status: 'save-failed' })
    expect(JSON.stringify(result)).not.toContain('claude')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('保存して再検出の結果を返す。戻り値にパスの目印が無い', async () => {
    const { service, save, refresh } = setup()
    const result = await service.pick()
    expect(save).toHaveBeenCalledWith(EXE)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ status: 'updated', runtimes: [] })
    expect(JSON.stringify(result)).not.toContain('Users')
  })

  it('解除は null を保存して再検出する。保存の失敗は save-failed', async () => {
    const { service, save, refresh } = setup()
    expect(await service.clear()).toEqual({ status: 'updated', runtimes: [] })
    expect(save).toHaveBeenCalledWith(null)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(await setup({ saveFails: true }).service.clear()).toEqual({ status: 'save-failed' })
  })
})
