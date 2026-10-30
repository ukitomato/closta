import {
  MAX_PRESETS,
  normalizePresetName,
  type PresetLaunchConfig
} from '@domain/session/launch-config'
import {
  sortPresets,
  type Preset,
  type PresetDTO,
  type SavePresetResult
} from '@domain/session/preset'

import type { PresetStore } from '../infra/settings/preset-store'

/**
 * プリセットの取り回し (X-4 BE-012 / FR-009〜011)。**状態を持つ調停** — 読み込んだ presets を保持し、
 * I/O (store / 時刻 / 乱数) は**インタフェース経由で注入**する (AD-023 §5/§7 の `services ✗→ I/O`。
 * `.dependency-cruiser.js` の `services-not-to-io` に実名を足す)。
 *
 * **適用 (apply) は main で行わない** — renderer が一覧から config を取り、ダイアログの依存解決
 * (`resolveLaunchAxes`) に通す (FR-011)。起動時は main の起動ゲートが同じ関数で再評価する (FR-006)。
 * よって service は保存・一覧・削除だけを持ち、IPC の検証を迂回して起動する経路を作らない。
 */

export interface PresetServiceDeps {
  readonly store: PresetStore
  readonly now: () => number
  readonly newId: () => string
}

export interface SavePresetInput {
  readonly name: string
  readonly config: PresetLaunchConfig
  /** 同名があれば上書きする (renderer が利用者の確認を取った後にだけ true)。 */
  readonly overwrite: boolean
}

export interface PresetService {
  list(): Promise<readonly PresetDTO[]>
  save(input: SavePresetInput): Promise<SavePresetResult>
  /** 既知 id との完全一致で削除する。未知 id は `{ ok: false }`。 */
  remove(id: string): Promise<{ readonly ok: boolean }>
}

export function createPresetService(deps: PresetServiceDeps): PresetService {
  const { store, now, newId } = deps
  let presets: readonly Preset[] = []
  let loaded = false
  let storeNewerVersion = false
  let storeReadFailed = false
  /** 操作を 1 本の Promise chain で直列化する (並行 save の rename 逆転で 1 件が黙って消えない。DB M-003)。 */
  let queue: Promise<unknown> = Promise.resolve()

  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded) return
    const result = await store.load()
    if (result.reasonKeys.includes('read-failed')) {
      // 読めなかった (未作成以外)。空として確定させず、次の操作で読み直す。mutation は拒否する (DB-4)。
      // errno のコードだけを出す (パスも値も出さない。Principle V)。
      console.warn(`[preset-store] read-failed code=${result.errorCode ?? 'unknown'}`)
      storeReadFailed = true
      presets = []
      return
    }
    storeReadFailed = false
    presets = result.presets
    storeNewerVersion = result.reasonKeys.includes('schema-version-unknown')
    loaded = true
    if (result.skipped > 0 || result.backupPath !== null) {
      // 件数・理由キー・退避パスだけを出す (名前や設定値は出さない。Principle V / spec Assumptions)。
      console.warn(
        `[preset-store] skipped=${result.skipped} reasons=${result.reasonKeys.join(',')} backup=${result.backupPath?.value ?? 'none'}`
      )
    }
  }

  return {
    list() {
      return serialize(async () => {
        await ensureLoaded()
        // 読めなかった状態を「0 件」として返さない (renderer の読み込み失敗表示に乗せる。DB M-101)。
        if (storeReadFailed) throw new Error('preset store read failed')
        return sortPresets(presets)
      })
    },

    save(input) {
      return serialize(async (): Promise<SavePresetResult> => {
        await ensureLoaded()
        if (storeReadFailed) return { ok: false, reason: 'store-read-failed' }
        if (storeNewerVersion) return { ok: false, reason: 'store-newer-version' }

        const name = normalizePresetName(input.name)
        const existing = presets.find((p) => p.name === name)
        if (existing !== undefined && !input.overwrite) {
          return { ok: false, reason: 'name-conflict' }
        }
        if (existing === undefined && presets.length >= MAX_PRESETS) {
          return { ok: false, reason: 'limit-reached' }
        }

        const preset: Preset = {
          id: existing?.id ?? newId(),
          name,
          config: input.config,
          updatedAt: now()
        }
        const next =
          existing === undefined
            ? [...presets, preset]
            : presets.map((p) => (p.id === existing.id ? preset : p))
        // 永続化が成功してから in-memory を差し替える (失敗時に UI と disk が食い違わない)。
        await store.save(next)
        presets = next
        return { ok: true, preset }
      })
    },

    remove(id) {
      return serialize(async () => {
        await ensureLoaded()
        if (storeReadFailed || storeNewerVersion) return { ok: false }
        const next = presets.filter((p) => p.id !== id)
        if (next.length === presets.length) return { ok: false }
        await store.save(next)
        presets = next
        return { ok: true }
      })
    }
  }
}
