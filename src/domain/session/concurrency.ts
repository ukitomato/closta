/**
 * 同時実行数の上限 (X-5 / spec FR-005 / AD-043 Decision 3)。**純粋関数。I/O を持たない。**
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 上限は **10 に固定**する (設定で変えない・待ち行列を持たない) | USER 決定 2026-10-01 |
 * | 枠は起動要求の**予約**で占め、`claude` が終わるまで占め続ける | FR-005 |
 * | 枠を占める数は registry の `claudeAlive` で数える。**run-state では数えない** — X-1 の `done` は「応答完了・次のプロンプト待ち」と「強制終了後」の両方を表すため | FR-005 / glossary SessionRunState |
 *
 * 用語は glossary の「同時実行数の上限 (Concurrency limit)」。起動設定の「上限」軸 (X-6) とは別物。
 */

export const MAX_CONCURRENT_SESSIONS = 10

/**
 * 枠を占めるセッションの数。**`claudeAlive` で数え、run-state を見ない** (FR-005 の中核規則を domain に置く。
 * pr-gate R1 architecture L-002 / AD-023 §5)。
 */
export function countOccupying(entries: Iterable<{ readonly claudeAlive: boolean }>): number {
  let count = 0
  for (const entry of entries) if (entry.claudeAlive) count += 1
  return count
}

/**
 * 新しい起動要求の枠を予約できるか。
 *
 * @param occupyingCount registry で `claudeAlive: true` のセッション数 (`launching` 中・応答待ちの `done`・中断済みを含む)
 * @param reservedCount 予約済みで registry にまだ登録していない起動要求の数 (`prepareLaunch` 待ちなど)
 */
export function canReserve(occupyingCount: number, reservedCount: number): boolean {
  return occupyingCount + reservedCount < MAX_CONCURRENT_SESSIONS
}
