/**
 * `wsl.exe` 出力の解釈 (BE-022 / contracts/runtime-detection.md C-2)。
 *
 * **純粋関数だけを置く。** プロセス起動はここに無い。
 * 環境・ロケールに依存しない形で読むための規則をまとめている。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 行分割後に末尾の復帰文字を除去する | 改行は CRLF のまま |
 * | **名前は名前だけを返す列挙**を正本とする | 列整形・翻訳の影響を受けない |
 * | **実行状態は実行中の列挙との積集合**で決める | 状態文字列はロケール依存 |
 * | バージョン列挙の先頭行を読み飛ばす | ヘッダもロケール依存 |
 * | **バージョンは既知の名前を最長一致で取り除いた残りの最終トークンから読む** | 行内の最初の数値では `Ubuntu-26.04` で誤読する |
 */

/** BOM。`WSL_UTF8=1` でも先頭に付く場合がある。 */
const BOM = '\uFEFF'

/** 既定ディストロを示すマーカー。 */
const DEFAULT_MARKER = '*'

/**
 * 行に分割し、末尾の復帰文字と BOM を落として空行を捨てる。
 * **NUL も落とす** — UTF-16LE を誤って UTF-8 として読んだ場合に紛れ込む。
 */
export function toLines(stdout: string): readonly string[] {
  return stdout
    .split('\n')
    .map((line) => line.replace(/\r+$/, '').split(BOM).join('').split('\u0000').join(''))
    .filter((line) => line.trim().length > 0)
}

/** 名前だけを返す列挙の解釈。**名前の正本** (C-2)。 */
export function parseNames(stdout: string): readonly string[] {
  return toLines(stdout).map((line) => line.trim())
}

/** 実行中のものだけを返す列挙の解釈。名前の集合として扱う。 */
export function parseRunningNames(stdout: string): ReadonlySet<string> {
  return new Set(parseNames(stdout))
}

export interface VerboseEntry {
  readonly name: string
  readonly isDefault: boolean
  /** バージョン列挙から読めなかった場合は `null` (data-model §4)。 */
  readonly version: 1 | 2 | null
}

/**
 * バージョンを含む表形式の列挙の解釈。
 *
 * **既知の名前を最長一致で取り除いた残りの最終トークンからバージョンを読む。**
 * 「行内の最初の数値」で読むと `Ubuntu-26.04` から `26` を読んでしまう。
 *
 * 状態列は**読まない** — 文字列がロケール依存であり、実行状態は
 * 実行中の列挙との積集合で決める (C-2)。
 */
export function parseVerbose(
  stdout: string,
  knownNames: readonly string[]
): readonly VerboseEntry[] {
  const lines = toLines(stdout)
  // 先頭行はヘッダ。翻訳されるため内容を読まずに読み飛ばす。
  const rows = lines.slice(1)

  // 最長一致のため、長い名前から試す。
  const namesByLength = [...knownNames].sort((a, b) => b.length - a.length)

  const entries: VerboseEntry[] = []
  for (const row of rows) {
    const isDefault = row.trimStart().startsWith(DEFAULT_MARKER)
    const body = row.trimStart().replace(/^\*+/, '').trimStart()

    const name = namesByLength.find((candidate) => body.startsWith(candidate))
    if (name === undefined) continue

    const rest = body.slice(name.length).trim()
    const tokens = rest.split(/\s+/).filter((token) => token.length > 0)
    const last = tokens[tokens.length - 1]
    const version = last === '1' ? 1 : last === '2' ? 2 : null

    entries.push({ name, isDefault, version })
  }
  return entries
}

/* ── probe 出力 ──────────────────────────────────────────────────────── */

const MOUNTS_BEGIN = 'mounts_begin=1'
const MOUNTS_END = 'mounts_end=1'

/** 完了の標識。**これが無ければ判定失敗として扱う** (C-5)。 */
const DONE_KEY = 'done'

/** 期待する項目。**欠落を「問題なし」と解釈してはならない** (C-5)。 */
const REQUIRED_KEYS = [
  'bwrap',
  'socat',
  'userns_restrict_readable',
  'userns_restrict',
  'userns_create'
] as const

export interface ProbeOutput {
  readonly values: ReadonlyMap<string, string>
  /** マウント情報の生の行。整形はホスト側で行う (research R-02)。 */
  readonly mountLines: readonly string[]
}

export type ProbeParseFailure = 'incomplete' | 'missing-keys'

export type ProbeParseResult =
  | { readonly ok: true; readonly output: ProbeOutput }
  | { readonly ok: false; readonly reason: ProbeParseFailure }

/**
 * probe 出力を解釈する。
 *
 * **完了の標識と項目の完全性の両方で守る。** スクリプトを逐次読む方式では
 * 途中で失敗しても前半だけが出力された状態で正常終了しうるため、
 * 終了コード 0 だけでは不十分である (C-5)。
 */
export function parseProbeOutput(stdout: string): ProbeParseResult {
  const lines = toLines(stdout)
  const values = new Map<string, string>()
  const mountLines: string[] = []

  let inMounts = false
  for (const line of lines) {
    if (line === MOUNTS_BEGIN) {
      inMounts = true
      continue
    }
    if (line === MOUNTS_END) {
      inMounts = false
      continue
    }
    if (inMounts) {
      mountLines.push(line)
      continue
    }
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    values.set(line.slice(0, separator), line.slice(separator + 1))
  }

  if (values.get(DONE_KEY) !== '1') return { ok: false, reason: 'incomplete' }
  if (inMounts) return { ok: false, reason: 'incomplete' }
  for (const key of REQUIRED_KEYS) {
    if (!values.has(key)) return { ok: false, reason: 'missing-keys' }
  }

  return { ok: true, output: { values, mountLines } }
}

/* ── マウント情報 ────────────────────────────────────────────────────── */

/**
 * `/proc/mounts` の 8 進エスケープを復号する。
 * 空白 (`\040`) とバックスラッシュ (`\134`) が対象になる。
 */
function unescapeOctal(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_, digits: string) =>
    String.fromCharCode(Number.parseInt(digits, 8))
  )
}

/** ドライブレター形式か。`C:` / `C:\` を認める。 */
function isDrivePrefix(value: string): boolean {
  return /^[A-Za-z]:\\?$/.test(value)
}

export interface MountEntry {
  /** ホスト側の接頭辞。`C:\` の形。 */
  readonly hostPrefix: string
  /** ランタイム側のマウント位置。`/mnt/c` の形。 */
  readonly mountPoint: string
}

/**
 * マウント情報からドライブ対応を抜き出す (AD-015 §6)。
 *
 * **ファイルシステム種別で絞らない** (FR-024)。WSL の実装は変遷しており、
 * 種別で絞ると未知の種別の環境でマッピングが空になり、
 * Windows 側フォルダがすべて変換不能になる。正本は**マウントオプションの `path=`** である。
 *
 * `path=` を持たない行 (tmpfs 等) は**ドライブ対応ではない**ので無視する。
 * `path=` の値がドライブレター形式でない行 (ネットワーク共有の drvfs 等) も無視する —
 * `PathMapping` はドライブ接頭辞の対応を表す型であり、表現できない対応を
 * 「壊れた要素」として全体を失敗させるのは過剰である。
 */
export function parseMountEntries(mountLines: readonly string[]): readonly MountEntry[] {
  const entries: MountEntry[] = []
  for (const line of mountLines) {
    const fields = line.split(' ')
    if (fields.length < 4) continue

    const mountPoint = unescapeOctal(fields[1])
    const options = fields[3]

    // `path=` はコンマ区切りの 1 要素の内側で `;` 区切りに置かれる場合がある。
    const match = /(?:^|[,;])path=([^,;]*)/.exec(options)
    if (match === null) continue

    const hostPrefix = unescapeOctal(match[1])
    if (!isDrivePrefix(hostPrefix)) continue
    if (!mountPoint.startsWith('/')) continue

    entries.push({
      // ドライブレターは大文字へ正規化する (`makeHostPath` と同じ規則)。
      hostPrefix: `${hostPrefix[0].toUpperCase()}:\\`,
      mountPoint: mountPoint.length > 1 ? mountPoint.replace(/\/+$/, '') : mountPoint
    })
  }
  return entries
}
