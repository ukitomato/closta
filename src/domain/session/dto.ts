import type { PathDTO } from '@domain/runtime/dto'
import type { Boundary, LocationDTO } from '@domain/workspace/dto'

import type { CwdOriginKind, PendingReason, UnknownReason } from './keys'
import type { FailureReason, TargetStatus } from './target'

/**
 * IPC 境界の DTO (contracts/ipc-session-list.md)。
 *
 * **`src/domain/session/` に置く** — preload と renderer の双方が `domain` から import する。
 * preload (= `app` レイヤ) に置いて renderer が import すると `ui → app` になり
 * AD-023 §7 の `app ↮ ui` に抵触する。
 *
 * branded type は境界を越えると退化するため、**パスは名前空間を明示して運ぶ**。
 */

/**
 * 正規化の結果 (FR-049)。
 *
 * **利用者に「元の値はもっと長い」ことを伝えるため**に持つ
 * (R-1 の `too-many-entries` と同型)。
 */
export interface NormalizationMarksDTO {
  readonly truncated: boolean
  readonly controlCharsRemoved: boolean
}

/**
 * セッションの要約行。
 *
 * **transcript の本文を含まない** (FR-044 / SC-011)。
 * 表示用の生値を運ぶフィールドは **`cwdDisplay` の 1 種類に限る** —
 * `rawCwd` のような名前で UNC 形式を境界に出す穴を作らない (FR-042)。
 */
export interface SessionSummaryDTO {
  readonly sessionId: string
  /** 由来列挙対象への**不透明な参照**。R-3 の本文取得と行の同一性が使う。 */
  readonly targetKey: string
  /** 表示用。どの候補 (ユーザ) 由来か (FR-052)。 */
  readonly targetLabel: string
  readonly summary: string | null
  readonly firstPrompt: string | null
  readonly customTitle: string | null
  readonly lastModified: number | null
  readonly createdAt: number | null
  readonly fileSize: number | null
  readonly gitBranch: string | null
  readonly tag: string | null
  /** 所在の名前空間に変換済みのパス。所在が決まらない出自では `null`。 */
  readonly cwd: PathDTO | null
  /** 表示専用の安全な文字列。**UNC 接頭辞を含まない** (FR-042)。 */
  readonly cwdDisplay: string | null
  readonly originKind: CwdOriginKind
  readonly programmatic: boolean
  readonly worktree: boolean
  /**
   * この行の対応づけの越境 (pr-gate Round 1 / po H-001)。
   *
   * **行単位である。** 対応づけは `match.ts` がセッションごとに決めるのに、
   * 境界にはフォルダ単位の OR しか出していなかった。
   * 1 件でも越境があるとフォルダ内の全行が越境と読めた。
   *
   * 登録フォルダに対応づかない行 (未登録 / 保留 / 不明) では `null`。
   * **推測で埋めない** — 越境は「登録フォルダとセッションの組み合わせ」の性質である。
   */
  readonly boundary: Boundary | null
  readonly normalized: NormalizationMarksDTO
}

export type SessionGroupDTO =
  | {
      readonly kind: 'folder'
      readonly folderId: string
      readonly boundary: Boundary
      readonly sessions: readonly SessionSummaryDTO[]
    }
  | {
      readonly kind: 'pending'
      readonly location: LocationDTO
      readonly reasonKey: PendingReason
      readonly sessions: readonly SessionSummaryDTO[]
    }
  | {
      readonly kind: 'unregistered'
      readonly cwdKey: string
      readonly cwd: PathDTO | null
      /** 表示専用。**UNC 接頭辞を含まない** (FR-042。`SessionSummaryDTO` と同じ規則)。 */
      readonly cwdDisplay: string | null
      /**
       * 登録するときの表示名の既定値 (FR-026 / FE-051)。
       *
       * **main が組み立てる。** パス値から末尾の名前を取り出す操作であり、
       * renderer に置くと `ui` がパス文字列を分解することになる (Principle I / FR-025)。
       * 所在が決まらないグループでは `null` — 登録の導線そのものが出ない。
       *
       * **既定値であって確定値ではない。** 利用者が上書きでき、
       * **アプリが自動で登録することはない** (FR-026)。
       */
      readonly suggestedDisplayName: string | null
      readonly location: LocationDTO | null
      readonly sessions: readonly SessionSummaryDTO[]
    }
  | {
      readonly kind: 'unknown'
      readonly reasonKey: UnknownReason
      readonly sessions: readonly SessionSummaryDTO[]
    }

/**
 * 所在ごとの成否。
 *
 * **停止中の所在も 1 行として現れる** — `targetKey` を持つため
 * 「既知の `key` + 停止中」を `fetchMoreSessions` で踏める (SC-002 / SC-010)。
 *
 * **config ディレクトリの実体パスを渡さない** (FR-042)。
 * 不透明な `targetKey` と表示用の `targetLabel` だけを渡す。
 */
export interface EnumerationOutcomeDTO {
  readonly location: LocationDTO
  readonly targetKey: string
  readonly targetLabel: string
  readonly status: TargetStatus
  readonly reasonKey: FailureReason | null
  readonly count: number
  readonly truncated: boolean
  readonly fetchedAt: number
}

export interface SessionIndexDTO {
  readonly groups: readonly SessionGroupDTO[]
  readonly outcomes: readonly EnumerationOutcomeDTO[]
  /** 取得時刻。**必ず提示する** (FR-034)。 */
  readonly fetchedAt: number
  /**
   * 全件取得が終わっているか。
   *
   * **`false` のあいだグループ件数を確定値として見せない** (data-model §7) —
   * 先頭ページには新しいものしか含まれず、「このフォルダは 3 件」と見せると誤りになる。
   */
  readonly complete: boolean
}

/**
 * `SessionSummaryDTO` の許可フィールド (SC-011)。
 *
 * **項目が増えたら落ちる形にする。** スキーマ検査がこの集合と完全一致を要求する。
 * 表示用の生値を運ぶのは `cwdDisplay` の 1 種類だけであることも、この集合が固定する。
 */
export const SESSION_SUMMARY_DTO_FIELDS = [
  'sessionId',
  'targetKey',
  'targetLabel',
  'summary',
  'firstPrompt',
  'customTitle',
  'lastModified',
  'createdAt',
  'fileSize',
  'gitBranch',
  'tag',
  'cwd',
  'cwdDisplay',
  'originKind',
  'programmatic',
  'worktree',
  'boundary',
  'normalized'
] as const satisfies readonly (keyof SessionSummaryDTO)[]

/**
 * `SessionGroupDTO` の許可フィールド — **variant ごとに 1 本** (SC-011)。
 *
 * SC-011 は「`SessionSummaryDTO` と `SessionGroupDTO` の**各 variant**の
 * フィールド集合が許可リストと完全一致」を要求するが、Round 1〜4 のあいだ
 * **group 側の許可リストは存在しなかった** (pr-gate Round 4 / PO4-003)。
 * その結果、SC-011 が測っていたのは要求の半分だけだった。
 *
 * **表示用の生値を運ぶフィールドを固定するのがこの集合の目的である。**
 * `unregistered` だけが `cwdDisplay` と `suggestedDisplayName` の 2 つを持つ。
 * 後者は登録ダイアログの既定値であり、`cwd` から `infra` が組み立てる
 * (renderer にパス分解をさせないため)。**3 つ目を増やすときはここが落ちる。**
 */
export const SESSION_GROUP_DTO_FIELDS = {
  folder: ['kind', 'folderId', 'boundary', 'sessions'],
  pending: ['kind', 'location', 'reasonKey', 'sessions'],
  unregistered: [
    'kind',
    'cwdKey',
    'cwd',
    'cwdDisplay',
    'suggestedDisplayName',
    'location',
    'sessions'
  ],
  unknown: ['kind', 'reasonKey', 'sessions']
} as const satisfies {
  [K in SessionGroupDTO['kind']]: readonly (keyof Extract<SessionGroupDTO, { kind: K }>)[]
}

/** `EnumerationOutcomeDTO` の許可フィールド (SC-011)。 */
export const ENUMERATION_OUTCOME_DTO_FIELDS = [
  'location',
  'targetKey',
  'targetLabel',
  'status',
  'reasonKey',
  'count',
  'truncated',
  'fetchedAt'
] as const satisfies readonly (keyof EnumerationOutcomeDTO)[]
