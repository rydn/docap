import type { Point, Quad } from './types'

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Signed shoelace area; positive for clockwise order in image (y-down) coordinates. */
export function signedArea(pts: readonly Point[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export const area = (pts: readonly Point[]): number => Math.abs(signedArea(pts))

export function centroid(pts: readonly Point[]): Point {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

/**
 * Orders four arbitrary points as TL, TR, BR, BL. Sorts by angle around the centroid,
 * then rotates so the corner closest to the top-left (min x+y) comes first.
 */
export function orderQuad(pts: readonly Point[]): Quad {
  if (pts.length !== 4) throw new Error(`orderQuad needs 4 points, got ${pts.length}`)
  const c = centroid(pts)
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x))
  // atan2 ascending in y-down coords is clockwise on screen.
  let start = 0
  let best = Infinity
  sorted.forEach((p, i) => {
    const s = p.x + p.y
    if (s < best) {
      best = s
      start = i
    }
  })
  return [0, 1, 2, 3].map((k) => ({ ...sorted[(start + k) % 4]! })) as Quad
}

export function isConvex(q: readonly Point[]): boolean {
  let sign = 0
  for (let i = 0; i < q.length; i++) {
    const c = cross(q[i]!, q[(i + 1) % q.length]!, q[(i + 2) % q.length]!)
    if (Math.abs(c) < 1e-9) return false
    const s = Math.sign(c)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** Interior angles in degrees, one per corner. */
export function interiorAngles(q: Quad): number[] {
  return q.map((p, i) => {
    const prev = q[(i + 3) % 4]!
    const next = q[(i + 1) % 4]!
    const a = Math.atan2(prev.y - p.y, prev.x - p.x)
    const b = Math.atan2(next.y - p.y, next.x - p.x)
    let d = Math.abs(a - b) * (180 / Math.PI)
    if (d > 180) d = 360 - d
    return d
  })
}

export interface QuadLimits {
  /** Minimum quad area as a fraction of the frame area. */
  minAreaFrac: number
  /** Allowed interior angle range in degrees. */
  minAngle: number
  maxAngle: number
  /** Maximum ratio between opposite side lengths (perspective foreshortening limit). */
  maxOppositeRatio: number
  /** Maximum aspect (long/short) of the quad in image space. */
  maxAspect: number
  /** How far corners may sit outside the frame, as a fraction of the frame diagonal. */
  maxOutside: number
}

export const DEFAULT_LIMITS: QuadLimits = {
  minAreaFrac: 0.02,
  minAngle: 45,
  maxAngle: 135,
  maxOppositeRatio: 2.6,
  maxAspect: 6,
  maxOutside: 0.01,
}

export type QuadProblem = 'not-convex' | 'too-small' | 'bad-angle' | 'too-skewed' | 'too-thin' | 'out-of-frame'

/** Checks a quad is a plausible, fully visible document. Returns null when valid. */
export function quadProblem(q: Quad, width: number, height: number, limits: QuadLimits = DEFAULT_LIMITS): QuadProblem | null {
  if (!isConvex(q) || signedArea(q) <= 0) return 'not-convex'
  const diag = Math.hypot(width, height)
  const slack = limits.maxOutside * diag
  for (const p of q) {
    if (p.x < -slack || p.y < -slack || p.x > width - 1 + slack || p.y > height - 1 + slack) return 'out-of-frame'
  }
  if (area(q) < limits.minAreaFrac * width * height) return 'too-small'
  for (const a of interiorAngles(q)) if (a < limits.minAngle || a > limits.maxAngle) return 'bad-angle'
  const s = sides(q)
  const r1 = Math.max(s[0], s[2]) / Math.max(1e-6, Math.min(s[0], s[2]))
  const r2 = Math.max(s[1], s[3]) / Math.max(1e-6, Math.min(s[1], s[3]))
  if (r1 > limits.maxOppositeRatio || r2 > limits.maxOppositeRatio) return 'too-skewed'
  const w = (s[0] + s[2]) / 2
  const h = (s[1] + s[3]) / 2
  if (Math.max(w, h) / Math.max(1e-6, Math.min(w, h)) > limits.maxAspect) return 'too-thin'
  return null
}

/** Side lengths: top, right, bottom, left. */
export function sides(q: Quad): [number, number, number, number] {
  return [dist(q[0], q[1]), dist(q[1], q[2]), dist(q[2], q[3]), dist(q[3], q[0])]
}

export const perimeter = (q: Quad): number => sides(q).reduce((a, b) => a + b, 0)

export function scaleQuad(q: Quad, sx: number, sy: number = sx): Quad {
  return q.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad
}

/** Maps pixel-centre coordinates between two resolutions of the same image. */
export function rescaleQuad(q: Quad, fromW: number, fromH: number, toW: number, toH: number): Quad {
  const sx = toW / fromW
  const sy = toH / fromH
  return q.map((p) => ({ x: (p.x + 0.5) * sx - 0.5, y: (p.y + 0.5) * sy - 0.5 })) as Quad
}

/** Largest corner displacement between two quads. */
export function maxCornerDistance(a: Quad, b: Quad): number {
  let m = 0
  for (let i = 0; i < 4; i++) m = Math.max(m, dist(a[i]!, b[i]!))
  return m
}

/** Clips a convex polygon against a convex clip polygon (both clockwise in y-down coords). */
function clipConvex(subject: Point[], clip: readonly Point[]): Point[] {
  let output = subject
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i]!
    const b = clip[(i + 1) % clip.length]!
    const input = output
    output = []
    const inside = (p: Point) => cross(a, b, p) >= 0
    const intersect = (p: Point, q: Point): Point => {
      const d1 = cross(a, b, p)
      const d2 = cross(a, b, q)
      const t = d1 / (d1 - d2)
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
    }
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]!
      const prev = input[(j + input.length - 1) % input.length]!
      if (inside(cur)) {
        if (!inside(prev)) output.push(intersect(prev, cur))
        output.push(cur)
      } else if (inside(prev)) {
        output.push(intersect(prev, cur))
      }
    }
  }
  return output
}

/** Intersection-over-union (Jaccard index) of two convex quads, as used by SmartDoc 2015. */
export function quadIoU(a: Quad, b: Quad): number {
  if (!isConvex(a) || !isConvex(b)) return 0
  const pa = signedArea(a) > 0 ? [...a] : [...a].reverse()
  const pb = signedArea(b) > 0 ? [...b] : [...b].reverse()
  const inter = area(clipConvex(pa, pb))
  const union = area(pa) + area(pb) - inter
  return union > 0 ? inter / union : 0
}

/** Intersection point of two infinite lines given as point + direction. */
export function intersectLines(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const den = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t }
}
