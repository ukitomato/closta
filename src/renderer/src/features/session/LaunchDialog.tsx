import { useEffect, useMemo, useState } from 'react'

import { CAPABILITY_KEY } from '@domain/capability'
import type { ReachableProvidersDTO } from '@domain/provider/dto'
import { isEffortLevel } from '@domain/provider/model-catalog'
import type { EffortLevel } from '@domain/provider/types'
import type { LaunchFailureReason } from '@domain/session/agent-session'
import {
  DEFAULT_EXTRA_AXES,
  isSafePermissionMode,
  MAX_ADDITIONAL_DIRECTORIES,
  SAFE_PERMISSION_MODES,
  type SafePermissionMode,
  type SessionLaunchConfig
} from '@domain/session/launch-config'
import type { LaunchOrigin } from '@domain/session/launch-usage'
import type { SessionResumeRequest } from '@domain/session/resume'
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
import {
  WIN32_CLAUDE_STATUS_REASONS,
  WIN32_CLAUDE_WHERE_TO_FIX_LABEL
} from '@/features/runtime-list/labels'
import { useRuntimes } from '@/features/runtime-list/useRuntimes'
import { useFolders } from '@/features/workspace-folders/useFolders'

import {
  AXIS_RESET_LABELS,
  CROSS_BOUNDARY_LABELS,
  DIRECTORY_RESET_LABELS,
  directoryCrossBoundaryLabel,
  EXTRA_AXES_LABELS,
  FOLDER_RUNTIME_BLOCKED_LABELS,
  LAUNCH_AXIS_LABELS,
  LAUNCH_BLOCKER_LABELS,
  LAUNCH_EMPTY_STATE_LABELS,
  launchRejectLabel,
  PERMISSION_MODE_LABELS,
  previousFailureLabel,
  PROVIDER_DEFAULT_LABELS,
  PROVIDER_RESET_CONFIRMATION,
  PROVIDER_RESET_CONFIRMATION_UNVERIFIED,
  PROVIDER_RESET_UNVERIFIED_LABEL,
  REACHABILITY_EXCLUDED_LABELS,
  REACHABILITY_STATUS_LABELS,
  REEVALUATE_LABELS,
  RESUME_LABELS,
  sameFolderWarning
} from './labels'
import { LaunchExtraAxes } from './LaunchExtraAxes'
import {
  additionalDirectoryChoices,
  limitInputOf,
  parseMaxBudgetInput,
  parseMaxTurnsInput,
  parseSessionNameInput
} from './launch-extra-axes'
import {
  buildLaunchRuntimeFacts,
  buildLaunchRuntimeOptions,
  orderLaunchRuntimes,
  unusableWin32Status
} from './launch-runtime-options'
import { PresetPanel } from './PresetPanel'
import type { LaunchRejectReason, ResumeDialogState } from './running-session-types'
import { usePresets } from './usePresets'

/** 起動設定ダイアログが読む起動の状態と、起動の発火口 (X-5: セッションストアの `launch` から組む)。 */
export interface LaunchSource {
  readonly phase: 'entry' | 'launching' | 'rejected'
  readonly rejectReason: LaunchRejectReason | null
  /**
   * 再開の形で開くときの状態 (X-9 / data-model §9.3)。null・省略は新規起動の形 (既存の呼び出しは変えない)。
   * 再開の形では引き継ぐ 3 軸 (フォルダ / ランタイム / Provider) の選択の部品を出さず、起動は `resumeSession` を通る。
   */
  readonly resume?: ResumeDialogState | null
  resumeSession?(request: SessionResumeRequest, origin: LaunchOrigin): Promise<void>
  readonly lastConfig: SessionLaunchConfig | null
  /** `lastConfig` と組の起動元 (O-3)。初期値の設定のまま起動したときだけ引き継ぐ。 */
  readonly lastOrigin: LaunchOrigin | null
  readonly previousFailure: LaunchFailureReason | null
  /** 終わっていないセッションの作業フォルダ (同一フォルダの警告。X-5 FE-003)。重複を数える。 */
  readonly activeFolderIds?: readonly string[]
  /** `origin` は起動元 (O-3 / 012 data-model §4「renderer の起動元」。計測にだけ使い、`config` に影響させない)。 */
  launch(config: SessionLaunchConfig, origin: LaunchOrigin): Promise<void>
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
 * | 起動元: このダイアログで適用したら `preset` (適用後に軸を変えても)、適用せずに軸を手で変えたら `manual`、どちらも無ければ初期値の設定と組の `lastOrigin` (前回の設定が無ければ `manual`)。「手で変えた」は `update` を通ったかで決め、依存解決の自動の reset は数えない | O-3 / 012 spec FR-009 / data-model §4「renderer の起動元」 |
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
  permissionMode: 'default',
  // 024: 新しい 3 軸は既定のまま (起動ダイアログの部品は US-1〜US-3 で足す)。名前は下書きに入れない。
  ...DEFAULT_EXTRA_AXES
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

/** 追加ディレクトリ 1 件の解決結果 DTO の取得結果。`failed` は IPC の失敗 (判定できないだけ。起動は許す)。 */
interface DirectoryEntry {
  readonly dto: FolderRuntimeResolutionDTO | null
  readonly failed: boolean
}

/**
 * 追加ディレクトリの解決結果 DTO (024 research R-11)。今の `useFolderRuntimeResolution` を複数の id に広げたもの。
 * 同じ `runtimeRevision` をキーに含め、取得結果は項目ごとにキャッシュする (項目の追加・削除で他の項目の結果を
 * 捨てず、「取得中」に戻して通知を瞬間的に消さない)。`entryOf(id)` が `undefined` の間は取得中。
 */
function useAdditionalDirectoryResolutions(
  ids: readonly string[],
  runtimeId: string | null,
  revision: string
): (id: string) => DirectoryEntry | undefined {
  const [cache, setCache] = useState<Readonly<Record<string, DirectoryEntry>>>({})
  const idsKey = ids.join('\u0000')
  useEffect(() => {
    if (runtimeId === null || idsKey === '') return
    let cancelled = false
    for (const id of idsKey.split('\u0000')) {
      const key = `${id}|${runtimeId}|${revision}`
      const store = (entry: DirectoryEntry): void => {
        if (!cancelled) setCache((prev) => ({ ...prev, [key]: entry }))
      }
      capability()
        .resolveFolderRuntime(id, runtimeId)
        .then(
          (dto) => store({ dto, failed: false }),
          () => store({ dto: null, failed: true })
        )
    }
    return () => {
      cancelled = true
    }
  }, [idsKey, runtimeId, revision])
  return (id) => (runtimeId === null ? undefined : cache[`${id}|${runtimeId}|${revision}`])
}

const selectClass = 'border-border bg-background rounded-md border px-2 py-1.5 text-sm'

export function LaunchDialog({ session }: { readonly session: LaunchSource }): React.JSX.Element {
  const folders = useFolders()
  const runtimes = useRuntimes()
  const providers = useProviders()
  const presets = usePresets()

  /** 再開の形 (X-9)。null なら新規起動の形で、以下の再開の分岐は何も変えない。 */
  const resume = session.resume ?? null
  const [draft, setDraft] = useState<LaunchDraft>(() => {
    if (resume === null)
      return session.lastConfig !== null ? toLaunchDraft(session.lastConfig) : EMPTY_DRAFT
    // 再開: 拒否で戻ったときは直前の選びを、そうでなければ `initial` (null は既定) を出す。引き継ぐ 3 軸は `fixed`。
    const base =
      session.phase === 'rejected' && session.lastConfig !== null
        ? toLaunchDraft(session.lastConfig)
        : { ...EMPTY_DRAFT, ...resume.initial }
    return { ...base, ...resume.fixed }
  })
  /**
   * 初期値の設定と組の起動元 (O-3)。下書きの初期値と同じ時点で 1 回だけ決める — 前回の設定を初期値に出すなら、経路
   * (拒否・失敗・受け付けの後・起動せずに閉じた後) を問わずその起動元、出さないなら `manual`。
   * 再開の形は `initialOrigin` (拒否で戻ったときは直前の起動元。X-9 §9.3)。
   */
  const [initialOrigin] = useState<LaunchOrigin>(() => {
    if (resume !== null)
      return session.phase === 'rejected' && session.lastOrigin !== null
        ? session.lastOrigin
        : resume.initialOrigin
    return session.lastConfig !== null ? (session.lastOrigin ?? 'manual') : 'manual'
  })
  /**
   * 上限の入力の文字列 (024 data-model §9.2.1)。下書きの初期値と同じ時点・同じ元から 1 回だけ決める
   * (拒否・失敗・「やり直す」の後に黙って「上限なし」に戻さない)。
   */
  const [maxTurnsInput, setMaxTurnsInput] = useState(() => limitInputOf(draft.maxTurns))
  const [maxBudgetInput, setMaxBudgetInput] = useState(() => limitInputOf(draft.maxBudgetUsd))
  const maxTurnsParsed = parseMaxTurnsInput(maxTurnsInput)
  const maxBudgetParsed = parseMaxBudgetInput(maxBudgetInput)
  /** 上限の入力欄は新規起動の形・再開の形のどちらにも出る (再開は元の値が初期値。024 FR-012)。 */
  const limitsInvalid = !maxTurnsParsed.ok || !maxBudgetParsed.ok
  /**
   * セッション名の入力の文字列 (data-model §9.2.1)。下書きに入れない。新規の起動の形で `lastConfig` があれば
   * その名前、それ以外は空 (再開の形は名前の部品を出さない)。
   */
  const [sessionNameInput, setSessionNameInput] = useState(() =>
    resume === null && session.lastConfig !== null ? (session.lastConfig.sessionName ?? '') : ''
  )
  const sessionNameParsed = parseSessionNameInput(sessionNameInput)
  /** このダイアログでプリセットを適用したか (O-3)。作り直したダイアログでは初めから。 */
  const [presetApplied, setPresetApplied] = useState(false)
  /** このダイアログで軸を手で変えたか (`update` を通ったか。変えてから戻しても立ったまま。O-3)。 */
  const [axisEdited, setAxisEdited] = useState(false)
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
  // 起動できるのは WslRuntime と Win32Runtime (X-8)。Win32 が先頭、続けて WSL (FR-001)。
  const wslRuntimes = useMemo(
    () => (runtimes.list?.runtimes ?? []).filter((r) => r.kind === 'wsl'),
    [runtimes.list]
  )
  const launchRuntimes = useMemo(
    () => orderLaunchRuntimes(runtimes.list?.runtimes ?? []),
    [runtimes.list]
  )
  const runtimeOptions = useMemo(() => buildLaunchRuntimeOptions(launchRuntimes), [launchRuntimes])
  const unusableWin32 = useMemo(() => unusableWin32Status(launchRuntimes), [launchRuntimes])
  const providerList = useMemo(() => providers.providers ?? [], [providers.providers])
  const selectedRuntime = launchRuntimes.find((r) => r.id === draft.runtimeId) ?? null
  const selectedRuntimeState = selectedRuntime?.state ?? null
  const selectedProbeState = selectedRuntime?.capabilities.probeState ?? null
  /** 選択ランタイムの版。到達可能性と解決結果の取得キーで共有する (R3 platform-boundary M-501)。 */
  const runtimeRevision = `${selectedRuntimeState ?? ''}|${selectedProbeState ?? ''}|${nonce}`
  const reachable = useReachable(draft.runtimeId, runtimeRevision)
  const folderRuntime = useFolderRuntimeResolution(draft.folderId, draft.runtimeId, runtimeRevision)
  const directoryEntryOf = useAdditionalDirectoryResolutions(
    draft.additionalDirectoryIds,
    draft.runtimeId,
    runtimeRevision
  )
  // DTO が unreachable / probe-failed の項目は依存解決が外す (`unreachableFolderIds`。data-model §2.3)。
  const unreachableFolderIds = draft.additionalDirectoryIds.filter((id) => {
    const dto = directoryEntryOf(id)?.dto
    return (
      dto?.reachability === 'unreachable' ||
      (dto?.reachability === 'blocked' && dto.blockedReason === 'probe-failed')
    )
  })
  const unreachableKey = unreachableFolderIds.join('\u0000')

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
      // 選んでいれば runtime-missing に倒れる。namespace.ts / pb L-001)。Win32 は claude.exe が found のときだけ入る。
      runtimes: buildLaunchRuntimeFacts(launchRuntimes),
      providers: providerList.map((p) => ({
        id: p.id,
        reachable: reachableIds.has(p.id),
        models: p.models
      })),
      unreachableFolderIds: unreachableKey === '' ? [] : unreachableKey.split('\u0000')
    }
  }, [folderList, launchRuntimes, providerList, reachable, unreachableKey])

  const resolution = resolveLaunchAxes(draft, facts)
  const effective = resolution.draft
  // **取得中は reset を保留する** (pr-gate H-004)。取得中は到達不可として解決するため、選んでいた Provider が
  // 既定に落ちて見えるが、下書きは消さず、通知も起動も保留する (取得後に同じ下書きを解決し直す)。
  const holdResets =
    (reachable.status === 'idle' || reachable.status === 'loading') && draft.providerId !== null
  // 再開では引き継ぐ Provider を既定へ落とさない (別の資格情報で黙って再開しない)。到達できなければ main の起動ゲートが
  // 理由つきで拒否する (X-9 FR-008)。確認も出さない。フォルダ / ランタイムの欠落も main が拒否するので blocker では止めない。
  const resets = holdResets
    ? []
    : resume !== null
      ? resolution.resets.filter((r) => r.axis !== 'provider')
      : resolution.resets
  const config: SessionLaunchConfig | null = holdResets
    ? null
    : resume !== null
      ? {
          ...resume.fixed,
          modelId: effective.modelId,
          effort: effective.effort,
          permissionMode: effective.permissionMode,
          additionalDirectoryIds: effective.additionalDirectoryIds,
          maxTurns: effective.maxTurns,
          maxBudgetUsd: effective.maxBudgetUsd,
          // 再開は名前を渡さない (024 FR-012 / AD-064 Decision 5)
          sessionName: null
        }
      : // 名前は入力の解釈の結果 (不正なら起動を止めるので、ここでは null に倒す)。
        toLaunchConfig(resolution, sessionNameParsed.ok ? sessionNameParsed.value : null)
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
  // 追加ディレクトリ (024)。残った項目 (`effective`) の DTO を見る: 取得中と `capabilities-not-probed` は起動を保留、
  // 越境は警告だけ、IPC の失敗は「判定できません」の注記だけで起動は許す。unreachable / probe-failed の項目は
  // 依存解決が外して通知する (起動は止めない)。
  const directoryName = (id: string): string =>
    folderList.find((f) => f.id === id)?.displayName ?? EXTRA_AXES_LABELS.deletedFolder
  const directoryItems = effective.additionalDirectoryIds.map((id) => ({
    id,
    name: directoryName(id),
    entry: directoryEntryOf(id)
  }))
  const directoriesChecking = directoryItems.some((i) => i.entry === undefined)
  const directoriesWaitingProbe = directoryItems.some(
    (i) =>
      i.entry?.dto?.reachability === 'blocked' &&
      i.entry.dto.blockedReason === 'capabilities-not-probed'
  )
  const directoryCrossItems = directoryItems.filter((i) => i.entry?.dto?.boundary === 'cross')
  const directoryUnknownItems = directoryItems.filter((i) => i.entry?.failed === true)
  // 依存解決で外した項目が往復で戻ると、見える件数が上限を超えうる。超えたまま起動させない (H-002)。
  const directoriesOverLimit = effective.additionalDirectoryIds.length > MAX_ADDITIONAL_DIRECTORIES
  const launchConfig =
    folderRuntimeChecking ||
    folderRuntimeWaitingProbe ||
    folderRuntimeUnreachable ||
    folderRuntimeProbeFailed ||
    directoriesChecking ||
    directoriesWaitingProbe ||
    limitsInvalid ||
    directoriesOverLimit ||
    (resume === null && !sessionNameParsed.ok)
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
    setAxisEdited(true)
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

  /**
   * プリセットの適用。下書きを丸ごと差し替え、reset は従来どおり解決結果から通知する (書き戻さない)。
   * 「適用した」に数え、「軸を手で変えた」には数えない (O-3)。
   */
  const applyPreset = (next: LaunchDraft): void => {
    setConfirming(false)
    setNotices([])
    setPresetApplied(true)
    // 再開では選び直せる 6 軸だけに当てる (引き継ぐ 3 軸は変えない。spec Edge Cases / 024 FR-009)。
    const applied: LaunchDraft =
      resume === null
        ? next
        : {
            ...draft,
            modelId: next.modelId,
            effort: next.effort,
            permissionMode: next.permissionMode,
            additionalDirectoryIds: next.additionalDirectoryIds,
            maxTurns: next.maxTurns,
            maxBudgetUsd: next.maxBudgetUsd
          }
    setDraft(applied)
    // 上限の入力の文字列もプリセットの値で置き換える。名前の入力には触れない (プリセットは名前を持たない)。
    setMaxTurnsInput(limitInputOf(applied.maxTurns))
    setMaxBudgetInput(limitInputOf(applied.maxBudgetUsd))
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
    const origin: LaunchOrigin = presetApplied ? 'preset' : axisEdited ? 'manual' : initialOrigin
    if (resume !== null) {
      // 再開: `config` の引き継ぐ 3 軸は `fixed` (main が source から解いた値と照合する)。
      void session.resumeSession?.({ source: resume.source, config: launchConfig }, origin)
      return
    }
    void session.launch(launchConfig, origin)
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
  const warnFolderId = resume !== null ? resume.fixed.folderId : effective.folderId
  const sameFolderCount =
    warnFolderId === null
      ? 0
      : (session.activeFolderIds ?? []).filter((id) => id === warnFolderId).length

  // 一覧をまだ持たない (読み込み中・失敗) 間は「解除された / 見つからない」と断定しない。ダイアログの作り直し
  // (拒否後の再表示など) の直後に、前回の設定の folder / runtime が一覧に無いと誤って出る (一覧の失敗は別に案内する)。
  // 再開では引き継ぐ軸の欠落を blocker で止めない (main が理由つきで拒否する。X-9 FR-008)。
  const shownBlockers = resolution.blockers.filter(
    (b) =>
      resume === null &&
      b !== 'folder-unselected' &&
      b !== 'runtime-unselected' &&
      !(b === 'folder-missing' && folders.list === null) &&
      !(b === 'runtime-missing' && runtimes.list === null)
  )
  const allRuntimesStopped =
    resume === null && wslRuntimes.length > 0 && wslRuntimes.every((r) => r.state !== 'running')

  // 再開の形の引き継ぐ 3 軸の表示名 (一覧を読み込み中は空。一覧があって引けなければ「(削除済み)」)。
  const fixedNames =
    resume === null
      ? null
      : {
          folder:
            folders.list === null
              ? ''
              : (folderList.find((f) => f.id === resume.fixed.folderId)?.displayName ??
                RESUME_LABELS.deleted),
          runtime:
            runtimes.list === null
              ? ''
              : (runtimeOptions.find((o) => o.id === resume.fixed.runtimeId)?.label ??
                RESUME_LABELS.deleted),
          provider:
            resume.fixed.providerId === null
              ? selectedRuntime?.kind === 'win32'
                ? PROVIDER_DEFAULT_LABELS.win32
                : PROVIDER_DEFAULT_LABELS.wsl
              : providers.providers === null
                ? ''
                : (providerList.find((p) => p.id === resume.fixed.providerId)?.displayName ??
                  RESUME_LABELS.deleted)
        }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">
          {resume === null ? 'セッションを起動' : RESUME_LABELS.heading}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {resume === null
            ? '作業フォルダ・ランタイム・Provider・モデル・effort・権限モードを選んで起動します。'
            : RESUME_LABELS.description}
        </p>
      </div>

      {fixedNames !== null && (
        <dl className="flex flex-col gap-2 text-sm" data-testid="resume-fixed-axes">
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium">{LAUNCH_AXIS_LABELS.folder}</dt>
            <dd>{fixedNames.folder}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium">{LAUNCH_AXIS_LABELS.runtime}</dt>
            <dd>{fixedNames.runtime}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium">{LAUNCH_AXIS_LABELS.provider}</dt>
            <dd>{fixedNames.provider}</dd>
          </div>
        </dl>
      )}

      <PresetPanel
        view={presets}
        current={limitsInvalid ? null : config}
        onApply={(preset) => applyPreset(toLaunchDraft(preset.config))}
      />
      {limitsInvalid && (
        <p className="text-muted-foreground text-xs" data-testid="preset-limits-invalid">
          {EXTRA_AXES_LABELS.presetSaveLimitsInvalid}
        </p>
      )}

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
      {resume === null && folders.list !== null && folderList.length === 0 && (
        <p className="text-muted-foreground text-sm">{LAUNCH_EMPTY_STATE_LABELS.noFolders}</p>
      )}
      {resume === null && (
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
      )}

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
      {resume === null && runtimes.list !== null && wslRuntimes.length === 0 && (
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
      {resume === null && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{LAUNCH_AXIS_LABELS.runtime}</span>
          <select
            value={effective.runtimeId ?? ''}
            onChange={(e) => update({ runtimeId: e.target.value === '' ? null : e.target.value })}
            className={selectClass}
            aria-describedby={unusableWin32 !== null ? 'win32-claude-guidance' : undefined}
          >
            <option value="">選択してください</option>
            {runtimeOptions.map((o) => (
              <option key={o.id} value={o.id} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {resume === null && unusableWin32 !== null && (
        <div
          id="win32-claude-guidance"
          className="text-muted-foreground -mt-2 text-xs"
          data-testid="win32-claude-guidance"
        >
          <p>{WIN32_CLAUDE_STATUS_REASONS[unusableWin32]}</p>
          <p>{WIN32_CLAUDE_WHERE_TO_FIX_LABEL}</p>
        </div>
      )}

      {resume === null && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{LAUNCH_AXIS_LABELS.provider}</span>
          <select
            value={effective.providerId ?? ''}
            onChange={(e) => update({ providerId: e.target.value === '' ? null : e.target.value })}
            className={selectClass}
            aria-label={LAUNCH_AXIS_LABELS.provider}
          >
            <option value="">
              {selectedRuntime?.kind === 'win32'
                ? PROVIDER_DEFAULT_LABELS.win32
                : PROVIDER_DEFAULT_LABELS.wsl}
            </option>
            {selectableProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
      {resume === null && providers.providers !== null && providerList.length === 0 && (
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
      </label>

      {/* 再開の形でも出す (名前の部品だけ出さない) */}
      <LaunchExtraAxes
        showSessionName={resume === null}
        choices={additionalDirectoryChoices(
          folderList,
          effective.folderId,
          effective.additionalDirectoryIds
        )}
        items={directoryItems}
        full={effective.additionalDirectoryIds.length >= MAX_ADDITIONAL_DIRECTORIES}
        onAdd={(id) =>
          update({
            // 見えている項目 (effective) を基準にする。外して通知した項目が下書きから黙って戻らない (H-002)。
            additionalDirectoryIds: effective.additionalDirectoryIds.includes(id)
              ? effective.additionalDirectoryIds
              : [...effective.additionalDirectoryIds, id]
          })
        }
        onRemove={(id) =>
          update({
            additionalDirectoryIds: effective.additionalDirectoryIds.filter((x) => x !== id)
          })
        }
        sessionNameInput={sessionNameInput}
        sessionNameInvalid={!sessionNameParsed.ok}
        onSessionNameChange={(raw) => {
          setConfirming(false)
          setSessionNameInput(raw)
        }}
        onSessionNameSubmit={() => {
          // 確認中の Enter で確認のボタンを飛ばして起動しない (H-004)。
          if (!confirming) launch()
        }}
        maxTurnsInput={maxTurnsInput}
        maxBudgetInput={maxBudgetInput}
        maxTurnsInvalid={!maxTurnsParsed.ok}
        maxBudgetInvalid={!maxBudgetParsed.ok}
        onMaxTurnsChange={(raw) => {
          setMaxTurnsInput(raw)
          const parsed = parseMaxTurnsInput(raw)
          // 不正な間は下書きを変えない (起動は押せない)。直すと下書きが追いつく。
          if (parsed.ok) update({ maxTurns: parsed.value })
          else setConfirming(false)
        }}
        onMaxBudgetChange={(raw) => {
          setMaxBudgetInput(raw)
          const parsed = parseMaxBudgetInput(raw)
          if (parsed.ok) update({ maxBudgetUsd: parsed.value })
          else setConfirming(false)
        }}
      />

      {directoriesOverLimit && (
        <p role="alert" className="text-destructive text-xs" data-testid="directories-over-limit">
          {EXTRA_AXES_LABELS.directoriesOverLimit}
        </p>
      )}

      {resolution.directoryResets.length > 0 && (
        <ul
          role="status"
          className="text-muted-foreground text-xs"
          aria-label="外した追加ディレクトリ"
        >
          {resolution.directoryResets.map((r) => (
            <li key={`${r.folderId}-${r.reason}`}>
              {DIRECTORY_RESET_LABELS[r.reason](directoryName(r.folderId))}
            </li>
          ))}
        </ul>
      )}

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
      {directoryCrossItems.map((i) => (
        <p
          key={`cross-${i.id}`}
          role="note"
          className="text-sm text-amber-700 dark:text-amber-400"
          data-testid="directory-cross-boundary-warning"
        >
          {directoryCrossBoundaryLabel(
            i.name,
            `${CROSS_BOUNDARY_LABELS.lead}${i.entry?.dto?.recommendation?.impact ?? CROSS_BOUNDARY_LABELS.fallbackImpact} ${CROSS_BOUNDARY_LABELS.launchable}`
          )}
        </p>
      ))}
      {directoryUnknownItems.map((i) => (
        <p
          key={`unknown-${i.id}`}
          role="note"
          className="text-muted-foreground text-sm"
          data-testid="directory-cross-boundary-unknown"
        >
          {directoryCrossBoundaryLabel(i.name, CROSS_BOUNDARY_LABELS.unknown)}
        </p>
      ))}
      {directoriesChecking && config !== null && directoryItems[0] !== undefined && (
        <p className="text-muted-foreground text-sm" data-testid="directory-checking">
          {directoryCrossBoundaryLabel(directoryItems[0].name, CROSS_BOUNDARY_LABELS.checking)}
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
            {
              (reachabilityUnverified
                ? PROVIDER_RESET_CONFIRMATION_UNVERIFIED
                : PROVIDER_RESET_CONFIRMATION)[selectedRuntime?.kind === 'win32' ? 'win32' : 'wsl']
            }
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
          {resume === null ? '起動' : RESUME_LABELS.submit}
        </Button>
      </div>
    </div>
  )
}
