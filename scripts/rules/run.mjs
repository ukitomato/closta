#!/usr/bin/env node
/**
 * ルール検証ランナー (SH-021 / SC-008 / SC-009 / SC-017)。
 *
 * `tests/rule-fixtures/` の違反サンプルを**一時的に検査対象へ展開**し、
 * lint / 依存グラフ / Constitution 検証 / 型検査を実行して
 * **期待表との一致**を assert し、後始末する。
 *
 * ## なぜ要るか
 *
 * R-1 の実装中に、**書いてあるのに効いていないルールが 5 件**見つかった (AD-025)。
 * 1 件も一致しない正規表現、評価されない設定、「未知」に落ちて判定を免れる依存。
 * どれも「違反 0 件」と区別がつかない。
 * **ルールは「書いた」ことではなく「違反サンプルで発火した」ことで確認する。**
 *
 * ## 1 件ずつ展開する (pr-gate Round 1 C-001)
 *
 * 以前は 20 件を**同時に**展開して検証を 1 回だけ回し、
 * 「期待する規則名が全検出器の出力のどこかに現れるか」で判定していた。
 * これは **どの規則がどのサンプルで発火したかを一切検査していない**。
 * 1 件でも発火すれば他が死んでいても通るため、
 * 「違反 0 件はルールが死んでいる状態と区別できない」という
 * AD-025 の問題を `test:rules` 自身が再現していた。
 *
 * **1 件だけ置いて検証する。** 置いたのがその 1 件 (と同伴サンプル) だけなので、
 * 出力に現れた規則名はそのサンプルの話だと確定する。
 *
 * ## `#N` は状態つきで照合する (同 C-001)
 *
 * `check.mjs` は**全 11 項目の見出しを状態に関わらず必ず印字する**
 * (`[ok     ] #1 ...` / `[VIOLATE] #1 ...` / `[pending] #5 ...`)。
 * したがって素の `#N` を部分一致で探すと、**検査が何も見つけなくても満たされる**。
 * `[VIOLATE] #N` の形で照合する。
 *
 * ## 残余
 *
 * 規則名 (eslint / depcruise) の照合は依然としてそのイテレーションの出力に対する
 * 部分一致である。**同伴サンプルが同じ規則名を発火させた場合は区別できない。**
 * 現在の同伴関係 3 件はいずれも別の規則を発火させるため実害はないが、
 * 同伴サンプルを増やすときはここを確認すること。
 * 構造的に閉じるには検出器の機械可読出力 (JSON) が要る。
 *
 * ## 同時に 2 つ走らせない (排他)
 *
 * `main()` は開始時に**全サンプルの展開先を消す** (下記「後始末を保証する」)。
 * そのため 2 つの実行が重なると、一方の `cleanup()` が
 * **他方が展開した直後のサンプルを消す**。消された側の検出器は何も見つけず、
 * 「ルールが発火しなかった」と報告する — **実際には発火する余地が無かった**。
 *
 * この形で 2 度誤診した (いずれも `domain-io-import` と
 * `agents-electron-transitive` が「死んでいる」と報告された)。
 * 症状がルールの退行と見分けられないため、**重なった時点で止める。**
 *
 * ## 後始末を保証する
 *
 * 展開したファイルは `finally` で必ず消す。
 * 途中で失敗しても `src/` に違反サンプルを残さない — 残すと
 * 「通常の検証は違反 0 件のまま」(SC-009) が破れる。
 */

import { mkdir, open, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

import { FIXTURES, UNDETECTED_NOTES } from '../../tests/rule-fixtures/expected.mjs'

const FIXTURE_ROOT = 'tests/rule-fixtures'

/** 展開先のディレクトリ名。**この名前でしか展開しない** — 後始末の対象を一意にするため。 */
const SANDBOX_DIR = '__rulecheck__'

/** 検出器の全集合。`none` のサンプルは全部走らせないと「捕まらない」を示せない。 */
const ALL_DETECTORS = ['eslint', 'depcruise', 'constitution', 'typecheck']

/**
 * コマンドを実行して stdout + stderr を返す。
 * **終了コードで判定しない** — 検証は「期待する指摘が出たか」で見る。
 */
function run(command, args) {
  return new Promise((resolve) => {
    /*
     * `shell: true` と引数配列の併用は Node が非推奨としている (DEP0190)。
     * **1 本の文字列で渡す。** 引数はこのファイル内のリテラルだけであり、
     * 外部入力を連結しない。
     */
    const child = spawn([command, ...args].join(' '), { shell: true, windowsHide: true })
    let output = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      output += chunk
    })
    child.stderr?.on('data', (chunk) => {
      output += chunk
    })
    child.on('close', (code) => resolve({ code, output }))
    child.on('error', (error) => resolve({ code: null, output: String(error) }))
  })
}

/** `file` から `Fixture` を引く。`requires` の解決に使う。 */
const BY_FILE = new Map(FIXTURES.map((fixture) => [fixture.file, fixture]))

/**
 * そのサンプルの展開に必要な全サンプル (自身 + `requires` の推移閉包)。
 *
 * **同伴サンプルが要るのは、単独では違反が成立しない形があるため**である —
 * 循環依存は相手側が無いと循環にならず、推移的到達は経由するモジュールが要る。
 */
function withCompanions(fixture) {
  const seen = new Map()
  const stack = [fixture]
  while (stack.length > 0) {
    const current = stack.pop()
    if (seen.has(current.file)) continue
    seen.set(current.file, current)
    for (const required of current.requires ?? []) {
      const companion = BY_FILE.get(required)
      if (companion === undefined) {
        throw new Error(`${current.file}: requires が指す ${required} が期待表に無い`)
      }
      stack.push(companion)
    }
  }
  return [...seen.values()]
}

/** 展開する。**元の拡張子は `.ts.fixture`** なので通常の検証には見えない。 */
async function deploy(fixtures) {
  for (const fixture of fixtures) {
    const source = `${FIXTURE_ROOT}/${fixture.file}`
    const content = await readFile(source, 'utf8')
    const dir = fixture.target.slice(0, fixture.target.lastIndexOf('/'))
    await mkdir(dir, { recursive: true })
    await writeFile(fixture.target, content, 'utf8')
  }
}

/**
 * 後始末。**展開先のディレクトリごと消す。**
 *
 * 1 件ずつ回すので毎イテレーションで呼ぶ。**全サンプルの展開先を対象にする** —
 * 前のイテレーションの取り残しがあると次の判定を汚すため、
 * 今回展開した分だけでなく既知の展開先すべてを消す。
 */
async function cleanup() {
  const dirs = new Set(
    FIXTURES.map((fixture) => fixture.target.slice(0, fixture.target.lastIndexOf('/')))
  )
  for (const dir of dirs) {
    if (!dir.endsWith(`/${SANDBOX_DIR}`)) {
      throw new Error(`後始末の対象が ${SANDBOX_DIR} ではない: ${dir}`)
    }
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * 指定された検出器だけを回す。
 *
 * **要る検出器だけに絞る。** 1 件ずつ回す形では検証回数が 20 倍になるため、
 * `detectors` に挙がっていないものは走らせない。`none` のサンプルだけは
 * 「どれも捕まえない」を示す必要があるので全部走らせる。
 */
async function collect(detectors) {
  const wanted = new Set(detectors)
  const tasks = []

  if (wanted.has('eslint')) {
    // **`-f unix` は使えない** (core から外れた)。既定の整形で十分である。
    tasks.push(['eslint', run('npx', ['eslint', '.', '--no-cache'])])
  }
  if (wanted.has('depcruise')) {
    tasks.push(['depcruise', run('npx', ['depcruise', 'src', '--output-type', 'err'])])
  }
  if (wanted.has('constitution')) {
    tasks.push(['constitution', run('node', ['scripts/constitution/check.mjs'])])
  }
  if (wanted.has('typecheck')) {
    tasks.push([
      'typecheck',
      Promise.all([
        run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.node.json', '--composite', 'false']),
        run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.web.json', '--composite', 'false'])
      ]).then(([node, web]) => ({
        output: `${node.output}\n${web.output}`,
        // 2 project のどちらかが落ちていれば落ちた側を採る。
        code: node.code !== 0 ? node.code : web.code
      }))
    ])
  }

  const outputs = {}
  const codes = {}
  for (const [name, task] of tasks) {
    const result = await task
    /*
     * **`no-orphans` を除く。**
     * 展開したサンプルは誰からも参照されないので必ず孤児になる。
     * これを検出に数えると、どのサンプルも「depcruise が捕まえた」ことになり
     * 期待表が意味を失う (実測で `ui-path-concat` が誤検出された)。
     */
    outputs[name] = name === 'depcruise' ? stripOrphanWarnings(result.output) : result.output
    codes[name] = result.code ?? null
  }
  return { outputs, codes }
}

/** `no-orphans` の行だけを落とす。他の warn / error は残す。 */
function stripOrphanWarnings(output) {
  return output
    .split('\n')
    .filter((line) => !line.includes('no-orphans'))
    .join('\n')
}

/** ファイル名部分 (拡張子なし)。期待表の照合に使う。 */
function stem(fixture) {
  const base = fixture.file.slice(fixture.file.lastIndexOf('/') + 1)
  return base.replace('.ts.fixture', '')
}

/**
 * 期待する規則 / 項目が発火したかを見る。
 *
 * **`#N` は Constitution 検証の項目番号**である。見出しは状態に関わらず必ず出るので
 * `[VIOLATE] #N` の形で照合する。素の `#N` では
 * 「検査が何も見つけていない」ことと区別できない (C-001)。
 */
function ruleMatched(rule, outputs) {
  if (rule.startsWith('#')) {
    const constitution = outputs.constitution ?? ''
    // `#1` が `#11` に当たらないよう語境界で止める。
    return new RegExp(`\\[VIOLATE\\]\\s*${rule}\\b`).test(constitution)
  }
  return Object.values(outputs).some((output) => output.includes(rule))
}

/**
 * 1 件の期待表と突き合わせる。
 *
 * - `detectors` に挙がった検出器の出力に、**そのサンプルへの言及**があること
 * - `rules` が指定されていれば、その規則 / 項目が発火していること
 * - `detectors: ['none']` は**どの検出器にも現れないこと**を要求する
 */
function verifyOne(fixture, outputs) {
  const failures = []
  const name = stem(fixture)
  const target = fixture.target
  const hits = []

  for (const [detector, output] of Object.entries(outputs)) {
    // 出力のパス表記は OS で揺れるのでファイル名で照合する。
    if (output.includes(name) || output.includes(target.split('/').join('\\'))) {
      hits.push(detector)
    }
  }

  if (fixture.detectors.includes('none')) {
    /*
     * **捕まらないことを確かめる。** ここで捕まったら期待表が古い —
     * ルールが強くなったのに `none` と書いたままなら、SC-017 の
     * 「追跡対象」の数え方が間違っていることになる。
     */
    if (hits.length > 0) {
      failures.push(
        `${name}: 期待は「どの検証も捕まえない」だが ${hits.join(', ')} が検出した。` +
          `期待表を更新すること (SC-017 の残余が減ったということである)`
      )
    }
    /*
     * **記録の欠落を失敗にする。** 理由・代替手段・塞ぐ feature の 3 点が揃っていないと
     * SC-017 の「未検出のものには次に塞ぐ feature ID が割り当てられている」を満たさない。
     * 揃っていない残余は「書いてあるから許された状態」で無期限に残る。
     */
    const note = UNDETECTED_NOTES[name]
    if (note === undefined) {
      failures.push(`${name}: detectors が none なのに UNDETECTED_NOTES が無い`)
    } else {
      for (const field of ['why', 'mitigatedBy', 'nextFeature', 'howToClose']) {
        if (typeof note[field] !== 'string' || note[field].length === 0) {
          failures.push(`${name}: UNDETECTED_NOTES の ${field} が無い (SC-017)`)
        }
      }
    }
    return {
      failures,
      row: { name, group: fixture.group, expected: 'none', actual: hits.join(', ') || '—' }
    }
  }

  for (const detector of fixture.detectors) {
    if (!hits.includes(detector)) {
      failures.push(`${name}: ${detector} が検出しなかった (期待: ${fixture.detectors.join(', ')})`)
    }
  }

  for (const rule of fixture.rules ?? []) {
    if (!ruleMatched(rule, outputs)) {
      failures.push(`${name}: 期待する規則 "${rule}" が発火しなかった`)
    }
  }

  return {
    failures,
    row: {
      name,
      group: fixture.group,
      expected: fixture.detectors.join(', '),
      actual: hits.join(', ') || '—'
    }
  }
}

/**
 * 排他ロック。**重なった実行を検出したら走らせない。**
 *
 * 置き場は `node_modules/.cache/` — 既に git の管理外であり、
 * `.gitignore` に行を足さずに済む。
 *
 * **持ち主が生きているかを確かめる。** 強制終了でロックが残ったままになると、
 * 以降の実行が永久に拒否される。`process.kill(pid, 0)` は
 * シグナルを送らずに存在だけを見る (Windows でも使える)。
 */
const LOCK_PATH = 'node_modules/.cache/rules-run.lock'

async function acquireLock() {
  await mkdir('node_modules/.cache', { recursive: true })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(LOCK_PATH, 'wx')
      await handle.writeFile(String(process.pid), 'utf8')
      await handle.close()
      return
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }

    const owner = Number(await readFile(LOCK_PATH, 'utf8').catch(() => ''))
    if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
      console.error(`別の実行 (pid ${owner}) が進行中である。`)
      console.error('重ねて走らせると、一方の後始末が他方の違反サンプルを消し、')
      console.error('**ルールが発火しなかった**と誤って報告される。終わるまで待つこと。')
      process.exit(1)
    }

    // 持ち主が居ない = 前回が強制終了された。奪って続ける。
    console.log(`前回の実行 (pid ${owner}) のロックが残っていたので引き継ぐ`)
    await unlink(LOCK_PATH).catch(() => {})
  }
  throw new Error('ロックを取得できなかった')
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

async function main() {
  console.log('ルール検証 — 違反サンプルを 1 件ずつ展開して各検証を実行する')
  console.log('')

  await acquireLock()

  /*
   * **先に後始末する。** `finally` の後始末はプロセスが kill されたときには走らない
   * (実測: メモリ不足で強制終了され、違反サンプルが `src/` に残った)。
   * 展開先は `.gitignore` が `__rulecheck__` ディレクトリごと除外しているため
   * **`git status` にも現れず**、次の検証を黙って汚す。
   * 開始時に消しておけば、前回の取り残しが今回の判定に混ざらない。
   */
  await cleanup()

  const failures = []
  const rows = []

  for (const [index, fixture] of FIXTURES.entries()) {
    const companions = withCompanions(fixture)
    const detectors = fixture.detectors.includes('none') ? ALL_DETECTORS : fixture.detectors
    const label =
      companions.length > 1 ? `${stem(fixture)} (+${companions.length - 1} 同伴)` : stem(fixture)
    console.log(
      `[${String(index + 1).padStart(2)}/${FIXTURES.length}] ${label} — ${detectors.join(', ')}`
    )

    let outputs
    let codes
    try {
      await deploy(companions)
      const collected = await collect(detectors)
      outputs = collected.outputs
      codes = collected.codes
    } finally {
      await cleanup()
    }

    /*
     * **各検出器の終了コードと出力量を出す。**
     * 「検出器は走ったが何も言わなかった」と「検出器の起動に失敗して出力が空だった」は
     * どちらも `hits` が空になり、**期待表の誤りと見分けがつかない**。
     * 実測でこの曖昧さに 1 度当たったので、事後に切り分けられる形で残す。
     */
    console.log(
      `           ${Object.entries(outputs)
        .map(([detector, output]) => `${detector}=exit:${codes[detector]}/${output.length}B`)
        .join(' ')}`
    )

    /*
     * **起動に失敗した検出器は期待表の不一致にしない。**
     * `code: null` は spawn 自体が失敗したということであり、
     * 「ルールが発火しなかった」ではない。混ぜると原因を誤診する。
     */
    for (const [detector, code] of Object.entries(codes)) {
      if (code === null) {
        failures.push(`${stem(fixture)}: ${detector} の起動に失敗した (期待表の問題ではない)`)
      }
    }

    const result = verifyOne(fixture, outputs)
    failures.push(...result.failures)
    rows.push(result.row)
  }

  console.log('')
  console.log('後始末: 完了')
  console.log('')
  console.log('| 群 | サンプル | 期待 | 実際 |')
  console.log('|---|---|---|---|')
  for (const row of rows) {
    console.log(`| ${row.group} | ${row.name} | ${row.expected} | ${row.actual} |`)
  }
  console.log('')
  console.log('**「実際」は走らせた検出器の範囲での結果である。**')
  console.log('要る検出器だけに絞っているため、挙がっていない検出器は評価していない。')
  console.log('')

  if (failures.length > 0) {
    console.error(`期待表と一致しない項目が ${failures.length} 件ある:`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }

  const undetected = FIXTURES.filter((fixture) => fixture.detectors.includes('none'))
  console.log(`期待表と一致: ${rows.length} 件`)
  console.log('')
  console.log(`**機械検証で捕まらない経路: ${undetected.length} 件** (SC-017 の追跡対象)`)
  for (const fixture of undetected) {
    const note = UNDETECTED_NOTES[stem(fixture)]
    console.log(`  - ${stem(fixture)}: ${note.why}`)
    console.log(`    代替: ${note.mitigatedBy}`)
    console.log(`    塞ぐ feature: ${note.nextFeature} — ${note.howToClose}`)
  }
}

try {
  await main()
} finally {
  await unlink(LOCK_PATH).catch(() => {})
}
