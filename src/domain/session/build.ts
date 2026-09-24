import { classifyCwd, isWorktreeOrigin } from './cwd-origin'
import type { RawSessionRecord } from './interfaces'
import {
  PATH_DISPLAY_MAX_BYTES,
  foldMarks,
  normalizeByteCount,
  normalizeEpochMs,
  normalizeOptionalText,
  normalizeText
} from './normalize'
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

  /*
   * **作業ディレクトリの生値も正規化の関門に通す**
   * (pr-gate Round 1 / C-001。security / architecture / platform-boundary が収束した指摘)。
   *
   * FR-049 は正規化対象に**作業ディレクトリの生値**を明記しているが、
   * 会話由来の 5 項目にしか配線されていなかった。そのために用意された
   * `PATH_DISPLAY_MAX_BYTES` は**参照 0 件で死んでいた**。
   *
   * **判定の前に通す。** あとで `display` だけを正規化すると、
   * `cwd.value` と `cwdDisplay` で同じ規則を 2 度書くことになり、
   * `makeHostPath` / `makeRuntimePath` を通ったパス値の側が素のまま残る。
   *
   * **脅威は `normalize.ts` 自身が書いている** — `cwdDisplay` に `U+202E` を仕込むと
   * 「未登録フォルダ」の行が登録済みフォルダのパスに見える形に偽装でき、
   * FR-026 の登録導線で利用者に誤った判断をさせられる。
   * その値は登録されると `folder-store` の JSON へ**永続化される**。
   */
  /*
   * **`null` 判定を持たない** (pr-gate Round 4 / 不変条件 2)。
   * `normalizeText` が `unknown` を受けて「値なし」を空文字に倒すので、
   * 呼び出し側で型と欠損を場合分けしない。空文字は `classifyCwd` が `absent` に落とす。
   */
  const cwdText = normalizeText(input.record.cwd, PATH_DISPLAY_MAX_BYTES)

  const origin = classifyCwd({
    cwd: cwdText.value,
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
    /*
     * **作業ディレクトリの印も畳む** (FR-049)。
     * 「切り詰め・除去が起きたことを payload 上で示さなければならない」の対象は
     * 会話由来の 5 項目だけではない。
     */
    normalized: foldMarks([summary, firstPrompt, customTitle, gitBranch, tag, cwdText])
  }
}
