/** Signed per-side offset (px at analysis size, + = outward) of coarse and refined quads vs SmartDoc GT. */
import { detectDocument } from '../../src/pipeline/detect'
import { fitSize, resizeRGBA } from '../../src/pipeline/image'
import type { Point, Quad } from '../../src/pipeline/types'
import { nodeRunner } from '../node-runtime'
import { smartdoc } from '../real-datasets'

const [dir, strideArg] = process.argv.slice(2)
const runner = await nodeRunner('lcnet100')
const offsets = { coarse: [] as number[], refined: [] as number[] }
const big = { coarse: 0, refined: 0 }

function sideOffsets(q: Quad, gt: Quad): number[] {
  return [0, 1, 2, 3].map((i) => {
    const a = gt[i]!
    const b = gt[(i + 1) % 4]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len }
    const mid: Point = { x: (q[i]!.x + q[(i + 1) % 4]!.x) / 2, y: (q[i]!.y + q[(i + 1) % 4]!.y) / 2 }
    return (mid.x - a.x) * n.x + (mid.y - a.y) * n.y
  })
}

for await (const c of smartdoc(dir!, Number(strideArg ?? 30), 1280)) {
  const size = fitSize(c.image.width, c.image.height, 720)
  const img = resizeRGBA(c.image, size.width, size.height)
  const res = await detectDocument(img, runner, { minCornerScore: 0.2 })
  if (!res.detection || !res.coarse) continue
  const s = img.width / c.image.width
  const gt = c.truth!.map((p) => ({ x: (p.x + 0.5) * s - 0.5, y: (p.y + 0.5) * s - 0.5 })) as Quad
  for (const o of sideOffsets(res.coarse, gt)) {
    offsets.coarse.push(o)
    if (Math.abs(o) > 3) big.coarse++
  }
  for (const o of sideOffsets(res.detection.quad, gt)) {
    offsets.refined.push(o)
    if (Math.abs(o) > 3) big.refined++
  }
}
const stats = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const mean = a.reduce((p, c) => p + c, 0) / a.length
  return `n=${a.length} mean=${mean.toFixed(2)} median=${s[s.length >> 1]!.toFixed(2)} p10=${s[Math.floor(s.length * 0.1)]!.toFixed(2)} p90=${s[Math.floor(s.length * 0.9)]!.toFixed(2)} |>3px|=`
}
console.log('coarse ', stats(offsets.coarse) + big.coarse)
console.log('refined', stats(offsets.refined) + big.refined)
