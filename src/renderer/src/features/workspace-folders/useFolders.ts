import { useCallback, useEffect, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type {
  BrowseDirectoryResult,
  BrowseTargetDTO,
  FolderListDTO,
  LocationDTO,
  RegisterFolderResult,
  WorkspaceFolderDraftDTO
} from '@domain/workspace/dto'

/**
 * 登録フォルダ一覧とブラウズの状態 (FE-020 / FE-021 / FE-022)。
 *
 * **renderer でパス文字列を連結しない** (FR-025)。
 * 移動は `{ root | child | parent }` を送り、返ってきたパスをそのまま使う。
 */

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

export interface BrowseState {
  readonly token: string
  readonly location: LocationDTO
  readonly result: BrowseDirectoryResult | null
  readonly loading: boolean
}

export interface FoldersView {
  readonly list: FolderListDTO | null
  readonly failed: boolean
  readonly browse: BrowseState | null
  readonly lastError: string | null
  refresh(): void
  pickHostFolder(): Promise<WorkspaceFolderDraftDTO | null>
  beginBrowse(location: LocationDTO): Promise<void>
  move(target: BrowseTargetDTO): Promise<void>
  closeBrowse(): void
  register(draft: WorkspaceFolderDraftDTO): Promise<RegisterFolderResult>
  unregister(id: string): Promise<void>
}

export function useFolders(): FoldersView {
  const [list, setList] = useState<FolderListDTO | null>(null)
  const [failed, setFailed] = useState(false)
  const [browse, setBrowse] = useState<BrowseState | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const load = useCallback(() => {
    capability()
      .listFolders()
      .then((next) => {
        setList(next)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    load()
    // 変更通知を購読する。登録・解除・到達可能性の変化が届く。
    const unsubscribe = capability().onFoldersChanged(setList)
    return unsubscribe
  }, [load])

  const beginBrowse = useCallback(async (location: LocationDTO) => {
    setLastError(null)
    const started = await capability().beginBrowse(location)
    if (!started.ok) {
      setLastError(started.error)
      setBrowse(null)
      return
    }
    setBrowse({ token: started.token, location, result: null, loading: true })

    // **最初の階層はルートを要求して取る。** renderer がパスを組み立てない。
    const first = await capability().browseDirectory(started.token, { kind: 'root' })
    setBrowse({ token: started.token, location, result: first, loading: false })
    if (!first.ok) setLastError(first.error)
  }, [])

  const move = useCallback(
    async (target: BrowseTargetDTO) => {
      if (browse === null) return
      setBrowse({ ...browse, loading: true })
      const next = await capability().browseDirectory(browse.token, target)
      setBrowse({ ...browse, result: next, loading: false })
      if (!next.ok) setLastError(next.error)
      else setLastError(null)
    },
    [browse]
  )

  const closeBrowse = useCallback(() => {
    setBrowse(null)
    setLastError(null)
  }, [])

  const register = useCallback(
    async (draft: WorkspaceFolderDraftDTO) => {
      const result = await capability().registerFolder(draft)
      if (result.ok) {
        setBrowse(null)
        setLastError(null)
        load()
      } else {
        setLastError(result.reason)
      }
      return result
    },
    [load]
  )

  const unregister = useCallback(
    async (id: string) => {
      await capability().unregisterFolder(id)
      load()
    },
    [load]
  )

  return {
    list,
    failed,
    browse,
    lastError,
    refresh: load,
    pickHostFolder: () => capability().pickHostFolder(),
    beginBrowse,
    move,
    closeBrowse,
    register,
    unregister
  }
}
