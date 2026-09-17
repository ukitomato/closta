import { MAX_SESSION_OFFSET, MAX_SESSIONS_PER_TARGET } from '@domain/validation'

import type { EnumerationScope, RawSessionRecord } from '@domain/session/interfaces'
import { isFailureReason, type FailureReason } from '@domain/session/target'

/**
 * 列挙プロセスと親のあいだのプロトコル (BE-024 / contracts C-1 / C-3)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **データのみ。** SDK のオブジェクト・コールバック・`AbortSignal` を載せない | FR-041 / C-3 |
 * | **トランスポートは stdio (行区切り JSON)** | Principle VII Statement 後半 / AD-010 |
 * | 要求は**起動引数と環境変数**で渡す。`stdin` を読まない | C-2 |
 * | **パス値に一切触らない。** 作業ディレクトリは生の文字列のまま返す | AD-028 §3 規則 3 (訂正版) / AD-029 |
 * | UNC の文字列リテラルも UNC API 呼び出しも持たない | AD-028 リスト 2 (検証項目 13) |
 * | transcript の本文を載せない | FR-044 / SC-011 |
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
export const PROTOCOL_VERSION = 1

/** 起動引数の名前。**この 4 つ以外を受け取らない。** */
export const ARG_TARGET_KEY = '--target-key'
export const ARG_SCOPE = '--scope'
export const ARG_LIMIT = '--limit'
export const ARG_OFFSET = '--offset'

export interface EnumerationArgs {
  /**
   * 列挙対象の不透明な識別子。
   *
   * **経路を復元できない値である** (data-model §1)。応答に echo し、
   * 親が「正しい子から来た応答か」を突き合わせるためだけに使う。
   * stderr に出してよい唯一のパス系でない識別子でもある (C-5)。
   */
  readonly targetKey: string
  readonly scope: EnumerationScope
}

export type ArgsError = 'missing-target-key' | 'invalid-scope' | 'invalid-limit' | 'invalid-offset'

export type ArgsResult =
  | { readonly ok: true; readonly args: EnumerationArgs }
  | { readonly ok: false; readonly reason: ArgsError }

export type EnumerationResponse =
  | {
      readonly kind: 'ok'
      readonly version: number
      readonly targetKey: string
      readonly sessions: readonly RawSessionRecord[]
      /** 件数上限で打ち切ったか。**黙って切らない** (FR-038)。 */
      readonly truncated: boolean
    }
  | {
      readonly kind: 'error'
      readonly version: number
      readonly targetKey: string
      readonly reasonKey: FailureReason
    }

/** `--name=value` 形式だけを受け付ける。`--name value` は受け付けない (曖昧になる)。 */
function valueOf(argv: readonly string[], name: string): string | null {
  const prefix = `${name}=`
  for (const arg of argv) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return null
}

/**
 * 非負の安全な整数かつ上限内であること。
 *
 * **親が検査していても、ここでも検査する。** 単独起動 (`node <entry>`) の経路が
 * あるため、親の検査だけに頼ると入口が 2 つで検査が 1 つになる。
 */
function boundedInteger(raw: string | null, max: number): number | null {
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0 || value > max) return null
  return value
}

/**
 * 起動引数を解釈する (C-2)。
 *
 * **既定値を持たせない。** `--scope` を省略したときに `all` へ倒すと、
 * 先頭ページだけ欲しい要求が全件列挙になり、SC-008 の予算が静かに破れる。
 */
export function parseEnumerationArgs(argv: readonly string[]): ArgsResult {
  const targetKey = valueOf(argv, ARG_TARGET_KEY)
  if (targetKey === null || targetKey.length === 0) {
    return { ok: false, reason: 'missing-target-key' }
  }

  const scope = valueOf(argv, ARG_SCOPE)
  if (scope === 'all') return { ok: true, args: { targetKey, scope: { kind: 'all' } } }
  if (scope !== 'page') return { ok: false, reason: 'invalid-scope' }

  const limit = boundedInteger(valueOf(argv, ARG_LIMIT), MAX_SESSIONS_PER_TARGET)
  if (limit === null || limit === 0) return { ok: false, reason: 'invalid-limit' }

  const offset = boundedInteger(valueOf(argv, ARG_OFFSET), MAX_SESSION_OFFSET)
  if (offset === null) return { ok: false, reason: 'invalid-offset' }

  return { ok: true, args: { targetKey, scope: { kind: 'page', limit, offset } } }
}

export function okResponse(
  targetKey: string,
  sessions: readonly RawSessionRecord[],
  truncated: boolean
): EnumerationResponse {
  return { kind: 'ok', version: PROTOCOL_VERSION, targetKey, sessions, truncated }
}

export function errorResponse(targetKey: string, reasonKey: FailureReason): EnumerationResponse {
  return { kind: 'error', version: PROTOCOL_VERSION, targetKey, reasonKey }
}

/**
 * 応答を 1 行にする。**改行を含まない JSON にする。**
 *
 * `JSON.stringify` は文字列中の改行を `\n` にエスケープするため、
 * セッションの `summary` に改行があっても行が割れない。
 */
export function encodeResponse(response: EnumerationResponse): string {
  return JSON.stringify(response)
}

/**
 * 応答の 1 行を解釈する。**親側で使う。**
 *
 * **形が合わない応答を `null` にする。** 子は外部パッケージ (SDK) の結果を
 * そのまま詰めるため、親は「期待する形か」を自分で確かめる。
 * 中身の値の検証 (正規化・長さ上限) は `app` の層で行う (FR-049)。
 */
export function decodeResponse(line: string): EnumerationResponse | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const value = parsed as Record<string, unknown>
  if (value.version !== PROTOCOL_VERSION) return null
  if (typeof value.targetKey !== 'string' || value.targetKey.length === 0) return null

  if (value.kind === 'ok') {
    if (!Array.isArray(value.sessions)) return null
    if (typeof value.truncated !== 'boolean') return null
    return {
      kind: 'ok',
      version: PROTOCOL_VERSION,
      targetKey: value.targetKey,
      sessions: value.sessions as readonly RawSessionRecord[],
      truncated: value.truncated
    }
  }

  if (value.kind === 'error') {
    // **既知の語彙に属することを確かめる。** 未知の理由キーを通すと
    // `ui` が訳出できない値を受け取り、表示が空欄になる。
    if (!isFailureReason(value.reasonKey)) return null
    return {
      kind: 'error',
      version: PROTOCOL_VERSION,
      targetKey: value.targetKey,
      reasonKey: value.reasonKey
    }
  }

  return null
}
