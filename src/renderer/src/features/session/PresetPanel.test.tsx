import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ClostaCapability } from '@domain/capability'
import { toPresetConfig, type SessionLaunchConfig } from '@domain/session/launch-config'
import type { PresetDTO } from '@domain/session/preset'

import { installCapability } from '@/test-support/capability'

import { PresetPanel } from './PresetPanel'
import type { PresetsView } from './usePresets'
import { DEFAULT_EXTRA_AXES } from '@domain/session/launch-config'

/** プリセットパネルの renderer 単体 (X-4 FE-010 / FR-009。O-3 FE-041 の起動の利用記録)。 */

beforeEach(() => {
  // 起動の利用記録の読み出し (O-3)。既定は「記録無し」。個別のテストは installCapability で差し替える。
  installCapability({
    getLaunchUsage: async () => ({ status: 'ok', preset: 0, manual: 0, days: 30 })
  })
})

const config: SessionLaunchConfig = {
  folderId: 'f1',
  runtimeId: 'wsl:Ubuntu',
  providerId: null,
  modelId: null,
  effort: null,
  permissionMode: 'default',
  ...DEFAULT_EXTRA_AXES,
  sessionName: null
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
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(' 業務用 ', toPresetConfig(config), true)
    )
  })

  it('保存する設定は 9 キーで sessionName を含まない (024 FR-010)', async () => {
    const save = vi.fn(async () => ({ ok: true as const, preset }))
    render(<PresetPanel view={view({ save })} current={config} onApply={() => {}} />)
    fireEvent.change(screen.getByTestId('preset-name'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const saved = (save.mock.calls[0] as unknown as [string, object, boolean])[1]
    expect(Object.keys(saved)).toHaveLength(9)
    expect(saved).not.toHaveProperty('sessionName')
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

/** 起動の利用記録の表示 (O-3 FE-041 / 012 spec FR-013・FR-008 / US-4 AC4 / data-model §4「表示」)。 */
describe('PresetPanel — 直近 30 日の起動', () => {
  const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

  function renderPanel(getLaunchUsage: ClostaCapability['getLaunchUsage']): ClostaCapability {
    const cap = installCapability({ getLaunchUsage })
    render(<PresetPanel view={view()} current={config} onApply={() => {}} />)
    return cap
  }

  const usage = (): HTMLElement => screen.getByTestId('launch-usage')

  it('読み込み中は「記録を読み込み中…」', () => {
    renderPanel(() => new Promise(() => {}))
    expect(within(usage()).getByRole('heading', { name: '直近 30 日の起動' })).toBeInTheDocument()
    expect(within(usage()).getByTestId('launch-usage-loading')).toHaveTextContent(
      '記録を読み込み中…'
    )
  })

  it('記録があれば直近 30 日のプリセット / 手動の回数を出す', async () => {
    renderPanel(async () => ({ status: 'ok', preset: 3, manual: 1, days: 30 }))
    await waitFor(() =>
      expect(within(usage()).getByTestId('launch-usage-counts')).toHaveTextContent(
        'プリセットを適用 3 回 / 適用なし 1 回'
      )
    )
  })

  it('片方だけ 0 でも回数を出す (記録無しにしない)', async () => {
    renderPanel(async () => ({ status: 'ok', preset: 0, manual: 2, days: 30 }))
    await waitFor(() =>
      expect(within(usage()).getByTestId('launch-usage-counts')).toHaveTextContent(
        'プリセットを適用 0 回 / 適用なし 2 回'
      )
    )
  })

  it('2 つとも 0 は記録無しの EmptyState (なぜ空かと次の操作)', async () => {
    renderPanel(async () => ({ status: 'ok', preset: 0, manual: 0, days: 30 }))
    const empty = await within(usage()).findByTestId('launch-usage-empty')
    expect(empty).toHaveAttribute('data-slot', 'empty-state')
    expect(empty).toHaveTextContent('まだ記録がありません。')
    expect(empty).toHaveTextContent('起動すると、プリセットを適用したかどうかを日ごとに数えます。')
  })

  it('unreadable は読めないの EmptyState (記録無しと文言を分ける)', async () => {
    renderPanel(async () => ({ status: 'unreadable' }))
    const unreadable = await within(usage()).findByTestId('launch-usage-unreadable')
    expect(unreadable).toHaveAttribute('data-slot', 'empty-state')
    expect(unreadable).toHaveTextContent('記録を読めません。')
    expect(unreadable).toHaveTextContent('次に起動ダイアログを開いたときに読み直します。')
    expect(within(usage()).queryByTestId('launch-usage-empty')).toBeNull()
  })

  it.each([
    ['reject', (): Promise<never> => Promise.reject(new Error('ipc failed'))],
    [
      '同期の例外',
      (): Promise<never> => {
        throw new Error('sync throw')
      }
    ],
    ['形の合わない値', async () => ({ status: 'ok', preset: -1, manual: '2', days: 30 }) as never]
  ])('invoke が投げたら (%s) 読めないの表示', async (_l, getLaunchUsage) => {
    renderPanel(getLaunchUsage)
    expect(await within(usage()).findByTestId('launch-usage-unreadable')).toHaveTextContent(
      '記録を読めません。'
    )
  })

  it('欄を描いたときに 1 回だけ読む (再描画で読み直さない)', async () => {
    const getLaunchUsage = vi.fn<ClostaCapability['getLaunchUsage']>(async () => ({
      status: 'ok',
      preset: 1,
      manual: 0,
      days: 30
    }))
    installCapability({ getLaunchUsage })
    const { rerender } = render(<PresetPanel view={view()} current={config} onApply={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('launch-usage-counts')).toBeInTheDocument())
    rerender(<PresetPanel view={view({ presets: [] })} current={null} onApply={() => {}} />)
    expect(getLaunchUsage).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['読み込み中', (): Promise<never> => new Promise(() => {}), 'launch-usage-loading'],
    [
      '回数',
      async () => ({ status: 'ok' as const, preset: 3, manual: 1, days: 30 as const }),
      'launch-usage-counts'
    ],
    [
      '記録無し',
      async () => ({ status: 'ok' as const, preset: 0, manual: 0, days: 30 as const }),
      'launch-usage-empty'
    ],
    ['読めない', async () => ({ status: 'unreadable' as const }), 'launch-usage-unreadable']
  ])('vitest-axe の違反 0 (%s)', async (_l, getLaunchUsage, testId) => {
    renderPanel(getLaunchUsage)
    await within(usage()).findByTestId(testId)
    const panel = screen.getByRole('region', { name: 'プリセット' })
    expect((await axe(panel, AXE_RULES)).violations).toEqual([])
  })
})
