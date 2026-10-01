import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

import type { ExtraEnvPredicates } from '@domain/provider/forward-env'
import type { ProviderProfile } from '@domain/provider/types'
import { hostPathOps } from '@domain/runtime/path-api'
import type { HostPath } from '@domain/runtime/path-types'

import {
  fromProviderRecord,
  SCHEMA_VERSION,
  toProviderRecord,
  type ProviderRecordIssue
} from './provider-record'

/**
 * `ProviderProfile` の JSON 永続化 (BE-004 / contracts C-1)。folder-store.ts と同じ構え。
 *
 * **`electron` を import しない** (userDataDir は composition root が引数で渡す。AD-023 §8)。
 * **秘密の実体を持たない** (Principle V) — 秘密は `safeStorage` (infra/secrets)、本ストアは参照値のみ。
 * 書き込みは一時ファイル + rename の atomic 置換。**同一 backend 複数登録**は `id` で識別する (FR-001)。
 * **全件を失う経路 (parse 失敗 / 未知スキーマ版 / 一部破損) は上書き前に必ず退避する** (folder-store FR-019 と同型。
 * DB-H-001)。退避しないと、破損 or 将来版ファイルを開いた後の save() が既存 Provider を復旧不能に消す。
 */

const FILE_NAME = 'providers.json'

/** load 段の理由 (レコード単位の `ProviderRecordIssue` に、ファイル単位の失敗を足した superset。DB-M-001)。 */
export type ProviderLoadIssue = ProviderRecordIssue | 'parse-failed' | 'schema-version-unknown'

export interface ProviderLoadResult {
  readonly profiles: readonly ProviderProfile[]
  /**
   * 退避して読み込まなかった数。レコード単位の skip ではレコード数だが、**ファイル単位の失敗
   * (`parse-failed` / `schema-version-unknown`) では中のレコード数に関わらず 1** になる
   * (件数として表示しない。pr-gate R2 database M-401)。
   */
  readonly skipped: number
  readonly reasonKeys: readonly ProviderLoadIssue[]
  /** 退避した場合の退避先 (`.bak`)。退避が無ければ null。 */
  readonly backupPath: HostPath | null
}

export interface ProviderStore {
  load(): Promise<ProviderLoadResult>
  save(profiles: readonly ProviderProfile[]): Promise<void>
}

/**
 * @param now 退避ファイル名に使う時刻 (試験可能にするため注入。folder-store と同じ)。
 * @param preds extraEnv の read 側述語 (composition root が注入。IPC と同じ実体。pr-gate R1 platform-boundary M-302)。
 */
export function createProviderStore(
  userDataDir: HostPath,
  now: () => number,
  preds: ExtraEnvPredicates
): ProviderStore {
  // 一意な temp 名に使う連番 (DB-P-M02)。固定名を共有すると並行 save が同じ temp を壊す。
  let saveSeq = 0

  function pathFor(name: string): HostPath {
    const result = hostPathOps.join(userDataDir, name)
    if (!result.ok)
      throw new Error('ユーザデータのパスが不正 (provider ストアの保存先を組み立てられない)')
    return result.path
  }

  /**
   * 退避する。**上書き前に行い、完了するまで置換しない** (FR-019 と同型)。
   * 退避に失敗したら例外を投げる — 黙って進むと元ファイルを失う。
   */
  async function backup(raw: string): Promise<HostPath> {
    const target = pathFor(`${FILE_NAME}.${now()}.bak`)
    await writeFile(target.value, raw, 'utf8')
    return target
  }

  return {
    async load(): Promise<ProviderLoadResult> {
      let raw: string
      try {
        raw = await readFile(pathFor(FILE_NAME).value, 'utf8')
      } catch {
        // 未作成は「空」であって失敗ではない。
        return { profiles: [], skipped: 0, reasonKeys: [], backupPath: null }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        // **全件を失う経路なので必ず退避する。**
        const backupPath = await backup(raw)
        return { profiles: [], skipped: 1, reasonKeys: ['parse-failed'], backupPath }
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        const backupPath = await backup(raw)
        return { profiles: [], skipped: 1, reasonKeys: ['parse-failed'], backupPath }
      }

      const root = parsed as Record<string, unknown>
      // **未知の版は読まない。** 将来版ファイルを旧版で開いた場合、退避せず上書きすると全件を失う。
      // 「将来版」は数値で現行より大きいときだけ。欠落・非数値・0 以下などは壊れたファイルとして扱う
      // (preset-store と同型。pr-gate R3 database M-501)。
      if (typeof root.schemaVersion === 'number' && root.schemaVersion > SCHEMA_VERSION) {
        const backupPath = await backup(raw)
        return { profiles: [], skipped: 1, reasonKeys: ['schema-version-unknown'], backupPath }
      }
      if (root.schemaVersion !== SCHEMA_VERSION) {
        const backupPath = await backup(raw)
        return { profiles: [], skipped: 1, reasonKeys: ['parse-failed'], backupPath }
      }

      // `providers` が配列でない root (キー欠落を含む) は壊れたファイルとして退避する
      // (空として読むと次の save が原文を消す。pr-gate R3 database M-502)。
      if (!Array.isArray(root.providers)) {
        const backupPath = await backup(raw)
        return { profiles: [], skipped: 1, reasonKeys: ['parse-failed'], backupPath }
      }
      const rawProfiles: readonly unknown[] = root.providers
      const profiles: ProviderProfile[] = []
      const reasons = new Set<ProviderLoadIssue>()
      const seenIds = new Set<string>()
      let skipped = 0

      for (const record of rawProfiles) {
        const result = toProviderRecord(record, preds)
        if (!result.ok) {
          skipped += 1
          reasons.add(result.reason)
          continue
        }
        // **`id` の一意性を要求する** — 重複すると編集/削除の対象が一意に決まらない。
        if (seenIds.has(result.profile.id)) {
          skipped += 1
          reasons.add('invalid-record')
          continue
        }
        seenIds.add(result.profile.id)
        profiles.push(result.profile)
      }

      // 一部でも落ちたら退避する。**読めた分は復元する。**
      const backupPath = skipped > 0 ? await backup(raw) : null
      return { profiles, skipped, reasonKeys: [...reasons], backupPath }
    },

    async save(profiles): Promise<void> {
      await mkdir(userDataDir.value, { recursive: true })
      const payload = JSON.stringify(
        { schemaVersion: SCHEMA_VERSION, providers: profiles.map(fromProviderRecord) },
        null,
        2
      )
      // **temp 名を一意化する** — 固定名を共有すると並行 save が同じ temp へ書き込み内容が混ざり
      // corrupt を rename しうる (DB-P-M02)。now() + 連番でプロセス内の save を必ず分ける。
      saveSeq += 1
      const temp = pathFor(`${FILE_NAME}.${now()}.${saveSeq}.tmp`)
      await writeFile(temp.value, payload, 'utf8')
      await rename(temp.value, pathFor(FILE_NAME).value)
    }
  }
}
