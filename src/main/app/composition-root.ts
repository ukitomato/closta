import { randomUUID } from 'node:crypto'

import { app, dialog } from 'electron'

import { makeHostPath } from '@domain/runtime/path-types'
import { hostPathOps } from '@domain/runtime/path-api'
import type { PathMapping } from '@domain/runtime/path-mapping'
import { applyEntry, findLongestMatch } from '@domain/workspace/prefix-match'
import { isWslFolder, type WorkspaceFolder } from '@domain/workspace/folder'

import { createHostFileSystem, isHostFile } from '../infra/fs/host-fs'
import { createWslFileSystem } from '../infra/fs/wsl-fs'
import { createProviderDetector } from '../infra/provider/detector'
import {
  buildLaunchEnv,
  buildRuntimeLaunchSpec,
  composeLaunchEnv,
  isDeniedEnvKey,
  isForbiddenForwardKey
} from '../infra/runtime/launch-spec'
import {
  buildWin32LaunchEnv,
  buildWin32LaunchSpec,
  composeWin32LaunchEnv,
  isWin32ForbiddenKey
} from '../infra/runtime/win32-launch'
import { createWin32ClaudeLocator } from '../infra/runtime/win32-claude'
import { createRuntimeDetector } from '../infra/runtime/wsl-detector'
import { createWslCli } from '../infra/runtime/wsl-cli'
import { createSecretStore } from '../infra/secrets/safe-storage'
import { createFolderStore } from '../infra/settings/folder-store'
import { createLaunchUsageStore } from '../infra/settings/launch-usage-store'
import { createPresetStore } from '../infra/settings/preset-store'
import { createProviderStore } from '../infra/settings/provider-store'
import { createRuntimeSettingsStore } from '../infra/settings/runtime-settings-store'
import { buildTranscriptEnv } from '../infra/session/config-dir'
import { createEnumerationTargetFinder } from '../infra/session/target-finder'
import { createUtilityProcessLauncher } from './enumerator-spawner'
import { createFolderService, type FolderService } from './folder-service'
import type { IpcDependencies } from './ipc'
import { createPrepareLaunch } from './launch-preparation'
import { createLaunchUsageService } from './launch-usage-service'
import { createMeasure } from './measure'
import { isDevBuild } from './origins'
import { createPresetService } from './preset-service'
import { createProviderService } from './provider-service'
import { createRuntimeStore, type RuntimeStore } from './runtime-store'
import { createSessionEnumerator } from './session-enumerator'
import { resolveLiveTranscriptTarget } from './live-transcript-target'
import { createRenameSpawner } from './rename-spawner'
import { createResumeService } from './resume-service'
import { createSessionRenameService } from './session-rename-service'
import { createSessionLaunchService } from './session-launch-service'
import { createSessionService, type SessionService } from './session-service'
import { createSupervisorConnection } from './session-spawner'
import { createSessionStatusRelay, type SessionStatusRelay } from './session-status-relay'
import { createWin32ClaudePathService } from './win32-claude-path-service'
import { createTranscriptService } from './transcript-service'
import { createTranscriptSpawner } from './transcript-spawner'

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
  /** 稼働中セッションの状態通知の中継 (X-5)。送り先 (主ウィンドウ) は `index.ts` が登録する。 */
  readonly sessionStatus: SessionStatusRelay
  /** 稼働中の行が会話の id を持った通知 (X-9 / contracts C-4)。送り先 (主ウィンドウ) は `index.ts` が登録する。 */
  readonly onSessionResumable: (listener: (sessionIds: readonly string[]) => void) => void
  readonly ipc: IpcDependencies
  /** renderer の再読み込み・クラッシュで全セッションを止める (X-5 FR-014)。送った数を返す。 */
  readonly killAllSessions: () => number
  /**
   * アプリ終了時に呼ぶ後始末。登録は `src/main/index.ts` が `before-quit` で行う。
   *
   * **全セッションの `claude` の終了 (または期限) を待ってから supervisor を止め** (X-5 FR-014)、続けて
   * 常駐している列挙プロセスを終了させる (contracts C-5)。UNC ハンドルを掴んだ孤児を残さない。
   * **終了を確認できなかった台数**を返す。この層は記録の経路を持たないので、呼び出し側 (`index.ts`) が記録する。
   */
  readonly dispose: () => Promise<number>
}

export function createComposition(): Composition {
  const now = (): number => Date.now()

  /*
   * **ユーザデータディレクトリを解決して渡す。**
   * `infra/settings` は `electron` を import できない (AD-023 §8)。
   */
  const userDataResult = makeHostPath(app.getPath('userData'))
  if (!userDataResult.ok) {
    throw new Error('ユーザデータディレクトリのパスを解釈できない')
  }
  const runtimeSettings = createRuntimeSettingsStore(userDataResult.path, now)

  /*
   * プロセス起動レイヤ (`wsl-cli`) を注入する。
   * 差し替えれば WSL 未搭載ホストの挙動も出力の解釈も Vitest で検証できる
   * (`wsl-detector.test.ts`)。
   */
  const detector = createRuntimeDetector({
    cli: createWslCli(),
    now,
    locateWin32Claude: createWin32ClaudeLocator({
      isFile: isHostFile,
      env: () => process.env,
      override: async () => {
        const loadedSettings = await runtimeSettings.load()
        if (loadedSettings.kind === 'loaded') {
          for (const reasonKey of loadedSettings.reasonKeys) {
            console.warn(`[runtime-settings] ${reasonKey}`)
          }
          // 壊れた設定は指定なしにしない (FR-006)。locator が override-invalid にする。
          if (loadedSettings.reasonKeys.length > 0) throw new Error('runtime-settings unreadable')
          return loadedSettings.win32ClaudePath
        }
        console.warn(
          `[runtime-settings] ${loadedSettings.kind === 'newer-version' ? 'newer-version' : loadedSettings.reasonKey}`
        )
        throw new Error('runtime-settings unreadable')
      }
    })
  })

  /*
   * **開発ビルド判定はここで解決する。** `measure` に `electron` を持ち込まないため
   * (FR-038 / AD-023 §8)。持ち込むと計測を使う層すべてが Electron 起動を要求する。
   */
  const measure = createMeasure(isDevBuild())
  const runtimes = createRuntimeStore(detector, measure)

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

  /*
   * **列挙プロセスを先に起こす** (AD-030 §6)。
   *
   * 起動費用は実測で約 2.7 秒あり、一覧を開いたときに払うと
   * SC-008 の先頭ページ 2 秒を単独で超える。
   * R-1 のランタイム検出が既に約 4 秒かかっているため、その裏に隠れる。
   *
   * **呼ばなくても動く。** 最初の要求の時点で起こす (遅いが動く)。
   */
  enumerator.warmUp()

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
   * **実行中確認も先に済ませる** (SC-008)。
   *
   * `wsl.exe` の固定費は実測 1,185〜1,373 ms あり、一覧を開いたときに払うと
   * **先頭 50 件の予算 2 秒から丸ごと引かれる** (実測で余裕が 21 ms まで詰まった)。
   * R-1 の判定バッチが同じ確認を既に走らせている裏に隠れる。
   *
   * **これだけでは足りない。** 有効期間は 30 秒であり、利用者が後で開けば払い直す。
   * 構造側の手当ては `session-service.ts` にある —
   * **所在 `windows` は実行中確認を待たずに列挙して先に描く**。
   */
  sessions.warmUp()

  /*
   * **登録フォルダの変更で再列挙しない** (data-model §7)。
   * 対応づけだけをやり直す — 列挙は利用者の明示操作に限る (FR-033)。
   */
  folders.onChanged(() => sessions.onFoldersChanged())
  runtimes.onChanged(() => sessions.onRuntimesChanged())

  /*
   * **transcript 取得サービス** (R-3 / [AD-034](../../../docs/decisions/0034-transcript-read-path-and-process-boundary.md))。
   *
   * 取得は target ごとに env 固定の**専用短命プロセス**で行い、本文は `MessageChannelMain` の
   * port で取得プロセス↔renderer 直通に流す (main を本文のデータ経路から外す。Principle IX)。
   * `targetKey` の解決と起動ゲートは session-service に委ねる (実行中確認の状態を再利用)。
   */
  const transcripts = createTranscriptService({
    spawner: createTranscriptSpawner(),
    resolveTarget: (targetKey) => sessions.transcriptTarget(targetKey),
    // 親環境の許可リスト + CLAUDE_CONFIG_DIR (spawn 時固定)。綴りは config-dir が持つ。
    buildEnv: (configDirEnv) => buildTranscriptEnv(process.env, configDirEnv)
  })

  /*
   * **Provider 登録と到達可能性判定** (X-3 / AD-005 / AD-039 / AD-040)。
   *
   * 秘密は `safeStorage` (infra/secrets) に seal し参照値のみ保持する (Principle V)。検出の I/O
   * (`~/.aws/config` 読み取り・config dir 存在・env 走査) は infra が担い、composition が `home` / `process.env` /
   * `exists` を値で渡す (H-04)。env 導出の denylist は X-1 `LAUNCH_ENV_DENY_PATTERN` の述語を注入 (SSoT。FR-009)。
   * config-dir の RuntimePath 変換と helper パスの分類は domain の関数 (`helper-path.ts`) が行う (X-4 FR-012 / FR-014)。
   */
  /*
   * **extraEnv の登録境界の述語** (IPC と providers.json の read 側で同じ実体。pr-gate R1 platform-boundary M-302)。
   * transport のキー集合を持つのは infra/runtime で、注入点はここ 1 箇所 (validate / provider-record は直接 import しない)。
   * 登録時は transport の和集合で検証する — 現状は WSL の 1 transport (forward-env.ts の注記)。
   */
  const extraEnvPredicates = { isForbiddenForwardKey, isDeniedEnvKey }

  const providers = createProviderService({
    store: createProviderStore(userDataResult.path, now, extraEnvPredicates),
    secrets: createSecretStore(),
    detect: createProviderDetector({
      home: hostHome,
      // platform-ok: 親環境の**名前のみ**を走査する (値は運ばない。H-10)。OS 分岐ではない。
      parentEnv: process.env,
      exists: (p) => createHostFileSystem().exists(p)
    }),
    runtimes: () => runtimes.snapshot(),
    // 起動 env の curated base (X-1 と同じ許可リスト。両 spawn 点と同一の純関数)。
    curatedBaseEnv: () => buildLaunchEnv(process.env),
    // denylist の SSoT を注入する (パターンを provider へ複製しない。FR-009 / L-03)。
    isDeniedEnvKey,
    // 転送禁止キー (transport キーは infra から注入済み。X-4 / AD-041 (e))。
    isForbiddenForwardKey,
    // 到達可能性の判定は、起動の合成が拒否するのと同じ述語で決める (wsl → WSL の transport、win32 → Win32 の transport。X-8 §6.4)。
    isTransportForbiddenKey: (kind, key) =>
      kind === 'win32' ? isWin32ForbiddenKey(key) : isForbiddenForwardKey(key),
    // platform-ok: env-passthrough の値の出所 (varNames の実名 allowlist だけを読む。AD-041 (e) 4)。OS 分岐ではない。
    parentEnv: () => process.env,
    newId: () => randomUUID().replace(/-/g, '')
  })

  /*
   * **複数セッションの起動 + ストリーミング** (X-1 / X-5 / AD-036 / AD-043) を **X-4 の起動設定**で動かす (AD-041)。
   *
   * 単一の supervisor (`utilityProcess`) を最初の起動で起こし、セッションごとのスレッドで動かす。
   * 本文は `MessageChannelMain` の port で supervisor↔renderer 直通に流す (main を本文経路から外す)。
   * 上限・制御の宛先・状態通知の受信・dispose は service (`session-launch-service.ts`) が持ち、
   * 実プロセス生成は `session-spawner.ts` に閉じる。状態通知は relay で renderer へ届ける。
   * 起動前段 (依存解決の再評価・起動ゲート・env 導出・WSLENV 合成) は `launch-preparation.ts` が持つ。
   */
  const sessionStatus = createSessionStatusRelay()
  /** 稼働中の行が会話の id を持った通知の送り先 (主ウィンドウ。`index.ts` が登録する)。値は Closta の sessionId だけ。 */
  const resumableListeners: ((sessionIds: readonly string[]) => void)[] = []
  const launchService = createSessionLaunchService({
    onResumable: (sessionId) => {
      for (const listener of resumableListeners) listener([sessionId])
    },
    // fork env はランタイムに依存しない curated base (pr-gate R1 platform-boundary L-001)。
    connection: createSupervisorConnection(() => buildLaunchEnv(process.env)),
    newSessionId: () => randomUUID(),
    // 実行中のモデルの切り替えの検証に使う今のカタログ (起動の依存解決と同じ store。Provider が無ければ null)。
    providerModels: async (providerId) =>
      (await providers.snapshotProfiles()).find((p) => p.id === providerId)?.models.models ?? null,
    onStatus: (updates) => sessionStatus.forward(updates),
    timer: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as never)
    },
    // 理由キー・件数・終了コードだけを記録する (会話由来の文字列・env を出さない。Principle V)。
    log: (line) => console.warn(line),
    prepareLaunch: createPrepareLaunch({
      folders: () => folders.folders(),
      runtimes: () => runtimes.snapshot(),
      /*
       * **実行中確認をここで取り直す** (SC-002)。R-1 の判定を再利用し `wsl.exe` を増やさない。
       * evaluateLaunch (純粋) が VerifiedRunning + 期限 + 所在 distro 一致を型でゲートする。
       */
      verifyRunning: async (runtimeId) =>
        (await detector.verifyRunning([runtimeId])).get(runtimeId) ?? null,
      providerFacts: (runtimeId) => providers.providerFacts(runtimeId),
      deriveEnv: (providerId, runtimeId) => providers.deriveEnv(providerId, runtimeId),
      // wsl.exe の絶対パス解決と launch env の合成に使う curated base (data-model §7 / M-202)。
      // fork env は上の createSupervisorConnection に注入する (AD-043 Decision 7 / pr-gate R3 platform-boundary L-201)。
      baseEnv: () => buildLaunchEnv(process.env),
      // cwd を runtime 名前空間の RuntimePath 文字列で得る (Principle I / H-03)。
      resolveCwd: (folder, runtime) => resolveCwd(folder, runtime.pathMapping),
      composeLaunchEnv,
      buildRuntimeLaunchSpec,
      // Win32Runtime の起動 (X-8)。許可リストのホスト env・合成・起動の値・起動の時点の実在確認。
      win32BaseEnv: () => buildWin32LaunchEnv(process.env),
      composeWin32LaunchEnv,
      buildWin32LaunchSpec,
      win32ClaudeIsFile: isHostFile,
      now,
      // 拒否理由キーだけを記録する (値・パス・モデル ID を出さない。Principle V / CWE-532)。
      logRejection: (reasonKey) => console.warn(`[launch] rejected: ${reasonKey}`)
    })
  })

  /**
   * 再開の調停 (X-9 / AD-059)。状態を持たない。I/O (列挙のキャッシュ・登録の一覧・起動・transcript 取得) は注入で受ける。
   */
  const resumeService = createResumeService({
    pastResumeSource: (targetKey, conversationId) =>
      sessions.pastResumeSource(targetKey, conversationId),
    folders: () => folders.folders(),
    runtimes: () => runtimes.snapshot(),
    providers: () => providers.snapshotProfiles(),
    resolve: sessions.resolve,
    enumerationTargets: () => sessions.enumerationTargets(),
    launchResume: (config, resolved) => launchService.resume(config, resolved),
    conversationRecord: (sessionId) => launchService.conversationRecord(sessionId),
    getTranscript: (conversationId, targetKey, requestToken) =>
      transcripts.getTranscript(conversationId, targetKey, requestToken)
  })

  /**
   * 実行中のセッションの改名 (023 / AD-062 Decision 4)。状態を持たない。env を固定した短命の子が `renameSession()` で
   * transcript に書く。`transcriptTarget` と `buildTranscriptEnv` は transcript の取得と同じ結線を渡す。
   */
  const renames = createRenameSpawner()
  const sessionRenames = createSessionRenameService({
    liveSettingRow: (sessionId) => launchService.liveSettingRow(sessionId),
    beginChange: (sessionId, kind) => launchService.beginChange(sessionId, kind),
    endChange: (sessionId, kind) => launchService.endChange(sessionId, kind),
    setName: (sessionId, name) => launchService.setName(sessionId, name),
    conversationRecord: (sessionId) => launchService.conversationRecord(sessionId),
    resolveTarget: (record) =>
      resolveLiveTranscriptTarget(record, {
        runtimes: () => runtimes.snapshot(),
        enumerationTargets: () => sessions.enumerationTargets(),
        pastResumeSource: (targetKey, conversationId) =>
          sessions.pastResumeSource(targetKey, conversationId),
        providers: () => providers.snapshotProfiles()
      }),
    transcriptTarget: (targetKey) => sessions.transcriptTarget(targetKey),
    buildEnv: (configDirEnv) => buildTranscriptEnv(process.env, configDirEnv),
    spawnRename: (env, request) => renames.run(env, request),
    // 成功か失敗かだけを記録する (名前・会話の id・config ディレクトリを出さない)。
    log: (line) => console.warn(line)
  })

  /** プリセット (X-4 / FR-009)。Provider は id 参照で持ち、資格情報を含めない (Principle V)。 */
  const presets = createPresetService({
    store: createPresetStore(userDataResult.path, now),
    now,
    newId: () => randomUUID().replace(/-/g, '')
  })

  /**
   * 起動の利用記録 (O-3 / 012 spec FR-012)。日ごとの 2 つの回数だけを `launch-usage.json` に持つ。
   * 今日はローカルの暦日 — その時刻の時差 (分。UTC より進んでいれば正) をここで解決して渡す (data-model §4「書き込み」)。
   */
  const launchUsage = createLaunchUsageService({
    store: createLaunchUsageStore(userDataResult.path, now),
    now,
    localOffsetMinutes: (epochMs) => -new Date(epochMs).getTimezoneOffset()
  })

  /*
   * **Win32 の claude.exe の場所の指定** (X-8 / contracts C-1・C-2)。ダイアログはここ (`app` レイヤ) に置く。
   * 保存の後の再検出は `refreshRuntimes` と同じ手順 (判定バッチは待たずに回す)。
   */
  const win32ClaudePath = createWin32ClaudePathService({
    chooseFile: async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'claude.exe を選ぶ',
        filters: [{ name: 'claude.exe', extensions: ['exe'] }]
      })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    },
    save: (path) => runtimeSettings.saveWin32ClaudePath(path),
    refresh: async () => {
      const list = await runtimes.refresh()
      void runtimes.probeAll()
      return list
    }
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

    listSessions: () => sessions.list(),
    refreshSessions: () => sessions.refresh(),
    fetchMoreSessions: (targetKey, offset) => sessions.fetchMore(targetKey, offset),
    sessionTargetKeys: () => sessions.targetKeys(),
    getTranscript: (sessionId, targetKey, requestToken) =>
      transcripts.getTranscript(sessionId, targetKey, requestToken),

    launchSession: (config) => launchService.launch(config),
    controlSession: (sessionId, control) => launchService.control(sessionId, control),
    setSessionPermissionMode: (sessionId, mode) => launchService.setPermissionMode(sessionId, mode),
    setSessionModel: (sessionId, modelId) => launchService.setModel(sessionId, modelId),
    listSessionModels: (sessionId) => launchService.listModels(sessionId),
    renameSession: (sessionId, name) => sessionRenames.rename(sessionId, name),

    resolvePastResume: (targetKey, conversationId) =>
      resumeService.resolvePast(targetKey, conversationId),
    resumeSession: (request) => resumeService.resume(request),
    getResumedTranscript: (sessionId, requestToken) =>
      resumeService.getResumedTranscript(sessionId, requestToken),

    listPresets: () => presets.list(),
    savePreset: (input) => presets.save(input),
    removePreset: (id) => presets.remove(id),
    presetIds: async () => (await presets.list()).map((p) => p.id),

    recordLaunchUsage: (origin) => launchUsage.record(origin),
    getLaunchUsage: () => launchUsage.summary(),

    listProviders: () => providers.list(),
    detectProviders: () => providers.detect(),
    registerProvider: (draft) => providers.register(draft),
    updateProvider: (id, patch) => providers.update(id, patch),
    removeProvider: (id) => providers.remove(id),
    listReachableProviders: (runtimeId) => providers.listReachable(runtimeId),
    providerLoadIssues: () => providers.loadIssues(),
    extraEnvPredicates,

    pickWin32ClaudePath: () => win32ClaudePath.pick(),
    clearWin32ClaudePath: () => win32ClaudePath.clear(),

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

  /*
   * **列挙プロセスと transcript の in-flight プロセスの双方を片付ける** (contracts C-5)。
   * 終了を確認できなかった台数を合算して返す (0 でなければ UNC ハンドルを掴んだ孤児が残る)。
   */
  return {
    runtimes,
    folders,
    sessions,
    sessionStatus,
    onSessionResumable: (listener) => {
      resumableListeners.push(listener)
    },
    ipc,
    // renderer の再読み込み・クラッシュで全セッションを止める (supervisor は止めない。X-5 FR-014)。
    killAllSessions: () => launchService.killAll(),
    /*
     * 起動中セッションも片付ける (window close / before-quit)。**supervisor を先に片付けてから**
     * 列挙・transcript の同期 dispose を呼ぶ (X-5 FR-014)。孫 (wsl) の kill はセッションスレッドが行う。
     */
    dispose: async (): Promise<number> => {
      const sessionsUnconfirmed = await launchService.dispose()
      return sessionsUnconfirmed + enumerator.dispose() + transcripts.dispose() + renames.dispose()
    }
  }
}

/**
 * 作業フォルダを runtime 名前空間の cwd (RuntimePath 文字列) に変換する (Principle I / H-03)。
 *
 * WSL フォルダは所在ディストロがランタイムと一致済み (evaluateLaunch) なので値をそのまま使う。
 * Windows フォルダは越境であり、runtime の `PathMapping` で host→runtime に変換する
 * (照合・置換は domain の `prefix-match` が正本。ここで再実装しない)。マッピング未取得や
 * 配下でないパスは変換不能として `null` を返す (推測で対応を作らない)。
 */
function resolveCwd(folder: WorkspaceFolder, pathMapping: PathMapping | null): string | null {
  if (isWslFolder(folder)) return folder.path.value
  if (pathMapping === null) return null
  const entry = findLongestMatch(pathMapping, folder.path.value)
  if (entry === null) return null
  return applyEntry(pathMapping, entry, folder.path.value)
}
