import { describe, expect, it } from 'vitest'
import { estimateAspect, naiveAspect, outputSize, snapAspect } from '@/pipeline/aspect'
import { applyH, homography, invert3 } from '@/pipeline/homography'
import { jitter, projectRect, rng } from './helpers'

const W = 4032
const H = 3024
const F = 0.6 * Math.hypot(W, H)

describe('homography', () => {
  it('maps the four correspondences exactly and inverts', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 140 },
      { x: 0, y: 140 },
    ]
    const dst = [
      { x: 12, y: 30 },
      { x: 190, y: 8 },
      { x: 220, y: 260 },
      { x: 3, y: 230 },
    ]
    const Hm = homography(src, dst)
    const Hi = invert3(Hm)
    src.forEach((p, i) => {
      const q = applyH(Hm, p)
      expect(q.x).toBeCloseTo(dst[i]!.x, 6)
      expect(q.y).toBeCloseTo(dst[i]!.y, 6)
      const back = applyH(Hi, q)
      expect(back.x).toBeCloseTo(p.x, 6)
      expect(back.y).toBeCloseTo(p.y, 6)
    })
  })
})

describe('estimateAspect (Zhang–He)', () => {
  it('recovers A4 aspect within 1% across random camera poses', () => {
    const r = rng(42)
    const truth = 210 / 297
    let worstNaive = 0
    for (let i = 0; i < 300; i++) {
      const pose = {
        rx: (r() - 0.5) * 1.0, // ±28°
        ry: (r() - 0.5) * 1.0,
        rz: (r() - 0.5) * 0.8,
        distance: 1.6 + r() * 1.2,
        tx: (r() - 0.5) * 0.3,
        ty: (r() - 0.5) * 0.3,
      }
      const q = projectRect(210, 297, pose, F, W, H)
      const est = estimateAspect(q, W, H)
      expect(Math.abs(est.aspect / truth - 1)).toBeLessThan(0.01)
      worstNaive = Math.max(worstNaive, Math.abs(naiveAspect(q) / truth - 1))
    }
    // The naive estimate is materially worse, which is the point of doing this.
    expect(worstNaive).toBeGreaterThan(0.05)
  })

  it('stays within 2.5% with an unknown lens and noisy corners', () => {
    const r = rng(7)
    const truth = 216 / 279
    const errors: number[] = []
    for (let i = 0; i < 300; i++) {
      const pose = {
        rx: (r() - 0.5) * 0.8,
        ry: (r() - 0.5) * 0.8,
        rz: (r() - 0.5) * 0.4,
        distance: 1.8 + r(),
        tx: (r() - 0.5) * 0.2,
        ty: (r() - 0.5) * 0.2,
      }
      const q = jitter(projectRect(216, 279, pose, F * (0.75 + r() * 0.5), W, H), 3, r)
      errors.push(Math.abs(estimateAspect(q, W, H).aspect / truth - 1))
    }
    errors.sort((a, b) => a - b)
    expect(errors[Math.floor(errors.length * 0.95)]!).toBeLessThan(0.025)
  })
})

describe('snapAspect', () => {
  it('snaps near-standard ratios and leaves others alone', () => {
    expect(snapAspect(0.705).snapped).toBe('ISO A/B')
    expect(snapAspect(0.705).aspect).toBeCloseTo(1 / Math.SQRT2, 10)
    expect(snapAspect(1.29).snapped).toBe('US Letter')
    expect(snapAspect(0.5).snapped).toBeNull()
  })
})

describe('outputSize', () => {
  it('preserves resolution and respects caps', () => {
    const q = projectRect(210, 297, { rx: 0.3, ry: 0.1, rz: 0, distance: 2, tx: 0, ty: 0 }, F, W, H)
    const s = outputSize(q, 210 / 297, { maxLongSide: 10000, maxPixels: 1e9 })
    expect(s.width / s.height).toBeCloseTo(210 / 297, 2)
    const capped = outputSize(q, 210 / 297, { maxLongSide: 1000, maxPixels: 1e9 })
    expect(Math.max(capped.width, capped.height)).toBe(1000)
  })
})
