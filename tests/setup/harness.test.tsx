import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CAPABILITY_KEY } from '@domain/capability'

import { installCapability } from '../../src/renderer/src/test-support/capability'

/**
 * renderer 単体テスト基盤の検証 (SH-016)。
 *
 * 確かめるのは 2 点だけである。
 * - **preload をスタブすれば** Electron を起動せず画面を検証できること
 * - **未スタブのメソッドは失敗すること** — 既定で空の結果を返す基盤だと
 *   配線し忘れと「本当に空」が区別できず、テストが通るのに画面が動かない状態を作る
 *
 * 画面ごとのテストは FE-032 が受け持つ。ここはその前提を守る回帰テスト。
 */

function ShowsRuntimeCount({ count }: { count: number }): React.JSX.Element {
  return <p>{`ランタイム ${count} 件`}</p>
}

describe('renderer 環境のテスト基盤', () => {
  it('スタブした capability が window に載る', () => {
    const capability = installCapability({
      listRuntimes: async () => ({ runtimes: [], enumerationIssues: [] })
    })

    expect(window[CAPABILITY_KEY]).toBe(capability)
  })

  it('未スタブのメソッドを呼ぶと失敗する', async () => {
    const capability = installCapability()

    await expect(capability.listFolders()).rejects.toThrow('listFolders')
  })

  it('jsdom 上で React コンポーネントを描画できる', () => {
    render(<ShowsRuntimeCount count={1} />)

    expect(screen.getByText('ランタイム 1 件')).toBeInTheDocument()
  })
})
