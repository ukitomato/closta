import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'

import { IPC_CHANNELS } from '@domain/capability'

import { createComposition } from './app/composition-root'
import { registerIpcHandlers } from './app/ipc'
import { registerAppProtocol, registerAppScheme } from './app/protocol'
import { createMainWindow } from './app/window'

/**
 * エントリ。**組み立てのみを行い、業務ロジックを持たない** (AD-023 §1 の `app` レイヤ)。
 *
 * パス操作は `domain` のパス API 経由で行う (Principle I / FR-025)。
 * 本ファイルは `node:path` を import しない — 唯一の import 元は
 * `src/domain/runtime/path-api.ts` である。
 */

// カスタムプロトコルの特権登録は `whenReady()` より前に行う必要がある。
registerAppScheme()

/**
 * **単一インスタンス制限** (FR-020 / SC-014)。
 *
 * 2 つ目は既存ウィンドウに合流する。**永続化ファイルの更新時刻を変えない** —
 * 2 つ目のプロセスは store を開かずに終了する。
 */
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    // Windows のタスクバー集約と通知は appId を鍵にする。`electron-builder.yml` と一致させる。
    electronApp.setAppUserModelId('dev.closta.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerAppProtocol(__dirname)

    const composition = createComposition()
    registerIpcHandlers(composition.ipc)

    mainWindow = createMainWindow(__dirname)
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    /*
     * 変更通知を renderer へ中継する (BE-028 / FE-011)。
     *
     * **renderer からコールバックを受け取らない。** preload はチャンネルの購読と
     * 解除だけを公開し、main からは webContents へ送るだけにする (FR-039)。
     * ウィンドウが閉じたあとの送信は `isDestroyed()` で弾く。
     */
    composition.runtimes.onChanged((list) => {
      const target = mainWindow
      if (target === null || target.isDestroyed()) return
      target.webContents.send(IPC_CHANNELS.runtimesChanged, list)
    })

    composition.folders.onChanged((list) => {
      const target = mainWindow
      if (target === null || target.isDestroyed()) return
      target.webContents.send(IPC_CHANNELS.foldersChanged, list)
    })

    /*
     * 起動直後に一覧と判定を走らせる。**一覧を待たずに判定を始めない** —
     * 判定は `verifyRunning` の結果に依存する (C-1)。
     * どちらも通知で renderer に届く。
     */
    void composition.runtimes.list().then(() => composition.runtimes.probeAll())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow(__dirname)
      }
    })
  })

  app.on('window-all-closed', () => {
    // 注記は Principle II の例外条件によりプラットフォーム判定と**同じ行**に置く。
    // `if` の直後に書くと prettier が次の行へ送り、注記として認められなくなる。
    const isMac = process.platform === 'darwin' // platform-ok: macOS は最後のウィンドウを閉じても終了しない (Electron の定型。除去不能)
    if (!isMac) {
      app.quit()
    }
  })
}
