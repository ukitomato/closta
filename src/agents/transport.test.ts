import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createTransport,
  parentPortTransport,
  stdioTransport,
  type ParentPortLike
} from './transport'

/**
 * BE-024b — 行のやり取りの経路 (AD-030 §5 とその訂正)。
 *
 * **実機でしか出ない事故の再発を防ぐためのテストである。**
 * 子は**要求を受け取った経路で返す**。Electron 下では要求が `parentPort` に載るので
 * 応答も `parentPort` に載る。親が標準出力だけを購読していたため、
 * 要求は届いて応答だけが捨てられ、**全要求が上限時間に当たった** (先頭ページ 31,420 ms)。
 *
 * **この経路は Vitest で読める。** `transport.ts` の import は `./protocol` だけで、
 * `electron` は入っていない (`parentPort` は `process` から構造だけで取り出している)。
 * 「テスト不能な構造」ではなく「テストを書いていなかった穴」だった。
 */

/** `parentPort` の代役。**送られた行を記録する。** */
function fakePort(): {
  port: ParentPortLike
  sent: unknown[]
  started: number
  deliver: (data: unknown) => void
} {
  const sent: unknown[] = []
  const listeners: ((message: { data: unknown }) => void)[] = []
  let started = 0

  return {
    sent,
    get started() {
      return started
    },
    deliver(data) {
      for (const listener of listeners) listener({ data })
    },
    port: {
      on(_event, listener) {
        listeners.push(listener)
      },
      postMessage(message) {
        sent.push(message)
      },
      start() {
        started += 1
      }
    }
  }
}

/** `process.parentPort` を差し替える。**Electron の有無を模す唯一の方法である。** */
function withParentPort(port: ParentPortLike | undefined): void {
  const target = process as unknown as { parentPort?: ParentPortLike }
  if (port === undefined) delete target.parentPort
  else target.parentPort = port
}

afterEach(() => {
  withParentPort(undefined)
  vi.restoreAllMocks()
  process.stdin.removeAllListeners('data')
  process.stdin.removeAllListeners('end')
})

describe('createTransport — 経路の選択', () => {
  it('`process.parentPort` が無ければ標準入出力を使う (単独起動の経路。Principle VII / SH-094)', () => {
    withParentPort(undefined)
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    createTransport().write('{"kind":"ok"}')

    expect(write).toHaveBeenCalledWith('{"kind":"ok"}\n')
  })

  it('`process.parentPort` があればそれを使う', () => {
    const fake = fakePort()
    withParentPort(fake.port)

    createTransport().write('{"kind":"ok"}')

    expect(fake.sent).toEqual(['{"kind":"ok"}'])
  })

  it('**`parentPort` を選んだとき標準出力へは書かない**', () => {
    /*
     * これが壊れていた不変条件である。
     * 親が標準出力だけを購読していたので応答が 1 件も届かなかった。
     * 「どちらにも書く」で直すのではなく、**親が両方を購読する**ことで直している
     * (AD-030 §5 の訂正)。子は 1 つの経路だけを使う。
     */
    const fake = fakePort()
    withParentPort(fake.port)
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    createTransport().write('{"kind":"ok"}')

    expect(write).not.toHaveBeenCalled()
    expect(fake.sent).toEqual(['{"kind":"ok"}'])
  })

  it('要求を受け取った経路で返す (`parentPort` 側)', () => {
    const fake = fakePort()
    withParentPort(fake.port)
    const transport = createTransport()
    const lines: string[] = []

    transport.onLine((line) => {
      lines.push(line)
      transport.write(`echo:${line}`)
    })
    fake.deliver('req-1')

    expect(lines).toEqual(['req-1'])
    expect(fake.sent).toEqual(['echo:req-1'])
  })
})

describe('parentPortTransport', () => {
  it('1 メッセージを 1 行として渡す (行の組み立てをしない)', () => {
    const fake = fakePort()
    const lines: string[] = []

    parentPortTransport(fake.port).onLine((line) => lines.push(line))
    fake.deliver('a')
    fake.deliver('b')

    expect(lines).toEqual(['a', 'b'])
  })

  it('改行を含むメッセージも 1 行として渡す (単位は経路が決める)', () => {
    const fake = fakePort()
    const lines: string[] = []

    parentPortTransport(fake.port).onLine((line) => lines.push(line))
    fake.deliver('a\nb')

    expect(lines).toEqual(['a\nb'])
  })

  it.each([
    ['オブジェクト', { kind: 'ok' }],
    ['数値', 1],
    ['null', null],
    ['undefined', undefined]
  ])('文字列でない値を渡さない (%s)', (_label, value) => {
    const fake = fakePort()
    const lines: string[] = []

    parentPortTransport(fake.port).onLine((line) => lines.push(line))
    fake.deliver(value)

    expect(lines).toEqual([])
  })

  it('購読を始めるときに `start()` を呼ぶ', () => {
    const fake = fakePort()

    parentPortTransport(fake.port).onLine(() => {})

    expect(fake.started).toBe(1)
  })

  it('`start()` を持たない相手でも落ちない', () => {
    const sent: unknown[] = []
    const port: ParentPortLike = {
      on() {
        /* 購読は使わない。start() の不在だけを見るための代役である。 */
      },
      postMessage(message) {
        sent.push(message)
      }
    }

    expect(() => parentPortTransport(port).onLine(() => {})).not.toThrow()
  })

  it('**閉じたの合図を持たない** (utility process は親が消えると OS が回収する)', () => {
    const fake = fakePort()
    const closed = vi.fn()

    parentPortTransport(fake.port).onClosed(closed)

    expect(closed).not.toHaveBeenCalled()
  })
})

describe('stdioTransport', () => {
  it('書いた行に改行を付ける', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    stdioTransport().write('line')

    expect(write).toHaveBeenCalledWith('line\n')
  })

  it('チャンクを跨いだ 1 行を組み立てる', () => {
    const lines: string[] = []
    stdioTransport().onLine((line) => lines.push(line))

    process.stdin.emit('data', '{"a"')
    process.stdin.emit('data', ':1}\n')

    expect(lines).toEqual(['{"a":1}'])
  })

  it('改行が来るまで渡さない', () => {
    const lines: string[] = []
    stdioTransport().onLine((line) => lines.push(line))

    process.stdin.emit('data', 'incomplete')

    expect(lines).toEqual([])
  })

  it('**閉じたら合図する** (孤児として残らないための唯一の経路)', () => {
    const closed = vi.fn()
    const transport = stdioTransport()

    transport.onClosed(closed)
    transport.onLine(() => {})
    process.stdin.emit('end')

    expect(closed).toHaveBeenCalledTimes(1)
  })
})
