import { applyH, homography } from './homography'
import { resampleArea } from './image'
import { area } from './quad'
import type { GrayImage, Quad, RGBAImage } from './types'

export type EnhanceMode = 'original' | 'color' | 'gray' | 'bw'

/** Catmull-Rom (a = −0.5) cubic weights for fractional offset t. */
function cubicWeights(t: number, w: Float32Array): void {
  const t2 = t * t
  const t3 = t2 * t
  w[0] = -0.5 * t3 + t2 - 0.5 * t
  w[1] = 1.5 * t3 - 2.5 * t2 + 1
  w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t
  w[3] = 0.5 * t3 - 0.5 * t2
}

/**
 * Perspective-rectifies the quad into an outW×outH RGBA image with bicubic sampling.
 * The quad corners are the document's outer boundary and map to the outer pixel edges
 * of the output. When the output is much smaller than the source region, the source is
 * area-downsampled first so the warp doesn't alias.
 */
export function rectify(src: RGBAImage, quad: Quad, outW: number, outH: number, inset = 0.0025): RGBAImage {
  let img = src
  // Pull the sampled region a hair inside the detected border so anti-aliased
  // background never shows as a dark line along the page edge.
  const full = homography(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    quad,
  )
  let q = [
    applyH(full, { x: inset, y: inset }),
    applyH(full, { x: 1 - inset, y: inset }),
    applyH(full, { x: 1 - inset, y: 1 - inset }),
    applyH(full, { x: inset, y: 1 - inset }),
  ] as Quad
  const ratio = (outW * outH) / Math.max(1, area(quad))
  if (ratio < 0.45) {
    const f = Math.min(1, Math.sqrt(ratio) * 1.3)
    const w = Math.max(1, Math.round(src.width * f))
    const h = Math.max(1, Math.round(src.height * f))
    const data = new Uint8ClampedArray(resampleArea(src.data, src.width, src.height, 4, w, h))
    img = { width: w, height: h, data }
    q = q.map((p) => ({ x: (p.x + 0.5) * (w / src.width) - 0.5, y: (p.y + 0.5) * (h / src.height) - 0.5 })) as Quad
  }
  const H = homography(
    [
      { x: -0.5, y: -0.5 },
      { x: outW - 0.5, y: -0.5 },
      { x: outW - 0.5, y: outH - 0.5 },
      { x: -0.5, y: outH - 0.5 },
    ],
    q,
  )
  const { width: sw, height: sh, data: sd } = img
  const out = new Uint8ClampedArray(outW * outH * 4)
  const wx = new Float32Array(4)
  const wy = new Float32Array(4)
  const maxX = sw - 1
  const maxY = sh - 1
  for (let y = 0; y < outH; y++) {
    // Projective mapping is linear in x for numerator and denominator: step incrementally.
    let nx = H[1] * y + H[2]
    let ny = H[4] * y + H[5]
    let d = H[7] * y + H[8]
    let o = y * outW * 4
    for (let x = 0; x < outW; x++, nx += H[0], ny += H[3], d += H[6], o += 4) {
      const fx = nx / d
      const fy = ny / d
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      cubicWeights(fx - ix, wx)
      cubicWeights(fy - iy, wy)
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < 4; j++) {
        let yy = iy - 1 + j
        yy = yy < 0 ? 0 : yy > maxY ? maxY : yy
        const row = yy * sw
        const wj = wy[j]!
        for (let i = 0; i < 4; i++) {
          let xx = ix - 1 + i
          xx = xx < 0 ? 0 : xx > maxX ? maxX : xx
          const k = (row + xx) * 4
          const w = wj * wx[i]!
          r += sd[k]! * w
          g += sd[k + 1]! * w
          b += sd[k + 2]! * w
        }
      }
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = 255
    }
  }
  return { width: outW, height: outH, data: out }
}

/** Separable max (dilate=true) or min filter with a square window of radius r, per channel. */
function morph(src: Float32Array, w: number, h: number, ch: number, r: number, dilate: boolean): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const pick = dilate ? Math.max : Math.min
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < ch; c++) {
        let v = src[(y * w + x) * ch + c]!
        for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) v = pick(v, src[(y * w + i) * ch + c]!)
        tmp[(y * w + x) * ch + c] = v
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < ch; c++) {
        let v = tmp[(y * w + x) * ch + c]!
        for (let i = Math.max(0, y - r); i <= Math.min(h - 1, y + r); i++) v = pick(v, tmp[(i * w + x) * ch + c]!)
        out[(y * w + x) * ch + c] = v
      }
  return out
}

/** Separable box blur (radius r) applied `passes` times — approximates a Gaussian. */
function boxBlur(src: Float32Array, w: number, h: number, ch: number, r: number, passes = 3): Float32Array {
  let a = src
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(a.length)
    const out = new Float32Array(a.length)
    for (let y = 0; y < h; y++)
      for (let c = 0; c < ch; c++) {
        let s = 0
        let n = 0
        for (let i = 0; i <= Math.min(w - 1, r); i++, n++) s += a[(y * w + i) * ch + c]!
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * ch + c] = s / n
          const add = x + r + 1
          const rem = x - r
          if (add < w) {
            s += a[(y * w + add) * ch + c]!
            n++
          }
          if (rem >= 0) {
            s -= a[(y * w + rem) * ch + c]!
            n--
          }
        }
      }
    for (let x = 0; x < w; x++)
      for (let c = 0; c < ch; c++) {
        let s = 0
        let n = 0
        for (let i = 0; i <= Math.min(h - 1, r); i++, n++) s += tmp[(i * w + x) * ch + c]!
        for (let y = 0; y < h; y++) {
          out[(y * w + x) * ch + c] = s / n
          const add = y + r + 1
          const rem = y - r
          if (add < h) {
            s += tmp[(add * w + x) * ch + c]!
            n++
          }
          if (rem >= 0) {
            s -= tmp[(rem * w + x) * ch + c]!
            n--
          }
        }
      }
    a = out
  }
  return a
}

/** Bilinear lookup into a small multi-channel field covering the full image. */
function fieldSampler(field: Float32Array, fw: number, fh: number, ch: number, W: number, H: number) {
  const sx = fw / W
  const sy = fh / H
  return (x: number, y: number, c: number): number => {
    const fx = Math.min(fw - 1, Math.max(0, (x + 0.5) * sx - 0.5))
    const fy = Math.min(fh - 1, Math.max(0, (y + 0.5) * sy - 0.5))
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const x1 = Math.min(fw - 1, x0 + 1)
    const y1 = Math.min(fh - 1, y0 + 1)
    const ax = fx - x0
    const ay = fy - y0
    const a = field[(y0 * fw + x0) * ch + c]! * (1 - ax) + field[(y0 * fw + x1) * ch + c]! * ax
    const b = field[(y1 * fw + x0) * ch + c]! * (1 - ax) + field[(y1 * fw + x1) * ch + c]! * ax
    return a * (1 - ay) + b * ay
  }
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p
  let acc = 0
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i]!
    if (acc >= target) return i
  }
  return hist.length - 1
}

/**
 * Estimates the paper + illumination field at low resolution.
 * 1. A morphological close erases dark ink (text, lines).
 * 2. Pixels are classified as paper when bright, unsaturated and untextured — photos,
 *    coloured boxes and illustrations are not paper and must not define "white".
 * 3. The field is interpolated from paper pixels only with multi-scale normalised
 *    convolution, so holes (figures) are filled from the surrounding paper.
 * Clamped from below so nothing is brightened more than ~2.2x.
 */
function illumination(img: RGBAImage): { field: Float32Array; fw: number; fh: number } {
  const s = Math.min(1, 360 / Math.max(img.width, img.height))
  const fw = Math.max(1, Math.round(img.width * s))
  const fh = Math.max(1, Math.round(img.height * s))
  const n = fw * fh
  const small = resampleArea(img.data, img.width, img.height, 4, fw, fh)
  const rgb = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = small[i * 4]!
    rgb[i * 3 + 1] = small[i * 4 + 1]!
    rgb[i * 3 + 2] = small[i * 4 + 2]!
  }
  const r = Math.max(2, Math.round(Math.max(fw, fh) / 40))
  const closed = morph(morph(rgb, fw, fh, 3, r, true), fw, fh, 3, r, false)

  // Paper classification on the closed image.
  const lum = new Float32Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) {
    lum[i] = luma(closed[i * 3]!, closed[i * 3 + 1]!, closed[i * 3 + 2]!)
    hist[Math.min(255, Math.round(lum[i]!))]!++
  }
  const paperLevel = Math.max(1, percentile(hist, n, 0.9))
  const mean = boxBlur(lum, fw, fh, 1, 2, 1)
  const sq = boxBlur(lum.map((v) => v * v), fw, fh, 1, 2, 1)
  // Paper chromaticity: median over the brightest pixels. Shading scales brightness but
  // keeps chromaticity, so distance in (r,g)/(r+g+b) separates paper (tinted or shadowed)
  // from pale coloured regions that a plain saturation test would mistake for paper.
  const chroma = (i: number): [number, number] => {
    const s = closed[i * 3]! + closed[i * 3 + 1]! + closed[i * 3 + 2]! + 1e-3
    return [closed[i * 3]! / s, closed[i * 3 + 1]! / s]
  }
  const rs: number[] = []
  const gs: number[] = []
  for (let i = 0; i < n; i++) {
    if (lum[i]! < 0.85 * paperLevel) continue
    const [cr, cg] = chroma(i)
    rs.push(cr)
    gs.push(cg)
  }
  const med = (a: number[]) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1]! : 1 / 3)
  const pr = med(rs)
  const pg = med(gs)
  const mask = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const [cr, cg] = chroma(i)
    const dc = Math.hypot(cr - pr, cg - pg)
    const sd = Math.sqrt(Math.max(0, sq[i]! - mean[i]! * mean[i]!))
    if (lum[i]! > 0.5 * paperLevel && dc < 0.025 && sd < 0.06 * paperLevel + 4) mask[i] = 1
  }

  // Multi-scale normalised convolution: smallest radius with enough paper support wins.
  const field = new Float32Array(n * 3)
  const filled = new Uint8Array(n)
  const weighted = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) weighted[i * 3 + c] = closed[i * 3 + c]! * mask[i]!
  let remaining = n
  for (let rad = r; remaining > 0 && rad <= Math.max(fw, fh) * 2; rad *= 2) {
    const num = boxBlur(weighted, fw, fh, 3, rad, 2)
    const den = boxBlur(mask, fw, fh, 1, rad, 2)
    for (let i = 0; i < n; i++) {
      if (filled[i] || den[i]! < 0.15) continue
      for (let c = 0; c < 3; c++) field[i * 3 + c] = num[i * 3 + c]! / den[i]!
      filled[i] = 1
      remaining--
    }
  }
  if (remaining > 0) {
    // No paper found at all (e.g. a photo print): fall back to the smoothed image.
    const fallback = boxBlur(closed, fw, fh, 3, r)
    for (let i = 0; i < n; i++) if (!filled[i]) for (let c = 0; c < 3; c++) field[i * 3 + c] = fallback[i * 3 + c]!
  }
  const smooth = boxBlur(field, fw, fh, 3, r, 2)
  const floor = paperLevel * 0.45
  for (let i = 0; i < smooth.length; i++) if (smooth[i]! < floor) smooth[i] = floor
  return { field: smooth, fw, fh }
}

/**
 * Scanner-style enhancement.
 * - color: divides out the illumination field, which removes shadows and gradients and
 *   white-balances to the paper, then stretches the black point.
 * - gray: the same, in luminance.
 * - bw: illumination-normalised luminance, local-mean adaptive threshold, with near-white
 *   forced to white so paper texture doesn't speckle.
 */
export function enhance(img: RGBAImage, mode: EnhanceMode): RGBAImage {
  if (mode === 'original') return img
  const { width: W, height: H, data } = img
  const { field, fw, fh } = illumination(img)
  const bg = fieldSampler(field, fw, fh, 3, W, H)
  const out = new Uint8ClampedArray(W * H * 4)
  const lum = new Float32Array(W * H)
  const hist = new Uint32Array(256)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4
      const r = Math.min(255, (data[k]! * 248) / bg(x, y, 0))
      const g = Math.min(255, (data[k + 1]! * 248) / bg(x, y, 1))
      const b = Math.min(255, (data[k + 2]! * 248) / bg(x, y, 2))
      out[k] = r
      out[k + 1] = g
      out[k + 2] = b
      out[k + 3] = 255
      const l = luma(r, g, b)
      lum[y * W + x] = l
      hist[l | 0]!++
    }
  }

  if (mode === 'bw') {
    // Local mean at quarter resolution (the window is large, so this is exact enough).
    const q = 4
    const lw = Math.max(1, Math.round(W / q))
    const lh = Math.max(1, Math.round(H / q))
    const low = resampleArea(lum, W, H, 1, lw, lh)
    const rad = Math.max(2, Math.round(Math.min(W, H) / 60 / q))
    const mean = boxBlur(low, lw, lh, 1, rad, 2)
    const m = fieldSampler(mean, lw, lh, 1, W, H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const l = lum[y * W + x]!
        const ink = l < 205 && l < m(x, y, 0) - 14
        const k = (y * W + x) * 4
        const v = ink ? 0 : 255
        out[k] = out[k + 1] = out[k + 2] = v
      }
    return { width: W, height: H, data: out }
  }

  const black = Math.min(90, percentile(hist, W * H, 0.01))
  const white = Math.max(black + 64, Math.min(252, percentile(hist, W * H, 0.995)))
  const a = 255 / (white - black)
  for (let i = 0; i < W * H; i++) {
    const k = i * 4
    if (mode === 'gray') {
      const v = (lum[i]! - black) * a
      out[k] = out[k + 1] = out[k + 2] = v
    } else {
      out[k] = (out[k]! - black) * a
      out[k + 1] = (out[k + 1]! - black) * a
      out[k + 2] = (out[k + 2]! - black) * a
    }
  }
  return { width: W, height: H, data: out }
}

/** Luminance at reduced resolution for edge refinement on large stills. */
export function grayAt(img: RGBAImage, maxSide: number): GrayImage {
  const f = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * f))
  const h = Math.max(1, Math.round(img.height * f))
  const n = img.width * img.height
  const full = new Float32Array(n)
  const d = img.data
  for (let i = 0, k = 0; i < n; i++, k += 4) full[i] = 0.299 * d[k]! + 0.587 * d[k + 1]! + 0.114 * d[k + 2]!
  if (f === 1) return { width: w, height: h, data: full }
  return { width: w, height: h, data: resampleArea(full, img.width, img.height, 1, w, h) }
}
