import { describe, expect, it } from 'vitest'

import { LAUNCH_FAILURE_REASONS, type LaunchFailureReason } from '@domain/session/agent-session'
import type { LiveSettingBlocker } from '@domain/session/live-settings'

import {
  attentionAnnouncement,
  isReloginFailure,
  launchFailureLabel,
  launchFailureShortLabel,
  launchRejectLabel,
  previousFailureLabel,
  runStateLabel,
  LIVE_SETTING_LABELS
} from './labels'

/**
 * V-11 (provider-error) の UI 側検証 (実機 logout の代替。非破壊)。
 * 「認証エラーが理由つきで示され、再ログイン導線が出る」ことをラベル純関数で固める。
 */
describe('labels — V-11 provider-error の理由表示と再ログイン導線', () => {
  it('provider-error は再ログイン導線を出す (他は再起動導線)', () => {
    expect(isReloginFailure('provider-error')).toBe(true)
    expect(isReloginFailure('stream-protocol-error')).toBe(false)
    expect(isReloginFailure('process-crashed')).toBe(false)
    expect(isReloginFailure('launch-failed')).toBe(false)
    expect(isReloginFailure(null)).toBe(false)
  })

  it('provider-error の訳文は認証/接続を案内する (空でない)', () => {
    const label = launchFailureLabel('provider-error')
    expect(label.length).toBeGreaterThan(0)
    expect(label).toContain('認証')
  })

  it('全 LaunchFailureReason (19 種) に非空の全文と短い理由がある (黙って空表示にならない)', () => {
    const reasons: LaunchFailureReason[] = [
      'distro-not-running',
      'not-verified-running',
      'distro-mismatch',
      'claude-not-found',
      'launch-failed',
      'process-crashed',
      'stream-protocol-error',
      'provider-error',
      'interrupt-unavailable',
      'supervisor-exited',
      'max-turns',
      'max-budget',
      'structured-output-retries',
      'execution-error',
      'auth-failed',
      'billing',
      'rate-limited',
      'api-error',
      'resume-failed'
    ]
    expect(reasons).toHaveLength(19)
    expect([...reasons].sort()).toEqual([...LAUNCH_FAILURE_REASONS].sort())
    for (const r of reasons) {
      expect(launchFailureLabel(r).length).toBeGreaterThan(0)
      expect(launchFailureShortLabel(r).length).toBeGreaterThan(0)
    }
  })

  it('調停由来 (session-limit / shutting-down / unknown-target) も訳文を持つ (X-5 / FE-004)', () => {
    expect(launchRejectLabel('session-limit')).toContain('10 件')
    expect(launchRejectLabel('shutting-down').length).toBeGreaterThan(0)
    expect(launchRejectLabel('unknown-target').length).toBeGreaterThan(0)
  })

  it('runState ラベルは launching と running を区別する', () => {
    expect(runStateLabel('launching')).not.toBe(runStateLabel('running'))
  })
})

/**
 * O-4 FE-010 — ターンの失敗の理由の文言と再ログインの導線 (014 data-model §1 / §5。spec FR-002 / SC-001)。
 */
describe('labels — ターンの失敗の理由 (O-4)', () => {
  it('resume-failed は再ログインの導線を出さず、文言は data-model §7 のとおり (X-9)', () => {
    expect(isReloginFailure('resume-failed')).toBe(false)
    expect(launchFailureShortLabel('resume-failed')).toBe('再開できませんでした')
    expect(launchFailureLabel('resume-failed')).toBe(
      '会話を再開できませんでした。会話の記録が見つからない・読めない、または再開した会話が安全でない権限モードで起きました。'
    )
  })

  it('再ログインの導線は auth-failed と provider-error だけ (19 理由の真偽)', () => {
    const relogin = new Set<LaunchFailureReason>(['auth-failed', 'provider-error'])
    for (const reason of LAUNCH_FAILURE_REASONS) {
      expect(isReloginFailure(reason)).toBe(relogin.has(reason))
    }
    expect(isReloginFailure(null)).toBe(false)
  })

  it('8 つの理由の全文と短い理由は data-model §5 のとおり', () => {
    const expected: ReadonlyArray<readonly [LaunchFailureReason, string, string]> = [
      ['max-turns', 'ターン数の上限に達したため止まりました。', 'ターン上限'],
      ['max-budget', '費用の上限に達したため止まりました。', '費用上限'],
      [
        'structured-output-retries',
        '構造化出力の再試行の上限に達したため止まりました。',
        '出力再試行上限'
      ],
      [
        'execution-error',
        '実行中にエラーが起きました。ログイン状態を確かめてから、起動し直してください。',
        '実行エラー'
      ],
      [
        'auth-failed',
        '認証または権限のエラーです。ログイン状態や API キー、組織の設定を確かめてください。',
        '認証エラー'
      ],
      [
        'billing',
        '請求またはアカウントの問題で止まりました。クレジットとアカウントの状態を確かめてください。',
        '請求エラー'
      ],
      [
        'rate-limited',
        'レート制限のため止まりました。しばらく待ってから起動し直してください。',
        'レート制限'
      ],
      [
        'api-error',
        'API がエラーを返しました。ログイン状態を確かめ、しばらく待ってから起動し直してください。',
        'API エラー'
      ]
    ]
    for (const [reason, full, short] of expected) {
      expect(launchFailureLabel(reason)).toBe(full)
      expect(launchFailureShortLabel(reason)).toBe(short)
    }
  })

  it('provider-error の文言は変えない', () => {
    expect(launchFailureLabel('provider-error')).toBe(
      'Provider の認証/接続でエラーが発生しました。ログイン状態やクレジットを確認してください。'
    )
  })

  it('全文に HTTP の状態の数を入れない', () => {
    for (const reason of LAUNCH_FAILURE_REASONS) {
      expect(launchFailureLabel(reason)).not.toMatch(/\b(401|403|429|5\d\d)\b/)
    }
  })

  it('起動ダイアログに戻ったときの previousFailureLabel が同じ全文を出す', () => {
    for (const reason of LAUNCH_FAILURE_REASONS) {
      expect(previousFailureLabel(reason)).toContain(launchFailureLabel(reason))
    }
  })
})

/**
 * O-1 FR-004 の読み上げの文 (O-4 FR-018 (2) で `session-view.ts` の導出から分けた)。名前の組は
 * `attentionTransitions` が返し、文はここで組む。
 */
describe('attentionAnnouncement (O-1 FR-004)', () => {
  const failed = (
    name: string | null,
    reason: LaunchFailureReason | null = null
  ): { name: string | null; reason: LaunchFailureReason | null } => ({ name, reason })

  it('承認待ち・失敗に入ったものをそれぞれの文にする', () => {
    expect(attentionAnnouncement(['案件A'], [])).toBe('案件A: 承認待ちになりました。')
    expect(attentionAnnouncement([], [failed('案件A')])).toBe('案件A: 失敗しました。')
  })

  it('同じ更新の複数は 1 つの文にまとめる', () => {
    expect(attentionAnnouncement(['案件A', '案件B'], [])).toBe(
      '案件A、案件B: 承認待ちになりました。'
    )
    expect(attentionAnnouncement(['案件A'], [failed('案件B')])).toBe(
      '案件A: 承認待ちになりました。 案件B: 失敗しました。'
    )
  })

  it('表示名が引けない (null・空) ときも文が壊れない', () => {
    expect(attentionAnnouncement([null], [])).toBe(
      '名前を取得できないセッション: 承認待ちになりました。'
    )
    expect(attentionAnnouncement([], [failed('')])).toBe(
      '名前を取得できないセッション: 失敗しました。'
    )
  })

  it('失敗には行と同じ短い理由を添える (O-4 US-1 AC5 / 014 data-model §5)', () => {
    for (const reason of LAUNCH_FAILURE_REASONS) {
      if (reason === 'provider-error') continue
      expect(attentionAnnouncement([], [failed('案件A', reason)])).toBe(
        `案件A: 失敗しました (${launchFailureShortLabel(reason)})。`
      )
    }
  })

  it('汎用の provider-error と理由が無いものは理由を添えない', () => {
    expect(attentionAnnouncement([], [failed('案件A', 'provider-error')])).toBe(
      '案件A: 失敗しました。'
    )
    expect(attentionAnnouncement([], [failed('案件A', null)])).toBe('案件A: 失敗しました。')
  })

  it('同じ理由は名前をつないで 1 文、違う理由は最初に出た順の別の文にする', () => {
    expect(
      attentionAnnouncement(
        ['案件C'],
        [
          failed('案件A', 'rate-limited'),
          failed('案件B', 'auth-failed'),
          failed('案件D', 'rate-limited'),
          failed('案件E', 'provider-error'),
          failed(null, null)
        ]
      )
    ).toBe(
      '案件C: 承認待ちになりました。 案件A、案件D: 失敗しました (レート制限)。 案件B: 失敗しました (認証エラー)。 案件E、名前を取得できないセッション: 失敗しました。'
    )
  })
})

describe('LIVE_SETTING_LABELS (023 FE-001)', () => {
  it('blocker の理由が LiveSettingBlocker の全値を網羅する', () => {
    const blockers: LiveSettingBlocker[] = [
      'not-running',
      'not-ready',
      'busy',
      'no-conversation',
      'turn-running'
    ]
    expect(Object.keys(LIVE_SETTING_LABELS.blocker).sort()).toEqual([...blockers].sort())
    for (const b of blockers) expect(LIVE_SETTING_LABELS.blocker[b].length).toBeGreaterThan(0)
  })

  it('失敗の文言は 3 種類の kind を網羅する', () => {
    expect(Object.keys(LIVE_SETTING_LABELS.failure).sort()).toEqual([
      'model',
      'name',
      'permission-mode'
    ])
  })
})
