import { describe, expect, it } from 'vitest'

import { makeHostPath, makeRuntimePath } from '@domain/runtime/path-types'
import { wslNamespace } from '@domain/runtime/namespace'

import { folderKey, shouldSuggestUnregister, type WorkspaceFolder } from './folder'
import { findDuplicate, isUniqueId, isValidFolderId, makeFolderId } from './registry'

/**
 * パス正規化と重複判定のテスト (BE-040 / FR-016 / SC-013)。
 *
 * **モックゼロ。** `domain` は I/O を持たないので値を渡して戻り値を見るだけで足りる。
 */

function hostFolder(id: string, raw: string): WorkspaceFolder {
  const path = makeHostPath(raw)
  if (!path.ok) throw new Error(`テストの前提が壊れている: ${raw}`)
  return {
    id,
    location: { kind: 'windows' },
    path: path.path,
    displayName: 'x',
    registeredAt: 0
  }
}

function wslFolder(id: string, distro: string, raw: string): WorkspaceFolder {
  const path = makeRuntimePath(wslNamespace(distro), raw)
  if (!path.ok) throw new Error(`テストの前提が壊れている: ${raw}`)
  return {
    id,
    location: { kind: 'wsl', distroName: distro },
    path: path.path,
    displayName: 'x',
    registeredAt: 0
  }
}

describe('パスの正規化', () => {
  it('ドライブレターの大小差を同一視する', () => {
    expect(folderKey(hostFolder('a', 'c:\\dev\\x'))).toBe(folderKey(hostFolder('b', 'C:\\dev\\x')))
  })

  it('末尾セパレータの有無を同一視する', () => {
    expect(folderKey(hostFolder('a', 'C:\\dev\\x\\'))).toBe(
      folderKey(hostFolder('b', 'C:\\dev\\x'))
    )
  })

  it('ドライブルートの末尾セパレータは保つ', () => {
    const root = makeHostPath('C:\\')
    expect(root.ok).toBe(true)
    if (!root.ok) return
    expect(root.path.value).toBe('C:\\')
  })

  it('空白・日本語・非 ASCII を含むパスを保持する', () => {
    const cases = ['C:\\dev\\my project', 'C:\\開発\\プロジェクト', 'C:\\dev\\café-ñ']
    for (const raw of cases) {
      const path = makeHostPath(raw)
      expect(path.ok).toBe(true)
      if (!path.ok) continue
      expect(path.path.value).toBe(raw)
    }
  })

  it('POSIX 値も空白・日本語を保持する', () => {
    const path = makeRuntimePath(wslNamespace('Ubuntu'), '/home/u/私の プロジェクト')
    expect(path.ok).toBe(true)
    if (!path.ok) return
    expect(path.path.value).toBe('/home/u/私の プロジェクト')
  })
})

describe('重複判定', () => {
  it('同一の (所在, パス) を重複とみなす', () => {
    const existing = [hostFolder('wf_aaaaaaaa', 'C:\\dev\\x')]
    const hit = findDuplicate(existing, hostFolder('wf_bbbbbbbb', 'c:\\dev\\x\\'))

    expect(hit).not.toBeNull()
    expect(hit?.existing.id).toBe('wf_aaaaaaaa')
  })

  it('**同じパス文字列でも所在が違えば重複ではない**', () => {
    const existing = [wslFolder('wf_aaaaaaaa', 'Ubuntu', '/home/u/x')]
    expect(findDuplicate(existing, wslFolder('wf_bbbbbbbb', 'Debian', '/home/u/x'))).toBeNull()
  })

  it('所在 windows と所在 wsl を混同しない', () => {
    const existing = [hostFolder('wf_aaaaaaaa', 'C:\\dev\\x')]
    expect(findDuplicate(existing, wslFolder('wf_bbbbbbbb', 'Ubuntu', '/mnt/c/dev/x'))).toBeNull()
  })

  it('別のパスは重複ではない', () => {
    const existing = [hostFolder('wf_aaaaaaaa', 'C:\\dev\\x')]
    expect(findDuplicate(existing, hostFolder('wf_bbbbbbbb', 'C:\\dev\\y'))).toBeNull()
  })

  it('接頭辞が一致するだけのパスは重複ではない', () => {
    const existing = [hostFolder('wf_aaaaaaaa', 'C:\\dev\\x')]
    expect(findDuplicate(existing, hostFolder('wf_bbbbbbbb', 'C:\\dev\\xy'))).toBeNull()
  })
})

describe('識別子', () => {
  it('形式を満たす値だけを受け入れる', () => {
    expect(isValidFolderId('wf_0123456789ab')).toBe(true)
    expect(isValidFolderId('wf_short')).toBe(false)
    expect(isValidFolderId('folder_0123456789')).toBe(false)
    expect(isValidFolderId('wf_UPPERCASE1234')).toBe(false)
    expect(isValidFolderId(42)).toBe(false)
  })

  it('生成した識別子が形式を満たす', () => {
    const id = makeFolderId(() => 'abcdef0123456789abcdef0123456789')
    expect(isValidFolderId(id)).toBe(true)
  })

  it('乱数源が短すぎれば失敗させる (黙って短い識別子を作らない)', () => {
    expect(() => makeFolderId(() => 'abc')).toThrow()
  })

  it('一意性を判定する', () => {
    const folders = [hostFolder('wf_aaaaaaaa', 'C:\\dev\\x')]
    expect(isUniqueId(folders, 'wf_aaaaaaaa')).toBe(false)
    expect(isUniqueId(folders, 'wf_bbbbbbbb')).toBe(true)
  })
})

describe('解除を勧める表示 (FR-017 の 2 層)', () => {
  it('到達不可のときだけ勧める', () => {
    expect(shouldSuggestUnregister('unreachable')).toBe(true)
  })

  it('**一時的に解決できないときは勧めない** (毎日削除させることになる)', () => {
    expect(shouldSuggestUnregister('blocked')).toBe(false)
  })

  it('到達可能なときは勧めない', () => {
    expect(shouldSuggestUnregister('reachable')).toBe(false)
  })
})
