import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

import { hostPathOps } from '@domain/runtime/path-api'
import type { HostPath } from '@domain/runtime/path-types'
import type { RestoreIssueReason } from '@domain/workspace/dto'
import type { WorkspaceFolder } from '@domain/workspace/folder'
import { isUniqueId } from '@domain/workspace/registry'

import { fromFolderRecord, SCHEMA_VERSION, toFolderRecord } from './folder-record'

/**
 * 作業フォルダの JSON 永続化 (BE-044 / contracts/workspace-store.md)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **`electron` を import しない。** ユーザデータのパスを引数で受け取る | FR-038 / AD-023 §8 |
 * | パス組み立ては `domain` のパス API を使う | FR-025 |
 * | **復元できなかったファイルは上書き前に退避**し、退避完了まで置換しない | FR-019 |
 * | 書き込みは一時ファイル + rename による atomic 置換 | 書き込み中のクラッシュで全件を失わない |
 * | 書き込みのたびに `schemaVersion` を出力する | 将来の移行判定 |
 *
 * **秘密情報のフィールドを持たない** (Constitution Principle V / FR-019)。
 */

/** ファイル名。ユーザデータディレクトリの直下に置く。 */
const FILE_NAME = 'workspace-folders.json'

/** 一時ファイル名。rename で置換する。 */
const TEMP_NAME = 'workspace-folders.json.tmp'

export interface RestoreIssues {
  readonly skipped: number
  readonly reasonKeys: readonly RestoreIssueReason[]
  readonly backupPath: HostPath | null
}

export interface LoadResult {
  readonly folders: readonly WorkspaceFolder[]
  readonly issues: RestoreIssues
}

export interface FolderStore {
  /** 読み戻す。**起動に失敗させない** — 読めた分を返し、残りを件数と理由で報告する。 */
  load(): Promise<LoadResult>
  /** 書き込む。atomic 置換。 */
  save(folders: readonly WorkspaceFolder[]): Promise<void>
}

/**
 * @param userDataDir ユーザデータディレクトリ。**`app.getPath('userData')` の値を
 *   composition root が解決して渡す。** ここで `electron` を触らない。
 * @param now 退避ファイル名に使う時刻。試験可能にするため注入する。
 */
export function createFolderStore(userDataDir: HostPath, now: () => number): FolderStore {
  function filePath(): HostPath {
    const result = hostPathOps.join(userDataDir, FILE_NAME)
    if (!result.ok) throw new Error('ユーザデータのパスが不正 (保存先を組み立てられない)')
    return result.path
  }

  function tempPath(): HostPath {
    const result = hostPathOps.join(userDataDir, TEMP_NAME)
    if (!result.ok) throw new Error('ユーザデータのパスが不正 (一時ファイルを組み立てられない)')
    return result.path
  }

  function backupPathFor(stamp: number): HostPath {
    const result = hostPathOps.join(userDataDir, `${FILE_NAME}.${stamp}.bak`)
    if (!result.ok) throw new Error('ユーザデータのパスが不正 (退避先を組み立てられない)')
    return result.path
  }

  /**
   * 退避する。**上書き前に行い、完了するまで置換しない** (FR-019)。
   * 退避に失敗したら例外を投げる — 黙って進むと元ファイルを失う。
   */
  async function backup(raw: string): Promise<HostPath> {
    const target = backupPathFor(now())
    await writeFile(target.value, raw, 'utf8')
    return target
  }

  return {
    async load(): Promise<LoadResult> {
      let raw: string
      try {
        raw = await readFile(filePath().value, 'utf8')
      } catch {
        // 未作成は「空」であって失敗ではない。
        return { folders: [], issues: { skipped: 0, reasonKeys: [], backupPath: null } }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        // **全件を失う経路なので必ず退避する。**
        const backupPath = await backup(raw)
        return {
          folders: [],
          issues: { skipped: 1, reasonKeys: ['parse-failed'], backupPath }
        }
      }

      if (typeof parsed !== 'object' || parsed === null) {
        const backupPath = await backup(raw)
        return {
          folders: [],
          issues: { skipped: 1, reasonKeys: ['parse-failed'], backupPath }
        }
      }

      const root = parsed as Record<string, unknown>
      if (root.schemaVersion !== SCHEMA_VERSION) {
        /*
         * **未知の版は読まない。** 将来バージョンのファイルを旧バージョンで開いた場合、
         * 退避せずに上書きすると全件を失う (FR-019)。
         */
        const backupPath = await backup(raw)
        return {
          folders: [],
          issues: { skipped: 1, reasonKeys: ['schema-version-unknown'], backupPath }
        }
      }

      const rawFolders = Array.isArray(root.folders) ? root.folders : []
      const folders: WorkspaceFolder[] = []
      const reasons = new Set<RestoreIssueReason>()
      let skipped = 0

      for (const record of rawFolders) {
        const result = toFolderRecord(record)
        if (!result.ok) {
          skipped += 1
          reasons.add(result.reason)
          continue
        }
        // **`id` の一意性を要求する** — 重複すると解除や解決の対象が一意に決まらない。
        if (!isUniqueId(folders, result.folder.id)) {
          skipped += 1
          reasons.add('invalid-record')
          continue
        }
        folders.push(result.folder)
      }

      // 一部でも落ちたら退避する。**読めた分は復元する。**
      const backupPath = skipped > 0 ? await backup(raw) : null

      return {
        folders,
        issues: { skipped, reasonKeys: [...reasons], backupPath }
      }
    },

    async save(folders): Promise<void> {
      await mkdir(userDataDir.value, { recursive: true })

      const payload = JSON.stringify(
        { schemaVersion: SCHEMA_VERSION, folders: folders.map(fromFolderRecord) },
        null,
        2
      )

      // **一時ファイル + rename。** 書き込み中のクラッシュで全件を失わない。
      const temp = tempPath()
      await writeFile(temp.value, payload, 'utf8')
      await rename(temp.value, filePath().value)
    }
  }
}
