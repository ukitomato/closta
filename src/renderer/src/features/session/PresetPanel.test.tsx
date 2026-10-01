import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { PresetDTO } from '@domain/session/preset'

import { PresetPanel } from './PresetPanel'
import type { PresetsView } from './usePresets'

/** プリセットパネルの renderer 単体 (X-4 FE-010 / FR-009)。 */

const config: SessionLaunchConfig = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: null,
  modelId: null,
  effort: null,
  permissionMode: 'default'
}
const preset: PresetDTO = { id: 'p1', name: '業務用', config, updatedAt: 1 }

function view(over: Partial<PresetsView> = {}): PresetsView {
  return {
    presets: [preset],
    failed: false,
    save: vi.fn(async (name: string) => ({
      ok: true as const,
      preset: { ...preset, name }
    })),
    remove: vi.fn(async () => true),
    ...over
  }
}

describe('PresetPanel', () => {
  it('一覧から適用すると onApply に設定を渡す (起動はしない)', () => {
    const onApply = vi.fn()
    render(<PresetPanel view={view()} current={config} onApply={onApply} />)
    fireEvent.click(screen.getByRole('button', { name: '適用' }))
    expect(onApply).toHaveBeenCalledWith(preset)
  })

  it('空状態を示す', () => {
    render(<PresetPanel view={view({ presets: [] })} current={config} onApply={() => {}} />)
    expect(screen.getByText(/保存したプリセットはまだありません/)).toBeInTheDocument()
  })

  it('folder / runtime 未選択 (current = null) では保存できない', () => {
    render(<PresetPanel view={view()} current={null} onApply={() => {}} />)
    fireEvent.change(screen.getByTestId('preset-name'), { target: { value: 'x' } })
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('同名は上書き確認を経てから overwrite: true で保存する', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'name-conflict' })
      .mockResolvedValueOnce({ ok: true, preset })
    render(<PresetPanel view={view({ save })} current={config} onApply={() => {}} />)
    fireEvent.change(screen.getByTestId('preset-name'), { target: { value: ' 業務用 ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(screen.getByRole('alertdialog', { name: '上書きの確認' })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: '上書き' }))
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(' 業務用 ', config, true))
  })

  it('上限到達は理由を示す', async () => {
    const save = vi.fn(async () => ({ ok: false as const, reason: 'limit-reached' as const }))
    render(<PresetPanel view={view({ save })} current={config} onApply={() => {}} />)
    fireEvent.change(screen.getByTestId('preset-name'), { target: { value: '新規' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('100 件まで'))
  })

  it('保存が例外で失敗したら「保存できませんでした」を示す (pr-gate M-08)', async () => {
    const save = vi.fn(async () => {
      throw new Error('EACCES')
    })
    render(<PresetPanel view={view({ save })} current={config} onApply={() => {}} />)
    fireEvent.change(screen.getByTestId('preset-name'), { target: { value: '新規' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('保存できませんでした')
    )
  })

  it('削除は確認を経てから行う。やめると削除しない (po L-001)', async () => {
    const remove = vi.fn(async () => true)
    render(<PresetPanel view={view({ remove })} current={config} onApply={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '業務用 を削除' }))
    expect(remove).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: '削除の確認' })
    expect(dialog.textContent).toContain('業務用')
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '業務用 を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('p1'))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('プリセットを削除しました')
    )
  })

  it('削除の失敗 ({ok:false} / 例外) を示す (pr-gate M-08)', async () => {
    const remove = vi
      .fn<PresetsView['remove']>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('EBUSY'))
    render(<PresetPanel view={view({ remove })} current={config} onApply={() => {}} />)
    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '業務用 を削除' }))
      fireEvent.click(screen.getByRole('button', { name: '削除する' }))
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toContain('削除できませんでした')
      )
    }
    expect(remove).toHaveBeenCalledTimes(2)
  })

  it('読み込み中は「まだありません」ではなく読み込み中を示す (po L-002)', () => {
    render(<PresetPanel view={view({ presets: null })} current={config} onApply={() => {}} />)
    expect(screen.getByText(/プリセットを読み込んでいます/)).toBeInTheDocument()
    expect(screen.queryByText(/保存したプリセットはまだありません/)).toBeNull()
  })
})
