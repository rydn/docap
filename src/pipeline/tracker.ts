import { maxCornerDistance } from './quad'
import type { Quad } from './types'

/**
 * 1€ filter (Casiez, Roussel & Vogel, CHI 2012): adaptive low-pass that is smooth when
 * still and responsive when moving — steady overlay without lag.
 */
export class OneEuroFilter {
  private x: number | null = null
  private dx = 0
  private t: number | null = null

  constructor(
    private minCutoff = 1.0,
    private beta = 0.0,
    private dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter(value: number, tMs: number): number {
    if (this.x === null || this.t === null) {
      this.x = value
      this.t = tMs
      return value
    }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000)
    this.t = tMs
    const rawDx = (value - this.x) / dt
    const ad = OneEuroFilter.alpha(this.dCutoff, dt)
    this.dx = ad * rawDx + (1 - ad) * this.dx
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    const a = OneEuroFilter.alpha(cutoff, dt)
    this.x = a * value + (1 - a) * this.x
    return this.x
  }

  reset(): void {
    this.x = null
    this.t = null
    this.dx = 0
  }
}

/** Smooths the 8 corner coordinates; works in units of the frame diagonal. */
export class QuadSmoother {
  private filters = Array.from({ length: 8 }, () => new OneEuroFilter(1.5, 4, 1))

  smooth(q: Quad, tMs: number, diag: number): Quad {
    return q.map((p, i) => ({
      x: this.filters[2 * i]!.filter(p.x / diag, tMs) * diag,
      y: this.filters[2 * i + 1]!.filter(p.y / diag, tMs) * diag,
    })) as Quad
  }

  reset(): void {
    for (const f of this.filters) f.reset()
  }
}

export interface StabilityOptions {
  /** Max corner drift from the anchor quad, as a fraction of the frame diagonal. */
  maxDrift: number
  /** Time the quad must stay within maxDrift to count as stable, ms. */
  holdMs: number
  /** Detection gaps shorter than this don't reset stability, ms. */
  gapMs: number
}

export const DEFAULT_STABILITY: StabilityOptions = { maxDrift: 0.015, holdMs: 650, gapMs: 180 }

/**
 * Tracks how long the document has held still. Drift is measured against an anchor
 * (the quad when the still period began), so slow creep also resets the timer.
 */
export class StabilityGate {
  private anchor: Quad | null = null
  private since = 0
  private lastSeen = -Infinity

  constructor(private opt: StabilityOptions = DEFAULT_STABILITY) {}

  /** Feeds a raw (unsmoothed) quad or null; returns progress 0..1. */
  update(q: Quad | null, tMs: number, diag: number): number {
    if (!q) {
      if (tMs - this.lastSeen > this.opt.gapMs) this.anchor = null
      return this.anchor ? this.progress(tMs) : 0
    }
    this.lastSeen = tMs
    if (!this.anchor || maxCornerDistance(this.anchor, q) > this.opt.maxDrift * diag) {
      this.anchor = q
      this.since = tMs
    }
    return this.progress(tMs)
  }

  private progress(tMs: number): number {
    return Math.min(1, Math.max(0, (tMs - this.since) / this.opt.holdMs))
  }

  reset(): void {
    this.anchor = null
  }
}
