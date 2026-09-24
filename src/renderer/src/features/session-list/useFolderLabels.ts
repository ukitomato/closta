import { useEffect, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type { FolderListDTO } from '@domain/workspace/dto'

/**
 * 登録フォルダの表示名 (FR-047)。
 *
 * **`folderId` をそのまま画面に出さない。** 識別子は乱数由来の 32 桁であり、
 * 利用者に意味を持たない (R-1 の `labels.ts` が掲げている規則と同じ)。
 * セッションのグループは `folderId` しか持たないので、登録一覧と突き合わせる。
 *
 * **セッションの再列挙は起こさない。** 購読するのは登録一覧の変更だけで、
 * 対応づけのやり直しは main 側が行い `onSessionsChanged` で届く
 * (contracts ipc / data-model §7)。
 *
 * 見つからない `folderId` は `null` を返す。**作り話をしない** —
 * 登録解除と取得が交差すると一時的に引けない窓がある。
 */

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

export interface FolderLabels {
  /** 表示名。引けなければ `null`。 */
  nameOf(folderId: string): string | null
  /** 絞り込みの選択肢に使う (id, 表示名) の対。 */
  readonly entries: readonly { readonly id: string; readonly name: string }[]
}

export function useFolderLabels(): FolderLabels {
  const [list, setList] = useState<FolderListDTO | null>(null)

  useEffect(() => {
    let alive = true
    capability()
      .listFolders()
      .then((next) => {
        if (alive) setList(next)
      })
      .catch(() => {
        /*
         * **表示名が引けないことを一覧全体の失敗にしない。**
         * 引けなければ識別子を出さずに「登録フォルダ」と示すだけである。
         */
        if (alive) setList(null)
      })
    const unsubscribe = capability().onFoldersChanged(setList)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const folders = list?.folders ?? []
  return {
    nameOf: (folderId) => folders.find((folder) => folder.id === folderId)?.displayName ?? null,
    entries: folders.map((folder) => ({ id: folder.id, name: folder.displayName }))
  }
}
