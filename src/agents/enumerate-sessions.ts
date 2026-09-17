import { listSessions } from '@anthropic-ai/claude-agent-sdk'
import { MAX_SESSIONS_PER_TARGET } from '@domain/validation'

import type { RawSessionRecord } from '@domain/session/interfaces'
import {
  encodeResponse,
  errorResponse,
  okResponse,
  parseEnumerationArgs,
  type EnumerationArgs,
  type EnumerationResponse
} from './protocol'

/**
 * セッション列挙プロセスの本体 (BE-023 / contracts C-1 〜 C-4)。
 *
 * **Agent SDK を呼ぶ唯一の場所である** (Principle IV / AD-023 §2)。
 * 呼んでよいのは **`listSessions()` だけ**であり、判定は
 * 「許可 1 件以外を禁じる」形で機械検証する (C-4 / SH-081)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `electron` とネイティブモジュールに依存しない (推移的にも) | Principle VII / AD-010 / FR-045 |
 * | **Node 標準モジュールを import しない** | `eslint.config.mjs` policy 3。stdio はグローバルの `process` |
 * | **`process.parentPort` を触らない。** `node <entry>` で単独起動できる | Principle VII Statement 後半 / SH-094 |
 * | **`process.env` を書き換えない。** config ディレクトリは生成時に与えられる | FR-014 |
 * | **パス値に一切触らない。** 受け取った値をそのまま SDK に渡す | AD-028 §3 規則 2 / 3 |
 * | **transcript の本文を読まない** | FR-044 / SC-011 |
 * | ディスクに書かない | FR-036 / SC-014 |
 *
 * **`CLAUDE_CONFIG_DIR` をこのファイルが読まない。** SDK が自分で
 * `process.env` から解決する (research R-01)。ここで読むと、値を加工する誘惑が生まれ、
 * 規則 2 (そのまま渡す) を守っていることが読み取れなくなる。
 */

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
 * 実測の代償: 全件で 915 ms + 892 ms、先頭 50 件で 384 ms + 384 ms 程度 (research R-01)。
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

async function enumerate(args: EnumerationArgs): Promise<EnumerationResponse> {
  /*
   * **全件でも上限を渡す。** 上限を渡さないと打ち切りの判定ができず、
   * 巨大な config ディレクトリで IPC のペイロードが破綻する (FR-038)。
   * **上限 + 1 件を要求する** — ちょうど上限件あるときに
   * 「打ち切った」と誤って報告しないためである。
   */
  const requested =
    args.scope.kind === 'all'
      ? { limit: MAX_SESSIONS_PER_TARGET + 1, offset: 0 }
      : { limit: args.scope.limit, offset: args.scope.offset }

  const sessions = await listSessions(requested)
  const truncated = sessions.length > MAX_SESSIONS_PER_TARGET
  const kept = truncated ? sessions.slice(0, MAX_SESSIONS_PER_TARGET) : sessions

  const plainIds = await nonProgrammaticIds(requested.offset + requested.limit)

  return okResponse(
    args.targetKey,
    kept.map((session) => toRecord(session, !plainIds.has(session.sessionId))),
    truncated
  )
}

/** 1 行を標準出力へ書く。**これが親への唯一の出力経路である。** */
function write(response: EnumerationResponse): void {
  // platform-ok: stdio は OS 分岐ではなくプロセス間の規約である。
  process.stdout.write(`${encodeResponse(response)}\n`)
}

/**
 * 入口。**1 回の要求を処理して終了する** (AD-028 §1 の「要求 1 回」の寿命)。
 *
 * **例外をそのまま流さない** (C-5)。SDK の例外メッセージは UNC の完全パス
 * (= ディストロ名 + Linux ユーザ名) を含みうるため、**理由キーに落としてから**出す。
 * `targetKey` は不透明であり、出しても経路を復元できない。
 */
async function main(): Promise<void> {
  const parsed = parseEnumerationArgs(process.argv.slice(2))
  if (!parsed.ok) {
    // 引数が読めない時点では `targetKey` が無いため、不透明な固定値を使う。
    write(errorResponse('unknown', 'enumeration-failed'))
    process.exitCode = 1
    return
  }

  try {
    write(await enumerate(parsed.args))
  } catch {
    write(errorResponse(parsed.args.targetKey, 'enumeration-failed'))
    process.exitCode = 1
  }
}

void main()
