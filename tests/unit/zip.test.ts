import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { buildZip, pageNames, timestamp } from '@/export/zip'

const page = (bytes: number[], t: number) => ({ page: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), createdAt: t })

describe('export', () => {
  const t = new Date(2026, 9, 18, 9, 5, 7).getTime()

  it('names pages in order with a session timestamp', () => {
    expect(timestamp(new Date(t))).toBe('20261018-090507')
    expect(pageNames([page([1], t), page([2], t + 1000)])).toEqual(['docap-20261018-090507-01.jpg', 'docap-20261018-090507-02.jpg'])
    expect(pageNames(Array.from({ length: 120 }, () => page([0], t)))[119]).toBe('docap-20261018-090507-120.jpg')
  })

  it('zips the exact page bytes in order', async () => {
    const zip = await buildZip([page([0xff, 0xd8, 1, 2], t), page([0xff, 0xd8, 3], t)])
    expect(zip.type).toBe('application/zip')
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    expect(Object.keys(files)).toEqual(['docap-20261018-090507-01.jpg', 'docap-20261018-090507-02.jpg'])
    expect(Array.from(files['docap-20261018-090507-02.jpg']!)).toEqual([0xff, 0xd8, 3])
  })
})
