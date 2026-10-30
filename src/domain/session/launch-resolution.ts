import type { EffortLevel, ModelEntry } from '@domain/provider/types'

import type { PresetLaunchConfig, SafePermissionMode, SessionLaunchConfig } from './launch-config'

/**
 * **起動軸の依存解決** (X-4 FR-006 / FR-007 / glossary Axis resolution)。**純粋関数。I/O を持たない。**
 *
 * **renderer (ダイアログ) と main の起動ゲートが同じ関数を呼ぶ** — fail-safe を renderer の善意に依存させない
 * (design-gate R1 H-02)。依存順は folder ↔ runtime → provider → model → effort (権限モードは独立軸)。
 *
 * | 無効になったもの | 扱い |
 * |---|---|
 * | provider (削除済み / 到達不可) | 既定 (`null`) に戻す。**起動前に確認が要る** (`requiresConfirmation`) |
 * | model (カタログ外 / provider が既定) | 既定に戻して通知 |
 * | effort (モデル非対応 / モデルが既定) | 既定に戻して通知 |
 * | folder / runtime (削除済み / 停止中 / distro 不一致) | **既定に戻さず blocker** (起動不可) |
 */

/** 解決中の起動設定 (ダイアログの下書き)。folder / runtime は未選択 (`null`) を取れる。 */
export interface LaunchDraft {
  readonly folderId: string | null
  readonly runtimeId: string | null
  readonly providerId: string | null
  readonly modelId: string | null
  readonly effort: EffortLevel | null
  readonly permissionMode: SafePermissionMode
  // 024 (data-model §2.1)。名前は下書きに入れない (依存解決の対象ではない。ダイアログの state に別に持つ)
  readonly additionalDirectoryIds: readonly string[]
  readonly maxTurns: number | null
  readonly maxBudgetUsd: number | null
}

/** folder の事実。`distroName` は WSL フォルダの所在 distro (Windows フォルダは `null`)。 */
export interface FolderFact {
  readonly id: string
  readonly distroName: string | null
}

/** ランタイムの事実。`distroName` は WSL ランタイムの distro 名 (Win32Runtime は `null`。X-8 / data-model §7)。 */
export interface RuntimeFact {
  readonly id: string
  readonly distroName: string | null
  readonly running: boolean
}

/** 選択ランタイムから見た Provider の事実。 */
export interface ProviderFact {
  readonly id: string
  readonly reachable: boolean
  readonly models: readonly ModelEntry[]
}

export interface LaunchFacts {
  readonly folders: readonly FolderFact[]
  readonly runtimes: readonly RuntimeFact[]
  /** 選択ランタイムに対して評価した Provider (登録済み全件)。 */
  readonly providers: readonly ProviderFact[]
  /** 解決結果 DTO が unreachable / probe-failed だった folder id。renderer だけが渡す (024 data-model §2.3)。省略は空。 */
  readonly unreachableFolderIds?: readonly string[]
}

export type AxisResetReason =
  'provider-removed' | 'provider-unreachable' | 'model-not-in-catalog' | 'effort-unsupported'

export interface AxisReset {
  readonly axis: 'provider' | 'model' | 'effort'
  readonly reason: AxisResetReason
  /** Provider の reset は利用者の意図しない資格情報で起動しうるため、起動前に確認を要する (US-2 AC3)。 */
  readonly requiresConfirmation: boolean
}

export type LaunchBlocker =
  | 'folder-unselected'
  | 'folder-missing'
  | 'runtime-unselected'
  | 'runtime-missing'
  | 'runtime-stopped'
  | 'distro-mismatch'

/** 追加ディレクトリの項目を外した理由 (024 data-model §2.2)。 */
export type DirectoryResetReason = 'unregistered' | 'unreachable' | 'same-as-folder'

export interface DirectoryReset {
  readonly folderId: string
  readonly reason: DirectoryResetReason
}

export interface LaunchResolution {
  readonly draft: LaunchDraft
  readonly resets: readonly AxisReset[]
  /** 外した追加ディレクトリの項目 (draft は外した後の値を持つ)。判定は US-1 (BE-010)。 */
  readonly directoryResets: readonly DirectoryReset[]
  readonly blockers: readonly LaunchBlocker[]
  // 越境はここで判定しない — 正本は既存の解決結果 DTO の `boundary` (domain/workspace/resolution.ts。
  // FR-008「規則を再定義しない」/ AD-016)。警告は renderer が DTO の `boundary === 'cross'` で出す (pr-gate C-001)。
}

export function resolveLaunchAxes(draft: LaunchDraft, facts: LaunchFacts): LaunchResolution {
  const resets: AxisReset[] = []
  const blockers: LaunchBlocker[] = []

  // ── folder ↔ runtime (既定を持たない。blocker) ──
  let folderId = draft.folderId
  let runtimeId = draft.runtimeId
  const folder = folderId === null ? null : (facts.folders.find((f) => f.id === folderId) ?? null)
  const runtime =
    runtimeId === null ? null : (facts.runtimes.find((r) => r.id === runtimeId) ?? null)

  if (folderId === null) blockers.push('folder-unselected')
  else if (folder === null) {
    blockers.push('folder-missing')
    folderId = null
  }
  if (runtimeId === null) blockers.push('runtime-unselected')
  else if (runtime === null) {
    blockers.push('runtime-missing')
    runtimeId = null
  } else if (!runtime.running) blockers.push('runtime-stopped')

  // WSL フォルダの所在 distro とランタイムの distro の不一致だけを blocker にする (Windows フォルダは対象外)。
  if (
    folder !== null &&
    runtime !== null &&
    folder.distroName !== null &&
    runtime.distroName !== null &&
    folder.distroName !== runtime.distroName
  ) {
    blockers.push('distro-mismatch')
  }

  // ── provider ──
  let providerId = draft.providerId
  let provider: ProviderFact | null = null
  if (providerId !== null) {
    provider = facts.providers.find((p) => p.id === providerId) ?? null
    if (provider === null) {
      resets.push({ axis: 'provider', reason: 'provider-removed', requiresConfirmation: true })
      providerId = null
    } else if (!provider.reachable) {
      resets.push({ axis: 'provider', reason: 'provider-unreachable', requiresConfirmation: true })
      providerId = null
      provider = null
    }
  }

  // ── model (既定 Provider はカタログを持たない) ──
  let modelId = draft.modelId
  let model: ModelEntry | null = null
  if (modelId !== null) {
    model = provider?.models.find((m) => m.id === modelId) ?? null
    if (model === null) {
      resets.push({ axis: 'model', reason: 'model-not-in-catalog', requiresConfirmation: false })
      modelId = null
    }
  }

  // ── effort (モデルが対応する値だけ。対応 effort が無ければ既定のみ) ──
  let effort = draft.effort
  if (effort !== null) {
    const supported = model?.supportedEffortLevels ?? []
    if (!supported.includes(effort)) {
      resets.push({ axis: 'effort', reason: 'effort-unsupported', requiresConfirmation: false })
      effort = null
    }
  }

  return {
    draft: {
      folderId,
      runtimeId,
      providerId,
      modelId,
      effort,
      permissionMode: draft.permissionMode,
      additionalDirectoryIds: draft.additionalDirectoryIds,
      maxTurns: draft.maxTurns,
      maxBudgetUsd: draft.maxBudgetUsd
    },
    resets,
    directoryResets: [],
    blockers
  }
}

/** blocker が無い解決結果を検証済みの起動設定にする (folder / runtime が揃っていること)。 */
export function toLaunchConfig(
  resolution: LaunchResolution,
  sessionName: string | null
): SessionLaunchConfig | null {
  const { draft, blockers } = resolution
  if (blockers.length > 0 || draft.folderId === null || draft.runtimeId === null) return null
  return {
    folderId: draft.folderId,
    runtimeId: draft.runtimeId,
    providerId: draft.providerId,
    modelId: draft.modelId,
    effort: draft.effort,
    permissionMode: draft.permissionMode,
    additionalDirectoryIds: draft.additionalDirectoryIds,
    maxTurns: draft.maxTurns,
    maxBudgetUsd: draft.maxBudgetUsd,
    sessionName
  }
}

/** 起動設定 (またはプリセットの config) を下書きへ戻す (プリセット適用・main の再評価に使う)。`sessionName` は持たない。 */
export function toLaunchDraft(config: SessionLaunchConfig | PresetLaunchConfig): LaunchDraft {
  return {
    folderId: config.folderId,
    runtimeId: config.runtimeId,
    providerId: config.providerId,
    modelId: config.modelId,
    effort: config.effort,
    permissionMode: config.permissionMode,
    additionalDirectoryIds: config.additionalDirectoryIds,
    maxTurns: config.maxTurns,
    maxBudgetUsd: config.maxBudgetUsd
  }
}
