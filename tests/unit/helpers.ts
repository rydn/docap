import type { Point, Quad } from '@/pipeline/types'

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface CameraPose {
  /** Rotations in radians about x (tilt), y (pan) and z (roll). */
  rx: number
  ry: number
  rz: number
  /** Distance from camera to document centre, in document-height units. */
  distance: number
  /** Offset of the document centre from the optical axis (document-height units). */
  tx: number
  ty: number
}

/**
 * Projects a W×H rectangle (physical units) through a pinhole camera with focal f
 * (pixels) and principal point at the image centre. Returns image-space corners TL,TR,BR,BL.
 */
export function projectRect(docW: number, docH: number, pose: CameraPose, f: number, imgW: number, imgH: number): Quad {
  const { rx, ry, rz } = pose
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)
  // R = Rz * Ry * Rx
  const R = [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ]
  const corners: Point[] = [
    { x: -docW / 2, y: -docH / 2 },
    { x: docW / 2, y: -docH / 2 },
    { x: docW / 2, y: docH / 2 },
    { x: -docW / 2, y: docH / 2 },
  ]
  const u0 = (imgW - 1) / 2
  const v0 = (imgH - 1) / 2
  return corners.map(({ x, y }) => {
    const X = R[0]![0]! * x + R[0]![1]! * y + pose.tx * docH
    const Y = R[1]![0]! * x + R[1]![1]! * y + pose.ty * docH
    const Z = R[2]![0]! * x + R[2]![1]! * y + pose.distance * docH
    return { x: u0 + (f * X) / Z, y: v0 + (f * Y) / Z }
  }) as Quad
}

export function jitter(q: Quad, amount: number, r: () => number): Quad {
  return q.map((p) => ({ x: p.x + (r() - 0.5) * 2 * amount, y: p.y + (r() - 0.5) * 2 * amount })) as Quad
}
