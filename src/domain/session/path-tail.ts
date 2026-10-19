/**
 * パスの末尾の要素 (O-6 / 016 data-model §2「パスの末尾」。O-11 で renderer から domain へ移した)。
 *
 * **会話由来の本文の文字列の切り出しで、アプリのパスの値ではない。切った値を IPC・port の入力に戻さない (AD-049 Decision 5)。**
 * 名前空間を持たない本文 (会話由来の tool の入力・結果のパス) に使う。
 * ホスト OS やランタイムで切り方を変えない (`/` と `\` の両方を区切りとして扱う)。
 * `path-api` / `node:path` は使わない。
 *
 * 末尾の区切り (`/` と `\`) を除いてから、最後の要素を返す。除いた残りが空 (`/` だけなど) なら元の文字列を返す。
 */
export function pathTail(path: string): string {
  let end = path.length
  while (end > 0 && (path[end - 1] === '/' || path[end - 1] === '\\')) end -= 1
  if (end === 0) return path
  let start = end
  while (start > 0 && path[start - 1] !== '/' && path[start - 1] !== '\\') start -= 1
  return path.slice(start, end)
}
