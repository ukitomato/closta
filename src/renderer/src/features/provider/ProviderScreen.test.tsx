import type { ProviderDraft, RegisterProviderResult } from '@domain/provider/dto'
import type { DetectedCandidate } from '@domain/provider/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { installCapability } from '@/test-support/capability'

import { ProviderScreen } from './ProviderScreen'

/**
 * Provider 画面の renderer 単体テスト (FE-001 / FE-030 / SC-001 / M-03。X-3)。
 * preload をスタブし Electron を起動しない。
 */

const summary = {
  id: 'p1',
  displayName: 'Prod',
  backend: 'anthropic' as const,
  source: 'api-key' as const,
  modelCount: 1
}

describe('ProviderScreen', () => {
  it('登録済み Provider を一覧表示する (秘密は出ない)', async () => {
    installCapability({ listProviders: async () => [summary] })
    render(<ProviderScreen />)
    await waitFor(() => expect(screen.getByTestId('provider-list')).toBeInTheDocument())
    const list = screen.getByTestId('provider-list')
    expect(list.textContent).toContain('Prod')
    // list 内に backend/source ラベルが出る (form の option とは別に list へ scope する)。
    expect(list.textContent).toContain('Claude (Anthropic)')
    expect(list.textContent).toContain('API キー')
    // 秘密の参照値は list に出ない (summary DTO に無い)。
    expect(list.textContent).not.toContain('secretRefKey')
  })

  it('検出は候補を提示するのみで自動登録しない (SC-001)', async () => {
    const registerProvider = vi.fn()
    const candidates: DetectedCandidate[] = [
      {
        kind: 'config-dir',
        displayLabel: 'C:\\Users\\y\\.claude',
        configDirValue: 'C:\\Users\\y\\.claude',
        namespace: 'host',
        alreadyRegistered: false
      }
    ]
    installCapability({
      listProviders: async () => [],
      detectProviders: async () => candidates,
      registerProvider
    })
    render(<ProviderScreen />)
    await waitFor(() => expect(screen.getByText('検出')).toBeInTheDocument())

    fireEvent.click(screen.getByText('検出'))
    await waitFor(() => expect(screen.getByTestId('provider-candidates')).toBeInTheDocument())
    expect(screen.getByText('C:\\Users\\y\\.claude')).toBeInTheDocument()
    // **自動登録しない** — 検出だけで registerProvider は呼ばれない。
    expect(registerProvider).not.toHaveBeenCalled()
  })

  it('api-key 登録でフォームの秘密を draft に載せて送る (送信後クリア)', async () => {
    const registerProvider = vi.fn<(draft: ProviderDraft) => Promise<RegisterProviderResult>>(
      async () => ({ ok: true as const, provider: summary })
    )
    installCapability({ listProviders: async () => [], registerProvider })
    render(<ProviderScreen />)
    await waitFor(() => expect(screen.getByTestId('provider-register-form')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('provider-displayname'), { target: { value: 'Prod' } })
    // 既定 source は api-key なので秘密フィールドが出る。
    fireEvent.change(screen.getByTestId('provider-secret'), { target: { value: 'sk-plain' } })
    fireEvent.click(screen.getByText('登録'))

    await waitFor(() => expect(registerProvider).toHaveBeenCalledTimes(1))
    const draft = registerProvider.mock.calls[0][0]
    expect(draft.displayName).toBe('Prod')
    expect(draft.credential).toEqual({ source: 'api-key', secret: 'sk-plain' })
    // 送信後に秘密フィールドがクリアされる (renderer に残さない)。
    await waitFor(() =>
      expect((screen.getByTestId('provider-secret') as HTMLInputElement).value).toBe('')
    )
  })

  it('safeStorage 利用不可の登録失敗を理由つきで表示する (M-03)', async () => {
    installCapability({
      listProviders: async () => [],
      registerProvider: async () => ({
        ok: false as const,
        reason: 'safestorage-unavailable' as const
      })
    })
    render(<ProviderScreen />)
    await waitFor(() => expect(screen.getByTestId('provider-register-form')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('provider-displayname'), { target: { value: 'X' } })
    fireEvent.change(screen.getByTestId('provider-secret'), { target: { value: 'sk' } })
    fireEvent.click(screen.getByText('登録'))

    await waitFor(() =>
      expect(screen.getByTestId('provider-error').textContent).toContain('safeStorage')
    )
  })

  it('編集 (rename) で updateProvider を表示名の patch で呼ぶ (認証方式は変えない)', async () => {
    const updateProvider = vi.fn(async () => ({ ok: true as const, provider: summary }))
    installCapability({ listProviders: async () => [summary], updateProvider })
    render(<ProviderScreen />)
    await waitFor(() => expect(screen.getByText('編集')).toBeInTheDocument())

    fireEvent.click(screen.getByText('編集'))
    fireEvent.change(screen.getByTestId('provider-edit-name'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() =>
      expect(updateProvider).toHaveBeenCalledWith('p1', { displayName: 'Renamed' })
    )
  })

  it('削除で removeProvider を呼ぶ', async () => {
    const removeProvider = vi.fn(async () => ({ ok: true }))
    installCapability({ listProviders: async () => [summary], removeProvider })
    render(<ProviderScreen />)
    await waitFor(() => expect(screen.getByText('削除')).toBeInTheDocument())
    fireEvent.click(screen.getByText('削除'))
    await waitFor(() => expect(removeProvider).toHaveBeenCalledWith('p1'))
  })
})
