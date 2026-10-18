import { dist } from './quad'
import type { Quad } from './types'

type V3 = [number, number, number]

const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Focal length prior for phone cameras: main lenses are ~26mm full-frame equivalent,
 * i.e. f ≈ 0.6 × image diagonal (43.3mm full-frame diagonal).
 */
export const PHONE_FOCAL_PRIOR = 0.6

export interface AspectEstimate {
  /** Width / height of the physical document. */
  aspect: number
  /** Focal length in pixels used for the estimate. */
  focal: number
  /** Whether the focal length was recovered from the quad itself (vs the prior). */
  focalFromQuad: boolean
}

/**
 * Recovers the true width/height ratio of a rectangle seen in perspective, after
 * Zhang & He, "Whiteboard scanning and image enhancement" (2007). The principal point
 * is assumed at the image centre with square pixels; the focal length is solved from
 * the quad when the perspective is strong enough, otherwise taken from a phone prior.
 */
export function estimateAspect(q: Quad, width: number, height: number): AspectEstimate {
  const u0 = (width - 1) / 2
  const v0 = (height - 1) / 2
  const h = (i: number): V3 => [q[i]!.x - u0, q[i]!.y - v0, 1]
  // Zhang's corner naming: m1=(0,0) m2=(w,0) m3=(0,h) m4=(w,h)
  const m1 = h(0)
  const m2 = h(1)
  const m3 = h(3)
  const m4 = h(2)

  const k2 = dot3(cross3(m1, m4), m3) / dot3(cross3(m2, m4), m3)
  const k3 = dot3(cross3(m1, m4), m2) / dot3(cross3(m3, m4), m2)
  const n2: V3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]]
  const n3: V3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]]

  const diag = Math.hypot(width, height)
  let focal = PHONE_FOCAL_PRIOR * diag
  let focalFromQuad = false
  // n2z, n3z ≈ 0 means (near) fronto-parallel along that axis: focal length is unobservable.
  // Require both vanishing directions to have meaningful perspective relative to their extent.
  const rel2 = Math.abs(n2[2]) * diag / Math.max(1e-9, Math.hypot(n2[0], n2[1]))
  const rel3 = Math.abs(n3[2]) * diag / Math.max(1e-9, Math.hypot(n3[0], n3[1]))
  if (rel2 > 0.05 && rel3 > 0.05) {
    const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2])
    if (f2 > 0) {
      const f = Math.sqrt(f2)
      if (f > 0.3 * diag && f < 2.5 * diag) {
        focal = f
        focalFromQuad = true
      }
    }
  }

  const f2 = focal * focal
  const num = (n2[0] * n2[0] + n2[1] * n2[1]) / f2 + n2[2] * n2[2]
  const den = (n3[0] * n3[0] + n3[1] * n3[1]) / f2 + n3[2] * n3[2]
  let aspect = Math.sqrt(num / den)
  if (!Number.isFinite(aspect) || aspect <= 0) aspect = naiveAspect(q)
  return { aspect, focal, focalFromQuad }
}

/** Mean opposite-side ratio: what naive scanners use. */
export function naiveAspect(q: Quad): number {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2
  return w / h
}

/** Common document ratios (long/short). */
export const PAPER_RATIOS: ReadonlyArray<{ name: string; ratio: number }> = [
  { name: 'ISO A/B', ratio: Math.SQRT2 },
  { name: 'US Letter', ratio: 11 / 8.5 },
  { name: 'US Legal', ratio: 14 / 8.5 },
  { name: 'ID-1 card', ratio: 85.6 / 53.98 },
]

/** Snaps an aspect (w/h) to a standard paper ratio when within `tolerance` (relative). */
export function snapAspect(aspect: number, tolerance = 0.015): { aspect: number; snapped: string | null } {
  const portrait = aspect < 1
  const r = portrait ? 1 / aspect : aspect
  for (const p of PAPER_RATIOS) {
    if (Math.abs(r / p.ratio - 1) <= tolerance) return { aspect: portrait ? 1 / p.ratio : p.ratio, snapped: p.name }
  }
  return { aspect, snapped: null }
}

export interface OutputSizeOptions {
  maxLongSide: number
  maxPixels: number
}

/**
 * Output raster size: keeps the sampling density of the best-resolved side of the
 * document (so nothing is downsampled unnecessarily) within the given limits.
 */
export function outputSize(q: Quad, aspect: number, opts: OutputSizeOptions): { width: number; height: number } {
  const wPx = Math.max(dist(q[0], q[1]), dist(q[3], q[2]))
  const hPx = Math.max(dist(q[0], q[3]), dist(q[1], q[2]))
  let h = Math.max(hPx, wPx / aspect)
  let w = h * aspect
  const s = Math.min(1, opts.maxLongSide / Math.max(w, h), Math.sqrt(opts.maxPixels / (w * h)))
  w *= s
  h *= s
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }
}
