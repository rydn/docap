import { describe, expect, it } from 'vitest'
import { AutoCapture, type FrameObservation } from '@/pipeline/autocapture'
import { SIGNATURE_SIZE } from '@/pipeline/signature'
import type { Quad } from '@/pipeline/types'
import { rng } from './helpers'

const quad: Quad = [
  { x: 100, y: 100 },
  { x: 500, y: 110 },
  { x: 490, y: 600 },
  { x: 110, y: 590 },
]

function sig(seed: number): Float32Array {
  const r = rng(seed)
  const s = new Float32Array(SIGNATURE_SIZE * SIGNATURE_SIZE)
  for (let i = 0; i < s.length; i++) s[i] = r() - 0.5
  return s
}

function run(ac: AutoCapture, frames: Partial<FrameObservation>[], t0 = 0) {
  const out = []
  let t = t0
  for (const f of frames) {
    out.push(ac.update({ t, quad, score: 0.9, sharpness: 100, signature: sig(1), diag: 1000, ...f }))
    t += 33
  }
  return out
}

const still = (n: number, f: Partial<FrameObservation> = {}) => Array.from({ length: n }, () => f)

describe('AutoCapture', () => {
  it('fires once after holding still', () => {
    const ac = new AutoCapture({ holdMs: 600 })
    const res = run(ac, still(30))
    const fires = res.filter((r) => r.fire)
    expect(fires.length).toBe(1)
    expect(res.findIndex((r) => r.fire)).toBeGreaterThanOrEqual(18) // ≥ 600ms at 33ms/frame
  })

  it('does not fire while the document moves', () => {
    const ac = new AutoCapture({ holdMs: 600 })
    const frames = Array.from({ length: 60 }, (_, i) => ({
      quad: quad.map((p) => ({ x: p.x + (i % 2 ? 30 : 0), y: p.y })) as Quad,
    }))
    expect(run(ac, frames).some((r) => r.fire)).toBe(false)
  })

  it('waits for a sharp frame', () => {
    const ac = new AutoCapture({ holdMs: 300 })
    const blurry = run(ac, [...still(5), ...still(20, { sharpness: 30 })])
    // sharpness collapsed well below the best seen while holding → no shot yet
    expect(blurry.some((r) => r.fire)).toBe(false)
    expect(run(ac, still(1, { sharpness: 95 }), 25 * 33).some((r) => r.fire)).toBe(true)
  })

  it('never re-captures the same page, but takes the next one', () => {
    const ac = new AutoCapture({ holdMs: 300 })
    let t = 0
    const step = (n: number, f: Partial<FrameObservation>) => {
      const r = run(ac, still(n, f), t)
      t += n * 33
      return r
    }
    expect(step(15, { signature: sig(1) }).some((r) => r.fire)).toBe(true)
    ac.captured(sig(1))
    expect(step(60, { signature: sig(1) }).some((r) => r.fire)).toBe(false)
    // Page swapped in place: a different signature re-arms and captures again.
    expect(step(30, { signature: sig(2) }).some((r) => r.fire)).toBe(true)
  })

  it('re-arms when the page is removed', () => {
    const ac = new AutoCapture({ holdMs: 300, rearmMissingMs: 400 })
    let t = 0
    run(ac, still(15), t)
    t += 15 * 33
    ac.captured(sig(1))
    run(ac, still(20, { quad: null, signature: null }), t)
    t += 20 * 33
    expect(ac.current).toBe('searching')
    // Same page put back after removal is captured again (user intent: rescan).
    expect(run(ac, still(20), t).some((r) => r.fire)).toBe(true)
  })
})
