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
 * ## 後始末を保証する
 *
 * 展開したファイルは `finally` で必ず消す。
 * 途中で失敗しても `src/` に違反サンプルを残さない — 残すと
 * 「通常の検証は違反 0 件のまま」(SC-009) が破れる。
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

import { FIXTURES, UNDETECTED_NOTES } from '../../tests/rule-fixtures/expected.mjs'

const FIXTURE_ROOT = 'tests/rule-fixtures'

/** 展開先のディレクトリ名。**この名前でしか展開しない** — 後始末の対象を一意にするため。 */
const SANDBOX_DIR = '__rulecheck__'

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

/** 展開する。**元の拡張子は `.ts.fixture`** なので通常の検証には見えない。 */
async function deploy() {
  const deployed = []
  for (const fixture of FIXTURES) {
    const source = `${FIXTURE_ROOT}/${fixture.file}`
    const content = await readFile(source, 'utf8')
    const dir = fixture.target.slice(0, fixture.target.lastIndexOf('/'))
    await mkdir(dir, { recursive: true })
    await writeFile(fixture.target, content, 'utf8')
    deployed.push(fixture.target)
  }
  return deployed
}

/** 後始末。**展開先のディレクトリごと消す。** */
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

/** 検証を一括で回して、検出器ごとの出力を集める。 */
async function collect() {
  const [eslint, depcruise, constitution, typecheckNode, typecheckWeb] = await Promise.all([
    // **`-f unix` は使えない** (core から外れた)。既定の整形で十分である。
    run('npx', ['eslint', '.', '--no-cache']),
    run('npx', ['depcruise', 'src', '--output-type', 'err']),
    run('node', ['scripts/constitution/check.mjs']),
    run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.node.json', '--composite', 'false']),
    run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.web.json', '--composite', 'false'])
  ])
  return {
    eslint: eslint.output,
    /*
     * **`no-orphans` を除く。**
     * 展開したサンプルは誰からも参照されないので必ず孤児になる。
     * これを検出に数えると、どのサンプルも「depcruise が捕まえた」ことになり
     * 期待表が意味を失う (実測で `ui-path-concat` が誤検出された)。
     */
    depcruise: stripOrphanWarnings(depcruise.output),
    constitution: constitution.output,
    typecheck: `${typecheckNode.output}\n${typecheckWeb.output}`
  }
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
 * 期待表と突き合わせる。
 *
 * - `detectors` に挙がった検出器の出力に、そのサンプルへの言及があること
 * - `rules` が指定されていれば、その名前が出力に現れること
 * - `detectors: ['none']` は**どの検出器にも現れないこと**を要求する
 */
function verify(outputs) {
  const failures = []
  const rows = []

  for (const fixture of FIXTURES) {
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
      rows.push({ name, group: fixture.group, expected: 'none', actual: hits.join(', ') || '—' })
      continue
    }

    for (const detector of fixture.detectors) {
      if (!hits.includes(detector)) {
        failures.push(
          `${name}: ${detector} が検出しなかった (期待: ${fixture.detectors.join(', ')})`
        )
      }
    }

    for (const rule of fixture.rules ?? []) {
      if (!Object.values(outputs).some((output) => output.includes(rule))) {
        failures.push(`${name}: 期待する規則 "${rule}" が出力に現れない`)
      }
    }

    rows.push({
      name,
      group: fixture.group,
      expected: fixture.detectors.join(', '),
      actual: hits.join(', ') || '—'
    })
  }

  return { failures, rows }
}

async function main() {
  console.log('ルール検証 — 違反サンプルを展開して各検証を実行する')
  console.log('')

  let outputs
  try {
    const deployed = await deploy()
    console.log(`展開: ${deployed.length} 件`)
    outputs = await collect()
  } finally {
    await cleanup()
    console.log('後始末: 完了')
  }

  const { failures, rows } = verify(outputs)

  console.log('')
  console.log('| 群 | サンプル | 期待 | 実際 |')
  console.log('|---|---|---|---|')
  for (const row of rows) {
    console.log(`| ${row.group} | ${row.name} | ${row.expected} | ${row.actual} |`)
  }
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

await main()
