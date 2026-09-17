import { useCallback, useMemo, useState } from 'react'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'

import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import { paper } from '@/components/assistant-ui/elements/surfaces'
import { cn } from '@/lib/utils'
import {
  ThreadListItemsByKey,
  ThreadListRoot,
  ThreadListSkeleton
} from '@/components/assistant-ui/elements/thread-list.aui'
import { Button } from '@/components/ui/button'
import { useSessionThreadListAdapter } from '@/runtime/thread-list-adapter'
import { useUiStore, type FolderDraftSeed } from '@/stores/ui'

import type { EnumerationOutcomeDTO, SessionGroupDTO } from '@domain/session/dto'

import {
  BOUNDARY_LABELS,
  CWD_ORIGIN_LABELS,
  FAILURE_REASON_HINTS,
  FAILURE_REASON_LABELS,
  PENDING_REASON_LABELS,
  TARGET_STATUS_LABELS,
  UNKNOWN_REASON_LABELS
} from './labels'
import { buildSessionRows, rowTitleText, type SessionSection } from './rows'
import { useSessions } from './useSessions'

/**
 * セッション一覧 (FE-043 / FE-043b / FE-047 / FE-050 / FE-052)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **4 種のグループを潰さない** | FR-022 / FR-025 / FR-028 |
 * | **取得時刻を必ず出す** | FR-034 / SC-012 |
 * | 先頭ページ段階では**件数を確定値として見せない** | FR-037 |
 * | **由来候補 (ユーザ) を常時出す** | FR-052 |
 * | element 内蔵の日付グルーピングと検索を使わない | Principle XIII / plan の UI 構成 |
 * | 起動・改名・削除の導線を持たない | FR-002 / FR-003 |
 *
 * **取得の完了を待たずに枠を描く。** 実測で WSL の先頭 50 件に 1.8 秒かかり、
 * SC-008 の 2 秒予算に対して余裕が約 180 ms しかない
 * ([quickstart-results.md](../../../../../specs/002-session-cross-folder-session-enumeration/quickstart-results.md))。
 * 取得後に初めて描くと予算を超える。
 */

const TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

function formatTime(ms: number): string {
  return TIME_FORMAT.format(new Date(ms))
}

/**
 * transcript の大きさ (FE-048)。
 *
 * **バイト数をそのまま出さない。** 7 桁の数字は行の中で比較できない。
 * 単位は 1024 進で丸める — 対象はファイルサイズである。
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 由来候補の表示 (FR-052)。**どのユーザの履歴かが分からない状態を作らない。** */
function SourceLabel({ label }: { label: string }): React.JSX.Element | null {
  if (label.length === 0) return null
  return (
    <span className="text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 text-xs">{label}</span>
  )
}

/** グループの見出し。**種別ごとに出す情報が違う。** */
function SectionHeading({ group }: { group: SessionGroupDTO }): React.JSX.Element {
  switch (group.kind) {
    case 'folder':
      return (
        <div className="flex items-baseline gap-2">
          {/*
            **フォルダの表示名は登録側が持つ。** ここでは `folderId` しか来ないので、
            表示名の解決は FE-051 で登録一覧と突き合わせる。
            現時点は識別子を出す — 空欄にしない (FR-047)。
          */}
          <span className="text-sm font-medium">{group.folderId}</span>
          <span className="text-muted-foreground text-xs">{BOUNDARY_LABELS[group.boundary]}</span>
        </div>
      )
    case 'pending':
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">
            {group.location.kind === 'wsl' ? group.location.distroName : 'Windows'}
          </span>
          <span className="text-muted-foreground text-xs">
            {PENDING_REASON_LABELS[group.reasonKey]}
          </span>
        </div>
      )
    case 'unregistered':
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">未登録フォルダ</span>
          {/*
            **表示するのは変換済みのパスか安全な表示用文字列だけ。**
            UNC 接頭辞は境界を越えてこない (FR-042)。
          */}
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            {group.cwd?.value ?? group.cwdDisplay ?? '作業ディレクトリ不明'}
          </span>
        </div>
      )
    case 'unknown':
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">作業フォルダ不明</span>
          <span className="text-muted-foreground text-xs">
            {UNKNOWN_REASON_LABELS[group.reasonKey]}
          </span>
        </div>
      )
  }
}

/**
 * 登録の初期値を取り出す (FE-051 / FR-026)。
 *
 * **3 つが揃わないグループには導線を出さない。** 所在が決まらないものは登録できない
 * (登録には所在が要る。AD-025)。
 * 揃っているかを**値で確かめる** — 非 null アサーションで押し通すと、
 * DTO 側の `null` の意味 (所在不明) が画面で消える。
 */
function registerSeedOf(group: SessionGroupDTO): FolderDraftSeed | null {
  if (group.kind !== 'unregistered') return null
  const { location, cwd, suggestedDisplayName } = group
  if (location === null || cwd === null || suggestedDisplayName === null) return null
  // **main が返した値をそのまま運ぶ。** renderer で組み立てない (FR-025)。
  return { location, path: cwd, suggestedDisplayName }
}

/**
 * 1 区画。
 *
 * **未登録グループは既定で畳む** (FR-025)。他人のフォルダや一度きりの作業ディレクトリが
 * 大量に並ぶと、登録済みフォルダが画面から押し出される。
 */
function Section({ section }: { section: SessionSection }): React.JSX.Element {
  const collapsible = section.group.kind === 'unregistered'
  const [open, setOpen] = useState(!collapsible)
  const count = section.rowKeys.length
  const seedFolderDraft = useUiStore((s) => s.seedFolderDraft)
  const group = section.group

  /*
   * **登録の導線 (FE-051 / FR-026)。**
   *
   * **アプリが自動で登録しない。** 所在とパスを初期値として登録画面へ渡すだけで、
   * 確定は利用者が行う。**実在確認もしない** (FR-027) —
   * 任意パスの存在を問い合わせる経路を作らないためである。
   *
   * 所在が決まらないグループには出さない — 登録には所在が要る (AD-025)。
   */
  const registerSeed = registerSeedOf(group)

  return (
    <section className={cn(paper, 'rounded-xl p-3')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <SectionHeading group={section.group} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground text-xs">{count} 件</span>
          {registerSeed !== null && (
            <Button variant="outline" size="sm" onClick={() => seedFolderDraft(registerSeed)}>
              作業フォルダとして登録
            </Button>
          )}
          {collapsible && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
              {open ? '畳む' : '開く'}
            </Button>
          )}
        </div>
      </div>

      {open && count === 0 && (
        /* **履歴 0 件の登録フォルダを画面から消さない** (FR-051)。 */
        <p className="text-muted-foreground mt-2 text-sm">このフォルダのセッションはありません。</p>
      )}

      {open && count > 0 && (
        <div className="mt-2">
          <ThreadListItemsByKey rowKeys={section.rowKeys} />
          <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
            {section.group.sessions.map((session) => (
              <li
                key={`${session.targetKey}/${session.sessionId}`}
                className="flex flex-wrap gap-x-2 px-2.5"
              >
                {/*
                  **`SDKSessionInfo` の 10 項目すべてに表示先を与える** (FE-048 / Principle XII)。
                  `summary` / `firstPrompt` / `customTitle` / `sessionId` / `lastModified` は
                  行の表題が使う (FR-047)。残る 4 項目をここに出す —
                  割り当てない項目を残すと O-2 が `docs/ui-coverage.md` を作るときに
                  「未表示情報がゼロ」を主張できない。
                */}
                <SourceLabel label={session.targetLabel} />
                <span>{CWD_ORIGIN_LABELS[session.originKind]}</span>
                {session.createdAt !== null && <span>開始 {formatTime(session.createdAt)}</span>}
                {session.gitBranch !== null && <span>ブランチ {session.gitBranch}</span>}
                {session.tag !== null && <span>タグ {session.tag}</span>}
                {session.fileSize !== null && <span>{formatBytes(session.fileSize)}</span>}
                {session.worktree && <span>worktree</span>}
                {session.programmatic && <span>SDK / daemon 由来</span>}
                {session.normalized.truncated && <span>（表示は切り詰め）</span>}
                {session.normalized.controlCharsRemoved && <span>（制御文字を除去）</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** 所在ごとの成否 (FR-030 / FR-032)。**失敗を黙って隠さない。** */
function Outcomes({ outcomes }: { outcomes: readonly EnumerationOutcomeDTO[] }): React.JSX.Element {
  return (
    <section className={cn(paper, 'rounded-xl p-3')}>
      <h2 className="text-sm font-medium">列挙の結果</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {outcomes.map((outcome) => (
          <li key={outcome.targetKey} className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">
              {outcome.location.kind === 'wsl' ? outcome.location.distroName : 'Windows'}
            </span>
            <SourceLabel label={outcome.targetLabel} />
            <span className="text-muted-foreground text-xs">
              {TARGET_STATUS_LABELS[outcome.status]}
            </span>
            {outcome.reasonKey !== null && (
              <span className="text-xs">
                {FAILURE_REASON_LABELS[outcome.reasonKey]}
                {/* **解消手順まで示す。** 理由だけでは次の操作が分からない。 */}
                <span className="text-muted-foreground">
                  {' '}
                  {FAILURE_REASON_HINTS[outcome.reasonKey]}
                </span>
              </span>
            )}
            {outcome.status === 'ok' && (
              <span className="text-muted-foreground text-xs">{outcome.count} 件</span>
            )}
            {outcome.truncated && (
              /* **黙って切らない** (FR-038)。 */
              <span className="text-xs">上限で打ち切りました</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SessionListScreen(): React.JSX.Element {
  const sessions = useSessions()

  /*
   * **selector の外で変換する。** `useAuiState` の selector が配列リテラルを返すと
   * 毎回の再描画になる (assistant-ui の契約)。
   */
  const view = useMemo(() => buildSessionRows(sessions.index), [sessions.index])

  const titleOf = useCallback(
    (row: { title: Parameters<typeof rowTitleText>[0] }) => rowTitleText(row.title, formatTime),
    []
  )

  const threadList = useSessionThreadListAdapter({
    rows: view.rows,
    selectedRowKey: sessions.selectedRowKey,
    loading: sessions.loading,
    titleOf,
    onSelect: sessions.select
  })

  const runtime = useExternalStoreRuntime({
    /*
     * **本文は持たない** (FR-044 / SC-011)。R-2 は一覧とメタデータだけである。
     * `isDisabled` で composer ごと閉じ、送信経路を作らない。
     */
    messages: [] as ThreadMessageLike[],
    isDisabled: true,
    convertMessage: (message: ThreadMessageLike) => message,
    onNew: () => {
      throw new Error('セッション一覧に送信経路は無い (R-2 は読み取り専用である)')
    },
    adapters: { threadList }
  })

  const total = view.rows.length

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-base font-medium">セッション一覧</h1>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {/*
                **取得時刻を必ず出す** (FR-034 / SC-012)。
                正本はアプリ外にあり、鮮度は原理的に保証できない (Principle X / R-10)。
              */}
              {sessions.index === null
                ? '未取得'
                : `取得時刻 ${formatTime(sessions.index.fetchedAt)}`}
              {sessions.index !== null && !sessions.index.complete && (
                /* **先頭ページ段階では件数を確定値として見せない** (FR-037)。 */
                <span> — 先頭ページのみ表示しています（件数は確定していません）</span>
              )}
              {sessions.index?.complete === true && <span> — 全 {total} 件</span>}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={sessions.loading}
            onClick={() => void sessions.refresh()}
          >
            {/* **再取得は利用者の明示操作に限る** (FR-033)。自動ポーリングをしない。 */}
            {sessions.loading ? '取得中…' : '全件を取り直す'}
          </Button>
        </header>

        {sessions.failed && (
          <ErrorState
            title="セッション一覧を取得できませんでした"
            detail="再取得してください。続く場合はログを確認してください。"
            retryLabel="再取得"
            retryingLabel="取得中"
            retrying={sessions.loading}
            onRetry={() => void sessions.refresh()}
          />
        )}

        {sessions.index === null && sessions.loading && (
          <div className={cn(paper, 'rounded-xl p-3')}>
            <ThreadListSkeleton />
          </div>
        )}

        {sessions.index !== null && <Outcomes outcomes={sessions.index.outcomes} />}

        <ThreadListRoot className="gap-3">
          {view.sections.map((section) => (
            <Section key={section.key} section={section} />
          ))}
        </ThreadListRoot>

        {sessions.index !== null && view.sections.length === 0 && (
          <EmptyState>
            <p className="text-sm">表示できるセッションがありません。</p>
            <p className="text-muted-foreground text-xs">
              作業フォルダを登録し、Claude Code でセッションを開始すると表示されます。
            </p>
          </EmptyState>
        )}
      </div>
    </AssistantRuntimeProvider>
  )
}
