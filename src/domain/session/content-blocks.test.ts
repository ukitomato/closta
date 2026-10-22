import { describe, expect, it } from 'vitest'

import { documentPart } from './content-blocks'
import { toTranscriptMessages } from './transcript'

describe('documentPart (O-12 BE-020 / SC-002)', () => {
  it('title -> source.filename -> "" の順で名前を取る', () => {
    expect(documentPart({ title: 'T', source: { type: 'base64', filename: 'F' } }).filename).toBe(
      'T'
    )
    expect(documentPart({ source: { type: 'base64', filename: 'F' } }).filename).toBe('F')
    expect(documentPart({ title: '', source: { type: 'text' } }).filename).toBe('')
    expect(documentPart({}).filename).toBe('')
  })

  it('名前は伏せ字・1 行化・120 コードポイントに切る', () => {
    const secret = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    expect(documentPart({ title: `a ${secret}` }).filename).not.toContain(secret)
    expect(documentPart({ title: 'a\n\tb' }).filename).toBe('a b')
    const long = documentPart({ title: 'あ'.repeat(300) }).filename
    expect(Array.from(long)).toHaveLength(120)
  })

  it('source.type から種類を決める', () => {
    const type = (t: unknown): string => documentPart({ source: { type: t } }).mediaType
    expect(type('base64')).toBe('application/pdf')
    expect(type('url')).toBe('application/pdf')
    expect(type('text')).toBe('text/plain')
    expect(type('content')).toBe('')
    expect(type('file')).toBe('')
    expect(type('other')).toBe('')
    expect(documentPart({}).mediaType).toBe('')
  })

  it('source.data・context・citations を DTO に出さない', () => {
    const part = documentPart({
      title: 'x',
      context: 'CTX_MARK',
      citations: { enabled: true, MARK: 'CIT_MARK' },
      source: { type: 'base64', data: 'DATA_MARK', media_type: 'application/pdf' }
    })
    const json = JSON.stringify(part)
    for (const mark of ['CTX_MARK', 'CIT_MARK', 'DATA_MARK']) expect(json).not.toContain(mark)
    expect(Object.keys(part).sort()).toEqual(['filename', 'mediaType', 'type'])
  })

  it('過去ログの user/document が file の part になる', () => {
    const out = toTranscriptMessages([
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [{ type: 'document', title: 'r.pdf', source: { type: 'base64', data: 'D' } }]
        }
      }
    ])
    expect(out[0]?.parts).toEqual([
      { type: 'file', filename: 'r.pdf', mediaType: 'application/pdf' }
    ])
  })
})
