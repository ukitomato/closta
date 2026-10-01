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
  modelCount: 1,
  models: []
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

  it.each([
    {
      storeNewerVersion: true,
      expected: 'providers.json が新しいバージョンで保存されています',
      reloads: false
    },
    { storeNewerVersion: false, expected: '削除できませんでした', reloads: true }
  ])(
    '削除の失敗は理由に応じた文言を出す (storeNewerVersion=$storeNewerVersion。pr-gate R3 database L-502 / R4 po L-301)',
    async ({ storeNewerVersion, expected, reloads }) => {
      const listProviders = vi.fn(async () => [summary])
      installCapability({
        listProviders,
        removeProvider: async () => ({ ok: false }),
        providerLoadIssues: async () => ({
          skippedOnLoad: storeNewerVersion ? 1 : 0,
          wholeFileUnreadable: storeNewerVersion,
          storeNewerVersion
        })
      })
      render(<ProviderScreen />)
      await waitFor(() => expect(screen.getByText('削除')).toBeInTheDocument())
      const loadsBeforeRemove = listProviders.mock.calls.length
      fireEvent.click(screen.getByText('削除'))
      await waitFor(() =>
        expect(screen.getByTestId('provider-error').textContent).toContain(expected)
      )
      expect(screen.getByTestId('provider-error').textContent).not.toContain('操作に失敗しました')
      // remove-failed (主に対象が既に無い) は一覧を読み込み直す。文言もそう告げる (R4 po L-301)。
      if (reloads) {
        await waitFor(() => expect(listProviders).toHaveBeenCalledTimes(loadsBeforeRemove + 1))
        expect(screen.getByTestId('provider-error').textContent).toContain(
          '一覧を読み込み直しました'
        )
      } else {
        expect(listProviders).toHaveBeenCalledTimes(loadsBeforeRemove)
      }
    }
  )

  it('読み込みで退避した件数を 1 行だけ表示する (件数のみ。pr-gate R1 M-03)', async () => {
    installCapability({
      listProviders: async () => [summary],
      providerLoadIssues: async () => ({
        skippedOnLoad: 2,
        wholeFileUnreadable: false,
        storeNewerVersion: false
      })
    })
    render(<ProviderScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('provider-skipped-on-load').textContent).toBe(
        '2 件の登録を読み込めませんでした (退避済み)'
      )
    )
  })

  it('ファイルごと読めなかったときは件数を出さない (pr-gate R2 database M-401 / po M-103)', async () => {
    installCapability({
      listProviders: async () => [],
      providerLoadIssues: async () => ({
        skippedOnLoad: 1,
        wholeFileUnreadable: true,
        storeNewerVersion: false
      })
    })
    render(<ProviderScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('provider-skipped-on-load').textContent).toBe(
        '保存ファイルを読み込めなかったため、以前の登録は表示されません (退避済み)。必要なら登録し直してください。'
      )
    )
    expect(screen.getByTestId('provider-skipped-on-load').textContent).not.toContain('件')
  })

  it('将来版のファイルでは、変更もできないことを添える (schema-version-unknown)', async () => {
    installCapability({
      listProviders: async () => [],
      providerLoadIssues: async () => ({
        skippedOnLoad: 1,
        wholeFileUnreadable: true,
        storeNewerVersion: true
      })
    })
    render(<ProviderScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('provider-skipped-on-load').textContent).toBe(
        '保存ファイルを読み込めなかったため、登録を表示できません (退避済み)。新しいバージョンのアプリで保存されたファイルのため、登録・編集・削除もできません。'
      )
    )
  })

  it('退避 0 件・取得失敗のときは件数表示を出さない', async () => {
    installCapability({
      listProviders: async () => [summary],
      providerLoadIssues: async () => ({
        skippedOnLoad: 0,
        wholeFileUnreadable: false,
        storeNewerVersion: false
      })
    })
    const { unmount } = render(<ProviderScreen />)
    await waitFor(() => expect(screen.getByTestId('provider-list')).toBeInTheDocument())
    expect(screen.queryByTestId('provider-skipped-on-load')).toBeNull()
    unmount()

    // providerLoadIssues 未スタブ = reject。表示を出さず画面は通常どおり。
    installCapability({ listProviders: async () => [summary] })
    render(<ProviderScreen />)
    await waitFor(() => expect(screen.getByTestId('provider-list')).toBeInTheDocument())
    expect(screen.queryByTestId('provider-skipped-on-load')).toBeNull()
  })
})
