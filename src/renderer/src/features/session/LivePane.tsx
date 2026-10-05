import { useEffect, useMemo, useRef, useState } from 'react'

import { useAui, useAuiState, type QueueItemState } from '@assistant-ui/react'

import type { LaunchFailureReason, PermissionDeniedInfo } from '@domain/session/agent-session'

import { EmptyState, EmptyStateGreeting } from '@/components/assistant-ui/elements/empty-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { Button } from '@/components/ui/button'
import { TranscriptSettledContext } from '@/features/chat/transcript-context'

import { ApprovalCard } from './ApprovalCard'
import { DEFAULT_MAX_QUEUE_ITEMS, type EnqueueVerdict } from './composer-queue'
import {
  isReloginFailure,
  launchFailureLabel,
  OLDER_MESSAGES_LABELS,
  olderMessagesLabel,
  SESSION_ACTION_LABELS,
  SESSION_END_NOTICES
} from './labels'
import { LaunchDialog, type LaunchSource } from './LaunchDialog'
import { useRunningSessionStore } from './running-session-context'
import type { SessionQueue } from './running-session-store'
import { useRunningSessionsView } from './running-sessions-view'
import type { LiveSession } from './useLiveSession'

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
  return launch.phase === 'launching' ? <Launching /> : <NewSessionDialog onLaunch={view.launch} />
}

/** 起動設定ダイアログに渡す面 (起動状態と、終わっていないセッションのフォルダ)。 */
function NewSessionDialog({
  onLaunch
}: {
  readonly onLaunch: LaunchSource['launch']
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
    lastConfig: launch.lastConfig,
    previousFailure: launch.previousFailure,
    activeFolderIds,
    launch: onLaunch
  }
  return <LaunchDialog session={source} />
}

function Launching(): React.JSX.Element {
  return (
    // 起動中になったことを読み上げる (「起動」のボタンが消えてフォーカスが容器に移るので、名前だけが読まれていた。
    // pr-gate R1 a11y L-004)。
    <div
      role="status"
      className="flex min-h-40 items-center justify-center p-6"
      data-testid="session-launching"
    >
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* error 状態は必ず理由と次操作を出す。failure イベントが理由を伴わず来た場合も汎用表示に倒す (X-1 US-4 AC-8)。 */}
      {errored && <FailureBanner reason={session.failureReason} onClose={session.close} />}
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
        <div className="px-4 pt-3">
          <ApprovalCard
            request={pending}
            onDecision={(outcome) => session.respond(pending.requestId, outcome)}
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
          <Button type="button" size="sm" variant="ghost" onClick={onShowMore}>
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
        {/* 終了・失敗の後は、終わりの来ないシステムイベントの行を「結果不明」で描く (O-2 / FR-009)。 */}
        <TranscriptSettledContext.Provider value={session.ended || errored}>
          <Thread components={{ Welcome: SessionWelcome }} />
        </TranscriptSettledContext.Provider>
      </div>
    </div>
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
  onClose
}: {
  readonly reason: LaunchFailureReason | null
  readonly onClose: () => void
}): React.JSX.Element {
  // 理由キーがあれば訳出、無ければ汎用文 (error 状態は必ず理由と次操作を出す。US-4 AC-8)。
  const detail = reason !== null ? launchFailureLabel(reason) : 'セッションでエラーが発生しました。'
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <span className="flex-1">{detail}</span>
      <Button type="button" variant="outline" size="sm" onClick={onClose}>
        {isReloginFailure(reason) ? '閉じて起動し直す' : '閉じて再起動'}
      </Button>
    </div>
  )
}

/** 終わり方の通知 (FR-011)。error ではないので FailureBanner とは別の軽い表示。transcript はそのまま読める。 */
function EndNotice({
  message,
  onClose
}: {
  readonly message: string
  readonly onClose: (() => void) | null
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="border-border text-muted-foreground flex items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <span className="flex-1">{message}</span>
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
        onClick={onDismiss}
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
              onClick={() => onRemove(item.id)}
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
