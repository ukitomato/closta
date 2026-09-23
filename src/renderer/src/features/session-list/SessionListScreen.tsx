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

import type { EnumerationOutcomeDTO, SessionGroupDTO, SessionSummaryDTO } from '@domain/session/dto'
import type { LocationDTO } from '@domain/workspace/dto'
import { sessionRowKey } from '@domain/session/summary'
import type { FailureReason } from '@domain/session/target'

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
import { useFolderLabels } from './useFolderLabels'
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
function SectionHeading({
  group,
  folderName
}: {
  group: SessionGroupDTO
  folderName: string | null
}): React.JSX.Element {
  switch (group.kind) {
    case 'folder':
      return (
        <div className="flex items-baseline gap-2">
          {/*
            **`folderId` をそのまま出さない** (FR-047)。識別子は乱数由来の 32 桁であり、
            利用者に意味を持たない。登録一覧と突き合わせて表示名を引く。
            引けない窓 (登録解除と取得の交差) では種別名だけを出す — 空欄にしない。
          */}
          <span className="text-sm font-medium">{folderName ?? '登録フォルダ'}</span>
          {/*
            **フォルダ単位の値は「含む」と読める形にする** (po H-001)。
            この値は行ごとの越境を OR に畳んだものであり、
            どの行が越境かはここから決まらない。行単位は `SessionMeta` が出す。
          */}
          <span className="text-muted-foreground text-xs">
            {group.boundary === 'cross' ? '越境を含む' : BOUNDARY_LABELS[group.boundary]}
          </span>
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
function Section({
  section,
  folderName,
  complete,
  outcomes
}: {
  section: SessionSection
  folderName: string | null
  /** 全所在ぶんが出そろったか。**件数の見せ方を決める** (FR-037)。 */
  complete: boolean
  /**
   * この区画に関わりうる所在の結果。**0 件の意味を決める** (ux H-004)。
   *
   * 「読めなかった」を「無い」と読ませてはならない (FR-012)。
   *
   * **代表 1 件に潰さない** (pr-gate Round 1 / ux H-203)。
   * 複数所在にまたがる区画で 1 件を選ぶと、必ず**当て推量**になる。
   */
  outcomes: readonly EnumerationOutcomeDTO[]
}): React.JSX.Element {
  const collapsible = section.group.kind === 'unregistered'
  const [open, setOpen] = useState(!collapsible)
  const count = section.rowKeys.length
  const seedFolderDraft = useUiStore((s) => s.seedFolderDraft)
  const group = section.group
  const headingId = `section-heading-${section.key}`
  const panelId = `section-panel-${section.key}`

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
    <section
      className={cn(paper, 'rounded-xl p-3')}
      /*
       * **区画に名前を与える** (a11y H-004)。
       * `<section>` はアクセシブル名を持たないと region として露出せず、
       * 4 種のグループが「名前の無い generic」になる。
       * この 4 種の読み分けは本 feature の中核である (FR-022 / FR-025 / FR-028)。
       */
      aria-labelledby={headingId}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {/* **heading にする** (a11y H-004)。見た目は `text-sm font-medium` のまま。 */}
          <h3 id={headingId} className="min-w-0">
            <SectionHeading group={section.group} folderName={folderName} />
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {countText(
              count,
              complete,
              outcomes.some((outcome) => outcome.truncated)
            )}
          </span>
          {registerSeed !== null && (
            <Button
              variant="outline"
              size="sm"
              /* **遷移することを名前から分かるようにする** (a11y H-006)。 */
              aria-describedby="register-seed-help"
              onClick={() => seedFolderDraft(registerSeed)}
            >
              作業フォルダとして登録
            </Button>
          )}
          {collapsible && (
            <Button
              variant="ghost"
              size="sm"
              /*
               * **開閉の状態を支援技術に伝える** (a11y H-002)。
               * ラベルの「畳む / 開く」だけでは、閉じているのか本当に 0 件なのか
               * 取得途中なのかが区別できない。この 3 者の区別は
               * FR-051 / FR-025 / FR-037 がわざわざ分けた軸である。
               */
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen(!open)}
            >
              {open ? '畳む' : '開く'}
            </Button>
          )}
        </div>
      </div>

      {/*
        **`aria-controls` の相手は常に存在させるが、中身は条件で描く** (a11y H-002)。
        畳んだ区画の行を `hidden` で DOM に残すと、1 区画に数百件入りうるため
        描画費用を払い続ける (実測で 1 所在 278 件)。SC-008 の余裕は 752 ms しかない。
        状態は `aria-expanded` が運ぶので、これで 4.1.2 は満たす。
      */}
      <div id={panelId}>
        {open && count === 0 && <SectionEmpty complete={complete} outcomes={outcomes} />}

        {open && count > 0 && (
          <div className="mt-2">
            {/*
              **付帯情報を行の中に描く** (a11y H-005 / ux H-001)。
              以前は「表題の列」と「メタデータの列」を別ブロックで並べており、
              対応づけが配列の順序だけに依っていた。
            */}
            <ThreadListItemsByKey
              rowKeys={section.rowKeys}
              renderMeta={(rowKey) => {
                const session = section.sessions.find((s) => sessionRowKey(s) === rowKey)
                return session === undefined ? null : <SessionMeta session={session} />
              }}
            />
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * 区画が 0 件のときの文。
 *
 * **0 件を状態抜きで断言しない** (code-gate iteration 1 / ux H-004)。
 * 以前は `count === 0` だけを条件に「このフォルダのセッションはありません。」と出しており、
 * 段階描画の途中でも、所在が `failed` (権限不足 / 停止中) のときも同じ文だった。
 * `labels.ts` が `no-history` と `failed` をわざわざ訳し分けている意味が区画では消えていた。
 * **「読めなかった」を「無い」と読ませてはならない** (FR-012)。
 */
function SectionEmpty({
  complete,
  outcomes
}: {
  complete: boolean
  outcomes: readonly EnumerationOutcomeDTO[]
}): React.JSX.Element {
  if (!complete) {
    return <p className="text-muted-foreground mt-2 text-sm">取得中です。</p>
  }

  const failed = outcomes.filter((outcome) => outcome.status === 'failed')

  /*
   * **1 件でも読めていなければ 0 件と断言しない**
   * (pr-gate Round 1 / ux H-201 / FR-012)。
   *
   * 以前は「関係する所在を **1 つに絞れたとき**だけ」読めなかったと言い、
   * 絞れなければ「このフォルダのセッションはありません。」へ落ちていた。
   * **判定が逆だった** — 絞れないのは複数の所在が関わるときであり、
   * それはむしろ隠れている行がある可能性が高い状況である。
   *
   * **どの所在が読めなかったかを列挙する。** 代表 1 件を選ぶと
   * 関係しない所在の解消手順を出しうる (ux H-203)。
   */
  if (failed.length > 0) {
    return (
      <div className="mt-2 space-y-0.5">
        <p className="text-sm">
          {failed.length === outcomes.length
            ? 'この区画に関わる所在を列挙できていません。'
            : '列挙できていない所在があるため、ここに出ていない行があるかもしれません。'}
        </p>
        <ul className="text-muted-foreground space-y-0.5 text-xs">
          {failed.map((outcome) => (
            <li key={outcome.targetKey}>
              {locationLabelOf(outcome.location)}
              {outcome.reasonKey !== null && (
                <>
                  {' — '}
                  {FAILURE_REASON_LABELS[outcome.reasonKey]}{' '}
                  {FAILURE_REASON_HINTS[outcome.reasonKey]}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  /* **履歴 0 件の登録フォルダを画面から消さない** (FR-051)。 */
  return (
    <div className="mt-2 space-y-0.5">
      <p className="text-muted-foreground text-sm">このフォルダのセッションはありません。</p>
      <p className="text-muted-foreground text-xs">
        このフォルダで Claude Code を使うと、ここに並びます。
      </p>
    </div>
  )
}

/**
 * 行 1 件の付帯情報。
 *
 * **`SDKSessionInfo` の 10 項目すべてに表示先を与える** (FE-048 / Principle XII)。
 * `summary` / `firstPrompt` / `customTitle` / `sessionId` / `lastModified` は
 * 行の表題が使う (FR-047)。残る項目をここに出す —
 * 割り当てない項目を残すと O-2 が `docs/ui-coverage.md` を作るときに
 * 「未表示情報がゼロ」を主張できない。
 *
 * **裸の値を並べない** (a11y M-004)。何の情報かを `sr-only` で添える。
 * 視覚的な体裁は変えない。
 */
function SessionMeta({ session }: { session: SessionSummaryDTO }): React.JSX.Element {
  return (
    <span className="flex flex-wrap gap-x-2">
      <SourceLabel label={session.targetLabel} />
      <span>
        <span className="sr-only">作業ディレクトリの所在 </span>
        {CWD_ORIGIN_LABELS[session.originKind]}
      </span>
      {session.createdAt !== null && <span>開始 {formatTime(session.createdAt)}</span>}
      {session.gitBranch !== null && <span>ブランチ {session.gitBranch}</span>}
      {session.tag !== null && <span>タグ {session.tag}</span>}
      {session.fileSize !== null && (
        <span>
          <span className="sr-only">記録の大きさ </span>
          {formatBytes(session.fileSize)}
        </span>
      )}
      {/*
        **越境は行ごとに出す** (pr-gate Round 1 / po H-001 / US-1 AC-4)。
        以前は区画見出しのフォルダ単位の OR だけだったため、
        1 件でも越境があるとフォルダ内の全行が越境と読めた。
        AD-016 の性能崖は行ごとの性質であり、R-1 は行ごとに提示している。
      */}
      {session.boundary === 'cross' && (
        <span className="font-medium">
          <span className="sr-only">この行は </span>
          {BOUNDARY_LABELS.cross}
        </span>
      )}
      {session.worktree && <span>worktree</span>}
      {session.programmatic && <span>SDK / daemon 由来</span>}
      {session.normalized.truncated && <span>（表示は切り詰め）</span>}
      {session.normalized.controlCharsRemoved && <span>（制御文字を除去）</span>}
    </span>
  )
}

/**
 * 所在ごとの成否 (FR-030 / FR-032 / FE-063)。**失敗を黙って隠さない。**
 *
 * **停止中には再検出の導線を添える** — 理由だけでは次の操作が分からない。
 * **アプリがディストロを起動することはしない** (SC-005 / FR-007)。
 * 起動は利用者が行い、アプリは「取り直す」手段だけを提供する。
 */
/**
 * 件数の表記。
 *
 * **出そろうまで確定値として見せない** (FR-037 / code-gate iteration 1 / ux H-002)。
 * data-model §7 は「`partial` の間はグループ件数を確定値として見せない。
 * 『このフォルダのセッションは 3 件』と見せると誤りになる」と定めている。
 * 所在ごとに段階公開するため、この窓は**毎回の初回取得で必ず通る** —
 * 実測でホストの 43 件が先に出て、そのあと WSL の 357 件が続いた。
 *
 * ヘッダだけがこの保護を持っていて、区画見出しと所在行が無条件に描いていた。
 */
/**
 * 全所在が未列挙のときの案内文 (FR-031 / code-gate iteration 1 / ux M-003)。
 *
 * **理由に関わらず「ディストロを起動して」と言っていた。**
 * `permission-denied` や `wsl-unavailable` は起動しても直らず、
 * 所在ごとの行では理由別のヒントが出るため、同一画面に矛盾した指示が並んでいた。
 */
function unlistedHint(outcomes: readonly EnumerationOutcomeDTO[]): string {
  const reasons = new Set(
    outcomes.map((outcome) => outcome.reasonKey).filter((key): key is FailureReason => key !== null)
  )
  const only = reasons.size === 1 ? [...reasons][0] : null
  if (only !== null) return FAILURE_REASON_HINTS[only]
  return '所在ごとの理由は「列挙の結果」を確認してください。'
}

/**
 * 件数の文 (FR-037 / FR-038)。
 *
 * **確定と言えるのは「出そろっていて、かつ打ち切っていない」ときだけである**
 * (pr-gate Round 1 / ux H-204)。以前は `complete` だけを見ていたため、
 * 上限で打ち切った対象の隣に「5000 件」と**確定形**で出ていた。
 * 同じ行に「上限で打ち切りました」が並んでおり、文が互いに矛盾していた。
 */
function countText(count: number, complete: boolean, truncated = false): string {
  if (!complete) return `${count} 件以上 (取得中)`
  return truncated ? `${count} 件以上` : `${count} 件`
}

/*
 * **取得中のボタンを `disabled` にしない** (code-gate iteration 1 / a11y H-007)。
 *
 * `disabled` は要素をタブ順から外す。キーボードで Enter した瞬間に
 * **押している要素自身が disabled になってフォーカスが body に落ち**、
 * 取得が終わっても戻らない。実測で先頭ページに 1.2〜2.0 秒かかるため、
 * その間フォーカスも feedback も無い状態になる。
 *
 * **同じ判断は `WorkspaceFoldersScreen.tsx` が既に明文化している** — 方針を 2 つ持たない。
 * 押せない性質は `aria-disabled` で伝え、実行の抑止は onClick 先頭のガードが保つ。
 */
function busyGuard(busy: boolean, run: () => void): () => void {
  return () => {
    if (busy) return
    run()
  }
}

/**
 * 取得中のボタンに共通で渡す属性。**`disabled` を使わない** (a11y H-007)。
 *
 * **`opacity` をラベルに掛けない** (pr-gate Round 1 / a11y H-201)。
 * `opacity-50` は子孫すべてに掛かるため、busy のラベル (「取得中…」) が
 * `text-foreground` 50% = **3.74:1** に落ちていた (AA は 4.5:1)。
 *
 * **`disabled` をやめた目的を打ち消していた。** 到達させる狙いは
 * 「押せないことにも理由にも気付ける」ことなのに、到達した先で文字が読めない。
 * しかも実測 1.2〜2.0 秒のあいだ、このラベルが進行中を示す数少ない手がかりである。
 *
 * **減光するのはアイコンだけにする。** 押せない見えは枠線と `aria-disabled` が担う。
 */
function busyProps(busy: boolean): { 'aria-disabled': boolean; className?: string } {
  return { 'aria-disabled': busy, className: busy ? '[&_svg]:opacity-50' : undefined }
}

function Outcomes({
  outcomes,
  onRediscover,
  onFetchMore,
  busy,
  complete
}: {
  outcomes: readonly EnumerationOutcomeDTO[]
  onRediscover: () => void
  /** 上限で打ち切られた対象の続きを取る (FR-038 / ux H-007)。 */
  onFetchMore: (targetKey: string, offset: number) => void
  busy: boolean
  /** 全所在ぶんが出そろったか。**件数の見せ方を決める** (FR-037)。 */
  complete: boolean
}): React.JSX.Element {
  const hasStopped = outcomes.some((outcome) => outcome.reasonKey === 'distro-not-running')

  return (
    <section className={cn(paper, 'rounded-xl p-3')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">列挙の結果</h2>
        {hasStopped && (
          <Button
            variant="outline"
            size="sm"
            {...busyProps(busy)}
            onClick={busyGuard(busy, onRediscover)}
          >
            ランタイムを再検出して取り直す
          </Button>
        )}
      </div>
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
              <span className="text-muted-foreground text-xs">
                {countText(outcome.count, complete, outcome.truncated)}
              </span>
            )}
            {outcome.truncated && (
              /*
               * **黙って切らないだけでは足りない** (FR-038 / code-gate iteration 1 / ux H-007)。
               *
               * `fetchMore` は `useSessions` に定義されていたが**画面からの呼び出しが 0 件**で、
               * 「上限で打ち切りました」が行き止まりになっていた。
               * FR-038 は続きを取る手段を求めている。
               */
              <>
                <span className="text-xs">上限で打ち切りました</span>
                <Button
                  variant="outline"
                  size="sm"
                  {...busyProps(busy)}
                  onClick={busyGuard(busy, () => onFetchMore(outcome.targetKey, outcome.count))}
                >
                  {busy ? '取得中…' : '続きを取る'}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * 区画の内容を左右しうる所在の結果 (ux H-004 / pr-gate Round 1 / ux H-203)。
 *
 * **1 件に絞らない。** 以前は 1 件を返す形で、決められないときに
 * `outcomes[0]` を**当て推量で**返していた。所在の並びは探索順で決まるため、
 * 「Ubuntu-22.04 の権限不足を解消してください」という手順が
 * **Windows の登録フォルダの区画の下**に出ていた。
 * 解消手順は間違った所在に向けると、正しいときより悪い —
 * 利用者はそちらを操作して、状況が変わらない理由を得られない。
 *
 * **登録フォルダの区画は所在で絞れない。** Windows の登録フォルダを
 * WSL から `/mnt/c/...` 経由で使う形を本 feature は越境として一級で扱っており
 * (`group.ts` / FR-023)、**どの所在の失敗でもその登録フォルダの行を隠しうる**。
 * 所在が定義に含まれるグループ (`pending` / `unregistered`) だけが絞れる。
 */
function outcomesForSection(
  section: SessionSection,
  outcomes: readonly EnumerationOutcomeDTO[]
): readonly EnumerationOutcomeDTO[] {
  const groupLocation =
    section.group.kind === 'pending' || section.group.kind === 'unregistered'
      ? section.group.location
      : null

  if (groupLocation !== null) {
    const label = locationLabelOf(groupLocation)
    return outcomes.filter((outcome) => locationLabelOf(outcome.location) === label)
  }

  /* 行があるなら、**その行が来た対象**だけが件数に関わる。 */
  const targetKeys = new Set(section.sessions.map((session) => session.targetKey))
  if (targetKeys.size > 0) {
    return outcomes.filter((outcome) => targetKeys.has(outcome.targetKey))
  }

  return outcomes
}

/**
 * 絞り込みの選択肢 1 つ (code-gate iteration 1 / a11y H-003)。
 *
 * **選択を 3 通りで示す。** `aria-pressed` (支援技術) / 太字 (色覚に依らない視覚) /
 * `sr-only` の「選択中」(読み上げ)。`variant` の背景差 1.04:1 だけには依らない。
 */
function FilterChip({
  selected,
  onSelect,
  children
}: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Button
      variant={selected ? 'secondary' : 'ghost'}
      size="sm"
      aria-pressed={selected}
      className={cn(selected && 'font-semibold')}
      onClick={onSelect}
    >
      {children}
      {selected && <span className="sr-only">（選択中）</span>}
    </Button>
  )
}

/** 所在の絞り込みの選択肢。**参照キーではなく表示名を鍵にしない** — 同名の所在はない。 */
type LocationFilter = { readonly kind: 'all' } | { readonly kind: 'one'; readonly label: string }

/** 所在の表示名。**1 箇所で決める** — 選択肢の生成と絞り込みが同じ文字列を使う必要がある。 */
function locationLabelOf(location: LocationDTO): string {
  return location.kind === 'wsl' ? location.distroName : 'Windows'
}

/**
 * `targetKey` から所在を引く索引。
 *
 * **所在はセッションではなく列挙の結果が持つ。** `SessionGroupDTO` の `folder` variant は
 * `location` を持たない (登録フォルダは複数所在のセッションを含みうる) ため、
 * グループから所在は引けない。`SessionSummaryDTO.targetKey` と
 * `EnumerationOutcomeDTO.targetKey` が同じ値なので、これで行単位に引ける。
 */
function locationIndexOf(outcomes: readonly EnumerationOutcomeDTO[]): ReadonlyMap<string, string> {
  const index = new Map<string, string>()
  for (const outcome of outcomes) index.set(outcome.targetKey, locationLabelOf(outcome.location))
  return index
}

/**
 * 所在の絞り込みを**セッション単位**で適用する (FR-040 / code-gate iteration 1 / ux H-005)。
 *
 * **グループ単位で絞っていた。** `folder` と `unknown` は `location` を持たないため
 * 一律で除外され、**所在を選ぶと登録フォルダの区画が全滅していた**。
 * この feature の中心価値は所在をまたぐ一覧であり、その絞り込みが主役のデータを隠して
 * 「一致するセッションがありません」と表示していた。
 *
 * **区画ごと落とすのは中身が 0 件になったときだけ。** 見出しだけを残すと
 * 「この所在にこのフォルダのセッションがある」と誤読させる。
 *
 * @returns 絞り込み後の区画。1 件も残らなければ `null`。
 */
function narrowToLocation(
  section: SessionSection,
  filter: LocationFilter,
  locationOf: ReadonlyMap<string, string>
): SessionSection | null {
  if (filter.kind === 'all') return section

  const sessions: SessionSummaryDTO[] = []
  const rowKeys: string[] = []
  /* **同じ添字で削る。** `rows.ts` が両者の順序と長さの一致を保証している。 */
  section.sessions.forEach((session, at) => {
    if (locationOf.get(session.targetKey) !== filter.label) return
    sessions.push(session)
    rowKeys.push(section.rowKeys[at])
  })

  if (sessions.length === 0) return null
  return { ...section, sessions, rowKeys }
}

export function SessionListScreen(): React.JSX.Element {
  const sessions = useSessions()
  const folderLabels = useFolderLabels()

  /*
   * **絞り込みで IPC を往復させない** (FR-040 / contracts ipc)。
   * 取得済みの索引を絞るだけであり、列挙は起こさない。
   */
  const [locationFilter, setLocationFilter] = useState<LocationFilter>({ kind: 'all' })
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const setScreen = useUiStore((state) => state.setScreen)

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

  /*
   * **所在の選択肢は取得結果から作る。** 固定の一覧を持つと、
   * 検出されていない所在が選べてしまい、常に 0 件の絞り込みができる。
   */
  const locationLabels = useMemo(() => {
    const labels = new Set<string>()
    for (const outcome of sessions.index?.outcomes ?? []) {
      labels.add(locationLabelOf(outcome.location))
    }
    return [...labels]
  }, [sessions.index])

  const locationOf = useMemo(
    () => locationIndexOf(sessions.index?.outcomes ?? []),
    [sessions.index]
  )

  const visible = useMemo(() => {
    const kept: SessionSection[] = []
    for (const section of view.sections) {
      if (folderFilter !== null) {
        if (section.group.kind !== 'folder' || section.group.folderId !== folderFilter) continue
      }
      const narrowed = narrowToLocation(section, locationFilter, locationOf)
      if (narrowed !== null) kept.push(narrowed)
    }
    return kept
  }, [view.sections, locationFilter, folderFilter, locationOf])

  const filtering = locationFilter.kind !== 'all' || folderFilter !== null

  /**
   * 全所在が未列挙か (FR-032 の 4 つ目の条件)。
   *
   * **行が 1 つも `ok` でないこと**で判定する。`no-history` を未列挙に数えない —
   * 「Claude Code を使っていない」と「読めなかった」は示すべきことが違う (FR-012)。
   */
  const allUnlisted =
    (sessions.index?.outcomes.length ?? 0) > 0 &&
    (sessions.index?.outcomes ?? []).every((outcome) => outcome.status === 'failed')

  const total = view.rows.length

  /**
   * 索引の性質による空状態 (FR-032 の 3 つ目と 4 つ目 / ux H-003)。
   *
   * **区画の数では判定しない。** `folder` グループは登録フォルダから必ず seed される。
   *
   * **絞り込み中は出さない。** 絞り込みの結果 0 件は別の条件であり (FR-032 の 5 つ目)、
   * 索引そのものが空であることと混ぜると、解除すれば直る状態に
   * 「セッションがまだありません」と出してしまう。
   *
   * **取得中は出さない。** 段階描画の途中で「まだありません」と断言しない (FR-037)。
   */
  /** 1 件でも読めていない所在があるか (pr-gate Round 1 / ux H-201)。 */
  const hasFailure = (sessions.index?.outcomes ?? []).some((o) => o.status === 'failed')

  const indexLevelNotice: 'all-unlisted' | 'some-unlisted' | 'no-sessions' | null = (() => {
    if (sessions.index === null || filtering) return null

    /*
     * **取得中は断言しない** (pr-gate Round 1 / ux H-202 / FR-037)。
     * main は所在 1 件ぶんずつ公開するので、**最初に公開された所在が失敗していれば
     * その時点の `outcomes` は「全件 failed」になる** —
     * ホストが先頭なので、ホストの権限不足で「どの所在も列挙できていません」が
     * 8 秒級のあいだ出て、次の所在が成功すると黙って消えた。
     * しかも CTA (`rediscover`) は進行中の段階描画を捨ててやり直す。
     *
     * 同じ規則を `no-sessions` は既に持っていた。**片方だけ漏れていた。**
     */
    if (!sessions.index.complete) return null

    if (allUnlisted) return 'all-unlisted'

    /*
     * **一部だけ失敗している状態を「無い」と言わない**
     * (pr-gate Round 1 / ux H-201 / FR-012)。
     *
     * `outcomes` に failed が混ざっていても `allUnlisted` は偽なので、
     * 総数 0 のとき「セッションがまだありません」に落ちていた。
     * 同じ索引で区画も 0 件を断言するため、**画面の 2 箇所が「無い」と言い、
     * 「読めなかった」は所在の行 1 つだけに残っていた**。
     * 「履歴なし」と「列挙できませんでした」を訳し分けた意味が消える。
     */
    if (total === 0 && hasFailure) return 'some-unlisted'

    if (total === 0 && folderLabels.entries.length > 0) return 'no-sessions'
    return null
  })()

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4"
        /* **取得中であることを支援技術に伝える** (a11y H-001)。 */
        aria-busy={sessions.loading}
      >
        {/* 遷移を伴うボタンの説明。**参照されるだけで視覚には出さない** (a11y H-006)。 */}
        <span id="register-seed-help" className="sr-only">
          押すと作業フォルダの登録画面へ移動します。
        </span>

        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-base font-medium">セッション一覧</h1>
            <p
              className="text-muted-foreground mt-0.5 text-xs"
              /*
               * **段階描画の進みをここ 1 箇所で通知する** (code-gate iteration 1 / a11y H-001)。
               *
               * 以前は `features/session-list/` 配下に `aria-live` / `role="status"` /
               * `aria-busy` が 1 つも無く、spec が最も力を入れている 3 つの状態
               * (段階描画中である = FR-037 / 件数が確定した / 所在が列挙できなかった =
               * FR-030・FR-031) が**視覚のみに存在**していた。
               * WSL の先頭 50 件に実測 1.8 秒かかるため、無音の 2 秒が生まれる。
               *
               * **行ごとには付けない。** 所在ごとに行が増える経路
               * (`Outcomes` / `Section`) に live region を置くと、700 件規模で
               * 読み上げが実用にならない。**通知はこの要約 1 行に集約する。**
               * `assertive` は使わない (作業を中断させない)。
               *
               * **常時マウントして中身だけ差し替える** — 条件付きマウントは
               * 実装依存で読まれないことがある (`WorkspaceFoldersScreen` と同じ形)。
               */
              role="status"
              aria-live="polite"
            >
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
            {...busyProps(sessions.loading)}
            onClick={busyGuard(sessions.loading, () => void sessions.refresh())}
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

        {sessions.index !== null && (
          <Outcomes
            outcomes={sessions.index.outcomes}
            busy={sessions.loading}
            complete={sessions.index.complete}
            onRediscover={() => void sessions.rediscover()}
            onFetchMore={(targetKey, offset) => void sessions.fetchMore(targetKey, offset)}
          />
        )}

        {/* ── 絞り込み (FE-072)。**IPC を往復させない。** ────────────── */}
        {sessions.index !== null &&
          (locationLabels.length > 1 || folderLabels.entries.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/*
                **選択状態を色だけで表さない** (code-gate iteration 1 / a11y H-003)。
                `variant` の `secondary` と `ghost` の背景差は白に対し **1.04:1** しかなく、
                晴眼キーボード利用者にも実質不可視だった。さらに `aria-pressed` も
                `role="radiogroup"` も無く、支援技術には**同格のボタン列**に見えていた。
                解除の導線は結果 0 件のときしか出ないため、
                状態が分からないまま「セッションが消えた」と読み違える経路が残っていた。

                **群にアクセシブル名を与える。** 裸の `<span>絞り込み</span>` は
                ラベルとして紐づいていなかった。
              */}
              <span className="text-muted-foreground" aria-hidden>
                絞り込み
              </span>
              <div role="group" aria-label="所在で絞り込む" className="flex flex-wrap gap-2">
                <FilterChip
                  selected={locationFilter.kind === 'all'}
                  onSelect={() => setLocationFilter({ kind: 'all' })}
                >
                  すべての所在
                </FilterChip>
                {locationLabels.map((label) => (
                  <FilterChip
                    key={label}
                    selected={locationFilter.kind === 'one' && locationFilter.label === label}
                    onSelect={() => setLocationFilter({ kind: 'one', label })}
                  >
                    {label}
                  </FilterChip>
                ))}
              </div>
              {folderLabels.entries.length > 0 && (
                <>
                  {/* 装飾の区切り。**読み上げない** (a11y L-001)。 */}
                  <span className="text-muted-foreground" aria-hidden>
                    /
                  </span>
                  <div
                    role="group"
                    aria-label="フォルダで絞り込む"
                    className="flex flex-wrap gap-2"
                  >
                    <FilterChip
                      selected={folderFilter === null}
                      onSelect={() => setFolderFilter(null)}
                    >
                      すべてのフォルダ
                    </FilterChip>
                    {folderLabels.entries.map((entry) => (
                      <FilterChip
                        key={entry.id}
                        selected={folderFilter === entry.id}
                        onSelect={() => setFolderFilter(entry.id)}
                      >
                        {entry.name}
                      </FilterChip>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

        {sessions.index !== null && indexLevelNotice !== null && (
          /*
           * **索引の性質で判定する空状態** (FR-032 / SC-013 / code-gate iteration 1 / ux H-003)。
           *
           * **区画が 0 件かどうかでは判定できない。** `folder` グループは登録フォルダから
           * 必ず seed されるため (FR-051 / `group.ts`)、登録フォルダが 1 件でもあれば
           * 区画は必ず 1 件以上になる。その結果「セッション 0 件」と「全所在が未列挙」の
           * 2 分岐は**実機で到達不能**で、復旧の導線が一度も出なかった。
           *
           * **区画は消さない** (FR-051)。説明と導線を区画一覧の上に出す。
           */
          <EmptyState>
            {indexLevelNotice === 'all-unlisted' ? (
              <>
                <p className="text-sm">どの所在も列挙できていません。</p>
                <p className="text-muted-foreground text-xs">
                  {unlistedHint(sessions.index.outcomes)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  {...busyProps(sessions.loading)}
                  onClick={busyGuard(sessions.loading, () => void sessions.rediscover())}
                >
                  {sessions.loading ? '再検出しています…' : 'ランタイムを再検出して取り直す'}
                </Button>
              </>
            ) : indexLevelNotice === 'some-unlisted' ? (
              /*
               * **「一部は読めなかった」を持つ** (pr-gate Round 1 / ux H-201)。
               *
               * この状態は以前「セッションがまだありません。」に落ちていた。
               * 読めた所在が 0 件で、読めなかった所在がある —
               * **画面に出ている 0 件は「無い」ではなく「分からない」である**。
               * 導線も違う: 使い始めを促すのではなく、読めなかった所在を直す。
               */
              <>
                <p className="text-sm">列挙できた所在にセッションがありません。</p>
                <p className="text-muted-foreground text-xs">
                  列挙できていない所在があります —{' '}
                  {unlistedHint(
                    sessions.index.outcomes.filter((outcome) => outcome.status === 'failed')
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  {...busyProps(sessions.loading)}
                  onClick={busyGuard(sessions.loading, () => void sessions.rediscover())}
                >
                  {sessions.loading ? '再検出しています…' : 'ランタイムを再検出して取り直す'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm">セッションがまだありません。</p>
                <p className="text-muted-foreground text-xs">
                  登録したフォルダで Claude Code を使うと、ここに並びます。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  {...busyProps(sessions.loading)}
                  onClick={busyGuard(sessions.loading, () => void sessions.refresh())}
                >
                  {sessions.loading ? '取得中…' : '取り直す'}
                </Button>
              </>
            )}
          </EmptyState>
        )}

        <ThreadListRoot className="gap-3">
          {visible.map((section) => (
            <Section
              key={section.key}
              section={section}
              complete={sessions.index?.complete === true}
              outcomes={outcomesForSection(section, sessions.index?.outcomes ?? [])}
              folderName={
                section.group.kind === 'folder' ? folderLabels.nameOf(section.group.folderId) : null
              }
            />
          ))}
        </ThreadListRoot>

        {sessions.index !== null && visible.length === 0 && (
          /*
           * **区画が 1 つも無いときの空状態** (FR-032 / SC-013)。
           * どの条件も**文言ではなく操作**を出す — 文言だけでは次に何をすればよいか
           * 分かっても、その場でできない。
           *
           * **「セッション 0 件」と「全所在が未列挙」はここに無い。**
           * どちらも登録フォルダがあれば区画が生まれて到達できないため、
           * 索引の性質で判定して上のバナーに出している (ux H-003)。
           */
          <EmptyState>
            {filtering ? (
              <>
                <p className="text-sm">絞り込みに一致するセッションがありません。</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLocationFilter({ kind: 'all' })
                    setFolderFilter(null)
                  }}
                >
                  絞り込みを解除する
                </Button>
              </>
            ) : folderLabels.entries.length === 0 ? (
              <>
                <p className="text-sm">作業フォルダがまだ登録されていません。</p>
                <p className="text-muted-foreground text-xs">
                  登録すると、そのフォルダのセッションがここに並びます。
                </p>
                <Button variant="outline" size="sm" onClick={() => setScreen('folders')}>
                  作業フォルダを登録する
                </Button>
              </>
            ) : (
              /* 索引の性質による分岐は上のバナーが担う (ux H-003)。 */
              <p className="text-sm">表示できる区画がありません。</p>
            )}
          </EmptyState>
        )}
      </div>
    </AssistantRuntimeProvider>
  )
}
