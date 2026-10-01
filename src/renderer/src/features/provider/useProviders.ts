import { useCallback, useEffect, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type {
  ProviderDraft,
  ProviderLoadIssuesDTO,
  ProviderPatch,
  ProviderSummaryDTO,
  ReachableProvidersDTO,
  RegisterProviderResult,
  UpdateProviderResult
} from '@domain/provider/dto'
import type { DetectedCandidate } from '@domain/provider/types'

/**
 * Provider 登録・検出・CRUD の状態 (FE-001 / FE-030。X-3)。
 *
 * **`window.closta` を直接参照する箇所をここ 1 つに集める** (useRuntimes と同型)。
 * **秘密を renderer 状態に残さない** — 登録の平文秘密は draft で 1 回渡すのみ (呼び出し側 = フォームが送信後クリア)。
 */

type LoadState = 'loading' | 'ready' | 'failed'

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

export interface ProvidersView {
  readonly providers: readonly ProviderSummaryDTO[] | null
  /** 検出候補 (**明示的に検出したときのみ**。null = 未検出。自動登録しない。SC-001)。 */
  readonly candidates: readonly DetectedCandidate[] | null
  readonly loadState: LoadState
  readonly lastError: string | null
  readonly detecting: boolean
  refresh(): void
  detect(): Promise<void>
  register(draft: ProviderDraft): Promise<RegisterProviderResult>
  update(id: string, patch: ProviderPatch): Promise<UpdateProviderResult>
  remove(id: string): Promise<void>
  listReachable(runtimeId: string): Promise<ReachableProvidersDTO>
}

export function useProviders(): ProvidersView {
  const [providers, setProviders] = useState<readonly ProviderSummaryDTO[] | null>(null)
  const [candidates, setCandidates] = useState<readonly DetectedCandidate[] | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [lastError, setLastError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)

  const load = useCallback(() => {
    capability()
      .listProviders()
      .then((next) => {
        setProviders(next)
        setLoadState('ready')
      })
      .catch(() => setLoadState('failed'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const detect = useCallback(async () => {
    setDetecting(true)
    try {
      // **検出は明示操作。** 候補を出すだけで登録はしない (SC-001)。
      setCandidates(await capability().detectProviders())
      setLastError(null)
    } catch {
      setLastError('detect-failed')
    } finally {
      setDetecting(false)
    }
  }, [])

  const register = useCallback(
    async (draft: ProviderDraft) => {
      const result = await capability().registerProvider(draft)
      if (result.ok) {
        setLastError(null)
        // 登録済みになった候補を再検出で反映するのは利用者操作に委ねる (自動再検出しない)。
        load()
      } else {
        setLastError(result.reason)
      }
      return result
    },
    [load]
  )

  const update = useCallback(
    async (id: string, patch: ProviderPatch) => {
      const result = await capability().updateProvider(id, patch)
      if (result.ok) {
        setLastError(null)
        load()
      } else {
        setLastError(result.reason)
      }
      return result
    },
    [load]
  )

  const remove = useCallback(
    async (id: string) => {
      const result = await capability().removeProvider(id)
      if (!result.ok) {
        // remove は理由キーを返さない。将来版のファイルで mutation が止まっているなら、register / update と
        // 同じ `store-newer-version` の文言にする (pr-gate R3 database L-502。IPC の型は変えない)。
        const issues = await capability()
          .providerLoadIssues()
          .catch(() => null)
        if (issues?.storeNewerVersion === true) {
          setLastError('store-newer-version')
          return
        }
        // 主に対象が既に無い。古い行を残さないよう一覧を読み込み直す (preset の削除と同じ。R4 po L-301)。
        setLastError('remove-failed')
        load()
        return
      }
      setLastError(null)
      load()
    },
    [load]
  )

  const listReachable = useCallback(
    (runtimeId: string) => capability().listReachableProviders(runtimeId),
    []
  )

  return {
    providers,
    candidates,
    loadState,
    lastError,
    detecting,
    refresh: load,
    detect,
    register,
    update,
    remove,
    listReachable
  }
}

/**
 * providers.json の読み込みで退避したレコードの**件数**と、ファイルごと読めなかったか
 * (X-4 pr-gate R1 M-03 / po M-006 / R2 database M-401)。
 * プロバイダ画面の 1 行表示だけに使う (起動ダイアログは呼ばない)。取得失敗は null (表示しない)。
 */
export function useProviderLoadIssues(): ProviderLoadIssuesDTO | null {
  const [issues, setIssues] = useState<ProviderLoadIssuesDTO | null>(null)

  useEffect(() => {
    let active = true
    capability()
      .providerLoadIssues()
      .then((result) => {
        if (active) setIssues(result)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  return issues
}
