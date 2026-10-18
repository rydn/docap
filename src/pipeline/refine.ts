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

export const DEFAULT_REFINE: RefineOptions = {
  radius: 8,
  minGradient: 6,
  minSupport: 0.4,
  spacing: 4,
}

/** Inward closeness prior width, as a fraction of the search radius. */
const INWARD_SIGMA = 0.3

/** One gradient extremum found on the normal profile of one sample point. */
interface EdgeCand {
  /** Sample index along the side. */
  k: number
  /** Position along the side, 0..1. */
  t: number
  /** Signed offset from the coarse side along the outward normal, px. */
  s: number
  /** Gradient magnitude (gray levels / px). */
  mag: number
  /** +1: brighter outside, −1: brighter inside. */
  sign: number
  p: Point
}

/**
 * Collects every gradient extremum above `minGradient` along the outward normal at
 * evenly spaced points of one side (sub-pixel via parabolic interpolation). Keeping all
 * of them — not just the strongest — matters: a faint paper edge often sits next to a
 * much stronger printed rule or text column just inside the border.
 */
function sideCandidates(img: GrayImage, a: Point, b: Point, opt: RefineOptions): { cands: EdgeCand[]; total: number } {
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
  const cands: EdgeCand[] = []
  for (let k = 0; k < count; k++) {
    const t = 0.08 + (0.84 * (k + 0.5)) / count
    const base = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    for (let i = 0; i < L + 2; i++) {
      const s = (i - 1 - steps) * step
      profile[i] = sampleGray(img, base.x + n.x * s, base.y + n.y * s)
    }
    for (let i = 0; i < L; i++) deriv[i] = (profile[i + 2]! - profile[i]!) / (2 * step)
    for (let i = 1; i < L - 1; i++) {
      const v = deriv[i]!
      const mag = Math.abs(v)
      if (mag < opt.minGradient) continue
      const isMax = v > 0 && v >= deriv[i - 1]! && v > deriv[i + 1]!
      const isMin = v < 0 && v <= deriv[i - 1]! && v < deriv[i + 1]!
      if (!isMax && !isMin) continue
      const s = (i - steps + subPixel(deriv, i)) * step
      cands.push({ k, t, s, mag, sign: v > 0 ? 1 : -1, p: { x: base.x + n.x * s, y: base.y + n.y * s } })
    }
  }
  return { cands, total: count }
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

interface Hypothesis {
  /** Offset model s(t) = s0 + s1·t relative to the coarse side. */
  s0: number
  s1: number
  sign: number
  /** Distinct samples supporting it. */
  count: number
}

/** Deterministic xorshift so refinement is reproducible frame to frame. */
function prng(seed: number): () => number {
  let x = seed | 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }
}

/**
 * RANSAC over (t, offset) for one polarity: each hypothesis is a straight edge near the
 * coarse side (allowing a small tilt). Returns distinct hypotheses ranked by how many
 * sample points support them — continuity along the side, not contrast, is what makes
 * the paper border stand out.
 */
function hypotheses(cands: EdgeCand[], sign: number, tol: number): Hypothesis[] {
  const c = cands.filter((x) => x.sign === sign)
  if (c.length < 4) return []
  const rand = prng(c.length * 7919 + sign)
  const found: Hypothesis[] = []
  const iterations = Math.min(400, c.length * 4)
  for (let it = 0; it < iterations; it++) {
    const a = c[Math.floor(rand() * c.length)]!
    const b = c[Math.floor(rand() * c.length)]!
    if (Math.abs(a.t - b.t) < 0.15) continue
    const s1 = (b.s - a.s) / (b.t - a.t)
    const s0 = a.s - s1 * a.t
    let count = 0
    let lastK = -1
    for (const x of c) {
      if (x.k !== lastK && Math.abs(x.s - (s0 + s1 * x.t)) <= tol) {
        count++
        lastK = x.k
      }
    }
    found.push({ s0, s1, sign, count })
  }
  found.sort((x, y) => y.count - x.count)
  // Non-maximum suppression: keep hypotheses whose mid-side offsets differ by > 2·tol.
  const kept: Hypothesis[] = []
  for (const h of found) {
    const mid = h.s0 + h.s1 * 0.5
    if (kept.every((k) => Math.abs(k.s0 + k.s1 * 0.5 - mid) > 2 * tol)) kept.push(h)
    if (kept.length >= 4) break
  }
  return kept
}

/** Robust refit of one hypothesis in image space using its inlier points (one per sample). */
function refit(cands: EdgeCand[], h: Hypothesis, tol: number, total: number, opt: RefineOptions): (SideFit & { offset: number }) | null {
  const best = new Map<number, EdgeCand>()
  for (const x of cands) {
    if (x.sign !== h.sign) continue
    const r = Math.abs(x.s - (h.s0 + h.s1 * x.t))
    if (r > tol * 1.5) continue
    const prev = best.get(x.k)
    if (!prev || r < Math.abs(prev.s - (h.s0 + h.s1 * prev.t))) best.set(x.k, x)
  }
  const samples = [...best.values()]
  if (samples.length < Math.max(4, total * opt.minSupport)) return null
  const pts = samples.map((s) => s.p)
  const strength = samples.map((s) => Math.min(1, s.mag / (4 * opt.minGradient)))
  let line = fitLine(pts, strength)
  if (!line) return null
  const c = 1.2 // px, Tukey scale
  for (let it = 0; it < 4; it++) {
    const w = pts.map((p, i) => {
      const u = lineResidual(line!, p) / (2.5 * c)
      return u < 1 ? (1 - u * u) ** 2 * strength[i]! : 0
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
      off += samples[i]!.s
    }
  })
  return { line, support: inliers / total, rms: inliers ? Math.sqrt(ss / inliers) : Infinity, offset: inliers ? off / inliers : 0 }
}

/**
 * Fits one side of the document. Candidate straight edges of both polarities are found
 * by RANSAC and scored by support (fraction of the side they cover) times closeness to
 * the coarse prediction. Among comparably good candidates the outermost wins: the paper
 * border lies outside anything printed on it.
 */
export function fitSide(img: GrayImage, a: Point, b: Point, opt: RefineOptions = DEFAULT_REFINE): SideFit | null {
  const { cands, total } = sideCandidates(img, a, b, opt)
  const tol = Math.max(0.75, Math.min(1.5, opt.radius / 8))
  const fits = [...hypotheses(cands, 1, tol), ...hypotheses(cands, -1, tol)]
    .map((h) => refit(cands, h, tol, total, opt))
    .filter((f): f is SideFit & { offset: number } => !!f)
  if (!fits.length) return null
  // Asymmetric closeness prior: printed content (rules, text columns, photos) lies inside
  // the border, so pulling a side inward is far more often wrong than pushing it out.
  const sigmaOut = opt.radius * 0.5
  const sigmaIn = opt.radius * INWARD_SIGMA
  const score = (f: { support: number; offset: number }) => {
    const sg = f.offset < 0 ? sigmaIn : sigmaOut
    return f.support * Math.exp(-(f.offset * f.offset) / (2 * sg * sg))
  }
  fits.sort((x, y) => score(y) - score(x))
  let best = fits[0]!
  for (const f of fits.slice(1)) {
    if (score(f) >= 0.75 * score(fits[0]!) && f.offset > best.offset + tol) best = f
  }
  return { line: best.line, support: best.support, rms: best.rms }
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
