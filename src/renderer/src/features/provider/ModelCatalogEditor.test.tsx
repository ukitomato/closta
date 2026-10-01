import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ModelCatalogEditor } from './ModelCatalogEditor'

/** モデルカタログの手入力編集 (X-4 FE-003 / FR-017)。 */

describe('ModelCatalogEditor', () => {
  it('モデル ID / 表示名 / inference profile ID / 対応 effort を追加する', () => {
    const onSave = vi.fn(async () => {})
    render(<ModelCatalogEditor models={[]} onSave={onSave} />)
    fireEvent.change(screen.getByTestId('model-id'), { target: { value: 'sonnet[1m]' } })
    fireEvent.change(screen.getByTestId('model-display-name'), { target: { value: 'Sonnet' } })
    fireEvent.change(screen.getByTestId('model-profile-id'), {
      target: { value: 'us.anthropic.claude-sonnet-4-5-v1:0' }
    })
    fireEvent.click(screen.getByLabelText('高'))
    fireEvent.click(screen.getByLabelText('低'))
    fireEvent.click(screen.getByRole('button', { name: 'モデルを追加' }))
    expect(onSave).toHaveBeenCalledWith([
      {
        id: 'sonnet[1m]',
        displayName: 'Sonnet',
        inferenceProfileId: 'us.anthropic.claude-sonnet-4-5-v1:0',
        supportedEffortLevels: ['low', 'high']
      }
    ])
  })

  it('文字種違反・重複 ID は追加できず理由を示す (main と同じ述語)', () => {
    render(<ModelCatalogEditor models={[{ id: 'dup', displayName: 'D' }]} onSave={vi.fn()} />)
    fireEvent.change(screen.getByTestId('model-display-name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByTestId('model-id'), { target: { value: 'x$(id)' } })
    expect(screen.getByRole('button', { name: 'モデルを追加' })).toBeDisabled()
    expect(screen.getByRole('alert').textContent).toContain('英数字')
    fireEvent.change(screen.getByTestId('model-id'), { target: { value: 'dup' } })
    expect(screen.getByRole('alert').textContent).toContain('既にあります')
  })

  it('削除は残りのカタログで保存する', () => {
    const onSave = vi.fn(async () => {})
    render(
      <ModelCatalogEditor
        models={[
          { id: 'a', displayName: 'A' },
          { id: 'b', displayName: 'B' }
        ]}
        onSave={onSave}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'A を削除' }))
    expect(onSave).toHaveBeenCalledWith([{ id: 'b', displayName: 'B' }])
  })

  it('空のカタログの意味を示す', () => {
    render(<ModelCatalogEditor models={[]} onSave={vi.fn()} />)
    expect(screen.getByText(/モデルが登録されていません/).textContent).toContain('「既定」のみ')
  })
})
