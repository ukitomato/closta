import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'

import { hostPathOps } from '@domain/runtime/path-api'
import type { HostPath } from '@domain/runtime/path-types'
import {
  EMPTY_LAUNCH_USAGE,
  LAUNCH_USAGE_SCHEMA_VERSION,
  parseLocalDayKey,
  toLaunchDayCounts,
  toLaunchUsageRecord,
  type LaunchDayCounts,
  type LaunchUsage,
  type LocalDayKey
} from '@domain/session/launch-usage'

/**
 * 起動の利用記録の JSON 永続化 (O-3 BE-041 / spec FR-011・FR-012 / 012 data-model §4)。`preset-store.ts` と同じ構え。
 *
 * **`electron` を import しない** (userDataDir は composition root が引数で渡す。AD-023 §8)。パスは `hostPathOps.join`。
 * 中身は日付と 2 つの回数だけで、書き出しは domain の `toLaunchUsageRecord` (許可したキーだけ) を通す (Principle V)。
 * 書き込みは一意な一時ファイル + rename の置き換え。失敗したら一時ファイルを消す。
 *
 * 読み込みの結果 (data-model §4 の表):
 *
 * | ファイル | 結果 |
 * |---|---|
 * | 未作成 (ENOENT) | `loaded` (空) |
 * | 最上位の形が崩れている・版が欠けている / 数値でない / 1 未満 | `.bak` に退避して `loaded` (空。`parse-failed`) |
 * | 日単位の不正 (鍵が暦日でない・値のキーが外・回数が不正) | その日だけ飛ばして `loaded`。飛ばした日があれば退避 (`invalid-day`) |
 * | 将来版 (`schemaVersion` が数値で 1 より大きい) | 退避して `newer-version` (service は書き込まない) |
 * | 読めない (ENOENT 以外) | `read-failed` (退避しない。service は次の操作で読み直す) |
 * | 退避の書き込みの失敗 | `read-failed` (`backup-failed`。原文を残したまま書き込まない) |
 *
 * 結果は理由キーと errno のコードだけを持つ (パス・値を持たない)。ログは service が出す。
 */

const FILE_NAME = 'launch-usage.json'

/** 読めたが直したもの。 */
export type LaunchUsageLoadIssue = 'parse-failed' | 'invalid-day'

export type LaunchUsageLoadResult =
  | {
      readonly kind: 'loaded'
      readonly usage: LaunchUsage
      readonly reasonKeys: readonly LaunchUsageLoadIssue[]
      /** 飛ばした日の数 (`invalid-day`)。 */
      readonly skippedDays: number
    }
  | { readonly kind: 'newer-version' }
  | {
      readonly kind: 'read-failed'
      readonly reasonKey: 'read-failed' | 'backup-failed'
      /** errno のコード (例: `EBUSY`) だけ。パスやメッセージは持たない (Principle V)。 */
      readonly errorCode?: string
    }

export interface LaunchUsageStore {
  load(): Promise<LaunchUsageLoadResult>
  save(usage: LaunchUsage): Promise<void>
}

/** 差し替え可能な fs 操作 (失敗の経路のテスト用。省略したものは `node:fs/promises`)。 */
export interface LaunchUsageStoreFs {
  readonly readFile?: (path: string, encoding: 'utf8') => Promise<string>
  /** 一時ファイルと退避 (`.bak`) の書き込み。 */
  readonly writeFile?: (path: string, data: string, encoding: 'utf8') => Promise<void>
  readonly rename?: (from: string, to: string) => Promise<void>
  /** 失敗したときの一時ファイルの削除。 */
  readonly rm?: (path: string, options: { force: boolean }) => Promise<void>
  readonly mkdir?: (path: string, options: { recursive: true }) => Promise<unknown>
}

const DEFAULT_FS: Required<LaunchUsageStoreFs> = { readFile, writeFile, rename, rm, mkdir }

/** errno コードの形 (`EBUSY` など) のときだけ返す。それ以外は出さない。 */
function errnoCode(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code) ? code : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loaded(
  usage: LaunchUsage,
  reasonKeys: readonly LaunchUsageLoadIssue[],
  skippedDays: number
): LaunchUsageLoadResult {
  return { kind: 'loaded', usage, reasonKeys, skippedDays }
}

export function createLaunchUsageStore(
  userDataDir: HostPath,
  now: () => number,
  injectedFs: LaunchUsageStoreFs = DEFAULT_FS
): LaunchUsageStore {
  const fs: Required<LaunchUsageStoreFs> = { ...DEFAULT_FS, ...injectedFs }
  let saveSeq = 0

  function pathFor(name: string): HostPath {
    const result = hostPathOps.join(userDataDir, name)
    if (!result.ok)
      throw new Error('ユーザデータのパスが不正 (起動の利用記録の保存先を組み立てられない)')
    return result.path
  }

  /**
   * 原文を `.bak` に退避してから `result` を返す。退避に失敗したら読み込みを失敗として扱う
   * (退避できないまま空や一部で上書きすると原文を失う)。
   */
  async function backupThen(
    raw: string,
    result: LaunchUsageLoadResult
  ): Promise<LaunchUsageLoadResult> {
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
    async load(): Promise<LaunchUsageLoadResult> {
      let raw: string
      try {
        raw = await fs.readFile(pathFor(FILE_NAME).value, 'utf8')
      } catch (error) {
        // 空に倒すのは未作成のときだけ。それ以外を空にすると次の書き込みが原文を消す。
        const code = errnoCode(error)
        if (code === 'ENOENT') return loaded(EMPTY_LAUNCH_USAGE, [], 0)
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
        return backupThen(raw, loaded(EMPTY_LAUNCH_USAGE, ['parse-failed'], 0))
      }
      if (!isPlainObject(parsed)) {
        return backupThen(raw, loaded(EMPTY_LAUNCH_USAGE, ['parse-failed'], 0))
      }

      // 「将来版」は数値で現行より大きいときだけ。欠落・非数値・1 未満は壊れたファイルとして扱う (preset-store と同じ)。
      const version = parsed.schemaVersion
      if (typeof version === 'number' && version > LAUNCH_USAGE_SCHEMA_VERSION) {
        return backupThen(raw, { kind: 'newer-version' })
      }
      if (version !== LAUNCH_USAGE_SCHEMA_VERSION || !isPlainObject(parsed.days)) {
        return backupThen(raw, loaded(EMPTY_LAUNCH_USAGE, ['parse-failed'], 0))
      }

      const days = new Map<LocalDayKey, LaunchDayCounts>()
      let skipped = 0
      for (const [rawKey, rawCounts] of Object.entries(parsed.days)) {
        const key = parseLocalDayKey(rawKey)
        const counts = toLaunchDayCounts(rawCounts)
        if (key === null || counts === null) {
          skipped += 1
          continue
        }
        days.set(key, counts)
      }
      const usage: LaunchUsage = { days }
      if (skipped > 0) return backupThen(raw, loaded(usage, ['invalid-day'], skipped))
      return loaded(usage, [], 0)
    },

    async save(usage): Promise<void> {
      await fs.mkdir(userDataDir.value, { recursive: true })
      const payload = JSON.stringify(toLaunchUsageRecord(usage), null, 2)
      saveSeq += 1
      const temp = pathFor(`${FILE_NAME}.${now()}.${saveSeq}.tmp`)
      try {
        // writeFile (途中まで書けた temp) と rename (Windows の EPERM / EBUSY など) のどちらが失敗しても
        // 一時ファイルを残さない (preset-store と同じ)。
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
