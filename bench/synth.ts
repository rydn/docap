/**
 * Synthetic document scenes with exact ground truth: a procedurally generated page
 * (or a supplied page raster) projected through a pinhole camera onto a textured,
 * cluttered background, with lighting gradients, shadows, blur and sensor noise.
 * Shared by unit tests and the accuracy benchmark.
 */
import { applyH, homography } from '../src/pipeline/homography'
import type { Point, Quad, RGBAImage } from '../src/pipeline/types'

export type Rand = () => number

export function rng(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

export interface PageOptions {
  width: number
  height: number
  paper?: [number, number, number]
  /** 0 = blank page. */
  density?: number
  photo?: boolean
}

/** A page with margins, headings, paragraphs of "text" strokes and optional figure. */
export function renderPage(r: Rand, o: PageOptions): RGBAImage {
  const { width: w, height: h } = o
  const paper = o.paper ?? [240 + r() * 15, 238 + r() * 15, 230 + r() * 22]
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const n = (r() - 0.5) * 6
    data[i * 4] = clamp(paper[0] + n)
    data[i * 4 + 1] = clamp(paper[1] + n)
    data[i * 4 + 2] = clamp(paper[2] + n)
    data[i * 4 + 3] = 255
  }
  const fill = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
        const i = (y * w + x) * 4
        data[i] = c[0]
        data[i + 1] = c[1]
        data[i + 2] = c[2]
      }
    }
  }
  const density = o.density ?? 0.5 + r() * 0.5
  if (density <= 0) return { width: w, height: h, data }
  const margin = w * (0.07 + r() * 0.06)
  const lineH = h * (0.012 + r() * 0.01)
  const ink: [number, number, number] = r() < 0.8 ? [25, 25, 30] : [20, 40, 120]
  let y = margin
  if (r() < 0.7) {
    fill(margin, y, margin + (w - 2 * margin) * (0.3 + r() * 0.4), y + lineH * 2, ink)
    y += lineH * 4
  }
  if (o.photo ?? r() < 0.35) {
    const ph = h * (0.15 + r() * 0.15)
    const pw = (w - 2 * margin) * (0.5 + r() * 0.5)
    const c1 = [r() * 255, r() * 255, r() * 255]
    const c2 = [r() * 255, r() * 255, r() * 255]
    for (let yy = 0; yy < ph; yy++) {
      for (let xx = 0; xx < pw; xx++) {
        const t = (xx / pw + yy / ph) / 2
        const px = Math.floor(margin + xx)
        const py = Math.floor(y + yy)
        if (py >= h) continue
        const i = (py * w + px) * 4
        data[i] = c1[0]! * (1 - t) + c2[0]! * t
        data[i + 1] = c1[1]! * (1 - t) + c2[1]! * t
        data[i + 2] = c1[2]! * (1 - t) + c2[2]! * t
      }
    }
    y += ph + lineH * 2
  }
  while (y < h - margin - lineH) {
    // paragraph
    const lines = 3 + Math.floor(r() * 8)
    for (let l = 0; l < lines && y < h - margin - lineH; l++) {
      let x = margin
      const end = l === lines - 1 ? margin + (w - 2 * margin) * (0.3 + r() * 0.6) : w - margin
      while (x < end) {
        const wordW = lineH * (1 + r() * 5)
        if (r() < density) fill(x, y + lineH * 0.2, Math.min(end, x + wordW), y + lineH * 0.8, ink)
        x += wordW + lineH * 0.6
      }
      y += lineH * 1.7
    }
    y += lineH * 1.5
  }
  return { width: w, height: h, data }
}

export type BackgroundKind = 'wood' | 'desk' | 'fabric' | 'dark' | 'light' | 'clutter' | 'paperlike'

export function renderBackground(r: Rand, w: number, h: number, kind: BackgroundKind, clutter: 'rects' | 'blobs' = 'rects'): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4)
  const base: [number, number, number] =
    kind === 'wood'
      ? [120 + r() * 60, 80 + r() * 40, 40 + r() * 30]
      : kind === 'dark'
        ? [20 + r() * 40, 20 + r() * 40, 25 + r() * 40]
        : kind === 'light'
          ? [190 + r() * 40, 190 + r() * 40, 185 + r() * 40]
          : kind === 'paperlike'
            ? [215 + r() * 25, 212 + r() * 25, 205 + r() * 25]
            : [60 + r() * 140, 60 + r() * 140, 60 + r() * 140]
  const freq = 0.02 + r() * 0.08
  const phase = r() * 10
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      if (kind === 'wood') v = Math.sin((y + Math.sin(x * 0.01 + phase) * 30) * freq) * 18 + (r() - 0.5) * 10
      else if (kind === 'fabric') v = (Math.sin(x * 0.9) * Math.sin(y * 0.9)) * 14 + (r() - 0.5) * 16
      else v = (r() - 0.5) * 14
      const i = (y * w + x) * 4
      data[i] = clamp(base[0] + v)
      data[i + 1] = clamp(base[1] + v)
      data[i + 2] = clamp(base[2] + v)
      data[i + 3] = 255
    }
  }
  if (kind === 'clutter' || kind === 'desk' || r() < 0.4) {
    const n = 2 + Math.floor(r() * 6)
    for (let k = 0; k < n; k++) {
      const cx = r() * w
      const cy = r() * h
      const rw = (0.05 + r() * 0.25) * w
      const rh = (0.05 + r() * 0.25) * h
      const ang = r() * Math.PI
      const c = [r() * 255, r() * 255, r() * 255]
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const ext = Math.hypot(rw, rh)
      for (let y = Math.max(0, Math.floor(cy - ext)); y < Math.min(h, cy + ext); y++) {
        for (let x = Math.max(0, Math.floor(cx - ext)); x < Math.min(w, cx + ext); x++) {
          const dx = x - cx
          const dy = y - cy
          const u = dx * ca + dy * sa
          const v = -dx * sa + dy * ca
          const inside = clutter === 'rects' ? Math.abs(u) < rw / 2 && Math.abs(v) < rh / 2 : (u / (rw / 2)) ** 2 + (v / (rh / 2)) ** 2 < 1
          if (inside) {
            const i = (y * w + x) * 4
            data[i] = c[0]!
            data[i + 1] = c[1]!
            data[i + 2] = c[2]!
          }
        }
      }
    }
  }
  return { width: w, height: h, data }
}

export interface Pose {
  rx: number
  ry: number
  rz: number
  distance: number
  tx: number
  ty: number
}

/** Pinhole projection of a docW×docH rectangle; returns TL,TR,BR,BL image corners. */
export function project(docW: number, docH: number, pose: Pose, f: number, imgW: number, imgH: number): Quad {
  const { rx, ry, rz } = pose
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)
  const R = [
    [cz * cy, cz * sy * sx - sz * cx],
    [sz * cy, sz * sy * sx + cz * cx],
    [-sy, cy * sx],
  ]
  const u0 = (imgW - 1) / 2
  const v0 = (imgH - 1) / 2
  const corners: Point[] = [
    { x: -docW / 2, y: -docH / 2 },
    { x: docW / 2, y: -docH / 2 },
    { x: docW / 2, y: docH / 2 },
    { x: -docW / 2, y: docH / 2 },
  ]
  return corners.map(({ x, y }) => {
    const X = R[0]![0]! * x + R[0]![1]! * y + pose.tx * docH
    const Y = R[1]![0]! * x + R[1]![1]! * y + pose.ty * docH
    const Z = R[2]![0]! * x + R[2]![1]! * y + pose.distance * docH
    return { x: u0 + (f * X) / Z, y: v0 + (f * Y) / Z }
  }) as Quad
}

function sampleRGBA(img: RGBAImage, x: number, y: number, out: number[]): void {
  const { width: w, height: h, data } = img
  const cx = Math.min(Math.max(x, 0), w - 1)
  const cy = Math.min(Math.max(y, 0), h - 1)
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const ax = cx - x0
  const ay = cy - y0
  for (let c = 0; c < 3; c++) {
    const a = data[(y0 * w + x0) * 4 + c]! * (1 - ax) + data[(y0 * w + x1) * 4 + c]! * ax
    const b = data[(y1 * w + x0) * 4 + c]! * (1 - ax) + data[(y1 * w + x1) * 4 + c]! * ax
    out[c] = a * (1 - ay) + b * ay
  }
}

export interface SceneOptions {
  width: number
  height: number
  page: RGBAImage
  background: RGBAImage
  quad: Quad
  /** Supersampling per axis for anti-aliased edges. */
  ss?: number
  /** Multiplicative light falloff strength 0..1. */
  vignette?: number
  /** Directional light gradient strength 0..1. */
  gradient?: number
  /** Soft shadow band across the scene (e.g. phone/hand shadow) 0..1. */
  shadow?: number
  noise?: number
  /** Gaussian blur sigma (defocus/motion), px. */
  blur?: number
  r: Rand
}

/** Composites the page onto the background through the quad's homography. */
export function renderScene(o: SceneOptions): RGBAImage {
  const { width: w, height: h, page, background, quad, r } = o
  const ss = o.ss ?? 2
  // Image → page mapping; page pixel edges (-0.5) land exactly on the quad.
  const toPage = homography(quad, [
    { x: -0.5, y: -0.5 },
    { x: page.width - 0.5, y: -0.5 },
    { x: page.width - 0.5, y: page.height - 0.5 },
    { x: -0.5, y: page.height - 0.5 },
  ])
  const data = new Uint8ClampedArray(w * h * 4)
  const c = [0, 0, 0]
  const acc = [0, 0, 0]
  const gdir = r() * Math.PI * 2
  const gx = Math.cos(gdir)
  const gy = Math.sin(gdir)
  const shadowAng = r() * Math.PI
  const sx = Math.cos(shadowAng)
  const sy = Math.sin(shadowAng)
  const shadowOff = (r() - 0.5) * Math.hypot(w, h) * 0.6
  const shadowWidth = Math.hypot(w, h) * (0.1 + r() * 0.2)
  const xs = quad.map((p) => p.x)
  const ys = quad.map((p) => p.y)
  const bx0 = Math.min(...xs) - 2
  const bx1 = Math.max(...xs) + 2
  const by0 = Math.min(...ys) - 2
  const by1 = Math.max(...ys) + 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      acc[0] = acc[1] = acc[2] = 0
      const near = x >= bx0 && x <= bx1 && y >= by0 && y <= by1
      const n = near ? ss : 1
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const px = x + (i + 0.5) / n - 0.5
          const py = y + (j + 0.5) / n - 0.5
          const p = near ? applyH(toPage, { x: px, y: py }) : { x: -1e9, y: -1e9 }
          if (p.x >= -0.5 && p.y >= -0.5 && p.x <= page.width - 0.5 && p.y <= page.height - 0.5) {
            sampleRGBA(page, p.x, p.y, c)
          } else {
            const bi = (Math.min(h - 1, Math.max(0, Math.round(py))) * w + Math.min(w - 1, Math.max(0, Math.round(px)))) * 4
            c[0] = background.data[bi]!
            c[1] = background.data[bi + 1]!
            c[2] = background.data[bi + 2]!
          }
          acc[0]! += c[0]!
          acc[1]! += c[1]!
          acc[2]! += c[2]!
        }
      }
      const nn = n * n
      const u = (x / w - 0.5) * 2
      const v = (y / h - 0.5) * 2
      let light = 1 - (o.vignette ?? 0) * 0.35 * (u * u + v * v)
      light *= 1 + (o.gradient ?? 0) * 0.35 * (u * gx + v * gy)
      const sd = Math.abs(x * sx + y * sy - shadowOff - (w * sx + h * sy) / 2)
      if (sd < shadowWidth) light *= 1 - (o.shadow ?? 0) * 0.45 * (1 - sd / shadowWidth) ** 0.5
      const noise = o.noise ?? 0
      const k = (y * w + x) * 4
      for (let ch = 0; ch < 3; ch++) data[k + ch] = clamp((acc[ch]! / nn) * light + (r() - 0.5) * 2 * noise)
      data[k + 3] = 255
    }
  }
  const out = { width: w, height: h, data }
  return o.blur && o.blur > 0 ? blurRGBA(out, o.blur) : out
}

export function blurRGBA(img: RGBAImage, sigma: number): RGBAImage {
  const rad = Math.max(1, Math.ceil(sigma * 3))
  const k: number[] = []
  let s = 0
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    k.push(v)
    s += v
  }
  for (let i = 0; i < k.length; i++) k[i]! /= s
  const { width: w, height: h, data } = img
  const tmp = new Float32Array(w * h * 4)
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        let a = 0
        for (let i = -rad; i <= rad; i++) a += data[(y * w + Math.min(w - 1, Math.max(0, x + i))) * 4 + c]! * k[i + rad]!
        tmp[(y * w + x) * 4 + c] = a
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        let a = 0
        for (let i = -rad; i <= rad; i++) a += tmp[(Math.min(h - 1, Math.max(0, y + i)) * w + x) * 4 + c]! * k[i + rad]!
        out[(y * w + x) * 4 + c] = a
      }
  return { width: w, height: h, data: out }
}

export interface SyntheticCase {
  image: RGBAImage
  quad: Quad
  /** Physical width/height of the page. */
  aspect: number
  page: RGBAImage
  meta: Record<string, string | number>
}

const KINDS: BackgroundKind[] = ['wood', 'desk', 'fabric', 'dark', 'light', 'clutter', 'paperlike']
const PAPERS: [string, number, number][] = [
  ['A4', 210, 297],
  ['Letter', 215.9, 279.4],
  ['Receipt', 80, 200],
  ['Card', 85.6, 53.98],
  ['A5', 148, 210],
]

/**
 * A random but realistic handheld capture: camera tilt up to ~30°, document filling
 * 25–85% of the frame, assorted backgrounds, lighting, blur and noise.
 */
export function randomCase(seed: number, width = 960, height = 720, opts: { hard?: boolean } = {}): SyntheticCase {
  const r = rng(seed)
  const kind = KINDS[Math.floor(r() * KINDS.length)]!
  const [paperName, pw, ph] = PAPERS[Math.floor(r() * PAPERS.length)]!
  const f = 0.6 * Math.hypot(width, height) * (0.85 + r() * 0.3)
  const hard = opts.hard ?? false
  let quad: Quad | null = null
  for (let tries = 0; tries < 200 && !quad; tries++) {
    const tilt = hard ? 0.65 : 0.5
    const pose: Pose = {
      rx: (r() - 0.5) * tilt * 2,
      ry: (r() - 0.5) * tilt * 2,
      rz: (r() - 0.5) * (r() < 0.2 ? Math.PI / 2 : 0.6),
      distance: 0,
      tx: (r() - 0.5) * 0.35,
      ty: (r() - 0.5) * 0.35,
    }
    // Choose a distance so the document fills a target share of the frame height.
    const fill = 0.35 + r() * 0.55
    pose.distance = (f / (fill * Math.min(width, height))) * (Math.max(pw, ph) / ph)
    const q = project(pw, ph, pose, f, width, height)
    // Real users frame the page with some margin; the hard suite allows near-edge corners.
    const m = hard ? 6 : 0.03 * Math.min(width, height)
    if (q.every((p) => p.x > m && p.y > m && p.x < width - m && p.y < height - m)) quad = q
  }
  if (!quad) throw new Error(`could not place document for seed ${seed}`)
  const pageW = Math.round(500 * Math.min(1, pw / ph) + 200)
  const page = renderPage(r, { width: pageW, height: Math.round((pageW * ph) / pw) })
  const background = renderBackground(r, width, height, kind)
  const blur = r() < 0.3 ? 0.4 + r() * (hard ? 1.6 : 0.8) : 0
  const image = renderScene({
    width,
    height,
    page,
    background,
    quad,
    r,
    vignette: r(),
    gradient: r(),
    shadow: r() < 0.4 ? r() : 0,
    noise: 2 + r() * (hard ? 10 : 5),
    blur,
  })
  return { image, quad, aspect: pw / ph, page, meta: { seed, background: kind, paper: paperName, blur: +blur.toFixed(2) } }
}
