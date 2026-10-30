import type { PastResumeDTO } from '@domain/capability'
import type { SessionControl } from '@domain/session/agent-session'
import type { SessionIndexDTO } from '@domain/session/dto'
import type { SafePermissionMode, SessionLaunchConfig } from '@domain/session/launch-config'
import type {
  LiveModelsResult,
  LiveSettingResult,
  RenameResult
} from '@domain/session/live-settings'
import {
  checkLaunchOrigin,
  type LaunchOrigin,
  type LaunchUsageSummaryDTO
} from '@domain/session/launch-usage'
import type { PresetDTO, SavePresetResult } from '@domain/session/preset'
import type { SessionResumeRequest } from '@domain/session/resume'
import type { PastResumeAxes } from '@domain/session/resume-axes'
import type { FailureReason } from '@domain/session/target'
import { isValidPromptText, isValidRequestToken, isValidSessionId } from '@domain/validation'

import type { SavePresetInput } from './preset-service'
import type { LaunchOutcome, ResumeOutcome } from './session-launch-service'
import type { TranscriptResult } from './transcript-service'
import {
  checkLaunchConfig,
  checkRenameArgs,
  checkListModelsArgs,
  checkSetModelArgs,
  checkSetPermissionModeArgs,
  checkPastResumeQuery,
  checkPreset,
  checkResumeRequest,
  isKnownTargetKey,
  isPermissionOutcome,
  isPermissionScope,
  isValidElicitationAction,
  isValidElicitationContent,
  isValidPermissionAnswers,
  isValidSessionOffset
} from './validate'

/**
 * セッション一覧の IPC ハンドラ本体 (BE-028 / BE-029)。
 *
 * **`electron` を import しない。** チャンネルへの登録は `ipc.ts` が行い、
 * ここには「引数をどう検証して何を呼ぶか」だけを置く。
 *
 * 分けてある理由は 1 つで、**SC-010 の計測経路を成立させる**ためである。
 * SC-010 は「preload をスタブせず main 側ハンドラを直接呼ぶ」ことを要求するが、
 * `ipc.ts` は `ipcMain` を import するため Vitest の node 環境で読み込めない。
 * 検証関数だけをテストすると、**ハンドラがその検証関数を呼んでいるか**が
 * 検査されないまま残る — 表の各行を測ったことにならない。
 *
 * **検証の実装は `validate.ts` に集約する** (FR-043)。ここには条件を書かない。
 */

export interface SessionIpcDeps {
  listSessions(): Promise<SessionIndexDTO>
  refreshSessions(): Promise<SessionIndexDTO>
  fetchMoreSessions(targetKey: string, offset: number): Promise<SessionIndexDTO>
  /** 未信頼入力の照合に使う集合。**停止中の所在の `key` も含む。** */
  sessionTargetKeys(): readonly string[]
  /** transcript 取得 (R-3 / AD-034)。**本文は port 経由**、戻り値の handshake は本文を含まない。 */
  getTranscript(
    sessionId: string,
    targetKey: string,
    requestToken: string
  ): Promise<TranscriptResult>

  /* ── セッション起動 + 制御 (X-1 / contracts C-1) ── */

  /**
   * 起動を調停する (X-4: 依存解決の再評価 + env 導出 + VerifiedRunning + distro 一致 + 登録。X-5: 同時実行数の上限)。
   * 本文は port。
   */
  launchSession(config: SessionLaunchConfig): Promise<LaunchOutcome>
  /** 制御を該当セッションへ送る。未知 / セッションスレッドが終わった sessionId なら `false`。 */
  controlSession(sessionId: string, control: SessionControl): boolean
  /** 実行中の権限モードの切り替え (023 / contracts C-1)。検証済みの値で呼ぶ。 */
  setSessionPermissionMode(sessionId: string, mode: SafePermissionMode): Promise<LiveSettingResult>
  /** 実行中のモデルの切り替え (023 / contracts C-2)。検証済みの形で呼ぶ。カタログとの照合は service。 */
  setSessionModel(sessionId: string, modelId: string): Promise<LiveSettingResult>
  /** 既定の Provider のモデルの一覧 (025 / contracts C-7)。検証済みの sessionId で呼ぶ。 */
  listSessionModels(sessionId: string): Promise<LiveModelsResult>
  /** 実行中のセッションの改名 (023 / contracts C-3)。検証済み・trim 済みの名前で呼ぶ。 */
  renameSession(sessionId: string, name: string): Promise<RenameResult>

  /* ── セッションの再開 (X-9 / contracts C-1〜C-3) ── */

  /** 過去の行の軸を決める (列挙のキャッシュだけを見る)。 */
  resolvePastResume(targetKey: string, conversationId: string): Promise<PastResumeAxes>
  /** 再開の要求を解いて起動する。本文は port。 */
  resumeSession(request: SessionResumeRequest): Promise<ResumeOutcome>
  /** それまでの会話の読み取り。本文は port、戻り値の handshake は本文を含まない。 */
  getResumedTranscript(sessionId: string, requestToken: string): Promise<TranscriptResult>

  /* ── プリセット (X-4 / FR-009) ── */

  listPresets(): Promise<readonly PresetDTO[]>
  savePreset(input: SavePresetInput): Promise<SavePresetResult>
  removePreset(id: string): Promise<{ readonly ok: boolean }>
  /** 未信頼入力の照合に使う既知のプリセット id。 */
  presetIds(): Promise<readonly string[]>

  /* ── 起動の利用記録 (O-3 / 012 spec FR-010〜FR-013) ── */

  /** 受け付けた起動を 1 回数える。**reject しない** (失敗は service が握ってログに出す)。呼び出し側は await しない。 */
  recordLaunchUsage(origin: LaunchOrigin): Promise<void>
  /** 直近 30 日の集計。 */
  getLaunchUsage(): Promise<LaunchUsageSummaryDTO>
}

function failedTranscript(requestToken: string, reasonKey: FailureReason): TranscriptResult {
  return { handshake: { status: 'failed', requestToken, reasonKey }, port: null }
}

/**
 * `getTranscript(sessionId, targetKey, requestToken)` (R-3 / BE-024 / [contracts/ipc-transcript.md](../../../specs/003-ui-transcript-rendering/contracts/ipc-transcript.md))。
 *
 * **検証を通らない入力では取得プロセスを起こさず失敗 handshake を返す** (port は `null`)。
 * - `sessionId` は **UUID 形式に一致**すること (path traversal 防止。FR-017 / security H-002)
 * - `targetKey` は既知集合との完全一致 (`isKnownTargetKey`。任意パスとして解釈しない)
 * - `requestToken` は非空文字列 (stale 破棄の照合鍵)
 *
 * **本体を `ipc.ts` から分けてある** — `ipc.ts` は `ipcMain` を import するため Vitest で読めない。
 * port の transfer (`event.sender.postMessage`) だけが `ipc.ts` に残り、検証と service 呼び出しはここで試せる。
 * 返り値の `port` (`MessagePortMain`) は型のみで扱い、実際の transfer は `ipc.ts` が行う。
 */
export async function handleGetTranscript(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<TranscriptResult> {
  const requestToken = args[2]
  if (!isValidRequestToken(requestToken)) {
    return failedTranscript('', 'transcript-read-failed')
  }
  if (!isValidSessionId(args[0])) return failedTranscript(requestToken, 'transcript-read-failed')
  if (!isKnownTargetKey(deps.sessionTargetKeys(), args[1])) {
    return failedTranscript(requestToken, 'transcript-read-failed')
  }
  return deps.getTranscript(args[0], args[1], requestToken)
}

/**
 * `fetchMoreSessions(targetKey, offset)`。
 *
 * **不正な入力では列挙を発行せず、現在のキャッシュを返す。**
 * 例外や理由つきの拒否にしないのは、応答の差から
 * 「どの `targetKey` が存在するか」を renderer が数えられるためである。
 * 停止中の所在の `key` は既知であり照合を通るが、**起動ゲートが列挙を止める**
 * (`session-enumerator` の `checkLaunchAllowed`)。ここで所在の実行状態を見ない —
 * 見ると実行状態の判定が 2 箇所に分かれる。
 */
export async function handleFetchMoreSessions(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<SessionIndexDTO> {
  if (!isKnownTargetKey(deps.sessionTargetKeys(), args[0])) return deps.listSessions()
  if (!isValidSessionOffset(args[1])) return deps.listSessions()
  return deps.fetchMoreSessions(args[0], args[1])
}

/** `listSessions()`。**引数を取らない** — 受け取ると検証対象が増える。 */
export async function handleListSessions(deps: SessionIpcDeps): Promise<SessionIndexDTO> {
  return deps.listSessions()
}

/** `refreshSessions()`。連打の抑制は `session-enumerator` の責務である (C-6)。 */
export async function handleRefreshSessions(deps: SessionIpcDeps): Promise<SessionIndexDTO> {
  return deps.refreshSessions()
}

/* ── セッション起動 + 制御 (X-1 / BE-006・BE-007・BE-011・BE-021) ─────── */

/**
 * `launchSession(config, origin)` (X-4 BE-005 / BE-007 の入口。US-1 の安全ゲート。O-3 で起動元を足した)。
 *
 * **起動設定の形を `checkLaunchConfig` で検証する** (6 軸・安全 3 値・モデル ID の文字種。inline の typeof を持たない)。
 * 意味 (登録済み・到達可能・カタログ・VerifiedRunning・distro 一致・同時実行数の上限) は
 * `launchSession` (→ prepareLaunch / service) が **登録の SSoT に対して**判定する (二重管理を避ける)。
 * 形の不正はプロセスを起こさず `invalid-config` で拒否する。**戻り値の `port` の transfer は `ipc.ts`。**
 *
 * **起動元 (`args[1]`) は計測にだけ使う** (O-3 / 012 spec FR-010):
 * - domain の `checkLaunchOrigin` (厳密比較) で検証する。欠けている・未知でも起動は拒否せず、記録だけを行わない
 * - どの起動元でも、起動の service (`deps.launchSession`) に渡るのは `config` だけで、1 回だけ呼ぶ
 * - 起動が受け付けられた (`launching`) ときだけ、**await せずに** 1 回記録する。拒否・失敗は記録しない
 * - 記録が reject しても同期に投げても、起動の結果は変えない
 */
export async function handleLaunchSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<LaunchOutcome> {
  const config = args[0]
  if (!checkLaunchConfig(config)) return { status: 'rejected', reason: 'invalid-config' }
  const origin = checkLaunchOrigin(args[1])
  const outcome = await deps.launchSession(config)
  if (outcome.status === 'launching' && origin !== null) recordWithoutWaiting(deps, origin)
  return outcome
}

/**
 * `resolvePastResume(targetKey, conversationId)` (X-9 / contracts C-1)。
 * 外れた入力は `source-unknown` (どの `targetKey` が既知かを応答の差で数えさせない)。戻り値は 3 つの id か理由のキーだけ。
 */
export async function handleResolvePastResume(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<PastResumeDTO> {
  const targetKey: unknown = args[0]
  const conversationId: unknown = args[1]
  const check = checkPastResumeQuery(targetKey, conversationId, deps.sessionTargetKeys())
  if (!check.ok || typeof targetKey !== 'string' || typeof conversationId !== 'string') {
    return { ok: false, reason: 'source-unknown' }
  }
  const axes = await deps.resolvePastResume(targetKey, conversationId)
  if (!axes.ok) return { ok: false, reason: axes.reason }
  return {
    ok: true,
    folderId: axes.folderId,
    runtimeId: axes.runtimeId,
    providerId: axes.providerId
  }
}

/**
 * `resumeSession(request, origin)` (X-9 / contracts C-2)。形の検証は `checkResumeRequest` (外れたら `invalid-config`)。
 * 起動元は `launchSession` と同じ扱い (厳密比較。外れても起動は通常どおりで記録だけを行わない。受け付けたときだけ 1 回記録。R-12)。
 * `already-running` は起動しないので記録しない。**戻り値の `port` の transfer は `ipc.ts`。**
 */
export async function handleResumeSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<ResumeOutcome> {
  const request = args[0]
  if (!checkResumeRequest(request, deps.sessionTargetKeys())) {
    return { status: 'rejected', reason: 'invalid-config' }
  }
  const origin = checkLaunchOrigin(args[1])
  const outcome = await deps.resumeSession(request)
  if (outcome.status === 'launching' && origin !== null) recordWithoutWaiting(deps, origin)
  return outcome
}

/**
 * `getResumedTranscript(sessionId, requestToken)` (X-9 / contracts C-3)。`sessionId` は Closta の行の id。
 * 決まらない・知らない行は取得プロセスを起こさず `transcript-read-failed` の失敗 handshake。
 */
export async function handleGetResumedTranscript(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<TranscriptResult> {
  const requestToken = args[1]
  if (!isValidRequestToken(requestToken)) return failedTranscript('', 'transcript-read-failed')
  if (!isValidSessionId(args[0])) return failedTranscript(requestToken, 'transcript-read-failed')
  return deps.getResumedTranscript(args[0], requestToken)
}

/** 記録を待たずに発火する。記録の失敗 (reject・同期の例外) は起動の応答に届かせない (spec FR-012)。 */
function recordWithoutWaiting(deps: SessionIpcDeps, origin: LaunchOrigin): void {
  try {
    deps.recordLaunchUsage(origin).catch(() => undefined)
  } catch {
    // 同期に投げても起動の結果は変えない (記録の失敗は service がログに出す)。
  }
}

/**
 * `getLaunchUsage()` (O-3 / 012 spec FR-013)。**引数を取らない。**
 * 集計済みの DTO の形だけを返す (service の値に余計なキーがあっても renderer に渡さない)。失敗は `unreadable`。
 */
export async function handleGetLaunchUsage(deps: SessionIpcDeps): Promise<LaunchUsageSummaryDTO> {
  try {
    const summary = await deps.getLaunchUsage()
    if (summary.status !== 'ok') return { status: 'unreadable' }
    return {
      status: 'ok',
      preset: summary.preset,
      manual: summary.manual,
      days: summary.days
    }
  } catch {
    return { status: 'unreadable' }
  }
}

/* ── プリセット (X-4 BE-013 / FR-009) ─────────────────────────────── */

/** `listPresets()`。**引数を取らない。** */
export async function handleListPresets(deps: SessionIpcDeps): Promise<readonly PresetDTO[]> {
  return deps.listPresets()
}

/**
 * `savePreset(name, config, overwrite)`。名前は表示名と同じ規則 (正規化後)、config は起動設定と同じ述語
 * (`checkPreset`。preset-record の read 側と同じ)。overwrite は真偽値に限る。
 */
export async function handleSavePreset(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<SavePresetResult> {
  const [name, config, overwrite] = args
  if (
    typeof name !== 'string' ||
    !checkPreset(name, config) ||
    typeof overwrite !== 'boolean'
  ) {
    return { ok: false, reason: 'invalid-preset' }
  }
  return deps.savePreset({ name, config, overwrite })
}

/** `removePreset(id)`。**既知の id との完全一致**で照合する (unregisterFolder と同じ)。 */
export async function handleRemovePreset(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<{ readonly ok: boolean }> {
  const id = args[0]
  if (typeof id !== 'string' || !(await deps.presetIds()).includes(id)) return { ok: false }
  return deps.removePreset(id)
}

/**
 * `sendPrompt(sessionId, text)` (BE-006)。
 *
 * **不正な入力ではプロセスへ送らない。** sessionId が UUID 形式・text が非空/非空白かつバイト長上限内。
 * running / awaiting_permission 中の queue 積みは agents 側 (状態機械) が担う。
 */
export async function handleSendPrompt(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  if (!isValidPromptText(args[1])) return
  deps.controlSession(args[0], { kind: 'send-prompt', text: args[1] })
}

/**
 * `respondPermission(sessionId, requestId, outcome, scope)` (BE-011)。**唯一の承認経路。**
 *
 * **`outcome` / `scope` を明示述語で enum 検証** (`as` 禁止。H-04)。requestId は awaiting 中の要求との一致を
 * セッションスレッド (承認の受け口を保持) が最終判定する — main は本文経路 (port) を持たないため requestId の
 * 妥当性は形状だけを検証する。X-5 で requestId は `crypto.randomUUID()` になったので、**UUID 形式**に締める
 * (不正な形は supervisor まで届けない。design-gate R1 sec L-003)。
 */
export async function handleRespondPermission(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  if (!isValidSessionId(args[1])) return
  if (!isPermissionOutcome(args[2])) return
  if (!isPermissionScope(args[3])) return
  // `answers` (O-10 / AD-052) は省略可。あれば domain の述語で検証し、外れたら制御を送らない。
  const answers: unknown = args[4]
  if (answers !== undefined && !isValidPermissionAnswers(answers)) return
  deps.controlSession(args[0], {
    kind: 'respond-permission',
    decision: {
      requestId: args[1],
      outcome: args[2],
      scope: args[3],
      ...(answers !== undefined ? { answers } : {})
    }
  })
}

/**
 * `respondElicitation(sessionId, requestId, action, content?)` (O-10 / AD-053 Decision 3。contracts C-1')。
 *
 * UUID ×2・`action`・(`accept` のときだけ) `content` を domain の述語で検証する。外れたら制御を送らず、renderer に
 * 失敗も返さない (`respondPermission` と同じ。renderer は送る前に同じ述語で確かめる)。`content` は省略できる
 * (URL の `accept`)。`accept` でないときは `content` を捨てる。URL を開く処理はここに無い (AD-053 Decision 5)。
 */
export async function handleRespondElicitation(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  if (!isValidSessionId(args[1])) return
  const action: unknown = args[2]
  if (!isValidElicitationAction(action)) return
  if (action !== 'accept') {
    deps.controlSession(args[0], {
      kind: 'respond-elicitation',
      response: { requestId: args[1], action }
    })
    return
  }
  const content: unknown = args[3]
  if (content !== undefined && !isValidElicitationContent(content)) return
  deps.controlSession(args[0], {
    kind: 'respond-elicitation',
    response: {
      requestId: args[1],
      action,
      ...(content !== undefined ? { content } : {})
    }
  })
}

/**
 * `setSessionPermissionMode(sessionId, mode)` (023 / contracts C-1)。述語 (`checkSetPermissionModeArgs`) を通らない入力は
 * service を呼ばず `invalid-value`。受け付けの判定と結果の待ちは service が行う。
 */
export async function handleSetSessionPermissionMode(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<LiveSettingResult> {
  if (!checkSetPermissionModeArgs(args)) return { ok: false, reason: 'invalid-value' }
  return deps.setSessionPermissionMode(args[0], args[1])
}

/**
 * `setSessionModel(sessionId, modelId)` (023 / contracts C-2)。述語 (`checkSetModelArgs`) を通らない入力は
 * service を呼ばず `invalid-value`。カタログとの照合・受け付けの判定・結果の待ちは service が行う。
 */
export async function handleSetSessionModel(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<LiveSettingResult> {
  if (!checkSetModelArgs(args)) return { ok: false, reason: 'invalid-value' }
  return deps.setSessionModel(args[0], args[1])
}

/**
 * `listSessionModels(sessionId)` (025 / contracts C-7)。述語 (`checkListModelsArgs`) を通らない入力は service を呼ばず
 * `unknown-session`。受け付けの判定・待ち・絞り込みは service が行う。
 */
export async function handleListSessionModels(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<LiveModelsResult> {
  if (!checkListModelsArgs(args)) return { ok: false, reason: 'unknown-session' }
  return deps.listSessionModels(args[0])
}

/**
 * `renameSession(sessionId, name)` (023 / contracts C-3)。述語 (`checkRenameArgs`) を通らない入力は service を
 * 呼ばず `invalid-value`。通れば trim 済みの名前で改名の service を呼び、結果をそのまま返す。名前をログに出さない。
 */
export async function handleRenameSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<RenameResult> {
  const checked = checkRenameArgs(args)
  if (checked === null) return { ok: false, reason: 'invalid-value' }
  return deps.renameSession(checked[0], checked[1])
}

/** `interruptSession(sessionId)` (BE-021)。中断は kill とは別経路 (FR-015/016)。 */
export async function handleInterruptSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  deps.controlSession(args[0], { kind: 'interrupt' })
}

/**
 * `endSession(sessionId)` (X-5 / FR-011)。穏当な終了。応答待ち・中断済みのときだけセッションスレッドが受け付ける
 * (他の状態では何もしない。判定はセッションの状態を知るセッションスレッドが行う)。
 */
export async function handleEndSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  deps.controlSession(args[0], { kind: 'end' })
}

/** `killSession(sessionId)` (BE-021)。強制終了。セッションスレッドが保持する `SpawnedProcess` (wsl) を直接 kill する。 */
export async function handleKillSession(
  deps: SessionIpcDeps,
  args: readonly unknown[]
): Promise<void> {
  if (!isValidSessionId(args[0])) return
  deps.controlSession(args[0], { kind: 'kill' })
}
