/** Times onnxruntime-web (WASM, single thread) inference vs the rest of detection in Node. */
import { readFileSync } from 'node:fs'
import * as ort from 'onnxruntime-web/wasm'
import { toGray } from '../../src/pipeline/image'
import { MODELS, postprocess, preprocess } from '../../src/pipeline/model'
import { documentSignature } from '../../src/pipeline/signature'
import { sharpness } from '../../src/pipeline/image'
import { randomCase } from '../synth'

ort.env.wasm.numThreads = Number(process.argv[2] ?? 1)
const session = await ort.InferenceSession.create(readFileSync(`public/models/${MODELS.lcnet100}`), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
const c = randomCase(1, 720, 540)
const t = { pre: 0, infer: 0, post: 0, gray: 0, extras: 0 }
const N = 30
for (let i = 0; i < N + 3; i++) {
  const a = performance.now()
  const input = preprocess(c.image)
  const b = performance.now()
  const out = await session.run({ img: new ort.Tensor('float32', input, [1, 3, 256, 256]) })
  const d = performance.now()
  postprocess(out.heatmap!.data as Float32Array, 720, 540)
  const e = performance.now()
  const g = toGray(c.image)
  const f = performance.now()
  sharpness(g, c.quad)
  documentSignature(g, c.quad)
  const h = performance.now()
  if (i < 3) continue
  t.pre += b - a
  t.infer += d - b
  t.post += e - d
  t.gray += f - e
  t.extras += h - f
}
console.log(`threads=${ort.env.wasm.numThreads}`, Object.entries(t).map(([k, v]) => `${k} ${(v / N).toFixed(1)}ms`).join(' · '))
