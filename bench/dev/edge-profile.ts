/** Prints the mean normal profile and derivative across each GT side of a SmartDoc frame. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { fitSize, sampleGray, toGray } from '../../src/pipeline/image'
import { orderQuad, dist } from '../../src/pipeline/quad'
import type { RGBAImage } from '../../src/pipeline/types'

const [dir, rel] = process.argv.slice(2)
const buf = readFileSync(join(dir!, rel!))
const meta = await sharp(buf).metadata()
const size = fitSize(meta.width!, meta.height!, 720)
const { data } = await sharp(buf).resize(size.width, size.height).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const img: RGBAImage = { width: size.width, height: size.height, data: new Uint8ClampedArray(data) }
const g = toGray(img)
// GT from metadata
const { gunzipSync } = await import('node:zlib')
const text = gunzipSync(readFileSync(join(dir!, 'metadata.csv.gz'))).toString()
const [head, ...rows] = text.trim().split('\n')
const cols = head!.split(',')
const row = rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i]!, v]))).find((r) => r.image_path === rel)!
const s = size.width / meta.width!
const n = (k: string) => Number(row[k]) * s - 0.5
const q = orderQuad([{ x: n('tl_x'), y: n('tl_y') }, { x: n('tr_x'), y: n('tr_y') }, { x: n('br_x'), y: n('br_y') }, { x: n('bl_x'), y: n('bl_y') }])
for (let i = 0; i < 4; i++) {
  const a = q[i]!
  const b = q[(i + 1) % 4]!
  const len = dist(a, b)
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const nn = { x: d.y, y: -d.x }
  const prof: number[] = []
  for (let off = -14; off <= 8; off += 1) {
    let acc = 0
    for (let t = 0.2; t <= 0.8; t += 0.02) acc += sampleGray(g, a.x + (b.x - a.x) * t + nn.x * off, a.y + (b.y - a.y) * t + nn.y * off)
    prof.push(acc / 31)
  }
  console.log(`side ${i}: ` + prof.map((v) => v.toFixed(0)).join(' '))
}
