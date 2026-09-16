/**
 * 名前空間識別子 (data-model §1)。
 *
 * ランタイムの名前空間識別子は `RuntimeDescriptor.id` である。
 * `Win32Runtime` は `host`、`WslRuntime` は `wsl:<distroName>`。
 * UNC 経路は `unc:<distroName>` で、**ディストロごとに別の名前空間**である
 * (`\\wsl.localhost\<distro>\` がディストロごとに別のファイルシステムを指すため)。
 *
 * I-1 で `container:*`、OPT-mac で `direct:*` が増える。
 */

export type HostNamespaceId = 'host'
export type WslNamespaceId = `wsl:${string}`
export type UncNamespaceId = `unc:${string}`

export type NamespaceId = HostNamespaceId | WslNamespaceId | UncNamespaceId

/** ランタイムから見たパスの名前空間。`unc:` は `infra/fs` の内側に閉じるため含まない。 */
export type RuntimeNamespaceId = HostNamespaceId | WslNamespaceId

const HOST: HostNamespaceId = 'host'

/**
 * ディストロ名の文字種 (data-model §4)。
 *
 * この値は (a) プロセス起動の引数、(b) UNC パスの成分、(c) 名前空間識別子の
 * 3 箇所へ同時に流れ込む。「検出済みの名前に一致すること」は検出自身が出力元である以上
 * 恒真であり、文字種を何も制約しない。
 *
 * - 先頭の `-` を禁じるのはオプションとして解釈される経路を塞ぐため
 * - バックスラッシュを禁じるのは `wsl.exe` の引数処理がこれを消し (AD-015 §5)
 *   別の実在ディストロ名に一致しうるため
 * - `:` を禁じるのは名前空間識別子の区切りと衝突するため
 */
export function isValidDistroName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false
  if (name.startsWith('-')) return false
  for (const ch of name) {
    const code = ch.codePointAt(0)!
    // NUL と制御文字 (C0 / DEL / C1)
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return false
    if (ch === '\\' || ch === '/' || ch === ':') return false
  }
  return true
}

export function wslNamespace(distroName: string): WslNamespaceId {
  return `wsl:${distroName}`
}

export function uncNamespace(distroName: string): UncNamespaceId {
  return `unc:${distroName}`
}

export function isHostNamespace(id: NamespaceId): id is HostNamespaceId {
  return id === HOST
}

/**
 * 名前空間識別子からディストロ成分を取り出す。
 *
 * **本モジュールが `NamespaceId` の内部構造に触れてよい唯一の場所である。**
 * 他のモジュールは `isSameDistro()` を使い、文字列操作で接頭辞を剥がさない。
 * 剥がす実装は round 3 / 4 / 5 の gate が繰り返し塞いだ「境界での再 branding」と同じ形になる。
 */
function distroOf(id: NamespaceId): string | null {
  if (id === HOST) return null
  const sep = id.indexOf(':')
  if (sep < 0) return null
  const distro = id.slice(sep + 1)
  return distro.length > 0 ? distro : null
}

/**
 * 2 つの名前空間識別子が**同じディストロ**を指すかを判定する (data-model §7)。
 *
 * 種別 (`wsl:` / `unc:`) を問わず、ディストロ成分の**完全一致**で判定する。
 * `host` は常に偽。
 *
 * 境界を渡る値どうしは種別まで完全一致を要求する (`unc:<D>` を `wsl:<D>` として
 * 受け付けない)。本関数を使うのは `infra/fs` の入口だけであり、
 * そこは確認済みの値 (`wsl:<D>`) と UNC 値 (`unc:<D>`) という**種別が構造的に異なる**
 * 2 つを比較する唯一の経路である。
 *
 * **部分一致で書いてはならない** — `startsWith` で比較すると
 * `Ubuntu` について取った確認済みの値が `Ubuntu-26.04` への操作を通す。
 */
export function isSameDistro(a: NamespaceId, b: NamespaceId): boolean {
  const da = distroOf(a)
  const db = distroOf(b)
  if (da === null || db === null) return false
  return da === db
}

/** 名前空間識別子そのものの完全一致 (種別まで)。境界を渡る値に使う。 */
export function isSameNamespace(a: NamespaceId, b: NamespaceId): boolean {
  return a === b
}

/** `wsl:<D>` に対応する `unc:<D>` を返す。ディストロ以外の名前空間では `null`。 */
export function toUncNamespace(id: NamespaceId): UncNamespaceId | null {
  const distro = distroOf(id)
  return distro === null ? null : uncNamespace(distro)
}

/** `unc:<D>` に対応する `wsl:<D>` を返す。ディストロ以外の名前空間では `null`。 */
export function toWslNamespace(id: NamespaceId): WslNamespaceId | null {
  const distro = distroOf(id)
  return distro === null ? null : wslNamespace(distro)
}

/** 名前空間識別子に埋め込まれたディストロ名を返す (表示・照合の材料としてのみ使う)。 */
export function namespaceDistroName(id: NamespaceId): string | null {
  return distroOf(id)
}
