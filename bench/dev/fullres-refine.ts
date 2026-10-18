/** Does edge refinement on the full-resolution frame beat the upscaled model quad? (SmartDoc 1920x1080) */
import { detectDocument } from '../../src/pipeline/detect'
import { fitSize, resizeRGBA, toGray } from '../../src/pipeline/image'
import { quadIoU, rescaleQuad } from '../../src/pipeline/quad'
import { refineQuad } from '../../src/pipeline/refine'
import { nodeRunner } from '../node-runtime'
import { smartdoc } from '../real-datasets'

const [dir, stride] = process.argv.slice(2)
const runner = await nodeRunner('lcnet100')
const radii = [0.002, 0.004, 0.008]
const sums = { coarse: 0, ...Object.fromEntries(radii.map((r) => [r, 0])) } as Record<string, number>
let n = 0
for await (const c of smartdoc(dir!, Number(stride ?? 30), 4000)) {
  const size = fitSize(c.image.width, c.image.height, 720)
  const small = resizeRGBA(c.image, size.width, size.height)
  const res = await detectDocument(small, runner, { minCornerScore: 0.2, refine: false })
  if (!res.detection) continue
  const full = rescaleQuad(res.detection.quad, small.width, small.height, c.image.width, c.image.height)
  const gray = toGray(c.image)
  const diag = Math.hypot(gray.width, gray.height)
  sums.coarse! += quadIoU(full, c.truth!)
  for (const r of radii) sums[r]! += quadIoU(refineQuad(gray, full, { radius: Math.max(3, r * diag) }).quad, c.truth!)
  n++
}
for (const [k, v] of Object.entries(sums)) console.log(k.padEnd(8), (v / n).toFixed(4))
console.log('n', n)
