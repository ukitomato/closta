/**
 * composer の下書き (draft) と実行中入力の enqueue 検証の**純粋ヘルパ** (X-2 / FR-003〜008)。
 *
 * **message queue の item ストアは assistant-ui の native queue (`createMessageQueue` /
 * `ExternalThreadQueueAdapter`) が単一 locus として持つ** (design-gate H-1: 二重キューを作らない。
 * research R-02: native 対応を確認したため native を採用)。本モジュールは native queue が扱わない
 * 2 点だけを担う純粋関数の集合である:
 *
 * 1. **enqueue / 送信の可否判定** — 空/空白・バイト長上限・件数上限 (FR-003 / R2-M-003 / R2-M-001)。
 *    バイト長・空白の判定は X-1 の `isValidPromptText` を再利用する (`sendPrompt` 境界と対称)。
 * 2. **下書き state** — 未送信テキスト (FR-007)。メモリ内限定・境界/ログに出さない (Principle V / FR-008)。
 *
 * 終端 disposition (interrupt→still_queued / error·killed→破棄) は native queue の
 * `notifyCancelled` / `clear` が担う (LiveThread が runState に応じて呼ぶ)。
 */

import type { SessionRunState } from '@domain/session/run-state'
import { isValidPromptText } from '@domain/validation'

/** キュー件数の上限の既定値 (R2-M-001。値は plan 委ね。呼び出し側で上書き可)。 */
export const DEFAULT_MAX_QUEUE_ITEMS = 20

/**
 * turn が in-flight で、composer への送信を **即送信でなく message queue に積むべき** 状態か (FR-004 / SC-003 / AC-3)。
 *
 * `running` に加え **`awaiting_permission` (承認待ちも同一 turn の継続中)** を busy とする — ドメイン状態機械
 * (`run-state.ts` の `send-prompt`: running / awaiting_permission では「積むだけで状態は変わらない」) と契約 C-3 の SSoT に従う。
 * `launching` は busy にしない (初回プロンプト待ち。即送信できないとデッドロックする。`RunningSessionsProvider` の isRunning 注記参照)。
 * `interrupted` / `done` / `error` / `idle` も busy でない (次の送信は新ターンとして即 dispatch される)。
 *
 * runtime の `append` は `isRunning` (= 本判定) のとき送信を steer lane に回し (`message.steer ?? isRunning`)、
 * queue controller の notifyIdle (busy 立下り = turn 完了) まで held にする。単一 locus でここに集約する。
 */
export function isBusyRunState(runState: SessionRunState): boolean {
  return runState === 'running' || runState === 'awaiting_permission'
}

/**
 * 稼働中のセッションが **turn の in-flight (busy)** か。終端では busy にしない。
 * `RunningSessionsProvider` の `isRunning` と、地図・所要時間の `lastTurnOpen` (O-9 data-model §2) が同じ判定を使う。
 */
export function isRunBusy(runState: SessionRunState, terminal: boolean): boolean {
  return !terminal && isBusyRunState(runState)
}

/** 入力を送信/enqueue できるかの判定結果。拒否理由は UI の理由提示に使う (R2-M-001)。 */
export type EnqueueVerdict = 'ok' | 'invalid' | 'full'

/**
 * 入力を送信/enqueue できるか判定する (FR-003 / R2-M-003 / R2-M-001)。
 *
 * - `invalid`: 空/空白のみ、またはバイト長上限超過 (X-1 `isValidPromptText` と対称)。
 * - `full`: 現在の pending 件数が上限に達している (最古破棄はしない)。
 *
 * @param text 入力テキスト
 * @param pendingCount 現在キューに残っている (未 dispatch の) 件数
 * @param maxItems 上限件数 (既定 {@link DEFAULT_MAX_QUEUE_ITEMS})
 */
export function classifyEnqueue(
  text: string,
  pendingCount: number,
  maxItems: number = DEFAULT_MAX_QUEUE_ITEMS
): EnqueueVerdict {
  if (!isValidPromptText(text)) return 'invalid'
  if (pendingCount >= maxItems) return 'full'
  return 'ok'
}

/** 送信 (直接 or dispatch) できる有効なテキストか (空/空白・バイト長)。native queue の driver.run のガードに使う。 */
export function isSendableText(text: string): boolean {
  return isValidPromptText(text)
}

/** 下書き state (未送信テキスト。メモリ内限定)。 */
export interface DraftState {
  readonly text: string
}

export const emptyDraft: DraftState = { text: '' }

export function setDraftText(_state: DraftState, text: string): DraftState {
  return { text }
}

export function clearDraftText(): DraftState {
  return emptyDraft
}
