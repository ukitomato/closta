import type { SessionGroupDTO } from '@domain/session/dto'

import type { FolderDraftSeed } from '@/stores/ui'

/**
 * 登録の初期値を取り出す (FE-051 / FR-026。X-9 で過去の行の「再開」の帯からも使うため切り出した)。
 *
 * **3 つが揃わないグループには導線を出さない。** 所在が決まらないものは登録できない
 * (登録には所在が要る。AD-025)。
 * 揃っているかを**値で確かめる** — 非 null アサーションで押し通すと、
 * DTO 側の `null` の意味 (所在不明) が画面で消える。
 */
export function registerSeedOf(group: SessionGroupDTO): FolderDraftSeed | null {
  if (group.kind !== 'unregistered') return null
  const { location, cwd, suggestedDisplayName } = group
  if (location === null || cwd === null || suggestedDisplayName === null) return null
  // **main が返した値をそのまま運ぶ。** renderer で組み立てない (FR-025)。
  return { location, path: cwd, suggestedDisplayName }
}
