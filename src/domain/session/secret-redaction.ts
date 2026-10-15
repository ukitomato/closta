/**
 * 会話由来の本文 (`informational`・拒否の説明・過去ログの `system` の本文) の**伏せ字** (O-6 / 016 data-model §1「伏せ字」)。
 *
 * **秘密の綴りの正本** (本表)。当たった部分だけを `•••` に置き換える (行全体は消さない)。純関数で import を持たない。
 * 境界 `B` は `(^|[^A-Za-z0-9])` (`system-event.ts` の `mayCarrySecret` と同じ)。名前は大文字小文字を区別しない
 * (`Basic` を除く)。入れ子の量指定子と重なる選択を使わない (4 KB の敵対的な入力でも線形に近い)。
 *
 * best-effort で、網羅は保証しない。伏せすぎ (`password: is required` の「is」・`PWD=/home/u`) は受け入れる (U-3)。
 */

const MASK = '•••'

/** 境界 (`mayCarrySecret` と同じ)。 */
const B = '(^|[^A-Za-z0-9])'

const KNOWN_TOKEN = new RegExp(
  `${B}(?:${[
    'sk-[A-Za-z0-9_-]{16,}',
    '(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}',
    'gh[pousr]_[A-Za-z0-9]{16,}',
    'github_pat_[A-Za-z0-9_]{20,}',
    'glpat-[A-Za-z0-9_-]{16,}',
    'xox[abeprs]-[A-Za-z0-9-]{10,}',
    'xapp-[A-Za-z0-9-]{10,}',
    'AIza[A-Za-z0-9_-]{16,}',
    'ya29\\.[A-Za-z0-9_-]{16,}',
    'npm_[A-Za-z0-9]{16,}',
    'hf_[A-Za-z0-9]{16,}',
    '(?:AKIA|ASIA)[0-9A-Z]{16}'
  ].join('|')})`,
  'g'
)

function isB64Url(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 45 ||
    code === 95
  )
}

function isAlnum(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function runEnd(s: string, from: number): number {
  let i = from
  while (i < s.length && isB64Url(s.charCodeAt(i))) i++
  return i
}

/**
 * JWT (`eyJ` + 8 文字以上 `.` 8 文字以上 [`.` 1 文字以上]) を前から 1 回だけ走査して伏せる。境界は `B` と同じ
 * (直前が英数字でない。`foo-eyJ…` `x_eyJ…` も対象)。正規表現だと区間の文字種に `-` があり、`-eyJaaaaaaaa` の繰り返しで
 * 各開始点が末尾まで走査して失敗する (二乗) ため関数にした。失敗したら同じ区間の中の開始点は同じ理由で失敗するので
 * 区間の終わりまで飛ばす (各文字の走査は高々数回で線形)。
 */
function redactJwt(s: string): string {
  let out = ''
  let copied = 0
  let pos = 0
  for (;;) {
    const i = s.indexOf('eyJ', pos)
    if (i < 0) break
    if (i > 0 && isAlnum(s.charCodeAt(i - 1))) {
      pos = i + 1
      continue
    }
    const e1 = runEnd(s, i + 3)
    if (e1 - (i + 3) < 8 || s.charCodeAt(e1) !== 46) {
      pos = Math.max(e1, i + 1)
      continue
    }
    const e2 = runEnd(s, e1 + 1)
    if (e2 - (e1 + 1) < 8) {
      pos = e1
      continue
    }
    let end = e2
    if (s.charCodeAt(end) === 46) {
      const e3 = runEnd(s, end + 1)
      if (e3 > end + 1) end = e3
    }
    out += s.slice(copied, i) + MASK
    copied = end
    pos = end
  }
  return copied === 0 ? s : out + s.slice(copied)
}

const SECRET_NAME =
  '(?:token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key)'

/** 名前の前の英数字は消費しない (値だけを置き換えるので不要。長い英数字の連続での二乗の走査を避ける)。 */
const ASSIGNMENT = new RegExp(`(${SECRET_NAME}["']?\\s*[:=]\\s*["']?)[^\\s"',;}]+`, 'gi')

/**
 * 本文の秘密らしい部分を `•••` にする。伏せる対象が無ければ同じ文字列を返す。
 */
export function redactSecrets(text: string): string {
  if (text === '') return text
  let s = text
  // PEM (BEGIN から END か本文の終わりまで)
  s = s.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    MASK
  )
  // URL の userinfo (scheme の途中から始めない)
  s = s.replace(/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, `$1${MASK}@`)
  // URL のクエリの秘密
  s = s.replace(
    /([?&](?:access_token|token|key|sig|signature|password|secret)=)[^&\s#]+/gi,
    `$1${MASK}`
  )
  // webhook のパスの秘密
  s = s.replace(/(hooks\.slack\.com\/services\/)[^\s?#]+/gi, `$1${MASK}`)
  s = s.replace(/(\/api\/webhooks\/)[^/\s]+\/[^/\s?#]+/gi, `$1${MASK}`)
  s = s.replace(/(\/bot)\d+:[A-Za-z0-9_-]+/gi, `$1${MASK}`)
  // 認証のヘッダ
  s = s.replace(/(Authorization\s*:)\s*\S+(?:\s+\S+)?/gi, `$1 ${MASK}`)
  s = s.replace(/((?:Set-)?Cookie\s*:)[^\n]+/gi, `$1 ${MASK}`)
  // Bearer / Basic (Basic は大文字小文字を区別し、数字か + / = を含むものだけ)
  s = s.replace(
    new RegExp(`${B}(Bearer\\s+)[A-Za-z0-9._~+/=-]{8,}`, 'gi'),
    (_m, pre: string, name: string) => `${pre}${name}${MASK}`
  )
  s = s.replace(
    new RegExp(`${B}(Basic\\s+)([A-Za-z0-9+/]{8,}={0,2})`, 'g'),
    (m, pre: string, name: string, token: string) =>
      /[0-9+/=]/.test(token) ? `${pre}${name}${MASK}` : m
  )
  // 秘密の名前への代入
  s = s.replace(ASSIGNMENT, `$1${MASK}`)
  // 空白で区切ったフラグ
  s = s.replace(/(--(?:password|token|api-key|secret)[ =])\S+/gi, `$1${MASK}`)
  s = s.replace(/((?:mysql|mysqldump|mysqladmin|mariadb)\b[^\n]{0,256}?\s-p)\S+/gi, `$1${MASK}`)
  // 既知のトークン
  s = s.replace(KNOWN_TOKEN, `$1${MASK}`)
  s = redactJwt(s)
  return s
}
