import { createMessageQueue, type AppendMessage } from '@assistant-ui/react'

import { classifyEnqueue, DEFAULT_MAX_QUEUE_ITEMS, type EnqueueVerdict } from './composer-queue'

/**
 * assistant-ui native queue の adapter を `classifyEnqueue` でゲートする **capped adapter** (X-2 / FR-003 / FR-004 / R2-M-001)。
 *
 * native queue は enqueue/steer 時に app 側 validation を挟む口を持たないため、adapter を薄く wrap して
 * **enqueue 時 (積み込み時)** に判定する:
 * - `'invalid'`: 空/空白のみ・バイト長上限超過 → 積まない (dispatch 時の遅延失敗を作らない。FR-003 / po-M-001)
 * - `'full'`: 現在の pending 件数 (両 lane 合計) が上限に達している → **積み込みを拒否し理由を提示** (最古破棄しない。FR-004 / R2-M-001)
 *
 * 判定結果は `onResult` で呼び出し側へ通知する (`'ok'` は理由表示のクリアに使う)。`ok` のときだけ実際に積む。
 * その他の method (items/steerItems の getter、move/edit/remove、`__internal_*`) は base にそのまま委譲する
 * (getter は `this=base`、function は base に bind して `this` 束縛のずれを防ぐ)。
 */
export type QueueAdapter = ReturnType<typeof createMessageQueue>['adapter']

function appendText(message: AppendMessage): string {
  return message.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

export function createCappedAdapter(
  base: QueueAdapter,
  onResult: (verdict: EnqueueVerdict) => void,
  maxItems: number = DEFAULT_MAX_QUEUE_ITEMS,
  /** アプリのコマンドの横取り (025)。true なら base も `onResult` も呼ばない (拒否の表示も出さない)。 */
  intercept?: (text: string) => boolean
): QueueAdapter {
  const guard = (lane: 'steer' | 'enqueue', message: AppendMessage): void => {
    if (intercept?.(appendText(message).trim()) === true) return
    // 上限は「積まれている総件数」で見る (両 lane 合計。lane 分割は native の実行状態依存で利用者には 1 つのキュー)。
    const pending = base.items.length + base.steerItems.length
    const verdict = classifyEnqueue(appendText(message), pending, maxItems)
    onResult(verdict)
    if (verdict === 'ok') base[lane](message)
  }

  return new Proxy(base, {
    get(target, prop) {
      if (prop === 'steer') return (message: AppendMessage): void => guard('steer', message)
      if (prop === 'enqueue') return (message: AppendMessage): void => guard('enqueue', message)
      // getter (items/steerItems) は this=target で評価し (receiver=target)、function は target に bind する。
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value
    }
  })
}
