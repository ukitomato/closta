import type { SessionStatusUpdate } from '@domain/session/status-update'

/**
 * 状態通知を renderer へ届ける中継 (X-5 / spec FR-004 / SC-004)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **検証を持たない。** 受け取るのは起動調停が domain の受信規則 (`acceptBatch`) で受理した値だけ | AD-023 §5 / design-gate R2 M-103 |
 * | **再バッチしない。** supervisor の窓 (100ms) で 1 回にまとまったものを、そのまま 1 回で送る (supervisor の異常終了の合成は窓の外で 1 回) | FR-004 |
 * | 中身をログに出さない | Principle V |
 *
 * **`electron` を import しない** — 送り先 (`webContents.send`) は composition root が注入する。
 */

export interface SessionStatusRelay {
  /** 受理済みの状態通知を送る。空なら送らない。 */
  forward(updates: readonly SessionStatusUpdate[]): void
  /** 送り先を登録する (主ウィンドウの webContents)。 */
  onForward(listener: (updates: readonly SessionStatusUpdate[]) => void): void
}

export function createSessionStatusRelay(): SessionStatusRelay {
  const listeners: ((updates: readonly SessionStatusUpdate[]) => void)[] = []
  return {
    forward(updates) {
      if (updates.length === 0) return
      for (const listener of listeners) listener(updates)
    },
    onForward(listener) {
      listeners.push(listener)
    }
  }
}
