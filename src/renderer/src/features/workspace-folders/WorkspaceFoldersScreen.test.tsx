import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FolderListDTO } from '@domain/workspace/dto'

import { installCapability } from '@/test-support/capability'

import { WorkspaceFoldersScreen } from './WorkspaceFoldersScreen'

/**
 * 登録フォルダ画面の renderer 単体 (X-4 R4 po L-303)。preload をスタブし Electron を起動しない。
 */

describe('WorkspaceFoldersScreen', () => {
  it('読み込み失敗の再試行は ErrorState → ローダー → (再失敗で) ErrorState に戻る (R4 po L-303)', async () => {
    let rejectRetry: (error: Error) => void = () => {}
    const listFolders = vi
      .fn<() => Promise<FolderListDTO>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockImplementationOnce(
        () =>
          new Promise<FolderListDTO>((_, reject) => {
            rejectRetry = reject
          })
      )
    installCapability({
      listFolders,
      listRuntimes: async () => ({
        wslAvailability: 'available',
        runtimes: [],
        enumerationIssues: []
      })
    })
    render(<WorkspaceFoldersScreen />)

    expect(await screen.findByText('登録フォルダを読み込めませんでした')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    // 再試行中は失敗表示を下ろし、一覧のローダーを出す (押しても何も起きないように見せない)。
    expect(await screen.findByText('登録フォルダを読み込み中')).toBeInTheDocument()
    expect(screen.queryByText('登録フォルダを読み込めませんでした')).toBeNull()
    expect(listFolders).toHaveBeenCalledTimes(2)

    await act(async () => rejectRetry(new Error('second')))
    expect(await screen.findByText('登録フォルダを読み込めませんでした')).toBeInTheDocument()
    expect(screen.queryByText('登録フォルダを読み込み中')).toBeNull()
  })
})
