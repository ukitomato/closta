import {
  hasControlCharacter,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PATH_VALUE_LENGTH
} from '@domain/validation'
import { isValidDistroName } from '@domain/runtime/namespace'
import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'
import {
  isNamespaceConsistent,
  type Location,
  type WorkspaceFolder
} from '@domain/workspace/folder'
import { isValidFolderId } from '@domain/workspace/registry'
import type { RestoreIssueReason } from '@domain/workspace/dto'

/**
 * 永続化レコードの検証 (BE-044 / contracts/workspace-store.md)。
 *
 * **allow-list はキー名の許可であって値の検証ではない。**
 * 未知のキーを落とすだけでは、既知のキーに任意の値が入ったレコードが
 * そのまま IPC と UI に流れる。キー名と値を別に検査する。
 *
 * **`electron` を import しない。** ユーザデータディレクトリのパスは
 * 呼び出し元 (`app` の composition root) が引数で渡す (FR-038 / AD-023 §8)。
 */

/** 保存するキーの allow-list。**未知のキーは読み書きのどちらでも通さない。** */
const RECORD_KEYS = ['id', 'location', 'path', 'displayName', 'registeredAt'] as const

/** R-1 のスキーマ版。 */
export const SCHEMA_VERSION = 1

/*
 * **述語と上限は `domain` の 1 箇所から取る。**
 * IPC 境界 (`app/validate.ts`) と**同じ値**であることが要件である
 * (粒度がずれると片方だけ通過する。`isNamespaceConsistent()` と同じ理屈)。
 */

export type RecordResult =
  | { readonly ok: true; readonly folder: WorkspaceFolder }
  | { readonly ok: false; readonly reason: RestoreIssueReason }

function invalid(reason: RestoreIssueReason): RecordResult {
  return { ok: false, reason }
}

/** 所在を復元する。**既知の形式でなければ `invalid-record`。** */
function toLocation(value: unknown): Location | null {
  if (typeof value !== 'object' || value === null) return null
  const l = value as Record<string, unknown>
  if (l.kind === 'windows') return { kind: 'windows' }
  if (l.kind === 'wsl') {
    if (typeof l.distroName !== 'string') return null
    // **文字種制約は data-model §4 と同じ関数で判定する。**
    if (!isValidDistroName(l.distroName)) return null
    return { kind: 'wsl', distroName: l.distroName }
  }
  return null
}

/**
 * 1 レコードを検証して `WorkspaceFolder` にする。
 *
 * **所在から型を復元する際は名前空間の照合を通してから行う** —
 * 一律に片方の型を当てると、所在が WSL のエントリがホスト名前空間の型として復元される。
 * これは型検査では検出できない (JSON からの値は `unknown` である)。
 */
export function toFolderRecord(value: unknown): RecordResult {
  if (typeof value !== 'object' || value === null) return invalid('invalid-record')
  const r = value as Record<string, unknown>

  // キー名の allow-list。未知のキーを含むレコードは通さない。
  for (const key of Object.keys(r)) {
    if (!(RECORD_KEYS as readonly string[]).includes(key)) return invalid('invalid-record')
  }

  if (!isValidFolderId(r.id)) return invalid('invalid-record')

  if (
    typeof r.displayName !== 'string' ||
    r.displayName.length === 0 ||
    r.displayName.length > MAX_DISPLAY_NAME_LENGTH ||
    hasControlCharacter(r.displayName)
  ) {
    return invalid('invalid-record')
  }

  if (typeof r.registeredAt !== 'number' || !Number.isFinite(r.registeredAt)) {
    return invalid('invalid-record')
  }

  const location = toLocation(r.location)
  if (location === null) return invalid('invalid-record')

  if (typeof r.path !== 'object' || r.path === null) return invalid('invalid-path')
  const rawPath = r.path as Record<string, unknown>
  if (typeof rawPath.namespace !== 'string' || typeof rawPath.value !== 'string') {
    return invalid('invalid-path')
  }
  if (rawPath.value.length === 0 || rawPath.value.length > MAX_PATH_VALUE_LENGTH) {
    return invalid('invalid-path')
  }
  if (hasControlCharacter(rawPath.value)) return invalid('invalid-path')

  /*
   * **名前空間の照合を先に通す。** 所在の種別だけが一致してディストロ名が違う
   * レコードをここで落とす (contracts/workspace-store.md)。
   */
  if (!isNamespaceConsistent(location, { namespace: rawPath.namespace })) {
    return invalid('namespace-mismatch')
  }

  const base = {
    id: r.id,
    displayName: r.displayName,
    registeredAt: r.registeredAt
  }

  if (location.kind === 'windows') {
    const path = makeHostPath(rawPath.value)
    if (!path.ok) return invalid('invalid-path')
    return { ok: true, folder: { ...base, location, path: path.path } }
  }

  /*
   * ランタイム名前空間の値は**バックスラッシュを成分に含まない**。
   * `makeRuntimePath` がこれを拒否する — POSIX 意味論では `\` は通常の文字であり、
   * 含んだまま UNC へ変換すると字面と別の位置に解決される。
   */
  const path = makeRuntimePath(`wsl:${location.distroName}`, rawPath.value)
  if (!path.ok) return invalid('invalid-path')
  return { ok: true, folder: { ...base, location, path: path.path } }
}

/** 保存する形へ落とす。**allow-list のキーだけを出す。** */
export function fromFolderRecord(folder: WorkspaceFolder): Record<string, unknown> {
  return {
    id: folder.id,
    location:
      folder.location.kind === 'windows'
        ? { kind: 'windows' }
        : { kind: 'wsl', distroName: folder.location.distroName },
    // **`PathDTO` と同じ形で保存する。** 素の文字列で保存しない。
    path: { namespace: folder.path.namespace, value: folder.path.value },
    displayName: folder.displayName,
    registeredAt: folder.registeredAt
    /*
     * `reachability` は**保存しない** — 起動時に判定し直す実行時の値である
     * (contracts/workspace-store.md)。保存すると停止中の状態が永続化され、
     * 起動後に誤った「到達不可」を表示する。
     */
  }
}
