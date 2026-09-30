#!/usr/bin/env node
/**
 * Constitution の検証 (SH-014 / FR-036 / FR-037 / FR-040 / FR-041 / SC-016)。
 *
 * research R-08 の**検証項目すべて**を実装する。項目は 11 個ある。
 * 許可リストの正本は `allowlists.mjs` で、**追加には ADR を要する**。
 *
 * **結果は 3 状態で報告する。**
 *   `ok`        — 検査して違反が無かった
 *   `violation` — 違反が見つかった (終了コード 1)
 *   `pending`   — **検査対象がまだ存在しない**
 *
 * `pending` を `ok` と混ぜてはならない。混ぜると「まだ書いていないから通った」が
 * 「検証したから通った」と見分けられなくなり、検証が意味を失う。
 */

import { existsSync } from 'node:fs'

import {
  ALLOWED_ORIGINS_FILE,
  ALLOWED_ORIGINS_FUNCTION,
  CSP_DEV_GATE_EXPRESSION,
  CSP_DECLARATION_MARKERS,
  CSP_DECLARATION_EXEMPT_SUFFIXES,
  CSP_FILES,
  CSP_FORBIDDEN_ALWAYS,
  CSP_REQUIRED_DIRECTIVES,
  CSP_UNSAFE_INLINE_ALLOWED_DIRECTIVES,
  DISTRO_SCRIPT_ALLOWED_FORMS,
  DISTRO_SCRIPT_CONSTANTS,
  DISTRO_SCRIPT_FORBIDDEN_FORMS,
  DOCKER_BUILD_SUBCOMMANDS,
  DOCKER_CALLER_MODULES,
  NAVIGATION_GUARD_EVENT,
  PLATFORM_BRANCH_DIRS,
  PLATFORM_BRANCH_PATTERNS,
  PLATFORM_OK_MARKER,
  PRIVILEGED_COMMANDS_ALWAYS,
  PRIVILEGED_COMMANDS_IN_SPAWN_CONTEXT,
  PROCESS_SPAWN_MODULES,
  PROTOCOL_ASSOCIATION_APIS,
  SELF_DEFINITION_FILES,
  AGENT_SDK_ALLOWED_CALLS,
  AGENT_SDK_IMPORT_DIRECTORIES,
  AGENT_SDK_PACKAGE,
  QUERY_ESCALATION_OPTION_KEYS,
  QUERY_MUTATION_METHODS,
  PERMISSION_MODE_ESCALATION_VALUES,
  SANCTIONED_SETTINGS_WRAPPER,
  QUERY_SETTINGS_ALLOWED_KEYS,
  SECRET_LITERAL_SCAN_DIRS,
  SECRET_LITERAL_PATTERN,
  WSL_FREE_DIRECTORIES,
  UNC_API_NAMES,
  UNC_FORBIDDEN_IN,
  UNC_LITERAL_EXEMPT_SUFFIXES,
  UNC_LITERAL_MODULES,
  UNC_LITERAL_PATTERNS,
  WINDOW_OPEN_HANDLER,
  WSL_ALLOWED_ARGS,
  WSL_CALLER_MODULES
} from './allowlists.mjs'
import { collectFiles, readSource, stringLiterals } from './scan.mjs'

const files = collectFiles()
const sources = files.map(readSource)

/** 報告の受け皿。1 項目 = 1 エントリ。 */
const results = []

function report(id, title, principle, state, findings = [], note = '') {
  results.push({ id, title, principle, state, findings, note })
}

function ok(id, title, principle, note = '') {
  report(id, title, principle, 'ok', [], note)
}

function pending(id, title, principle, note) {
  report(id, title, principle, 'pending', [], note)
}

function violations(id, title, principle, findings, note = '') {
  if (findings.length === 0) ok(id, title, principle, note)
  else report(id, title, principle, 'violation', findings, note)
}

/**
 * プロセス起動の**呼び出し形**。等価な経路を含める。
 *
 * **`exec` だけを別扱いにする。** `RegExp.prototype.exec` が同名であり、
 * `\bexec\s*\(` で拾うと `declRe.exec(src)` や `/re/.exec(raw)` が
 * すべてプロセス起動として報告される (実測で 3 件の誤検出が出た)。
 * 受け手のある `.exec(` は除き、裸の `exec(` と
 * child_process を明示した形だけを見る。
 *
 * import 経路 (`from 'node:child_process'`) は ESLint と dependency-cruiser が
 * 塞いでいる。ここが見るのは**import を経ない等価経路**である。
 */
const SPAWN_CALL_PATTERNS = [
  // 受け手があってもプロセス起動しかありえない名前
  /\b(?:spawn|spawnSync|execFile|execFileSync|execSync|fork)\s*\(/,
  // 裸の `exec(` — 受け手のある `.exec(` は正規表現なので除く
  /(?<![.\w$])exec\s*\(/,
  // child_process を明示した `exec`
  /\bchild_?[Pp]rocess\s*\.\s*exec\s*\(/,
  // Electron の utilityProcess
  /\butilityProcess\b/,
  // import を経ない標準モジュール取得
  /\bgetBuiltinModule\s*\(\s*['"](?:node:)?child_process['"]\s*\)/,
  /\brequire\s*\(\s*['"](?:node:)?child_process['"]\s*\)/
]

/**
 * プロセス起動の呼び出しが現れるファイルか。
 * 曖昧なコマンド名 (`net` / `sc` / ...) はここに現れたときだけ違反とする。
 */
function hasSpawnApi(src) {
  return SPAWN_CALL_PATTERNS.some((pattern) => pattern.test(src.code))
}

/** 検証の定義そのものを書いているファイルか (リテラル走査の対象外)。 */
function isSelfDefinition(src) {
  return SELF_DEFINITION_FILES.includes(src.file)
}

/** リテラル走査の対象ファイル。 */
const literalSources = sources.filter((src) => !isSelfDefinition(src))

/* ── 項目 1: 特権コマンド文字列の不在 (Principle VI) ─────────────── */
{
  const found = []
  const always = new Set(PRIVILEGED_COMMANDS_ALWAYS)
  const ambiguous = new Set(PRIVILEGED_COMMANDS_IN_SPAWN_CONTEXT)
  for (const src of literalSources) {
    // 曖昧な名前は、プロセスを起動できるファイルに現れたときだけ見る。
    const spawnable = hasSpawnApi(src)
    for (const literal of stringLiterals(src.code)) {
      const value = literal.value.trim()
      if (value === '') continue
      // 1 本の文字列でコマンド行を組む場合は先頭語を見る。
      const head = value.split(/[\s;&|]+/)[0]
      const hit =
        always.has(value) ||
        (head !== value && always.has(head)) ||
        (head !== value && ambiguous.has(head)) ||
        (spawnable && ambiguous.has(value))
      if (hit) {
        found.push(`${src.file}:${literal.line}  特権コマンド "${value}"`)
      }
    }
  }
  violations(1, '特権コマンド文字列の不在 (引数配列も捕捉)', 'VI', found)
}

/* ── 項目 2: `wsl.exe` に渡す引数が許可リスト内であること ────────── */
{
  const targets = WSL_CALLER_MODULES.filter((file) => existsSync(file))
  if (targets.length === 0) {
    pending(
      2,
      '`wsl.exe` に渡す引数が許可リスト内',
      'VI',
      `許可モジュール ${WSL_CALLER_MODULES.join(', ') || '(なし)'} が未実装 (BE-022 待ち)`
    )
  } else {
    const allowed = new Set(WSL_ALLOWED_ARGS)
    const found = []
    for (const src of sources.filter((s) => targets.includes(s.file))) {
      for (const literal of stringLiterals(src.code)) {
        const value = literal.value.trim()
        if (!value.startsWith('-')) continue
        if (!allowed.has(value)) {
          found.push(`${src.file}:${literal.line}  許可外の引数 "${value}"`)
        }
      }
    }
    violations(2, '`wsl.exe` に渡す引数が許可リスト内', 'VI', found)
  }
}

/* ── 項目 3: `wsl.exe` を名指せるモジュールの許可リスト ──────────── */
{
  const found = []
  for (const src of literalSources) {
    if (WSL_CALLER_MODULES.includes(src.file)) continue
    /*
     * `wsl` は本プロジェクトのユビキタス言語でもある (`kind: 'wsl'` / `wsl:<distro>`)。
     * **裸の `wsl` を無条件に違反にすると domain の型定義が全部引っかかる。**
     * `wsl.exe` は常に違反、裸の `wsl` はプロセスを起動できるファイルでのみ違反とする。
     */
    const spawnable = hasSpawnApi(src)
    for (const literal of stringLiterals(src.code)) {
      const value = literal.value.trim()
      const namesBinary = /(^|[\s/\\])wsl\.exe($|\s)/.test(value)
      if (namesBinary || (spawnable && value === 'wsl')) {
        found.push(`${src.file}:${literal.line}  許可外モジュールが wsl を名指している "${value}"`)
      }
    }
  }
  violations(
    3,
    '`wsl.exe` を名指せるモジュールの許可リスト',
    'VI',
    found,
    `許可: ${WSL_CALLER_MODULES.join(', ') || '(なし)'}`
  )
}

/* ── 項目 4: docker CLI を名指せるモジュールの許可リスト ─────────── */
{
  const found = []
  for (const src of literalSources) {
    if (DOCKER_CALLER_MODULES.includes(src.file)) continue
    // 項目 3 と同じ理由で、裸の `docker` は起動できるファイルでのみ違反とする。
    const spawnable = hasSpawnApi(src)
    for (const literal of stringLiterals(src.code)) {
      const value = literal.value.trim()
      const namesBinary = /(^|[\s/\\])docker\.exe($|\s)/.test(value)
      if (namesBinary || (spawnable && value === 'docker')) {
        found.push(
          `${src.file}:${literal.line}  許可外モジュールが docker を名指している "${value}"`
        )
      }
    }
  }
  violations(
    4,
    'docker CLI を名指せるモジュールの許可リスト',
    'VI',
    found,
    `許可: ${DOCKER_CALLER_MODULES.join(', ') || '(なし。R-1 では docker を使わない)'}`
  )
}

/* ── 項目 5: 許可モジュール内にイメージ構築サブコマンドが無いこと ── */
{
  const targets = DOCKER_CALLER_MODULES.filter((file) => existsSync(file))
  if (DOCKER_CALLER_MODULES.length === 0) {
    pending(
      5,
      '許可モジュール内にイメージ構築サブコマンドが無い',
      'VI',
      'docker を名指せるモジュールが 0 件なので検査対象が存在しない (R-1 の設計どおり)'
    )
  } else if (targets.length === 0) {
    pending(5, '許可モジュール内にイメージ構築サブコマンドが無い', 'VI', '許可モジュールが未実装')
  } else {
    const forbidden = new Set(DOCKER_BUILD_SUBCOMMANDS)
    const found = []
    for (const src of sources.filter((s) => targets.includes(s.file))) {
      for (const literal of stringLiterals(src.code)) {
        const value = literal.value.trim()
        if (forbidden.has(value) || forbidden.has(value.split(/\s+/)[0])) {
          found.push(`${src.file}:${literal.line}  イメージ構築サブコマンド "${value}"`)
        }
      }
    }
    violations(5, '許可モジュール内にイメージ構築サブコマンドが無い', 'VI', found)
  }
}

/* ── 項目 6: ディストロ内で実行するスクリプトの内容 ──────────────── */
{
  const targets = DISTRO_SCRIPT_CONSTANTS.filter((entry) => existsSync(entry.file))
  if (targets.length === 0) {
    pending(
      6,
      'ディストロ内スクリプトが定義済みの内容と一致 (3 点検査)',
      'VI',
      `定義ファイル ${DISTRO_SCRIPT_CONSTANTS.map((e) => e.file).join(', ')} が未実装 (BE-026 待ち)`
    )
  } else {
    const found = []
    for (const entry of targets) {
      const src = sources.find((s) => s.file === entry.file) ?? readSource(entry.file)

      /*
       * (i) 定数が**単一のリテラル**であること。
       * 連結して書き込めば「定数が存在する」検査は通ってしまう (R-08)。
       */
      const declRe = new RegExp(
        `const\\s+${entry.identifier}\\s*(?::[^=]+)?=\\s*([\`'"])([\\s\\S]*?)\\1\\s*(?:as\\s+const\\s*)?$`,
        'm'
      )
      const decl = declRe.exec(src.code)
      if (decl === null) {
        found.push(
          `${entry.file}  ${entry.identifier} が単一のリテラルとして定義されていない (連結・関数生成は禁止)`
        )
        continue
      }
      const script = decl[2]

      /*
       * (ii) 標準入力へ書く式が定数の**識別子そのもの**であること。
       * `PROBE_SCRIPT + extra` のような式は通さない。
       *
       * **走査は検証対象の全ファイルに対して行う。** 定数の定義ファイルだけを見ると、
       * 定数を別ファイルから import して加工した形が検査を抜ける。
       * 逆に、定数の定義と実行箇所を別ファイルに分ける構成 (ADR の判定対象を
       * 小さいファイルに固定する構成) を禁じる必要もない。
       */
      const writeRe = /\.stdin[\s\S]{0,40}?\.(?:write|end)\s*\(\s*([A-Za-z0-9_$]+)\s*[),]/g
      const writers = []
      for (const candidate of sources) {
        for (const match of candidate.code.matchAll(writeRe)) {
          writers.push({ file: candidate.file, identifier: match[1] })
        }
      }
      if (writers.length === 0) {
        found.push(`${entry.file}  標準入力へ書く箇所が見つからない (検査できない形になっている)`)
      }
      for (const writer of writers) {
        if (writer.identifier !== entry.identifier) {
          found.push(
            `${writer.file}  標準入力へ書く式が定数の識別子そのものではない ("${writer.identifier}")`
          )
        }
      }

      // (iii) 定数の内容が許可するコマンド形の allow-list に収まること。
      for (const forbiddenForm of DISTRO_SCRIPT_FORBIDDEN_FORMS) {
        if (script.includes(forbiddenForm)) {
          found.push(`${entry.file}  ${entry.identifier} に禁止形 "${forbiddenForm}" が現れている`)
        }
      }
      for (const line of script.split('\n')) {
        const body = line.trim()
        if (body === '' || body.startsWith('#')) continue
        if (!DISTRO_SCRIPT_ALLOWED_FORMS.some((form) => body.includes(form))) {
          found.push(`${entry.file}  ${entry.identifier} に許可形以外の行がある: "${body}"`)
        }
      }
    }
    violations(
      6,
      'ディストロ内スクリプトが定義済みの内容と一致 (3 点検査)',
      'VI',
      found,
      '内容が Principle VI に反するかは機械では判定できない。定数の変更には ADR を要する'
    )
  }
}

/* ── 項目 7: プロセス起動 API を使えるモジュールの許可リスト ─────── */
{
  const found = []
  for (const src of sources) {
    if (PROCESS_SPAWN_MODULES.includes(src.file)) continue
    src.codeLines.forEach((line, index) => {
      if (SPAWN_CALL_PATTERNS.some((pattern) => pattern.test(line))) {
        found.push(`${src.file}:${index + 1}  許可外モジュールでのプロセス起動: ${line.trim()}`)
      }
    })
  }
  violations(
    7,
    'プロセス起動 API を使えるモジュールの許可リスト',
    'VI',
    found,
    `許可: ${PROCESS_SPAWN_MODULES.join(', ') || '(なし)'}`
  )
}

/* ── 項目 8: 注記のないプラットフォーム分岐の不在 (Principle II) ── */
{
  const found = []
  for (const src of sources) {
    if (PLATFORM_BRANCH_DIRS.some((dir) => src.file.startsWith(dir))) continue
    src.codeLines.forEach((line, index) => {
      if (!PLATFORM_BRANCH_PATTERNS.some((pattern) => pattern.test(line))) return
      // 注記は**同じ行**に書く (Constitution v1.1.0)。前の行では例外にならない。
      if (src.rawLines[index].includes(PLATFORM_OK_MARKER)) return
      found.push(`${src.file}:${index + 1}  注記のないプラットフォーム分岐: ${line.trim()}`)
    })
  }
  violations(
    8,
    '注記のないプラットフォーム分岐の不在 (等価 API / 構文変形を含む)',
    'II',
    found,
    `許可ディレクトリ: ${PLATFORM_BRANCH_DIRS.join(', ')}`
  )
}

/* ── 項目 9: OS へのプロトコル関連付け API の不在 (SC-016 後段) ─── */
{
  const found = []
  /*
   * **名前の出現ではなく呼び出し形を見る。**
   * 名前だけで判定すると `allowlists.mjs` の定義そのものが違反になり、
   * 逃げ道として定義ファイルを検証対象から外す必要が出てしまう。
   * 呼び出し形で見れば**検証スクリプト自身も対象のまま**にできる (FR-037)。
   */
  const callPatterns = PROTOCOL_ASSOCIATION_APIS.map((api) => new RegExp(String.raw`\b${api}\s*\(`))
  for (const src of sources) {
    src.codeLines.forEach((line, index) => {
      callPatterns.forEach((pattern, apiIndex) => {
        if (pattern.test(line)) {
          found.push(
            `${src.file}:${index + 1}  OS への関連付け API: ${PROTOCOL_ASSOCIATION_APIS[apiIndex]}`
          )
        }
      })
    })
  }
  violations(9, 'OS へのプロトコル関連付け API の不在', 'VI', found)
}

/* ── 項目 10: CSP (directive 集合と禁止形の両方) ─────────────────── */
{
  const targets = CSP_FILES.filter((file) => existsSync(file))
  if (targets.length === 0) {
    pending(10, 'CSP が FR-040 の directive を満たし禁止形を含まない', 'FR-040', 'CSP 定義が未実装')
  } else {
    const found = []
    for (const file of targets) {
      const src = sources.find((s) => s.file === file) ?? readSource(file)
      const literals = stringLiterals(src.code)
      const joined = literals.map((l) => l.value).join('\n')

      // (a) 要求 directive がすべて現れること。
      for (const directive of CSP_REQUIRED_DIRECTIVES) {
        if (!joined.includes(directive)) {
          found.push(`${file}  必須 directive が無い: "${directive}"`)
        }
      }

      // (b) どちらの環境でも禁じる形。**開発用の定義も除外しない** (FR-040)。
      for (const forbidden of CSP_FORBIDDEN_ALWAYS) {
        for (const literal of literals) {
          if (literal.value.includes(forbidden)) {
            found.push(`${file}:${literal.line}  禁止形 "${forbidden}"`)
          }
        }
      }

      /*
       * (c) `unsafe-inline` は `script-src` / `style-src` にしか現れてはならない。
       * リテラル単位で見る — CSP は 1 本の文字列に全部書くこともあるため、
       * directive 名を含まないリテラルに `unsafe-inline` があれば場所が特定できず違反とする。
       */
      for (const literal of literals) {
        if (!literal.value.includes('unsafe-inline')) continue
        const hasAllowedDirective = CSP_UNSAFE_INLINE_ALLOWED_DIRECTIVES.some((directive) =>
          literal.value.includes(directive)
        )
        const isBareToken =
          literal.value.trim() === "'unsafe-inline'" || literal.value.trim() === 'unsafe-inline'
        if (!hasAllowedDirective && !isBareToken) {
          found.push(
            `${file}:${literal.line}  unsafe-inline が script-src / style-src 以外に現れている`
          )
        }
      }

      // (d) dev 緩和のゲートが `app.isPackaged` であること。環境変数判定は禁止。
      if (joined.includes('unsafe-inline') || src.code.includes('unsafe-inline')) {
        if (!hasPackagedGate()) {
          found.push(
            `${file}  unsafe-inline の緩和ゲートが ${CSP_DEV_GATE_EXPRESSION} に基づいていない`
          )
        }
        const envGate = /process\s*\.\s*env\s*\.\s*[A-Za-z0-9_]+/.exec(src.code)
        if (envGate !== null) {
          found.push(`${file}  CSP の分岐に環境変数が現れている: ${envGate[0]}`)
        }
      }
    }
    /*
     * (e) **`CSP_FILES` 以外に CSP 宣言が無いこと。**
     *
     * (a)〜(d) は「あるべき場所」しか見ない。それだけでは
     * **別の場所に 2 つ目の CSP があっても気付けない。**
     * scaffold の `index.html` が meta タグで `style-src 'self' 'unsafe-inline'` を
     * 宣言しており、出荷ビルドでも緩和が効いたまま項目 10 は ok を返し続けていた (実測)。
     *
     * AD-025 §7 は「緩和は CSP を組み立てる 1 関数の dev 分岐にのみ現れる」と定めた。
     * その決定は**宣言箇所が 1 つであること**を前提にしている。
     */
    for (const src of sources) {
      if (CSP_FILES.includes(src.file)) continue
      // 定数と検査本体はこの標識を定義上含む。含めると定義した瞬間に違反になる。
      if (SELF_DEFINITION_FILES.includes(src.file)) continue
      if (CSP_DECLARATION_EXEMPT_SUFFIXES.some((suffix) => src.file.endsWith(suffix))) continue
      for (const marker of CSP_DECLARATION_MARKERS) {
        if (!src.code.includes(marker)) continue
        const line = src.code.slice(0, src.code.indexOf(marker)).split('\n').length
        found.push(
          `${src.file}:${line}  CSP の宣言が許可ファイル以外に現れている ("${marker}")。` +
            `宣言は ${CSP_FILES.join(' / ')} に 1 つだけ置く`
        )
      }
    }

    violations(10, 'CSP が FR-040 の directive を満たし禁止形を含まない', 'FR-040', found)
  }
}

/**
 * dev 緩和のゲートが `app.isPackaged` に基づいているかを見る。
 * 判定関数は `origins.ts` に置いてあるため、CSP のファイル内だけを見ても分からない。
 */
function hasPackagedGate() {
  return sources.some((src) => src.code.includes(CSP_DEV_GATE_EXPRESSION))
}

/* ── 項目 11: ナビゲーション拒否と origin 定数の単一性 ───────────── */
{
  const found = []

  /*
   * **存在確認も「呼び出し形」で見る。**
   * 名前の出現で判定すると `allowlists.mjs` に書いた定数の値が条件を満たしてしまい、
   * アプリ側からハンドラを消しても検証が通る (実測で確認した穴)。
   */
  const openHandlerRe = new RegExp(String.raw`\b${WINDOW_OPEN_HANDLER}\s*\(`)
  if (!sources.some((src) => openHandlerRe.test(src.code))) {
    found.push(`${WINDOW_OPEN_HANDLER} の呼び出しが無い (window.open を拒否できていない)`)
  }

  const navigationGuardRe = new RegExp(String.raw`\.on\s*\(\s*['"]${NAVIGATION_GUARD_EVENT}['"]`)
  if (!sources.some((src) => navigationGuardRe.test(src.code))) {
    found.push(`${NAVIGATION_GUARD_EVENT} のハンドラが無い (トップレベル遷移を拒否できていない)`)
  }

  /*
   * 許可 origin の集合を返す関数の**定義**が 1 箇所だけであること (FR-039)。
   * 複数箇所で組み立てると、片方だけ緩めた状態が作れる。
   */
  const defRe = new RegExp(`(?:function|const|let|var)\\s+${ALLOWED_ORIGINS_FUNCTION}\\b`)
  const definitions = sources.filter((src) => defRe.test(src.code)).map((src) => src.file)
  if (definitions.length === 0) {
    found.push(`${ALLOWED_ORIGINS_FUNCTION} の定義が無い`)
  } else if (definitions.length > 1) {
    found.push(
      `${ALLOWED_ORIGINS_FUNCTION} の定義が ${definitions.length} 箇所ある: ${definitions.join(', ')}`
    )
  } else if (definitions[0] !== ALLOWED_ORIGINS_FILE) {
    found.push(
      `${ALLOWED_ORIGINS_FUNCTION} の定義場所が想定と違う: ${definitions[0]} (想定 ${ALLOWED_ORIGINS_FILE})`
    )
  }

  violations(11, 'window.open / 遷移の拒否と origin 定数の単一性', 'FR-039 / FR-040', found)
}

/* ── 項目 12: UNC 接頭辞リテラルを持てるモジュールの許可リスト ────── */
{
  /*
   * AD-028 §3。**API を迂回した手組みを塞ぐ。**
   *
   * 「`toUnc()` を呼んでよいモジュール」は縛らない — 呼ぶのは正規の経路であり、
   * 縛っても塞がる脅威が無い。塞ぐのは**リテラルを書いて自前で組み立てる**形である。
   *
   * テストは除外する。3 綴りを受理することを証明する場所がテストであり、
   * ここを禁じると規則そのものがテスト不能になる。
   */
  const found = []
  for (const src of literalSources) {
    if (UNC_LITERAL_MODULES.includes(src.file)) continue
    if (UNC_LITERAL_EXEMPT_SUFFIXES.some((suffix) => src.file.endsWith(suffix))) continue
    for (const literal of stringLiterals(src.code)) {
      for (const pattern of UNC_LITERAL_PATTERNS) {
        if (!literal.value.includes(pattern)) continue
        found.push(
          `${src.file}:${literal.line}  許可外モジュールが UNC 接頭辞を持っている "${pattern}"`
        )
      }
    }
  }
  violations(
    12,
    'UNC 接頭辞リテラルを持てるモジュールの許可リスト',
    'AD-028 / FR-042',
    found,
    `許可: ${UNC_LITERAL_MODULES.join(', ')} (テストは除外)`
  )
}

/* ── 項目 13: `agents` は UNC を扱わない ──────────────────────────── */
{
  /*
   * AD-028 §3 の規則 2 の機械強制。
   * 列挙プロセスは受け取った値を SDK に渡すだけであり、
   * **リテラルも UNC API 呼び出しも持たない。**
   *
   * 規則を散文でしか書かないと、R-3 / X-3 が同じプロセス方式に乗るときに破れる。
   */
  const found = []
  const apiCallRe = new RegExp(String.raw`\b(?:${UNC_API_NAMES.join('|')})\s*\(`)
  for (const src of sources) {
    if (!UNC_FORBIDDEN_IN.some((dir) => src.file.startsWith(dir))) continue
    /*
     * **テストは除外する** (項目 12 と揃える)。
     * 規則が禁じているのは「agents の実装が UNC を知っていること」である。
     * 「受け取った UNC 値をそのまま素通しする」ことを確かめるテストは、
     * **規則が守られていることの証拠**であって違反ではない。
     * 除外しないと素通しを検証できなくなる (実測でこのテストが引っかかった)。
     */
    if (UNC_LITERAL_EXEMPT_SUFFIXES.some((suffix) => src.file.endsWith(suffix))) continue

    for (const literal of stringLiterals(src.code)) {
      for (const pattern of UNC_LITERAL_PATTERNS) {
        if (!literal.value.includes(pattern)) continue
        found.push(`${src.file}:${literal.line}  agents が UNC 接頭辞を持っている "${pattern}"`)
      }
    }
    if (apiCallRe.test(src.code)) {
      found.push(
        `${src.file}  agents が UNC を作る API を呼んでいる (${UNC_API_NAMES.join(' / ')})`
      )
    }
  }
  violations(
    13,
    '`agents` が UNC のリテラルと API を持たない',
    'AD-028 / Principle VII',
    found,
    `対象: ${UNC_FORBIDDEN_IN.join(', ')}`
  )
}

/* ── 項目 14: Agent SDK の API は許可 1 件だけ ────────────────────── */
{
  /*
   * contracts C-4 の機械強制 (SH-081)。
   *
   * **許可 1 件以外を禁じる。** 禁止側を列挙する形にすると、
   * C-4 の表に行を足したときに検査側が古くなる。
   *
   * **呼び出し形で判定する。** `import` しただけの名前や型注釈は違反にしない —
   * 正当に使う後続 feature (X-1 / O-1 / I-1) で検証が破綻するため (research R-07)。
   *
   * **表 1 (副作用) だけを見ても FR-044 は守られない。** 列挙プロセスが本文を読んで
   * `summary` に詰め直す実装は、前後のファイル比較 (SC-004) では**読み取りなので検出できない**。
   */
  const found = []
  /*
   * **package.json と検査スクリプト自身は対象外。**
   * 依存の宣言と「許可リストの定義そのもの」を違反に数えると、
   * 検査を成立させるために検査を緩めることになる。
   * **対象は `src/` の実装だけ**である。
   */
  const sdkScope = (file) =>
    file.startsWith('src/') && !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')

  for (const src of sources) {
    if (!sdkScope(src.file)) continue
    if (!src.code.includes(AGENT_SDK_PACKAGE)) continue

    if (!AGENT_SDK_IMPORT_DIRECTORIES.some((dir) => src.file.startsWith(dir))) {
      found.push(`${src.file}  許可外モジュールが Agent SDK を import している`)
      continue
    }

    /*
     * import した名前を集める。**名前付き import だけを見る** —
     * 名前空間 import (`import * as sdk`) は呼び出し形が `sdk.foo(` になるので
     * 下の走査で拾えない。名前空間 import 自体を違反にする。
     */
    const namespaceImport = new RegExp(
      String.raw`import\s+\*\s+as\s+\w+\s+from\s*['"]` + AGENT_SDK_PACKAGE
    )
    if (namespaceImport.test(src.code)) {
      found.push(`${src.file}  SDK を名前空間 import している (呼び出し形で検査できない)`)
      continue
    }

    const named = new RegExp(
      String.raw`import\s*\{([^}]*)\}\s*from\s*['"]` + AGENT_SDK_PACKAGE + String.raw`['"]`
    ).exec(src.code)
    const bindings = (named?.[1] ?? '')
      .split(',')
      .map(
        (part) =>
          part
            .replace(/^\s*type\s+/, '')
            .split(/\s+as\s+/)
            .pop()
            ?.trim() ?? ''
      )
      .filter((name) => name.length > 0)

    for (const name of bindings) {
      if (AGENT_SDK_ALLOWED_CALLS.includes(name)) continue
      // **呼び出し形だけを違反にする。** 型としての利用は許す。
      const call = new RegExp(String.raw`(?<![.\w])` + name + String.raw`\s*\(`)
      if (call.test(src.code)) {
        found.push(`${src.file}  許可外の SDK API を呼んでいる "${name}"`)
      }
    }
  }
  violations(
    14,
    'Agent SDK の呼び出しが許可リスト内 (許可 1 件以外を禁じる)',
    'IV / contracts C-4',
    found,
    `許可: ${AGENT_SDK_ALLOWED_CALLS.join(', ')} / import 可: ${AGENT_SDK_IMPORT_DIRECTORIES.join(', ')}`
  )
}

/* ── 項目 15: R-2 が追加したレイヤは `wsl.exe` を呼ばない ────────── */
{
  /*
   * SC-003 の機械強制 (SH-082)。
   *
   * **R-2 は実行状態の確認に R-1 の `verifyRunning()` を使うだけ**であり、
   * 自分では `wsl.exe` を起動しない (contracts C-7)。
   * 項目 3 は「プロセス起動 API を持つファイルに裸の `wsl` があること」を見るが、
   * **プロセス起動 API を持たないファイルに `wsl.exe` の文字列があっても掛からない** —
   * 動的な組み立てや別レイヤ経由の起動はそこを抜ける。
   *
   * ここでは **R-2 が追加したディレクトリに `wsl` の実行ファイル名が現れないこと**を見る。
   * 名前空間識別子 (`wsl:<D>`) は別物なので、**実行ファイルの綴りだけ**を対象にする。
   */
  const found = []

  /*
   * **裸の `wsl` は検査対象にしない。**
   * R-2 のレイヤには `Location` の判別子 (`kind: 'wsl'`) と
   * 名前空間識別子 (`wsl:<D>`) と出自の種別 (`wsl-from-unc` 等) が正当に現れる。
   * 文字列として `wsl` を禁じると、これらが全部引っかかる (実測で 17 件)。
   *
   * **見るのは 2 つに絞る。**
   *   1. 実行ファイルの綴り `wsl.exe` — これは実行以外の意味を持たない
   *   2. WSL CLI レイヤ (`infra/runtime/wsl-cli`) への import
   *
   * 2 が本質である。R-2 は実行状態の確認に **R-1 の `verifyRunning()` の戻り値を
   * 受け取るだけ**であり (contracts C-7)、CLI レイヤを知らない。
   * プロセス起動 API そのものの許可リストは項目 7 が見ている。
   */
  const exeRe = /wsl\.exe/i
  const cliRe = /wsl-cli|WslCli/
  for (const src of sources) {
    if (!WSL_FREE_DIRECTORIES.some((dir) => src.file.startsWith(dir))) continue
    if (src.file.endsWith('.test.ts') || src.file.endsWith('.test.tsx')) continue

    if (cliRe.test(src.code)) {
      found.push(`${src.file}  R-2 のレイヤが WSL CLI レイヤを参照している`)
    }
    for (const literal of stringLiterals(src.code)) {
      if (!exeRe.test(literal.value)) continue
      found.push(`${src.file}:${literal.line}  R-2 のレイヤに wsl.exe がある "${literal.value}"`)
    }
  }
  violations(
    15,
    'R-2 が追加したレイヤが `wsl.exe` と WSL CLI を参照しない',
    'SC-003 / contracts C-7',
    found,
    `対象: ${WSL_FREE_DIRECTORIES.join(', ')}`
  )
}

/* ── 項目 16: 権限ゲートの正の構成 (options / Query メソッドの backstop) ── */
{
  /*
   * contracts C-4 P1-P3 の backstop (SH-010 / AD-036 §4)。
   *
   * **正の構成そのものは `session-core.ts` の `buildQueryOptions` (allowlist キーのみ) と
   * `toPermissionResult` ({behavior, message} のみ) が保証し unit test が守る。**
   * ここは SDK を保持するファイル (`AGENT_SDK_IMPORT_DIRECTORIES`) に昇格レバーが**直に現れないこと**を見る。
   * 項目 14 は named import の呼び出し形だけを見るため、**options リテラルのキー**と
   * **`Query` の `.method()` 呼び出し**を捕まえられない (contracts C-4 SC-006(a) が名指す穴)。
   * これは「現れてはならない綴り」の検査であって正の構成の代替ではない — 迂回 (別変数経由の options 合成等) は
   * `buildQueryOptions` の allowlist と SH-010 fixture が担う。
   */
  const found = []
  const sdkScope = (file) =>
    AGENT_SDK_IMPORT_DIRECTORIES.some((dir) => file.startsWith(dir)) &&
    !file.endsWith('.test.ts') &&
    !file.endsWith('.test.tsx')

  for (const src of sources) {
    if (!sdkScope(src.file)) continue

    // (P1) query() options に昇格キーを混ぜない (`key:` の形。コメントの `/` 区切り列挙は拾わない)。
    for (const key of QUERY_ESCALATION_OPTION_KEYS) {
      if (new RegExp(String.raw`(?<![.\w])` + key + String.raw`\s*:`).test(src.code)) {
        found.push(
          `${src.file}  query options の昇格キー "${key}:" が現れている (正の構成 P1 を破る)`
        )
      }
    }
    // (P1) `settings` は AD-040 の制約付き射影に限る — `assertHelperSettings(...)` ラッパを通さない
    //      `settings:` (リテラル/別変数) を違反にする。grep backstop であり値の中身は見ない (M-102。
    //      load-bearing gate は buildQueryOptions の型 + query 直前の実行時 assert)。
    {
      const settingsRe = /(?<![.\w])settings\s*:/g
      let m
      while ((m = settingsRe.exec(src.code)) !== null) {
        const sanctioned = new RegExp(
          String.raw`^settings\s*:\s*` + SANCTIONED_SETTINGS_WRAPPER + String.raw`\s*\(`
        ).test(src.code.slice(m.index))
        if (!sanctioned) {
          found.push(
            `${src.file}  query options の "settings:" が ${SANCTIONED_SETTINGS_WRAPPER}() を通さず現れている ` +
              `(AD-040。制約付き射影 {${QUERY_SETTINGS_ALLOWED_KEYS.join(', ')}} のみ許可)`
          )
        }
      }
    }
    // (P1) permissionMode は 'default' 固定。昇格値のリテラルを締め出す。
    for (const value of PERMISSION_MODE_ESCALATION_VALUES) {
      if (src.code.includes(`'${value}'`) || src.code.includes(`"${value}"`)) {
        found.push(
          `${src.file}  permissionMode の昇格値 "${value}" が現れている (P1。'default' 固定)`
        )
      }
    }
    // (P3) Query の mutation メソッド呼び出し (interrupt 以外)。
    for (const method of QUERY_MUTATION_METHODS) {
      if (new RegExp(String.raw`\.\s*` + method + String.raw`\s*\(`).test(src.code)) {
        found.push(
          `${src.file}  Query の mutation メソッド ".${method}()" を呼んでいる (P3。interrupt のみ許可)`
        )
      }
    }
  }
  violations(
    16,
    '権限ゲートの正の構成 (query options のキー / Query メソッドの backstop)',
    'III / contracts C-4',
    found,
    `対象: ${AGENT_SDK_IMPORT_DIRECTORIES.join(', ')} / 正本は buildQueryOptions + toPermissionResult`
  )
}

/* ── 項目 17: 永続化層ソースに平文秘密リテラルが無い (Principle V backstop) ── */
{
  /*
   * Principle V の**ソース側 backstop** (X-3 / SH-010 / security H-004)。
   *
   * 永続化 (`infra/settings`) と秘密モジュール (`infra/secrets`) の**本体ソース**の文字列リテラルに、
   * 既知プロバイダの平文秘密 (sk-… / AKIA… / ghp_… / glpat-… / xox…-… / AIza… / PEM) が
   * 直書きされていないことを見る。開発者が誤ってキーをハードコードするのを止める grep。
   *
   * **利用者 runtime の `providers.json` に永続された秘密値は静的検査できない** — その runtime ガードは
   * `provider-record` の extraEnv 値スキャン (BE-004) + SC-002 unit test + security-reviewer が担う
   * (捕まらない経路の正直な列挙。AD-024 #9 / AD-027)。
   * test ファイルは対象外 — 秘密拒否のテストは意図的に fake secret を持つ (provider-store.test.ts:82)。
   */
  const inScope = (file) =>
    SECRET_LITERAL_SCAN_DIRS.some((dir) => file.startsWith(dir)) &&
    !file.endsWith('.test.ts') &&
    !file.endsWith('.test.tsx')
  const scoped = sources.filter((src) => inScope(src.file))
  if (scoped.length === 0) {
    pending(
      17,
      '永続化層ソースに平文秘密リテラルが無い',
      'V',
      `対象 ${SECRET_LITERAL_SCAN_DIRS.join(', ')} の本体ソースが未実装`
    )
  } else {
    const found = []
    for (const src of scoped) {
      for (const literal of stringLiterals(src.code)) {
        if (SECRET_LITERAL_PATTERN.test(literal.value)) {
          found.push(
            `${src.file}:${literal.line}  平文の秘密リテラルが永続化層に直書きされている ` +
              `(Principle V。秘密は safeStorage 参照キーのみを持つ)`
          )
        }
      }
    }
    violations(
      17,
      '永続化層ソースに平文秘密リテラルが無い',
      'V',
      found,
      `対象: ${SECRET_LITERAL_SCAN_DIRS.join(', ')} (test 除く) / runtime ガードは provider-record + SC-002`
    )
  }
}

/* ── 報告 ─────────────────────────────────────────────────────────── */

const MARK = { ok: 'ok     ', violation: 'VIOLATE', pending: 'pending' }

console.log(`Constitution 検証 — 対象 ${files.length} ファイル`)
console.log('')
for (const result of results) {
  console.log(
    `[${MARK[result.state]}] #${result.id} ${result.title}  (Principle ${result.principle})`
  )
  if (result.note !== '') console.log(`            ${result.note}`)
  for (const finding of result.findings) console.log(`            ${finding}`)
}
console.log('')

const violationCount = results.filter((r) => r.state === 'violation').length
const pendingCount = results.filter((r) => r.state === 'pending').length
const findingCount = results.reduce((sum, r) => sum + r.findings.length, 0)

console.log(
  `項目 ${results.length} 件: ok ${results.length - violationCount - pendingCount} / ` +
    `違反 ${violationCount} (指摘 ${findingCount} 件) / 検査対象なし ${pendingCount}`
)

if (pendingCount > 0) {
  console.log('')
  console.log('**「検査対象なし」は合格ではない。** 対象が実装された時点で再実行すること。')
}

process.exit(violationCount > 0 ? 1 : 0)
