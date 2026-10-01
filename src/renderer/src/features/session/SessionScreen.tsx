import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AssistantRuntimeProvider,
  createMessageQueue,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type QueueItemState,
  type ThreadMessageLike
} from '@assistant-ui/react'

import type { LaunchFailureReason } from '@domain/session/agent-session'

import { EmptyState, EmptyStateGreeting } from '@/components/assistant-ui/elements/empty-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { Button } from '@/components/ui/button'

import { ApprovalCard } from './ApprovalCard'
import {
  DEFAULT_MAX_QUEUE_ITEMS,
  isBusyRunState,
  isSendableText,
  type EnqueueVerdict
} from './composer-queue'
import { createCappedAdapter } from './composer-queue-adapter'
import { isReloginFailure, launchFailureLabel, runStateLabel } from './labels'
import { LaunchDialog } from './LaunchDialog'
import { useLiveSession, type LiveSession } from './useLiveSession'

/**
 * 単一セッションの起動 + ストリーミング画面 (X-1 / FE-001・FE-002・FE-003・FE-010・FE-011・FE-020・FE-021・FE-030)。
 *
 * - **起動設定ダイアログ** (X-4 `LaunchDialog`): 6 軸を選び、依存解決・プリセット・越境警告を通して `launchSession` を発火。
 * - **live stream** (FE-001): port2 の `SessionEvent` を `useExternalStoreRuntime` に流す。
 * - **composer** (FE-002): R-3 の `isDisabled: true` を外し送信経路を開く。IME/Enter は assistant-ui の
 *   `ComposerPrimitive.Input` が扱う (composition 中の確定 Enter は送信にしない。FE-040)。
 * - **承認カード** (FE-010) / **聞かれず拒否の表示** (FE-011) / **中断・強制終了の 2 操作** (FE-020) /
 *   **失敗の理由表示 + 次操作** (FE-030)。
 */
export function SessionScreen(): React.JSX.Element {
  const session = useLiveSession()
  if (session.phase === 'entry' || session.phase === 'rejected') {
    // X-4: 起動設定ダイアログ (軸選択・プリセット・依存解決・越境警告)。X-1 の LaunchEntry を置き換える。
    return <LaunchDialog session={session} />
  }
  if (session.phase === 'launching') return <Launching />
  return <LiveThread session={session} />
}

function Launching(): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <GenerationLoader label="セッションを起動中…" tick={0} />
    </div>
  )
}

/* ── ライブスレッド (FE-001/002/010/011/020/030) ───────────────────── */

function extractText(message: AppendMessage): string {
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim()
}

function LiveThread({ session }: { readonly session: LiveSession }): React.JSX.Element {
  const pending = session.pending

  // `appendUser` / `send` / `interrupt` は useLiveSession の**安定 useCallback (deps `[]`)** なので、driver から直接使える
  // (毎 render 同一参照。ref を掴む必要がない = react-hooks/refs を避ける)。
  const { appendUser, send, interrupt } = session

  // **実行中の入力積み = assistant-ui の native message queue** (X-2 / FR-004/005)。
  // `driver.cancel` を**渡さない** — こうすると実行中の送信 (steer lane) は割り込みでなく
  // 「現ターン完了後に処理 (process next)」に degrade する = **次ターン送信・interrupt→steer しない** (FR-005)。
  // dispatch (driver.run) が唯一の送信経路 (queue 提供時 runtime は onNew を呼ばず enqueue/steer に回す。
  // external-store-thread-runtime-core の append 実装)。**controller は useState で 1 度だけ生成**し安定させる。
  const [messageQueue] = useState(() =>
    createMessageQueue({
      run: (message) => {
        const text = extractText(message)
        if (!isSendableText(text)) return // 空/空白・バイト長超過は送らない (FR-003 / R2-M-003)
        appendUser(text)
        send(text)
      }
    })
  )

  // **積み込み時の検証 (capped adapter)** (X-2 / FR-003 / FR-004 / R2-M-001)。native queue は積み込み口に
  // validation を持たないため adapter を wrap し、enqueue 時に空/空白・バイト超過 (`'invalid'`) と件数上限 (`'full'`)
  // を拒否して理由を提示する (最古破棄しない。dispatch 時の遅延失敗も作らない)。判定結果を `rejection` に写して表示する。
  const [rejection, setRejection] = useState<EnqueueVerdict | null>(null)
  const [cappedAdapter] = useState(() =>
    createCappedAdapter(messageQueue.adapter, (verdict) =>
      setRejection(verdict === 'ok' ? null : verdict)
    )
  )

  // **実行中の pending を表示するため steer lane を state に写す** (X-2 / FR-004 の可視化)。
  // runtime は実行中送信を steer lane (`adapter.steerItems`) に回すが、これは `composer.queue`
  // (ComposerPrimitive.Queue の表示ソース = queue lane) に出ない (queue-behavior.test で確認)。
  // controller の subscribe で steer lane を反映し、PendingQueueNotice で表示する。
  const [pendingQueue, setPendingQueue] = useState<readonly QueueItemState[]>(
    messageQueue.adapter.steerItems
  )
  useEffect(() => {
    // 初期値は useState(...) で設定済み。以降の変化を subscribe で反映する。
    return messageQueue.subscribe(() => setPendingQueue(messageQueue.adapter.steerItems))
  }, [messageQueue])

  // **turn が in-flight な間 = busy** (`running` / `awaiting_permission`。単一 locus は composer-queue の isBusyRunState)。
  // busy 中の送信は queue に積み、busy 立下り (turn 完了) で dispatch する (FR-004/FR-005。承認待ち中も積む = C-3/AC-3/SC-003)。
  const busy = isBusyRunState(session.runState)

  // **中断の単一 locus** (FR-006 / R2-M-002 / pr-gate po-N-001)。composer の停止ボタン (onCancel) と SessionControls の
  // 「中断」ボタンの両方からこれを呼ぶ。**notifyCancelled を interrupt の前に呼ぶ** — こうすると queue が pause され、
  // 続く busy 立下りの notifyIdle でも積んだ入力が dispatch されず still_queued として残る (中断で誤 dispatch しない)。
  // どちらか片方だけが notifyCancelled を呼ぶと、もう一方の経路で still_queued が即送信される欠陥になる (po-N-001)。
  const handleInterrupt = useCallback(() => {
    messageQueue.notifyCancelled()
    interrupt()
  }, [messageQueue, interrupt])

  const runtime = useExternalStoreRuntime({
    messages: session.messages as ThreadMessageLike[],
    // **`running` / `awaiting_permission` を busy = isRunning とみなす** (turn が in-flight。承認待ち中の送信も積むため。FR-004)。
    // busy 中は runtime の append が送信を steer lane に回し (`message.steer ?? isRunning`)、notifyIdle まで held にする。
    // `launching` は busy にしない — 「利用者の初回プロンプト待ち」であり (claude は初回 user メッセージが届くまで
    // `system/init` すら出さない — 実測)、この間 composer を **送信ボタン**にしておかないと最初のプロンプトを送れず
    // デッドロックする (quickstart 実機不具合)。起動窓の中断は SessionControls の「強制終了」が担う。
    isRunning: busy,
    // **error / 強制終了後は composer を無効化する** (pr-gate po H-001 / H-401)。terminal error 後も
    // 強制終了 (kill) 後も agents の query loop / worker は終了済みで、送信しても永久に消費されない
    // (worker は kill で exit し registry から外れる) — 有効なままだと「打っても応答が来ない」dead-end を再生産する。
    // 復帰は FailureBanner / SessionControls の「閉じる」(reset) に一本化。done / interrupted は継続有効なので無効化しない。
    isDisabled: session.runState === 'error' || session.killed,
    // **native message queue (capped adapter) を宣言** (FR-004)。実行中の送信はここに積まれ (steer lane。
    // PendingQueueNotice で表示)、現ターン完了 (notifyIdle) で dispatch される。積み込み時に空/超過・件数上限を
    // 拒否する (capped adapter。R2-M-001)。
    queue: cappedAdapter,
    convertMessage: (message) => message,
    // queue 提供時 runtime は送信を queue に回すため onNew は呼ばれない (append 実装)。
    // queue 非提供時の fallback として dispatch と同じ処理を残す (二重送信は起きない = runtime はどちらか一方)。
    onNew: (message) => {
      const text = extractText(message)
      if (text.length > 0) {
        session.appendUser(text)
        session.send(text)
      }
      return Promise.resolve()
    },
    // composer の停止ボタンは中断に割り当てる (強制終了は別ボタン。FR-015/016)。
    // **中断は handleInterrupt に一本化** (notifyCancelled → interrupt。still_queued 残置。FR-006 / R2-M-002 / po-N-001)。
    onCancel: () => {
      handleInterrupt()
      return Promise.resolve()
    }
  })

  // **終端か** (error / 強制終了)。render 中に導出し、pending の disposition 表示と dispatch 抑止に使う (FR-006)。
  const terminal = session.runState === 'error' || session.killed

  // **完了 trigger** (FR-005 / FR-006): busy 立上り (running/awaiting_permission へ) で notifyBusy、立下りで dispatch。
  // 立下り先が **終端 (error/強制終了) なら notifyIdle でなく notifyCancelled** — 未 dispatch 項目を dispatch せず保持し
  // (cancelled として提示。reset/再 launch で unmount 破棄)、通常完了 (done/interrupted) なら notifyIdle で次ターン dispatch する。
  // running↔awaiting_permission の往復では busy が継続するため edge が立たず、承認を挟んでも mid-turn dispatch しない。
  const prevBusyRef = useRef(false)
  useEffect(() => {
    if (busy && !prevBusyRef.current) messageQueue.notifyBusy()
    else if (!busy && prevBusyRef.current) {
      if (terminal) messageQueue.notifyCancelled()
      else messageQueue.notifyIdle()
    }
    prevBusyRef.current = busy
  }, [busy, terminal, messageQueue])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionControls session={session} onInterrupt={handleInterrupt} />
      {/* error 状態は必ず理由と次操作を出す。failure イベントが理由を伴わず来た場合も汎用表示に倒す (US-4 AC-8 / M-002)。 */}
      {(session.failureReason !== null || session.runState === 'error') && (
        <FailureBanner reason={session.failureReason} onReset={session.reset} />
      )}
      {/* 強制終了は error ではないので専用の軽い終端通知を出す (pr-gate po H-401)。 */}
      {session.killed && session.runState !== 'error' && <KilledNotice onReset={session.reset} />}
      {session.denied.length > 0 && <DeniedNotice session={session} />}
      {rejection !== null && !terminal && (
        <QueueRejectionNotice verdict={rejection} onDismiss={() => setRejection(null)} />
      )}
      {/* 終端では pending を「取り消された入力」として提示 (dispatch されない)。非終端では「実行後に送信予定」。 */}
      {terminal && pendingQueue.length > 0 && <CancelledQueueNotice items={pendingQueue} />}
      {!terminal && pendingQueue.length > 0 && (
        <PendingQueueNotice
          items={pendingQueue}
          onRemove={(id) => {
            messageQueue.adapter.remove(id)
            setRejection(null) // 空きができたので拒否理由を消す
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
      <div className="min-h-0 flex-1">
        {/*
         * **空でも Thread を描画する。** composer は Thread が内包しており、空状態を EmptyState で
         * 差し替えて Thread ごと隠すと入力欄が消え、初回プロンプトを送れずデッドロックする
         * (quickstart 実機不具合。claude は初回 user メッセージまで無出力なので UI 側が起点)。
         * 空状態の案内は Thread の Welcome slot に日本語で出す。
         */}
        <AssistantRuntimeProvider runtime={runtime}>
          <DraftBridge session={session} />
          <Thread components={{ Welcome: SessionWelcome }} />
        </AssistantRuntimeProvider>
      </div>
    </div>
  )
}

/**
 * composer の下書き ↔ feature state (`session.draft`) の同期 (X-2 / FR-007 / T021)。
 *
 * `useExternalStoreRuntime` は runtime を `useState` で 1 度だけ生成し isDisabled/isRunning 変化では
 * 再生成しない (composer text は保持される) ため、単一セッションでは下書きは runtime 安定性で残る。
 * 本 bridge はそれに加え、**LiveThread (runtime) が再マウントされる経路 (将来の複数セッション/スレッド切替。
 * X-5) でも下書きを復元できるよう**、composer text を feature state に写し (捕捉)、runtime 生成時に
 * 保持していた下書きを流し込む (復元)。会話由来テキストなので境界・ログ・永続層に出さない (Principle V / FR-008)。
 */
export function DraftBridge({ session }: { readonly session: LiveSession }): null {
  const aui = useAui()
  const text = useAuiState((s) => s.composer.text)
  const setDraft = session.setDraft

  // 捕捉: composer の入力変化を下書き state に写す (メモリ内)。
  useEffect(() => {
    setDraft(text)
  }, [setDraft, text])

  // 復元: この runtime での初回のみ、保持していた下書きを空の composer に流し込む。
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (session.draft !== '' && aui.composer.getState().text === '') {
      aui.composer.setText(session.draft)
    }
  }, [aui, session.draft])

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

/** 状態表示 + 中断/強制終了の 2 操作 (FE-020)。 */
function SessionControls({
  session,
  onInterrupt
}: {
  readonly session: LiveSession
  readonly onInterrupt: () => void
}): React.JSX.Element {
  const active =
    session.runState === 'running' ||
    session.runState === 'awaiting_permission' ||
    session.runState === 'launching'
  return (
    <div className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-2">
      {/* 強制終了後は runState='done' だが「完了」でなく「強制終了しました」を出す (pr-gate po H-401)。 */}
      <span className="text-muted-foreground text-xs">
        {session.killed ? '強制終了しました' : runStateLabel(session.runState)}
      </span>
      <div className="ml-auto flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={session.runState !== 'running'}
          // **中断は handleInterrupt に一本化** (notifyCancelled → interrupt。積んだ入力を still_queued に残す。po-N-001)。
          onClick={onInterrupt}
        >
          中断
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={!active}
          // 強制終了は途中出力の保全・JSONL 非破損を保証しない (FR-016)。
          title="強制終了します。途中出力の保全と履歴ファイルの整合は保証されません。"
          onClick={() => session.kill()}
        >
          強制終了
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => session.reset()}>
          閉じる
        </Button>
      </div>
    </div>
  )
}

/** 実行時失敗の理由表示 + 次操作 (FE-030)。`provider-error` は再ログイン導線。 */
function FailureBanner({
  reason,
  onReset
}: {
  readonly reason: LaunchFailureReason | null
  readonly onReset: () => void
}): React.JSX.Element {
  // 理由キーがあれば訳出、無ければ汎用文 (error 状態は必ず理由と次操作を出す。US-4 AC-8)。
  const detail = reason !== null ? launchFailureLabel(reason) : 'セッションでエラーが発生しました。'
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <span className="flex-1">{detail}</span>
      <Button type="button" variant="outline" size="sm" onClick={onReset}>
        {isReloginFailure(reason) ? '起動し直す' : '再起動'}
      </Button>
    </div>
  )
}

/** 強制終了 (kill) の終端通知 (pr-gate po H-401)。error ではないので FailureBanner とは別の軽い表示。 */
function KilledNotice({ onReset }: { readonly onReset: () => void }): React.JSX.Element {
  return (
    <div
      role="status"
      className="border-border text-muted-foreground flex items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <span className="flex-1">
        強制終了しました。途中出力の保全と履歴ファイルの整合は保証されません。
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onReset}>
        閉じる
      </Button>
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
function DeniedNotice({ session }: { readonly session: LiveSession }): React.JSX.Element {
  return (
    <div className="border-border text-muted-foreground border-b px-4 py-2 text-xs">
      <span className="font-medium">自動的に拒否された操作:</span>
      <ul className="mt-1 list-disc pl-5">
        {session.denied.map((d, i) => (
          <li key={`${d.toolName}-${i}`}>
            {d.toolName} — {d.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}
