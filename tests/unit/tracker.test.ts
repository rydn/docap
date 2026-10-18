import { describe, expect, it } from 'vitest'
import { OneEuroFilter, QuadSmoother, StabilityGate } from '@/pipeline/tracker'
import type { Quad } from '@/pipeline/types'
import { rng } from './helpers'

const q0: Quad = [
  { x: 100, y: 100 },
  { x: 500, y: 110 },
  { x: 490, y: 600 },
  { x: 110, y: 590 },
]
const shift = (q: Quad, dx: number, dy = 0) => q.map((p) => ({ x: p.x + dx, y: p.y + dy })) as Quad
const DIAG = 1000

describe('OneEuroFilter', () => {
  it('suppresses jitter when still and follows fast motion', () => {
    const r = rng(3)
    const f = new OneEuroFilter(1.0, 0.05)
    let maxDev = 0
    for (let t = 0; t < 2000; t += 33) maxDev = Math.max(maxDev, Math.abs(f.filter(100 + (r() - 0.5) * 4, t) - 100))
    expect(maxDev).toBeLessThan(2)
    // Jump: should mostly catch up within ~200ms thanks to the speed term.
    let v = 0
    for (let t = 2000; t < 2200; t += 33) v = f.filter(300, t)
    expect(v).toBeGreaterThan(250)
  })
})

describe('QuadSmoother', () => {
  it('keeps a static quad static', () => {
    const s = new QuadSmoother()
    let out = q0
    for (let t = 0; t < 500; t += 33) out = s.smooth(q0, t, DIAG)
    out.forEach((p, i) => expect(p.x).toBeCloseTo(q0[i]!.x, 6))
  })
})

describe('StabilityGate', () => {
  it('reaches full progress after the hold time while still', () => {
    const g = new StabilityGate({ maxDrift: 0.015, holdMs: 600, gapMs: 150 })
    const r = rng(1)
    let p = 0
    for (let t = 0; t <= 700; t += 33) p = g.update(shift(q0, (r() - 0.5) * 6), t, DIAG)
    expect(p).toBe(1)
  })

  it('resets on movement and on slow drift', () => {
    const g = new StabilityGate({ maxDrift: 0.015, holdMs: 600, gapMs: 150 })
    for (let t = 0; t <= 400; t += 33) g.update(q0, t, DIAG)
    expect(g.update(shift(q0, 40), 433, DIAG)).toBe(0)
    // Creep 1px per frame: never stable for 600ms because drift accumulates past 15px.
    const g2 = new StabilityGate({ maxDrift: 0.015, holdMs: 600, gapMs: 150 })
    let p = 0
    for (let i = 0, t = 0; i < 60; i++, t += 33) p = Math.max(p, g2.update(shift(q0, i), t, DIAG))
    expect(p).toBeLessThan(1)
  })

  it('tolerates a brief detection dropout but not a long one', () => {
    const g = new StabilityGate({ maxDrift: 0.015, holdMs: 600, gapMs: 150 })
    for (let t = 0; t <= 300; t += 33) g.update(q0, t, DIAG)
    g.update(null, 400, DIAG)
    expect(g.update(q0, 430, DIAG)).toBeGreaterThan(0.6)
    g.update(null, 700, DIAG)
    expect(g.update(q0, 733, DIAG)).toBe(0)
  })
})
