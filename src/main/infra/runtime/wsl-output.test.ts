import { describe, expect, it } from 'vitest'

import {
  parseMountEntries,
  parseNames,
  parseProbeOutput,
  parseRunningNames,
  parseVerbose,
  toLines
} from './wsl-output'

/**
 * 列挙 3 系統の出力パーステスト (BE-020 / SC-002 / SC-011)。
 *
 * フィクスチャに含めるもの — **どれも実環境で起こる形である**。
 * UTF-16LE の取り違え / CRLF / 翻訳済みヘッダ / 既定マーカー /
 * 空白を含む名前 / 数字を含む名前。
 */

/** `WSL_UTF8=1` を付け忘れた場合に見える形。BOM と NUL が混ざる。 */
const AS_UTF16_MISREAD = '\uFEFFU\u0000b\u0000u\u0000n\u0000t\u0000u\u0000\r\n'

describe('toLines', () => {
  it('CRLF の復帰文字を落とす', () => {
    expect(toLines('a\r\nb\r\n')).toEqual(['a', 'b'])
  })

  it('空行を捨てる', () => {
    expect(toLines('a\r\n\r\n\r\nb\r\n')).toEqual(['a', 'b'])
  })

  it('BOM と NUL を落とす (UTF-16LE を誤読した形)', () => {
    expect(toLines(AS_UTF16_MISREAD)).toEqual(['Ubuntu'])
  })
})

describe('parseNames', () => {
  it('名前だけの列挙をそのまま名前として読む', () => {
    const stdout = 'Ubuntu-26.04\r\nDebian\r\nUbuntu 22.04 LTS\r\n'
    expect(parseNames(stdout)).toEqual(['Ubuntu-26.04', 'Debian', 'Ubuntu 22.04 LTS'])
  })

  it('空白を含む名前を分割しない', () => {
    expect(parseNames('My Distro\r\n')).toEqual(['My Distro'])
  })
})

describe('parseRunningNames', () => {
  it('実行中の名前の集合を返す', () => {
    const running = parseRunningNames('Ubuntu-26.04\r\nDebian\r\n')
    expect(running.has('Ubuntu-26.04')).toBe(true)
    expect(running.has('Debian')).toBe(true)
    expect(running.has('Alpine')).toBe(false)
  })
})

describe('parseVerbose', () => {
  const known = ['Ubuntu-26.04', 'Debian', 'Ubuntu 22.04 LTS']

  it('翻訳済みヘッダを読み飛ばし、既定マーカーとバージョンを読む', () => {
    const stdout =
      '  NAME               STATE           VERSION\r\n' +
      '* Ubuntu-26.04       Running         2\r\n' +
      '  Debian             Stopped         1\r\n'

    expect(parseVerbose(stdout, known)).toEqual([
      { name: 'Ubuntu-26.04', isDefault: true, version: 2 },
      { name: 'Debian', isDefault: false, version: 1 }
    ])
  })

  it('ヘッダが日本語でも読み飛ばす', () => {
    const stdout =
      '  NAME               状態            バージョン\r\n' +
      '* Debian             実行中          2\r\n'

    expect(parseVerbose(stdout, known)).toEqual([{ name: 'Debian', isDefault: true, version: 2 }])
  })

  it('名前に含まれる数字を版数として誤読しない', () => {
    // 「行内の最初の数値」で読むと `26` を版数にしてしまう。
    const stdout = '  NAME  STATE  VERSION\r\n* Ubuntu-26.04  Running  2\r\n'
    expect(parseVerbose(stdout, known)[0].version).toBe(2)
  })

  it('空白を含む名前を最長一致で切り出す', () => {
    const stdout = '  NAME  STATE  VERSION\r\n  Ubuntu 22.04 LTS  Running  2\r\n'
    expect(parseVerbose(stdout, known)).toEqual([
      { name: 'Ubuntu 22.04 LTS', isDefault: false, version: 2 }
    ])
  })

  it('版数が読めない行は null にする', () => {
    const stdout = '  NAME  STATE  VERSION\r\n  Debian  Stopped\r\n'
    expect(parseVerbose(stdout, known)[0].version).toBeNull()
  })

  it('既知でない名前の行は攻めて解釈せず落とす', () => {
    const stdout = '  NAME  STATE  VERSION\r\n  Unknown  Running  2\r\n'
    expect(parseVerbose(stdout, known)).toEqual([])
  })

  it('状態列の文字列を読まない (ロケール依存のため)', () => {
    // 状態が何であっても結果に現れないことを、同じ入力の 2 言語版で確かめる。
    const en = '  NAME  STATE  VERSION\r\n  Debian  Stopped  2\r\n'
    const ja = '  NAME  状態  バージョン\r\n  Debian  停止済み  2\r\n'
    expect(parseVerbose(en, known)).toEqual(parseVerbose(ja, known))
  })
})

/* ── probe 出力 ──────────────────────────────────────────────────────── */

const PROBE_OK = [
  'bwrap=/usr/bin/bwrap',
  'socat=/usr/bin/socat',
  'userns_restrict_readable=no',
  'userns_restrict=',
  'userns_create=ok',
  'mounts_begin=1',
  'C:\\134 /mnt/c 9p rw,noatime,aname=drvfs;path=C:\\134;uid=1000 0 0',
  'mounts_end=1',
  'done=1'
].join('\r\n')

describe('parseProbeOutput', () => {
  it('key=value とマウントブロックを分けて読む', () => {
    const result = parseProbeOutput(PROBE_OK)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.output.values.get('bwrap')).toBe('/usr/bin/bwrap')
    expect(result.output.mountLines).toHaveLength(1)
  })

  it('完了の標識が無ければ失敗とする', () => {
    // **途中で失敗しても前半だけ出力された状態で正常終了しうる** (C-5)。
    const truncated = PROBE_OK.split('\r\ndone=1')[0]
    const result = parseProbeOutput(truncated)
    expect(result).toEqual({ ok: false, reason: 'incomplete' })
  })

  it('マウントブロックが閉じていなければ失敗とする', () => {
    const unclosed = ['mounts_begin=1', 'x / tmpfs rw 0 0', 'done=1'].join('\n')
    expect(parseProbeOutput(unclosed)).toEqual({ ok: false, reason: 'incomplete' })
  })

  it('期待する項目が欠けていれば失敗とする', () => {
    // **欠落を「問題なし」と解釈してはならない** (C-5)。
    const missing = PROBE_OK.split('\r\n')
      .filter((line) => !line.startsWith('socat='))
      .join('\r\n')
    expect(parseProbeOutput(missing)).toEqual({ ok: false, reason: 'missing-keys' })
  })

  it('値が空の項目は「存在する」として扱う (不在の表明である)', () => {
    const absent = PROBE_OK.replace('socat=/usr/bin/socat', 'socat=')
    const result = parseProbeOutput(absent)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.output.values.get('socat')).toBe('')
  })
})

describe('parseMountEntries', () => {
  it('マウントオプションの path= からドライブ対応を読む', () => {
    const entries = parseMountEntries([
      'C:\\134 /mnt/c 9p rw,noatime,aname=drvfs;path=C:\\134;uid=1000 0 0'
    ])
    expect(entries).toEqual([{ hostPrefix: 'C:\\', mountPoint: '/mnt/c' }])
  })

  it('非既定のマウント位置でも読める (位置を決め打ちしない)', () => {
    const entries = parseMountEntries(['D:\\134 /windows/d 9p rw,aname=drvfs;path=D:\\134 0 0'])
    expect(entries).toEqual([{ hostPrefix: 'D:\\', mountPoint: '/windows/d' }])
  })

  it('ファイルシステム種別で絞らない (未知の種別でも読む)', () => {
    const entries = parseMountEntries(['C:\\134 /mnt/c virtiofs rw,path=C:\\134 0 0'])
    expect(entries).toEqual([{ hostPrefix: 'C:\\', mountPoint: '/mnt/c' }])
  })

  it('path= を持たない行は無視する', () => {
    expect(parseMountEntries(['none /run tmpfs rw,nosuid 0 0'])).toEqual([])
  })

  it('ドライブレター形式でない path= は無視する (ネットワーク共有など)', () => {
    const entries = parseMountEntries([
      '\\134\\134srv\\134share /mnt/net 9p rw,aname=drvfs;path=\\134\\134srv\\134share 0 0'
    ])
    expect(entries).toEqual([])
  })

  it('8 進エスケープを復号し、空白を含むマウント位置を読む', () => {
    const entries = parseMountEntries([
      'E:\\134 /mnt/my\\040drive 9p rw,aname=drvfs;path=E:\\134 0 0'
    ])
    expect(entries).toEqual([{ hostPrefix: 'E:\\', mountPoint: '/mnt/my drive' }])
  })

  it('ドライブレターを大文字へ正規化する', () => {
    const entries = parseMountEntries(['c:\\134 /mnt/c 9p rw,path=c:\\134 0 0'])
    expect(entries[0].hostPrefix).toBe('C:\\')
  })

  it('接頭辞が互いに前方一致するマウント位置を共存させる', () => {
    const entries = parseMountEntries([
      'C:\\134 /mnt/c 9p rw,path=C:\\134 0 0',
      'D:\\134 /mnt/cdrom 9p rw,path=D:\\134 0 0'
    ])
    expect(entries).toEqual([
      { hostPrefix: 'C:\\', mountPoint: '/mnt/c' },
      { hostPrefix: 'D:\\', mountPoint: '/mnt/cdrom' }
    ])
  })
})
