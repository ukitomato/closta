import { useEffect, useMemo, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type { ReachableProvidersDTO } from '@domain/provider/dto'
import { isEffortLevel } from '@domain/provider/model-catalog'
import type { EffortLevel } from '@domain/provider/types'
import type { LaunchFailureReason, SessionLaunchRejectReason } from '@domain/session/agent-session'
import {
  isSafePermissionMode,
  SAFE_PERMISSION_MODES,
  type SafePermissionMode,
  type SessionLaunchConfig
} from '@domain/session/launch-config'
import {
  resolveLaunchAxes,
  toLaunchConfig,
  toLaunchDraft,
  type AxisReset,
  type LaunchDraft,
  type LaunchFacts
} from '@domain/session/launch-resolution'
import type { FolderRuntimeResolutionDTO } from '@domain/workspace/dto'

import { Button } from '@/components/ui/button'
import { EFFORT_LABELS } from '@/features/provider/labels'
import { useProviders } from '@/features/provider/useProviders'
import { useRuntimes } from '@/features/runtime-list/useRuntimes'
import { useFolders } from '@/features/workspace-folders/useFolders'

import {
  AXIS_RESET_LABELS,
  CROSS_BOUNDARY_LABELS,
  FOLDER_RUNTIME_BLOCKED_LABELS,
  LAUNCH_AXIS_LABELS,
  LAUNCH_BLOCKER_LABELS,
  LAUNCH_EMPTY_STATE_LABELS,
  launchRejectLabel,
  PERMISSION_MODE_DESCRIPTIONS,
  PERMISSION_MODE_LABELS,
  previousFailureLabel,
  PROVIDER_RESET_CONFIRMATION,
  PROVIDER_RESET_CONFIRMATION_UNVERIFIED,
  PROVIDER_RESET_UNVERIFIED_LABEL,
  REACHABILITY_EXCLUDED_LABELS,
  REACHABILITY_STATUS_LABELS,
  REEVALUATE_LABELS,
  sameFolderWarning
} from './labels'
import { PresetPanel } from './PresetPanel'
import { usePresets } from './usePresets'

/** 起動設定ダイアログが読む起動の状態と、起動の発火口 (X-5: セッションストアの `launch` から組む)。 */
export interface LaunchSource {
  readonly phase: 'entry' | 'launching' | 'rejected'
  readonly rejectReason: SessionLaunchRejectReason | null
  readonly lastConfig: SessionLaunchConfig | null
  readonly previousFailure: LaunchFailureReason | null
  /** 終わっていないセッションの作業フォルダ (同一フォルダの警告。X-5 FE-003)。重複を数える。 */
  readonly activeFolderIds?: readonly string[]
  launch(config: SessionLaunchConfig): Promise<void>
}

/**
 * **起動設定ダイアログ** (X-4 FE-001 / FE-020 / US-1 / US-3)。X-1 の `LaunchEntry` を置き換える。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 軸は依存順 (フォルダ ↔ ランタイム → Provider → モデル → effort) + 独立の権限モード。**select の並びを変えない** (E2E が 1・2 番目を前提) | FR-001 |
 * | 依存解決は**描画ごとに純粋関数で計算**し、reset の通知と blocker を導出する (effect で状態を書き戻さない) | FR-006 / FR-007 |
 * | Provider が既定に戻った状態の起動は**確認を要する** (既定の資格情報・課金先で黙って起動させない) | US-2 AC3 |
 * | 越境は**解決結果 DTO の `boundary === 'cross'` だけ**で判定し、警告のみ (起動ボタンは有効のまま) | FR-008 / AD-016 |
 * | DTO の取得中と `blocked` (`capabilities-not-probed`) は起動を保留し (probe 完了または再評価で解ける)、`unreachable` と `blocked` (`probe-failed`) は起動を止める (取得失敗だけを「判定できない」と注記して起動を許す) | AD-025 / R2 architecture M-001 / R3 po M-201 |
 * | 到達可能性の取得中・失敗は Provider を「既定」だけにする (fail-open にしない)。取得中は reset を保留する | FR-002 / SC-001 |
 * | 起動設定はセッションストアが保持し、失敗・拒否で戻ったとき復元する | US-1 AC7 |
 * | 終わっていないセッションと同じ登録フォルダを選ぶと**警告だけ**を出す (起動ボタンは有効のまま) | X-5 spec US-1 AC2 / FE-003 |
 */

function capability(): typeof window.closta {
  return window[CAPABILITY_KEY]
}

const EMPTY_DRAFT: LaunchDraft = {
  folderId: null,
  runtimeId: null,
  providerId: null,
  modelId: null,
  effort: null,
  permissionMode: 'default'
}

/** 非同期に取得する値の状態。`idle` は取得の前提 (選択) が揃っていない。 */
type Fetched<T> =
  | { readonly status: 'idle' | 'loading' | 'failed' }
  | { readonly status: 'ready'; readonly value: T }

/**
 * ランタイムごとの到達可能 Provider。
 *
 * **キーに選択ランタイムの state・probeState と再評価の回数を含める** (pr-gate H-003 / R3 platform-boundary
 * M-501)。`useFolderRuntimeResolution` と同じ版を使う — 停止中や probe 中 (PathMapping 未取得) に `blocked` で
 * 外れた Provider は、起動して「再評価」した後や probe 完了の通知の後に取り直さないと戻らない。
 * 取得中・失敗は `loading` / `failed` として返し、呼び出し側が fail-open にしない (pr-gate H-004)。
 */
function useReachable(runtimeId: string | null, revision: string): Fetched<ReachableProvidersDTO> {
  const key = runtimeId === null ? null : `${runtimeId}|${revision}`
  const [state, setState] = useState<{
    readonly key: string
    readonly value: ReachableProvidersDTO | null
  } | null>(null)
  useEffect(() => {
    if (runtimeId === null || key === null) return
    let cancelled = false
    capability()
      .listReachableProviders(runtimeId)
      .then((value) => {
        if (!cancelled) setState({ key, value })
      })
      .catch(() => {
        if (!cancelled) setState({ key, value: null })
      })
    return () => {
      cancelled = true
    }
  }, [runtimeId, key])
  if (key === null) return { status: 'idle' }
  if (state === null || state.key !== key) return { status: 'loading' }
  return state.value === null ? { status: 'failed' } : { status: 'ready', value: state.value }
}

/**
 * 既存の解決結果 DTO (AD-016)。**越境の判定はこの `boundary` だけで行う** (FR-008「規則を再定義しない」/
 * pr-gate C-001)。WSL 所在でも Windows マウント配下なら `cross` になる (domain/workspace/resolution.ts)。
 *
 * **キーに選択ランタイムの state と probeState を含める** (R2 architecture M-001)。probe 前 (`idle` /
 * `probing`) の DTO は `blocked` / `boundary: 'unknown'` で、起動直後と再検出中は必ずそこを通る。
 * probe 完了の通知で取り直さないと、越境の組み合わせでも警告 (AD-016) が出ないまま残る。
 */
function useFolderRuntimeResolution(
  folderId: string | null,
  runtimeId: string | null,
  revision: string
): Fetched<FolderRuntimeResolutionDTO | null> {
  const key =
    folderId !== null && runtimeId !== null ? `${folderId}|${runtimeId}|${revision}` : null
  const [state, setState] = useState<{
    readonly key: string
    readonly value: FolderRuntimeResolutionDTO | null
    readonly failed: boolean
  } | null>(null)
  useEffect(() => {
    if (folderId === null || runtimeId === null || key === null) return
    let cancelled = false
    capability()
      .resolveFolderRuntime(folderId, runtimeId)
      .then((value) => {
        if (!cancelled) setState({ key, value, failed: false })
      })
      .catch(() => {
        if (!cancelled) setState({ key, value: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [folderId, runtimeId, key])
  if (key === null) return { status: 'idle' }
  if (state === null || state.key !== key) return { status: 'loading' }
  return state.failed ? { status: 'failed' } : { status: 'ready', value: state.value }
}

const selectClass = 'border-border bg-background rounded-md border px-2 py-1.5 text-sm'

export function LaunchDialog({ session }: { readonly session: LaunchSource }): React.JSX.Element {
  const folders = useFolders()
  const runtimes = useRuntimes()
  const providers = useProviders()
  const presets = usePresets()

  const [draft, setDraft] = useState<LaunchDraft>(() =>
    session.lastConfig !== null ? toLaunchDraft(session.lastConfig) : EMPTY_DRAFT
  )
  const [confirming, setConfirming] = useState(false)
  /** 「再評価」/「再試行」の回数。到達可能性と解決結果の取得キーに含め、押すたびに取り直す (pr-gate H-003)。 */
  const [nonce, setNonce] = useState(0)
  /**
   * 利用者が自分で軸を変えたときに既定へ戻した下流 (モデル / effort) の通知 (po L-101)。下書きは
   * `resolution.draft` で書き戻すので、通知はここに 1 回だけ残し、次の変更で消す。
   */
  const [notices, setNotices] = useState<readonly AxisReset[]>([])
  /** 直前の「再評価」が失敗したか (po M-102。失敗を黙らない)。 */
  const [reevaluateFailed, setReevaluateFailed] = useState(false)

  const folderList = useMemo(() => folders.list?.folders ?? [], [folders.list])
  // 起動できるのは WslRuntime に限る (FR-001)。
  const wslRuntimes = useMemo(
    () => (runtimes.list?.runtimes ?? []).filter((r) => r.kind === 'wsl'),
    [runtimes.list]
  )
  const providerList = useMemo(() => providers.providers ?? [], [providers.providers])
  const selectedRuntime = wslRuntimes.find((r) => r.id === draft.runtimeId) ?? null
  const selectedRuntimeState = selectedRuntime?.state ?? null
  const selectedProbeState = selectedRuntime?.capabilities.probeState ?? null
  /** 選択ランタイムの版。到達可能性と解決結果の取得キーで共有する (R3 platform-boundary M-501)。 */
  const runtimeRevision = `${selectedRuntimeState ?? ''}|${selectedProbeState ?? ''}|${nonce}`
  const reachable = useReachable(draft.runtimeId, runtimeRevision)
  const folderRuntime = useFolderRuntimeResolution(draft.folderId, draft.runtimeId, runtimeRevision)

  const facts: LaunchFacts = useMemo(() => {
    // 取得中・失敗の間は到達不可として扱う (fail-open にしない。pr-gate H-004 / SC-001)。
    const reachableIds =
      reachable.status === 'ready'
        ? new Set(reachable.value.reachable.map((p) => p.id))
        : new Set<string>()
    return {
      folders: folderList.map((f) => ({
        id: f.id,
        distroName: f.location.kind === 'wsl' ? f.location.distroName : null
      })),
      // distro 名が分からない WSL ランタイムは facts に入れない (NamespaceId を distro 名に代用しない。
      // 選んでいれば runtime-missing に倒れる。namespace.ts / pb L-001)。
      runtimes: wslRuntimes.flatMap((r) =>
        r.distroName === null
          ? []
          : [{ id: r.id, distroName: r.distroName, running: r.state === 'running' }]
      ),
      providers: providerList.map((p) => ({
        id: p.id,
        reachable: reachableIds.has(p.id),
        models: p.models
      }))
    }
  }, [folderList, wslRuntimes, providerList, reachable])

  const resolution = resolveLaunchAxes(draft, facts)
  const effective = resolution.draft
  // **取得中は reset を保留する** (pr-gate H-004)。取得中は到達不可として解決するため、選んでいた Provider が
  // 既定に落ちて見えるが、下書きは消さず、通知も起動も保留する (取得後に同じ下書きを解決し直す)。
  const holdResets =
    (reachable.status === 'idle' || reachable.status === 'loading') && draft.providerId !== null
  const resets = holdResets ? [] : resolution.resets
  const config = holdResets ? null : toLaunchConfig(resolution)
  const needsConfirmation = resets.some((r) => r.requiresConfirmation)
  // 書き戻した下流の通知 (1 回) と、いまの解決の reset を重複なく並べる。
  const shownResets = [
    ...notices,
    ...resets.filter((r) => !notices.some((n) => n.axis === r.axis && n.reason === r.reason))
  ]
  /** 到達可能性の取得に失敗している (到達できないと確かめたわけではない。po M-101)。 */
  const reachabilityUnverified = reachable.status === 'failed'

  // **解決結果 DTO の取得中は起動を保留する** (R2 architecture M-001)。取得中は越境の警告が出ないため、
  // その間に起動させると AD-016 の「例外なく提示する」を素通りする。取得 (IPC) に失敗したときだけ
  // 「判定できません」と注記して起動を許す (従来どおり)。
  // main の resolveCwd が null を返して launch-failed になるのは `unreachable` だけではない。PathMapping が
  // 未取得 (`blocked`) の Windows フォルダも null になり、probe 前は claudePath も無い (R3 po M-201 /
  // platform-boundary L-502)。そこで `blocked` は `blockedReason` で分ける:
  // - `capabilities-not-probed`: 取得中と同じく起動を保留する (probe 完了または再評価で DTO を取り直すと
  //   解ける。probe が始まらないこともあるため、再評価の導線を出す。R4 platform-boundary L-601)
  // - `probe-failed`: 起動を止め、再評価の導線を出す
  // - `distro-not-running`: 何も足さない (runtime-stopped の blocker が起動を止め、次の一手を示す)
  const folderRuntimeChecking = folderRuntime.status === 'loading'
  const folderRuntimeDto = folderRuntime.status === 'ready' ? folderRuntime.value : null
  const folderRuntimeUnreachable = folderRuntimeDto?.reachability === 'unreachable'
  const folderRuntimeBlockedReason =
    folderRuntimeDto?.reachability === 'blocked' ? folderRuntimeDto.blockedReason : null
  const folderRuntimeWaitingProbe = folderRuntimeBlockedReason === 'capabilities-not-probed'
  const folderRuntimeProbeFailed = folderRuntimeBlockedReason === 'probe-failed'
  const launchConfig =
    folderRuntimeChecking ||
    folderRuntimeWaitingProbe ||
    folderRuntimeUnreachable ||
    folderRuntimeProbeFailed
      ? null
      : config

  // 取得中・失敗の間は「既定」だけを選べる (pr-gate H-004)。
  const selectableProviders =
    reachable.status === 'ready'
      ? providerList.filter((p) => reachable.value.reachable.some((r) => r.id === p.id))
      : []
  const currentProvider = providerList.find((p) => p.id === effective.providerId) ?? null
  const models = currentProvider?.models ?? []
  const currentModel = models.find((m) => m.id === effective.modelId) ?? null
  const efforts: readonly EffortLevel[] = currentModel?.supportedEffortLevels ?? []

  // 越境は DTO の `boundary === 'cross'` だけで判定する (pr-gate C-001)。取得中は何も出さず、
  // 取得できなかったときは「判定できなかった」ことを示す (越境を黙って見落とさない)。
  const crossBoundary =
    folderRuntime.status === 'ready' && folderRuntime.value?.boundary === 'cross'
      ? { impact: folderRuntime.value.recommendation?.impact ?? null }
      : null

  /**
   * 軸の変更は**その軸だけ**を書き換える (pr-gate H-005)。下流 (モデル / effort) の無効化は
   * `resolveLaunchAxes` の resets に任せる — 無効になったものだけが既定に戻り、理由が通知される
   * (US-1 AC4 / session charter)。同じ effort に対応するモデルへ切り替えたときは effort が保たれる。
   *
   * **利用者が Provider / モデル / effort を自分で変えたときは、既定に戻った下流を `resolution.draft` で
   * 書き戻し、通知は 1 回だけ出す** (po L-101)。書き戻さないと、消せない通知が残り続け、Provider を
   * 選び直したときに古いモデル / effort が黙って戻る。
   * 書き戻さないもの:
   * - Provider の reset (確認を要する。書き戻すと既定の資格情報での起動確認 (US-2 AC3) を素通りする)
   * - Provider の到達可能性が確定していない間 (取得中・失敗を到達不可として解決した値を下書きに焼かない)
   * - フォルダ / ランタイムの変更 (到達可能性は新しいランタイムで取り直すため、ここでは確定しない)
   */
  const update = (patch: Partial<LaunchDraft>): void => {
    setConfirming(false)
    const next: LaunchDraft = { ...draft, ...patch }
    const changesCatalogAxis = 'providerId' in patch || 'modelId' in patch || 'effort' in patch
    const settled = resolveLaunchAxes(next, facts)
    const providerSettled =
      (next.providerId === null || reachable.status === 'ready') &&
      !settled.resets.some((r) => r.axis === 'provider')
    if (changesCatalogAxis && providerSettled) {
      setNotices(settled.resets.filter((r) => !r.requiresConfirmation))
      setDraft({ ...next, modelId: settled.draft.modelId, effort: settled.draft.effort })
      return
    }
    setNotices([])
    setDraft(next)
  }

  /** プリセットの適用。下書きを丸ごと差し替え、reset は従来どおり解決結果から通知する (書き戻さない)。 */
  const applyPreset = (next: LaunchDraft): void => {
    setConfirming(false)
    setNotices([])
    setDraft(next)
  }

  /** 到達可能性と解決結果を取り直す。確認中の判断は取り直した結果で出し直す。 */
  const refetch = (): void => {
    setConfirming(false)
    setNonce((n) => n + 1)
  }

  /**
   * ランタイムを取り直してから、到達可能性と解決結果も取り直す (pr-gate H-003)。
   * 失敗は 1 行で示す (po M-102)。失敗しても到達可能性と解決結果は取り直す (従来どおり)。
   */
  const reevaluate = (): void => {
    setReevaluateFailed(false)
    runtimes.refresh().then(refetch, () => {
      setReevaluateFailed(true)
      refetch()
    })
  }

  const launch = (): void => {
    if (launchConfig === null) return
    if (needsConfirmation && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    void session.launch(launchConfig)
  }

  const foldersLoading = folders.list === null && !folders.failed
  const foldersLoadFailed = folders.list === null && folders.failed
  const runtimesLoading = runtimes.list === null && runtimes.loadState === 'loading'
  const runtimesLoadFailed = runtimes.list === null && runtimes.loadState === 'failed'

  const reevaluateButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={reevaluate}
      disabled={runtimes.refreshing}
    >
      {runtimes.refreshing ? REEVALUATE_LABELS.running : REEVALUATE_LABELS.idle}
    </Button>
  )

  // 同じ登録フォルダで動いているセッションの数 (警告のみ。起動はブロックしない。X-5 FE-003)。
  const sameFolderCount =
    effective.folderId === null
      ? 0
      : (session.activeFolderIds ?? []).filter((id) => id === effective.folderId).length

  const shownBlockers = resolution.blockers.filter(
    (b) => b !== 'folder-unselected' && b !== 'runtime-unselected'
  )
  const allRuntimesStopped =
    wslRuntimes.length > 0 && wslRuntimes.every((r) => r.state !== 'running')

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">セッションを起動</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          作業フォルダ・ランタイム・Provider・モデル・effort・権限モードを選んで起動します。
        </p>
      </div>

      <PresetPanel
        view={presets}
        current={config}
        onApply={(preset) => applyPreset(toLaunchDraft(preset.config))}
      />

      {session.phase === 'entry' && session.previousFailure !== null && (
        <p role="alert" className="text-destructive text-sm" data-testid="previous-failure">
          {previousFailureLabel(session.previousFailure)}
        </p>
      )}

      {foldersLoading && (
        <p className="text-muted-foreground text-sm" data-testid="folders-status">
          {LAUNCH_EMPTY_STATE_LABELS.foldersLoading}
        </p>
      )}
      {foldersLoadFailed && (
        <div
          role="alert"
          className="text-destructive flex items-center gap-2 text-sm"
          data-testid="folders-status"
        >
          <p className="flex-1">{LAUNCH_EMPTY_STATE_LABELS.foldersLoadFailed}</p>
          <Button type="button" size="sm" variant="outline" onClick={folders.refresh}>
            {LAUNCH_EMPTY_STATE_LABELS.retry}
          </Button>
        </div>
      )}
      {folders.list !== null && folderList.length === 0 && (
        <p className="text-muted-foreground text-sm">{LAUNCH_EMPTY_STATE_LABELS.noFolders}</p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{LAUNCH_AXIS_LABELS.folder}</span>
        <select
          value={effective.folderId ?? ''}
          onChange={(e) => update({ folderId: e.target.value === '' ? null : e.target.value })}
          className={selectClass}
        >
          <option value="">選択してください</option>
          {folderList.map((f) => (
            <option key={f.id} value={f.id}>
              {f.displayName}
            </option>
          ))}
        </select>
      </label>

      {runtimesLoading && (
        <p className="text-muted-foreground text-sm" data-testid="runtimes-status">
          {LAUNCH_EMPTY_STATE_LABELS.runtimesLoading}
        </p>
      )}
      {runtimesLoadFailed && (
        <div
          role="alert"
          className="text-destructive flex items-center gap-2 text-sm"
          data-testid="runtimes-status"
        >
          <p className="flex-1">{LAUNCH_EMPTY_STATE_LABELS.runtimesLoadFailed}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={reevaluate}
            disabled={runtimes.refreshing}
          >
            {LAUNCH_EMPTY_STATE_LABELS.retry}
          </Button>
        </div>
      )}
      {runtimes.list !== null && wslRuntimes.length === 0 && (
        <p className="text-muted-foreground text-sm">{LAUNCH_EMPTY_STATE_LABELS.noWslRuntimes}</p>
      )}
      {allRuntimesStopped && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <p className="flex-1">{LAUNCH_EMPTY_STATE_LABELS.allRuntimesStopped}</p>
          {!shownBlockers.includes('runtime-stopped') && reevaluateButton}
        </div>
      )}
      {/* 読み込み失敗の行が出ている間は、同じ失敗を再評価の失敗として二重に出さない (po L-203)。 */}
      {reevaluateFailed && !runtimesLoadFailed && (
        <p role="alert" className="text-destructive text-sm" data-testid="reevaluate-failed">
          {REEVALUATE_LABELS.failed}
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{LAUNCH_AXIS_LABELS.runtime}</span>
        <select
          value={effective.runtimeId ?? ''}
          onChange={(e) => update({ runtimeId: e.target.value === '' ? null : e.target.value })}
          className={selectClass}
        >
          <option value="">選択してください</option>
          {wslRuntimes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.distroName ?? r.id}
              {r.state === 'running' ? '' : '（停止中）'}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{LAUNCH_AXIS_LABELS.provider}</span>
        <select
          value={effective.providerId ?? ''}
          onChange={(e) => update({ providerId: e.target.value === '' ? null : e.target.value })}
          className={selectClass}
          aria-label={LAUNCH_AXIS_LABELS.provider}
        >
          <option value="">既定 (ディストロ内の claude の設定)</option>
          {selectableProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>
      {providers.providers !== null && providerList.length === 0 && (
        <p className="text-muted-foreground -mt-2 text-xs">
          {LAUNCH_EMPTY_STATE_LABELS.noProviders}
        </p>
      )}
      {providerList.length > 0 && reachable.status === 'loading' && (
        <p className="text-muted-foreground -mt-2 text-xs" data-testid="reachability-status">
          {REACHABILITY_STATUS_LABELS.loading}
        </p>
      )}
      {providerList.length > 0 && reachable.status === 'failed' && (
        <div
          role="status"
          className="text-destructive -mt-2 flex items-center gap-2 text-xs"
          data-testid="reachability-status"
        >
          <p className="flex-1">{REACHABILITY_STATUS_LABELS.failed}</p>
          <Button type="button" size="sm" variant="outline" onClick={refetch}>
            {REACHABILITY_STATUS_LABELS.retry}
          </Button>
        </div>
      )}
      {reachable.status === 'ready' && reachable.value.excluded.length > 0 && (
        <ul className="text-muted-foreground -mt-2 text-xs" aria-label="選べない Provider">
          {reachable.value.excluded.map((e) => (
            <li key={e.provider.id}>
              {e.provider.displayName} — {REACHABILITY_EXCLUDED_LABELS[e.reason]}
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{LAUNCH_AXIS_LABELS.model}</span>
        <select
          value={effective.modelId ?? ''}
          onChange={(e) => update({ modelId: e.target.value === '' ? null : e.target.value })}
          className={selectClass}
          aria-label={LAUNCH_AXIS_LABELS.model}
        >
          <option value="">既定</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{LAUNCH_AXIS_LABELS.effort}</span>
        <select
          value={effective.effort ?? ''}
          onChange={(e) => {
            const level: unknown = e.target.value
            update({ effort: isEffortLevel(level) ? level : null })
          }}
          className={selectClass}
          aria-label={LAUNCH_AXIS_LABELS.effort}
        >
          <option value="">既定</option>
          {efforts.map((level) => (
            <option key={level} value={level}>
              {EFFORT_LABELS[level]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{LAUNCH_AXIS_LABELS.permissionMode}</span>
        <select
          value={effective.permissionMode}
          onChange={(e) => {
            const mode: unknown = e.target.value
            if (isSafePermissionMode(mode)) update({ permissionMode: mode })
          }}
          className={selectClass}
          aria-label={LAUNCH_AXIS_LABELS.permissionMode}
        >
          {SAFE_PERMISSION_MODES.map((mode: SafePermissionMode) => (
            <option key={mode} value={mode}>
              {PERMISSION_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground text-xs" data-testid="permission-mode-description">
          {PERMISSION_MODE_DESCRIPTIONS[effective.permissionMode]}
        </span>
      </label>

      {shownResets.length > 0 && (
        <ul role="status" className="text-muted-foreground text-xs" aria-label="既定に戻した軸">
          {shownResets.map((r) => (
            <li key={`${r.axis}-${r.reason}`}>
              {reachabilityUnverified && r.reason === 'provider-unreachable'
                ? PROVIDER_RESET_UNVERIFIED_LABEL
                : AXIS_RESET_LABELS[r.reason]}
            </li>
          ))}
        </ul>
      )}

      {sameFolderCount > 0 && (
        <p
          role="note"
          className="text-sm text-amber-700 dark:text-amber-400"
          data-testid="same-folder-warning"
        >
          {sameFolderWarning(sameFolderCount)}
        </p>
      )}

      {crossBoundary !== null && (
        <p
          role="note"
          className="text-sm text-amber-700 dark:text-amber-400"
          data-testid="cross-boundary-warning"
        >
          {CROSS_BOUNDARY_LABELS.lead}
          {crossBoundary.impact ?? CROSS_BOUNDARY_LABELS.fallbackImpact}{' '}
          {CROSS_BOUNDARY_LABELS.launchable}
        </p>
      )}
      {/* 「判定できなかった」は取得 (IPC) の失敗だけ。`blocked` の DTO は下の行で扱う (R3 po M-201)。 */}
      {folderRuntime.status === 'failed' && (
        <p
          role="note"
          className="text-muted-foreground text-sm"
          data-testid="cross-boundary-unknown"
        >
          {CROSS_BOUNDARY_LABELS.unknown}
        </p>
      )}
      {folderRuntimeChecking && config !== null && (
        <p className="text-muted-foreground text-sm" data-testid="folder-runtime-checking">
          {CROSS_BOUNDARY_LABELS.checking}
        </p>
      )}
      {folderRuntimeWaitingProbe && (
        <div
          className="text-muted-foreground flex items-center gap-2 text-sm"
          data-testid="folder-runtime-waiting-probe"
        >
          <p className="flex-1">{FOLDER_RUNTIME_BLOCKED_LABELS.waitingProbe}</p>
          {reevaluateButton}
        </div>
      )}
      {folderRuntimeProbeFailed && (
        <div
          role="alert"
          className="text-destructive flex items-center gap-2 text-sm"
          data-testid="folder-runtime-probe-failed"
        >
          <p className="flex-1">{FOLDER_RUNTIME_BLOCKED_LABELS.probeFailed}</p>
          {reevaluateButton}
        </div>
      )}
      {/* distro 不一致の blocker と同じ事実 (foreign-distro) を二重に出さない。起動はどちらでも止まる。 */}
      {folderRuntimeUnreachable && !shownBlockers.includes('distro-mismatch') && (
        <p
          role="alert"
          className="text-destructive text-sm"
          data-testid="folder-runtime-unreachable"
        >
          {CROSS_BOUNDARY_LABELS.unreachable}
        </p>
      )}

      {shownBlockers.length > 0 && (
        <div role="alert" className="text-destructive flex flex-col gap-1 text-sm">
          {shownBlockers.map((b) => (
            <p key={b}>{LAUNCH_BLOCKER_LABELS[b]}</p>
          ))}
          {shownBlockers.includes('runtime-stopped') && <div>{reevaluateButton}</div>}
        </div>
      )}

      {session.phase === 'rejected' && session.rejectReason !== null && (
        <p role="alert" className="text-destructive text-sm">
          {launchRejectLabel(session.rejectReason)}
        </p>
      )}

      {confirming && (
        <div
          role="alertdialog"
          aria-label="既定 Provider での起動の確認"
          className="flex flex-col gap-2 rounded-md border p-3 text-sm"
        >
          <p>
            {reachabilityUnverified
              ? PROVIDER_RESET_CONFIRMATION_UNVERIFIED
              : PROVIDER_RESET_CONFIRMATION}
          </p>
          <div className="flex gap-2">
            {/* 確認できなかっただけなら、既定で起動する前に確認し直せるようにする (po M-101)。 */}
            {reachabilityUnverified && (
              <Button type="button" size="sm" variant="outline" onClick={refetch}>
                {REACHABILITY_STATUS_LABELS.retry}
              </Button>
            )}
            <Button type="button" size="sm" onClick={launch}>
              既定 Provider で起動する
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              戻って選び直す
            </Button>
          </div>
        </div>
      )}

      <div>
        <Button type="button" disabled={launchConfig === null || confirming} onClick={launch}>
          起動
        </Button>
      </div>
    </div>
  )
}
