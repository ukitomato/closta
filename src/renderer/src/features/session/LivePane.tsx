import { useEffect, useMemo, useRef, useState } from 'react'

import { useAui, useAuiState, type QueueItemState } from '@assistant-ui/react'

import { switchableModels } from '@domain/provider/model-catalog'
import type { EffortLevel } from '@domain/provider/types'
import type { LaunchFailureReason, PermissionDeniedInfo } from '@domain/session/agent-session'
import type { SafePermissionMode } from '@domain/session/launch-config'
import { liveSettingBlocker, type LiveSettingRow } from '@domain/session/live-settings'

import { EmptyState, EmptyStateGreeting } from '@/components/assistant-ui/elements/empty-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { Button } from '@/components/ui/button'
import {
  ComposerExtensionsContext,
  type ComposerExtensions
} from '@/features/chat/composer-extensions-context'
import { useProviders } from '@/features/provider/useProviders'
import { TranscriptAnnouncer } from '@/features/chat/TranscriptAnnouncer'
import {
  createMcpServerNamesReader,
  LiveProgressContext,
  ToolResultThreadContext,
  TranscriptSettledContext,
  useMcpServerNamesOf,
  type LiveProgressSource
} from '@/features/chat/transcript-context'

import { ApprovalCard } from './ApprovalCard'
import { DEFAULT_MAX_QUEUE_ITEMS, type EnqueueVerdict } from './composer-queue'
import { ElicitationCard } from './ElicitationCard'
import { handOffFocusToComposer } from './focus-handoff'
import {
  isReloginFailure,
  launchFailureLabel,
  LIVE_MODEL_LIST_FAILURE_LABELS,
  LIVE_SETTING_LABELS,
  OLDER_MESSAGES_LABELS,
  olderMessagesLabel,
  RESUME_LABELS,
  SESSION_ACTION_LABELS,
  SESSION_END_NOTICES
} from './labels'
import { LaunchDialog, type LaunchSource } from './LaunchDialog'
import { LiveSettingsControls } from './LiveSettingsControls'
import { resumeActionFor, useRowActionRunner, type RowResumeAction } from './resume-action'
import { useRunningSessionStore, useRunningSessionStoreApi } from './running-session-context'
import {
  RESUMED_ID_PREFIX,
  slashCommandEntries,
  type LiveModelsState,
  type SessionQueue
} from './running-session-store'
import { useRunningSessionsView } from './running-sessions-view'
import { MESSAGE_WINDOW } from './session-view'
import type { LiveSession } from './useLiveSession'
import { useSessionMeters } from './useSessionMeters'

/**
 * **中央の本体の実行中の Chat と、起動ダイアログの中身** (O-7 / FE-002。X-5 の `SessionScreen` から移した)。
 *
 * - `LivePane`: 選択中の稼働中のセッションの会話 (通知・承認カード・Thread)。中央のヘッダはシェルの `CenterHeader`
 * - `LaunchDialogContent`: 起動ダイアログの中身。起動中は `Launching`、それ以外は X-4 の `LaunchDialog`
 *
 * **`RunningSessionsProvider` の内側で使う** (runtime と表示中のセッションをそこから受ける)。
 * セッションの寿命は面と切り離す — unmount・切り替えで kill しない (X-5 FR-008)。
 */

/** 中央の本体の実行中の Chat。選択が無いときは何も描かない (中央の空の状態はシェルが出す)。 */
export function LivePane(): React.JSX.Element | null {
  const view = useRunningSessionsView()
  const live = view.live
  if (live === null || live.queue === null) return null
  return (
    <LiveSessionPane
      key={live.sessionId}
      session={live}
      queue={live.queue}
      hiddenCount={view.hiddenCount}
      onShowMore={view.showMore}
    />
  )
}

/** 起動ダイアログの中身。起動中は差し替わるので、拒否・失敗で戻るとダイアログは作り直され lastConfig を復元する (X-4 US-1 AC7)。 */
export function LaunchDialogContent(): React.JSX.Element {
  const view = useRunningSessionsView()
  const launch = useRunningSessionStore((s) => s.launch)
  return launch.phase === 'launching' ? (
    <Launching />
  ) : (
    <NewSessionDialog onLaunch={view.launch} onResume={view.resume} />
  )
}

/** 起動設定ダイアログに渡す面 (起動状態と、終わっていないセッションのフォルダ)。再開の形は `launch.resume` (X-9)。 */
function NewSessionDialog({
  onLaunch,
  onResume
}: {
  readonly onLaunch: LaunchSource['launch']
  readonly onResume: NonNullable<LaunchSource['resumeSession']>
}): React.JSX.Element {
  const launch = useRunningSessionStore((s) => s.launch)
  const order = useRunningSessionStore((s) => s.order)
  const sessions = useRunningSessionStore((s) => s.sessions)
  const statuses = useRunningSessionStore((s) => s.statuses)
  // 同一フォルダの警告の対象は**終わっていない**セッション (spec US-1 AC2)。
  const activeFolderIds = useMemo(
    () =>
      order.flatMap((id) => {
        const session = sessions[id]
        if (session === undefined || statuses[id]?.claudeAlive === false) return []
        return [session.config.folderId]
      }),
    [order, sessions, statuses]
  )
  const source: LaunchSource = {
    phase: launch.phase,
    rejectReason: launch.rejectReason,
    resume: launch.resume,
    resumeSession: onResume,
    lastConfig: launch.lastConfig,
    lastOrigin: launch.lastOrigin,
    previousFailure: launch.previousFailure,
    activeFolderIds,
    launch: onLaunch
  }
  return <LaunchDialog session={source} />
}

function Launching(): React.JSX.Element {
  return (
    // 起動中になったことの読み上げは、ダイアログが開いている間ずっとマウントしてある live region (`LaunchDialogHost`) が持つ。
    // 中身と一緒に差し込んだ live region は読まれない支援技術がある (pr-gate R1 a11y L-004 / R3 L-004)。
    <div className="flex min-h-40 items-center justify-center p-6" data-testid="session-launching">
      <GenerationLoader label="セッションを起動中…" tick={0} />
    </div>
  )
}

/** 表示中セッションのペイン (通知・承認カード・Thread)。セッションごとに作り直す (`key`)。 */
function LiveSessionPane({
  session,
  queue,
  hiddenCount,
  onShowMore
}: {
  readonly session: LiveSession
  readonly queue: SessionQueue
  readonly hiddenCount: number
  readonly onShowMore: () => void
}): React.JSX.Element {
  const { state } = session
  const pending = state.pending
  const messageQueue = queue.controller

  // **実行中の pending を表示するため steer lane を state に写す** (X-2 / FR-004 の可視化)。
  // runtime は実行中送信を steer lane (`adapter.steerItems`) に回すが、これは `composer.queue`
  // (ComposerPrimitive.Queue の表示ソース = queue lane) に出ない (queue-behavior.test で確認)。
  const [pendingQueue, setPendingQueue] = useState<readonly QueueItemState[]>(
    messageQueue.adapter.steerItems
  )
  useEffect(() => {
    return messageQueue.subscribe(() => setPendingQueue(messageQueue.adapter.steerItems))
  }, [messageQueue])

  // 下書きの復元元はペインがマウントされた (= このセッションに切り替えた) 時点の値。
  const { getDraft, setDraft } = session
  const [draftSource] = useState(() => ({ draft: getDraft(), setDraft }))

  const terminal = session.terminal
  const errored = session.failureReason !== null || session.runState === 'error'
  const progress = useLiveProgressSource(session.sessionId)
  const toolResultThread = useMemo(
    () => ({ live: true, runState: session.runState }),
    [session.runState]
  )
  // 承認カードの MCP の tool の補助の見出しは transcript と同じサーバー名の一覧で分ける (O-5 / 015 data-model §1)。
  const mcpServerNames = useMcpServerNamesOf(progress)
  const sessionMeters = useRunningSessionStore((s) => s.meters[session.sessionId])
  const runningStore = useRunningSessionStoreApi()
  const sessionId = session.sessionId
  // 実行中の設定の選択は composer の左の群に描く (025 FR-001 / data-model §6.2)。
  const settingsRow = useMemo<LiveSettingRow>(
    () => ({
      state: session.runState,
      claudeAlive: !session.ended,
      hasConversation: state.resumable,
      changing: state.changing !== null
    }),
    [session.runState, session.ended, state.resumable, state.changing]
  )
  const { setPermissionMode, setModel, loadLiveModels } = session
  const settings = useMemo(
    () => (
      <LiveComposerSettings
        sessionId={sessionId}
        configPermissionMode={state.config.permissionMode}
        providerId={state.config.providerId}
        effort={state.config.effort}
        modelId={state.config.modelId}
        currentModelId={state.currentModelId}
        row={settingsRow}
        liveModels={state.liveModels}
        onLoadLiveModels={loadLiveModels}
        onSelectPermissionMode={setPermissionMode}
        onSelectModel={setModel}
      />
    ),
    [
      sessionId,
      state.config.permissionMode,
      state.config.providerId,
      state.config.effort,
      state.config.modelId,
      state.currentModelId,
      state.liveModels,
      settingsRow,
      loadLiveModels,
      setPermissionMode,
      setModel
    ]
  )
  const composerExtensions = useMemo<ComposerExtensions>(
    () => ({
      commands: sessionMeters === undefined ? null : slashCommandEntries(sessionMeters),
      // それまでの会話 (`resumed:`) は読み取り専用。再送の入力を戻さない (X-9 / data-model §8.2)。
      retryTextFor: (messageId) =>
        messageId.startsWith(RESUMED_ID_PREFIX)
          ? null
          : refusedUserText(runningStore.getState().sessions[sessionId]?.messages ?? [], messageId),
      settings
    }),
    [sessionMeters, runningStore, sessionId, settings]
  )
  // 承認カードは応答すると消える。押したボタンがカードの中にあれば、消す前に composer へ移す (O-4 FR-019)。
  const approvalRef = useRef<HTMLDivElement>(null)
  const elicitationRef = useRef<HTMLDivElement>(null)
  const firstElicitation = state.elicitations[0]
  // 「再開」「やり直す」(X-9)。行と同じ純関数で出し分け、利用者が押したときだけ動く (自動で再開しない。FR-009)。
  const resumeAction = resumeActionFor({
    runState: session.runState,
    ended: session.ended,
    resumable: state.resumable
  })
  const runRowAction = useRowActionRunner()
  const onResumeAction = resumeAction === null ? null : () => runRowAction(sessionId, resumeAction)

  return (
    // `data-live-pane`: 消えるボタンのフォーカスの行き先 (この中の composer) を探す根 (O-4 FR-019。`focus-handoff.ts`)。
    <div className="flex h-full min-h-0 flex-col" data-live-pane="">
      {/* error 状態は必ず理由と次操作を出す。failure イベントが理由を伴わず来た場合も汎用表示に倒す (X-1 US-4 AC-8)。 */}
      {errored && (
        <FailureBanner
          reason={session.failureReason}
          onClose={session.close}
          action={resumeAction}
          onAction={onResumeAction}
        />
      )}
      {/* 終わり方の通知 (FR-011): 終了が強制終了に落ちた / 強制終了 / 正常に終了した。 */}
      {!errored && (state.endForced || state.killed || session.ended) && (
        <EndNotice
          message={
            state.endForced
              ? SESSION_END_NOTICES.endForced
              : state.killed
                ? SESSION_END_NOTICES.killed
                : SESSION_END_NOTICES.ended
          }
          onClose={session.ended ? session.close : null}
          action={resumeAction}
          onAction={onResumeAction}
        />
      )}
      {state.denied.length > 0 && <DeniedNotice denied={state.denied} />}
      {state.queueRejection !== null && !terminal && (
        <QueueRejectionNotice
          verdict={state.queueRejection}
          onDismiss={session.clearQueueRejection}
        />
      )}
      {/* 終端では pending を「取り消された入力」として提示 (dispatch されない)。非終端では「実行後に送信予定」。 */}
      {terminal && pendingQueue.length > 0 && <CancelledQueueNotice items={pendingQueue} />}
      {!terminal && pendingQueue.length > 0 && (
        <PendingQueueNotice
          items={pendingQueue}
          onRemove={(id) => {
            messageQueue.adapter.remove(id)
            session.clearQueueRejection() // 空きができたので拒否理由を消す
          }}
        />
      )}
      {pending !== null && (
        <div className="px-4 pt-3" ref={approvalRef}>
          <ApprovalCard
            request={pending}
            mcpServerNames={mcpServerNames}
            onDecision={(outcome, answers) => {
              handOffFocusToComposer(approvalRef.current)
              session.respond(pending.requestId, outcome, answers)
            }}
          />
        </div>
      )}
      {firstElicitation !== undefined && (
        // MCP サーバーの問い (O-10 / AD-053)。先頭の 1 枚と、残りの数。応答するとカードごと消えるので、消す前に composer へ移す。
        <div className="px-4 pt-3" ref={elicitationRef}>
          <ElicitationCard
            key={firstElicitation.requestId}
            prompt={firstElicitation}
            remaining={state.elicitations.length - 1}
            onRespond={(action, content) => {
              handOffFocusToComposer(elicitationRef.current)
              session.respondElicitation(firstElicitation.requestId, action, content)
            }}
          />
        </div>
      )}
      {hiddenCount > 0 && (
        <div
          role="status"
          className="border-border text-muted-foreground flex items-center gap-2 border-b px-4 py-1.5 text-xs"
          data-testid="older-messages"
        >
          <span className="flex-1">{olderMessagesLabel(hiddenCount)}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={(event) => {
              // 最後の押下 (残りが 1 回分の窓に収まる) では省略の行ごと消えるので、消す前に composer へ移す (O-4 FR-019)。
              if (hiddenCount <= MESSAGE_WINDOW) handOffFocusToComposer(event.currentTarget)
              onShowMore()
            }}
          >
            {OLDER_MESSAGES_LABELS.showMore}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {/*
         * **空でも Thread を描画する。** composer は Thread が内包しており、空状態を EmptyState で
         * 差し替えて Thread ごと隠すと入力欄が消え、初回プロンプトを送れずデッドロックする
         * (quickstart 実機不具合。claude は初回 user メッセージまで無出力なので UI 側が起点)。
         */}
        <DraftBridge session={draftSource} threadId={session.sessionId} />
        {/* 見ているセッションの新しい出来事の読み上げ (O-6 / 016 data-model §4)。ペインはセッションごとに作り直す。 */}
        <TranscriptAnnouncer />
        {/* 終了・失敗の後は、終わりの来ないシステムイベントの行を「結果不明」で描く (O-2 / FR-009)。 */}
        <TranscriptSettledContext.Provider value={session.ended || errored}>
          {/* tool の経過時間と思考のトークン数は Thread の外側から購読元を渡す (O-4 / 014 data-model §4「進み具合」)。 */}
          <LiveProgressContext.Provider value={progress}>
            {/* tool の結果の状態 (結果待ち / 結果不明。O-6 / 016 data-model §3) の前提。 */}
            <ToolResultThreadContext.Provider value={toolResultThread}>
              {/* composer のコマンドの候補 (O-10 / 018 data-model §5)。表示中のセッションの一覧だけを渡す (過去ログは渡さない)。 */}
              <ComposerExtensionsContext.Provider value={composerExtensions}>
                <Thread components={{ Welcome: SessionWelcome }} />
              </ComposerExtensionsContext.Provider>
            </ToolResultThreadContext.Provider>
          </LiveProgressContext.Provider>
        </TranscriptSettledContext.Provider>
      </div>
    </div>
  )
}

/** 既定の Provider の一覧が選べない理由の文言 (025 data-model §6.3)。選べるとき・Provider のあるセッションは null。 */
function liveModelsUnavailableReason(liveModels: LiveModelsState): string | null {
  switch (liveModels.phase) {
    case 'idle':
    case 'loading':
      return LIVE_SETTING_LABELS.loadingModelList
    case 'failed':
      return LIVE_MODEL_LIST_FAILURE_LABELS[liveModels.reason]
    case 'ready':
      if (liveModels.options.length > 0) return null
      return liveModels.reportedCount === 0
        ? LIVE_SETTING_LABELS.emptyModelList
        : LIVE_SETTING_LABELS.noModelForEffort
  }
}

/**
 * composer の左の群の実行中の設定の選択 (025 data-model §6.2)。今の権限モードは `meters.permissionMode ?? 起動の値`
 * (表示は `meters` から読む。023 contracts C-1)。モデルの選択肢はそのセッションの Provider のカタログのうち起動の effort が
 * 効くもの (main と同じ `switchableModels`)。確定 (マウス・Enter) の後は composer の入力へフォーカスを戻す。
 */
export function LiveComposerSettings({
  sessionId,
  configPermissionMode,
  providerId,
  effort,
  modelId,
  currentModelId,
  row,
  liveModels,
  onLoadLiveModels,
  onSelectPermissionMode,
  onSelectModel
}: {
  readonly sessionId: string
  readonly configPermissionMode: SafePermissionMode
  readonly providerId: string | null
  readonly effort: EffortLevel | null
  readonly modelId: string | null
  readonly currentModelId: string | null
  readonly row: LiveSettingRow
  /** 既定の Provider のモデルの一覧の状態 (025 / data-model §6.3)。Provider のあるセッションでは使わない。 */
  readonly liveModels: LiveModelsState
  readonly onLoadLiveModels: () => void
  readonly onSelectPermissionMode: (mode: SafePermissionMode) => void
  readonly onSelectModel: (modelId: string) => void
}): React.JSX.Element {
  const reported = useSessionMeters(sessionId, (meters) => meters.permissionMode)
  const providers = useProviders()
  const provider =
    providerId === null ? null : (providers.providers?.find((p) => p.id === providerId) ?? null)
  const isLive = providerId === null
  // 取得は設定を変えないので `changing` は見ない (main の判定と同じ。data-model §3.1)。
  const canAsk = liveSettingBlocker('model', { ...row, changing: false }) === null
  const phase = liveModels.phase
  useEffect(() => {
    // 選択が描かれていて聞ける状態になったら 1 回だけ聞く (`ready` の後は聞き直さない)。
    if (isLive && canAsk && phase === 'idle') onLoadLiveModels()
  }, [isLive, canAsk, phase, onLoadLiveModels])
  const options = isLive
    ? liveModels.phase === 'ready'
      ? liveModels.options
      : []
    : provider === null
      ? []
      : switchableModels(provider.models, effort)
  const unavailableReason = isLive ? liveModelsUnavailableReason(liveModels) : null
  // フォーカスがこの中にあるときだけ composer へ移す (別の場所で入力している利用者のフォーカスを奪わない)。
  const scope = useRef<HTMLDivElement>(null)
  return (
    <div ref={scope} className="flex min-w-0 items-center" data-testid="composer-live-settings">
      <LiveSettingsControls
        permissionMode={reported ?? configPermissionMode}
        row={row}
        onSelectPermissionMode={onSelectPermissionMode}
        model={{
          value: currentModelId ?? modelId,
          options: options.map((m) => ({ id: m.id, displayName: m.displayName })),
          available: isLive ? options.length > 0 : provider !== null,
          unavailableReason,
          onSelect: onSelectModel,
          // 失敗した一覧は、選択にフォーカスが入ったときに 1 回だけ聞き直す (data-model §6.3)。
          onFocus: isLive && canAsk && phase === 'failed' ? onLoadLiveModels : undefined
        }}
        onConfirmed={() => handOffFocusToComposer(scope.current)}
      />
    </div>
  )
}

/**
 * 拒否の行 (`rowId`) より前の最も近い利用者の入力 (`user-*`) の本文 (O-10 US-4)。行が無い・前に利用者の入力が無い・
 * 本文が空なら null。
 */
function refusedUserText(
  messages: readonly {
    readonly id?: string | undefined
    readonly role: string
    readonly content: unknown
  }[],
  rowId: string
): string | null {
  const at = messages.findIndex((m) => m.id === rowId)
  if (at < 0) return null
  for (let i = at - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m === undefined || m.role !== 'user' || !(m.id ?? '').startsWith('user-')) continue
    const content = m.content
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .map((p: unknown) =>
                typeof p === 'object' && p !== null && (p as { type?: unknown }).type === 'text'
                  ? String((p as { text?: unknown }).text ?? '')
                  : ''
              )
              .join('')
          : ''
    return text === '' ? null : text
  }
  return null
}

/**
 * 表示中のセッションの進み具合の購読元 (O-4 / 014 data-model §4「進み具合」)。稼働中のストアの `meters` (`sessions` とは別の
 * 枝) から、tool の id ごとの経過時間と思考のトークン数を引く。ペインはセッションごとに作り直す (`key`) ので、値は 1 つの
 * セッションのものだけ。購読はそのセッションの計量が変わったときだけ知らせる (他のセッションの計量・本文の更新では知らせない)。
 */
function useLiveProgressSource(sessionId: string): LiveProgressSource {
  const store = useRunningSessionStoreApi()
  return useMemo<LiveProgressSource>(
    () => ({
      toolElapsed: (toolCallId) =>
        store.getState().meters[sessionId]?.toolElapsed.get(toolCallId) ?? null,
      thinkingTokens: () => store.getState().meters[sessionId]?.thinkingTokens ?? null,
      // MCP サーバーの名前は構成 (`initReport`) が替わるまで同じ参照を返す (O-5 / 015 research R-05)。
      mcpServerNames: createMcpServerNamesReader(
        () => store.getState().meters[sessionId]?.initReport ?? null
      ),
      subscribe: (listener) =>
        store.subscribe((state, prev) => {
          if (state.meters[sessionId] !== prev.meters[sessionId]) listener()
        })
    }),
    [store, sessionId]
  )
}

/**
 * composer の下書き ↔ feature state (`session.draft`) の同期 (X-2 / FR-007 / T021)。
 *
 * セッションを切り替えると assistant-ui はスレッドの中身 (composer を含む) を作り直す (X-5 / FR-010)。本 bridge は
 * composer text をセッションごとの下書きに写し (捕捉)、そのセッションのスレッドに切り替わった後で保持していた下書きを
 * 流し込む (復元)。したがって下書きは別のセッションへ移らない。会話由来テキストなので境界・ログ・永続層に出さない
 * (Principle V / FR-008)。
 *
 * **`threadId` を渡すときは、assistant-ui の表示中スレッド (`threads.mainThreadId`) がそれに切り替わるまで何もしない。**
 * スレッドの作り直しは親 (`useExternalStoreRuntime`) の effect で起きるため子の effect より後になる。待たずに動くと、
 * 前のセッションの composer の文字を新しいセッションの下書きに写し、復元した文字も作り直しで消える。
 */
export function DraftBridge({
  session,
  threadId
}: {
  readonly session: { readonly draft: string; setDraft(text: string): void }
  readonly threadId?: string
}): null {
  const aui = useAui()
  const text = useAuiState((s) => s.composer.text)
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId)
  const ready = threadId === undefined || mainThreadId === threadId
  const setDraft = session.setDraft

  // 復元: 対象のスレッドになった後の初回のみ、保持していた下書きを空の composer に流し込む。
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!ready || restoredRef.current) return
    restoredRef.current = true
    if (session.draft !== '' && aui.composer.getState().text === '') {
      aui.composer.setText(session.draft)
    }
  }, [aui, ready, session.draft])

  // 捕捉: 復元の後の composer の入力変化を下書きに写す (メモリ内)。
  useEffect(() => {
    if (!ready || !restoredRef.current) return
    setDraft(text)
  }, [ready, setDraft, text])

  return null
}

/** 空スレッドの案内 (Thread の Welcome slot。composer は常に下に出る)。 */
function SessionWelcome(): React.JSX.Element {
  return (
    <EmptyState>
      <EmptyStateGreeting>プロンプトを送ると応答が表示されます</EmptyStateGreeting>
    </EmptyState>
  )
}

/**
 * 実行時失敗の理由表示 + 次操作 (X-1 FE-030 / X-5 FE-030)。他のセッションの表示と選択は動かさない。
 * 次操作は「閉じて起動し直す」— 行を閉じると起動設定ダイアログが前回の設定と理由つきで開く (X-4 US-1 AC7 / O-7 FR-007)。
 */
function FailureBanner({
  reason,
  onClose,
  action,
  onAction
}: {
  readonly reason: LaunchFailureReason | null
  readonly onClose: () => void
  readonly action: RowResumeAction | null
  readonly onAction: (() => void) | null
}): React.JSX.Element {
  // 理由キーがあれば訳出、無ければ汎用文 (error 状態は必ず理由と次操作を出す。US-4 AC-8)。
  const detail = reason !== null ? launchFailureLabel(reason) : 'セッションでエラーが発生しました。'
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <span className="flex-1">{detail}</span>
      {action !== null && onAction !== null && (
        <Button type="button" variant="outline" size="sm" onClick={onAction}>
          {RESUME_LABELS[action === 'resume' ? 'action' : 'retry']}
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onClose}>
        {isReloginFailure(reason) ? '閉じて起動し直す' : '閉じて再起動'}
      </Button>
    </div>
  )
}

/** 終わり方の通知 (FR-011)。error ではないので FailureBanner とは別の軽い表示。transcript はそのまま読める。 */
function EndNotice({
  message,
  onClose,
  action,
  onAction
}: {
  readonly message: string
  readonly onClose: (() => void) | null
  readonly action: RowResumeAction | null
  readonly onAction: (() => void) | null
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="border-border text-muted-foreground flex items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <span className="flex-1">{message}</span>
      {action !== null && onAction !== null && (
        <Button type="button" variant="outline" size="sm" onClick={onAction}>
          {RESUME_LABELS[action === 'resume' ? 'action' : 'retry']}
        </Button>
      )}
      {onClose !== null && (
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {SESSION_ACTION_LABELS.close}
        </Button>
      )}
    </div>
  )
}

/** キュー項目のテキスト (会話由来。`prompt` は deprecated なので parts の text から導出)。 */
function queueItemText(item: QueueItemState): string {
  return item.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
}

/**
 * 積み込み拒否の理由表示 (X-2 / FR-003 / FR-004 / R2-M-001)。件数上限 (`'full'`) と空/超過 (`'invalid'`) を提示する。
 * capped adapter が積み込みを拒否したときだけ出る (最古破棄はしない)。
 */
export function QueueRejectionNotice({
  verdict,
  onDismiss
}: {
  readonly verdict: EnqueueVerdict
  readonly onDismiss: () => void
}): React.JSX.Element {
  const message =
    verdict === 'full'
      ? `積み込みの上限 (${DEFAULT_MAX_QUEUE_ITEMS} 件) に達しています。応答が進んでから送ってください。`
      : '空・空白のみ、または長すぎる入力は積めません。'
  return (
    <div
      role="alert"
      className="border-border text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-xs"
    >
      <span className="min-w-0 flex-1">
        <span className="font-medium">送信できませんでした:</span> {message}
      </span>
      <button
        type="button"
        onClick={(event) => {
          // 告知ごと消えるので、消す前に composer へ移す (O-4 FR-019)。
          handOffFocusToComposer(event.currentTarget)
          onDismiss()
        }}
        aria-label="閉じる"
        className="hover:text-foreground shrink-0 px-1"
      >
        ×
      </button>
    </div>
  )
}

/**
 * 終端 (error / 強制終了) で送信されずに取り消された未 dispatch 項目の表示 (X-2 / FR-006 / US-2 AC-6)。
 * 「何が消えたか (cancelled)」を一旦提示する。テキストは会話由来なのでログ・境界に出さない (Principle V)。
 */
export function CancelledQueueNotice({
  items
}: {
  readonly items: readonly QueueItemState[]
}): React.JSX.Element {
  return (
    <div role="status" className="border-border text-muted-foreground border-b px-4 py-2 text-xs">
      <span className="font-medium">送信されずに取り消された入力 ({items.length}):</span>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="min-w-0 truncate">
            {queueItemText(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 実行中に積んだ入力 (message queue の pending) の表示 (X-2 / FR-004)。
 *
 * native queue は実行中送信を steer lane に置き `ComposerPrimitive.Queue` (queue lane) には出ないため、
 * controller の steer lane を feature 側で表示する (research R-02 修正案(a))。現ターン完了後に順に次ターンへ送られる。
 * 各項目は取り消せる (queued → 送られない)。テキストは会話由来なのでログ・境界に出さない (Principle V)。
 */
export function PendingQueueNotice({
  items,
  onRemove
}: {
  readonly items: readonly QueueItemState[]
  readonly onRemove: (id: string) => void
}): React.JSX.Element {
  return (
    <div role="status" className="border-border text-muted-foreground border-b px-4 py-2 text-xs">
      <span className="font-medium">実行後に送信予定 ({items.length}):</span>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{queueItemText(item)}</span>
            <button
              type="button"
              onClick={(event) => {
                // 項目ごと消えるので、消す前に composer へ移す (O-4 FR-019)。
                handOffFocusToComposer(event.currentTarget)
                onRemove(item.id)
              }}
              aria-label="キューから削除"
              className="hover:text-foreground shrink-0 px-1"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 「聞かれずに拒否された」操作の表示 (FE-011 / FR-014)。 */
function DeniedNotice({
  denied
}: {
  readonly denied: readonly PermissionDeniedInfo[]
}): React.JSX.Element {
  return (
    <div className="border-border text-muted-foreground border-b px-4 py-2 text-xs">
      <span className="font-medium">自動的に拒否された操作:</span>
      <ul className="mt-1 list-disc pl-5">
        {denied.map((d, i) => (
          <li key={`${d.toolName}-${i}`}>
            {d.toolName} — {d.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}
