import type { CwdOrigin } from './cwd-origin'
import type { NormalizationMarks } from './normalize'

/**
 * セッションの要約行 (data-model §3)。
 *
 * **transcript の本文 (メッセージ列 / tool 出力) を含まない** (FR-044 / SC-011)。
 * ただし `summary` / `firstPrompt` / `customTitle` は **SDK の定義上「会話由来の逐語文字列」**
 * を含みうる。**「要約だから安全」と扱わない** — `normalize.ts` の対象である。
 */

/**
 * 由来 (data-model §3.1)。**落とさずに区別する** (FR-029)。
 *
 * 落とすと、Closta 自身が将来起動するセッション (X-1 以降) が一覧から消える。
 */
export interface SessionSource {
  /** SDK / daemon 由来。実測では 269 件中 40 件。 */
  readonly programmatic: boolean
  /** git worktree 配下の作業ディレクトリ。 */
  readonly worktree: boolean
}

export interface SessionSummary {
  readonly sessionId: string
  /** 由来列挙対象への**不透明な参照**。行の同一性と R-3 の本文取得が使う。 */
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
  readonly origin: CwdOrigin
  readonly source: SessionSource
  /** 正規化で切り詰め / 除去が起きたか (FR-049)。 */
  readonly normalized: NormalizationMarks
}

/**
 * 行の同一性 (data-model §3 の不変条件)。
 *
 * **`(targetKey, sessionId)` の組で定義する。** 同一 UUID が 2 つの config ディレクトリに
 * 現れうる (履歴のコピー)。`sessionId` だけを鍵にすると一覧に見分けのつかない 2 行が並び、
 * 選択が一意に決まらず R-3 で別の会話が開く。
 */
export function sessionRowKey(session: SessionSummary): string {
  return `${session.targetKey}\u0000${session.sessionId}`
}

/**
 * 行の表示に使う値の**選択** (FR-047)。
 *
 * **整形はしない。** 「識別子と時刻」をどう並べるかは `ui` の責務であり、
 * ここで文字列を組み立てると日本語の体裁が `domain` に漏れる。
 * **どれを使うかだけを決める。**
 */
export type SessionTitle =
  | { readonly kind: 'custom-title'; readonly text: string }
  | { readonly kind: 'summary'; readonly text: string }
  | { readonly kind: 'first-prompt'; readonly text: string }
  /** 要約も最初のプロンプトも無い。**空欄にしない**ための最後の手段。 */
  | {
      readonly kind: 'identifier'
      readonly sessionId: string
      readonly lastModified: number | null
    }

/**
 * 表示の選択に要る最小の形。
 *
 * **`SessionSummary` と `SessionSummaryDTO` の双方が満たす。**
 * 引数を `SessionSummary` に固定すると renderer が同じ規則を書き直すことになり、
 * FR-047 の規則が 2 箇所に分かれる。
 */
export interface SessionTitleSource {
  readonly sessionId: string
  readonly summary: string | null
  readonly firstPrompt: string | null
  readonly customTitle: string | null
  readonly lastModified: number | null
}

export function sessionTitle(session: SessionTitleSource): SessionTitle {
  const custom = nonEmpty(session.customTitle)
  if (custom !== null) return { kind: 'custom-title', text: custom }

  const summary = nonEmpty(session.summary)
  if (summary !== null) return { kind: 'summary', text: summary }

  const firstPrompt = nonEmpty(session.firstPrompt)
  if (firstPrompt !== null) return { kind: 'first-prompt', text: firstPrompt }

  return {
    kind: 'identifier',
    sessionId: session.sessionId,
    lastModified: session.lastModified
  }
}

function nonEmpty(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * 並び順の既定 (FR-039)。**最終更新の新しい順。**
 *
 * `lastModified` が `null` (不明) の行は**端に置く**。落とさない。
 */
export function byLastModifiedDesc(
  a: { readonly lastModified: number | null },
  b: { readonly lastModified: number | null }
): number {
  if (a.lastModified === b.lastModified) return 0
  if (a.lastModified === null) return 1
  if (b.lastModified === null) return -1
  return b.lastModified - a.lastModified
}
