import { classifyCwd, isWorktreeOrigin } from './cwd-origin'
import type { RawSessionRecord } from './interfaces'
import { foldMarks, normalizeByteCount, normalizeEpochMs, normalizeOptionalText } from './normalize'
import type { SessionSummary } from './summary'
import type { EnumerationTarget } from './target'

/**
 * 生の記録から要約行を組み立てる (BE-026 / FR-049 / data-model §2 / §3)。
 *
 * **`summary.ts` から分けてある。** 組み立ては出自判定を経由し、
 * 出自判定はパス API (= `node:path`) に依存する。同じファイルに置くと
 * `summary.ts` が `ui` から推移的到達禁止で届かなくなり、
 * 表示の選択規則 (`sessionTitle` / FR-047) を renderer が書き直す羽目になる。
 * **依存の重い側を分ける**のが正しい向きである。
 */

export interface BuildSummaryInput {
  readonly record: RawSessionRecord
  readonly target: EnumerationTarget
  /** 検出済みディストロ名の集合。**出自判定が完全一致で照合する** (AD-025 §2)。 */
  readonly detectedDistros: ReadonlySet<string>
}

/**
 * **ここが未信頼入力の関門である。** 入力は config ディレクトリ由来 =
 * アプリ外のプロセスが書いた値であり、型注釈は実際の値を保証しない。
 *
 * | 工程 | 委ねる先 |
 * |---|---|
 * | 文字列の切り詰めと制御文字の除去 | `normalize.ts` |
 * | 作業ディレクトリの出自判定 | `cwd-origin.ts` (値の形から。所在を推測しない) |
 * | worktree 由来かの判定 | `isWorktreeOrigin()` (SDK が項目を持たないため) |
 * | 数値の検査 | `normalizeEpochMs` / `normalizeByteCount` |
 *
 * **正規化の痕跡を畳んで持つ** — 利用者に「元の値はもっと長い」ことを伝えるためである。
 */
export function buildSessionSummary(input: BuildSummaryInput): SessionSummary {
  const summary = normalizeOptionalText(input.record.summary)
  const firstPrompt = normalizeOptionalText(input.record.firstPrompt)
  const customTitle = normalizeOptionalText(input.record.customTitle)
  const gitBranch = normalizeOptionalText(input.record.gitBranch)
  const tag = normalizeOptionalText(input.record.tag)

  const origin = classifyCwd({
    cwd: input.record.cwd,
    targetLocation: input.target.location,
    detectedDistros: input.detectedDistros
  })

  return {
    sessionId: input.record.sessionId,
    targetKey: input.target.key,
    targetLabel: input.target.label,
    summary: summary.value,
    firstPrompt: firstPrompt.value,
    customTitle: customTitle.value,
    lastModified: normalizeEpochMs(input.record.lastModified),
    createdAt: normalizeEpochMs(input.record.createdAt),
    fileSize: normalizeByteCount(input.record.fileSize),
    gitBranch: gitBranch.value,
    tag: tag.value,
    origin,
    source: {
      programmatic: input.record.programmatic,
      worktree: isWorktreeOrigin(origin)
    },
    normalized: foldMarks([summary, firstPrompt, customTitle, gitBranch, tag])
  }
}
