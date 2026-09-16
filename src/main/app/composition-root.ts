import { randomUUID } from 'node:crypto'

import { app, dialog } from 'electron'

import { makeHostPath } from '@domain/runtime/path-types'
import { hostPathOps } from '@domain/runtime/path-api'

import { createHostFileSystem } from '../infra/fs/host-fs'
import { createWslFileSystem } from '../infra/fs/wsl-fs'
import { createRuntimeDetector } from '../infra/runtime/wsl-detector'
import { createWslCli } from '../infra/runtime/wsl-cli'
import { createFolderStore } from '../infra/settings/folder-store'
import { createFolderService, type FolderService } from './folder-service'
import type { IpcDependencies } from './ipc'
import { createMeasure } from './measure'
import { isDevBuild } from './origins'
import { createRuntimeStore, type RuntimeStore } from './runtime-store'

/**
 * composition root (BE-010 / BE-045 / AD-023 §1)。
 *
 * **Electron 由来の値をここで解決し `infra` / `domain` に注入する** (FR-038)。
 * `infra` は `electron` を import しない (例外は `infra/secrets/` のみ。AD-023 §8)。
 *
 * ここで解決している Electron 由来の値は 3 つある。
 * - ユーザデータディレクトリ (`app.getPath('userData')`) → 永続化層へ
 * - 開発ビルド判定 (`app.isPackaged`) → 計測へ
 * - ネイティブフォルダピッカー (`dialog.showOpenDialog`) → 所在 `windows` の入口
 *
 * DI コンテナは使わず関数引数で渡す (AD-023 Open Questions の方針)。
 */

export interface Composition {
  readonly runtimes: RuntimeStore
  readonly folders: FolderService
  readonly ipc: IpcDependencies
}

export function createComposition(): Composition {
  const now = (): number => Date.now()

  /*
   * プロセス起動レイヤ (`wsl-cli`) を注入する。
   * 差し替えれば WSL 未搭載ホストの挙動も出力の解釈も Vitest で検証できる
   * (`wsl-detector.test.ts`)。
   */
  const detector = createRuntimeDetector({ cli: createWslCli(), now })

  /*
   * **開発ビルド判定はここで解決する。** `measure` に `electron` を持ち込まないため
   * (FR-038 / AD-023 §8)。持ち込むと計測を使う層すべてが Electron 起動を要求する。
   */
  const measure = createMeasure(isDevBuild())
  const runtimes = createRuntimeStore(detector, measure)

  /*
   * **ユーザデータディレクトリを解決して渡す。**
   * `infra/settings` は `electron` を import できない (AD-023 §8)。
   */
  const userDataResult = makeHostPath(app.getPath('userData'))
  if (!userDataResult.ok) {
    throw new Error('ユーザデータディレクトリのパスを解釈できない')
  }
  const store = createFolderStore(userDataResult.path, now)

  const folders = createFolderService({
    store,
    fs: createWslFileSystem(),
    hostFs: createHostFileSystem(),
    detector,
    runtimes: () => runtimes.snapshot(),
    now,
    measure,
    /*
     * **乱数源をここで解決する。**
     * `folder-service` は状態を持つ調停であり、I/O をインタフェース経由で受け取る
     * (AD-023 §5 / §7 の `services ✗→ I/O モジュール直接`)。
     * `domain` の `makeFolderId(random)` が同じ理由で乱数源を引数に取っているのと同型である。
     */
    newId: () => randomUUID().replace(/-/g, '')
  })

  const ipc: IpcDependencies = {
    listRuntimes: () => runtimes.list(),
    refreshRuntimes: async () => {
      const list = await runtimes.refresh()
      /*
       * **再検出のあとに判定バッチを回す。** 一覧は未判定の descriptor を先に返し、
       * 判定は通知で追いつく (SC-004)。待たないのは、判定が約 3.2 秒かかる一方で
       * 一覧は約 1.6 秒で出せるためである。
       */
      void runtimes.probeAll()
      return list
    },
    probeRuntime: (runtimeId) => runtimes.probeOne(runtimeId),
    snapshotRuntimes: () => runtimes.snapshot(),
    measure,

    listFolders: () => folders.list(),
    beginBrowse: (location, senderId) => folders.beginBrowse(location, senderId),
    browseDirectory: (token, target, senderId) => folders.browseDirectory(token, target, senderId),
    registerFolder: (draft) => folders.register(draft),
    unregisterFolder: (id) => folders.unregister(id),
    folderIds: () => folders.folderIds(),
    resolveFolderRuntime: (folderId, runtimeId) => folders.resolve(folderId, runtimeId),

    async pickHostFolder() {
      /*
       * ネイティブダイアログは `app` レイヤに置く (FR-013 / FR-038 / BE-045)。
       * `infra` に置くと `electron` の許可箇所を広げることになる。
       */
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '作業フォルダを選ぶ'
      })
      if (result.canceled || result.filePaths.length === 0) return null

      const path = makeHostPath(result.filePaths[0])
      if (!path.ok) return null

      /*
       * **既定の表示名はフォルダ名にする** (data-model §6)。
       * 組み立てはパス API に委ねる — renderer にも `app` にも文字列処理を置かない。
       */
      const displayName = hostPathOps.basename(path.path)
      return {
        location: { kind: 'windows' },
        path: { namespace: path.path.namespace, value: path.path.value },
        displayName: displayName.length > 0 ? displayName : path.path.value
      }
    }
  }

  return { runtimes, folders, ipc }
}
