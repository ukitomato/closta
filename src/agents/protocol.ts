import {
  MAX_SESSION_ID_LENGTH,
  MAX_SESSION_OFFSET,
  MAX_SESSIONS_PER_TARGET,
  hasControlCharacter
} from '@domain/validation'

import type { EnumerationScope, RawSessionRecord } from '@domain/session/interfaces'
import { isFailureReason, type FailureReason } from '@domain/session/target'

/**
 * 列挙プロセスと親のあいだのプロトコル (BE-024 / AD-030)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **データのみ。** SDK のオブジェクト・コールバック・`AbortSignal` を載せない | FR-041 / C-3 |
 * | **トランスポートは stdio (行区切り JSON)** | Principle VII Statement 後半 / AD-010 |
 * | 要求は**標準入力**から 1 行ずつ受ける | AD-030 §1 |
 * | **パス値に一切触らない。** 受け取った値をそのまま SDK に渡す | AD-028 §3 規則 2 / 3 |
 * | UNC の文字列リテラルも UNC API 呼び出しも持たない | AD-028 リスト 2 (検証項目 13) |
 * | transcript の本文を載せない | FR-044 / SC-011 |
 *
 * **要求を起動引数ではなく標準入力で受ける** ([AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) §1)。
 * プロセスは常駐し、要求を**直列に**処理する。起動引数だった頃は
 * 1 要求ごとにプロセスを起こしており、**費用のほぼ全部が起動だった**
 * (実測: 起動 2,704 ms に対して列挙 36〜83 ms)。
 *
 * **`process.parentPort` をここでも本体でも触らない。** 触ると `node <entry>` での
 * 単独起動が成立しなくなる。`parentPort` は import を伴わないため ESLint にも
 * 依存グラフにも現れず、**機械検証が緑のまま Principle VII を破れる**唯一の経路である。
 *
 * **`agents` はコアモジュールを import できない** (`eslint.config.mjs` の policy 3)。
 * 行の読み書きはグローバルの `process` で行い、`node:readline` を使わない。
 */

/**
 * プロトコルの版。**応答に必ず載せる。**
 *
 * バンドルの取り違え (古い `out/` が残っている等) を、親が形の検査で気付ける形にする。
 */
export const PROTOCOL_VERSION = 2

export interface EnumerationRequestLine {
  readonly kind: 'enumerate'
  readonly version: number
  /**
   * 要求の識別子。**応答に echo される。**
   *
   * `targetKey` では突き合わせられない — 同じ対象に対する要求が
   * 続けて 2 回来ることがある (先頭ページ → 続き)。
   */
  readonly id: number
  /** 不透明な列挙対象の識別子。ログに出してよい唯一の識別子である (C-5)。 */
  readonly targetKey: string
  /**
   * config ディレクトリ。**そのまま SDK に渡す値**である。
   *
   * 所在が `wsl:<D>` のときは UNC 形式で来る。
   * **結合・分解・正規化をしない** (AD-028 §3 規則 2)。
   */
  readonly configDir: string
  readonly scope: EnumerationScope
}

export type EnumerationResponseLine =
  | {
      readonly kind: 'ok'
      readonly version: number
      readonly id: number
      readonly targetKey: string
      readonly sessions: readonly RawSessionRecord[]
      /** 件数上限で打ち切ったか。**黙って切らない** (FR-038)。 */
      readonly truncated: boolean
    }
  | {
      readonly kind: 'error'
      readonly version: number
      readonly id: number
      readonly targetKey: string
      readonly reasonKey: FailureReason
    }

export function okResponse(
  id: number,
  targetKey: string,
  sessions: readonly RawSessionRecord[],
  truncated: boolean
): EnumerationResponseLine {
  return { kind: 'ok', version: PROTOCOL_VERSION, id, targetKey, sessions, truncated }
}

export function errorResponse(
  id: number,
  targetKey: string,
  reasonKey: FailureReason
): EnumerationResponseLine {
  return { kind: 'error', version: PROTOCOL_VERSION, id, targetKey, reasonKey }
}

export function encodeRequest(request: EnumerationRequestLine): string {
  return JSON.stringify(request)
}

/**
 * 応答を 1 行にする。**改行を含まない JSON にする。**
 *
 * `JSON.stringify` は文字列中の改行を `\n` にエスケープするため、
 * セッションの `summary` に改行があっても行が割れない。
 */
export function encodeResponse(response: EnumerationResponseLine): string {
  return JSON.stringify(response)
}

/** 非負の安全な整数かつ上限内であること。 */
function boundedInteger(value: unknown, max: number): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isSafeInteger(value) || value < 0 || value > max) return null
  return value
}

/**
 * 応答の要素 1 件が**行として成立するか** (pr-gate Round 4 / 不変条件 2)。
 *
 * ## 何を確かめ、何を確かめないか
 *
 * 確かめるのは `sessionId` が非空文字列であることだけである。
 * **他の項目の型は確かめない** — `RawSessionRecord` の宣言どおり `unknown` で通し、
 * `normalize.ts` が「不明」に倒す。
 *
 * ## なぜ全項目を検査しないか
 *
 * pr-gate Round 2 の実装は全項目を検査し、**1 件でも合わなければ応答ごと落として**
 * その所在を `failed` にしていた。これは 3 つの点で誤っていた。
 *
 * 1. **FR-049 が答えを決めていた。** 「満たさない値は『不明』として扱う
 *    (**行は落とさない**)」。数値 3 項目には既にこの規則が適用されており、
 *    文字列項目だけ別にする理由が無い
 * 2. **FR-004 / SC-006 を所在単位で破る。** 1 レコードのために N 件が消え、
 *    「総数 = 各グループの件数の合計」が成立しなくなる
 * 3. **利用者に示す手段が無かった。** 落ちた先は `enumeration-failed` =
 *    「再取得してください」で、壊れた記録は再取得しても同じである
 *
 * ## 例外が `sessionId` だけである理由
 *
 * 識別子が無い行は**鍵も表示も作れない**。`sessionRowKey` の材料であり、
 * FR-047 の表示順で最後に残る手段でもある。ここだけは倒す先が無いので、
 * 応答を拒む (呼び出し側が理由キーを持つ行にする)。
 */
function isRawSessionRecord(value: unknown): value is RawSessionRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const id = record.sessionId
  if (typeof id !== 'string' || id.length === 0) return false
  /*
   * **識別子は正規化で倒せない** (pr-gate Round 4 / 不変条件 4 / S3-005)。
   *
   * 他の項目は型が違えば「不明」に倒せるが、識別子を倒すと行の同一性が消える
   * (`sessionRowKey` の材料であり、FR-047 の表示順で最後に残る手段でもある)。
   * したがって**使えない識別子は行ごと間引く** — 倒す先が無いためである。
   *
   * 制御文字を含む識別子は表示に出ると偽装の的になり (FR-049)、
   * 長すぎる値は鍵として持ち回るには重い。どちらも識別子としては使えない。
   */
  if (id.length > MAX_SESSION_ID_LENGTH) return false
  return !hasControlCharacter(id)
}

function decodeScope(value: unknown): EnumerationScope | null {
  if (typeof value !== 'object' || value === null) return null
  const scope = value as Record<string, unknown>
  if (scope.kind === 'all') return { kind: 'all' }
  if (scope.kind !== 'page') return null

  const limit = boundedInteger(scope.limit, MAX_SESSIONS_PER_TARGET)
  if (limit === null || limit === 0) return null
  const offset = boundedInteger(scope.offset, MAX_SESSION_OFFSET)
  if (offset === null) return null
  return { kind: 'page', limit, offset }
}

/**
 * 要求の 1 行を解釈する。**子側で使う。**
 *
 * **親が検査していても、ここでも検査する。** 単独起動 (`node <entry>`) の経路が
 * あるため、親の検査だけに頼ると入口が 2 つで検査が 1 つになる。
 *
 * **既定値を持たせない。** `scope` を省略したときに `all` へ倒すと、
 * 先頭ページだけ欲しい要求が全件列挙になり、SC-008 の予算が静かに破れる。
 */
export function decodeRequest(line: string): EnumerationRequestLine | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const value = parsed as Record<string, unknown>

  if (value.kind !== 'enumerate') return null
  if (value.version !== PROTOCOL_VERSION) return null
  const id = boundedInteger(value.id, Number.MAX_SAFE_INTEGER)
  if (id === null) return null
  if (typeof value.targetKey !== 'string' || value.targetKey.length === 0) return null
  if (typeof value.configDir !== 'string' || value.configDir.length === 0) return null
  const scope = decodeScope(value.scope)
  if (scope === null) return null

  return {
    kind: 'enumerate',
    version: PROTOCOL_VERSION,
    id,
    targetKey: value.targetKey,
    configDir: value.configDir,
    scope
  }
}

/**
 * `decodeResponse` の結果 (pr-gate Round 4 / 不変条件 2)。
 *
 * **「雑音」と「我々の応答だが形が不正」を分ける。**
 *
 * 以前はどちらも `null` で、`handleLine` が黙って捨てていた。その結果、
 * 形の合わない応答が届いても \`pending\` が決着せず、
 * **`ENUMERATION_TIMEOUT_MS` (10 秒) まで宙づりになっていた** (pr-gate Round 3 / H3-003)。
 * 列挙は直列なので、その 10 秒は後続の所在もまるごと待たせる。
 *
 * 一方で、雑音 (stdout に紛れた非 JSON など) で実行中の要求を落とすのも誤りである。
 * **JSON オブジェクトとして読めたかどうか**で 2 つを分ける —
 * プロトコル行は必ず JSON オブジェクトであり、雑音がそうである見込みは薄い。
 */
export type DecodedResponse =
  | { readonly kind: 'response'; readonly value: EnumerationResponseLine }
  /** 封筒は読めたが形が合わない。`id` が読めていれば要求を即座に決着させられる。 */
  | { readonly kind: 'malformed'; readonly id: number | null }
  /** プロトコル行ですらない。**無視する** — 実行中の要求を巻き添えにしない。 */
  | { readonly kind: 'not-a-response' }

/**
 * 応答の 1 行を解釈する。**親側で使う。**
 *
 * 子は外部パッケージ (SDK) の結果をそのまま詰めるため、親は「期待する形か」を自分で確かめる。
 * 中身の値の検証 (正規化・長さ上限) は `app` の層で行う (FR-049)。
 */
export function decodeResponse(line: string): DecodedResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return { kind: 'not-a-response' }
  }

  /* **配列も雑音である。** プロトコル行は必ずオブジェクトである。 */
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'not-a-response' }
  }
  const value = parsed as Record<string, unknown>

  /* ここから先は「プロトコル行のつもりの何か」である。`id` が読めれば決着に使える。 */
  const id = boundedInteger(value.id, Number.MAX_SAFE_INTEGER)
  const malformed = { kind: 'malformed', id } as const

  if (value.version !== PROTOCOL_VERSION) return malformed
  if (id === null) return malformed
  if (typeof value.targetKey !== 'string' || value.targetKey.length === 0) return malformed

  if (value.kind === 'ok') {
    if (!Array.isArray(value.sessions)) return malformed
    if (typeof value.truncated !== 'boolean') return malformed
    /*
     * **上限を親でも見る** (pr-gate Round 2 / H2-003)。
     * 子が上限を守る前提にしない — 応答は 1 行の JSON であり、
     * 壊れた子からの巨大な配列をそのまま `app` に渡す理由が無い。
     */
    if (value.sessions.length > MAX_SESSIONS_PER_TARGET) return malformed
    /*
     * **形の合わない要素は間引き、応答は通す** (不変条件 2 / FR-049 / FR-004)。
     *
     * 間引く条件は `sessionId` が無いことだけである (`isRawSessionRecord` を参照)。
     * 他の項目の型違いは `normalize.ts` が「不明」に倒すので**行は残る**。
     */
    return {
      kind: 'response',
      value: {
        kind: 'ok',
        version: PROTOCOL_VERSION,
        id,
        targetKey: value.targetKey,
        sessions: value.sessions.filter(isRawSessionRecord),
        truncated: value.truncated
      }
    }
  }

  if (value.kind === 'error') {
    // **既知の語彙に属することを確かめる。** 未知の理由キーを通すと
    // `ui` が訳出できない値を受け取り、表示が空欄になる。
    if (!isFailureReason(value.reasonKey)) return malformed
    return {
      kind: 'response',
      value: {
        kind: 'error',
        version: PROTOCOL_VERSION,
        id,
        targetKey: value.targetKey,
        reasonKey: value.reasonKey
      }
    }
  }

  return malformed
}

/**
 * チャンクを行に切る。**親子の双方が使う。**
 *
 * **改行で完結した分だけを渡す。** 1 行 = 1 メッセージなので、
 * 途中のチャンクで解釈を試すと必ず失敗する。
 */
export function createLineAssembler(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = ''
  return (chunk) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line.length > 0) onLine(line)
      index = buffer.indexOf('\n')
    }
  }
}
