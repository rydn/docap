import { resampleArea } from './image'
import type { Point, RGBAImage } from './types'

/**
 * DocAligner heatmap-regression corner model (DocsaidLab, Apache-2.0).
 * Input 'img': float32 [1,3,256,256], BGR, values/255, plain stretch resize.
 * Output 'heatmap': float32 [1,4,128,128] sigmoid; channels are TL, TR, BR, BL.
 */
export const MODEL_INPUT = 256
export const HEATMAP_SIZE = 128
export const HEATMAP_THRESHOLD = 0.3

export const MODELS = {
  lcnet100: 'lcnet100_h_e_bifpn_256_fp32.onnx',
} as const
export type ModelName = keyof typeof MODELS

/** Runs the network: CHW float input → 4×128×128 heatmaps. Implemented per runtime. */
export interface HeatmapRunner {
  run(input: Float32Array): Promise<Float32Array>
}

export function preprocess(img: RGBAImage, size = MODEL_INPUT): Float32Array {
  const rgba = resampleArea(img.data, img.width, img.height, 4, size, size)
  const plane = size * size
  const out = new Float32Array(3 * plane)
  for (let i = 0, j = 0; i < plane; i++, j += 4) {
    out[i] = rgba[j + 2]! / 255 // B
    out[plane + i] = rgba[j + 1]! / 255 // G
    out[2 * plane + i] = rgba[j]! / 255 // R
  }
  return out
}

export interface CornerPeak {
  point: Point
  /** Heatmap peak value 0..1. */
  score: number
}

/** Threshold for collecting candidate blobs; weaker than the acceptance threshold. */
const CANDIDATE_THRESHOLD = 0.12
const MAX_CANDIDATES = 3

interface Blob {
  mass: number
  x: number
  y: number
  peak: number
}

/** Connected components above threshold, each reduced to a value-weighted centroid. */
function blobs(hm: Float32Array, size: number, threshold: number, visited: Uint8Array, stack: Int32Array): Blob[] {
  const plane = size * size
  visited.fill(0)
  const out: Blob[] = []
  const push = (n: number) => {
    if (!visited[n] && hm[n]! >= threshold) {
      visited[n] = 1
      stack[top++] = n
    }
  }
  let top = 0
  for (let start = 0; start < plane; start++) {
    if (visited[start] || hm[start]! < threshold) continue
    top = 0
    stack[top++] = start
    visited[start] = 1
    let mass = 0
    let mx = 0
    let my = 0
    let peak = 0
    while (top > 0) {
      const i = stack[--top]!
      const v = hm[i]!
      const x = i % size
      const y = (i - x) / size
      // Weight by height above the threshold so the centroid follows the peak shape.
      const w = v - threshold * 0.5
      mass += w
      mx += w * x
      my += w * y
      if (v > peak) peak = v
      if (x > 0) push(i - 1)
      if (x < size - 1) push(i + 1)
      if (y > 0) push(i - size)
      if (y < size - 1) push(i + size)
    }
    out.push({ mass, x: mx / mass, y: my / mass, peak })
  }
  return out.sort((a, b) => b.peak * Math.sqrt(b.mass) - a.peak * Math.sqrt(a.mass)).slice(0, MAX_CANDIDATES)
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/**
 * Turns the four heatmaps into corners. Each corner keeps its top few blobs; the
 * combination with the highest total confidence that forms four distinct corners of a
 * convex, clockwise quad wins. This resolves the failure where two corner channels fire
 * on the same spot (extreme perspective, long receipts) while one has a weaker true peak.
 * Coordinates are in the analysed image's pixel space; `null` marks a missing corner.
 */
export function postprocess(
  heatmaps: Float32Array,
  imgW: number,
  imgH: number,
  threshold = HEATMAP_THRESHOLD,
  size = HEATMAP_SIZE,
): (CornerPeak | null)[] {
  const plane = size * size
  const visited = new Uint8Array(plane)
  const stack = new Int32Array(plane)
  const sx = imgW / size
  const sy = imgH / size
  const toImage = (b: Blob): CornerPeak => ({ point: { x: (b.x + 0.5) * sx - 0.5, y: (b.y + 0.5) * sy - 0.5 }, score: b.peak })
  const cands = [0, 1, 2, 3].map((c) =>
    blobs(heatmaps.subarray(c * plane, (c + 1) * plane), size, CANDIDATE_THRESHOLD, visited, stack).map(toImage),
  )
  const best = cands.map((list) => (list[0] && list[0].score >= threshold ? list[0] : null))
  if (cands.some((l) => l.length === 0)) return best

  const minSep = 0.03 * Math.hypot(imgW, imgH)
  let bestScore = -Infinity
  let chosen: CornerPeak[] | null = null
  const pick: CornerPeak[] = []
  const search = (c: number, total: number) => {
    if (c === 4) {
      for (let i = 0; i < 4; i++) {
        const a = pick[i]!.point
        for (let j = i + 1; j < 4; j++) if (Math.hypot(a.x - pick[j]!.point.x, a.y - pick[j]!.point.y) < minSep) return
        // Clockwise in y-down image coordinates: positive cross product at every corner.
        if (cross(pick[(i + 3) % 4]!.point, a, pick[(i + 1) % 4]!.point) <= 0) return
      }
      if (total > bestScore) {
        bestScore = total
        chosen = [...pick]
      }
      return
    }
    for (const cand of cands[c]!) {
      pick[c] = cand
      search(c + 1, total + cand.score)
    }
  }
  search(0, 0)
  if (!chosen) return best
  return (chosen as CornerPeak[]).map((p) => (p.score >= CANDIDATE_THRESHOLD ? p : null))
}
