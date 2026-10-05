import type { EnumerationOutcomeDTO, SessionGroupDTO, SessionSummaryDTO } from '@domain/session/dto'
import type { LocationDTO } from '@domain/workspace/dto'

/**
 * 過去のセッションのグループと所在の表示 (R-2 の一覧の見出しの規則。O-7 の中央のヘッダと「概要」が共有する。
 * data-model §5)。**表示は DTO の時点で正規化済みの値だけを使う** — パスを renderer で組み立てない (FR-025)。
 */

/** 所在の表示名。**1 箇所で決める** — 選択肢の生成と絞り込みと概要が同じ文字列を使う必要がある。 */
export function locationLabelOf(location: LocationDTO): string {
  return location.kind === 'wsl' ? location.distroName : 'Windows'
}

/**
 * `targetKey` から所在を引く索引。
 *
 * **所在はセッションではなく列挙の結果が持つ。** `SessionGroupDTO` の `folder` variant は
 * `location` を持たない (登録フォルダは複数所在のセッションを含みうる) ため、
 * グループから所在は引けない。`SessionSummaryDTO.targetKey` と
 * `EnumerationOutcomeDTO.targetKey` が同じ値なので、これで行単位に引ける。
 */
export function locationIndexOf(
  outcomes: readonly EnumerationOutcomeDTO[]
): ReadonlyMap<string, string> {
  const index = new Map<string, string>()
  for (const outcome of outcomes) index.set(outcome.targetKey, locationLabelOf(outcome.location))
  return index
}

/**
 * 行が属するグループの表示 (中央のヘッダの補足と「概要」のフォルダ)。値が無ければ `null` (項目ごと出さない)。
 *
 * - folder → 登録フォルダの表示名 (引けない窓では種別名)
 * - pending → 所在
 * - unregistered → 変換済みのパスか表示用の文字列
 * - unknown → 行の表示用の文字列
 */
export function groupLabelOf(
  group: SessionGroupDTO,
  folderName: string | null,
  session: SessionSummaryDTO
): string | null {
  switch (group.kind) {
    case 'folder':
      return folderName ?? '登録フォルダ'
    case 'pending':
      return locationLabelOf(group.location)
    case 'unregistered':
      return group.cwd?.value ?? group.cwdDisplay ?? null
    case 'unknown':
      return session.cwdDisplay
  }
}
