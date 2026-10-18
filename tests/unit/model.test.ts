import { describe, expect, it } from 'vitest'
import { HEATMAP_SIZE, postprocess, preprocess } from '@/pipeline/model'

const S = HEATMAP_SIZE

function heatmaps(spots: { c: number; x: number; y: number; v: number; sigma?: number }[]): Float32Array {
  const hm = new Float32Array(4 * S * S)
  for (const { c, x, y, v, sigma = 1.5 } of spots) {
    for (let yy = 0; yy < S; yy++)
      for (let xx = 0; xx < S; xx++) {
        const g = v * Math.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sigma * sigma))
        const i = c * S * S + yy * S + xx
        hm[i] = Math.max(hm[i]!, g)
      }
  }
  return hm
}

describe('preprocess', () => {
  it('produces BGR planes scaled to 0..1', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 16; i++) data.set([255, 128, 0, 255], i * 4)
    const t = preprocess({ width: 4, height: 4, data }, 2)
    const want = [0, 0, 0, 0, 128 / 255, 128 / 255, 128 / 255, 128 / 255, 1, 1, 1, 1]
    expect(t.length).toBe(want.length)
    want.forEach((v, i) => expect(t[i]).toBeCloseTo(v, 6))
  })
})

describe('postprocess', () => {
  it('maps sub-pixel heatmap peaks to image coordinates', () => {
    const hm = heatmaps([
      { c: 0, x: 20.25, y: 30, v: 0.9 },
      { c: 1, x: 100, y: 28, v: 0.9 },
      { c: 2, x: 104, y: 110.5, v: 0.9 },
      { c: 3, x: 18, y: 108, v: 0.9 },
    ])
    const peaks = postprocess(hm, 1280, 1280)
    // 10 image px per heatmap px; pixel-centre mapping (x+0.5)*10-0.5
    expect(peaks[0]!.point.x).toBeCloseTo(20.25 * 10 + 4.5, 0)
    expect(peaks[2]!.point.y).toBeCloseTo(110.5 * 10 + 4.5, 0)
    expect(peaks.every((p) => p && p.score > 0.85)).toBe(true)
  })

  it('reports missing corners as null', () => {
    const hm = heatmaps([
      { c: 0, x: 20, y: 30, v: 0.9 },
      { c: 1, x: 100, y: 28, v: 0.9 },
    ])
    const peaks = postprocess(hm, 128, 128)
    expect(peaks[2]).toBeNull()
    expect(peaks[3]).toBeNull()
  })

  it('resolves two corner channels firing on the same spot', () => {
    // TR's strongest blob sits on BR; its true location is a weaker second blob.
    const hm = heatmaps([
      { c: 0, x: 20, y: 20, v: 0.9 },
      { c: 1, x: 100, y: 100, v: 0.6 },
      { c: 1, x: 100, y: 22, v: 0.45 },
      { c: 2, x: 100, y: 100, v: 0.9 },
      { c: 3, x: 20, y: 100, v: 0.9 },
    ])
    const peaks = postprocess(hm, 128, 128)
    expect(peaks[1]!.point.y).toBeLessThan(30)
    expect(peaks[2]!.point.y).toBeGreaterThan(90)
  })
})
