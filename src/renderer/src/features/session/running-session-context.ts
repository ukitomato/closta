import { createContext, useContext, useEffect } from 'react'
import { useStore } from 'zustand'

import { CAPABILITY_KEY } from '@domain/capability'

import {
  createRunningSessionStore,
  type RunningSessionStore,
  type RunningSessionStoreState
} from './running-session-store'

/**
 * **稼働中セッションのストアの入口** (X-5 / FE-001。寿命・注入・購読の 1 か所)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | ストアは App の寿命で 1 つ (`runningSessionStore`)。購読 (port の受け渡し・状態通知) は App が `useRunningSessionStoreWiring` で 1 回だけ張る | spec FR-008 |
 * | **`stores/` (zustand の `create`) に置かない** — vanilla の `createStore` を React context で注入し、テストが別のストアを差し込めるようにするため | テスト注入 |
 */

export const runningSessionStore: RunningSessionStore = createRunningSessionStore(
  () => window[CAPABILITY_KEY]
)

/** テストで別のストアを差し込むための context。既定は App 寿命の `runningSessionStore`。 */
export const RunningSessionStoreContext = createContext<RunningSessionStore>(runningSessionStore)

export function useRunningSessionStoreApi(): RunningSessionStore {
  return useContext(RunningSessionStoreContext)
}

export function useRunningSessionStore<T>(selector: (state: RunningSessionStoreState) => T): T {
  return useStore(useRunningSessionStoreApi(), selector)
}

/** `window` の port 受け渡しと状態通知の購読を張る。App のルートで 1 回だけ呼ぶ (画面の切り替えで外さない)。 */
export function useRunningSessionStoreWiring(): void {
  const store = useRunningSessionStoreApi()
  useEffect(() => store.attach(window), [store])
}
