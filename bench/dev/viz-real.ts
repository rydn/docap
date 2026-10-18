/** Renders DocCorner cases (by index) with GT (green), coarse (blue), final (red), peaks. */
import sharp from 'sharp'
import { docCorner } from '../real-datasets'
import { detectDocument } from '../../src/pipeline/detect'
import { fitSize, resizeRGBA } from '../../src/pipeline/image'
import { postprocess, preprocess } from '../../src/pipeline/model'
import type { Quad } from '../../src/pipeline/types'
import { nodeRunner } from '../node-runtime'

const [out, dir, ...ids] = process.argv.slice(2)
const want = new Set(ids.map(Number))
const max = Math.max(...want)
const runner = await nodeRunner('lcnet100')
const poly = (q: Quad | null, color: string, s: number) =>
  q ? `<polygon points="${q.map((p) => `${(p.x + 0.5) * s},${(p.y + 0.5) * s}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3"/>` : ''
const tiles: Buffer[] = []
for await (const c of docCorner(dir!, 1280, max)) {
  const idx = Number(c.id.split('#')[1])
  if (!want.has(idx)) continue
  const size = fitSize(c.image.width, c.image.height, 720)
  const img = resizeRGBA(c.image, size.width, size.height)
  const res = await detectDocument(img, runner)
  const peaks = postprocess(await runner.run(preprocess(img)), img.width, img.height)
  const s = 1
  const dots = peaks.map((p, i) => (p ? `<circle cx="${p.point.x}" cy="${p.point.y}" r="6" fill="${['#ff0', '#0ff', '#f0f', '#fff'][i]}"/><text x="${p.point.x + 8}" y="${p.point.y}" fill="#ff0" font-size="16">${p.score.toFixed(2)}</text>` : '')).join('')
  const gt = c.truth ? (c.truth.map((p) => ({ x: (p.x + 0.5) * (img.width / c.image.width) - 0.5, y: (p.y + 0.5) * (img.height / c.image.height) - 0.5 })) as Quad) : null
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}">${poly(gt, '#0f0', s)}${poly(res.coarse, '#39f', s)}${poly(res.detection?.quad ?? null, '#f33', s)}${dots}<rect width="${img.width}" height="26" fill="#000a"/><text x="6" y="19" fill="#fff" font-size="16">#${idx} ${c.group.replace('doccorner/', '')} ${res.failure ?? 'ok'} ${img.width}x${img.height}</text></svg>`
  const composed = await sharp(Buffer.from(img.data.buffer), { raw: { width: img.width, height: img.height, channels: 4 } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer()
  tiles.push(await sharp(composed).resize(360, 360, { fit: 'contain', background: '#222' }).png().toBuffer())
}
const cols = 4
const rows = Math.ceil(tiles.length / cols)
await sharp({ create: { width: cols * 360, height: rows * 360, channels: 3, background: '#111' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 360, top: Math.floor(i / cols) * 360 })))
  .jpeg({ quality: 70 })
  .toFile(`${out}/real-grid.jpg`)
console.log('tiles', tiles.length)
