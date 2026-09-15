import { describe, expect, it } from 'vitest'

import { makeHostPath } from '@domain/runtime/path-types'
import { folderKey } from '@domain/workspace/folder'

/**
 * テスト基盤そのものの検証 (SH-016)。
 *
 * 確かめるのは 2 点だけである。
 * - `domain` が**モックゼロで**テストできること (I/O を持たないという前提の帰結)
 * - `@domain` 別名が node 環境の project で解決されること
 *
 * 個々の振る舞いのテストは BE-040 / BE-050 などが受け持つ。ここはその前提を守る回帰テスト。
 */
describe('node 環境のテスト基盤', () => {
  it('domain の純粋関数をモックなしで呼べる', () => {
    const result = makeHostPath('c:\\dev\\closta\\')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path.value).toBe('C:\\dev\\closta')
    expect(result.path.namespace).toBe('host')
  })

  it('domain の別名 (@domain) が解決される', () => {
    expect(typeof folderKey).toBe('function')
  })
})
