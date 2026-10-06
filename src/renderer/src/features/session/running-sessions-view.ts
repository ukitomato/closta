import { createContext, useContext } from 'react'

import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { LaunchOrigin } from '@domain/session/launch-usage'
import type { FolderListDTO } from '@domain/workspace/dto'

import type { LiveSession } from './useLiveSession'

/**
 * `RunningSessionsProvider` (O-7 / FE-002) が面に渡す値。component のファイルから分けて置く
 * (fast refresh は component だけを export するファイルでしか効かない)。
 */
export interface RunningSessionsView {
  /** 選択中の稼働中のセッション (無ければ null)。 */
  readonly live: LiveSession | null
  /** 本文の窓から外れた古いメッセージの件数と、窓を広げる操作 (X-5 / SC-003)。 */
  readonly hiddenCount: number
  readonly showMore: () => void
  /**
   * 表示中のセッションの窓を、id のメッセージが入るところまで広げる (O-3 / 012 data-model §2「移動」/ research R-03)。
   * 「さらに表示」と同じ窓の操作で、会話内検索が窓の外の一致へ移るときだけ呼ぶ。窓の中の id・知らない id では何もしない。
   */
  readonly revealMessage: (messageId: string) => void
  /** folderId → 表示名。一覧を読み込み中は空、引けなければ fallback (X-4 po M-102)。 */
  readonly folderName: (folderId: string) => string
  /** runtimeId → 表示名。規則は `folderName` と同じ。 */
  readonly runtimeName: (runtimeId: string) => string
  /** 登録フォルダの一覧 (読み込み中は null)。中央の空の状態と概要が使う。 */
  readonly folders: FolderListDTO | null
  /**
   * 起動ダイアログの起動。引けている作業フォルダの表示名を写す (O-1 FR-004)。`origin` は起動ダイアログが決めた
   * 起動元 (O-3 / 012 data-model §4「renderer の起動元」) で、ストアの `launch` を通って capability に届く。
   */
  readonly launch: (config: SessionLaunchConfig, origin: LaunchOrigin) => Promise<void>
}

export const RunningSessionsViewContext = createContext<RunningSessionsView | null>(null)

export function useRunningSessionsView(): RunningSessionsView {
  const view = useContext(RunningSessionsViewContext)
  if (view === null) throw new Error('RunningSessionsProvider の内側で使う')
  return view
}
