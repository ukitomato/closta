import { renameSession } from '@anthropic-ai/claude-agent-sdk'

import { normalizeSessionName } from '@domain/session/live-settings'
import { isValidSessionId } from '@domain/validation'

/**
 * セッションの名前を付ける **専用短命プロセス** (023 / [AD-062](../../docs/decisions/0062-live-session-permission-mode-model-and-rename.md) Decision 4)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **Agent SDK を呼ぶ場所。`renameSession()` のみ** (transcript に custom-title を追記する。呼べるのは本ファイルだけ) | Principle IV / AD-062 Decision 4 |
 * | `CLAUDE_CONFIG_DIR` は **spawn 時に env で固定**される。ここでは読まない。`dir` は渡さない | AD-034 決定 2 |
 * | 受け取りは `process.parentPort` の 1 通だけ。形が外れたら SDK を呼ばず `{ ok: false }` | read-transcript.ts と同じ形 |
 * | 例外の文字列を返さない・ログに名前と会話の id を出さない | CWE-532 |
 * | `electron` を import しない。`parentPort` は構造的に取り出す | Principle VII |
 *
 * 1 要求 = 1 プロセス。最初の 1 件だけを処理する。
 */

interface RenameParentMessage {
  readonly data: unknown
}

interface RenameParentPort {
  on(event: 'message', listener: (message: RenameParentMessage) => void): void
  once?(event: 'message', listener: (message: RenameParentMessage) => void): void
  postMessage(message: unknown): void
  start?(): void
}

function parentPortOf(): RenameParentPort | null {
  // `process.parentPort` は utilityProcess にだけ在る。Electron の有無を見ているのであって OS 分岐ではない。
  const candidate = (process as unknown as { parentPort?: RenameParentPort }).parentPort
  return candidate ?? null
}

interface RenameRequest {
  readonly conversationId: string
  readonly name: string
}

/** 形の検査。`name` は規則を通した値 (trim 済み) と一致しなければ外れ。キーが足りない・余分なら外れ。 */
export function decodeRenameRequest(data: unknown): RenameRequest | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const keys = Object.keys(data)
  if (keys.length !== 2 || !keys.includes('conversationId') || !keys.includes('name')) return null
  const record = data as Record<string, unknown>
  if (!isValidSessionId(record.conversationId)) return null
  if (typeof record.name !== 'string') return null
  const normalized = normalizeSessionName(record.name)
  if (normalized === null || normalized !== record.name) return null
  return { conversationId: record.conversationId, name: record.name }
}

/** 1 件を処理して結果を返す。失敗の文字列は返さない。 */
export async function run(data: unknown): Promise<{ ok: boolean }> {
  const request = decodeRenameRequest(data)
  if (request === null) return { ok: false }
  try {
    await renameSession(request.conversationId, request.name)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

function main(): void {
  const parentPort = parentPortOf()
  // 素の `node` 起動 (`parentPort` が無い経路) では何もしない。
  if (parentPort === null) return

  const handler = (message: RenameParentMessage): void => {
    void run(message.data).then((result) => {
      parentPort.postMessage(result)
      process.exitCode = 0
    })
  }

  // 1 要求 = 1 プロセス。最初の 1 件だけを受ける (2 通目以降は聞かない)。
  if (parentPort.once) parentPort.once('message', handler)
  else parentPort.on('message', handler)
  parentPort.start?.()
}

main()
