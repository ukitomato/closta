import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import { isSameNamespace, type RuntimeNamespaceId } from '@domain/runtime/namespace'
import { resolveConfigDirPath } from '@domain/provider/helper-path'
import type { ProviderProfile } from '@domain/provider/types'
import type { ResolveFolderRuntime } from '@domain/session/match'
import type { CwdOrigin } from '@domain/session/origin'
import { resolvePastResumeAxes, type PastResumeAxes } from '@domain/session/resume-axes'
import type { ResumeUnavailableReason, SessionResumeRequest } from '@domain/session/resume'
import type { EnumerationTarget } from '@domain/session/target'
import { locationNamespace, type WorkspaceFolder } from '@domain/workspace/folder'

import type { SessionLaunchConfig } from '@domain/session/launch-config'

import type {
  ConversationRecord,
  ResolvedResume,
  ResumeOutcome
} from './session-launch-service'
import type { TranscriptResult } from './transcript-service'

/**
 * 再開の調停 (X-9 / data-model §3.2 / §4 / §5 / §8.1)。**状態を持たない。**
 * I/O (列挙のキャッシュ・登録フォルダ・ランタイム・Provider の一覧・対応づけ) は注入で受ける。
 * 会話の id・パスをログに出さない。
 */

export interface ResumeServiceDeps {
  /** 列挙のキャッシュの参照だけ (`SessionService.pastResumeSource`)。列挙をやり直さない。 */
  readonly pastResumeSource: (
    targetKey: string,
    conversationId: string
  ) => { readonly target: EnumerationTarget; readonly origin: CwdOrigin } | null
  readonly folders: () => readonly WorkspaceFolder[]
  readonly runtimes: () => readonly RuntimeDescriptor[]
  readonly providers: () => Promise<readonly ProviderProfile[]>
  readonly resolve: ResolveFolderRuntime
  /** 今の列挙対象 (`SessionService.enumerationTargets`)。稼働中の行の読む対象を決める (data-model §8.1)。 */
  readonly enumerationTargets: () => readonly EnumerationTarget[]
  /** 再開の起動 (`SessionLaunchService.resume`)。 */
  readonly launchResume: (
    config: SessionLaunchConfig,
    resolved: ResolvedResume
  ) => Promise<ResumeOutcome>
  /** 稼働中の行の退避の表の引き当て (`SessionLaunchService.conversationRecord`)。 */
  readonly conversationRecord: (sessionId: string) => ConversationRecord | null
  /** 今の transcript 取得 (AD-034 の経路。`TranscriptService.getTranscript`)。 */
  readonly getTranscript: (
    conversationId: string,
    targetKey: string,
    requestToken: string
  ) => Promise<TranscriptResult>
}

export type ResumeResolution =
  | { readonly ok: true; readonly resolved: ResolvedResume }
  | { readonly ok: false; readonly reason: ResumeUnavailableReason | 'invalid-config' }

export interface ResumeService {
  /** 過去の行の軸を決める (C-1)。知らない行は `source-unknown`。 */
  resolvePast(targetKey: string, conversationId: string): Promise<PastResumeAxes>
  /** 要求の source から会話の id と 3 軸を解き、`config` の 3 軸と照合する (data-model §4)。 */
  resolveResumeSource(request: SessionResumeRequest): Promise<ResumeResolution>
  /** それまでの会話を読む列挙対象 (data-model §8.1)。決まらなければ `null`。 */
  resumedTranscriptTarget(record: ConversationRecord): string | null
  /** 再開の要求を解いて起動する (data-model §5 の 2〜3 と 4〜9)。 */
  resume(request: SessionResumeRequest): Promise<ResumeOutcome>
  /**
   * それまでの会話の読み取り (C-3)。知らない `sessionId`・会話の id を持たない行・対象が決まらない行は
   * `transcript-read-failed`。
   */
  getResumedTranscript(sessionId: string, requestToken: string): Promise<TranscriptResult>
}

export function createResumeService(deps: ResumeServiceDeps): ResumeService {
  async function resolvePast(targetKey: string, conversationId: string): Promise<PastResumeAxes> {
    const source = deps.pastResumeSource(targetKey, conversationId)
    if (source === null) return { ok: false, reason: 'source-unknown' }
    return resolvePastResumeAxes({
      target: source.target,
      origin: source.origin,
      folders: deps.folders(),
      runtimes: deps.runtimes(),
      providers: await deps.providers(),
      resolve: deps.resolve
    })
  }

  async function resolveResumeSource(request: SessionResumeRequest): Promise<ResumeResolution> {
    const { source, config } = request
    if (source.kind === 'past') {
      const axes = await resolvePast(source.targetKey, source.conversationId)
      if (!axes.ok) return { ok: false, reason: axes.reason }
      if (
        config.folderId !== axes.folderId ||
        config.runtimeId !== axes.runtimeId ||
        config.providerId !== axes.providerId
      ) {
        return { ok: false, reason: 'invalid-config' }
      }
      return {
        ok: true,
        resolved: {
          conversationId: source.conversationId,
          folderId: axes.folderId,
          runtimeId: axes.runtimeId,
          providerId: axes.providerId,
          targetKey: source.targetKey
        }
      }
    }
    // 稼働中の行: 退避の表のレコード (main だけが持つ)。無ければ `source-unknown` (data-model §4)。
    const record = deps.conversationRecord(source.sessionId)
    if (record === null) return { ok: false, reason: 'source-unknown' }
    if (
      config.folderId !== record.folderId ||
      config.runtimeId !== record.runtimeId ||
      config.providerId !== record.providerId
    ) {
      return { ok: false, reason: 'invalid-config' }
    }
    // 再開した行をさらに再開したときは決めた値を引き継ぐ。無ければ §8.1 で決める (読むたびに決め直さない)。
    const targetKey =
      record.targetKey ?? (await liveTranscriptTargetKey(record))
    return {
      ok: true,
      resolved: {
        conversationId: record.conversationId,
        folderId: record.folderId,
        runtimeId: record.runtimeId,
        providerId: record.providerId,
        targetKey,
        replacesSessionId: source.sessionId
      }
    }
  }

  /**
   * 稼働中の行の再開で、それまでの会話を読む列挙対象 (data-model §8.1)。決まらなければ `null`。
   * (1) 列挙のキャッシュにその会話の行を持つもの、(2) Provider の `configDir` の一致 / 既定の対象が 1 つ。
   */
  async function liveTranscriptTargetKey(record: ConversationRecord): Promise<string | null> {
    const runtimes = deps.runtimes()
    const runtime = runtimes.find((r) => isSameNamespace(r.id, record.runtimeId as RuntimeNamespaceId))
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

  function resumedTranscriptTarget(record: ConversationRecord): string | null {
    return record.targetKey
  }

  function failedTranscript(requestToken: string): TranscriptResult {
    return {
      handshake: { status: 'failed', requestToken, reasonKey: 'transcript-read-failed' },
      port: null
    }
  }

  return {
    resolvePast,
    resolveResumeSource,
    resumedTranscriptTarget,

    async resume(request): Promise<ResumeOutcome> {
      const resolution = await resolveResumeSource(request)
      if (!resolution.ok) return { status: 'rejected', reason: resolution.reason }
      return deps.launchResume(request.config, resolution.resolved)
    },

    async getResumedTranscript(sessionId, requestToken): Promise<TranscriptResult> {
      const record = deps.conversationRecord(sessionId)
      if (record === null) return failedTranscript(requestToken)
      const targetKey = resumedTranscriptTarget(record)
      if (targetKey === null) return failedTranscript(requestToken)
      return deps.getTranscript(record.conversationId, targetKey, requestToken)
    }
  }
}
