import type { BrowseDirectoryResult, BrowseTargetDTO } from '@domain/workspace/dto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { installCapability } from '@/test-support/capability'

import { useFolders } from './useFolders'

/**
 * B-1 の回帰テスト (X-4 quickstart / pr-gate R1 po M-005)。
 *
 * `move` はブラウズのトークンを `browseTokenRef` から読む。以前は `setBrowse` の updater の中で書き出しており、
 * React 19 が updater を同期実行しないと token が null のまま return し「読み込み中」で固まった。
 * - 移動の結果は `loading: false` で反映され、読み込み中が残らない
 * - 移動中にトークンが変わった (閉じた / 別のブラウズを始めた) ら、その移動の結果を捨てる
 */

const location = { kind: 'wsl', distroName: 'Ubuntu' } as const

function listing(cwd: string): BrowseDirectoryResult {
  return {
    ok: true,
    cwd: { namespace: 'wsl:Ubuntu', value: cwd },
    parent: cwd === '/' ? null : { namespace: 'wsl:Ubuntu', value: '/' },
    entries: []
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// listFolders は未スタブ (reject → failed)。本テストはブラウズの状態だけを見る。
const child: BrowseTargetDTO = {
  kind: 'child',
  of: { namespace: 'wsl:Ubuntu', value: '/' },
  name: 'home'
}

describe('useFolders.move (B-1: browseTokenRef)', () => {
  it('ブラウズ開始直後の move が結果を反映し、loading を残さない', async () => {
    installCapability({
      beginBrowse: async () => ({ ok: true, token: 't1' }),
      browseDirectory: async (_token, target) =>
        target.kind === 'root' ? listing('/') : listing('/home')
    })
    const { result } = renderHook(() => useFolders())

    await act(async () => {
      await result.current.beginBrowse(location)
    })
    await act(async () => {
      await result.current.move(child)
    })

    expect(result.current.browse?.loading).toBe(false)
    expect(result.current.browse?.lastOk?.cwd.value).toBe('/home')
  })

  it('移動中に別のブラウズを始めたら、古い移動の結果を捨てる (loading も残らない)', async () => {
    const pendingMove = deferred<BrowseDirectoryResult>()
    let begins = 0
    installCapability({
      beginBrowse: async () => ({ ok: true, token: `t${(begins += 1)}` }),
      browseDirectory: (token, target) => {
        if (token === 't1' && target.kind === 'child') return pendingMove.promise
        return Promise.resolve(listing(token === 't2' ? '/t2-root' : '/'))
      }
    })
    const { result } = renderHook(() => useFolders())

    await act(async () => {
      await result.current.beginBrowse(location)
    })
    let moving: Promise<void> = Promise.resolve()
    act(() => {
      moving = result.current.move(child)
    })
    await waitFor(() => expect(result.current.browse?.loading).toBe(true))

    // 移動中に別のブラウズを始める (token t1 → t2)。
    await act(async () => {
      await result.current.beginBrowse(location)
    })
    expect(result.current.browse?.token).toBe('t2')

    // 古い移動が遅れて返っても反映しない。
    await act(async () => {
      pendingMove.resolve(listing('/stale'))
      await moving
    })
    expect(result.current.browse?.token).toBe('t2')
    expect(result.current.browse?.lastOk?.cwd.value).toBe('/t2-root')
    expect(result.current.browse?.loading).toBe(false)
  })

  it('移動中に閉じたら、遅れて返った結果でブラウズを復活させない', async () => {
    const pendingMove = deferred<BrowseDirectoryResult>()
    installCapability({
      beginBrowse: async () => ({ ok: true, token: 't1' }),
      browseDirectory: (_token, target) =>
        target.kind === 'root' ? Promise.resolve(listing('/')) : pendingMove.promise
    })
    const { result } = renderHook(() => useFolders())

    await act(async () => {
      await result.current.beginBrowse(location)
    })
    let moving: Promise<void> = Promise.resolve()
    act(() => {
      moving = result.current.move(child)
    })
    act(() => {
      result.current.closeBrowse()
    })
    await act(async () => {
      pendingMove.resolve(listing('/stale'))
      await moving
    })
    expect(result.current.browse).toBeNull()
    expect(result.current.lastError).toBeNull()
  })
})
