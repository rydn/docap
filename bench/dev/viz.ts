/** Renders synthetic cases with ground truth (green), coarse model (blue) and final (red) quads. */
import sharp from 'sharp'
import { randomCase } from '../synth'
import { detectDocument } from '../../src/pipeline/detect'
import { fitSize, resizeRGBA } from '../../src/pipeline/image'
import { postprocess, preprocess } from '../../src/pipeline/model'
import type { Quad } from '../../src/pipeline/types'
import { nodeRunner } from '../node-runtime'

const out = process.argv[2]!
const seeds = process.argv.slice(3).map((s) => s.split(':'))
const runner = await nodeRunner('lcnet100')
const poly = (q: Quad | null, color: string, s: number) =>
  q ? `<polygon points="${q.map((p) => `${(p.x + 0.5) * s},${(p.y + 0.5) * s}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>` : ''

for (const [seedStr, hard] of seeds) {
  const seed = Number(seedStr)
  const c = randomCase(seed, 960, 720, { hard: hard === 'h' })
  const size = fitSize(960, 720, 720)
  const img = resizeRGBA(c.image, size.width, size.height)
  const res = await detectDocument(img, runner)
  const peaks = postprocess(await runner.run(preprocess(img)), img.width, img.height)
  const s = 960 / size.width
  const dots = peaks
    .map((p, i) => (p ? `<circle cx="${(p.point.x + 0.5) * s}" cy="${(p.point.y + 0.5) * s}" r="5" fill="${['#ff0', '#0ff', '#f0f', '#fff'][i]}"/><text x="${(p.point.x + 0.5) * s + 6}" y="${(p.point.y + 0.5) * s}" fill="#fff" font-size="14">${p.score.toFixed(2)}</text>` : ''))
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720">${poly(c.quad, '#0f0', 1)}${poly(res.coarse, '#39f', s)}${poly(res.detection?.quad ?? null, '#f33', s)}${dots}<text x="10" y="24" fill="#fff" font-size="18">${seed} ${res.failure ?? 'ok'}</text></svg>`
  const composed = await sharp(Buffer.from(c.image.data.buffer), { raw: { width: 960, height: 720, channels: 4 } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer()
  await sharp(composed)
    .resize(640)
    .jpeg({ quality: 70 })
    .toFile(`${out}/viz-${seed}.jpg`)
  console.log(seed, res.failure ?? 'ok', peaks.map((p) => p?.score.toFixed(2) ?? '--').join(' '))
}
