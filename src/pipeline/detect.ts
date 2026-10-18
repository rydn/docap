import { toGray } from './image'
import { postprocess, preprocess, type CornerPeak, type HeatmapRunner } from './model'
import { DEFAULT_LIMITS, dist, intersectLines, orderQuad, quadProblem, type QuadLimits, type QuadProblem } from './quad'
import { DEFAULT_REFINE, fitSide, refineQuad, type Line } from './refine'
import type { Detection, GrayImage, Point, Quad, RGBAImage } from './types'

export interface DetectOptions {
  limits: QuadLimits
  /** Edge refinement search radius as a fraction of the image diagonal. */
  refineRadius: number
  /** Skip edge refinement (for A/B measurements). */
  refine: boolean
  /** Minimum heatmap peak for every corner. */
  minCornerScore: number
  /** Recover a single hidden corner from the paper edges. */
  completeCorner: boolean
}

export const DEFAULT_DETECT: DetectOptions = {
  limits: DEFAULT_LIMITS,
  refineRadius: 0.012,
  refine: false,
  minCornerScore: 0.2,
  completeCorner: true,
}

export type DetectFailure = 'no-document' | 'partial' | QuadProblem

export interface DetectResult {
  detection: Detection | null
  failure: DetectFailure | null
  /** Model quad before edge refinement, when the model found four corners. */
  coarse: Quad | null
  gray: GrayImage
}

/**
 * Recovers one hidden or low-confidence corner (a thumb holding the page, glare) from
 * the three strong ones: starts from the parallelogram estimate, fits the two paper
 * edges that meet at the missing corner and intersects them. Both edges must be well
 * supported and pass through their known neighbours, so a guess never becomes a corner.
 */
function completeCorner(g: GrayImage, peaks: (CornerPeak | null)[], miss: number): Point | null {
  const prev = peaks[(miss + 3) % 4]!.point
  const next = peaks[(miss + 1) % 4]!.point
  const opp = peaks[(miss + 2) % 4]!.point
  const approx = { x: prev.x + next.x - opp.x, y: prev.y + next.y - opp.y }
  const diag = Math.hypot(g.width, g.height)
  const radius = 0.035 * diag
  const a = fitSide(g, prev, approx, { ...DEFAULT_REFINE, radius, minSupport: 0.5 })
  const b = fitSide(g, approx, next, { ...DEFAULT_REFINE, radius, minSupport: 0.5 })
  if (!a || !b || a.support < 0.5 || b.support < 0.5) return null
  const offLine = (l: Line, p: Point) => Math.abs((p.x - l.p.x) * l.d.y - (p.y - l.p.y) * l.d.x)
  if (offLine(a.line, prev) > radius * 0.3 || offLine(b.line, next) > radius * 0.3) return null
  const c = intersectLines(a.line.p, a.line.d, b.line.p, b.line.d)
  if (!c || dist(c, approx) > 0.12 * diag) return null
  if (c.x < 0 || c.y < 0 || c.x > g.width - 1 || c.y > g.height - 1) return null
  return c
}

/**
 * Finds the document in an analysis-sized frame: DocAligner corner heatmaps give a
 * robust coarse quad; edge refinement then snaps it to the paper border with sub-pixel
 * precision; geometry checks reject implausible shapes.
 */
export async function detectDocument(
  img: RGBAImage,
  runner: HeatmapRunner,
  options: Partial<DetectOptions> = {},
  gray?: GrayImage,
): Promise<DetectResult> {
  const o = { ...DEFAULT_DETECT, ...options }
  const g = gray ?? toGray(img)
  const peaks = postprocess(await runner.run(preprocess(img)), img.width, img.height)
  const strong = (p: CornerPeak | null): p is CornerPeak => !!p && p.score >= o.minCornerScore
  const count = peaks.filter(strong).length
  if (count === 3 && o.completeCorner) {
    const miss = peaks.findIndex((p) => !strong(p))
    const done = completeCorner(g, peaks as CornerPeak[], miss)
    if (done) peaks[miss] = { point: done, score: o.minCornerScore }
  }
  if (!peaks.every(strong)) return { detection: null, failure: count === 0 ? 'no-document' : 'partial', coarse: null, gray: g }

  const coarse = orderQuad(peaks.map((p) => p!.point))
  const coarseProblem = quadProblem(coarse, img.width, img.height, o.limits)
  if (coarseProblem && coarseProblem !== 'out-of-frame') return { detection: null, failure: coarseProblem, coarse, gray: g }

  let quad = coarse
  let edgeSupport = 0
  if (o.refine) {
    const diag = Math.hypot(img.width, img.height)
    const res = refineQuad(g, coarse, { radius: Math.max(4, o.refineRadius * diag) })
    quad = res.quad
    edgeSupport = res.support
  }
  const problem = quadProblem(quad, img.width, img.height, o.limits)
  if (problem) return { detection: null, failure: problem, coarse, gray: g }

  const cornerScores = peaks.map((p) => p!.score) as [number, number, number, number]
  return {
    detection: {
      quad,
      score: Math.min(...cornerScores) * (0.6 + 0.4 * edgeSupport),
      source: o.refine && edgeSupport > 0 ? 'fused' : 'model',
      cornerScores,
      edgeSupport,
    },
    failure: null,
    coarse,
    gray: g,
  }
}
