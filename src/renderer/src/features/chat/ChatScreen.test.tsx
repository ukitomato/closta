import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { ChatScreen } from './ChatScreen'

/**
 * composer の送信経路が閉じていることの回帰テスト
 * (Constitution Principle VIII / [AD-024](docs/decisions/0024-constitution-verification-paths.md) #18)。
 *
 * **なぜ「composer が無い」ではなく「送信経路を閉じた」を確かめるのか。**
 * R-1 の `ChatScreen` は `Thread` を mount するので composer は **描画される**。
 * Principle VIII の Automated 検証 (A) を R-1 で載せない根拠は
 * 「対象が無い」ことではなく「`isDisabled: true` が送信経路を閉じている」ことである。
 * その前提が退行で崩れると、**検証していない送信経路**が黙って復活する —
 * `bad_pattern_grep` は送信が `@assistant-ui/react` の内側にあるため 0 件を返し続け、
 * 退行を示さない。ここがその唯一の番人である。
 *
 * R-2 で E2E 基盤と IME テストを載せて composer を開けるとき、本ファイルは
 * 「送信されないこと」から「変換確定の Enter で送信されないこと」に書き換える。
 */

describe('ChatScreen の composer', () => {
  it('composer は描画されるが入力が無効である', async () => {
    render(<ChatScreen />)

    // 描画されること自体を確かめる。「composer が無い」は事実ではない
    const input = await screen.findByLabelText('Message input')

    expect(input).toBeDisabled()
  })

  it('変換確定直後の Enter が送信経路に届かない', async () => {
    render(<ChatScreen />)
    const input = await screen.findByLabelText('Message input')

    fireEvent.compositionStart(input)
    fireEvent.compositionEnd(input, { data: 'にほんご' })

    /*
     * `onNew` は到達時に throw する (未接続のまま送信できる状態を黙らせないため)。
     * したがって送信経路に届けば、この keyDown が例外として現れる。
     */
    expect(() => fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).not.toThrow()
    expect(screen.queryByText('にほんご')).not.toBeInTheDocument()
  })
})
