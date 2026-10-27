import {
  liveSettingBlocker,
  normalizeSessionName,
  type LiveSettingKind,
  type LiveSettingRow,
  type RenameResult
} from '@domain/session/live-settings'

import type { RenameSpawnRequest, RenameSpawnResult } from './rename-spawner'
import type { ConversationRecord } from './session-launch-service'
import type { TranscriptTargetResolution } from './transcript-service'

/**
 * 実行中のセッションの改名の調停 (023 / data-model §6.1 / contracts C-3 / C-5 / [AD-062](../../../docs/decisions/0062-live-session-permission-mode-model-and-rename.md) Decision 4)。
 *
 * **状態を持たない。** 行の状態・変更中の印・名前・会話の退避の表・列挙対象の解決・子の起動は注入で受ける。
 * 名前・会話の id・config ディレクトリをログに出さない (成功と失敗の 2 行だけ)。`process.platform` を見ない (Principle II)。
 */

export interface SessionRenameServiceDeps {
  readonly liveSettingRow: (sessionId: string) => LiveSettingRow | null
  readonly beginChange: (sessionId: string, kind: LiveSettingKind) => boolean
  readonly endChange: (sessionId: string, kind: LiveSettingKind) => void
  readonly setName: (sessionId: string, name: string) => void
  readonly conversationRecord: (sessionId: string) => ConversationRecord | null
  /** レコードの `targetKey` が無いときの列挙対象の決め方 (`resolveLiveTranscriptTarget`)。決まらなければ `null`。 */
  readonly resolveTarget: (record: ConversationRecord) => Promise<string | null>
  /** `targetKey` → config ディレクトリ env と起動ゲート (`SessionService.transcriptTarget`)。 */
  readonly transcriptTarget: (targetKey: string) => Promise<TranscriptTargetResolution>
  /** config ディレクトリ env を固定した環境変数 (`buildTranscriptEnv`)。 */
  readonly buildEnv: (configDirEnv: string) => Record<string, string>
  /** 改名の子の起動 (`RenameSpawner.run`)。 */
  readonly spawnRename: (
    env: Record<string, string>,
    request: RenameSpawnRequest
  ) => Promise<RenameSpawnResult>
  readonly log: (line: string) => void
}

export interface SessionRenameService {
  /** `name` は検証前の値でもよい (規則を通らなければ `invalid-value`)。 */
  rename(sessionId: string, name: string): Promise<RenameResult>
}

export function createSessionRenameService(deps: SessionRenameServiceDeps): SessionRenameService {
  async function write(sessionId: string, name: string): Promise<RenameResult> {
    const record = deps.conversationRecord(sessionId)
    if (record === null) return { ok: false, reason: 'write-failed' }
    const targetKey = record.targetKey ?? (await deps.resolveTarget(record))
    if (targetKey === null) return { ok: false, reason: 'write-failed' }
    const resolution = await deps.transcriptTarget(targetKey)
    if (resolution === null || !resolution.ok) return { ok: false, reason: 'write-failed' }
    const result = await deps.spawnRename(deps.buildEnv(resolution.configDirEnv), {
      conversationId: record.conversationId,
      name
    })
    if (!result.ok) return { ok: false, reason: 'write-failed' }
    deps.setName(sessionId, name)
    return { ok: true, name }
  }

  return {
    async rename(sessionId, rawName): Promise<RenameResult> {
      const name = normalizeSessionName(rawName)
      if (name === null) return { ok: false, reason: 'invalid-value' }
      const row = deps.liveSettingRow(sessionId)
      if (row === null) return { ok: false, reason: 'unknown-session' }
      const blocker = liveSettingBlocker('name', row)
      if (blocker !== null) return { ok: false, reason: blocker }
      if (!deps.beginChange(sessionId, 'name')) return { ok: false, reason: 'busy' }

      let result: RenameResult
      try {
        result = await write(sessionId, name)
      } catch {
        result = { ok: false, reason: 'write-failed' }
      } finally {
        // どの結果でも変更中の印を戻し、保留したプロンプトを届いた順に送る (data-model §4.3)。
        deps.endChange(sessionId, 'name')
      }
      deps.log(result.ok ? '[session] rename ok' : '[session] rename failed')
      return result
    }
  }
}
