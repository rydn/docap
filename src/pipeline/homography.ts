import type { Point, Quad } from './types'

/** Row-major 3x3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number]

/** Solves A x = b in place with partial pivoting. A is n×n row-major. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r
    if (Math.abs(A[piv]![c]!) < 1e-12) throw new Error('singular system')
    ;[A[c], A[piv]] = [A[piv]!, A[c]!]
    ;[b[c], b[piv]] = [b[piv]!, b[c]!]
    for (let r = c + 1; r < n; r++) {
      const f = A[r]![c]! / A[c]![c]!
      for (let k = c; k < n; k++) A[r]![k]! -= f * A[c]![k]!
      b[r]! -= f * b[c]!
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!
    for (let k = r + 1; k < n; k++) s -= A[r]![k]! * x[k]!
    x[r] = s / A[r]![r]!
  }
  return x
}

/** Homography H with H·src[i] ∝ dst[i] for four point pairs. */
export function homography(src: readonly Point[], dst: readonly Point[]): Mat3 {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!
    const { x: u, y: v } = dst[i]!
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = solve(A, b)
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1]
}

export function applyH(H: Mat3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

export function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-15) throw new Error('singular matrix')
  const s = 1 / det
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
  ]
}

/** Homography mapping the output rectangle (w×h) onto the source quad. */
export function rectToQuad(q: Quad, w: number, h: number): Mat3 {
  return homography(
    [
      { x: 0, y: 0 },
      { x: w - 1, y: 0 },
      { x: w - 1, y: h - 1 },
      { x: 0, y: h - 1 },
    ],
    q,
  )
}
