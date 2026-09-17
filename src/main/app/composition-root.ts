import { randomUUID } from 'node:crypto'

import { app, dialog } from 'electron'

import { makeHostPath } from '@domain/runtime/path-types'
import { hostPathOps } from '@domain/runtime/path-api'

import { createHostFileSystem } from '../infra/fs/host-fs'
import { createWslFileSystem } from '../infra/fs/wsl-fs'
import { createRuntimeDetector } from '../infra/runtime/wsl-detector'
import { createWslCli } from '../infra/runtime/wsl-cli'
import { createFolderStore } from '../infra/settings/folder-store'
import { createEnumerationTargetFinder } from '../infra/session/target-finder'
import { createUtilityProcessLauncher } from './enumerator-spawner'
import { createFolderService, type FolderService } from './folder-service'
import type { IpcDependencies } from './ipc'
import { createMeasure } from './measure'
import { isDevBuild } from './origins'
import { createRuntimeStore, type RuntimeStore } from './runtime-store'
import { createSessionEnumerator } from './session-enumerator'
import { createSessionService, type SessionService } from './session-service'

/**
 * composition root (BE-010 / BE-045 / AD-023 §1)。
 *
 * **Electron 由来の値をここで解決し `infra` / `domain` に注入する** (FR-038)。
 * `infra` は `electron` を import しない (例外は `infra/secrets/` のみ。AD-023 §8)。
 *
 * ここで解決している Electron 由来の値は 5 つある。
 * - ユーザデータディレクトリ (`app.getPath('userData')`) → 永続化層へ
 * - 開発ビルド判定 (`app.isPackaged`) → 計測へ
 * - ネイティブフォルダピッカー (`dialog.showOpenDialog`) → 所在 `windows` の入口
 * - **ホームディレクトリ (`app.getPath('home')`) → 列挙対象の探索へ** (R-2 / BE-031)
 * - **子プロセスの生成 (`enumerator-spawner`) → 列挙プロセスへ** (R-2)
 *
 * **親環境 (`process.env`) もここで解決する。** 列挙プロセスに渡す環境変数は
 * 許可リストで絞るが、親環境そのものを読むのは結線層の役割である —
 * `session-enumerator` がグローバルの `process` を参照すると、
 * import を伴わないので lint も検証スクリプトも素通りする (FR-050)。
 *
 * DI コンテナは使わず関数引数で渡す (AD-023 Open Questions の方針)。
 */

export interface Composition {
  readonly runtimes: RuntimeStore
  readonly folders: FolderService
  readonly sessions: SessionService
  readonly ipc: IpcDependencies
  /**
   * アプリ終了時に呼ぶ後始末。
   *
   * **生存中の列挙プロセスをすべて終了させる** (contracts C-5) —
   * UNC ハンドルを掴んだ孤児を残さない。
   * 登録は `src/main/index.ts` が `before-quit` で行う。
   */
  readonly dispose: () => void
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

  /*
   * **ホームディレクトリを解決して渡す** (BE-031 / BE-021)。
   * `infra/session` は `os` / `process` / `electron` のいずれも import できない。
   * 注入しないと `process.env.USERPROFILE` へ倒れ、**import が無いので
   * lint も検証スクリプトも素通りしたまま** Windows 前提の分岐が生える。
   */
  const homeResult = makeHostPath(app.getPath('home'))
  if (!homeResult.ok) {
    throw new Error('ホームディレクトリのパスを解釈できない')
  }
  const hostHome = homeResult.path

  const enumerator = createSessionEnumerator({
    launcher: createUtilityProcessLauncher(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now,
    // platform-ok: 親環境の読み取りであり OS 分岐ではない。許可リストの適用は `config-dir.ts`。
    parentEnv: process.env
  })

  const sessions = createSessionService({
    finder: createEnumerationTargetFinder({
      hostFs: createHostFileSystem(),
      wslFs: createWslFileSystem()
    }),
    enumerator,
    runtimes: () => runtimes.snapshot(),
    folders: () => folders.folders(),
    /*
     * **R-1 の実行状態確認をそのまま使う** (contracts C-7)。
     * R-2 は `wsl.exe` を新たに 1 度も呼ばない — この 1 行が SC-003 の「0 件」を
     * 成り立たせている。
     */
    verifyRunning: () => detector.verifyRunning(),
    hostHome: () => hostHome,
    now,
    measure
  })

  /*
   * **登録フォルダの変更で再列挙しない** (data-model §7)。
   * 対応づけだけをやり直す — 列挙は利用者の明示操作に限る (FR-033)。
   */
  folders.onChanged(() => sessions.onFoldersChanged())
  runtimes.onChanged(() => sessions.onRuntimesChanged())

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

    listSessions: () => sessions.list(),
    refreshSessions: () => sessions.refresh(),
    fetchMoreSessions: (targetKey, offset) => sessions.fetchMore(targetKey, offset),
    sessionTargetKeys: () => sessions.targetKeys(),

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

  return { runtimes, folders, sessions, ipc, dispose: () => enumerator.killAll() }
}
