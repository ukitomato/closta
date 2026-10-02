import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'

import { IPC_CHANNELS } from '@domain/capability'

import { createComposition } from './app/composition-root'
import { createE2eCapability } from './app/e2e-capability'
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

/** 終了処理全体の期限 (spec Assumptions [ASSUMED] 5 秒)。過ぎたら残りを待たずに終える (FR-014)。 */
const QUIT_TIMEOUT_MS = 5000

/**
 * `before-quit` で非同期の後始末を **1 回だけ** 走らせる (X-5 / FR-014 / design-gate R1 M-02)。
 *
 * 1 回目は `preventDefault` して後始末を待ち (全体に期限)、終わったら `app.quit()` をやり直す。
 * `app.quit()` は `before-quit` をもう一度発火させるので、2 回目は素通しする (再入しない)。
 */
function onBeforeQuitOnce(cleanup: () => Promise<void>): void {
  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, QUIT_TIMEOUT_MS))
    void Promise.race([cleanup().catch(() => undefined), timeout]).finally(() => app.quit())
  })
}

/**
 * renderer の保持と port が失われたら全セッションを止める (X-5 / FR-014)。利用者から見えないまま枠を占める
 * セッションを残さない。supervisor は止めない。
 *
 * **検知は確定した文書の入れ替わりで行う** (`did-navigate` = main frame の新しい文書への遷移の確定 /
 * `render-process-gone`)。取り消されうる遷移の開始 (`did-start-navigation`) では止めない — 拒否された遷移で
 * 全セッションを止める経路を作らない (design-gate R3-H-02)。トップレベル遷移は `window.ts` の `will-navigate` が
 * すべて拒否するので、`did-navigate` に至るのは初回の読み込みと再読み込み (開発時のリロード) だけである。
 * 本番ビルドの Ctrl+R / Ctrl+Shift+R は `@electron-toolkit/utils` の `watchWindowShortcuts` が握りつぶす (R3-H-01)。
 */
function watchRendererLifetime(window: BrowserWindow, killAll: () => number): void {
  window.webContents.on('did-navigate', () => {
    killAll()
  })
  window.webContents.on('render-process-gone', () => {
    killAll()
  })
}

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

    /*
     * **E2E stub 経路 (X-2 / AD-038 D3 / T030。production-inert)。**
     *
     * `app.isPackaged` が本番で true になり到達しない。**env 単独では有効化しない** (origins.ts E-H004 と
     * 同じ原則) — `!app.isPackaged && CLOSTA_E2E==='1'` の合成条件でのみ。real な WSL・Claude 認証・外部 API・
     * 秘密を一切使わず fake capability を配線する。**単一 capability 境界 (FR-039) は不変** — preload も
     * `window.closta` も本番と同一で、ここは `IpcDependencies` を差し替えるだけ。変更通知配線と WSL 検出は
     * E2E では不要なので張らない (fake は変化しない)。
     */
    if (!app.isPackaged && process.env.CLOSTA_E2E === '1') {
      const stub = createE2eCapability()
      registerIpcHandlers(stub.ipc)

      mainWindow = createMainWindow(__dirname)
      mainWindow.on('closed', () => {
        mainWindow = null
      })
      stub.sessionStatus.onForward((updates) => {
        const target = mainWindow
        if (target === null || target.isDestroyed()) return
        target.webContents.send(IPC_CHANNELS.sessionStatus, updates)
      })
      watchRendererLifetime(mainWindow, () => stub.killAllSessions())
      onBeforeQuitOnce(async () => {
        await stub.dispose()
      })
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createMainWindow(__dirname)
        }
      })
      return
    }

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

    composition.sessions.onChanged((index) => {
      const target = mainWindow
      if (target === null || target.isDestroyed()) return
      target.webContents.send(IPC_CHANNELS.sessionsChanged, index)
    })

    // 稼働中セッションの状態通知 (X-5 / FR-004)。受理済みのバッチを 1 回で送る。
    composition.sessionStatus.onForward((updates) => {
      const target = mainWindow
      if (target === null || target.isDestroyed()) return
      target.webContents.send(IPC_CHANNELS.sessionStatus, updates)
    })

    watchRendererLifetime(mainWindow, () => composition.killAllSessions())

    /*
     * **生存中のセッション・列挙プロセスをアプリ終了時に終了させる** (X-5 FR-014 / contracts C-5 / BE-025)。
     * UNC ハンドルを掴んだ孤児を残さない。
     * `before-quit` を選ぶのは、`window-all-closed` では macOS が終了しないためである。
     */
    onBeforeQuitOnce(async () => {
      /*
       * **戻り値を捨てない** (pr-gate Round 3 / 4 track が収束した指摘)。
       * 孤児が残ったことを誰も知れない設計は、contracts C-5 の「記録して監視対象から外す」の後半を満たさない。
       */
      const unconfirmed = await composition.dispose()
      if (unconfirmed > 0) {
        console.warn(
          `[dispose] 終了を確認できないプロセスが ${unconfirmed} 件あります (contracts C-5)`
        )
      }
    })

    /*
     * 起動直後に一覧と判定を走らせる。**一覧を待たずに判定を始めない** —
     * 判定は `verifyRunning` の結果に依存する (C-1)。
     * どちらも通知で renderer に届く。
     */
    void composition.runtimes.list().then(() => composition.runtimes.probeAll())

    /*
     * **セッション一覧は起動直後に取らない。** 一覧を開いたときに取る (FR-031)。
     * 起動時に取ると、ランタイム検出より先に実行中確認が走って
     * 停止中の所在が「停止中」ではなく「未検出」として並ぶ。
     * 加えて起動経路に UNC I/O を伴う子プロセスが乗る。
     */

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
