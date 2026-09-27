import { useMemo, useState } from 'react'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike
} from '@assistant-ui/react'

import type { LaunchFailureReason } from '@domain/session/agent-session'

import { EmptyState, EmptyStateGreeting } from '@/components/assistant-ui/elements/empty-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { Button } from '@/components/ui/button'
import { useFolders } from '@/features/workspace-folders/useFolders'
import { useRuntimes } from '@/features/runtime-list/useRuntimes'

import { ApprovalCard } from './ApprovalCard'
import { isReloginFailure, launchFailureLabel, launchRejectLabel, runStateLabel } from './labels'
import { useLiveSession, type LiveSession } from './useLiveSession'

/**
 * 単一セッションの起動 + ストリーミング画面 (X-1 / FE-001・FE-002・FE-003・FE-010・FE-011・FE-020・FE-021・FE-030)。
 *
 * - **起動 entry** (FE-003): R-1 の登録フォルダ + 実行中 WslRuntime を選び `launchSession` を発火。
 * - **live stream** (FE-001): port2 の `SessionEvent` を `useExternalStoreRuntime` に流す。
 * - **composer** (FE-002): R-3 の `isDisabled: true` を外し送信経路を開く。IME/Enter は assistant-ui の
 *   `ComposerPrimitive.Input` が扱う (composition 中の確定 Enter は送信にしない。FE-040)。
 * - **承認カード** (FE-010) / **聞かれず拒否の表示** (FE-011) / **中断・強制終了の 2 操作** (FE-020) /
 *   **失敗の理由表示 + 次操作** (FE-030)。
 */
export function SessionScreen(): React.JSX.Element {
  const session = useLiveSession()
  if (session.phase === 'entry' || session.phase === 'rejected') {
    return <LaunchEntry session={session} />
  }
  if (session.phase === 'launching') return <Launching />
  return <LiveThread session={session} />
}

/* ── 起動 entry (FE-003) ─────────────────────────────────────────── */

function LaunchEntry({ session }: { readonly session: LiveSession }): React.JSX.Element {
  const folders = useFolders()
  const runtimes = useRuntimes()
  const [folderId, setFolderId] = useState('')
  const [runtimeId, setRuntimeId] = useState('')

  const folderList = folders.list?.folders ?? []
  // 起動できるのは WslRuntime に限る (FR-003)。停止中も選ばせるが、起動ゲートが理由つきで拒否する。
  const wslRuntimes = useMemo(
    () => (runtimes.list?.runtimes ?? []).filter((r) => r.kind === 'wsl'),
    [runtimes.list]
  )

  const canLaunch = folderId !== '' && runtimeId !== ''

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">セッションを起動</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          作業フォルダと実行中の WSL
          ディストロを選んで起動します。停止中・未確認・所在不一致は起動できません。
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">作業フォルダ</span>
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className="border-border bg-background rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="">選択してください</option>
          {folderList.map((f) => (
            <option key={f.id} value={f.id}>
              {f.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">ランタイム (WSL)</span>
        <select
          value={runtimeId}
          onChange={(e) => setRuntimeId(e.target.value)}
          className="border-border bg-background rounded-md border px-2 py-1.5 text-sm"
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

      {session.phase === 'rejected' && session.rejectReason !== null && (
        <p role="alert" className="text-destructive text-sm">
          {launchRejectLabel(session.rejectReason)}
        </p>
      )}

      <div>
        <Button
          type="button"
          disabled={!canLaunch}
          onClick={() => void session.launch(folderId, runtimeId)}
        >
          起動
        </Button>
      </div>
    </div>
  )
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
  const runtime = useExternalStoreRuntime({
    messages: session.messages as ThreadMessageLike[],
    // **`running` のときだけ isRunning。** `launching` は「利用者の初回プロンプト待ち」であり
    // (claude は初回 user メッセージが届くまで `system/init` すら出さない — 実測)、この間は composer を
    // **送信ボタン**にしておかないと最初のプロンプトを送れずデッドロックする (quickstart 実機不具合)。
    // 起動窓の中断は SessionControls の「強制終了」が担う。
    isRunning: session.runState === 'running',
    // **error / 強制終了後は composer を無効化する** (pr-gate po H-001 / H-401)。terminal error 後も
    // 強制終了 (kill) 後も agents の query loop / worker は終了済みで、送信しても永久に消費されない
    // (worker は kill で exit し registry から外れる) — 有効なままだと「打っても応答が来ない」dead-end を再生産する。
    // 復帰は FailureBanner / SessionControls の「閉じる」(reset) に一本化。done / interrupted は継続有効なので無効化しない。
    isDisabled: session.runState === 'error' || session.killed,
    convertMessage: (message) => message,
    onNew: (message) => {
      const text = extractText(message)
      // 空/空白のみは送らない (main も拒否するが往復を省く。FR-018 / SC-009)。
      if (text.length > 0) {
        session.appendUser(text)
        session.send(text)
      }
      return Promise.resolve()
    },
    // composer の停止ボタンは中断に割り当てる (強制終了は別ボタン。FR-015/016)。
    onCancel: () => {
      session.interrupt()
      return Promise.resolve()
    }
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionControls session={session} />
      {/* error 状態は必ず理由と次操作を出す。failure イベントが理由を伴わず来た場合も汎用表示に倒す (US-4 AC-8 / M-002)。 */}
      {(session.failureReason !== null || session.runState === 'error') && (
        <FailureBanner reason={session.failureReason} onReset={session.reset} />
      )}
      {/* 強制終了は error ではないので専用の軽い終端通知を出す (pr-gate po H-401)。 */}
      {session.killed && session.runState !== 'error' && <KilledNotice onReset={session.reset} />}
      {session.denied.length > 0 && <DeniedNotice session={session} />}
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
          <Thread components={{ Welcome: SessionWelcome }} />
        </AssistantRuntimeProvider>
      </div>
    </div>
  )
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
function SessionControls({ session }: { readonly session: LiveSession }): React.JSX.Element {
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
          onClick={() => session.interrupt()}
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
