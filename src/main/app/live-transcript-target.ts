import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { isSameNamespace, type RuntimeNamespaceId } from '@domain/runtime/namespace'
import { resolveConfigDirPath } from '@domain/provider/helper-path'
import type { ProviderProfile } from '@domain/provider/types'
import type { CwdOrigin } from '@domain/session/origin'
import type { EnumerationTarget } from '@domain/session/target'
import { locationNamespace } from '@domain/workspace/folder'

import type { ConversationRecord } from './session-launch-service'

/**
 * 稼働中の行の会話を読む列挙対象の決め方 (021 data-model §8.1 / 023 data-model §6.1 の 3)。
 * `resume-service.ts` から切り出した。振る舞いは変えない。I/O を持たず、注入で受けた値だけを見る。
 * 会話の id・パスをログに出さない。
 */
export interface LiveTranscriptTargetDeps {
  readonly runtimes: () => readonly RuntimeDescriptor[]
  /** 今の列挙対象 (`SessionService.enumerationTargets`)。 */
  readonly enumerationTargets: () => readonly EnumerationTarget[]
  /** 列挙のキャッシュの参照だけ (`SessionService.pastResumeSource`)。 */
  readonly pastResumeSource: (
    targetKey: string,
    conversationId: string
  ) => { readonly target: EnumerationTarget; readonly origin: CwdOrigin } | null
  readonly providers: () => Promise<readonly ProviderProfile[]>
}

/**
 * (1) 列挙のキャッシュにその会話の行を持つもの、(2) Provider の `configDir` の一致 / 既定の対象が 1 つ。
 * 決まらなければ `null`。
 */
export async function resolveLiveTranscriptTarget(
  record: ConversationRecord,
  deps: LiveTranscriptTargetDeps
): Promise<string | null> {
  const runtimes = deps.runtimes()
  const runtime = runtimes.find((r) =>
    isSameNamespace(r.id, record.runtimeId as RuntimeNamespaceId)
  )
  if (runtime === undefined) return null
  const inLocation = deps
    .enumerationTargets()
    .filter((t) => isSameNamespace(locationNamespace(t.location), runtime.id))
  const cached = inLocation.find(
    (t) => deps.pastResumeSource(t.key, record.conversationId) !== null
  )
  if (cached !== undefined) return cached.key

  const provider =
    record.providerId === null
      ? undefined
      : (await deps.providers()).find((p) => p.id === record.providerId)
  if (provider?.configDir !== undefined) {
    const resolved = resolveConfigDirPath(provider.configDir, runtime)
    if (!resolved.ok) return null
    const hit = inLocation.find(
      (t) =>
        t.configDir.namespace === resolved.path.namespace &&
        t.configDir.value === resolved.path.value
    )
    return hit?.key ?? null
  }
  const defaults = inLocation.filter((t) => t.origin === 'default')
  return defaults.length === 1 ? defaults[0].key : null
}
