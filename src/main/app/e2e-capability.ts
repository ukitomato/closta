import { randomUUID } from 'node:crypto'

import { MessageChannelMain, type MessagePortMain } from 'electron'

import type { ProviderSummaryDTO } from '@domain/provider/dto'
import type { ModelEntry } from '@domain/provider/types'
import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor, WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import type { RuntimeDescriptorDTO, RuntimeListDTO } from '@domain/runtime/dto'
import { wslNamespace } from '@domain/runtime/namespace'
import type { LaunchInput, SessionControl, SessionEvent } from '@domain/session/agent-session'
import type { SessionIndexDTO, SessionSummaryDTO } from '@domain/session/dto'
import { normalizePresetName } from '@domain/session/launch-config'
import {
  liveSettingBlocker,
  normalizeSessionName,
  type RenameResult
} from '@domain/session/live-settings'
import {
  addLaunch,
  EMPTY_LAUNCH_USAGE,
  prune,
  summarizeLaunchUsage,
  toLocalDayKey,
  type LaunchUsage,
  type LocalDayKey
} from '@domain/session/launch-usage'
import { cwdKeyOf } from '@domain/session/match'
import type { PresetDTO } from '@domain/session/preset'
import { canEnd, type SessionRunState } from '@domain/session/run-state'
import { BODY_MAX_BYTES } from '@domain/session/sanitize-body'
import { coalesceUpdates, type SessionStatusUpdate } from '@domain/session/status-update'
import type { TranscriptMessageDTO } from '@domain/session/transcript-dto'
import type { FolderListDTO, WorkspaceFolderDTO } from '@domain/workspace/dto'

import type { IpcDependencies, ProbeRuntimeResult } from './ipc'
import { noMeasure } from './measure'
import { createResumeService } from './resume-service'
import {
  createSessionLaunchService,
  type LaunchOutcome,
  type LaunchPreparation,
  type SupervisorConnection
} from './session-launch-service'
import { createSessionStatusRelay, type SessionStatusRelay } from './session-status-relay'

/**
 * **E2E capability stub (X-2 / AD-038 D3 / T030。production-inert)。**
 *
 * Principle VIII の Automated 2 項目 (IME E2E / 日本語スクリーンショット比較) を **real な Claude 認証・WSL・
 * 外部 API・秘密なしに** 走らせるため、有効 composer (active phase・`isDisabled: false`) へ到達させる最小の fake。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **`!app.isPackaged && process.env.CLOSTA_E2E === '1'` のときだけ配線する。** 呼び出しは `src/main/index.ts` の 1 分岐のみ | AD-038 D3 / origins.ts E-H004 (env 単独ゲート禁止) |
 * | **単一 capability 境界を保つ** — preload も `window.closta` も本番と同一。ここは `IpcDependencies` を差し替えるだけで、第 2 の exposeInMainWorld を作らない | FR-039 |
 * | **プロセスを起こさない** — `utilityProcess` / `fork` / `spawn` を使わず `MessageChannelMain` の port1 を main に保持して合成 `SessionEvent` を流す。したがって `PROCESS_SPAWN_MODULES` (check.mjs #7) に載らない | Principle VI / AD-038 D3 |
 * | **起動調停は本物を使う** (X-5) — 上限・制御の宛先・状態通知の受信規則を本番と共有し、fake は supervisor 接続だけ。単一セッション不変の複製は持たない | USER 決定 design-gate R1 / design-gate R1 arch H-007 |
 * | **会話本文・資格情報を運ばない** — 合成テキストのみを生成する (real の supervisor↔renderer 直通データ経路は不変。本番では本コードに到達しない) | Principle V / Principle IX |
 * | **WSL を名指さない** — fake の distro 名は表示用の合成値であり `wsl.exe` を呼ばない | Principle VI |
 */

/** 合成ランタイム descriptor の共通部分 (IPC の `findRuntime` 照合用。`wsl.exe` を呼ばない)。 */
function descriptorBase(
  now: number
): Omit<WslRuntimeDescriptor, 'id' | 'distroName' | 'isDefault'> {
  return {
    kind: 'wsl',
    state: 'running',
    wslVersion: 2,
    pathMapping: null,
    capabilities: fixedCapabilities(now),
    detectedAt: now
  }
}

/** fake の値の生成時刻。DTO の `detectedAt` / `registeredAt` に使う。 */
function emptySessionIndex(fetchedAt: number): SessionIndexDTO {
  return { groups: [], outcomes: [], fetchedAt, complete: true }
}

/** 固定の索引の時刻 (取得時刻・最終更新)。実行ごとに変えない (012 data-model §7)。 */
const E2E_INDEX_AT = Date.UTC(2026, 0, 15, 3, 0)

/** 固定の索引の 1 行。題と表示用の値だけを持ち、会話の本文・設定の値・資格情報を含めない (AD-038 / H-3)。 */
function e2ePastRow(
  overrides: Pick<SessionSummaryDTO, 'sessionId' | 'targetKey' | 'cwd' | 'originKind'> &
    Partial<SessionSummaryDTO>
): SessionSummaryDTO {
  return {
    targetLabel: 'e2e',
    summary: null,
    firstPrompt: null,
    customTitle: null,
    lastModified: E2E_INDEX_AT,
    // 行に時刻を出さない (基準画像がタイムゾーンで変わらない。012 data-model §7)。
    createdAt: null,
    fileSize: 2048,
    gitBranch: null,
    tag: null,
    cwdDisplay: null,
    programmatic: false,
    worktree: false,
    boundary: 'native',
    normalized: { truncated: false, controlCharsRemoved: false },
    ...overrides
  }
}

/**
 * **過去のセッションの固定の索引** (O-3 / BE-010 / 012 data-model §7)。サイドバーの過去の区画の基準画像と高さの確認
 * (`e2e/sidebar-screenshot.spec.ts`) が使う。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 登録フォルダ (`E2E Project`) 3 行・(`E2E Windows Project`) 1 行・未登録 2 行 (既定で畳む) | data-model §7 |
 * | 列挙の結果は全部 `ok` で `complete: true` (「列挙の結果」が 1 行の要約になる) | data-model §7 / §6 |
 * | 行は題を必ず持ち、`createdAt` は `null` (識別子と時刻の代替表示を出さない)。取得時刻は固定 | data-model §7 |
 * | 題は既存の E2E の locator (起動・composer・稼働中の行・`コンパクト` / `詳しく` などの部分一致) と重ならない合成の文 | plan RK-07 |
 * | 会話の本文・設定の値・資格情報を含めない | AD-038 / H-3 |
 */
function e2eSessionIndex(input: {
  readonly runtimeId: ReturnType<typeof wslNamespace>
  readonly distroName: string
  readonly folderId: string
  readonly winFolderId: string
}): SessionIndexDTO {
  const wslTarget = `${input.runtimeId}#0`
  const hostTarget = 'host#0'
  const wslRow = (sessionId: string, extra: Partial<SessionSummaryDTO>): SessionSummaryDTO =>
    e2ePastRow({
      sessionId,
      targetKey: wslTarget,
      cwd: { namespace: input.runtimeId, value: '/home/e2e/project' },
      originKind: 'wsl-inherited',
      ...extra
    })
  const scratch = { namespace: input.runtimeId, value: '/home/e2e/scratch' } as const
  return {
    groups: [
      {
        kind: 'folder',
        folderId: input.folderId,
        boundary: 'native',
        sessions: [
          wslRow('e2e00000-0000-4000-8000-000000000001', {
            customTitle: 'ログイン画面の API 修正 v2',
            gitBranch: 'feature/login-v2',
            tag: 'review'
          }),
          wslRow('e2e00000-0000-4000-8000-000000000002', {
            summary: 'テストを 3 段の並列に分ける'
          }),
          wslRow('e2e00000-0000-4000-8000-000000000003', { summary: 'README を日本語で整える' })
        ]
      },
      {
        kind: 'folder',
        folderId: input.winFolderId,
        boundary: 'native',
        sessions: [
          e2ePastRow({
            sessionId: 'e2e00000-0000-4000-8000-000000000004',
            targetKey: hostTarget,
            cwd: { namespace: 'host', value: 'C:\\e2e\\project' },
            originKind: 'host',
            summary: 'Windows 版のビルド手順 2026'
          })
        ]
      },
      {
        kind: 'unregistered',
        cwdKey: cwdKeyOf(scratch.namespace, scratch.value),
        cwd: scratch,
        cwdDisplay: null,
        suggestedDisplayName: 'scratch',
        location: { kind: 'wsl', distroName: input.distroName },
        sessions: [
          e2ePastRow({
            sessionId: 'e2e00000-0000-4000-8000-000000000005',
            targetKey: wslTarget,
            cwd: scratch,
            originKind: 'wsl-inherited',
            summary: '一度きりの調査 A'
          }),
          e2ePastRow({
            sessionId: 'e2e00000-0000-4000-8000-000000000006',
            targetKey: wslTarget,
            cwd: scratch,
            originKind: 'wsl-inherited',
            summary: '一度きりの調査 B'
          })
        ]
      }
    ],
    outcomes: [
      {
        location: { kind: 'wsl', distroName: input.distroName },
        targetKey: wslTarget,
        targetLabel: 'e2e',
        status: 'ok',
        reasonKey: null,
        count: 5,
        truncated: false,
        fetchedAt: E2E_INDEX_AT
      },
      {
        location: { kind: 'windows' },
        targetKey: hostTarget,
        targetLabel: 'e2e',
        status: 'ok',
        reasonKey: null,
        count: 1,
        truncated: false,
        fetchedAt: E2E_INDEX_AT
      }
    ],
    fetchedAt: E2E_INDEX_AT,
    complete: true
  }
}

/**
 * 会話の id を持った行を作る合成プロンプト (X-9 / FE-021)。送ると fake の supervisor 接続が固定の会話の id を 1 回送る
 * (本物のセッションスレッドの最初の `init` の代わり。本番では本コードに到達しない)。
 */
export const E2E_CONVERSATION_PROMPT = '__e2e_conversation__'
/** 合成の会話の id (実際の会話ではない。UUID の形だけを満たす)。 */
const E2E_CONVERSATION_ID = 'e2e00000-0000-4000-8000-0000000000c1'

/** 既定の Provider のモデルの一覧の固定の 2 件 (025 / FE-021。実際の Claude Code の答えではない)。 */
const E2E_LIVE_MODELS: readonly ModelEntry[] = [
  { id: 'e2e-model-a', displayName: 'E2E モデル A' },
  { id: 'e2e-model-b', displayName: 'E2E モデル B' }
]

/** E2E の負荷経路 (SC-003 / FE-020) を起こす合成プロンプト。本番では本コードに到達しない。 */
export const E2E_LOAD_PROMPT = '__e2e_load__'
/** 1 件 1KB の本文を何件/秒流すか (SC-003 の負荷)。 */
const E2E_LOAD_RATE_PER_SEC = 20
const E2E_LOAD_DURATION_MS = 30_000
/** 上限いっぱいの part (`BODY_MAX_BYTES`) を 1 回流す合成プロンプト (SC-003)。 */
export const E2E_BIG_PROMPT = '__e2e_big__'
/**
 * 巨大な part を流すまでの遅れ。**SC-003 の計測窓 (負荷の 30 秒) の中で届くように**、送信からしばらく置く
 * (送信直後に流すと、残りのセッションへの送信を待つ間に計測の前に届き終わる。pr-gate R1 po H-002)。
 */
const E2E_BIG_DELAY_MS = 15_000

interface StubSession {
  readonly port1: MessagePortMain
  state: SessionRunState
  claudeAlive: boolean
  closed: boolean
  /** プロンプトを 1 度でも受けたか (最初のプロンプト待ちの終了を本物と同じ規則で受ける。pr-gate R1 po H-001)。 */
  promptSent: boolean
  timers: ReturnType<typeof setTimeout>[]
}

/**
 * **fake の supervisor 接続** (X-5 / USER 決定 design-gate R1: E2E は本物の起動調停 + fake の supervisor 接続)。
 *
 * 本物の `createSessionLaunchService` (上限・制御の宛先・状態通知の受信規則) に差し込む。プロセスもスレッドも
 * 起こさず、`MessageChannelMain` の port1 を main に保持して合成の本文 (セッションスレッドと同じく**文字列化した**
 * `SessionEvent`) を流し、状態通知を 100ms 窓でまとめて出す。supervisor 内部 (スレッド・中継) は通らない —
 * それは supervisor の単体と quickstart が確かめる (spec SC-003)。
 */
function createE2eSupervisorConnection(): SupervisorConnection {
  const sessions = new Map<string, StubSession>()
  const statusL: ((g: number, u: readonly unknown[]) => void)[] = []
  const threadL: ((g: number, id: string) => void)[] = []
  const conversationL: ((g: number, id: string, conversationId: string) => void)[] = []
  const controlResultL: ((g: number, id: string, requestId: string, ok: boolean) => void)[] = []
  const modelsResultL: ((
    g: number,
    id: string,
    requestId: string,
    models: readonly ModelEntry[] | null,
    dropped: number
  ) => void)[] = []
  let pending: SessionStatusUpdate[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let seq = 0

  const flush = (): void => {
    if (flushTimer !== null) clearTimeout(flushTimer)
    flushTimer = null
    if (pending.length === 0) return
    const batch = coalesceUpdates(pending)
    pending = []
    for (const l of statusL) l(1, batch)
  }
  const status = (sessionId: string, s: StubSession, immediate = false): void => {
    pending.push({ sessionId, state: s.state, reasonKey: null, claudeAlive: s.claudeAlive })
    if (immediate) flush()
    else if (flushTimer === null) flushTimer = setTimeout(flush, 100)
  }
  const emit = (s: StubSession, event: SessionEvent): void => {
    if (!s.closed) s.port1.postMessage(JSON.stringify(event))
  }
  const setState = (sessionId: string, s: StubSession, state: SessionRunState): void => {
    s.state = state
    emit(s, { kind: 'state', state })
    status(sessionId, s)
  }
  const assistantMessage = (text: string): TranscriptMessageDTO => ({
    id: `e2e-assistant-${(seq += 1)}`,
    role: 'assistant',
    parts: [{ type: 'text', text }],
    createdAt: Date.now()
  })
  const end = (sessionId: string, s: StubSession): void => {
    if (s.closed) return
    for (const t of s.timers) clearTimeout(t)
    s.claudeAlive = false
    status(sessionId, s, true)
    s.closed = true
    s.port1.close()
    sessions.delete(sessionId)
    for (const l of threadL) l(1, sessionId)
  }

  return {
    launch(sessionId) {
      const channel = new MessageChannelMain()
      channel.port1.start()
      const s: StubSession = {
        port1: channel.port1,
        state: 'idle',
        claudeAlive: true,
        closed: false,
        promptSent: false,
        timers: []
      }
      sessions.set(sessionId, s)
      setState(sessionId, s, 'launching')
      // コマンドの候補の一覧 (O-10 SC-006 の E2E が popover の正の対照を取れるように流す)。
      emit(s, {
        kind: 'meter',
        meter: {
          type: 'commands',
          commands: [{ name: 'review', description: 'E2E stub のコマンド', argumentHint: '' }],
          omitted: 0
        }
      })
      return { ok: true, port: channel.port2, generation: 1 }
    },
    control(sessionId, control: SessionControl) {
      const s = sessions.get(sessionId)
      if (s === undefined || s.closed) return
      switch (control.kind) {
        case 'send-prompt': {
          // turn を in-flight にして (running) 暫く保ち、合成応答 1 通で完了する。
          // running を挟むことで IME E2E の「running + queue 有効」分岐 (AD-037 §4) を踏める。
          s.promptSent = true
          if (control.text === E2E_CONVERSATION_PROMPT) {
            for (const l of conversationL) l(1, sessionId, E2E_CONVERSATION_ID)
            // 右のパネルの「使用量」の E2E 用 (025 FE-042): 7 桁以上のトークンとモデル別の内訳 2 件。
            emit(s, {
              kind: 'meter',
              meter: {
                type: 'turn',
                costUsd: 12.3456,
                turns: 3,
                permissionDenials: 0,
                models: [
                  {
                    modelId: 'e2e-model-a',
                    input: 1234567,
                    output: 2345678,
                    cacheRead: 12345678,
                    cacheCreation: 3456789,
                    costUsd: 8.1234,
                    contextWindow: 200000
                  },
                  {
                    modelId: 'e2e-model-b',
                    input: 1111111,
                    output: 2222222,
                    cacheRead: 3333333,
                    cacheCreation: 4444444,
                    costUsd: 4.2222,
                    contextWindow: 200000
                  }
                ]
              }
            })
          }
          setState(sessionId, s, 'running')
          if (control.text === E2E_LOAD_PROMPT) {
            const chunk = 'あ'.repeat(340) // 約 1KB (UTF-8)
            const interval = 1000 / E2E_LOAD_RATE_PER_SEC
            for (let t = 0; t < E2E_LOAD_DURATION_MS; t += interval) {
              s.timers.push(
                setTimeout(() => emit(s, { kind: 'message', message: assistantMessage(chunk) }), t)
              )
            }
            s.timers.push(
              setTimeout(() => setState(sessionId, s, 'done'), E2E_LOAD_DURATION_MS + 50)
            )
            break
          }
          const text =
            control.text === E2E_BIG_PROMPT
              ? 'x'.repeat(BODY_MAX_BYTES)
              : '（E2E stub）受け取りました。'
          s.timers.push(
            setTimeout(
              () => {
                emit(s, { kind: 'message', message: assistantMessage(text) })
                setState(sessionId, s, 'done')
              },
              control.text === E2E_BIG_PROMPT ? E2E_BIG_DELAY_MS : 1200
            )
          )
          break
        }
        case 'respond-permission':
          setState(sessionId, s, 'running')
          break
        case 'respond-elicitation':
          // 応答を受けたら待ちを外すだけ (本物のセッションスレッドは SDK の callback を解決する。O-10)。
          setState(sessionId, s, 'running')
          break
        case 'interrupt':
          emit(s, { kind: 'interrupt-receipt', stillQueued: [], cancelled: [] })
          setState(sessionId, s, 'interrupted')
          break
        case 'end':
          // 本物のセッションスレッドと同じ規則 (`canEnd`): 応答待ち・中断済み・最初のプロンプト待ち。
          if (!canEnd(s.state, s.promptSent)) break
          setState(sessionId, s, 'done')
          end(sessionId, s)
          break
        case 'kill':
          setState(sessionId, s, 'done')
          end(sessionId, s)
          break
        // 実行中の設定の切り替え (023 / contracts C-6)。受けた値で成功し、権限モードは本文の port へ `meter` を流す。
        case 'set-permission-mode':
          emit(s, { kind: 'meter', meter: { type: 'permission-mode', mode: control.mode } })
          for (const l of controlResultL) l(1, sessionId, control.requestId, true)
          break
        case 'set-model':
          for (const l of controlResultL) l(1, sessionId, control.requestId, true)
          break
        // 既定の Provider のモデルの一覧 (025 / AD-065)。固定の 2 件を返す (実機の Claude Code は V-1 で確かめる)。
        case 'list-models':
          for (const l of modelsResultL) l(1, sessionId, control.requestId, E2E_LIVE_MODELS, 0)
          break
      }
    },
    kill() {
      for (const [id, s] of [...sessions]) end(id, s)
      return true
    },
    onStatusBatch: (l) => statusL.push(l),
    onThreadEnded: (l) => threadL.push(l),
    // 会話の id は合成プロンプト (`E2E_CONVERSATION_PROMPT`) を送った行にだけ送る (X-9 / FE-021)。
    onConversation: (l) => conversationL.push(l),
    onControlResult: (l) => controlResultL.push(l),
    onModelsResult: (l) => modelsResultL.push(l),
    onExit: () => undefined
  }
}

export interface E2eCapability {
  readonly ipc: IpcDependencies
  /** 状態通知の中継 (real の `Composition.sessionStatus` と同型)。 */
  readonly sessionStatus: SessionStatusRelay
  /** 稼働中の行が会話の id を持った通知 (real の `Composition.onSessionResumable` と同型。X-9)。 */
  onSessionResumable(listener: (sessionIds: readonly string[]) => void): void
  /** renderer の再読み込みで全セッションを止める (real と同型)。 */
  killAllSessions(): number
  /** アプリ終了時に in-flight を片付ける。real の `Composition.dispose` と同型。 */
  dispose(): Promise<number>
}

/**
 * E2E 用の fake `IpcDependencies` を組む。real の `createComposition` の代わりに `index.ts` の
 * E2E 分岐が渡す。folder/runtime は canned な DTO、launch は合成 stream (port2 を transfer)。
 */
export function createE2eCapability(): E2eCapability {
  const now = Date.now()
  const distro = 'E2E-Ubuntu'
  const runtimeId = wslNamespace(distro)
  const folderId = 'e2e-folder'
  // X-4 (SH-022): 依存解決の E2E 用に 2 つ目のランタイムと Windows フォルダを足す。
  // **既存 E2E は「1 番目のフォルダ / 1 番目のランタイム」を選ぶため、追加分は後ろに並べる。**
  const otherDistro = 'E2E-Debian'
  const otherRuntimeId = wslNamespace(otherDistro)
  const winFolderId = 'e2e-win-folder'

  const runtimeDtoFor = (
    id: typeof runtimeId,
    name: string,
    isDefault: boolean
  ): RuntimeDescriptorDTO => ({
    id,
    kind: 'wsl',
    distroName: name,
    wslVersion: 2,
    state: 'running',
    isDefault,
    capabilities: {
      probeState: 'done',
      sandboxKind: 'none',
      seccompStatus: 'unknown',
      missingDependencies: [],
      probedAt: now,
      autoModeAllowed: false,
      autoModeStatus: 'unavailable'
    },
    hasPathMapping: false,
    detectedAt: now,
    claudeStatus: null,
    claudeOverridden: false
  })
  const fakeRuntimeDto = runtimeDtoFor(runtimeId, distro, true)
  // X-8 (FE-011): Principle III の E2E 用に `claudeStatus: 'found'` の Win32Runtime を足す。パスは持たず、実機の
  // `claude.exe` は要らない (起動はしない)。**後ろに並べる** (ランタイム一覧の先頭のカードを変えない)。
  const fakeWin32Dto: RuntimeDescriptorDTO = {
    ...runtimeDtoFor(runtimeId, distro, false),
    id: 'host',
    kind: 'win32',
    distroName: null,
    wslVersion: null,
    claudeStatus: 'found',
    claudeOverridden: false
  }
  const fakeRuntimes: RuntimeListDTO = {
    wslAvailability: 'available',
    runtimes: [fakeRuntimeDto, runtimeDtoFor(otherRuntimeId, otherDistro, false), fakeWin32Dto],
    enumerationIssues: []
  }
  /** IPC の未信頼入力照合 (`findRuntime`) に使う descriptor。表示用の合成値で `wsl.exe` は呼ばない。 */
  const snapshot: RuntimeDescriptor[] = [
    { ...descriptorBase(now), id: runtimeId, distroName: distro, isDefault: true },
    { ...descriptorBase(now), id: otherRuntimeId, distroName: otherDistro, isDefault: false },
    {
      id: 'host',
      kind: 'win32',
      state: 'running',
      isDefault: false,
      capabilities: fixedCapabilities(now),
      detectedAt: now,
      claudePath: null,
      claudeStatus: 'found',
      claudeOverridden: false
    }
  ]

  // X-4: Provider (カタログ付き) と到達可能性の合成値。e2e-far は E2E-Debian からだけ到達できる。
  const bedrock: ProviderSummaryDTO = {
    id: 'e2e-bedrock',
    displayName: 'E2E Bedrock',
    backend: 'bedrock',
    source: 'aws-profile',
    modelCount: 2,
    models: [
      { id: 'e2e-sonnet', displayName: 'E2E Sonnet', supportedEffortLevels: ['low', 'high'] },
      { id: 'e2e-haiku', displayName: 'E2E Haiku' }
    ]
  }
  const far: ProviderSummaryDTO = {
    id: 'e2e-far',
    displayName: 'E2E Debian 専用',
    backend: 'anthropic',
    source: 'config-dir',
    modelCount: 0,
    models: []
  }

  // X-4: プリセットはメモリ内だけに持つ (永続化しない。E2E は production-inert)。
  // **削除済み Provider を参照するプリセットを 1 件 seed する** (pr-gate M-06 / US-2 AC2・AC3)。
  // `e2e-removed` は listProviders に無い = 登録後に削除された Provider を表す。
  const stalePreset: PresetDTO = {
    id: 'e2e-preset-stale',
    name: 'E2E 削除済み Provider',
    config: {
      folderId,
      runtimeId,
      providerId: 'e2e-removed',
      modelId: null,
      effort: null,
      permissionMode: 'default'
    },
    updatedAt: now - 1
  }
  let presets: PresetDTO[] = [stalePreset]
  let presetSeq = 0

  // O-3: 起動の利用記録はメモリ内の fake (ファイルに書かない。AD-038)。足す・刈り込む・集計は本番と同じ domain の純関数。
  let launchUsage: LaunchUsage = EMPTY_LAUNCH_USAGE
  const usageToday = (): LocalDayKey => {
    const ms = Date.now()
    return toLocalDayKey(ms, -new Date(ms).getTimezoneOffset())
  }

  const fakeFolderDto: WorkspaceFolderDTO = {
    id: folderId,
    location: { kind: 'wsl', distroName: distro },
    path: { namespace: runtimeId, value: '/home/e2e/project' },
    displayName: 'E2E Project',
    reachability: 'reachable',
    unreachableReason: null,
    blockedReason: null,
    resolutionSteps: [],
    registeredAt: now
  }
  const fakeWinFolderDto: WorkspaceFolderDTO = {
    ...fakeFolderDto,
    id: winFolderId,
    location: { kind: 'windows' },
    path: { namespace: 'host', value: 'C:\\e2e\\project' },
    displayName: 'E2E Windows Project'
  }
  const fakeFolders: FolderListDTO = {
    folders: [fakeFolderDto, fakeWinFolderDto],
    restoreIssues: { skipped: 0, reasonKeys: [], backupPath: null }
  }
  const pastIndex = e2eSessionIndex({ runtimeId, distroName: distro, folderId, winFolderId })

  /*
   * **本物の起動調停** (上限・制御の宛先・状態通知の受信規則を本番と共有する) に fake の supervisor 接続を差す。
   * 起動前段は既知のフォルダ / ランタイムだけを通す合成値 (WSL・env 導出を呼ばない)。
   */
  const sessionStatus = createSessionStatusRelay()
  const knownRuntimes = new Map(snapshot.map((d) => [d.id as string, d]))
  const resumableListeners: ((sessionIds: readonly string[]) => void)[] = []
  const launchService = createSessionLaunchService({
    onResumable: (sessionId) => {
      for (const listener of resumableListeners) listener([sessionId])
    },
    connection: createE2eSupervisorConnection(),
    prepareLaunch: async (config): Promise<LaunchPreparation> => {
      const runtime = knownRuntimes.get(config.runtimeId)
      if (runtime === undefined || ![folderId, winFolderId].includes(config.folderId)) return null
      return {
        ok: true,
        input: { options: { permissionMode: config.permissionMode } } as unknown as LaunchInput,
        spec: {
          pathToClaudeCodeExecutable: '/e2e/claude',
          command: 'e2e',
          prefixArgs: [],
          env: {}
        }
      }
    },
    newSessionId: () => randomUUID(),
    // 実行中のモデルの切り替えの検証に使う合成のカタログ (listProviders と同じ値)。
    providerModels: async (providerId) =>
      [bedrock, far].find((p) => p.id === providerId)?.models ?? null,
    onStatus: (updates) => sessionStatus.forward(updates),
    timer: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as never)
    },
    log: () => undefined
  })

  /*
   * **本物の再開の調停** (稼働中の行の source。X-9 / FE-021)。上限・同じ会話の判定・行のレコードは本番と共有する。
   * 過去の行の列挙は固定の索引に会話の行を持たないので、過去の行の source は常に `source-unknown` にする。
   */
  const resumeService = createResumeService({
    pastResumeSource: () => null,
    folders: () => [],
    runtimes: () => snapshot,
    providers: async () => [],
    resolve: () => {
      throw new Error('E2E の再開は過去の行の対応づけを使わない')
    },
    enumerationTargets: () => [],
    launchResume: (config, resolved) => launchService.resume(config, resolved),
    conversationRecord: (sessionId) => launchService.conversationRecord(sessionId),
    getTranscript: async (_conversationId, _targetKey, requestToken) => ({
      handshake: { status: 'empty', requestToken },
      port: null
    })
  })

  const ipc: IpcDependencies = {
    listRuntimes: async () => fakeRuntimes,
    refreshRuntimes: async () => fakeRuntimes,
    probeRuntime: async (): Promise<ProbeRuntimeResult> => fakeRuntimeDto,
    snapshotRuntimes: () => snapshot,

    listFolders: async () => fakeFolders,
    beginBrowse: async () => ({ ok: false, error: 'unsupported-location' }),
    browseDirectory: async () => ({ ok: false, error: 'browse-session-expired' }),
    registerFolder: async () => ({ ok: false, reason: 'unknown-location', existing: null }),
    unregisterFolder: async () => ({ ok: false }),
    folderIds: () => [folderId, winFolderId],
    resolveFolderRuntime: async () => null,
    pickHostFolder: async () => null,
    // X-8: E2E は実機の claude.exe を要らない。ダイアログを出さず、現状の一覧をそのまま返す。
    pickWin32ClaudePath: async () => ({ status: 'cancelled' }),
    clearWin32ClaudePath: async () => ({ status: 'updated', runtimes: fakeRuntimes.runtimes }),

    // 過去の一覧は固定の索引 (O-3 / 012 data-model §7)。打ち切りが無いので「続きを取る」は出ない。
    listSessions: async () => pastIndex,
    refreshSessions: async () => pastIndex,
    fetchMoreSessions: async () => emptySessionIndex(Date.now()),
    sessionTargetKeys: () => [],
    getTranscript: async (_sessionId, _targetKey, requestToken) => ({
      handshake: { status: 'empty', requestToken },
      port: null
    }),

    listProviders: async () => [bedrock, far],
    detectProviders: async () => [],
    registerProvider: async () => ({ ok: false, reason: 'invalid-record' }),
    updateProvider: async () => ({ ok: false, reason: 'not-found' }),
    removeProvider: async () => ({ ok: false }),
    listReachableProviders: async (id) =>
      id === otherRuntimeId
        ? { reachable: [bedrock, far], excluded: [] }
        : { reachable: [bedrock], excluded: [{ provider: far, reason: 'unreachable' }] },

    listPresets: async () => [...presets].sort((a, b) => b.updatedAt - a.updatedAt),
    savePreset: async (input) => {
      const name = normalizePresetName(input.name)
      const existing = presets.find((p) => p.name === name)
      if (existing !== undefined && !input.overwrite) return { ok: false, reason: 'name-conflict' }
      const preset: PresetDTO = {
        id: existing?.id ?? `e2e-preset-${(presetSeq += 1)}`,
        name,
        config: input.config,
        updatedAt: Date.now()
      }
      presets = [...presets.filter((p) => p.id !== preset.id), preset]
      return { ok: true, preset }
    },
    removePreset: async (id) => {
      const before = presets.length
      presets = presets.filter((p) => p.id !== id)
      return { ok: presets.length < before }
    },
    presetIds: async () => presets.map((p) => p.id),

    recordLaunchUsage: async (origin) => {
      const today = usageToday()
      launchUsage = prune(addLaunch(launchUsage, today, origin), today)
    },
    getLaunchUsage: async () => summarizeLaunchUsage(launchUsage, usageToday()),

    launchSession: (config): Promise<LaunchOutcome> => launchService.launch(config),
    controlSession: (sessionId, control) => launchService.control(sessionId, control),
    setSessionPermissionMode: (sessionId, mode) => launchService.setPermissionMode(sessionId, mode),
    setSessionModel: (sessionId, modelId) => launchService.setModel(sessionId, modelId),
    listSessionModels: (sessionId) => launchService.listModels(sessionId),
    // 改名: 子と transcript の書き込みは起こさず、受け付けの判定と名前の規則だけを本物と同じ関数で通す (C-6)。
    renameSession: async (sessionId, name): Promise<RenameResult> => {
      const normalized = normalizeSessionName(name)
      if (normalized === null) return { ok: false, reason: 'invalid-value' }
      const row = launchService.liveSettingRow(sessionId)
      if (row === null) return { ok: false, reason: 'unknown-session' }
      const blocker = liveSettingBlocker('name', row)
      if (blocker !== null) return { ok: false, reason: blocker }
      launchService.setName(sessionId, normalized)
      return { ok: true, name: normalized }
    },

    // 再開 (X-9): 稼働中の行は本物の調停を通る。過去の行は、登録フォルダ (e2e-folder) の固定の索引の行 (WSL の所在) だけ
    // 軸が解ける (025 FE-054 `/resume` の E2E。ダイアログを開くところまで。起動はしない)。ほかは再開できない。
    resolvePastResume: async (targetKey) =>
      targetKey === `${runtimeId}#0`
        ? { ok: true, folderId, runtimeId, providerId: null }
        : { ok: false, reason: 'source-unknown' },
    resumeSession: (request) => resumeService.resume(request),
    getResumedTranscript: async (_sessionId, requestToken) => ({
      handshake: { status: 'failed', requestToken, reasonKey: 'transcript-read-failed' },
      port: null
    }),

    // pr-gate R1 M-03 / M-302: 退避 0 件。registerProvider は常に拒否なので述語は fail-closed で足りる。
    providerLoadIssues: async () => ({
      skippedOnLoad: 0,
      wholeFileUnreadable: false,
      storeNewerVersion: false
    }),
    extraEnvPredicates: { isForbiddenForwardKey: () => true, isDeniedEnvKey: () => true },

    measure: noMeasure
  }

  return {
    ipc,
    sessionStatus,
    onSessionResumable: (listener) => {
      resumableListeners.push(listener)
    },
    killAllSessions: () => launchService.killAll(),
    dispose: () => launchService.dispose()
  }
}
