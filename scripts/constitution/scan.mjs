/**
 * 走査の下請け — ファイル収集と、コード / 文字列 / コメントの切り分け。
 *
 * **コメントを剥がしてから文字列リテラルを探す。** 剥がさないと、
 * 日本語の解説文に出てくる `sudo` や `docker` が違反として報告され、
 * そのうち誰も出力を読まなくなる。
 *
 * 逆に**行番号は保ったまま**にする必要がある。報告が `file:line` でなければ
 * 直せないからである。そのためコメントは削除せず空白へ置き換える。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'

import {
  EXCLUDED_FILES,
  RULE_FIXTURES_DIR,
  SCAN_EXTENSIONS,
  SCAN_FILES,
  SCAN_ROOTS
} from './allowlists.mjs'

/**
 * パスの区切りは `/` に正規化する。
 * 許可リストは `/` で書いてあり、Windows の `\` と照合すると必ず外れる。
 */
function toPosix(value) {
  return value.split('\\').join('/')
}

function walk(dir, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist') continue
      walk(full, out)
      continue
    }
    if (SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) out.push(full)
  }
  return out
}

/** 検証対象ファイルの一覧 (FR-037 のスコープ)。 */
export function collectFiles() {
  const found = []
  for (const root of SCAN_ROOTS) walk(root, found)
  for (const file of SCAN_FILES) {
    try {
      if (statSync(file).isFile()) found.push(file)
    } catch {
      // 未作成のビルド構成は「対象なし」として扱う。存在確認は各項目が行う。
    }
  }
  return found
    .map(toPosix)
    .filter((file) => !file.startsWith(`${RULE_FIXTURES_DIR}/`))
    .filter((file) => !EXCLUDED_FILES.includes(file))
    .sort()
}

/**
 * コメントを同じ長さの空白に置き換えた本体と、行ごとのコメント文字列を返す。
 *
 * 正規表現でのコメント除去はしない — 文字列の中の `//` を消してしまい、
 * URL リテラルが壊れる。1 文字ずつ状態機械で読む。
 */
export function splitCode(source) {
  const chars = source.split('')
  const code = chars.slice()
  const commentChars = chars.map(() => ' ')
  let i = 0
  const n = chars.length
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) {
      if (chars[k] !== '\n') {
        commentChars[k] = chars[k]
        code[k] = ' '
      }
    }
  }
  while (i < n) {
    const c = chars[i]
    const next = chars[i + 1]
    if (c === '/' && next === '/') {
      let j = i
      while (j < n && chars[j] !== '\n') j += 1
      blank(i, j)
      i = j
      continue
    }
    if (c === '/' && next === '*') {
      let j = i + 2
      while (j < n && !(chars[j] === '*' && chars[j + 1] === '/')) j += 1
      blank(i, Math.min(j + 2, n))
      i = j + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      let j = i + 1
      while (j < n) {
        if (chars[j] === '\\') {
          j += 2
          continue
        }
        if (chars[j] === quote) break
        j += 1
      }
      i = j + 1
      continue
    }
    i += 1
  }
  return { code: code.join(''), comments: commentChars.join('') }
}

/** ファイルを読み、コメントを除いた本体と行配列を返す。 */
export function readSource(file) {
  const raw = readFileSync(file, 'utf8')
  const { code } = splitCode(raw)
  return { file, raw, code, rawLines: raw.split('\n'), codeLines: code.split('\n') }
}

/**
 * コメントを除いた本体に現れる文字列リテラルを `{ value, line }` で返す。
 * テンプレートリテラルは補間部分を `${}` のまま含む生の中身を返す。
 */
export function stringLiterals(code) {
  const out = []
  let line = 1
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    if (c === '\n') {
      line += 1
      i += 1
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      const startLine = line
      let j = i + 1
      let value = ''
      while (j < n) {
        if (code[j] === '\\') {
          value += code[j + 1] ?? ''
          j += 2
          continue
        }
        if (code[j] === quote) break
        if (code[j] === '\n') line += 1
        value += code[j]
        j += 1
      }
      out.push({ value, line: startLine })
      i = j + 1
      continue
    }
    i += 1
  }
  return out
}
