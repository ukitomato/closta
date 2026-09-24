import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk'

import { toTranscriptMessages, type SessionMessageLike } from '@domain/session/transcript'
import type { TranscriptFrameDTO } from '@domain/session/transcript-dto'

/**
 * transcript 取得の **専用短命プロセス** (R-3 / [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) 決定 1・2)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **Agent SDK を呼ぶ場所。`getSessionMessages()` のみ** (読み取り専用) | Principle IV / FR-002 / C-1 |
 * | `CLAUDE_CONFIG_DIR` は **spawn 時に env で固定**される。ここでは読まない | AD-034 決定 2 / C-2 |
 * | **本文は転送された `MessagePort` で renderer へ直送**。main は本文を持たない | Principle IX / AD-034 決定 1 / C-3 |
 * | **`electron` / ネイティブモジュールを import しない**。`parentPort` は構造的に取り出す | Principle VII / AD-010 |
 * | **パス値に一切触らない** (受け取った sessionId を SDK に渡すだけ) | `UNC_FORBIDDEN_IN` |
 * | 書き込み系 SDK API を呼ばない | FR-001 |
 *
 * **列挙プロセス (`enumerate-sessions.ts`) の常駐・共有可変 env に相乗りしない** (AD-034 決定 2)。
 * こちらは 1 要求ごとに起こされ、env が spawn 時に固定されているため env レースが構造的に無い。
 *
 * **入口の `MessagePort` transfer は `transport.ts` の `parentPort` 取り出しと同じ構造アクセス**で受ける
 * (`electron` を import すると Principle VII を破り、単独読込もできなくなる)。
 */

interface TranscriptPortLike {
  postMessage(message: unknown): void
  start?(): void
  close?(): void
}

interface ParentMessage {
  readonly data: unknown
  readonly ports: readonly TranscriptPortLike[]
}

interface TranscriptParentPort {
  on(event: 'message', listener: (message: ParentMessage) => void): void
  once?(event: 'message', listener: (message: ParentMessage) => void): void
  start?(): void
}

function parentPortOf(): TranscriptParentPort | null {
  // `process.parentPort` は utilityProcess にだけ在る。Electron の有無を見ているのであって
  // OS 分岐ではない (項目8 の platform 分岐検査の対象式ではないので platform-ok 注記は付けない)。
  const candidate = (process as unknown as { parentPort?: TranscriptParentPort }).parentPort
  return candidate ?? null
}

interface TranscriptRequest {
  readonly sessionId: string
  readonly requestToken: string
}

function decodeRequest(data: unknown): TranscriptRequest | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (typeof record.sessionId !== 'string' || record.sessionId.length === 0) return null
  if (typeof record.requestToken !== 'string' || record.requestToken.length === 0) return null
  return { sessionId: record.sessionId, requestToken: record.requestToken }
}

/**
 * 1 セッション分を取得し、変換して port に流す。
 *
 * **失敗は理由キーの frame にする** — 例外に本文断片を載せない (C-7 / CWE-532)。
 */
async function run(request: TranscriptRequest, port: TranscriptPortLike): Promise<void> {
  let frame: TranscriptFrameDTO
  try {
    const messages = await getSessionMessages(request.sessionId, { includeSystemMessages: true })
    frame = {
      kind: 'messages',
      requestToken: request.requestToken,
      messages: toTranscriptMessages(messages as readonly SessionMessageLike[])
    }
  } catch {
    frame = {
      kind: 'error',
      requestToken: request.requestToken,
      reasonKey: 'transcript-read-failed'
    }
  }
  port.postMessage(frame)
  port.close?.()
  process.exitCode = 0
}

function main(): void {
  const parentPort = parentPortOf()
  /*
   * **本 feature は Electron 下でのみ動く。** `parentPort` が無い経路 (素の `node` 起動) では
   * transfer された port を受け取れないため、何もしない (単独診断の余地は残すが応答しない)。
   */
  if (parentPort === null) return

  const handler = (message: ParentMessage): void => {
    const request = decodeRequest(message.data)
    const port = message.ports[0] ?? null
    if (request === null || port === null) {
      process.exitCode = 1
      return
    }
    port.start?.()
    void run(request, port)
  }

  // **1 要求 = 1 プロセス。** 最初の 1 件だけを処理する。
  if (parentPort.once) parentPort.once('message', handler)
  else parentPort.on('message', handler)
  parentPort.start?.()
}

main()
