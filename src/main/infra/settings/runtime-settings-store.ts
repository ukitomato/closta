import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'

import { hostPathOps } from '@domain/runtime/path-api'
import type { HostPath } from '@domain/runtime/path-types'
import { hasControlCharacter, MAX_PATH_VALUE_LENGTH } from '@domain/validation'

/**
 * ランタイムの設定 (Win32 の claude の場所の指定) の JSON 永続化 (X-8 BE-021 / data-model §3)。
 * `launch-usage-store.ts` と同じ構え (共通化しない)。**`electron` を import しない**。
 *
 * ファイル: `runtime-settings.json` = `{ schemaVersion: 1, win32ClaudePath: string | null }`。
 * 中身は版と 1 つのパスだけで資格情報を持たない (Principle V)。
 *
 * | ファイル | 結果 |
 * |---|---|
 * | 未作成 (ENOENT) | `loaded` (指定なし) |
 * | 最上位がオブジェクトでない・JSON でない・版が欠ける / 1 未満 / 非数値・値が不正 | `.bak` に退避して `loaded` (指定なし。`parse-failed`) |
 * | 将来版 | 退避して `newer-version` (書き込まない) |
 * | 読めない (ENOENT 以外) | `read-failed` (退避しない) |
 *
 * 結果は理由のキーと errno のコードだけを持つ (パス・値を持たない)。
 */

const FILE_NAME = 'runtime-settings.json'
export const RUNTIME_SETTINGS_SCHEMA_VERSION = 1

export type RuntimeSettingsLoadResult =
  | {
      readonly kind: 'loaded'
      readonly win32ClaudePath: string | null
      readonly reasonKeys: readonly 'parse-failed'[]
    }
  | { readonly kind: 'newer-version' }
  | {
      readonly kind: 'read-failed'
      readonly reasonKey: 'read-failed' | 'backup-failed'
      readonly errorCode?: string
    }

export interface RuntimeSettingsStore {
  load(): Promise<RuntimeSettingsLoadResult>
  /** 指定 (`null` は解除) を保存する。失敗は throw (メッセージにパスを含めない)。 */
  saveWin32ClaudePath(path: string | null): Promise<void>
}

export interface RuntimeSettingsStoreFs {
  readonly readFile?: (path: string, encoding: 'utf8') => Promise<string>
  readonly writeFile?: (path: string, data: string, encoding: 'utf8') => Promise<void>
  readonly rename?: (from: string, to: string) => Promise<void>
  readonly rm?: (path: string, options: { force: boolean }) => Promise<void>
  readonly mkdir?: (path: string, options: { recursive: true }) => Promise<unknown>
}

const DEFAULT_FS: Required<RuntimeSettingsStoreFs> = { readFile, writeFile, rename, rm, mkdir }

function errnoCode(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code) ? code : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loaded(
  win32ClaudePath: string | null,
  reasonKeys: readonly 'parse-failed'[]
): RuntimeSettingsLoadResult {
  return { kind: 'loaded', win32ClaudePath, reasonKeys }
}

export function createRuntimeSettingsStore(
  userDataDir: HostPath,
  now: () => number,
  injectedFs: RuntimeSettingsStoreFs = DEFAULT_FS
): RuntimeSettingsStore {
  const fs: Required<RuntimeSettingsStoreFs> = { ...DEFAULT_FS, ...injectedFs }
  let saveSeq = 0

  function pathFor(name: string): HostPath {
    const result = hostPathOps.join(userDataDir, name)
    if (!result.ok)
      throw new Error('ユーザデータのパスが不正 (ランタイムの設定の保存先を組み立てられない)')
    return result.path
  }

  async function backupThen(
    raw: string,
    result: RuntimeSettingsLoadResult
  ): Promise<RuntimeSettingsLoadResult> {
    try {
      await fs.writeFile(pathFor(`${FILE_NAME}.${now()}.bak`).value, raw, 'utf8')
    } catch (error) {
      const code = errnoCode(error)
      return {
        kind: 'read-failed',
        reasonKey: 'backup-failed',
        ...(code === undefined ? {} : { errorCode: code })
      }
    }
    return result
  }

  return {
    async load() {
      let raw: string
      try {
        raw = await fs.readFile(pathFor(FILE_NAME).value, 'utf8')
      } catch (error) {
        const code = errnoCode(error)
        if (code === 'ENOENT') return loaded(null, [])
        return {
          kind: 'read-failed',
          reasonKey: 'read-failed',
          ...(code === undefined ? {} : { errorCode: code })
        }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return backupThen(raw, loaded(null, ['parse-failed']))
      }
      if (!isPlainObject(parsed)) return backupThen(raw, loaded(null, ['parse-failed']))

      const version = parsed.schemaVersion
      if (typeof version === 'number' && version > RUNTIME_SETTINGS_SCHEMA_VERSION) {
        return backupThen(raw, { kind: 'newer-version' })
      }
      if (version !== RUNTIME_SETTINGS_SCHEMA_VERSION) {
        return backupThen(raw, loaded(null, ['parse-failed']))
      }

      const value = parsed.win32ClaudePath
      if (value === undefined || value === null) return loaded(null, [])
      if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value.length > MAX_PATH_VALUE_LENGTH ||
        hasControlCharacter(value)
      ) {
        return backupThen(raw, loaded(null, ['parse-failed']))
      }
      return loaded(value, [])
    },

    async saveWin32ClaudePath(path) {
      await fs.mkdir(userDataDir.value, { recursive: true })
      // 新しい版が書いたファイルは上書きしない (将来のキーを失わせない)。
      let existing: string | null = null
      try {
        existing = await fs.readFile(pathFor(FILE_NAME).value, 'utf8')
      } catch (error) {
        if (errnoCode(error) !== 'ENOENT') throw error
      }
      if (existing !== null) {
        let parsed: unknown
        try {
          parsed = JSON.parse(existing)
        } catch {
          parsed = null
        }
        if (
          isPlainObject(parsed) &&
          typeof parsed.schemaVersion === 'number' &&
          parsed.schemaVersion > RUNTIME_SETTINGS_SCHEMA_VERSION
        ) {
          throw new Error('ランタイムの設定は新しい版が書いたため上書きしない')
        }
      }
      const payload = JSON.stringify(
        { schemaVersion: RUNTIME_SETTINGS_SCHEMA_VERSION, win32ClaudePath: path },
        null,
        2
      )
      saveSeq += 1
      const temp = pathFor(`${FILE_NAME}.${now()}.${saveSeq}.tmp`)
      try {
        await fs.writeFile(temp.value, payload, 'utf8')
        await fs.rename(temp.value, pathFor(FILE_NAME).value)
      } catch (error) {
        await fs.rm(temp.value, { force: true }).catch(() => undefined)
        throw error
      }
    }
  }
}
