import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAX_PROMPT_BYTES } from '@domain/validation'

import type { SessionRunState } from '@domain/session/run-state'

import {
  DEFAULT_MAX_QUEUE_ITEMS,
  classifyEnqueue,
  clearDraftText,
  emptyDraft,
  isBusyRunState,
  isSendableText,
  setDraftText
} from './composer-queue'

/**
 * composer-queue の純粋ヘルパの検証 (X-2)。
 * message queue の item ストアは assistant-ui native queue が持つため、ここは
 * 「送信/enqueue の可否判定 (FR-003 / R2-M-003 / R2-M-001)」と「下書き (FR-007)」だけを検証する。
 * assistant-ui / IPC 非依存の純 unit テスト。
 */

describe('classifyEnqueue (FR-003 / R2-M-003 / R2-M-001)', () => {
  it('有効なテキストは ok', () => {
    expect(classifyEnqueue('次の指示', 0)).toBe('ok')
  })

  it('空・空白のみは invalid (X-1 isValidPromptText と対称)', () => {
    expect(classifyEnqueue('', 0)).toBe('invalid')
    expect(classifyEnqueue('   ', 0)).toBe('invalid')
  })

  it('バイト長上限超過は invalid (dispatch 時の遅延失敗を作らない)', () => {
    const tooLong = 'あ'.repeat(MAX_PROMPT_BYTES) // 3 bytes/char で上限超過
    expect(classifyEnqueue(tooLong, 0)).toBe('invalid')
  })

  it('件数上限到達は full (最古破棄しない)', () => {
    expect(classifyEnqueue('ok', DEFAULT_MAX_QUEUE_ITEMS)).toBe('full')
    expect(classifyEnqueue('ok', 3, 3)).toBe('full')
    expect(classifyEnqueue('ok', 2, 3)).toBe('ok')
  })

  it('invalid は full より優先される (空入力は件数に関わらず弾く)', () => {
    expect(classifyEnqueue('', DEFAULT_MAX_QUEUE_ITEMS)).toBe('invalid')
  })
})

describe('isBusyRunState (FR-004 / AC-3 / SC-003: 積むべき turn in-flight 状態)', () => {
  it('running と awaiting_permission は busy (承認待ち中の送信も積む)', () => {
    expect(isBusyRunState('running')).toBe(true)
    expect(isBusyRunState('awaiting_permission')).toBe(true)
  })

  it('launching は busy でない (初回プロンプトを即送信できないとデッドロックする)', () => {
    expect(isBusyRunState('launching')).toBe(false)
  })

  it('idle / interrupted / done / error は busy でない (次送信は新ターンとして即 dispatch)', () => {
    const notBusy: readonly SessionRunState[] = ['idle', 'interrupted', 'done', 'error']
    for (const s of notBusy) expect(isBusyRunState(s)).toBe(false)
  })
})

describe('isSendableText (driver.run のガード)', () => {
  it('空/空白は不可、有効は可', () => {
    expect(isSendableText('')).toBe(false)
    expect(isSendableText('  ')).toBe(false)
    expect(isSendableText('hi')).toBe(true)
  })
})

describe('draft (FR-007)', () => {
  it('setDraftText で保持、clearDraftText で空', () => {
    const s = setDraftText(emptyDraft, '書きかけ')
    expect(s.text).toBe('書きかけ')
    expect(clearDraftText().text).toBe('')
  })
})

describe('Principle V: 会話由来テキストをログに出さない (T032 / M-5)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('classifyEnqueue / draft 操作が console にテキストを出さない', () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {})
    ]
    const secret = 'ひみつの会話テキスト'
    // 各終端相当の判定・状態遷移を通す。
    classifyEnqueue(secret, 0)
    classifyEnqueue('', 0)
    classifyEnqueue(secret, DEFAULT_MAX_QUEUE_ITEMS)
    isSendableText(secret)
    setDraftText(emptyDraft, secret)
    clearDraftText()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
