import { sampleGray } from './image'
import { dist, intersectLines } from './quad'
import type { GrayImage, Point, Quad } from './types'

export interface Line {
  /** A point on the line. */
  p: Point
  /** Unit direction. */
  d: Point
}

export interface SideFit {
  line: Line
  /** Fraction of samples that found a consistent edge and fit the line (0..1). */
  support: number
  /** RMS residual of inliers, px. */
  rms: number
}

export interface RefineOptions {
  /** Search half-width along the side normal, px. */
  radius: number
  /** Minimum directional gradient (gray levels per px) to accept an edge sample. */
  minGradient: number
  /** Minimum support fraction to trust a refined side. */
  minSupport: number
  /** Sample spacing along each side, px. */
  spacing: number
}

export const DEFAULT_REFINE: RefineOptions = { radius: 8, minGradient: 6, minSupport: 0.4, spacing: 4 }

interface EdgeSample {
  p: Point
  strength: number
  /** Signed offset from the coarse side along the outward normal, px. */
  offset: number
}

/**
 * Finds edge points along one side by searching the profile along the outward normal
 * for the strongest gradient of the side's dominant polarity, with parabolic
 * sub-pixel peak interpolation. A Gaussian prior on offset favours the predicted line
 * over interior content (text, photos) near the border.
 */
function sideSamples(
  img: GrayImage,
  a: Point,
  b: Point,
  opt: RefineOptions,
): { pos: EdgeSample[]; neg: EdgeSample[]; total: number } {
  const len = dist(a, b)
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  // Outward normal for clockwise (y-down) ordering.
  const n = { x: d.y, y: -d.x }
  const count = Math.max(8, Math.min(96, Math.floor((len * 0.84) / opt.spacing)))
  const step = 0.5
  const steps = Math.ceil(opt.radius / step)
  const L = 2 * steps + 1
  const profile = new Float32Array(L + 2)
  const deriv = new Float32Array(L)

  type Cand = { pos: number; mag: number; sign: number }
  const perSample: { base: Point; pos: Cand | null; neg: Cand | null }[] = []
  const prior = (s: number) => Math.exp(-(s * s) / (2 * (opt.radius * 0.6) ** 2))

  for (let k = 0; k < count; k++) {
    const t = 0.08 + (0.84 * (k + 0.5)) / count
    const base = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    for (let i = 0; i < L + 2; i++) {
      const s = (i - 1 - steps) * step
      profile[i] = sampleGray(img, base.x + n.x * s, base.y + n.y * s)
    }
    for (let i = 0; i < L; i++) deriv[i] = (profile[i + 2]! - profile[i]!) / (2 * step)
    let pos: Cand | null = null
    let neg: Cand | null = null
    for (let i = 1; i < L - 1; i++) {
      const v = deriv[i]!
      const s = (i - steps) * step
      const score = Math.abs(v) * prior(s)
      if (v > 0 && v >= deriv[i - 1]! && v >= deriv[i + 1]!) {
        if (!pos || score > pos.mag * prior(pos.pos)) pos = { pos: s + subPixel(deriv, i) * step, mag: v, sign: 1 }
      } else if (v < 0 && v <= deriv[i - 1]! && v <= deriv[i + 1]!) {
        if (!neg || score > neg.mag * prior(neg.pos)) neg = { pos: s + subPixel(deriv, i) * step, mag: -v, sign: -1 }
      }
    }
    perSample.push({ base, pos, neg })
  }

  // Both polarities are kept: the paper edge can be either (bright paper on a dark desk or
  // the reverse), and interior features such as a left-aligned text column produce a
  // parallel edge of the opposite polarity just inside the border. fitSide decides.
  const collect = (pick: (s: (typeof perSample)[number]) => Cand | null): EdgeSample[] => {
    const out: EdgeSample[] = []
    for (const s of perSample) {
      const c = pick(s)
      if (!c || c.mag < opt.minGradient) continue
      out.push({ p: { x: s.base.x + n.x * c.pos, y: s.base.y + n.y * c.pos }, strength: c.mag, offset: c.pos })
    }
    return out
  }
  return { pos: collect((s) => s.pos), neg: collect((s) => s.neg), total: count }
}

function subPixel(v: Float32Array, i: number): number {
  const a = v[i - 1]!
  const b = v[i]!
  const c = v[i + 1]!
  const den = a - 2 * b + c
  if (Math.abs(den) < 1e-9) return 0
  const off = (0.5 * (a - c)) / den
  return Math.max(-0.5, Math.min(0.5, off))
}

/** Weighted total-least-squares line fit. */
function fitLine(pts: readonly Point[], w: readonly number[]): Line | null {
  let sw = 0
  let mx = 0
  let my = 0
  for (let i = 0; i < pts.length; i++) {
    sw += w[i]!
    mx += w[i]! * pts[i]!.x
    my += w[i]! * pts[i]!.y
  }
  if (sw <= 0) return null
  mx /= sw
  my /= sw
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i]!.x - mx
    const dy = pts[i]!.y - my
    sxx += w[i]! * dx * dx
    sxy += w[i]! * dx * dy
    syy += w[i]! * dy * dy
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { p: { x: mx, y: my }, d: { x: Math.cos(theta), y: Math.sin(theta) } }
}

const lineResidual = (l: Line, p: Point): number => Math.abs((p.x - l.p.x) * l.d.y - (p.y - l.p.y) * l.d.x)

/**
 * Fits one side: robust line fits for each edge polarity, then picks the one with the
 * best support weighted by closeness to the coarse prediction. When both are similarly
 * good, the outer line wins: a document's border lies outside its content.
 */
export function fitSide(img: GrayImage, a: Point, b: Point, opt: RefineOptions = DEFAULT_REFINE): SideFit | null {
  const { pos, neg, total } = sideSamples(img, a, b, opt)
  const fits = [robustFit(pos, total, opt), robustFit(neg, total, opt)].filter((f): f is SideFit & { offset: number } => !!f)
  if (!fits.length) return null
  const sigma = opt.radius * 0.5
  const score = (f: { support: number; offset: number }) => f.support * Math.exp(-(f.offset * f.offset) / (2 * sigma * sigma))
  fits.sort((x, y) => score(y) - score(x))
  let best = fits[0]!
  const other = fits[1]
  if (other && score(other) > 0.8 * score(best) && other.offset > best.offset) best = other
  return { line: best.line, support: best.support, rms: best.rms }
}

function robustFit(samples: EdgeSample[], total: number, opt: RefineOptions): (SideFit & { offset: number }) | null {
  if (samples.length < Math.max(4, total * opt.minSupport)) return null
  const pts = samples.map((s) => s.p)
  let w = samples.map((s) => Math.min(1, s.strength / (4 * opt.minGradient)))
  let line = fitLine(pts, w)
  if (!line) return null
  const c = 1.5 // px, Tukey scale
  for (let it = 0; it < 6; it++) {
    const res = pts.map((p) => lineResidual(line!, p))
    const med = [...res].sort((x, y) => x - y)[Math.floor(res.length / 2)]!
    const scale = Math.max(c, 2.5 * med)
    w = res.map((r, i) => {
      const u = r / (2.5 * scale)
      return u < 1 ? (1 - u * u) ** 2 * Math.min(1, samples[i]!.strength / (4 * opt.minGradient)) : 0
    })
    const next = fitLine(pts, w)
    if (!next) return null
    line = next
  }
  let inliers = 0
  let ss = 0
  let off = 0
  pts.forEach((p, i) => {
    const r = lineResidual(line!, p)
    if (r <= c) {
      inliers++
      ss += r * r
      off += samples[i]!.offset
    }
  })
  return {
    line,
    support: inliers / total,
    rms: inliers ? Math.sqrt(ss / inliers) : Infinity,
    offset: inliers ? off / inliers : 0,
  }
}

export interface RefineResult {
  quad: Quad
  /** Mean side support 0..1 (how much of the outline is backed by real edges). */
  support: number
  sides: (SideFit | null)[]
}

/**
 * Snaps a coarse quad to the document's actual edges with sub-pixel accuracy: fits a
 * robust line to each side and intersects neighbours. Sides without enough edge
 * evidence keep their coarse position, so a low-contrast border never makes it worse.
 */
export function refineQuad(img: GrayImage, q: Quad, opt: Partial<RefineOptions> = {}, passes = 2): RefineResult {
  const o = { ...DEFAULT_REFINE, ...opt }
  let quad = q
  let fits: (SideFit | null)[] = []
  for (let pass = 0; pass < passes; pass++) {
    const radius = pass === 0 ? o.radius : Math.max(2.5, o.radius / 3)
    const po = { ...o, radius }
    fits = [0, 1, 2, 3].map((i) => {
      const f = fitSide(img, quad[i]!, quad[(i + 1) % 4]!, po)
      return f && f.support >= o.minSupport ? f : null
    })
    const lines: Line[] = fits.map((f, i) => {
      if (f) return f.line
      const a = quad[i]!
      const b = quad[(i + 1) % 4]!
      const l = dist(a, b)
      return { p: a, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } }
    })
    const next = quad.map((orig, i) => {
      // Corner i joins side i-1 (ending at i) and side i (starting at i).
      const prev = lines[(i + 3) % 4]!
      const cur = lines[i]!
      const p = intersectLines(prev.p, prev.d, cur.p, cur.d)
      if (!p || dist(p, orig) > radius * 2) return orig
      return p
    }) as Quad
    quad = next
  }
  const support = fits.reduce((s, f) => s + (f ? f.support : 0), 0) / 4
  return { quad, support, sides: fits }
}
