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

/** 成功した列挙結果。現在地・親・項目を持つのはこちらだけである。 */
type BrowseSuccess = Extract<BrowseDirectoryResult, { ok: true }>

export interface BrowseState {
  readonly token: string
  readonly location: LocationDTO
  readonly result: BrowseDirectoryResult | null
  /**
   * **直前に成功した列挙結果。**
   *
   * 失敗したときに `result` を失敗形へ差し替えると、`BrowseDirectoryResult` の
   * 失敗側は現在地を持たないため**現在地・親・項目がすべて消える**。
   * 画面は現在地が `—` になり「ここを登録する」が押せなくなり、
   * 再開手段が「閉じて開き直す」= **ルートからやり直し**しかなくなっていた。
   *
   * quickstart V-2 #9 は期限切れの後に
   * 「**同じ位置から登録を続行できる (ルートに戻されない)**」ことを条件にしている。
   * WSL2 のアイドル自動停止と 30 秒の TTL により期限切れは日常的に起きる。
   */
  readonly lastOk: BrowseSuccess | null
  readonly loading: boolean
}

export interface FoldersView {
  readonly list: FolderListDTO | null
  readonly failed: boolean
  readonly browse: BrowseState | null
  readonly lastError: string | null
  /**
   * 重複登録で拒否されたときの**既存エントリの id**。
   *
   * DTO ではなく id を持つ。一覧は `onFoldersChanged` の購読でも差し替わるので、
   * DTO を抱えると表示が一覧とズレる。描画時に `list` から引き直す。
   */
  readonly duplicateOfId: string | null
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
  const [duplicateOfId, setDuplicateOfId] = useState<string | null>(null)

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
    setDuplicateOfId(null)
    const started = await capability().beginBrowse(location)
    if (!started.ok) {
      setLastError(started.error)
      setBrowse(null)
      return
    }
    setBrowse({ token: started.token, location, result: null, lastOk: null, loading: true })

    // **最初の階層はルートを要求して取る。** renderer がパスを組み立てない。
    const first = await capability().browseDirectory(started.token, { kind: 'root' })
    setBrowse({
      token: started.token,
      location,
      result: first,
      lastOk: first.ok ? first : null,
      loading: false
    })
    if (!first.ok) setLastError(first.error)
  }, [])

  const move = useCallback(async (target: BrowseTargetDTO) => {
    /*
     * **関数型更新にする。** クロージャの `browse` をスプレッドすると、
     * 連続した移動で古い state を書き戻しうる。
     */
    let token: string | null = null
    setBrowse((prev) => {
      if (prev === null) return prev
      token = prev.token
      return { ...prev, loading: true }
    })
    if (token === null) return

    const next = await capability().browseDirectory(token, target)
    setBrowse((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            result: next,
            // **失敗しても直前の成功結果を捨てない。** 現在地を保つ (V-2 #9)。
            lastOk: next.ok ? next : prev.lastOk,
            loading: false
          }
    )
    if (!next.ok) setLastError(next.error)
    else setLastError(null)
  }, [])

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
        setDuplicateOfId(null)
        load()
      } else {
        setLastError(result.reason)
        /*
         * **重複なら既存エントリを示す。** main は `existing` を返しているのに
         * renderer が捨てていた。AC US-2-5 は「重複登録されず、
         * **既存エントリが選択状態になる**」を要求している —
         * 「増やさない」半分だけでは、どれが既存なのかを利用者が探すことになる。
         */
        setDuplicateOfId(result.reason === 'duplicate' ? (result.existing?.id ?? null) : null)
      }
      return result
    },
    [load]
  )

  const unregister = useCallback(
    async (id: string) => {
      const result = await capability().unregisterFolder(id)
      /*
       * **戻り値を検査する。** `ok: false` を無視すると、解除できていないのに
       * 一覧が同じ内容で再描画されるだけになり、利用者は原因も次の操作も得られない。
       */
      if (!result.ok) {
        setLastError('unregister-failed')
        return
      }
      setLastError(null)
      if (duplicateOfId === id) setDuplicateOfId(null)
      load()
    },
    [load, duplicateOfId]
  )

  return {
    list,
    failed,
    browse,
    lastError,
    duplicateOfId,
    refresh: load,
    pickHostFolder: () => capability().pickHostFolder(),
    beginBrowse,
    move,
    closeBrowse,
    register,
    unregister
  }
}
