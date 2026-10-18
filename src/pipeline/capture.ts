import { estimateAspect, outputSize, snapAspect } from './aspect'
import { enhance, grayAt, rectify, type EnhanceMode } from './process'
import { rescaleQuad } from './quad'
import { refineQuad } from './refine'
import type { Quad, RGBAImage } from './types'

export interface CaptureOptions {
  enhance: EnhanceMode
  /** Snap the aspect ratio to A-series / Letter / Legal / ID-1 when within 1.5%. */
  snapPaper: boolean
  /** Re-fit the edges on the high-resolution still. */
  refine: boolean
  maxLongSide: number
  maxPixels: number
}

export const DEFAULT_CAPTURE: CaptureOptions = {
  enhance: 'color',
  snapPaper: true,
  refine: true,
  // A4 at 300 dpi is 2480×3508; this keeps that and caps memory/time on phones.
  maxLongSide: 3600,
  maxPixels: 9e6,
}

export interface CaptureResult {
  image: RGBAImage
  /** Final quad in still coordinates. */
  quad: Quad
  aspect: number
  snapped: string | null
  edgeSupport: number
}

/** Long side used for edge refinement on stills (sub-pixel there ≈ 1–2px at 12MP). */
const REFINE_SIDE = 2200

/**
 * Turns a full-resolution still plus a document quad (in still coordinates) into the
 * final page: re-fits the edges at high resolution, recovers the true aspect ratio,
 * rectifies with bicubic interpolation and applies the chosen enhancement.
 */
export function processCapture(still: RGBAImage, quad: Quad, options: Partial<CaptureOptions> = {}): CaptureResult {
  const o = { ...DEFAULT_CAPTURE, ...options }
  let q = quad
  let edgeSupport = 0
  if (o.refine) {
    const gray = grayAt(still, REFINE_SIDE)
    const local = rescaleQuad(quad, still.width, still.height, gray.width, gray.height)
    const diag = Math.hypot(gray.width, gray.height)
    const res = refineQuad(gray, local, { radius: Math.max(5, 0.008 * diag) })
    edgeSupport = res.support
    q = rescaleQuad(res.quad, gray.width, gray.height, still.width, still.height)
  }
  const est = estimateAspect(q, still.width, still.height)
  const snap = o.snapPaper ? snapAspect(est.aspect) : { aspect: est.aspect, snapped: null }
  const size = outputSize(q, snap.aspect, { maxLongSide: o.maxLongSide, maxPixels: o.maxPixels })
  const flat = rectify(still, q, size.width, size.height)
  return { image: enhance(flat, o.enhance), quad: q, aspect: snap.aspect, snapped: snap.snapped, edgeSupport }
}
