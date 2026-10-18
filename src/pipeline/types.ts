/** A point in source-image pixel coordinates. */
export interface Point {
  x: number
  y: number
}

/** Document corners, always ordered TL, TR, BR, BL (clockwise in image coordinates). */
export type Quad = [Point, Point, Point, Point]

/** Interleaved RGBA pixels, the layout of ImageData / canvas readbacks. */
export interface RGBAImage {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

/** Single-channel float image (luminance, gradients, heatmaps). */
export interface GrayImage {
  width: number
  height: number
  data: Float32Array
}

export type DetectionSource = 'model' | 'cv' | 'fused'

export interface Detection {
  quad: Quad
  /** 0..1 combined confidence. */
  score: number
  source: DetectionSource
  /** Per-corner model confidence (heatmap peak), when the model ran. */
  cornerScores?: [number, number, number, number]
  /** Fraction of quad side samples with strong supporting edges (0..1). */
  edgeSupport?: number
}
