import type { CaptureOptions } from '@/pipeline/capture'
import type { DetectFailure } from '@/pipeline/detect'
import type { Detection, Point, Quad } from '@/pipeline/types'

export interface FrameAnalysis {
  /** Size of the analysed frame; detection coordinates are in this space. */
  width: number
  height: number
  detection: Detection | null
  failure: DetectFailure | null
  sharpness: number
  signature: Float32Array | null
  ms: number
}

export interface CaptureJob {
  still: ImageBitmap
  /** Preview quad in normalised (0..1) frame coordinates, as a fallback. */
  hint: [Point, Point, Point, Point] | null
  /** Width/height of the frame the hint came from; the hint is ignored if the still differs. */
  hintAspect: number
  options: Partial<CaptureOptions>
}

export interface ReprocessJob {
  still: Blob
  /** Quad in still pixel coordinates. */
  quad: Quad
  rotation: number
  options: Partial<CaptureOptions>
}

export interface CaptureOutput {
  page: Blob
  thumb: Blob
  /** The original photo (JPEG) so the crop can be adjusted later. */
  still: Blob
  width: number
  height: number
  quad: Quad
  stillWidth: number
  stillHeight: number
  aspect: number
  snapped: string | null
  ms: number
}
