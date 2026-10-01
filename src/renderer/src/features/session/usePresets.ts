import { useCallback, useEffect, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type { SessionLaunchConfig } from '@domain/session/launch-config'
import type { PresetDTO, SavePresetResult } from '@domain/session/preset'

/**
 * プリセットの状態 (X-4 FE-010 / FR-009)。**`window.closta` を直接参照する箇所をここ 1 つに集める** (useProviders と同型)。
 * プリセットは資格情報を含まない (Provider は id 参照。FR-010)。
 */

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

export interface PresetsView {
  readonly presets: readonly PresetDTO[] | null
  readonly failed: boolean
  save(name: string, config: SessionLaunchConfig, overwrite: boolean): Promise<SavePresetResult>
  remove(id: string): Promise<boolean>
}

export function usePresets(): PresetsView {
  const [presets, setPresets] = useState<readonly PresetDTO[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    capability()
      .listPresets()
      .then((next) => {
        setPresets(next)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // **結果に関わらず一覧を取り直す** (db L-202)。失敗 (read-failed / name-conflict / 例外) の後も、
  // 画面の一覧が保存ファイルの実態とずれたまま残らないようにする。例外は呼び出し側 (PresetPanel) が表示する。
  const save = useCallback(
    async (name: string, config: SessionLaunchConfig, overwrite: boolean) => {
      try {
        return await capability().savePreset(name, config, overwrite)
      } finally {
        load()
      }
    },
    [load]
  )

  const remove = useCallback(
    async (id: string) => {
      try {
        const result = await capability().removePreset(id)
        return result.ok
      } finally {
        load()
      }
    },
    [load]
  )

  return { presets, failed, save, remove }
}
