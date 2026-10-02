import { createLineAssembler } from './protocol'

/**
 * 経路が解釈せずに運ぶ本文 (X-5)。セッションスレッドが `JSON.stringify` した `SessionEvent`。
 * **transport (列挙と共有) に置く** — supervisor 専用のモジュールに依存しないため。`supervisor-protocol.ts` が再 export する。
 */
export type OpaqueBody = string & { readonly __opaqueBody: unique symbol }

/**
 * 行のやり取りの経路 (AD-030 §5)。
 *
 * **本体は経路を知らない。** 本体は「行を読み、行を書く」だけであり、
 * どちらの経路に載っているかを見ない。
 *
 * **経路が 2 つある理由は Electron の制約である。**
 * `utilityProcess` は標準入力を支えていない (`ForkOptions.stdio` の説明に
 * 「`stdin` を `ignore` 以外に設定するのは非対応であり、エラーになる」と明記されており、
 * `UtilityProcess` に `stdin` のメンバも無い)。
 * 常駐して要求を受けるには `parentPort` を使うほかない。
 *
 * **選択をこの 1 モジュールに閉じる** ([AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md)
 * の Consequences が前もって許した形)。
 * 本体に `parentPort` を書くと、**単独起動できる形が崩れたことに気付けない** —
 * `parentPort` は import を伴わないため ESLint にも依存グラフにも現れない。
 *
 * **標準入出力側が単独起動の経路である** (Principle VII / SH-094)。
 * `node <entry>` に要求の行を流せば応答が返る。
 * この経路を消さないことが、AD-010 の「Electron を立てずにテストできる」を保っている。
 */

export interface Transport {
  /** 1 行届いたときに呼ばれる。 */
  onLine(listener: (line: string) => void): void
  /**
   * 1 行届いたときに、そのメッセージに添えられた port と一緒に呼ばれる (X-5 / supervisor 用)。
   * 標準入出力側の `ports` は常に空 (port を運べない)。
   */
  onMessage(listener: (line: string, ports: readonly BodyPortLike[]) => void): void
  /** 1 行送る。 */
  write(line: string): void
  /** 相手がいなくなったときに呼ばれる。**孤児として残らないための唯一の合図である。** */
  onClosed(listener: () => void): void
  /**
   * 起動要求を受けたときの**本文の出口**を作る (X-5 / AD-043 Decision 1・2)。
   *
   * **経路ごとの違いはここに閉じる** — 呼び出し側 (supervisor の本体) は経路を知らない (AD-030 §5)。
   * - `parentPort` 側: 添えられた port がちょうど 1 本ならその port へ送る出口を返し、無ければ `null` (本文を
   *   main に流す経路を作らないため、port の無い起動は拒否させる。FR-003)
   * - 標準入出力側: 本文を `toLine(payload)` の 1 行にして書く出口を返す (単独起動の経路。FR-001)
   */
  openBodySink(
    ports: readonly BodyPortLike[],
    toLine: (payload: OpaqueBody) => string
  ): BodySink | null
}

/** 本文の port の最小の形 (送信専用。受信 listener は登録しない — 一方向。AD-036 §2)。 */
export interface BodyPortLike {
  postMessage(message: unknown): void
  close?: () => void
}

/** 1 セッション分の本文の出口。 */
export interface BodySink {
  post(payload: OpaqueBody): void
  close(): void
}

/**
 * `parentPort` の最小の形。
 *
 * **`electron` を import しない** (`agents` は禁止。AD-023 §8 / FR-045)。
 * 構造だけを書き、グローバルの `process` から取り出す。
 */
export interface ParentPortLike {
  on(
    event: 'message',
    listener: (message: { data: unknown; ports?: readonly BodyPortLike[] }) => void
  ): void
  postMessage(message: unknown): void
  start?: () => void
}

function parentPortOf(): ParentPortLike | null {
  // platform-ok: Electron の有無を見ているのであって OS 分岐ではない。
  const candidate = (process as unknown as { parentPort?: ParentPortLike }).parentPort
  return candidate ?? null
}

/**
 * 経路を選ぶ。
 *
 * **`parentPort` があればそれを使う。** Electron の utility process として
 * 起こされた場合であり、標準入力が使えない。
 */
export function createTransport(): Transport {
  const parentPort = parentPortOf()
  return parentPort === null ? stdioTransport() : parentPortTransport(parentPort)
}

/*
 * ── 以下 2 つを export している理由 ──────────────────────────
 *
 * **このファイルは `electron` を import していない。** import は `./protocol` だけであり、
 * `parentPort` は `process` から構造だけで取り出している。
 * つまり **Vitest の node 環境でそのまま読める** — 設定変更は要らない。
 *
 * **この点を取り違えていた。** AD-030 と `enumerator-spawner.ts` のコメントは
 * 「この形は単体テストの外にある」と書いたが、それが当てはまるのは
 * `enumerator-spawner.ts` (`electron` と仮想モジュールを import する) だけである。
 * **経路の選択と「受け取った経路で返す」という、実際に壊れた不変条件は、
 * テストできる状態で未検証のまま放置されていた** (code-gate iteration 1 / test track)。
 *
 * 経路ごとの振る舞いを直接確かめられるように公開する。
 * **本体は使わない** — 本体が呼ぶのは `createTransport()` だけである。
 */

export function stdioTransport(): Transport {
  const closed: (() => void)[] = []
  const write = (line: string): void => {
    process.stdout.write(`${line}\n`)
  }
  const onLine = (listener: (line: string) => void): void => {
    const assemble = createLineAssembler(listener)
    // platform-ok: stdio は OS 分岐ではなくプロセス間の規約である。
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => assemble(chunk))
    process.stdin.on('end', () => {
      for (const cb of closed) cb()
    })
  }
  return {
    onLine,
    onMessage(listener) {
      // 標準入出力は port を運べない。
      onLine((line) => listener(line, []))
    },
    write,
    onClosed(listener) {
      closed.push(listener)
    },
    openBodySink(_ports, toLine) {
      // 単独起動の経路: 本文は行に埋めて書く (FR-001 / SC-009)。
      return { post: (payload) => write(toLine(payload)), close: () => undefined }
    }
  }
}

export function parentPortTransport(port: ParentPortLike): Transport {
  const onMessage = (listener: (line: string, ports: readonly BodyPortLike[]) => void): void => {
    port.on('message', (message) => {
      /*
       * **1 メッセージ = 1 行とする。** 標準入出力側と同じ単位にしておくと、
       * 本体が経路の違いを見ないで済む。
       * 文字列でない値は無視する — 送り手は親だけであり、来たら形の誤りである。
       */
      if (typeof message.data === 'string') listener(message.data, message.ports ?? [])
    })
    port.start?.()
  }
  return {
    onLine(listener) {
      onMessage((line) => listener(line))
    },
    onMessage,
    openBodySink(ports) {
      // Electron 経路: 本文は port で renderer へ直送する。port が無ければ本文の出口を作らない (FR-003)。
      if (ports.length !== 1) return null
      const target = ports[0] as BodyPortLike
      return {
        post: (payload) => target.postMessage(payload),
        close: () => target.close?.()
      }
    },
    write(line) {
      port.postMessage(line)
    },
    onClosed() {
      /*
       * **`parentPort` には「閉じた」の合図が無い。**
       * utility process は親が消えると OS 側で終了するため、
       * ここで何もしないことが正しい (孤児は Electron が回収する)。
       * 標準入出力側は `end` で知れるので、そちらだけが実装を持つ。
       */
    }
  }
}
