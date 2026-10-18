import { beforeAll, describe, expect, it } from 'vitest'
import { nodeRunner } from '../../bench/node-runtime'
import { project, renderBackground, renderPage, renderScene, rng } from '../../bench/synth'
import { processCapture } from '@/pipeline/capture'
import { detectDocument } from '@/pipeline/detect'
import { fitSize, resizeRGBA, toGray } from '@/pipeline/image'
import type { HeatmapRunner } from '@/pipeline/model'
import { rescaleQuad } from '@/pipeline/quad'
import type { RGBAImage } from '@/pipeline/types'

let runner: HeatmapRunner
beforeAll(async () => {
  runner = await nodeRunner()
})

const W = 1600
const H = 1200
const F = 0.6 * Math.hypot(W, H)

function scene(seed: number, opts: { shadow?: number; gradient?: number } = {}) {
  const r = rng(seed)
  const page = renderPage(r, { width: 630, height: 891, photo: false, density: 0.8 })
  const pose = { rx: (r() - 0.5) * 0.6, ry: (r() - 0.5) * 0.6, rz: (r() - 0.5) * 0.3, distance: 1.7, tx: 0, ty: 0 }
  const quad = project(210, 297, pose, F, W, H)
  const image = renderScene({ width: W, height: H, page, background: renderBackground(r, W, H, 'wood'), quad, r, noise: 3, ...opts })
  return { page, quad, image }
}

/** Mean absolute luminance difference between two same-size images. */
function mad(a: RGBAImage, b: RGBAImage): number {
  const ga = toGray(a).data
  const gb = toGray(b).data
  let s = 0
  for (let i = 0; i < ga.length; i++) s += Math.abs(ga[i]! - gb[i]!)
  return s / ga.length
}

describe('processCapture', () => {
  it('detects, rectifies and deskews a photographed A4 page faithfully', async () => {
    for (const seed of [1, 2, 3]) {
      const { page, image } = scene(seed)
      const size = fitSize(W, H, 720)
      const small = resizeRGBA(image, size.width, size.height)
      const det = await detectDocument(small, runner)
      expect(det.detection).not.toBeNull()
      const quad = rescaleQuad(det.detection!.quad, size.width, size.height, W, H)
      // Rendered edges are crisp, so full-res refinement can remove the model's
      // synthetic-domain error; this test is about the geometry of the capture chain.
      const res = processCapture(image, quad, { enhance: 'original', refine: true })
      expect(res.snapped).toBe('ISO A/B')
      expect(Math.abs(res.image.width / res.image.height - 210 / 297)).toBeLessThan(0.002)
      const ref = resizeRGBA(page, res.image.width, res.image.height)
      // Text strokes are a few px wide: misregistration of >1–2px shows up immediately.
      expect(mad(res.image, ref)).toBeLessThan(14)
    }
  })

  it('removes shadows and lighting gradients in color mode', () => {
    const { image, quad } = scene(7, { shadow: 1, gradient: 1 })
    const plain = processCapture(image, quad, { enhance: 'original', refine: false })
    const enhanced = processCapture(image, quad, { enhance: 'color', refine: false })
    const paperSpread = (img: RGBAImage) => {
      // Spread of bright (paper) pixels: low means even illumination.
      const g = toGray(img).data
      const vals = Array.from(g).filter((v) => v > 0).sort((a, b) => a - b)
      const top = vals.slice(Math.floor(vals.length * 0.5))
      return top[Math.floor(top.length * 0.95)]! - top[Math.floor(top.length * 0.05)]!
    }
    expect(paperSpread(enhanced.image)).toBeLessThan(paperSpread(plain.image) * 0.5)
  })

  it('produces a clean binary image in bw mode', () => {
    const { image, quad } = scene(8, { shadow: 1 })
    const res = processCapture(image, quad, { enhance: 'bw', refine: false })
    const g = toGray(res.image).data
    let black = 0
    let other = 0
    for (const v of g) {
      if (v === 0) black++
      else if (v !== 255) other++
    }
    expect(other).toBe(0)
    // Ink coverage of a text page is a few percent, not a shadow-sized blob.
    expect(black / g.length).toBeGreaterThan(0.01)
    expect(black / g.length).toBeLessThan(0.3)
  })
})
