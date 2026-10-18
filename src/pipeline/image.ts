import { applyH, rectToQuad } from './homography'
import type { GrayImage, Quad, RGBAImage } from './types'

/** BT.601 luma, 0..255. */
export function toGray(img: RGBAImage): GrayImage {
  const { width, height, data } = img
  const out = new Float32Array(width * height)
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = 0.299 * data[j]! + 0.587 * data[j + 1]! + 0.114 * data[j + 2]!
  }
  return { width, height, data: out }
}

/**
 * Area-averaging resample of an interleaved image with `ch` channels. Exact box filter
 * for downscaling (no aliasing); degrades gracefully to nearest-ish when upscaling.
 */
export function resampleArea(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  ch: number,
  dw: number,
  dh: number,
): Float32Array {
  const out = new Float32Array(dw * dh * ch)
  const fx = sw / dw
  const fy = sh / dh
  for (let y = 0; y < dh; y++) {
    const y0 = y * fy
    const y1 = Math.min(sh, y0 + fy)
    const iy0 = Math.floor(y0)
    const iy1 = Math.min(sh - 1, Math.ceil(y1) - 1)
    for (let x = 0; x < dw; x++) {
      const x0 = x * fx
      const x1 = Math.min(sw, x0 + fx)
      const ix0 = Math.floor(x0)
      const ix1 = Math.min(sw - 1, Math.ceil(x1) - 1)
      const o = (y * dw + x) * ch
      let wsum = 0
      for (let yy = iy0; yy <= iy1; yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0)
        if (wy <= 0) continue
        for (let xx = ix0; xx <= ix1; xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0)
          if (wx <= 0) continue
          const w = wx * wy
          wsum += w
          const s = (yy * sw + xx) * ch
          for (let c = 0; c < ch; c++) out[o + c]! += src[s + c]! * w
        }
      }
      if (wsum > 0) for (let c = 0; c < ch; c++) out[o + c]! /= wsum
    }
  }
  return out
}

export function resizeGray(img: GrayImage, w: number, h: number): GrayImage {
  return { width: w, height: h, data: resampleArea(img.data, img.width, img.height, 1, w, h) }
}

export function resizeRGBA(img: RGBAImage, w: number, h: number): RGBAImage {
  const f = resampleArea(img.data, img.width, img.height, 4, w, h)
  const data = new Uint8ClampedArray(f.length)
  for (let i = 0; i < f.length; i++) data[i] = f[i]!
  return { width: w, height: h, data }
}

/** Dimensions that fit `maxSide` on the long edge, preserving aspect. */
export function fitSize(w: number, h: number, maxSide: number): { width: number; height: number } {
  const s = Math.min(1, maxSide / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) }
}

/** Bilinear sample with edge clamping. */
export function sampleGray(img: GrayImage, x: number, y: number): number {
  const { width: w, height: h, data } = img
  const cx = Math.min(Math.max(x, 0), w - 1)
  const cy = Math.min(Math.max(y, 0), h - 1)
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const ax = cx - x0
  const ay = cy - y0
  const r0 = data[y0 * w + x0]! * (1 - ax) + data[y0 * w + x1]! * ax
  const r1 = data[y1 * w + x0]! * (1 - ax) + data[y1 * w + x1]! * ax
  return r0 * (1 - ay) + r1 * ay
}

/** Separable Gaussian blur. */
export function gaussianBlur(img: GrayImage, sigma: number): GrayImage {
  if (sigma <= 0) return img
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float32Array(2 * r + 1)
  let s = 0
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma))
  for (let i = 0; i < k.length; i++) k[i]! /= s
  const { width: w, height: h, data } = img
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i
        acc += data[row + xx]! * k[i + r]!
      }
      tmp[row + x] = acc
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i
        acc += tmp[yy * w + x]! * k[i + r]!
      }
      out[y * w + x] = acc
    }
  }
  return { width: w, height: h, data: out }
}

/**
 * Variance of the Laplacian inside the quad's (shrunken) bounding box: a standard
 * focus/motion-blur measure. Larger is sharper; compare relative values over time.
 */
export function sharpness(img: GrayImage, q?: Quad): number {
  const { width: w, height: h, data } = img
  let x0 = 1
  let y0 = 1
  let x1 = w - 2
  let y1 = h - 2
  if (q) {
    const xs = q.map((p) => p.x)
    const ys = q.map((p) => p.y)
    const bx0 = Math.min(...xs)
    const bx1 = Math.max(...xs)
    const by0 = Math.min(...ys)
    const by1 = Math.max(...ys)
    const mx = (bx1 - bx0) * 0.15
    const my = (by1 - by0) * 0.15
    x0 = Math.max(1, Math.floor(bx0 + mx))
    x1 = Math.min(w - 2, Math.ceil(bx1 - mx))
    y0 = Math.max(1, Math.floor(by0 + my))
    y1 = Math.min(h - 2, Math.ceil(by1 - my))
  }
  let n = 0
  let sum = 0
  let sum2 = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x
      const l = data[i - 1]! + data[i + 1]! + data[i - w]! + data[i + w]! - 4 * data[i]!
      sum += l
      sum2 += l * l
      n++
    }
  }
  if (n === 0) return 0
  const mean = sum / n
  return sum2 / n - mean * mean
}

/**
 * Perspective-rectifies the quad region of a gray image into a w×h raster with
 * bilinear sampling. Intended for small outputs (signatures, thumbnails); full-size
 * rectification uses OpenCV.
 */
export function warpGray(img: GrayImage, q: Quad, w: number, h: number): GrayImage {
  const H = rectToQuad(q, w, h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = applyH(H, { x, y })
      out[y * w + x] = sampleGray(img, p.x, p.y)
    }
  }
  return { width: w, height: h, data: out }
}
