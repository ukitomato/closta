import { MAX_SESSIONS_PER_TARGET } from '@domain/validation'

import type { RawSessionRecord } from '@domain/session/interfaces'
import {
  decodeRequest,
  errorResponse,
  okResponse,
  type EnumerationRequestLine,
  type EnumerationResponseLine
} from './protocol'

/**
 * 列挙の本体 (BE-023b / AD-030 / contracts C-1 〜 C-4)。
 *
 * **`enumerate-sessions.ts` から分けてある** (code-gate iteration 1 / test track)。
 * 理由は 1 つで、**この論理をテストできる形にするため**である。
 * 入口側は (a) Agent SDK の実 import、(b) 末尾の `main()` 即時実行、
 * (c) 環境変数の綴りを持つため、Vitest から読むと副作用が走る。
 *
 * ここに残っているのは**固定したい不変条件だけ**である。
 *
 * | 不変条件 | 壊れたときの症状 |
 * |---|---|
 * | 受け取った config ディレクトリを**加工せず**設定する | 別のディレクトリを列挙する |
 * | 要求を**直列に**処理する | 2 要求が env を踏み合い、片方が他方のディレクトリを列挙する |
 * | 全件でも上限 + 1 件を要求し、超過で打ち切りと報告する | ちょうど上限件のときに誤って「打ち切った」と報告する |
 * | `programmatic` の差集合は **`offset` 0 / `limit` = `offset + limit`** | 窓がずれて別の範囲を見る。判定が静かにずれる |
 * | 省略された項目を `null` にする | `JSON.stringify` でキーが消え、親が「項目が無い」と「値が無い」を区別できない |
 * | 形の合わない要求に理由キーを返す | 親が上限時間まで待つ |
 *
 * **SDK を import しない。** 呼び出しは注入で受ける (Principle IV / 検証項目 14 は
 * import できるディレクトリと呼べる関数名の両方を縛るが、ここは呼ばない側である)。
 *
 * **環境変数の綴りを持たない** (AD-030 §2)。設定は注入された関数が行う。
 */

/**
 * SDK の 1 件の構造 (`SDKSessionInfo` のうち本アプリが使う範囲)。
 *
 * **型で値を保証しない。** アプリ外のパッケージが返す値であり、
 * 数値の検査は main 側の正規化が行う (`RawSessionRecord` と同じ扱い)。
 */
export interface SdkSessionLike {
  readonly sessionId: string
  readonly summary?: string | null
  readonly firstPrompt?: string | null
  readonly customTitle?: string | null
  readonly lastModified: unknown
  readonly createdAt?: unknown
  readonly fileSize?: unknown
  readonly gitBranch?: string | null
  readonly tag?: string | null
  readonly cwd?: string | null
}

/** SDK の呼び出しに渡す形。**`offset` と `limit` は必ず渡す** (打ち切りの判定に要る)。 */
export interface ListSessionsOptionsLike {
  readonly limit: number
  readonly offset: number
  readonly includeProgrammatic?: boolean
}

export interface EnumerateDeps {
  /** `listSessions` に相当する呼び出し。**入口が実物を渡す。** */
  readonly listSessions: (options: ListSessionsOptionsLike) => Promise<readonly SdkSessionLike[]>
  /**
   * config ディレクトリを SDK に伝える。
   *
   * **綴りをここに持たない** (AD-030 §2)。入口が環境変数へ設定する。
   */
  readonly setConfigDir: (dir: string) => void
}

/**
 * SDK の値を `RawSessionRecord` に写す。
 *
 * **正規化しない** (FR-049 は main 側で掛ける)。**省略された項目は `null` にする** —
 * `undefined` は `JSON.stringify` で**キーごと消える**ため、
 * 親が「項目が無い」と「値が無い」を区別できなくなる。
 */
export function toRecord(session: SdkSessionLike, programmatic: boolean): RawSessionRecord {
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

/**
 * 要求 1 件を処理する。
 *
 * **`programmatic` の取得** (design-gate L-002 / research R-09):
 * `SDKSessionInfo` に `programmatic` の項目は無く、`includeProgrammatic` は
 * **フィルタであって区別子ではない**ため、「既定 (含む)」と「除外」の**差集合**で決める。
 *
 * 除外側の要求は **`offset` を 0 に固定し `limit` を `offset + limit` にする。**
 * 2 つの結果は同じ順序で並び、除外側は既定側の部分列であるため、
 * 既定側の先頭 `offset + limit` 件の所属は除外側の先頭 `offset + limit` 件で決まる。
 * 除外側にも同じ `offset` を渡すと、落ちた件数だけ窓がずれて**別の範囲を見る**。
 */
export async function enumerate(
  deps: EnumerateDeps,
  request: EnumerationRequestLine
): Promise<EnumerationResponseLine> {
  /*
   * **受け取った値をそのまま渡す** (AD-028 §3 規則 2)。
   * 結合・分解・正規化をしない。
   *
   * **直列だから安全である** (AD-030 §3)。この設定から応答を返すまでのあいだ、
   * 値を変える主体が存在しない。
   */
  deps.setConfigDir(request.configDir)

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

  const sessions = await deps.listSessions(requested)
  const truncated = sessions.length > MAX_SESSIONS_PER_TARGET
  const kept = truncated ? sessions.slice(0, MAX_SESSIONS_PER_TARGET) : sessions

  const excluded = await deps.listSessions({
    includeProgrammatic: false,
    limit: requested.offset + requested.limit,
    offset: 0
  })
  const plainIds = new Set(excluded.map((session) => session.sessionId))

  return okResponse(
    request.id,
    request.targetKey,
    kept.map((session) => toRecord(session, !plainIds.has(session.sessionId))),
    truncated
  )
}

export interface RequestHandler {
  /** 行 1 本を受け取る。**応答は `write` に渡す。** */
  handle(line: string): void
  /** 待ち行列が空になるまで待つ。**入口が終了前に使う。** */
  drain(): Promise<void>
}

/**
 * 要求を**直列に**処理する待ち行列を作る。
 *
 * **並行に処理してはならない** (AD-030 §3)。config ディレクトリを要求ごとに設定するため、
 * 2 件が重なると一方が他方の値で列挙する。
 * **「並行にしない」を約束ではなく構造で保つ** — 直前の処理の完了を待ってから次を始める。
 */
export function createRequestHandler(
  deps: EnumerateDeps,
  write: (response: EnumerationResponseLine) => void
): RequestHandler {
  let chain: Promise<void> = Promise.resolve()

  return {
    handle(line) {
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
          write(await enumerate(deps, request))
        } catch {
          /*
           * **例外をそのまま流さない** (C-5)。SDK の例外メッセージは UNC の完全パス
           * (= ディストロ名 + Linux ユーザ名) を含みうるため、
           * **理由キーに落としてから**出す。
           */
          write(errorResponse(request.id, request.targetKey, 'enumeration-failed'))
        }
      })
    },

    async drain() {
      await chain
    }
  }
}
