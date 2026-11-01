import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  parseContentBlockTypes,
  parseControlRequestSubtypes,
  parsePackageVersion,
  parseSdkMessageUnion,
  parseToolInputs
} from '../../scripts/ui-coverage/coverage.mjs'

/**
 * Constitution 検証の項目 21 の発火のテスト (O-2 / BE-012 / SC-002 / AD-027)。
 *
 * **`check.mjs` に入力を差し替える口は無い** (環境変数も引数も読まない。design-gate R2 platform-boundary L-102)。
 * 全項目が `process.cwd()` からの相対パスで読むので、一時ディレクトリにリポジトリの形
 * (scripts・src・走査対象の構成ファイル・docs・node_modules の SDK の 3 ファイル) を組み、`cwd` を変えて起こす。
 *
 * 他の項目の結果は一時ディレクトリの中身に左右されうるので、**崩していない対応表との差分**で
 * 「項目 21 だけが違反に変わった」ことを確かめる。
 *
 * 子プロセスを 3 回起こす (このマシンでは 1 回 0.4〜2.4 秒)。
 */

const SDK_DIR = 'node_modules/@anthropic-ai/claude-agent-sdk'
const SDK_FILES = ['sdk.d.ts', 'sdk-tools.d.ts', 'package.json']
const ANTHROPIC_DIR = 'node_modules/@anthropic-ai/sdk'
/** B 節の照合の入力 (`@anthropic-ai/sdk`。AD-060)。 */
const ANTHROPIC_FILES = [
  'resources/beta/messages/messages.d.mts',
  'resources/messages/messages.d.mts',
  'package.json'
]
/** scan.mjs の SCAN_FILES。無いものは飛ばす。 */
const SCAN_FILES = [
  'package.json',
  'electron.vite.config.ts',
  'electron-builder.yml',
  'eslint.config.mjs',
  '.dependency-cruiser.js'
]

let root = ''

function validTable(): string {
  const sdkDts = readFileSync(`${SDK_DIR}/sdk.d.ts`, 'utf8')
  const version = parsePackageVersion(readFileSync(`${SDK_DIR}/package.json`, 'utf8'))
  const anthropicVersion = parsePackageVersion(
    readFileSync(`${ANTHROPIC_DIR}/package.json`, 'utf8')
  )
  const blocks = parseContentBlockTypes(
    sdkDts,
    readFileSync(`${ANTHROPIC_DIR}/${ANTHROPIC_FILES[0]}`, 'utf8'),
    readFileSync(`${ANTHROPIC_DIR}/${ANTHROPIC_FILES[1]}`, 'utf8')
  )
  const header = '| 識別子 | 判別子 | Tier | 割当 | 経路 | 備考 |\n|---|---|---|---|---|---|'
  const rows = (ids: string[]): string =>
    ids.map((id) => `| \`${id}\` | — | B | 表示不要: 発火のテスト | なし |  |`).join('\n')
  return [
    `SDK: @anthropic-ai/claude-agent-sdk ${version}`,
    '',
    `SDK: \`@anthropic-ai/sdk\` ${anthropicVersion}`,
    '',
    `## A メッセージ型\n\n${header}\n${rows(parseSdkMessageUnion(sdkDts))}\n`,
    `## B 中身のブロック\n\n${header}\n${rows(blocks)}\n`,
    `## C tool\n\n${header}\n${rows(parseToolInputs(readFileSync(`${SDK_DIR}/sdk-tools.d.ts`, 'utf8')))}\n`,
    `## D アプリが作る経路\n\n${header}\n${rows(['permission-request'])}\n`,
    `## E 制御要求\n\n${header}\n${rows(parseControlRequestSubtypes(sdkDts))}\n`,
    '## F element の分類\n\n| element | Tier | 使い道 | 備考 |\n|---|---|---|---|\n| Thread | A | 会話 |  |\n'
  ].join('\n')
}

function runCheck(): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, ['scripts/constitution/check.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000
  })
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
}

function violated(output: string): string[] {
  return [...output.matchAll(/^\[VIOLATE\] (#\d+)/gm)].map((m) => m[1]).sort()
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'closta-item21-'))
  const skip = (src: string): boolean => !/[\\/](?:node_modules|out|dist)(?:[\\/]|$)/.test(src)
  cpSync('scripts', join(root, 'scripts'), { recursive: true, filter: skip })
  cpSync('src', join(root, 'src'), { recursive: true, filter: skip })
  for (const file of SCAN_FILES) {
    if (existsSync(file)) cpSync(file, join(root, file))
  }
  mkdirSync(join(root, SDK_DIR), { recursive: true })
  for (const file of SDK_FILES) cpSync(`${SDK_DIR}/${file}`, join(root, SDK_DIR, file))
  for (const file of ANTHROPIC_FILES) {
    mkdirSync(dirname(join(root, ANTHROPIC_DIR, file)), { recursive: true })
    cpSync(`${ANTHROPIC_DIR}/${file}`, join(root, ANTHROPIC_DIR, file))
  }
  mkdirSync(join(root, 'docs'), { recursive: true })
  cpSync('docs/roadmap.md', join(root, 'docs/roadmap.md'))
}, 120_000)

afterAll(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true })
})

describe('Constitution 検証の項目 21 (Principle XII)', () => {
  it('崩した対応表で [VIOLATE] #21 を出し、終了コードが非 0 になる。崩していない対応表との差分は #21 だけ', () => {
    const table = validTable()
    writeFileSync(join(root, 'docs/ui-coverage.md'), table)
    const valid = runCheck()
    expect(valid.output).toMatch(/^\[ok {5}\] #21 /m)
    expect(valid.output).toContain('M3 の完了の条件の残り')
    // 他の項目が違反でなければ終了コードは 0 (項目 21 の ok が終了コードを汚さない)。
    expect(valid.status).toBe(violated(valid.output).length === 0 ? 0 : 1)

    // 1 行の割当を「未割当」に、1 行を消す (型が増えたのと同じ)。
    const broken = table
      .replace('| B | 表示不要: 発火のテスト | なし |', '| B | 未割当 | なし |')
      .replace(/^\| `SDKRateLimitEvent` .*\n/m, '')
    writeFileSync(join(root, 'docs/ui-coverage.md'), broken)
    const result = runCheck()
    expect(result.output).toMatch(/^\[VIOLATE\] #21 /m)
    expect(result.output).toContain('A SDKRateLimitEvent: SDK の型定義にあって対応表に行が無い')
    expect(result.output).toContain('未割当')
    expect(result.status).not.toBe(0)
    const added = violated(result.output).filter((id) => !violated(valid.output).includes(id))
    expect(added).toEqual(['#21'])
  }, 120_000)

  it('対応表と SDK の型定義が無いと、ファイル名を示して違反にする (pending にしない)', () => {
    // 1 回の起動で両方を確かめる (プロセスの起動が重いため)。SDK だけを特別扱いする退行も拾う。
    rmSync(join(root, 'docs/ui-coverage.md'), { force: true })
    rmSync(join(root, SDK_DIR, 'sdk.d.ts'), { force: true })
    // B 節の入力 (@anthropic-ai/sdk) も 1 つ消す。
    rmSync(join(root, ANTHROPIC_DIR, 'resources/messages/messages.d.mts'), { force: true })
    const result = runCheck()
    expect(result.output).toMatch(/^\[VIOLATE\] #21 /m)
    expect(result.output).toContain('docs/ui-coverage.md  検査の入力が無い')
    expect(result.output).toContain(`${SDK_DIR}/sdk.d.ts  検査の入力が無い`)
    expect(result.output).toContain(
      `${ANTHROPIC_DIR}/resources/messages/messages.d.mts  検査の入力が無い`
    )
    expect(result.output).not.toMatch(/^\[pending\] #21 /m)
    expect(result.status).not.toBe(0)
  }, 60_000)
})
