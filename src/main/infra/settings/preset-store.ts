import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'

import { hostPathOps } from '@domain/runtime/path-api'
import type { HostPath } from '@domain/runtime/path-types'
import { MAX_PRESETS } from '@domain/session/launch-config'
import type { Preset } from '@domain/session/preset'

import {
  fromPresetRecord,
  PRESET_SCHEMA_VERSION,
  SUPPORTED_PRESET_SCHEMA_VERSIONS,
  toPresetRecord
} from './preset-record'

/**
 * プリセットの JSON 永続化 (X-4 BE-011 / FR-009)。`provider-store.ts` と 1:1 の構え。
 *
 * **`electron` を import しない** (userDataDir は composition root が引数で渡す。AD-023 §8)。
 * **秘密の実体を持たない** (Principle V) — Provider は id 参照。
 * 書き込みは一意な一時ファイル + rename の atomic 置換。
 * **全件を失う経路 (parse 失敗 / 未知スキーマ版 / 一部破損) は上書き前に必ず退避する** (provider-store と同型)。
 */

const FILE_NAME = 'presets.json'

/**
 * `read-failed`: 未作成 (ENOENT) 以外の理由で読めなかった (EBUSY / EPERM / EACCES など)。
 * 中身を知らないまま上書きすると既存の全件を退避なしで失うので、service は mutation を拒否する (DB-4)。
 */
export type PresetLoadIssue =
  'invalid-record' | 'parse-failed' | 'schema-version-unknown' | 'read-failed'

export interface PresetLoadResult {
  readonly presets: readonly Preset[]
  readonly skipped: number
  readonly reasonKeys: readonly PresetLoadIssue[]
  readonly backupPath: HostPath | null
  /** `read-failed` のときの errno コード (例: `EBUSY`) だけ。パスやメッセージは持たない (Principle V)。 */
  readonly errorCode?: string
}

export interface PresetStore {
  load(): Promise<PresetLoadResult>
  save(presets: readonly Preset[]): Promise<void>
}

/** 差し替え可能な fs 操作 (save の失敗経路のテスト用。既定は `node:fs/promises`)。 */
export interface PresetStoreFs {
  readonly rename: (from: string, to: string) => Promise<void>
  /** 一時ファイルの書き込み (省略時は `node:fs/promises`)。 */
  readonly writeFile?: (path: string, data: string, encoding: 'utf8') => Promise<void>
  /** 失敗時の一時ファイル削除 (省略時は `node:fs/promises`)。 */
  readonly rm?: (path: string, options: { force: boolean }) => Promise<void>
}

const DEFAULT_FS: Required<PresetStoreFs> = { rename, writeFile, rm }

/** errno コードの形 (`EBUSY` など) のときだけ返す。それ以外は出さない。 */
function errnoCode(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code) ? code : undefined
}

export function createPresetStore(
  userDataDir: HostPath,
  now: () => number,
  injectedFs: PresetStoreFs = DEFAULT_FS
): PresetStore {
  const fs: Required<PresetStoreFs> = { ...DEFAULT_FS, ...injectedFs }
  let saveSeq = 0

  function pathFor(name: string): HostPath {
    const result = hostPathOps.join(userDataDir, name)
    if (!result.ok)
      throw new Error('ユーザデータのパスが不正 (preset ストアの保存先を組み立てられない)')
    return result.path
  }

  async function backup(raw: string): Promise<HostPath> {
    const target = pathFor(`${FILE_NAME}.${now()}.bak`)
    await writeFile(target.value, raw, 'utf8')
    return target
  }

  return {
    async load(): Promise<PresetLoadResult> {
      let raw: string
      try {
        raw = await readFile(pathFor(FILE_NAME).value, 'utf8')
      } catch (error) {
        // 空に倒すのは未作成のときだけ。それ以外を空にすると次の save が既存の全件を上書きする。
        const code = errnoCode(error)
        if (code === 'ENOENT') {
          return { presets: [], skipped: 0, reasonKeys: [], backupPath: null }
        }
        return {
          presets: [],
          skipped: 0,
          reasonKeys: ['read-failed'],
          backupPath: null,
          ...(code === undefined ? {} : { errorCode: code })
        }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        const backupPath = await backup(raw)
        return { presets: [], skipped: 1, reasonKeys: ['parse-failed'], backupPath }
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        const backupPath = await backup(raw)
        return { presets: [], skipped: 1, reasonKeys: ['parse-failed'], backupPath }
      }

      const root = parsed as Record<string, unknown>
      // 「将来版」は数値で現行より大きいときだけ。欠落・非数値・0 以下などは壊れたファイルとして扱う (DB L-101)。
      if (typeof root.schemaVersion === 'number' && root.schemaVersion > PRESET_SCHEMA_VERSION) {
        const backupPath = await backup(raw)
        return { presets: [], skipped: 1, reasonKeys: ['schema-version-unknown'], backupPath }
      }
      // 読める版は 1・2・3 (版 1 は新しい軸を既定で補って読み、読んだだけでは書き戻さない。024 / AD-064 Decision 4)。
      const fileVersion = (SUPPORTED_PRESET_SCHEMA_VERSIONS as readonly unknown[]).includes(
        root.schemaVersion
      )
        ? (root.schemaVersion as number)
        : null
      if (fileVersion === null) {
        const backupPath = await backup(raw)
        return { presets: [], skipped: 1, reasonKeys: ['parse-failed'], backupPath }
      }

      // `presets` が配列でない root (キー欠落を含む) は壊れたファイルとして退避する (空として読むと次の save が原文を消す)。
      if (!Array.isArray(root.presets)) {
        const backupPath = await backup(raw)
        return { presets: [], skipped: 1, reasonKeys: ['parse-failed'], backupPath }
      }
      const rawPresets: readonly unknown[] = root.presets
      const presets: Preset[] = []
      const seenIds = new Set<string>()
      const seenNames = new Set<string>()
      let skipped = 0

      for (const record of rawPresets) {
        const result = toPresetRecord(record, fileVersion)
        // id と (正規化後の) 名前の一意性を要求する。上限を超えた分も読まない。
        if (
          !result.ok ||
          seenIds.has(result.preset.id) ||
          seenNames.has(result.preset.name) ||
          presets.length >= MAX_PRESETS
        ) {
          skipped += 1
          continue
        }
        seenIds.add(result.preset.id)
        seenNames.add(result.preset.name)
        presets.push(result.preset)
      }

      const backupPath = skipped > 0 ? await backup(raw) : null
      return {
        presets,
        skipped,
        reasonKeys: skipped > 0 ? ['invalid-record'] : [],
        backupPath
      }
    },

    async save(presets): Promise<void> {
      await mkdir(userDataDir.value, { recursive: true })
      const payload = JSON.stringify(
        { schemaVersion: PRESET_SCHEMA_VERSION, presets: presets.map(fromPresetRecord) },
        null,
        2
      )
      saveSeq += 1
      const temp = pathFor(`${FILE_NAME}.${now()}.${saveSeq}.tmp`)
      try {
        // writeFile (ENOSPC 等で途中まで書けた temp) と rename (Windows の EPERM / EBUSY など) の
        // どちらが失敗しても一時ファイルを残さない (DB L-102 / pr-gate R1 database L-201)。
        await fs.writeFile(temp.value, payload, 'utf8')
        await fs.rename(temp.value, pathFor(FILE_NAME).value)
      } catch (error) {
        // 後始末の失敗で元のエラーを隠さない — rm の失敗は握り、元のエラーを必ず投げ直す。
        await fs.rm(temp.value, { force: true }).catch(() => undefined)
        throw error
      }
    }
  }
}
