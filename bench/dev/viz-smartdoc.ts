/** Crops around each corner of SmartDoc frames: GT (green), coarse (blue), refined (red). */
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { detectDocument } from '../../src/pipeline/detect'
import { fitSize, resizeRGBA } from '../../src/pipeline/image'
import { dist } from '../../src/pipeline/quad'
import type { Quad } from '../../src/pipeline/types'
import { nodeRunner } from '../node-runtime'
import { smartdoc } from '../real-datasets'

const [out, dir, bg] = process.argv.slice(2)
const runner = await nodeRunner('lcnet100')
const tiles: Buffer[] = []
let n = 0
for await (const c of smartdoc(dir!, 37, 1280)) {
  if (!c.group.endsWith(bg!)) continue
  const size = fitSize(c.image.width, c.image.height, 720)
  const img = resizeRGBA(c.image, size.width, size.height)
  const res = await detectDocument(img, runner, { minCornerScore: 0.2 })
  if (!res.detection || !res.coarse) continue
  const s = img.width / c.image.width
  const gt = c.truth!.map((p) => ({ x: (p.x + 0.5) * s - 0.5, y: (p.y + 0.5) * s - 0.5 })) as Quad
  const ref = res.detection.quad
  const errR = Math.max(...ref.map((p, i) => dist(p, gt[i]!)))
  const errC = Math.max(...res.coarse.map((p, i) => dist(p, gt[i]!)))
  if (errR < errC + 1.5) continue // only cases where refinement made it worse
  const pts = (q: Quad, color: string) => q.map((p) => `<circle cx="${p.x + 0.5}" cy="${p.y + 0.5}" r="2.5" fill="${color}"/>`).join('') + `<polygon points="${q.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' ')}" fill="none" stroke="${color}" stroke-width="0.8"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}">${pts(gt, '#0f0')}${pts(res.coarse, '#39f')}${pts(ref, '#f33')}</svg>`
  const composed = await sharp(Buffer.from(img.data.buffer), { raw: { width: img.width, height: img.height, channels: 4 } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer()
  // worst refined corner crop
  const k = ref.map((p, i) => dist(p, gt[i]!)).reduce((bi, d, i, a) => (d > a[bi]! ? i : bi), 0)
  const cx = Math.round(gt[k]!.x)
  const cy = Math.round(gt[k]!.y)
  const half = 40
  const left = Math.max(0, Math.min(img.width - 2 * half, cx - half))
  const top = Math.max(0, Math.min(img.height - 2 * half, cy - half))
  tiles.push(await sharp(composed).extract({ left, top, width: 2 * half, height: 2 * half }).resize(240, 240, { kernel: 'nearest' }).png().toBuffer())
  console.log(c.id, 'coarseErr', errC.toFixed(1), 'refinedErr', errR.toFixed(1), 'corner', k, 'support', res.detection.edgeSupport?.toFixed(2))
  if (++n >= 8) break
}
await sharp({ create: { width: 4 * 240, height: Math.ceil(tiles.length / 4) * 240, channels: 3, background: '#111' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % 4) * 240, top: Math.floor(i / 4) * 240 })))
  .jpeg({ quality: 80 })
  .toFile(`${out}/smartdoc-corners.jpg`)
void readFileSync
