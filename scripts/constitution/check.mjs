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

    for (const literal of stringLiterals(src.code)) {
      for (const pattern of UNC_LITERAL_PATTERNS) {
        if (!literal.value.includes(pattern)) continue
        found.push(`${src.file}:${literal.line}  agents が UNC 接頭辞を持っている "${pattern}"`)
      }
    }
    if (apiCallRe.test(src.code)) {
      found.push(`${src.file}  agents が UNC を作る API を呼んでいる (${UNC_API_NAMES.join(' / ')})`)
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
