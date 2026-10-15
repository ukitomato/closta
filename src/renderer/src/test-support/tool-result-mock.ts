import {
  isToolResultPending,
  toolResultState,
  toolStatusInput,
  type ToolResultContext
} from '@/features/chat/tool-result-state'

/**
 * `useToolResultState` (assistant-ui の thread の store を読む hook) の代わり。tool の表示の component テストが
 * runtime なしで描くために使う (`vi.mock` の factory から呼ぶ)。判定は本物の `toolResultState` を通す。
 *
 * ```ts
 * vi.mock('@/features/chat/transcript-context', async (importOriginal) =>
 *   (await import('@/test-support/tool-result-mock')).withToolResultMock(await importOriginal())
 * )
 * ```
 */
export const toolResultMockContext: { current: ToolResultContext } = {
  current: { live: false, runState: null, latestTurn: true, orphanResult: false }
}

export function setToolResultContext(over: Partial<ToolResultContext>): void {
  toolResultMockContext.current = {
    live: false,
    runState: null,
    latestTurn: true,
    orphanResult: false,
    ...over
  }
}

export function withToolResultMock<T extends object>(actual: T): T {
  return {
    ...actual,
    useToolResultState: (part: { result?: unknown; isError?: boolean }) => {
      const state = toolResultState(part, toolResultMockContext.current)
      return {
        state,
        status: toolStatusInput(state, part.isError),
        pending: isToolResultPending(state)
      }
    }
  }
}
