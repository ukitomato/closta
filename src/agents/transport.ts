import { createLineAssembler } from './protocol'

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
  /** 1 行送る。 */
  write(line: string): void
  /** 相手がいなくなったときに呼ばれる。**孤児として残らないための唯一の合図である。** */
  onClosed(listener: () => void): void
}

/**
 * `parentPort` の最小の形。
 *
 * **`electron` を import しない** (`agents` は禁止。AD-023 §8 / FR-045)。
 * 構造だけを書き、グローバルの `process` から取り出す。
 */
export interface ParentPortLike {
  on(event: 'message', listener: (message: { data: unknown }) => void): void
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
  return {
    onLine(listener) {
      const assemble = createLineAssembler(listener)
      // platform-ok: stdio は OS 分岐ではなくプロセス間の規約である。
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (chunk: string) => assemble(chunk))
      process.stdin.on('end', () => {
        for (const cb of closed) cb()
      })
    },
    write(line) {
      process.stdout.write(`${line}\n`)
    },
    onClosed(listener) {
      closed.push(listener)
    }
  }
}

export function parentPortTransport(port: ParentPortLike): Transport {
  return {
    onLine(listener) {
      port.on('message', (message) => {
        /*
         * **1 メッセージ = 1 行とする。** 標準入出力側と同じ単位にしておくと、
         * 本体が経路の違いを見ないで済む。
         * 文字列でない値は無視する — 送り手は親だけであり、来たら形の誤りである。
         */
        if (typeof message.data === 'string') listener(message.data)
      })
      port.start?.()
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
