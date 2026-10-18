import { toGray } from './image'
import { postprocess, preprocess, type HeatmapRunner } from './model'
import { DEFAULT_LIMITS, orderQuad, quadProblem, type QuadLimits, type QuadProblem } from './quad'
import { refineQuad } from './refine'
import type { Detection, GrayImage, Quad, RGBAImage } from './types'

export interface DetectOptions {
  limits: QuadLimits
  /** Edge refinement search radius as a fraction of the image diagonal. */
  refineRadius: number
  /** Skip edge refinement (for A/B measurements). */
  refine: boolean
  /** Minimum heatmap peak for every corner. */
  minCornerScore: number
}

export const DEFAULT_DETECT: DetectOptions = {
  limits: DEFAULT_LIMITS,
  refineRadius: 0.012,
  refine: true,
  minCornerScore: 0.35,
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
  const count = peaks.filter((p) => p && p.score >= o.minCornerScore).length
  if (count < 4) return { detection: null, failure: count === 0 ? 'no-document' : 'partial', coarse: null, gray: g }

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
