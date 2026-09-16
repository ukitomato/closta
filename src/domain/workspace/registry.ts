import { folderKey, locationNamespace, type Location, type WorkspaceFolder } from './folder'

/**
 * 登録フォルダ集合に対する規則 (BE-042 / FR-016)。
 *
 * **純粋関数のみ。** 正規化そのものはパス API が行い、ここは
 * 正規化済みの値を前提に「一意かどうか」だけを決める。
 *
 * 正規化をここでやり直すと、パス API と 2 箇所に規則が生まれて必ず食い違う。
 * `folderKey` が `(所在, 正規化済みパス)` の組を鍵にしているのは、
 * **同じパス文字列が別の所在に存在しうる**ためである (data-model §6)。
 */

export interface DuplicateHit {
  readonly existing: WorkspaceFolder
}

/**
 * 同一の `(所在, パス)` の既存エントリを探す。
 *
 * ドライブレターの大小差と末尾セパレータの有無は**パス API の生成関数が正規化済み**なので、
 * ここでは完全一致で足りる。正規化前の値を渡すと重複を見逃す。
 */
export function findDuplicate(
  folders: readonly WorkspaceFolder[],
  candidate: WorkspaceFolder
): DuplicateHit | null {
  const key = folderKey(candidate)
  const existing = folders.find((folder) => folderKey(folder) === key)
  return existing === undefined ? null : { existing }
}

/** `id` が集合内で一意か。**永続化の復元と登録の双方が使う。** */
export function isUniqueId(folders: readonly WorkspaceFolder[], id: string): boolean {
  return !folders.some((folder) => folder.id === id)
}

/** 所在が同じエントリを集める。一覧の所在別表示と第 0 段の判定が使う。 */
export function foldersAtLocation(
  folders: readonly WorkspaceFolder[],
  location: Location
): readonly WorkspaceFolder[] {
  const target = locationNamespace(location)
  return folders.filter((folder) => locationNamespace(folder.location) === target)
}

/**
 * 識別子の形式。`wf_` + 英数字とする。
 *
 * **形式を固定するのは、永続化ファイル由来の値が `unregisterFolder(id)` や
 * `resolveFolderRuntime(folderId, ...)` の対象になるためである** (contracts/workspace-store.md)。
 */
const ID_PATTERN = /^wf_[0-9a-z]{8,32}$/

export function isValidFolderId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

/**
 * 識別子を作る。
 *
 * **乱数源を引数で受け取る。** `domain` は I/O を持たないため `crypto` を import できない
 * (AD-023 §7 / `domain-not-to-io`)。呼び出し側が `app` / `infra` で解決して渡す。
 */
export function makeFolderId(random: () => string): string {
  const suffix = random().replace(/[^0-9a-z]/g, '')
  if (suffix.length < 8) throw new Error('乱数源が短すぎる (8 文字以上の英数字が必要)')
  return `wf_${suffix.slice(0, 24)}`
}
