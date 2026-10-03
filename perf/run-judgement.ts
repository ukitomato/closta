/**
 * 実機計測の回の判定 (O-1 FR-012 / SC-005)。**純関数だけ**を置き、Vitest で固定する (`run-judgement.test.ts`。
 * pr-gate R1 architecture M-002)。Playwright の spec は値を集めてここに渡すだけにする。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 有効な回の下限は、有限の正の数でなければ `refused` で止める (NaN で判定を素通りさせない) | spec Edge Cases「黙って緩めない」 |
 * | 受信の累計が有限の値でなければ `probe-missing` (観測点が無い回を有効にしない) | FR-012 |
 * | 使った下限と、既定から変えたかを記録に残す | SC-005 の許可リスト |
 * | 例外の文は理由キーだけ (env の値を出さない) | FR-012 / pr-gate R1 security L-002 |
 */

/** 有効な回の下限の既定 (窓の中のメッセージ数)。当初の 100 から利用者判断 2026-10-02 で 30 に下げた。 */
export const DEFAULT_MIN_MESSAGES = 30

export type InvalidReason = 'not-all-running' | 'probe-missing' | 'too-few-messages'

/** `CLOSTA_PERF_MIN_MESSAGES` を読む。未設定なら既定。有限の正の数でなければ失敗で止める。 */
export function parseMinMessages(raw: string | undefined): {
  readonly minMessages: number
  readonly thresholdOverridden: boolean
} {
  if (raw === undefined || raw === '')
    return { minMessages: DEFAULT_MIN_MESSAGES, thresholdOverridden: false }
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error('refused: CLOSTA_PERF_MIN_MESSAGES')
  return { minMessages: value, thresholdOverridden: value !== DEFAULT_MIN_MESSAGES }
}

/**
 * 回が有効かを決める。2 点の確認で全期間を代表できる: 承認に応じず追加の送信もしないので、窓の途中で応答中を
 * 外れたセッションは戻らない。
 */
export function judgeRun(input: {
  readonly sessions: number
  readonly runningAtStart: number
  readonly runningAtEnd: number
  readonly receivedAtStart: number
  readonly receivedAtEnd: number
  readonly minMessages: number
}): { readonly messages: number | null; readonly reason: InvalidReason | null } {
  const { receivedAtStart, receivedAtEnd } = input
  const messages =
    Number.isFinite(receivedAtStart) && Number.isFinite(receivedAtEnd)
      ? receivedAtEnd - receivedAtStart
      : null
  if (input.runningAtStart < input.sessions || input.runningAtEnd < input.sessions)
    return { messages, reason: 'not-all-running' }
  if (messages === null) return { messages, reason: 'probe-missing' }
  if (messages < input.minMessages) return { messages, reason: 'too-few-messages' }
  return { messages, reason: null }
}
