import type { SessionGroupDTO, SessionIndexDTO, SessionSummaryDTO } from '@domain/session/dto'
import { sessionRowKey, sessionTitle, type SessionTitle } from '@domain/session/summary'

/**
 * グループ構造を assistant-ui の行の並びへ落とす (FE-043)。
 *
 * **区画は行の鍵で持つ。** 位置で持つと runtime 側のスレッド一覧の順序に結合し、
 * 外部ストアの反映が 1 tick 遅れる窓で範囲外の位置を指す (実測で画面が落ちた)。
 * 位置への変換は element 側が runtime の現在値に対して行う。
 *
 * **selector の外で呼ぶ。** `useAuiState` の selector がオブジェクト・配列リテラルを
 * 返すと毎回の再描画になる (assistant-ui の契約)。
 *
 * **ここに規則を持たない。** 表示に使う値の選択は `domain` の `sessionTitle()`、
 * 行の同一性は `sessionRowKey()` が決める。この関数は**並べ替えと索引付けだけ**を行う。
 */

export interface SessionRow {
  /** `(targetKey, sessionId)` の組。adapter の `threads[].id` に渡す。 */
  readonly rowKey: string
  /** 表示に使う値の選択結果 (FR-047)。**整形はしない。** */
  readonly title: SessionTitle
  readonly session: SessionSummaryDTO
}

/**
 * 画面上の 1 区画。
 *
 * **グループ自体を保持する** — 見出しの出し方は種別ごとに違う
 * (フォルダ名 / 所在と理由 / 作業ディレクトリ / 理由のみ)。
 * `rowKeys` は**空でもよい** (履歴 0 件の登録フォルダは見出しだけが出る。FR-051)。
 */
export interface SessionSection {
  readonly key: string
  readonly group: SessionGroupDTO
  readonly rowKeys: readonly string[]
  /**
   * この区画に属するセッション。
   *
   * **`group.sessions` を直接使わない** (code-gate iteration 1 / ux H-005)。
   * 所在で絞り込むときに区画の中身だけを減らす必要があり、
   * グループは判別可能な合併型なので中身を差し替えると型が崩れる。
   *
   * **`rowKeys` と同じ順序・同じ長さである。** 絞り込みは両方を同じ添字で削る。
   * この不変条件が崩れると、表題とメタデータの対応がずれる。
   */
  readonly sessions: readonly SessionSummaryDTO[]
}

export interface SessionRowsView {
  readonly rows: readonly SessionRow[]
  readonly sections: readonly SessionSection[]
}

const EMPTY: SessionRowsView = { rows: [], sections: [] }

/**
 * グループの表示順。**種別で固定する。**
 *
 * 登録フォルダを先に出し、次に「今は決められない」(保留)、
 * 次に「決めた結果として対応が無い」(未登録)、最後に「所在が決まらない」(不明) を置く。
 * 取得のたびに順序が変わると、利用者は同じ行を同じ位置で探せない。
 */
const KIND_ORDER: Record<SessionGroupDTO['kind'], number> = {
  folder: 0,
  pending: 1,
  unregistered: 2,
  unknown: 3
}

/** グループの識別子。**種別ごとに鍵になる値が違う。** */
function sectionKey(group: SessionGroupDTO): string {
  switch (group.kind) {
    case 'folder':
      return `folder:${group.folderId}`
    case 'pending':
      return `pending:${group.location.kind === 'wsl' ? group.location.distroName : 'windows'}:${group.reasonKey}`
    case 'unregistered':
      return `unregistered:${group.cwdKey}`
    case 'unknown':
      return `unknown:${group.reasonKey}`
  }
}

export function buildSessionRows(index: SessionIndexDTO | null): SessionRowsView {
  if (index === null) return EMPTY

  const ordered = [...index.groups].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])

  const rows: SessionRow[] = []
  const sections: SessionSection[] = ordered.map((group) => {
    const rowKeys: string[] = []
    for (const session of group.sessions) {
      const rowKey = sessionRowKey(session)
      rowKeys.push(rowKey)
      rows.push({ rowKey, title: sessionTitle(session), session })
    }
    return { key: sectionKey(group), group, rowKeys, sessions: group.sessions }
  })

  return { rows, sections }
}

/**
 * 行 1 件の表示文字列 (FR-047)。
 *
 * **`domain` は「どれを使うか」しか決めない。** 並べ方と日本語の体裁は `ui` の責務である
 * (`domain` に置くと日本語が `domain` に漏れる)。
 *
 * **空欄にしない。** 要約も最初のプロンプトも無い行は識別子と時刻で示す。
 */
export function rowTitleText(title: SessionTitle, formatTime: (ms: number) => string): string {
  if (title.kind === 'identifier') {
    const at = title.lastModified === null ? '時刻不明' : formatTime(title.lastModified)
    // 識別子は先頭 8 文字で足りる。全長は行に収まらず、他の行との差だけが要る。
    return `${title.sessionId.slice(0, 8)}（${at}）`
  }
  return title.text
}
