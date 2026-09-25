/**
 * 入力検証の述語と上限 (AD-023 §7 / FR-036)。
 *
 * **依存を持たない。** 標準モジュールも他の `domain` モジュールも import しない。
 * `ui` から `domain` への到達は型と純粋関数までと決めており (AD-025 §4)、
 * ここに依存が入ると `ui-not-to-core` の推移的到達で壊れる。
 *
 * ## なぜ 1 箇所に集めるか
 *
 * 同じ述語と上限が **IPC 境界 (`app`) と永続化境界 (`infra`) の両方**で要る。
 * 別々に書くと片方だけが変わり、**登録はできるが復元されないフォルダ**が生まれる。
 * SC-013 (再起動で登録内容がすべて復元される) が静かに崩れる形である。
 *
 * これは `domain/workspace/folder.ts` の `isNamespaceConsistent()` が
 * 「IPC 境界と永続化境界の双方がこれを呼ぶ。粒度を揃えないと片方だけ通過する」と
 * 書いているのと同じ理屈で、**同じ扱いを述語と上限にも広げたもの**である。
 *
 * 実際、移す前は次の状態だった。
 *
 * - `hasControlCharacter` が `app/validate.ts` と `infra/settings/folder-record.ts` に**同一実装**
 * - `MAX_DISPLAY_NAME_LENGTH` / `MAX_PATH_VALUE_LENGTH` / `MAX_DIR_ENTRIES` が各 2 箇所
 * - `app/validate.ts` の `MAX_DIR_ENTRIES` は**参照 0 件で死んでいた**
 *   (死んでいることに誰も気付けない形だった)
 */

/**
 * 制御文字を含むか。**NUL・C0・DEL・C1 を拒否する。**
 *
 * 表示名にもパスにも、制御文字が正当に入ることはない。
 * NUL はパス文字列の切り詰めに使われ、C1 は端末の制御列に化ける。
 */
export function hasControlCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0)!
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true
    if (isBidiControl(code)) return true
  }
  return false
}

/**
 * 双方向制御文字か (pr-gate Round 1 / C-001)。
 *
 * **フィルタが 2 系統に分かれていた。**
 * `src/domain/session/normalize.ts` の `isRemovable` は C0 / C1 / DEL に加えて
 * 双方向制御文字を落とすが、**登録と永続化の入口を守っている `hasControlCharacter` は
 * 落としていなかった** — つまり弱い側がパスに当たっていた。
 *
 * **なぜ入口にも要るか。** セッション一覧の `cwdDisplay` を正規化しても、
 * FR-026 の登録導線から渡る値は `PathDTO` であり、その `value` は
 * `makeHostPath` / `makeRuntimePath` を通っただけの値である。
 * 入口を揃えないと、**塞いだ穴の隣に同じ穴が開いたまま残る**。
 *
 * `U+202E` (RLO) を仕込むと表示上のパスを逆順に見せられる。
 * それが `folder-store` の JSON に永続化されると、以後フォルダ一覧に残り続ける。
 */
function isBidiControl(code: number): boolean {
  // ALM / LRM / RLM
  if (code === 0x061c || code === 0x200e || code === 0x200f) return true
  // LRE / RLE / PDF / LRO / RLO
  if (code >= 0x202a && code <= 0x202e) return true
  // LRI / RLI / FSI / PDI
  return code >= 0x2066 && code <= 0x2069
}

/**
 * 表示名の長さ上限。
 *
 * ファイル名の一般的な上限に合わせてある。表示名はファイル名に由来する既定値を持つため、
 * ここを下回らせるとフォルダ名をそのまま既定値にできない場合が出る。
 */
export const MAX_DISPLAY_NAME_LENGTH = 255

/**
 * パス値の長さ上限。
 *
 * Linux の `PATH_MAX` に合わせてある。
 * **ホスト名前空間にもランタイム名前空間にも同じ値を使う** —
 * 名前空間ごとに変えると、変換した瞬間に片方でだけ通る値が生まれる。
 */
export const MAX_PATH_VALUE_LENGTH = 4096

/**
 * 1 ディレクトリから返す項目数の上限。
 *
 * 超えたものは列挙せず `too-many-entries` として扱う。
 * 上限が無いと、巨大なディレクトリ 1 つで IPC のペイロードと描画が破綻する。
 */
export const MAX_DIR_ENTRIES = 2000

/**
 * セッション一覧の先頭ページの件数 (research R-06)。
 *
 * 実測で先頭 50 件が 384 ms、全件 (269 件) が 915 ms だった。
 * **先頭ページを持つ理由は「最初の描画までの時間」であり、通信量ではない。**
 */
export const SESSION_PAGE_SIZE = 50

/**
 * 1 つの列挙対象から取り込むセッション件数の上限。
 *
 * 超えた分は列挙せず `truncated: true` を返す。**黙って切らない** (FR-038)。
 * `MAX_DIR_ENTRIES` と同じ値にしていない — あちらは 1 ディレクトリの項目数、
 * こちらは 1 config ディレクトリのセッション総数であり、増え方が違う。
 * 実測では 1 config ディレクトリに 269 件あった (research R-01)。
 */
export const MAX_SESSIONS_PER_TARGET = 5000

/**
 * `fetchMoreSessions` の `offset` の上限。
 *
 * **未信頼入力の検査に使う実名の上限である** (contracts/ipc-session-list.md の検証表)。
 * 総数の上限と同じ値にする — それを超える `offset` は、どんな列挙対象に対しても
 * 意味を持たないためである。
 */
export const MAX_SESSION_OFFSET = MAX_SESSIONS_PER_TARGET

/**
 * セッション識別子の長さの上限 (pr-gate Round 4 / 不変条件 4)。
 *
 * **識別子だけは「不明」に倒せない。** 他の項目は型や内容が期待と違えば
 * `null` にして行を残せるが (FR-049)、識別子を倒すと行の同一性が消える。
 * したがって**使えない識別子は行ごと間引く**しかなく、その判定にこの上限を使う。
 *
 * 実データは UUID (36 文字) である。余裕を見て `MAX_DISPLAY_NAME_LENGTH` と
 * 同じ値にする — 鍵として持ち回り、切り詰めて画面にも出る値であり、
 * 表示名と同じ枠に収まらないものは識別子として扱えない。
 */
export const MAX_SESSION_ID_LENGTH = MAX_DISPLAY_NAME_LENGTH

/**
 * セッション識別子が **UUID 形式** か (R-3 / FR-017 / contracts/ipc-transcript.md 検証表)。
 *
 * **`getTranscript` の `sessionId` に必須**。この値は SDK の `getSessionMessages(sessionId)` に渡り、
 * SDK は `<config-dir>/projects/<cwd>/<uuid>.jsonl` のファイル解決に使う。renderer は未信頼であり
 * (AD-023)、`../../other/session` のような値は「非空・非制御文字」を満たして通過しうる。
 * **UUID 形式への完全一致を要求**することで、セパレータ・ドット・上位ディレクトリ参照を含む値を
 * 構造的に弾く (CWE-22 path traversal)。
 *
 * `targetKey` が既知集合との完全一致で守られる (`isKnownTargetKey`) のと対をなす防御であり、
 * 片方だけ緩いと非対称が抜け道になる (design-gate security H-002)。
 */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value)
}

/**
 * `getTranscript` の `requestToken` の上限 (R-3 / pr-gate S-L-002)。
 *
 * renderer が採番する不透明トークン (stale 応答の突合キー)。他の未信頼入力
 * (`MAX_SESSION_ID_LENGTH` など) と同じく境界で長さ上限を掛け、無制限文字列を
 * `active` Map のキー・handshake・port message として保持しない。
 */
export const MAX_REQUEST_TOKEN_LENGTH = 128

export function isValidRequestToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_REQUEST_TOKEN_LENGTH
}
