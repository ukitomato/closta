/**
 * 入力検証の述語と上限 (AD-023 §7 / FR-036)。
 *
 * **依存を持たない。** 標準モジュールも他の `domain` モジュールも import しない。
 * `ui` から `domain` への到達は型と純粋関数までと決めており (AD-025 §4)、
 * ここに依存が入ると `ui-not-to-core` の推移的到達で壊れる。
 *
 * ## なぜ 1 箇所に集めるか
 *
 * 同じ述語と上限が **IPC 境界 (`app`) と永続化境界 (`infra`) の両方**で要る。
 * 別々に書くと片方だけが変わり、**登録はできるが復元されないフォルダ**が生まれる。
 * SC-013 (再起動で登録内容がすべて復元される) が静かに崩れる形である。
 *
 * これは `domain/workspace/folder.ts` の `isNamespaceConsistent()` が
 * 「IPC 境界と永続化境界の双方がこれを呼ぶ。粒度を揃えないと片方だけ通過する」と
 * 書いているのと同じ理屈で、**同じ扱いを述語と上限にも広げたもの**である。
 *
 * 実際、移す前は次の状態だった。
 *
 * - `hasControlCharacter` が `app/validate.ts` と `infra/settings/folder-record.ts` に**同一実装**
 * - `MAX_DISPLAY_NAME_LENGTH` / `MAX_PATH_VALUE_LENGTH` / `MAX_DIR_ENTRIES` が各 2 箇所
 * - `app/validate.ts` の `MAX_DIR_ENTRIES` は**参照 0 件で死んでいた**
 *   (死んでいることに誰も気付けない形だった)
 */

/**
 * 制御文字を含むか。**NUL・C0・DEL・C1 を拒否する。**
 *
 * 表示名にもパスにも、制御文字が正当に入ることはない。
 * NUL はパス文字列の切り詰めに使われ、C1 は端末の制御列に化ける。
 */
export function hasControlCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0)!
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true
  }
  return false
}

/**
 * 表示名の長さ上限。
 *
 * ファイル名の一般的な上限に合わせてある。表示名はファイル名に由来する既定値を持つため、
 * ここを下回らせるとフォルダ名をそのまま既定値にできない場合が出る。
 */
export const MAX_DISPLAY_NAME_LENGTH = 255

/**
 * パス値の長さ上限。
 *
 * Linux の `PATH_MAX` に合わせてある。
 * **ホスト名前空間にもランタイム名前空間にも同じ値を使う** —
 * 名前空間ごとに変えると、変換した瞬間に片方でだけ通る値が生まれる。
 */
export const MAX_PATH_VALUE_LENGTH = 4096

/**
 * 1 ディレクトリから返す項目数の上限。
 *
 * 超えたものは列挙せず `too-many-entries` として扱う。
 * 上限が無いと、巨大なディレクトリ 1 つで IPC のペイロードと描画が破綻する。
 */
export const MAX_DIR_ENTRIES = 2000
