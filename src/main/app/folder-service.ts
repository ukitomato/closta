import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import type { RuntimeDetector, WslFileSystem } from '@domain/runtime/interfaces'
import { type NamespaceId, type WslNamespaceId, wslNamespace } from '@domain/runtime/namespace'
import { makeHostPath, makeRuntimePath, type RuntimePath } from '@domain/runtime/path-types'
import { runtimePathOps } from '@domain/runtime/path-api'
import type {
  BrowseDirectoryResult,
  BeginBrowseResult,
  BrowseTargetDTO,
  DirEntryDTO,
  FolderListDTO,
  RegisterFolderResult,
  WorkspaceFolderDTO,
  WorkspaceFolderDraftDTO
} from '@domain/workspace/dto'
import {
  isWslFolder,
  locationNamespace,
  type Location,
  type WorkspaceFolder
} from '@domain/workspace/folder'
import { findDuplicate, makeFolderId } from '@domain/workspace/registry'
import { folderReachability, type ExistenceCheck } from '@domain/workspace/reachability'
import { resolveFolderRuntime, toFolderReachability } from '@domain/workspace/resolution'
import {
  BROWSE_SESSION_TTL_MS,
  checkNotExpired,
  type VerifiedRunning
} from '@domain/runtime/verified-running'

import type { HostFileSystem } from '../infra/fs/host-fs'
import type { FolderStore, RestoreIssues } from '../infra/settings/folder-store'
import type { Measure } from './measure'
import { isValidBrowseTarget, isValidDisplayName } from './validate'

/**
 * 作業フォルダの取り回し (BE-046 / BE-047 / FR-015 〜 FR-019)。
 *
 * **ブラウズセッション**: 開く操作で実行状態を 1 回確認し、トークンに紐づけて
 * 一定時間 (`BROWSE_SESSION_TTL_MS`) 再利用する。**階層移動でプロセスを起動しない** (FR-010)。
 *
 * **パスの合成は main 側のパス API で行う** (FR-025)。renderer は
 * `{ root | current | child | parent }` を送るだけで、文字列を連結しない。
 */

export interface BrowseSession {
  readonly token: string
  readonly namespace: WslNamespaceId
  readonly verified: VerifiedRunning
  /**
   * 発行した送信元 (`WebContents` の id)。
   *
   * **トークンだけでは足りない** (contracts/ipc-capability.md の `token` の行)。
   * 現在は単一ウィンドウなので `isTrustedSender` の origin 検査で実質守られているが、
   * AD-025 の目標レイアウトは **Browser / PR Webview を別 WebContents で持つ**と決めている。
   * その時点で「別の送信元が他人のトークンを使える」状態が生きるため、
   * 発行元を値として持たせて照合する。
   */
  readonly senderId: number
}

export interface FolderService {
  list(): Promise<FolderListDTO>
  beginBrowse(location: Location, senderId: number): Promise<BeginBrowseResult>
  browseDirectory(token: unknown, target: unknown, senderId: number): Promise<BrowseDirectoryResult>
  register(draft: WorkspaceFolderDraftDTO): Promise<RegisterFolderResult>
  unregister(id: string): Promise<{ readonly ok: boolean }>
  resolve(
    folderId: string,
    runtimeId: NamespaceId
  ): Promise<ReturnType<typeof resolveFolderRuntime> | null>
  folderIds(): readonly string[]
  /**
   * 登録フォルダの**domain 値**。
   *
   * `list()` は DTO を返すが、セッションの対応づけ (R-2) は
   * `WorkspaceFolder` を要る。DTO から復元させると branding を境界の外で
   * 作り直すことになり、R-1 の gate が繰り返し塞いだ形と同じになる。
   * `folderIds()` と同じ「現在値を覗く窓」である。
   */
  folders(): readonly WorkspaceFolder[]
  onChanged(listener: (list: FolderListDTO) => void): () => void
}

export interface FolderServiceDeps {
  readonly store: FolderStore
  readonly fs: WslFileSystem
  /** ホスト側の実在確認。**`app` が `node:fs` を直接触らないために注入する。** */
  readonly hostFs: HostFileSystem
  readonly detector: RuntimeDetector
  /** 検出済み descriptor の現在値。ランタイム側の store から取る。 */
  readonly runtimes: () => readonly RuntimeDescriptor[]
  readonly now: () => number
  readonly measure: Measure
  /**
   * 識別子の生成源。**`app` が `node:crypto` を直接触らないために注入する。**
   *
   * `hostFs` を注入しているのと同じ理由である — 本モジュールは状態を持つ調停
   * (`folders` / `sessions` / `verifiedCache` / `listeners`) であり、
   * I/O はインタフェース経由で受け取る (AD-023 §5 / §7 の `services` 行)。
   * `domain` 側も同じ論法で乱数源を引数に取っている
   * (`registry.ts` の `makeFolderId(random)`)。
   *
   * 8 文字以上の英数字を返すこと。`makeFolderId` が短すぎる値を拒否する。
   */
  readonly newId: () => string
}

export function createFolderService(deps: FolderServiceDeps): FolderService {
  const { store, fs, hostFs, detector, runtimes, now, measure, newId } = deps

  let folders: readonly WorkspaceFolder[] = []
  let issues: RestoreIssues = { skipped: 0, reasonKeys: [], backupPath: null }
  let loaded = false

  /** ブラウズセッション。**トークンを鍵にする。** */
  const sessions = new Map<string, BrowseSession>()

  /** 実行中確認済みの値。一覧の実在確認で使い回す (階層移動と同じ TTL)。 */
  let verifiedCache: ReadonlyMap<WslNamespaceId, VerifiedRunning> = new Map()
  let verifiedAt = 0

  const listeners = new Set<(list: FolderListDTO) => void>()

  async function ensureLoaded(): Promise<void> {
    if (loaded) return
    const result = await store.load()
    folders = result.folders
    issues = result.issues
    loaded = true
  }

  /**
   * 実在確認に使う確認済みの値を用意する。
   *
   * **`wsl.exe` の呼び出しを一覧件数に比例させない** (FR-010)。
   * TTL 内はキャッシュを使い回す。
   */
  async function ensureVerified(): Promise<void> {
    if (now() - verifiedAt <= BROWSE_SESSION_TTL_MS && verifiedCache.size > 0) return
    verifiedCache = await detector.verifyRunning()
    verifiedAt = now()
  }

  /**
   * フォルダの実在を確認する。**3 値を返す。**
   *
   * 所在 `wsl` は**確認済みの値を持つときだけ**発行する。持たないときは `unknown` —
   * `false` を返すと停止を削除と誤認し「解除を勧める」側へ落ちる (data-model §6)。
   */
  async function checkExistence(folder: WorkspaceFolder): Promise<ExistenceCheck> {
    if (!isWslFolder(folder)) {
      /*
       * 所在 `windows` の実在確認。**登録済みエントリに限る** (FR-027) ので、
       * 任意パスの存在を問い合わせる経路にはならない。
       */
      return (await hostFs.exists(folder.path)) ? 'exists' : 'missing'
    }

    const verified = verifiedCache.get(locationNamespace(folder.location) as WslNamespaceId)
    if (verified === undefined) return 'unknown'
    return (await fs.exists(folder.path, verified, now())) ? 'exists' : 'missing'
  }

  function toDTO(
    folder: WorkspaceFolder,
    reach: ReturnType<typeof folderReachability>
  ): WorkspaceFolderDTO {
    return {
      id: folder.id,
      location:
        folder.location.kind === 'windows'
          ? { kind: 'windows' }
          : { kind: 'wsl', distroName: folder.location.distroName },
      path: { namespace: folder.path.namespace, value: folder.path.value },
      displayName: folder.displayName,
      reachability: reach.reachability,
      unreachableReason: reach.unreachableReason,
      blockedReason: reach.blockedReason,
      resolutionSteps: reach.resolutionSteps,
      registeredAt: folder.registeredAt
    }
  }

  async function buildList(): Promise<FolderListDTO> {
    await ensureLoaded()
    await ensureVerified()

    const snapshot = runtimes()
    const dtos: WorkspaceFolderDTO[] = []

    for (const folder of folders) {
      const existence = await checkExistence(folder)
      const reach = folderReachability({ folder, runtimes: snapshot, existence }, () =>
        snapshot.map((runtime) => toFolderReachability(resolveFolderRuntime({ folder, runtime })))
      )
      dtos.push(toDTO(folder, reach))
    }

    return {
      folders: dtos,
      restoreIssues: {
        skipped: issues.skipped,
        reasonKeys: issues.reasonKeys,
        backupPath:
          issues.backupPath === null
            ? null
            : { namespace: issues.backupPath.namespace, value: issues.backupPath.value }
      }
    }
  }

  async function notify(): Promise<void> {
    if (listeners.size === 0) return
    const list = await buildList()
    for (const listener of listeners) listener(list)
  }

  /** draft を `WorkspaceFolder` に組み立てる。**名前空間の照合は検証側が済ませている。** */
  function toFolder(draft: WorkspaceFolderDraftDTO): WorkspaceFolder | null {
    const id = makeFolderId(newId)

    if (draft.location.kind === 'windows') {
      const path = makeHostPath(draft.path.value)
      if (!path.ok) return null
      return {
        id,
        location: { kind: 'windows' },
        path: path.path,
        displayName: draft.displayName,
        registeredAt: now()
      }
    }

    const namespace = wslNamespace(draft.location.distroName)
    const path = makeRuntimePath(namespace, draft.path.value)
    if (!path.ok) return null
    return {
      id,
      location: { kind: 'wsl', distroName: draft.location.distroName },
      path: path.path,
      displayName: draft.displayName,
      registeredAt: now()
    }
  }

  return {
    async list() {
      return measure('list-folders', buildList)
    },

    async beginBrowse(location, senderId) {
      /*
       * **開く操作で実行状態を 1 回確認する。** 所在 `windows` は呼び出し側 (検証) が
       * 既に拒否しているので、ここへは所在 `wsl` しか来ない。
       */
      if (location.kind === 'windows') return { ok: false, error: 'unsupported-location' }

      const namespace = wslNamespace(location.distroName)
      const verified = await detector.verifyRunning([namespace])
      const token_ = verified.get(namespace)
      if (token_ === undefined) return { ok: false, error: 'distro-not-running' }

      const token = newId()
      sessions.set(token, { token, namespace, verified: token_, senderId })

      /*
       * **ルートのパスは返さない。** renderer は `{ kind: 'root' }` を送って
       * 最初の階層を取る (FR-025)。ここで返すと renderer が保持したパスを
       * 起点に文字列を組み立てる余地が生まれる。
       */
      return { ok: true, token }
    },

    async browseDirectory(token, target, senderId) {
      return measure('browse-step', async () => {
        /*
         * トークンが無効・未知・**他の送信元のもの**・期限切れのいずれも
         * `browse-session-expired` を返す。
         * **どれなのかを教えない** — トークンの存在有無が分かると総当たりの手掛かりになる。
         */
        if (typeof token !== 'string') {
          return { ok: false as const, error: 'browse-session-expired' as const }
        }
        const session = sessions.get(token)
        if (session === undefined) {
          return { ok: false as const, error: 'browse-session-expired' as const }
        }

        // **発行した送信元と一致すること。** 正規のトークンの他送信元への流用を止める。
        if (session.senderId !== senderId) {
          return { ok: false as const, error: 'browse-session-expired' as const }
        }

        /*
         * **期限の検査はファイルアクセスの前に、ここで行う。**
         *
         * `WslFileSystem` 側にも同じ検査があるが、そちらは期限切れを
         * `distro-unreachable` に落とすため、利用者には
         * 「ディストロに接続できません」と出てしまう。契約は
         * **「期限切れは `browse-session-expired` を返して破棄する」**と定めている
         * (contracts/ipc-capability.md)。理由が違えば示す次の操作も違う —
         * 前者は「起動しろ」、後者は「開き直せ」である。
         */
        if (!checkNotExpired(session.verified, now(), BROWSE_SESSION_TTL_MS).ok) {
          sessions.delete(token)
          return { ok: false as const, error: 'browse-session-expired' as const }
        }

        /*
         * **`target.of` の名前空間はトークンと種別まで完全一致を要求する。**
         * `unc:<D>` を `wsl:<D>` として受け付けない。
         */
        if (!isValidBrowseTarget(target, session.namespace)) {
          // 閉じた `BrowseError` の範囲で答える。**内部の理由を渡さない。**
          return { ok: false as const, error: 'not-found' as const }
        }

        // **パスの合成は main 側のパス API で行う** (FR-025)。
        const resolved = resolveBrowseTarget(target, session.namespace)
        if (resolved === null) return { ok: false as const, error: 'not-found' as const }

        const result = await fs.listDirectory(resolved, session.verified, now())
        if (!result.ok) {
          if (result.reason === 'distro-unreachable') {
            // 期限切れか到達不能。セッションを捨てて開き直させる。
            sessions.delete(token)
          }
          return { ok: false as const, error: result.reason }
        }

        const entries: DirEntryDTO[] = result.entries.map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory,
          path: { namespace: entry.path.namespace, value: entry.path.value }
        }))

        return {
          ok: true as const,
          cwd: { namespace: result.cwd.namespace, value: result.cwd.value },
          parent:
            result.parent === null
              ? null
              : { namespace: result.parent.namespace, value: result.parent.value },
          entries
        }
      })
    },

    async register(draft) {
      await ensureLoaded()

      if (!isValidDisplayName(draft.displayName)) {
        return { ok: false, reason: 'invalid-display-name', existing: null }
      }

      const candidate = toFolder(draft)
      if (candidate === null) return { ok: false, reason: 'invalid-path', existing: null }

      /*
       * **重複登録を弾くときは既存エントリを返す** (FR-016)。
       * 「登録できません」だけでは、利用者はどのエントリと衝突したのか分からない。
       */
      const duplicate = findDuplicate(folders, candidate)
      if (duplicate !== null) {
        const existence = await checkExistence(duplicate.existing)
        const snapshot = runtimes()
        const reach = folderReachability(
          { folder: duplicate.existing, runtimes: snapshot, existence },
          () =>
            snapshot.map((runtime) =>
              toFolderReachability(resolveFolderRuntime({ folder: duplicate.existing, runtime }))
            )
        )
        return { ok: false, reason: 'duplicate', existing: toDTO(duplicate.existing, reach) }
      }

      folders = [...folders, candidate]
      await store.save(folders)
      await notify()

      /*
       * **登録できた値をそのまま返す。** renderer が一覧を取り直すまで
       * 表示が古いままになるのを避ける。到達可能性も付けて返す。
       */
      const existence = await checkExistence(candidate)
      const snapshot = runtimes()
      const reach = folderReachability({ folder: candidate, runtimes: snapshot, existence }, () =>
        snapshot.map((runtime) =>
          toFolderReachability(resolveFolderRuntime({ folder: candidate, runtime }))
        )
      )
      return { ok: true, folder: toDTO(candidate, reach) }
    },

    async unregister(id) {
      await ensureLoaded()
      const next = folders.filter((folder) => folder.id !== id)
      if (next.length === folders.length) return { ok: false }
      folders = next
      await store.save(folders)
      await notify()
      return { ok: true }
    },

    async resolve(folderId, runtimeId) {
      await ensureLoaded()
      const folder = folders.find((f) => f.id === folderId)
      if (folder === undefined) return null
      const runtime = runtimes().find((r) => r.id === runtimeId)
      if (runtime === undefined) return null
      return resolveFolderRuntime({ folder, runtime })
    },

    folders() {
      return folders
    },

    folderIds() {
      return folders.map((folder) => folder.id)
    },

    onChanged(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/**
 * 移動先のパスを組み立てる。**呼び出し元に合成させない** (FR-025)。
 *
 * `child` は名前 1 つだけを受け取り、`join` が `.` / `..` とセパレータを拒否する。
 */
function resolveBrowseTarget(
  target: BrowseTargetDTO,
  namespace: WslNamespaceId
): RuntimePath | null {
  if (target.kind === 'root') {
    const root = makeRuntimePath(namespace, '/')
    return root.ok ? root.path : null
  }

  const of = makeRuntimePath(namespace, target.of.value)
  if (!of.ok) return null

  if (target.kind === 'current') return of.path
  if (target.kind === 'parent') return runtimePathOps.parent(of.path)

  const child = runtimePathOps.join(of.path, target.name)
  return child.ok ? child.path : null
}
