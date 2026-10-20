import { resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

import {
  collectInputProbe,
  INPUT_DELAY_P95_MAX_MS,
  installInputProbe,
  LONG_TASK_MAX_MS,
  typeContinuously
} from '../e2e/support/input-probe'
// 起動の入口だけを使う (`launchApp` は `CLOSTA_E2E` を立てるので使わない)。
import { openLaunchDialog } from '../e2e/support/launch'

import { judgeRun, parseMinMessages } from './run-judgement'

/**
 * **実機計測** (O-1 SH-032 / FR-012 / SC-005)。charter KPI「並列時の滑らかさ」の実機側を、ビルドした実アプリと
 * 実 `claude` 10 本で測る。**CI では実行しない。agent は利用者の明示的な指示があるときだけ実行する。**
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `CI`・`CLOSTA_E2E` の設定、`CLOSTA_PERF_FOLDER` / `CLOSTA_PERF_RUNTIME` の未設定では **skip ではなく失敗**で止まる (計測していないのに緑に見える状態を作らない) | research R-07 |
 * | 起動の env から `CLOSTA_E2E` を取り除き、起動後に本物の composition であること (指定した作業フォルダ・ランタイムが選べる) を確かめる | design-gate R2 platform-boundary M-001 |
 * | 判定は一覧の `data-row-status` / `data-received-messages` だけを `page.evaluate` で読む (会話由来の文字列を assert・出力に使わない。locator の待機を使わず、失敗時の出力に要素の HTML を出さない)。`app.evaluate` を使わない | FR-012 / research R-07 |
 * | perf 自身は子プロセスを起こさない (Playwright 経由でアプリを起動するだけ) | plan「機械強制の変更」 |
 * | 承認カードには応答しない。承認待ちに入ったセッションがあった回は無効 | FR-012 / Principle III |
 * | 後始末は `afterEach` で行う (test 本体のタイムアウトでは本体の `finally` が動かない): 全セッションを強制終了 → `app.close()` → 期限を超えたら kill | design-gate R2 platform-boundary M-002 |
 * | 出力は spec SC-005 の許可リストの項目だけ (数値と理由キー)。env・本文を出さない。例外の文も理由キーと件数だけ | SC-005 / pr-gate R1 security L-002 |
 * | 回の判定 (下限の検証を含む) は `run-judgement.ts` の純関数 (Vitest で固定) | pr-gate R1 architecture M-002 |
 * | 後始末が kill に落ちたら `teardown=killed` を 1 行出す (WSL に `claude` が残っていないか `ps` で確かめる合図) | pr-gate R1 platform-boundary L-001 |
 */

const SESSIONS = 10
const WINDOW_MS = 30_000
/** 既定のプロンプト: 読み取り専用の tool を回数の上限つきで小刻みに繰り返させる (承認を要さない。research R-07)。 */
const DEFAULT_PROMPT =
  'このリポジトリのファイルを Glob で列挙し、Read で 1 ファイルずつ最大 80 ファイル読んでください。1 ファイル読むたびに、ファイル名と 1 行の要約を返してください。ファイルの変更やコマンドの実行はしないでください。'

let app: ElectronApplication | null = null

/** 一覧の状態と受信の累計 (会話由来の値を含まない)。 */
async function snapshot(page: Page): Promise<{ readonly statuses: string[]; readonly received: number }> {
  return page.evaluate(() => ({
    statuses: [...document.querySelectorAll('[data-row-status]')].map(
      (el) => el.getAttribute('data-row-status') ?? ''
    ),
    received: Number(
      document.querySelector('[data-received-messages]')?.getAttribute('data-received-messages') ??
        'NaN'
    )
  }))
}

/**
 * select の選択肢の表示名から位置を引く (作業フォルダは**表示名**、ランタイムはディストロ名。会話由来ではない)。
 * 見つからなければ、理由キーと件数だけを添えて失敗する (env の値と候補の表示名は出さない。表示名に顧客名・案件名が
 * 入りうる。pr-gate R1 security L-002)。
 */
async function optionIndex(
  page: Page,
  name: string,
  wanted: string,
  key: string
): Promise<{ readonly index: number; readonly text: string }> {
  const select = page.getByRole('combobox', { name })
  const read = (): Promise<string[]> =>
    select.evaluate((el) => [...(el as HTMLSelectElement).options].slice(1).map((o) => o.text))
  const matches = (t: string): boolean => t.toLowerCase().includes(wanted.toLowerCase())
  // 一覧は起動後に IPC で非同期に読み込まれる。目的の選択肢が出るまで待つ (出なければ候補を添えて失敗する)。
  let texts: string[] = []
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    texts = await read()
    if (texts.some(matches)) break
    await page.waitForTimeout(500)
  }
  // 完全一致を優先し、部分一致が 2 件以上なら曖昧として止める (意図しないランタイム・フォルダで測らない)。
  const exact = texts.findIndex((t) => t.toLowerCase() === wanted.toLowerCase())
  const partial = texts.flatMap((t, i) => (matches(t) ? [i] : []))
  if (exact < 0 && partial.length > 1)
    throw new Error(`${key.replace('not-found', 'ambiguous')}: matches=${partial.length}`)
  const index = exact >= 0 ? exact : (partial[0] ?? -1)
  if (index < 0) throw new Error(`${key}: options=${texts.length}`)
  return { index: index + 1, text: texts[index] ?? '' }
}

/** 起動する。無人で走らせるので、権限モードが既定 (`default`) であることを起動の直前に確かめる (Principle III)。 */
async function pressLaunch(page: Page): Promise<void> {
  const mode = await page.getByRole('combobox', { name: '権限モード' }).inputValue()
  if (mode !== 'default') throw new Error('permission-mode-not-default')
  await page.getByRole('button', { name: '起動', exact: true }).click()
  await page.getByRole('textbox', { name: 'メッセージ', exact: true }).waitFor({ timeout: 60_000 })
}

/** 1 本起動する。選んだモデルの表示名を返す (計測条件として記録する)。 */
async function launchOne(
  page: Page,
  folder: string,
  runtime: string,
  provider: string | undefined,
  model: string | undefined
): Promise<string> {
  // 本物の composition であること: 指定した作業フォルダ・ランタイムが選べる (E2E stub の seed では見つからない)。
  const f = await optionIndex(page, '作業フォルダ', folder, 'folder-not-found')
  await page.getByRole('combobox', { name: '作業フォルダ' }).selectOption({ index: f.index })
  const r = await optionIndex(page, 'ランタイム', runtime, 'runtime-not-found')
  if (r.text.includes('停止中')) throw new Error('runtime-stopped')
  await page.getByRole('combobox', { name: 'ランタイム', exact: true }).selectOption({ index: r.index })
  // モデルの選択肢は Provider のモデルカタログから出る (既定の Provider にはカタログが無い)。
  if (provider !== undefined && provider !== '') {
    const p = await optionIndex(page, 'Provider', provider, 'provider-not-found')
    await page.getByRole('combobox', { name: 'Provider' }).selectOption({ index: p.index })
  }
  if (model === undefined || model === '') {
    await pressLaunch(page)
    return 'default'
  }
  const m = await optionIndex(page, 'モデル', model, 'model-not-found').catch(async (error) => {
    // モデルを選ぶには Provider のモデルカタログが要る。選べる Provider の件数だけを添える (CLOSTA_PERF_PROVIDER で選ぶ)。
    const providers = await page
      .getByRole('combobox', { name: 'Provider' })
      .evaluate((el) => (el as HTMLSelectElement).options.length - 1)
    throw new Error(`${(error as Error).message} providers=${providers}`)
  })
  await page.getByRole('combobox', { name: 'モデル' }).selectOption({ index: m.index })
  await pressLaunch(page)
  return m.text
}

test.afterEach(async () => {
  // hook の期限は test の期限とは別に置く (全セッションの強制終了と close を待つ)。
  test.setTimeout(60_000)
  const current = app
  app = null
  if (current === null) return
  const page = current.windows()[0]
  try {
    // 全セッションを強制終了する (一覧の操作。行の中のボタンは状態に応じて出る)。
    if (page !== undefined) {
      await page.evaluate(() => {
        for (const button of document.querySelectorAll<HTMLButtonElement>(
          '[data-slot="aui_thread-list-item-actions"] button'
        )) {
          if (button.getAttribute('aria-label') === '強制終了' || button.textContent === '強制終了')
            button.click()
        }
      })
      await page.waitForTimeout(3_000)
    }
    await Promise.race([
      current.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('close-timeout')), 15_000))
    ])
  } catch {
    // kill は Electron の main の PID だけを終わらせる。utility process が起こした wsl.exe と WSL の中の `claude` が
    // 残りうるので、落ちたことを理由キーだけで出す (操作者は `ps` でディストロを確かめる。quickstart V-3)。
    console.log('[O-1 SC-005] teardown=killed')
    current.process().kill()
  }
})

test('実 claude 10 本が応答を流す中で、表示中のセッションの入力が滑らか (O-1 SC-005)', async () => {
  // 安全柵 (skip ではなく失敗で止める)。
  if (process.env.CI) throw new Error('refused: CI')
  if (process.env.CLOSTA_E2E !== undefined) throw new Error('refused: CLOSTA_E2E is set')
  const folder = process.env.CLOSTA_PERF_FOLDER
  const runtime = process.env.CLOSTA_PERF_RUNTIME
  if (folder === undefined || folder === '' || runtime === undefined || runtime === '')
    throw new Error('refused: CLOSTA_PERF_FOLDER / CLOSTA_PERF_RUNTIME are required')
  // 有効な回の下限 (窓の中のメッセージ数)。既定は 30 (当初の 100 は実 claude では届かなかった。利用者判断 2026-10-02)。
  const { minMessages, thresholdOverridden } = parseMinMessages(process.env.CLOSTA_PERF_MIN_MESSAGES)
  const prompt = process.env.CLOSTA_PERF_PROMPT ?? DEFAULT_PROMPT
  const promptId = process.env.CLOSTA_PERF_PROMPT === undefined ? 'default' : 'custom'
  // モデルの表示名の一部 (大文字小文字を区別しない)。未指定なら既定のモデル (Provider のカタログが要る。既定の Provider には無い)。
  const modelWanted = process.env.CLOSTA_PERF_MODEL
  let modelName = ''

  // `CLOSTA_E2E` を明示的に取り除く (環境に残っていると E2E stub の composition で起動してしまう)。
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[0] !== 'CLOSTA_E2E' && entry[1] !== undefined
    )
  )
  app = await electron.launch({ args: [resolve('out/main/index.js')], env })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // 先に 10 本を全部起動する (プロンプト待ちのまま)。1 本ずつ起動してすぐ送ると、先に起動したセッションが窓の前に
  // 進みすぎて、窓の途中で応答を終えてしまう (2・3 回目の実測で not-all-running)。
  // 起動ダイアログはサイドバーの「新規起動」から開く (O-7。E2E と同じ `openLaunchDialog`。locator はサイドバーに限る)。
  // 起動の受け付けでダイアログは閉じるので、毎回開き直す。
  for (let i = 0; i < SESSIONS; i += 1) {
    await openLaunchDialog(page)
    modelName = await launchOne(page, folder, runtime, process.env.CLOSTA_PERF_PROVIDER, modelWanted)
  }

  // 続けて 10 本にプロンプトを送る (行の選択はクリックを evaluate で送る。locator に本文を含む要素を掴ませない)。
  // 最後に送るのは最後の行なので、送り終えたときに表示中なのは計測で打鍵するセッションになる。
  const composer = page.getByRole('textbox', { name: 'メッセージ', exact: true })
  for (let i = 0; i < SESSIONS; i += 1) {
    await page.evaluate((index) => {
      document
        .querySelectorAll<HTMLElement>(
          '[data-testid="session-list"] [data-slot="aui_thread-list-item-trigger"]'
        )
        [index]?.click()
    }, i)
    await composer.waitFor()
    await composer.fill(prompt)
    await composer.press('Enter')
  }

  // 10 本が応答中になるまで待つ (状態の属性だけを読む)。
  await expect
    .poll(async () => (await snapshot(page)).statuses.filter((s) => s === 'running').length, {
      timeout: 180_000,
      intervals: [1_000]
    })
    .toBe(SESSIONS)

  // 行の切り替え・送信の直後の描画が落ち着いてから仕込む (打鍵中の滑らかさだけを測る。E2E も composer が出てから仕込む)。
  await composer.waitFor()
  await page.waitForTimeout(2_000)
  await installInputProbe(page)
  const start = await snapshot(page)
  await composer.focus()
  await typeContinuously(page, WINDOW_MS)
  const end = await snapshot(page)
  const result = await collectInputProbe(page)
  const size = await page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`)

  const runningAtStart = start.statuses.filter((s) => s === 'running').length
  const runningAtEnd = end.statuses.filter((s) => s === 'running').length
  const { messages, reason } = judgeRun({
    sessions: SESSIONS,
    runningAtStart,
    runningAtEnd,
    receivedAtStart: start.received,
    receivedAtEnd: end.received,
    minMessages
  })

  // 許可リストの項目だけを出す (spec SC-005)。
  const record = {
    composition: 'real',
    model: modelName,
    prompt: promptId,
    windowSize: size,
    messagesInWindow: messages,
    minMessages,
    thresholdOverridden,
    runningAtStart,
    runningAtEnd,
    valid: reason === null,
    invalidReason: reason,
    inputDelayP95Ms: Number(result.inputDelayP95.toFixed(1)),
    inputSamples: result.inputSamples,
    longTaskMaxMs: Number(result.longTaskMax.toFixed(1)),
    longTaskCount: result.longTaskCount
  }
  test.info().annotations.push({ type: 'O-1 SC-005', description: JSON.stringify(record) })
  console.log(`[O-1 SC-005] ${JSON.stringify(record)}`)

  expect(reason, 'この回は無効 (理由キーを記録して再計測する)').toBeNull()
  expect(result.inputSamples).toBeGreaterThan(50)
  expect(result.inputDelayP95).toBeLessThanOrEqual(INPUT_DELAY_P95_MAX_MS)
  expect(result.longTaskMax).toBeLessThan(LONG_TASK_MAX_MS)
})
