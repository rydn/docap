import { gaussianBlur, warpGray } from './image'
import type { GrayImage, Quad } from './types'

export const SIGNATURE_SIZE = 32

/**
 * Appearance signature of a document: its rectified content at 32×32, blurred and
 * normalised to zero mean / unit variance. Used to tell "the same page again" from
 * "a new page" so repeated scanning never captures duplicates.
 */
export function documentSignature(gray: GrayImage, q: Quad): Float32Array {
  const n = SIGNATURE_SIZE
  // Sample at 2x then blur so small misalignments and noise don't matter.
  const big = warpGray(gray, q, n * 2, n * 2)
  const blurred = gaussianBlur(big, 1.2)
  const out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = 2 * y * (2 * n) + 2 * x
      const d = blurred.data
      out[y * n + x] = (d[i]! + d[i + 1]! + d[i + 2 * n]! + d[i + 2 * n + 1]!) / 4
    }
  }
  return normalise(out)
}

function normalise(v: Float32Array): Float32Array {
  let m = 0
  for (const x of v) m += x
  m /= v.length
  let s = 0
  for (const x of v) s += (x - m) * (x - m)
  const sd = Math.sqrt(s / v.length)
  const out = new Float32Array(v.length)
  // A blank page has ~zero variance: keep it as zeros (similar to any other blank page).
  if (sd < 2) return out
  for (let i = 0; i < v.length; i++) out[i] = (v[i]! - m) / sd
  return out
}

function rotate90(v: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x * n + (n - 1 - y)] = v[y * n + x]!
  return out
}

function ncc(a: Float32Array, b: Float32Array): number {
  let s = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    s += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (na === 0 && nb === 0) return 1 // both blank
  if (na === 0 || nb === 0) return 0
  return s / Math.sqrt(na * nb)
}

/** Normalised cross-correlation (−1..1), maximised over the four 90° rotations. */
export function signatureSimilarity(a: Float32Array, b: Float32Array): number {
  const n = SIGNATURE_SIZE
  let best = -1
  let r = b
  for (let k = 0; k < 4; k++) {
    best = Math.max(best, ncc(a, r))
    r = rotate90(r, n)
  }
  return best
}
