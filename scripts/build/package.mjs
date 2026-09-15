#!/usr/bin/env node
/**
 * electron-builder の実行をこのスクリプトから行う (SH-041)。
 *
 * **素の `electron-builder` では、このプロジェクトの開発ホストでインストーラを作れない。**
 * 原因は 2 つあり、どちらも electron-builder 側ではなくホストのセキュリティ製品との
 * 相互作用である。回避策も 2 つとも electron-builder が公式に用意している口を使う。
 *
 * ## (1) 同梱の 7-Zip が古く、実行が阻止される
 *
 * electron-builder は NSIS ツールセット (`.7z`) の展開に自前の `7za.exe` を落としてくる。
 * これが古い版であるため、セキュリティ製品がプロセスを止め、
 * `AssignProcessToJobObject: (6)` で展開そのものが行われない。
 * 展開されないまま「壊れたキャッシュ」として再試行されるので、何度回しても進まない。
 *
 * **`ELECTRON_BUILDER_7ZIP_PATH` でホストの 7-Zip を使わせる。**
 * これは electron-builder が読む公式の環境変数である
 * (`app-builder-lib/out/toolsets/7zip.js` の `resolve()`)。
 *
 * ## (2) 展開直後のディレクトリを rename できない
 *
 * 展開は `<dir>.tmp` に行い、最後に `<dir>` へ rename する。
 * 書き終えた直後のファイル群をセキュリティ製品が走査しており、
 * その短い窓の間 Windows は親ディレクトリの rename を `EPERM` で拒む。
 * **数百 ms 待てば成功する** — 実測で、同じディレクトリが失敗と成功の両方になった。
 *
 * electron-builder は rename を再試行しないので、
 * **失敗後に残った `<dir>.tmp` をこちらで昇格させ、状態ファイルを `complete` にして**
 * 再実行する。状態ファイルの形式は `app-builder-lib/out/util/cacheState.js` に従う。
 *
 * ## 意図的にしていないこと
 *
 * - `node_modules` に手を入れていない。上記はどちらも外側から効く手段である
 * - セキュリティ製品の除外設定を触っていない。ビルドのために防御を下げない
 */

import { spawn } from 'node:child_process'
import { readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** ホストに入っている 7-Zip の候補。先に見つかったものを使う。 */
const SYSTEM_7ZIP_CANDIDATES = [
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe'
]

/** ツールセットキャッシュの既定位置。`ELECTRON_BUILDER_CACHE` で上書きできる。 */
function cacheRoot() {
  return (
    process.env.ELECTRON_BUILDER_CACHE ??
    path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache')
  )
}

async function isFile(candidate) {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

async function resolveSystem7zip() {
  if (process.env.ELECTRON_BUILDER_7ZIP_PATH !== undefined) return null
  for (const candidate of SYSTEM_7ZIP_CANDIDATES) {
    if (await isFile(candidate)) return candidate
  }
  return null
}

function runBuilder(args, env) {
  return new Promise((resolve) => {
    /*
     * `shell: true` と引数配列の併用は Node が非推奨としている (DEP0190)。
     * 引数はこのファイル内のリテラルと CLI 引数だけである。
     */
    const child = spawn(['electron-builder', ...args].join(' '), {
      shell: true,
      stdio: 'inherit',
      windowsHide: true,
      env
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

/** ディレクトリ配下のファイル数と総サイズ。`cacheState.js` の `computeCacheMetadata` と同じ数え方。 */
async function computeMetadata(dir) {
  let fileCount = 0
  let extractedSize = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      fileCount++
      if (entry.isFile()) extractedSize += (await stat(full)).size
    }
  }
  return { fileCount, extractedSize }
}

/** 走査の窓が閉じるまで待ちながら rename する。 */
async function promoteWithRetry(tmpDir, finalDir) {
  for (let attempt = 1; ; attempt++) {
    try {
      await rm(finalDir, { recursive: true, force: true })
      await rename(tmpDir, finalDir)
      return attempt
    } catch (error) {
      if (attempt >= 20) throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }
}

/**
 * 取り残された `<dir>.tmp` を昇格させ、状態ファイルを `complete` にする。
 * 昇格した件数を返す。**0 件なら rename 以外の理由で失敗している。**
 */
async function sealLeftoverToolsets(root) {
  let sealed = 0
  let releases
  try {
    releases = await readdir(root, { withFileTypes: true })
  } catch {
    return 0
  }

  for (const release of releases) {
    // `downloads/` はアーカイブ置き場であってツールセットの展開先ではない。
    if (!release.isDirectory() || release.name === 'downloads') continue
    const dir = path.join(root, release.name)
    for (const entry of await readdir(dir)) {
      if (!entry.endsWith('.tmp')) continue
      const tmpDir = path.join(dir, entry)
      if (!(await stat(tmpDir)).isDirectory()) continue

      const finalDir = tmpDir.slice(0, -'.tmp'.length)
      const attempts = await promoteWithRetry(tmpDir, finalDir)
      const metadata = await computeMetadata(finalDir)
      await writeFile(
        `${finalDir}.state`,
        JSON.stringify(
          { version: 1, state: 'complete', timestamp: Date.now(), ...metadata },
          null,
          2
        ),
        'utf-8'
      )
      console.log(
        `[package] 展開済みツールセットを昇格: ${path.basename(finalDir)} ` +
          `(rename ${attempts} 回目で成功 / ${metadata.fileCount} ファイル)`
      )
      sealed++
    }
  }
  return sealed
}

/** ツールセットの昇格で進める余地がある限り再実行する。1 回の失敗で 1 ツールセット進む。 */
const MAX_ATTEMPTS = 6

async function main() {
  const args = process.argv.slice(2)
  const env = { ...process.env }

  const system7zip = await resolveSystem7zip()
  if (system7zip !== null) {
    env.ELECTRON_BUILDER_7ZIP_PATH = system7zip
    console.log(`[package] 同梱の 7-Zip ではなくホストの 7-Zip を使う: ${system7zip}`)
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = await runBuilder(args, env)
    if (code === 0) process.exit(0)

    const sealed = await sealLeftoverToolsets(cacheRoot())
    if (sealed === 0) {
      console.error('[package] 昇格できるツールセットが無い。rename 以外の理由で失敗している')
      process.exit(code)
    }
    console.log(`[package] ${sealed} 件を昇格させて再実行する (${attempt}/${MAX_ATTEMPTS})`)
  }

  console.error(`[package] ${MAX_ATTEMPTS} 回試しても完走しなかった`)
  process.exit(1)
}

await main()
