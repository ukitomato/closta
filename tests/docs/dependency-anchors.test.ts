import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { DEPENDENCY_DOC_ANCHORS } from '@domain/runtime/capabilities'

import { DEPENDENCY_DOC_PATH } from '../../src/renderer/src/features/runtime-list/labels'

/**
 * capabilities の導線が指すアンカーが実在することの検証 (FR-048 / quickstart V-7)。
 *
 * **不足依存の案内はコマンド文字列を UI に持たない** (FR-009)。
 * 代わりに導入手順文書のアンカーを指す。つまり**リンクが当たることが要件**である。
 *
 * 定数と文書は別ファイルなので、見出しを改名すると**リンクが黙って壊れる**。
 * lint も型検査もこれを見られない。ここで突き合わせる。
 *
 * `docAnchor` の値を個別に 2 つ列挙する形にしない —
 * 列挙すると、あとで増えた依存が拘束を外れる。**定数の全エントリを回す。**
 */

/** GitHub の見出しアンカー規則のうち、本文書に必要な範囲。 */
function headingAnchors(markdown: string): ReadonlySet<string> {
  const anchors = new Set<string>()
  for (const line of markdown.split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line)
    if (match === null) continue
    const slug = match[1]
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .split(' ')
      .join('-')
    anchors.add(slug)
  }
  return anchors
}

describe('不足依存の案内が指すアンカー', () => {
  it('導入手順文書が存在する', async () => {
    const markdown = await readFile(DEPENDENCY_DOC_PATH, 'utf8')
    expect(markdown.length).toBeGreaterThan(0)
  })

  it('DEPENDENCY_DOC_ANCHORS の全エントリが見出しとして実在する', async () => {
    const markdown = await readFile(DEPENDENCY_DOC_PATH, 'utf8')
    const anchors = headingAnchors(markdown)

    const entries = Object.entries(DEPENDENCY_DOC_ANCHORS)
    // **空の定数で通らないこと。** 0 件なら「全件実在する」は自明に成立してしまう。
    expect(entries.length).toBeGreaterThan(0)

    const missing = entries.filter(([, anchor]) => !anchors.has(anchor))
    expect(missing).toEqual([])
  })

  it('アンカー抽出そのものが機能している', () => {
    /*
     * 上のテストは `headingAnchors` が全部を返す実装でも通る。
     * **存在しないアンカーを弾けること**を確かめて、検査を空振りさせない。
     */
    const anchors = headingAnchors('# 見出し A\n\n## bubblewrap\n\n本文\n')
    expect(anchors.has('bubblewrap')).toBe(true)
    expect(anchors.has('socat')).toBe(false)
  })
})
