import { randomCase, rng } from '../synth'
import { toGray } from '../../src/pipeline/image'
import { dist } from '../../src/pipeline/quad'
import { refineQuad } from '../../src/pipeline/refine'
import type { Quad } from '../../src/pipeline/types'
import { saveImage } from '../node-runtime'

const r = rng(99)
for (let s = 0; s < 24; s++) {
  const c = randomCase(1000 + s, 640, 480)
  const gray = toGray(c.image)
  const coarse = c.quad.map((p) => ({ x: p.x + (r() - 0.5) * 10, y: p.y + (r() - 0.5) * 10 })) as Quad
  const res = refineQuad(gray, coarse, { radius: 10 })
  const errs = res.quad.map((p, i) => dist(p, c.quad[i]!).toFixed(1))
  const sides = res.sides.map((f) => (f ? f.support.toFixed(2) : '--'))
  console.log(s, JSON.stringify(c.meta), 'err', errs.join(' '), 'sup', sides.join(' '))
  if (process.argv.includes(String(s))) await saveImage(c.image, `bench/out/case${s}.png`)
}
