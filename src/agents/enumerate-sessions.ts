import { listSessions } from '@anthropic-ai/claude-agent-sdk'
import { MAX_SESSIONS_PER_TARGET } from '@domain/validation'

import type { RawSessionRecord } from '@domain/session/interfaces'
import {
  decodeRequest,
  encodeResponse,
  errorResponse,
  okResponse,
  type EnumerationRequestLine,
  type EnumerationResponseLine
} from './protocol'
import { createTransport, type Transport } from './transport'

/**
 * セッション列挙プロセスの本体 (BE-023 / AD-030 / contracts C-1 〜 C-4)。
 *
 * **Agent SDK を呼ぶ唯一の場所である** (Principle IV / AD-023 §2)。
 * 呼んでよいのは **`listSessions()` だけ**であり、判定は
 * 「許可 1 件以外を禁じる」形で機械検証する (C-4 / 検証項目 14)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `electron` とネイティブモジュールに依存しない (推移的にも) | Principle VII / AD-010 / FR-045 |
 * | **Node 標準モジュールを import しない** | `eslint.config.mjs` policy 3。stdio はグローバルの `process` |
 * | **本体は経路を知らない。** 選択は `transport.ts` に閉じ、単独起動は標準入出力で保つ | Principle VII Statement 後半 / AD-030 §5 / SH-094 |
 * | **パス値に一切触らない。** 受け取った値をそのまま SDK に渡す | AD-028 §3 規則 2 / 3 |
 * | **transcript の本文を読まない** | FR-044 / SC-011 |
 * | ディスクに書かない | FR-036 / SC-014 |
 *
 * **常駐し、要求を直列に処理する** ([AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md))。
 * 1 要求ごとにプロセスを起こしていた頃は、**費用のほぼ全部が起動だった**
 * (実測: 起動 2,704 ms に対して列挙 36〜83 ms)。
 *
 * **直列であることが環境変数のレースを消している** (AD-030 §3)。
 * AD-021 §3 は「同一プロセス内で環境変数を書き換える」案を並行列挙のレースを理由に
 * 却下したが、**同時に 1 要求しか扱わなければ、env を設定してから応答を返すまでの
 * あいだにその値を変える主体が存在しない。**
 */

/**
 * SDK が config ディレクトリを読む唯一の経路 (research R-01)。
 *
 * **この文字列リテラルが現れてよいのは本モジュールだけである。**
 * renderer から config ディレクトリを指定できる API を作らないことと合わせて、
 * 「どのディレクトリを列挙するか」を決められる場所を絞る
 * (contracts/ipc-session-list.md の「境界に出さない値」の表)。
 */
const CLAUDE_CONFIG_DIR = 'CLAUDE_CONFIG_DIR'

/**
 * `programmatic` の取得手段 (design-gate L-002 / research R-09)。
 *
 * **`SDKSessionInfo` に `programmatic` の項目は無い。**
 * `includeProgrammatic` は**フィルタであって区別子ではない**ため、
 * 「既定 (含む) の結果」と「除外した結果」の**差集合**で決める。
 *
 * 除外側の要求は **`offset` を 0 に固定し `limit` を `offset + limit` にする。**
 * 2 つの結果は同じ順序で並び、除外側は既定側の部分列であるため、
 * 既定側の先頭 `offset + limit` 件の所属は除外側の先頭 `offset + limit` 件で決まる。
 * 除外側にも同じ `offset` を渡すと、落ちた件数だけ窓がずれて**別の範囲を見る**。
 *
 * 実測の追加費用は 26〜53 ms であり、起動費用に比べて無視できる。
 */
async function nonProgrammaticIds(limit: number): Promise<ReadonlySet<string>> {
  const excluded = await listSessions({ includeProgrammatic: false, limit, offset: 0 })
  return new Set(excluded.map((session) => session.sessionId))
}

/**
 * SDK の値を `RawSessionRecord` に写す。
 *
 * **正規化しない** (FR-049 は main 側で掛ける)。**省略された項目は `null` にする** —
 * `undefined` は `JSON.stringify` で**キーごと消える**ため、
 * 親が「項目が無い」と「値が無い」を区別できなくなる。
 *
 * 数値は `unknown` のまま渡す。**アプリ外のプロセスが書いた値であり、
 * 型注釈が実際の値を保証しない** — 検査は main 側の正規化が行う。
 */
function toRecord(
  session: Awaited<ReturnType<typeof listSessions>>[number],
  programmatic: boolean
): RawSessionRecord {
  return {
    sessionId: session.sessionId,
    summary: session.summary ?? null,
    firstPrompt: session.firstPrompt ?? null,
    customTitle: session.customTitle ?? null,
    lastModified: session.lastModified,
    createdAt: session.createdAt ?? null,
    fileSize: session.fileSize ?? null,
    gitBranch: session.gitBranch ?? null,
    tag: session.tag ?? null,
    cwd: session.cwd ?? null,
    programmatic
  }
}

async function enumerate(request: EnumerationRequestLine): Promise<EnumerationResponseLine> {
  /*
   * **受け取った値をそのまま置く** (AD-028 §3 規則 2)。
   * 結合・分解・正規化をしない。
   *
   * **直列だから安全である** (AD-030 §3)。この設定から応答を返すまでのあいだ、
   * 値を変える主体が存在しない。
   */
  process.env[CLAUDE_CONFIG_DIR] = request.configDir

  /*
   * **全件でも上限を渡す。** 上限を渡さないと打ち切りの判定ができず、
   * 巨大な config ディレクトリで IPC のペイロードが破綻する (FR-038)。
   * **上限 + 1 件を要求する** — ちょうど上限件あるときに
   * 「打ち切った」と誤って報告しないためである。
   */
  const requested =
    request.scope.kind === 'all'
      ? { limit: MAX_SESSIONS_PER_TARGET + 1, offset: 0 }
      : { limit: request.scope.limit, offset: request.scope.offset }

  const sessions = await listSessions(requested)
  const truncated = sessions.length > MAX_SESSIONS_PER_TARGET
  const kept = truncated ? sessions.slice(0, MAX_SESSIONS_PER_TARGET) : sessions

  const plainIds = await nonProgrammaticIds(requested.offset + requested.limit)

  return okResponse(
    request.id,
    request.targetKey,
    kept.map((session) => toRecord(session, !plainIds.has(session.sessionId))),
    truncated
  )
}

/**
 * 経路。**本体は経路を知らない** (AD-030 §5)。
 *
 * `utilityProcess` は標準入力を支えないため、Electron 下では `parentPort` に載る。
 * 選択は `transport.ts` の 1 モジュールに閉じてある。
 */
let transport: Transport | null = null

function write(response: EnumerationResponseLine): void {
  transport?.write(encodeResponse(response))
}

/**
 * 要求を**直列に**処理する待ち行列。
 *
 * **並行に処理してはならない** (AD-030 §3)。`process.env` を要求ごとに設定するため、
 * 2 件が重なると一方が他方の値で列挙する。
 * **「並行にしない」を約束ではなく構造で保つ** — 直前の処理の完了を待ってから次を始める。
 */
let chain: Promise<void> = Promise.resolve()

function handle(line: string): void {
  const request = decodeRequest(line)
  if (request === null) {
    /*
     * **黙って捨てない。** 形が合わない要求は親のバグかバンドルの取り違えである。
     * 識別子が読めないので `id` は 0、`targetKey` は不透明な固定値にする。
     */
    write(errorResponse(0, 'unknown', 'enumeration-failed'))
    return
  }

  chain = chain.then(async () => {
    try {
      write(await enumerate(request))
    } catch {
      /*
       * **例外をそのまま流さない** (C-5)。SDK の例外メッセージは UNC の完全パス
       * (= ディストロ名 + Linux ユーザ名) を含みうるため、**理由キーに落としてから**出す。
       */
      write(errorResponse(request.id, request.targetKey, 'enumeration-failed'))
    }
  })
}

/**
 * 入口。**要求を読み続ける。**
 *
 * **経路が閉じたら終わる。** 標準入出力の経路では親の消失をこれで知る
 * (`parentPort` の経路では Electron が孤児を回収する)。
 */
function main(): void {
  transport = createTransport()
  transport.onLine(handle)
  transport.onClosed(() => {
    // 処理中の要求を書き終えてから終わる。
    void chain.then(() => {
      process.exitCode = 0
    })
  })
}

main()
