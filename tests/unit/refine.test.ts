import { describe, expect, it } from 'vitest'
import { randomCase, rng } from '../../bench/synth'
import { toGray } from '@/pipeline/image'
import { dist } from '@/pipeline/quad'
import { refineQuad } from '@/pipeline/refine'
import type { Quad } from '@/pipeline/types'

const cornerErr = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => dist(p, b[i]!)))

describe('refineQuad', () => {
  it('snaps a coarse quad to the true edges with sub-pixel accuracy', () => {
    const r = rng(99)
    const before: number[] = []
    const after: number[] = []
    for (let s = 0; s < 24; s++) {
      const c = randomCase(1000 + s, 640, 480)
      const gray = toGray(c.image)
      const coarse = c.quad.map((p) => ({ x: p.x + (r() - 0.5) * 10, y: p.y + (r() - 0.5) * 10 })) as Quad
      const res = refineQuad(gray, coarse, { radius: 10 })
      before.push(cornerErr(coarse, c.quad))
      after.push(cornerErr(res.quad, c.quad))
    }
    after.sort((a, b) => a - b)
    const median = after[Math.floor(after.length / 2)]!
    console.log('refine max-corner error px: median', median.toFixed(2), 'p90', after[Math.floor(after.length * 0.9)]!.toFixed(2))
    expect(median).toBeLessThan(1.0)
    expect(after[Math.floor(after.length * 0.9)]!).toBeLessThan(3)
  })

  it('never moves a corner far when there is no edge evidence', () => {
    const c = randomCase(5, 320, 240)
    const blank = { width: 320, height: 240, data: new Float32Array(320 * 240).fill(128) }
    const res = refineQuad(blank, c.quad)
    expect(cornerErr(res.quad, c.quad)).toBeLessThan(1e-9)
    expect(res.support).toBe(0)
  })
})
