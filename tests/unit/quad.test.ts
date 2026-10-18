import { describe, expect, it } from 'vitest'
import { interiorAngles, isConvex, orderQuad, quadIoU, quadProblem, rescaleQuad, signedArea } from '@/pipeline/quad'
import type { Quad } from '@/pipeline/types'
import { rng } from './helpers'

const square: Quad = [
  { x: 10, y: 10 },
  { x: 110, y: 10 },
  { x: 110, y: 110 },
  { x: 10, y: 110 },
]

describe('orderQuad', () => {
  it('orders any permutation as TL, TR, BR, BL', () => {
    const r = rng(1)
    for (let i = 0; i < 50; i++) {
      const pts = [...square].sort(() => r() - 0.5)
      expect(orderQuad(pts)).toEqual(square)
    }
  })

  it('handles a rotated document', () => {
    const q = orderQuad([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 48 },
    ])
    expect(signedArea(q)).toBeGreaterThan(0)
    // Near 45° the top-left is ambiguous; the corner with the smallest x+y wins.
    expect(q[0]).toEqual({ x: 0, y: 48 })
    expect(q[1]).toEqual({ x: 50, y: 0 })
  })
})

describe('quad validation', () => {
  it('accepts a normal document and reports problems', () => {
    expect(isConvex(square)).toBe(true)
    expect(interiorAngles(square).every((a) => Math.abs(a - 90) < 1e-9)).toBe(true)
    expect(quadProblem(square, 120, 120)).toBeNull()
    expect(quadProblem(square, 1000, 1000)).toBe('too-small')
    const bow: Quad = [square[0], square[2], square[1], square[3]]
    expect(quadProblem(bow, 120, 120)).toBe('not-convex')
    const outside: Quad = [{ x: -20, y: 10 }, square[1], square[2], square[3]]
    expect(quadProblem(outside, 120, 120)).toBe('out-of-frame')
  })
})

describe('quadIoU', () => {
  it('is 1 for identical quads and 0 for disjoint ones', () => {
    expect(quadIoU(square, square)).toBeCloseTo(1, 10)
    const far = square.map((p) => ({ x: p.x + 500, y: p.y })) as Quad
    expect(quadIoU(square, far)).toBe(0)
  })

  it('matches the analytic value for a half-shifted square', () => {
    const shifted = square.map((p) => ({ x: p.x + 50, y: p.y })) as Quad
    // intersection 50x100, union 150x100
    expect(quadIoU(square, shifted)).toBeCloseTo(1 / 3, 10)
  })
})

describe('rescaleQuad', () => {
  it('round-trips between resolutions', () => {
    const q = rescaleQuad(rescaleQuad(square, 120, 120, 1920, 1080), 1920, 1080, 120, 120)
    q.forEach((p, i) => {
      expect(p.x).toBeCloseTo(square[i]!.x, 9)
      expect(p.y).toBeCloseTo(square[i]!.y, 9)
    })
  })
})
