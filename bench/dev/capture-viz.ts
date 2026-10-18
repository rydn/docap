/** Renders a synthetic photo and its processed outputs side by side for eyeballing. */
import sharp from 'sharp'
import { processCapture } from '../../src/pipeline/capture'
import type { RGBAImage } from '../../src/pipeline/types'
import { project, renderBackground, renderPage, renderScene, rng } from '../synth'

const out = process.argv[2]!
const r = rng(Number(process.argv[3] ?? 7))
const W = 1600
const H = 1200
const page = renderPage(r, { width: 630, height: 891, photo: true, density: 0.8 })
const quad = project(210, 297, { rx: 0.35, ry: -0.25, rz: 0.15, distance: 1.7, tx: 0, ty: 0 }, 0.6 * Math.hypot(W, H), W, H)
const image = renderScene({ width: W, height: H, page, background: renderBackground(r, W, H, 'wood'), quad, r, noise: 4, shadow: 1, gradient: 1, vignette: 1 })

const png = (img: RGBAImage, h: number) =>
  sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } })
    .resize({ height: h })
    .png()
    .toBuffer()

const tiles = [await png(image, 600)]
for (const mode of ['original', 'color', 'bw'] as const) {
  const t0 = performance.now()
  const res = processCapture(image, quad, { enhance: mode })
  console.log(mode, `${res.image.width}x${res.image.height}`, (performance.now() - t0).toFixed(0) + 'ms', res.snapped)
  tiles.push(await png(res.image, 600))
}
const metas = await Promise.all(tiles.map((t) => sharp(t).metadata()))
const total = metas.reduce((s, m) => s + m.width! + 10, 0)
let x = 0
await sharp({ create: { width: total, height: 600, channels: 3, background: '#222' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (x += i ? metas[i - 1]!.width! + 10 : 0), top: 0 })))
  .jpeg({ quality: 75 })
  .toFile(`${out}/capture.jpg`)
