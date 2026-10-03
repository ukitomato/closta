/**
 * ui-coverage 対応表の検査 (O-2 / FR-001〜FR-003 / Constitution Principle XII)。
 *
 * **依存なしの純関数だけを置く。** ファイルを読むのは呼び出し側 (`scripts/constitution/check.mjs` の項目 21) で、
 * ここは文字列を受けて集合・行・失敗の一覧を返す。テストは文字列の fixture で全条件を叩ける
 * (`tests/ui-coverage/coverage.test.ts`)。
 *
 * **書式の正本は `docs/ui-coverage.md` の凡例、決定の正本は AD-044。** 本ファイルは凡例の機械可読な部分
 * (見出し・列・値の綴り) を実装する。凡例を変えるときはここも同じ PR で直す。食い違ったら AD-044 を正とする。
 *
 * ## 対応表の書式 (本ファイルが読む形)
 *
 * - 版の行: `SDK: @anthropic-ai/claude-agent-sdk <version>` (行頭。パッケージ名と版はバッククォートで囲んでもよい)
 * - 節の見出し: **`## ` + 節の文字 (A〜F) + 空白か行末**。例 `## A メッセージ型`。
 *   `## 凡例` など A〜F 以外の `## ` 見出しは節を閉じる (そこの表は読まない)
 * - A' 小節: **`### A'` + 空白か行末** (例 `### A' union の外`)。A' の行は割当の書式だけを検査し、A の集合照合から外す。
 *   A' 以外の `### ` 見出しは、直前の `## ` の節に戻る (節の中の小見出しとして扱う)
 * - 表: 見出し行 + 区切り行 (`|---|`) + データ行。空行か `|` で始まらない行で表が終わる。1 つの節に表が複数あってよい
 * - 列 (A〜E と A'): `識別子 | 判別子 | Tier | 割当 | 経路 | 備考` (この順・この綴り)
 * - 列 (F): `element | Tier | 使い道 | 備考`
 * - セルの中の `|` は `\|` と書く (GFM の表と同じ)。識別子・Tier のバッククォートと `**` は外して読む
 * - 割当: `実装済み: <element> (<経路>)` / `後続: <feature ID>` / `表示不要: <理由>` (コロンは半角)。
 *   Tier C の行は `表示不要: Tier C (<理由>)`
 * - 経路: `実行中` / `過去ログ` / `両方` / `なし`
 *
 * ## SDK の集合 (機械照合する節)
 *
 * - A: `sdk.d.ts` の `SDKMessage` の union のメンバーの型名
 * - C: `sdk-tools.d.ts` の `ToolInputSchemas` の union のメンバーの型名。**`ToolOutputSchemas` は除く** —
 *   SDK 0.3.270 は入力の union の末尾に出力の union を混ぜている (入力型ではない)
 * - E: `sdk.d.ts` の `SDKControlRequest` の `request` フィールドの型 (union) の各メンバーの `subtype` の文字列リテラル。
 *   `SDKControl*Request` の名前で拾わないのは、`SDKHookCallbackRequest` のように名前の形が違うメンバーと、
 *   `SDKControlCancelRequest` (subtype を持たない別の封筒) を正しく扱うため
 */

/** 節ごとの下限 (data-model §1「照合の歯止め」)。下回れば parse の取りこぼしとみなす。 */
export const LOWER_BOUNDS = Object.freeze({ A: 39, C: 45, E: 38 })

/** A〜E (と A') の列。 */
export const ROW_COLUMNS = Object.freeze(['識別子', '判別子', 'Tier', '割当', '経路', '備考'])

/** F の列。 */
export const ELEMENT_COLUMNS = Object.freeze(['element', 'Tier', '使い道', '備考'])

/** 対応表に必ずある節。 */
export const SECTIONS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F'])

/** 割当の書式を検査する節 (F は element の分類で、表示の割当の対象ではない)。 */
export const ASSIGNMENT_SECTIONS = Object.freeze(['A', "A'", 'B', 'C', 'D', 'E'])

export const TIERS = Object.freeze(['A', 'B', 'C'])

export const PATHS = Object.freeze(['実行中', '過去ログ', '両方', 'なし'])

/** 割当の種類 (件数の集計の鍵)。 */
export const ASSIGNMENT_KINDS = Object.freeze(['実装済み', '後続', '表示不要'])

/** 汎用の表示。これだけで `実装済み` にできるのは Tier B / C の行に限る (FR-002)。 */
export const GENERIC_ELEMENT = 'ToolFallback'

/* ── .d.ts の読み取り ─────────────────────────────────────────────── */

/**
 * コメントを空白に置き換える (文字列リテラルの中の `//` は残す)。
 * JSDoc に `subtype: 'x'` のような例が書かれても拾わないため。
 */
export function stripComments(source) {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end < 0 ? n : end + 2
      out += source.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < n && source[j] !== c) j += source[j] === '\\' ? 2 : 1
      out += source.slice(i, j + 1)
      i = j + 1
      continue
    }
    out += c
    i += 1
  }
  return out
}

/** `text[from]` 以降で、括弧の深さ 0 の `stop` の位置。見つからなければ -1。 */
function topLevelIndexOf(text, from, stop) {
  let depth = 0
  for (let i = from; i < text.length; i += 1) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1
      i = j
      continue
    }
    // `=>` (関数型) の `>` は閉じ括弧ではない。
    if (c === '>' && text[i - 1] === '=') continue
    if (c === '{' || c === '(' || c === '[' || c === '<') depth += 1
    else if (c === '}' || c === ')' || c === ']' || c === '>') depth -= 1
    else if (c === stop && depth === 0) return i
  }
  return -1
}

/** 括弧の深さ 0 の `sep` で分ける。 */
function splitTopLevel(text, sep) {
  const parts = []
  let start = 0
  for (;;) {
    const index = topLevelIndexOf(text, start, sep)
    if (index < 0) break
    parts.push(text.slice(start, index))
    start = index + 1
  }
  parts.push(text.slice(start))
  return parts
}

/** 直前に剥がした入力の結果を使い回す (制御要求のメンバーごとに同じ sdk.d.ts を剥がし直さない)。 */
let lastStripped = { source: null, code: '' }
function strippedOf(source) {
  if (lastStripped.source !== source) lastStripped = { source, code: stripComments(source) }
  return lastStripped.code
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 型エイリアス `name` の右辺 (`=` の後ろから深さ 0 の `;` の前まで)。無ければ null。
 * `export declare type` (sdk.d.ts) と `export type` (sdk-tools.d.ts) の両方を読む。
 */
export function typeAliasBody(dts, name) {
  const code = strippedOf(dts)
  const head = new RegExp(
    String.raw`(?:^|[\s;])(?:export\s+)?(?:declare\s+)?type\s+${escapeRegExp(name)}\s*=`,
    'm'
  ).exec(code)
  if (head === null) return null
  const start = head.index + head[0].length
  const end = topLevelIndexOf(code, start, ';')
  return (end < 0 ? code.slice(start) : code.slice(start, end)).trim()
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** union の右辺をメンバーの型名に分ける。型名でないメンバーがあれば例外 (取りこぼしを黙って通さない)。 */
function unionMemberNames(body, label) {
  const members = splitTopLevel(body, '|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  for (const member of members) {
    if (!IDENTIFIER.test(member)) {
      throw new Error(`${label} の union に型名でないメンバーがある: ${member.slice(0, 80)}`)
    }
  }
  return members
}

/** A 節の集合: `SDKMessage` の union のメンバー。 */
export function parseSdkMessageUnion(dts) {
  const body = typeAliasBody(dts, 'SDKMessage')
  if (body === null) throw new Error('sdk.d.ts に SDKMessage の型定義が無い')
  return unionMemberNames(body, 'SDKMessage')
}

/** C 節の集合から外すメンバー (入力型ではない)。 */
export const TOOL_INPUT_EXCLUDED = Object.freeze(['ToolOutputSchemas'])

/** C 節の集合: `ToolInputSchemas` の union のメンバー (`ToolOutputSchemas` を除く)。 */
export function parseToolInputs(toolsDts) {
  const body = typeAliasBody(toolsDts, 'ToolInputSchemas')
  if (body === null) throw new Error('sdk-tools.d.ts に ToolInputSchemas の型定義が無い')
  return unionMemberNames(body, 'ToolInputSchemas').filter(
    (name) => !TOOL_INPUT_EXCLUDED.includes(name)
  )
}

/** オブジェクト型 `{ ... }` の深さ 0 の中身 (入れ子の `{...}` は `{}` に潰す)。 */
function objectTopLevelText(body) {
  if (!body.startsWith('{')) return null
  let out = ''
  let depth = 0
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i]
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < body.length && body[j] !== c) j += body[j] === '\\' ? 2 : 1
      if (depth === 1) out += body.slice(i, j + 1)
      i = j
      continue
    }
    if (c === '{') {
      depth += 1
      if (depth === 2) out += '{}'
      continue
    }
    if (c === '}') {
      depth -= 1
      if (depth === 0) return out
      continue
    }
    if (depth === 1) out += c
  }
  return null
}

/** E 節の集合: `SDKControlRequest` の `request` の union の各メンバーの `subtype`。 */
export function parseControlRequestSubtypes(dts) {
  const envelope = typeAliasBody(dts, 'SDKControlRequest')
  if (envelope === null) throw new Error('sdk.d.ts に SDKControlRequest の型定義が無い')
  const envelopeTop = objectTopLevelText(envelope)
  const requestField =
    envelopeTop === null ? null : /(?:^|[;\s])request\s*:\s*([^;]+);/.exec(envelopeTop)
  if (requestField === null) throw new Error('SDKControlRequest に request フィールドが無い')

  const requestType = requestField[1].trim()
  const members = IDENTIFIER.test(requestType)
    ? unionMemberNames(typeAliasBody(dts, requestType) ?? '', requestType)
    : unionMemberNames(requestType, 'SDKControlRequest.request')
  if (members.length === 0) throw new Error(`${requestType} の union にメンバーが無い`)

  const subtypes = []
  for (const member of members) {
    const body = typeAliasBody(dts, member)
    const top = body === null ? null : objectTopLevelText(body)
    if (top === null) throw new Error(`制御要求 ${member} がオブジェクト型として読めない`)
    const field = /(?:^|[;\s{])subtype\s*:\s*([^;]+);/.exec(top)
    if (field === null) throw new Error(`制御要求 ${member} に subtype が無い`)
    const literals = splitTopLevel(field[1], '|').map((part) => part.trim())
    for (const literal of literals) {
      const match = /^(['"])(.*)\1$/.exec(literal)
      if (match === null) {
        throw new Error(`制御要求 ${member} の subtype が文字列リテラルでない: ${literal}`)
      }
      subtypes.push(match[2])
    }
  }
  return subtypes
}

/** SDK の `package.json` の版。 */
export function parsePackageVersion(packageJson) {
  const version = JSON.parse(packageJson).version
  if (typeof version !== 'string' || version === '')
    throw new Error('package.json に version が無い')
  return version
}

/* ── markdown の表 ────────────────────────────────────────────────── */

/** 行を `\|` 以外の `|` で分け、両端の空セルを落とす。 */
export function splitRow(line) {
  const cells = []
  let current = ''
  const body = line.trim()
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i]
    if (c === '\\' && body[i + 1] === '|') {
      current += '|'
      i += 1
      continue
    }
    if (c === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += c
  }
  cells.push(current)
  if (body.startsWith('|')) cells.shift()
  if (body.endsWith('|') && !body.endsWith('\\|')) cells.pop()
  return cells.map((cell) => cell.trim())
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

/** 識別子・Tier のバッククォートと強調を外す。 */
function plain(value) {
  return value.replace(/\*\*/g, '').replace(/`/g, '').trim()
}

/**
 * markdown の表を見出しごとに集める。
 * `sectionOf(line, current)` が見出しの行で新しい節 (null は節の外) を返し、見出しでなければ undefined を返す。
 */
function collectTables(markdown, sectionOf) {
  const lines = markdown.split(/\r?\n/)
  const tables = []
  let section = null
  let table = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const next = sectionOf(line, section)
    if (next !== undefined) {
      section = next
      table = null
      continue
    }
    if (!line.trim().startsWith('|')) {
      table = null
      continue
    }
    const cells = splitRow(line)
    if (table === null) {
      const separator = lines[index + 1]
      if (separator === undefined || !isSeparatorRow(splitRow(separator))) continue
      table = { section, header: cells, line: index + 1, rows: [] }
      tables.push(table)
      index += 1
      continue
    }
    table.rows.push({ cells, line: index + 1 })
  }
  return tables
}

/** 対応表の見出しを節に写す (冒頭の注記の「節の見出し」)。 */
function coverageSectionOf(line, current) {
  const level2 = /^##\s+(.*)$/.exec(line)
  if (level2 !== null) {
    const letter = /^([A-F])(?:\s|$)/.exec(level2[1])
    return letter === null ? null : letter[1]
  }
  const level3 = /^###\s+(.*)$/.exec(line)
  if (level3 !== null) {
    if (/^A'(?:\s|$)/.test(level3[1])) return "A'"
    // A' 以外の小見出しは親の節に戻る。
    return current === "A'" ? 'A' : current
  }
  if (/^#\s/.test(line)) return null
  return undefined
}

/**
 * 割当のセルを読む。
 * 戻り値: `{ kind: '実装済み', elements, fallbackOnly }` / `{ kind: '後続', id }` / `{ kind: '表示不要', reason }` / null (割当でない)。
 */
export function parseAssignment(cell) {
  const value = cell.trim()
  const implemented = /^実装済み:\s*(\S.*)$/.exec(value)
  if (implemented !== null) {
    const elements = implemented[1]
      .replace(/\([^)]*\)|（[^）]*）/g, ' ')
      .split(/[/,、+]/)
      .map(plain)
      .filter((element) => element.length > 0)
    if (elements.length === 0) return null
    return {
      kind: '実装済み',
      elements,
      fallbackOnly: elements.every((element) => element === GENERIC_ELEMENT)
    }
  }
  const followUp = /^後続:\s*`?([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+)`?$/.exec(value)
  if (followUp !== null) return { kind: '後続', id: followUp[1] }
  const notNeeded = /^表示不要:\s*(\S.*)$/.exec(value)
  if (notNeeded !== null) return { kind: '表示不要', reason: notNeeded[1].trim() }
  return null
}

/**
 * 対応表を読む。
 * 戻り値: `{ sdkVersion, sections: { A, "A'", B, C, D, E, F }, present: [...], errors }`。
 * 行は `{ id, discriminator, tier, assignment, path, note, line }` (F は `{ id, tier, use, note, line }`)。
 * `errors` は書式の崩れ (列が違う・セルの数が違う) で、`checkCoverage` が失敗に流す。
 */
export function parseCoverage(markdown) {
  const version = /^SDK:\s*`?@anthropic-ai\/claude-agent-sdk`?\s+`?v?([0-9][^\s`]*)`?\s*$/m.exec(
    markdown
  )
  const sections = { A: [], "A'": [], B: [], C: [], D: [], E: [], F: [] }
  const present = new Set()
  const errors = []

  for (const line of markdown.split(/\r?\n/)) {
    const section = coverageSectionOf(line, null)
    if (section !== undefined && section !== null && section !== "A'") present.add(section)
  }

  for (const table of collectTables(markdown, coverageSectionOf)) {
    if (table.section === null) continue
    const expected = table.section === 'F' ? ELEMENT_COLUMNS : ROW_COLUMNS
    const header = table.header.map(plain)
    if (header.length !== expected.length || header.some((cell, i) => cell !== expected[i])) {
      errors.push({
        section: table.section,
        id: `(表 ${table.line} 行目)`,
        reason: `列が凡例と違う (期待: ${expected.join(' | ')} / 実際: ${header.join(' | ')})`
      })
      continue
    }
    for (const row of table.rows) {
      if (row.cells.length !== expected.length) {
        errors.push({
          section: table.section,
          id: plain(row.cells[0] ?? '') || `(${row.line} 行目)`,
          reason: `セルの数が ${row.cells.length} (期待 ${expected.length})`
        })
        continue
      }
      if (table.section === 'F') {
        const [id, tier, use, note] = row.cells
        sections.F.push({ id: plain(id), tier: plain(tier), use, note, line: row.line })
      } else {
        const [id, discriminator, tier, assignment, path, note] = row.cells
        sections[table.section].push({
          id: plain(id),
          discriminator,
          tier: plain(tier),
          assignment,
          path: plain(path),
          note,
          line: row.line
        })
      }
    }
  }

  return {
    sdkVersion: version === null ? null : version[1],
    sections,
    present: [...present],
    errors
  }
}

/* ── roadmap ──────────────────────────────────────────────────────── */

/** roadmap の見出しを milestone に写す (`## M3: ...` → `M3`、`## Optional scope` → `OPT`、他の `## ` → null)。 */
function roadmapSectionOf(line) {
  const level2 = /^##\s+(.*)$/.exec(line)
  if (level2 === null) return undefined
  const milestone = /^(M\d+)\b/.exec(level2[1])
  if (milestone !== null) return milestone[1]
  if (/^Optional scope\b/.test(level2[1])) return 'OPT'
  return null
}

/**
 * feature の表の見出しか。`| 順 | ID | feature |` で始まる表 (milestone ごとの表) と
 * `| ID | feature |` で始まる表 (Optional scope と、M2 の後続のような critical path 外の feature の表)。
 * Pre-flight (`| # | 作業 |`) と SPIKE (`| ID | 内容 |`) の表は含めない — `P-4` / `SPIKE-12` は feature ではない。
 * 戻り値は ID 列の位置。feature の表でなければ -1。
 */
function featureIdColumn(header) {
  const cells = header.map(plain)
  if (cells[0] === '順' && cells[1] === 'ID' && cells[2] === 'feature') return 1
  if (cells[0] === 'ID' && cells[1] === 'feature') return 0
  return -1
}

/**
 * 完了済みの行か。**最後の列を ` / ` で区切った断片のどれかが `**完了**` で始まる**ときに完了とみなす。
 * 最後の列は「前提 SPIKE」でもあり、`SPIKE-8 / SPIKE-9 **完了**` のように SPIKE の完了も同じ綴りで書かれる。
 * 「最後の列に `**完了**` を含む」で判定すると、SPIKE が済んだだけの feature (R-1・I-1 など) が完了扱いになる。
 */
function isCompletedRow(cells) {
  const last = cells[cells.length - 1] ?? ''
  return last.split(/\s+\/\s+/).some((fragment) => fragment.trim().startsWith('**完了**'))
}

const FEATURE_ID = /^[A-Z][A-Za-z]*-[A-Za-z0-9]+$/

/**
 * roadmap の feature ID。戻り値: `Map<id, { milestone, completed }>`。
 */
export function parseRoadmapFeatures(markdown) {
  const features = new Map()
  for (const table of collectTables(markdown, roadmapSectionOf)) {
    const column = featureIdColumn(table.header)
    if (column < 0) continue
    for (const row of table.rows) {
      const id = plain(row.cells[column] ?? '')
      if (!FEATURE_ID.test(id)) continue
      features.set(id, { milestone: table.section, completed: isCompletedRow(row.cells) })
    }
  }
  return features
}

/* ── 照合 ─────────────────────────────────────────────────────────── */

function emptyKindTier() {
  const out = {}
  for (const kind of ASSIGNMENT_KINDS) out[kind] = { A: 0, B: 0, C: 0 }
  return out
}

/**
 * 対応表を SDK と roadmap に照らす (FR-003)。
 *
 * 入力: `{ sdkVersion, tableSdkVersion, messageTypes, toolInputs, controlSubtypes, table, roadmap }`。
 * `table` は `parseCoverage` の、`roadmap` は `parseRoadmapFeatures` の戻り値。
 * `tableSdkVersion` を省くと `table.sdkVersion` を使う。
 *
 * 戻り値: `{ failures: [{ section, id, reason }], counts }`。
 * counts: `rows` (節ごとの行の数) / `byKindTier` (割当の種類 × Tier) /
 * `followUps` (後続 ID ごとの `{ id, milestone, count, tierA }`) / `m3Remaining` (Tier A の後続のうち割当先が M3 の行の数)。
 */
export function checkCoverage(input) {
  const failures = []
  const fail = (section, id, reason) => failures.push({ section, id, reason })

  const required = [
    'sdkVersion',
    'messageTypes',
    'toolInputs',
    'controlSubtypes',
    'table',
    'roadmap'
  ]
  const missing = required.filter((key) => input?.[key] === undefined || input?.[key] === null)
  if (missing.length > 0) {
    for (const key of missing) fail('入力', key, '検査の入力が無い')
    return { failures, counts: null }
  }

  const { sdkVersion, messageTypes, toolInputs, controlSubtypes, table, roadmap } = input
  const tableSdkVersion = input.tableSdkVersion ?? table.sdkVersion

  // 版
  if (tableSdkVersion === null || tableSdkVersion === undefined) {
    fail(
      '冒頭',
      'SDK',
      '対応表に SDK の版の行が無い (`SDK: @anthropic-ai/claude-agent-sdk <version>`)'
    )
  } else if (tableSdkVersion !== sdkVersion) {
    fail('冒頭', 'SDK', `対応表の SDK の版 ${tableSdkVersion} が入っている版 ${sdkVersion} と違う`)
  }

  // 下限 (parse の取りこぼし)
  const sdkSets = { A: messageTypes, C: toolInputs, E: controlSubtypes }
  for (const [section, names] of Object.entries(sdkSets)) {
    if (names.length < LOWER_BOUNDS[section]) {
      fail(
        section,
        '(SDK)',
        `SDK から読めた名前が極端に少ない (${names.length} 件 / 下限 ${LOWER_BOUNDS[section]})`
      )
    }
  }

  // 書式の崩れ・節の欠け
  for (const error of table.errors ?? []) fail(error.section, error.id, error.reason)
  for (const section of SECTIONS) {
    if (!table.present.includes(section)) fail(section, '(節)', `節 "## ${section}" が無い`)
  }

  // 集合の照合 (A / C / E)
  for (const [section, names] of Object.entries(sdkSets)) {
    const rows = table.sections[section]
    const rowIds = rows.map((row) => row.id)
    const sdk = new Set(names)
    const seen = new Set()
    for (const id of rowIds) {
      if (seen.has(id)) fail(section, id, '同じ識別子の行が 2 つ以上ある')
      seen.add(id)
      if (!sdk.has(id))
        fail(section, id, '対応表にあって SDK の型定義に無い (型が減った・綴りが違う)')
    }
    for (const name of names) {
      if (!seen.has(name)) fail(section, name, 'SDK の型定義にあって対応表に行が無い (型が増えた)')
    }
  }

  // 行ごとの書式と割当
  const byKindTier = emptyKindTier()
  const followUpCounts = new Map()
  let m3Remaining = 0
  for (const section of ASSIGNMENT_SECTIONS) {
    for (const row of table.sections[section]) {
      const id = row.id || `(${row.line} 行目)`
      const tierOk = TIERS.includes(row.tier)
      if (!tierOk) fail(section, id, `Tier が A / B / C のどれでもない ("${row.tier}")`)
      if (!PATHS.includes(row.path)) {
        fail(section, id, `経路が ${PATHS.join(' / ')} のどれでもない ("${row.path}")`)
      }

      const assignment = parseAssignment(row.assignment)
      if (assignment === null) {
        fail(
          section,
          id,
          `割当が 3 種類 (実装済み: … / 後続: <ID> / 表示不要: …) のどれでもない ("${row.assignment}")`
        )
        continue
      }
      if (tierOk) byKindTier[assignment.kind][row.tier] += 1

      if (assignment.kind === '実装済み' && assignment.fallbackOnly && row.tier === 'A') {
        fail(
          section,
          id,
          `Tier A の行を ${GENERIC_ELEMENT} だけで実装済みにしている (専用表示か後続の ID が要る)`
        )
      }
      if (row.tier === 'C' && !/^表示不要:\s*Tier C\b/.test(row.assignment.trim())) {
        fail(section, id, 'Tier C の行の割当が "表示不要: Tier C (<理由>)" でない')
      }
      if (assignment.kind === '後続') {
        const feature = roadmap.get(assignment.id)
        if (feature === undefined) {
          fail(section, id, `後続の ID ${assignment.id} が roadmap の feature の表に無い`)
        } else if (feature.completed) {
          fail(
            section,
            id,
            `後続の ID ${assignment.id} は roadmap で完了済み (表示が実装されたなら 実装済み に直す)`
          )
        } else {
          const entry = followUpCounts.get(assignment.id) ?? {
            id: assignment.id,
            milestone: feature.milestone,
            count: 0,
            tierA: 0
          }
          entry.count += 1
          if (row.tier === 'A') {
            entry.tierA += 1
            if (feature.milestone === 'M3') m3Remaining += 1
          }
          followUpCounts.set(assignment.id, entry)
        }
      }
    }
  }

  // F: Tier の値だけ
  for (const row of table.sections.F) {
    if (!TIERS.includes(row.tier)) {
      fail('F', row.id || `(${row.line} 行目)`, `Tier が A / B / C のどれでもない ("${row.tier}")`)
    }
  }

  const rows = {}
  for (const [section, list] of Object.entries(table.sections)) rows[section] = list.length

  return {
    failures,
    counts: {
      rows,
      byKindTier,
      followUps: [...followUpCounts.values()].sort((a, b) => a.id.localeCompare(b.id)),
      m3Remaining
    }
  }
}

/** 失敗 1 件を `<節> <識別子>: <理由>` の 1 行に (data-model §1)。 */
export function formatFailure(failure) {
  return `${failure.section} ${failure.id}: ${failure.reason}`
}

/** 通ったときの件数を 1 行に (項目 21 の note)。 */
export function formatCounts(counts) {
  const rows = Object.entries(counts.rows)
    .map(([section, n]) => `${section} ${n}`)
    .join(' / ')
  const kinds = ASSIGNMENT_KINDS.map(
    (kind) => `${kind} ${TIERS.map((tier) => `${tier}${counts.byKindTier[kind][tier]}`).join(' ')}`
  ).join(' / ')
  const followUps =
    counts.followUps
      .map(
        (f) =>
          `${f.id}(${f.milestone ?? '?'}) ${f.count}${f.tierA > 0 ? ` [Tier A ${f.tierA}]` : ''}`
      )
      .join(', ') || 'なし'
  return (
    `行: ${rows} | 割当 × Tier: ${kinds} | 後続: ${followUps} | ` +
    `M3 の完了の条件の残り (Tier A の後続で割当先が M3): ${counts.m3Remaining}`
  )
}
