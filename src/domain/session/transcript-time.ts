/**
 * メッセージの時刻の検査 (O-9 / AD-051。data-model §1)。
 *
 * 表示だけに使う値。並べ替えに使わない (AD-051)。永続化しない。
 * 時計は読まない。`now` は呼ぶ側が渡す (過去ログは取得の時点、実行中は受信の時点)。
 */

const MAX_LENGTH = 40
/** 2020-01-01T00:00:00Z */
const MIN_EPOCH_MS = 1_577_836_800_000
const DAY_MS = 86_400_000

const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/

/**
 * Claude Code の記録の `timestamp` を epoch ms にする。受けられない値は `null`。
 * 表示だけに使う値で、並べ替えには使わない (AD-051)。
 */
export function parseMessageTime(raw: unknown, now: number): number | null {
  if (typeof raw !== 'string') return null
  if (raw.length > MAX_LENGTH) return null
  const m = ISO_PATTERN.exec(raw)
  if (m === null) return null
  const ms = Date.parse(raw)
  if (Number.isNaN(ms)) return null

  // 存在しない日付 (2026-02-30 など) は繰り上げられうるので、入力のオフセットを足した
  // 時刻の UTC の年月日時分が入力と一致するかを見る。
  const zone = m[6]
  let offsetMin = 0
  if (zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1
    offsetMin = sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)))
  }
  const local = new Date(ms + offsetMin * 60_000)
  if (
    local.getUTCFullYear() !== Number(m[1]) ||
    local.getUTCMonth() + 1 !== Number(m[2]) ||
    local.getUTCDate() !== Number(m[3]) ||
    local.getUTCHours() !== Number(m[4]) ||
    local.getUTCMinutes() !== Number(m[5])
  ) {
    return null
  }

  if (ms < MIN_EPOCH_MS) return null
  if (ms > now + DAY_MS) return null
  return ms
}
