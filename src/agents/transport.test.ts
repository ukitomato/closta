import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OpaqueBody } from './transport'
import {
  createTransport,
  parentPortTransport,
  stdioTransport,
  type BodyPortLike,
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

describe('本文の出口と port の受け渡し (X-5 / BE-003。経路の違いは transport に閉じる)', () => {
  const body = (s: string): OpaqueBody => s as OpaqueBody

  it('parentPort 側は、メッセージに添えられた port を行と一緒に渡す', () => {
    const listeners: ((m: { data: unknown; ports?: readonly BodyPortLike[] }) => void)[] = []
    const port: ParentPortLike = {
      on: (_e, l) => listeners.push(l),
      postMessage: () => undefined
    }
    const bodyPort: BodyPortLike = { postMessage: vi.fn() }
    const got: [string, readonly BodyPortLike[]][] = []
    parentPortTransport(port).onMessage((line, ports) => got.push([line, ports]))
    for (const l of listeners) l({ data: 'launch', ports: [bodyPort] })
    expect(got).toEqual([['launch', [bodyPort]]])
  })

  it('parentPort 側の出口は、port がちょうど 1 本ならその port へ本文を送る', () => {
    const fake = fakePort()
    const bodyPort = { postMessage: vi.fn(), close: vi.fn() }
    const sink = parentPortTransport(fake.port).openBodySink([bodyPort], () => 'unused')
    sink?.post(body('{"kind":"state"}'))
    sink?.close()
    expect(bodyPort.postMessage).toHaveBeenCalledWith('{"kind":"state"}')
    expect(bodyPort.close).toHaveBeenCalled()
    // 本文を親 (main) へ書かない。
    expect(fake.sent).toEqual([])
  })

  it('parentPort 側で port が無い (または 2 本以上の) 起動には出口を作らない (本文が main を通る経路を作らない)', () => {
    const fake = fakePort()
    expect(parentPortTransport(fake.port).openBodySink([], () => 'line')).toBeNull()
    const p = { postMessage: vi.fn() }
    expect(parentPortTransport(fake.port).openBodySink([p, p], () => 'line')).toBeNull()
  })

  it('標準入出力側の onMessage は port を渡さない (常に空)', () => {
    const got: readonly BodyPortLike[][] = []
    stdioTransport().onMessage((_line, ports) => (got as BodyPortLike[][]).push([...ports]))
    process.stdin.emit('data', 'x\n')
    expect(got).toEqual([[]])
  })

  it('標準入出力側の出口は、本文を toLine の 1 行にして書く (単独起動の経路)', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const sink = stdioTransport().openBodySink([], (payload) => `EVENT ${payload}`)
    sink?.post(body('{}'))
    expect(write).toHaveBeenCalledWith('EVENT {}\n')
  })
})
