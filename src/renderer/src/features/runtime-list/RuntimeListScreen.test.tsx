import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { Win32ClaudePathResult } from '@domain/capability'
import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'

import { installCapability } from '@/test-support/capability'
import { UBUNTU } from '@/test-support/app-shell-harness'

import {
  WIN32_CLAUDE_PICK_REJECTED_LABELS,
  WIN32_CLAUDE_SAVE_FAILED_LABEL,
  WIN32_CLAUDE_STATUS_REASONS
} from './labels'
import { RuntimeListScreen } from './RuntimeListScreen'

/** ランタイム一覧のカード (X-8 FE-020 / data-model §10.2 / SC-002 / US-2 AC1〜AC4)。 */

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

function win32(
  claudeStatus: NonNullable<RuntimeDescriptorDTO['claudeStatus']>,
  claudeOverridden = false
): RuntimeDescriptorDTO {
  return {
    ...UBUNTU,
    id: 'host',
    kind: 'win32',
    distroName: null,
    wslVersion: null,
    isDefault: false,
    claudeStatus,
    claudeOverridden
  }
}

function listOf(...runtimes: RuntimeDescriptorDTO[]): RuntimeListDTO {
  return { wslAvailability: 'available', runtimes, enumerationIssues: [] }
}

function setup(
  list: RuntimeListDTO,
  pick: () => Promise<Win32ClaudePathResult> = async () => ({ status: 'cancelled' }),
  clear: () => Promise<Win32ClaudePathResult> = async () => ({ status: 'cancelled' })
): { clearWin32ClaudePath: ReturnType<typeof vi.fn<() => Promise<Win32ClaudePathResult>>> } {
  const pickWin32ClaudePath = vi.fn(pick)
  const clearWin32ClaudePath = vi.fn(clear)
  installCapability({
    listRuntimes: async () => list,
    pickWin32ClaudePath,
    clearWin32ClaudePath
  })
  return { clearWin32ClaudePath }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RuntimeListScreen の Win32 claude の行', () => {
  it.each(['not-found', 'shim-only', 'override-invalid'] as const)(
    '%s の短いラベルと理由と直し方が出て、axe の違反が 0',
    async (status) => {
      setup(listOf(win32(status, status === 'override-invalid')))
      const { container } = render(<RuntimeListScreen />)
      const reason = WIN32_CLAUDE_STATUS_REASONS[status]!
      expect(await screen.findByText(reason)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'claude.exe を選ぶ' })).toBeTruthy()
      expect((await axe(container, AXE_RULES)).violations).toEqual([])
    }
  )

  it('found は理由を出さない', async () => {
    setup(listOf(win32('found')))
    render(<RuntimeListScreen />)
    expect(await screen.findByText('claude.exe あり')).toBeTruthy()
    for (const reason of Object.values(WIN32_CLAUDE_STATUS_REASONS)) {
      if (reason !== null) expect(screen.queryByText(reason)).toBeNull()
    }
  })

  it('「指定を解除」は claudeOverridden のときだけ出る', async () => {
    setup(listOf(win32('found', true)))
    const first = render(<RuntimeListScreen />)
    expect(await screen.findByRole('button', { name: '指定を解除' })).toBeTruthy()
    first.unmount()

    setup(listOf(win32('found', false)))
    render(<RuntimeListScreen />)
    await screen.findByRole('button', { name: 'claude.exe を選ぶ' })
    expect(screen.queryByRole('button', { name: '指定を解除' })).toBeNull()
  })

  it('updated で一覧が置き換わる', async () => {
    const user = userEvent.setup()
    setup(listOf(win32('not-found')), async () => ({
      status: 'updated',
      runtimes: [win32('found', true)]
    }))
    render(<RuntimeListScreen />)
    await user.click(await screen.findByRole('button', { name: 'claude.exe を選ぶ' }))
    expect(await screen.findByText('claude.exe あり')).toBeTruthy()
    expect(screen.getByRole('button', { name: '指定を解除' })).toBeTruthy()
  })

  it('rejected と save-failed の理由をカードの中に出す。cancelled では何も出ない', async () => {
    const user = userEvent.setup()
    const results: Win32ClaudePathResult[] = [
      { status: 'rejected', reason: 'not-exe' },
      { status: 'save-failed' },
      { status: 'cancelled' }
    ]
    setup(listOf(win32('not-found')), async () => results.shift()!)
    render(<RuntimeListScreen />)
    const button = await screen.findByRole('button', { name: 'claude.exe を選ぶ' })

    await user.click(button)
    expect(await screen.findByText(WIN32_CLAUDE_PICK_REJECTED_LABELS['not-exe'])).toBeTruthy()

    await user.click(button)
    expect(await screen.findByText(WIN32_CLAUDE_SAVE_FAILED_LABEL)).toBeTruthy()

    await user.click(button)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('解除ボタンは clearWin32ClaudePath を呼ぶ', async () => {
    const user = userEvent.setup()
    const { clearWin32ClaudePath } = setup(listOf(win32('override-invalid', true)))
    render(<RuntimeListScreen />)
    await user.click(await screen.findByRole('button', { name: '指定を解除' }))
    expect(clearWin32ClaudePath).toHaveBeenCalledTimes(1)
  })

  it('WSL のカードに claude の行もボタンも出ない。DOM にパスの目印が無い', async () => {
    setup(listOf(UBUNTU))
    const { container } = render(<RuntimeListScreen />)
    await screen.findByText('WSL: Ubuntu')
    expect(screen.queryByRole('button', { name: 'claude.exe を選ぶ' })).toBeNull()
    expect(container.textContent).not.toMatch(/[A-Z]:\\/)
  })
})
