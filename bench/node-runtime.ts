/** Node-side implementations of runtime-specific pieces, for tests and the benchmark. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import { HEATMAP_SIZE, MODEL_INPUT, MODELS, type HeatmapRunner, type ModelName } from '../src/pipeline/model'
import type { RGBAImage } from '../src/pipeline/types'

const root = fileURLToPath(new URL('..', import.meta.url))

export async function nodeRunner(name: ModelName = 'lcnet100'): Promise<HeatmapRunner> {
  const session = await ort.InferenceSession.create(readFileSync(`${root}public/models/${MODELS[name]}`), {
    graphOptimizationLevel: 'all',
  })
  return {
    async run(input: Float32Array) {
      const out = await session.run({ img: new ort.Tensor('float32', input, [1, 3, MODEL_INPUT, MODEL_INPUT]) })
      const hm = out.heatmap!
      if (hm.dims[2] !== HEATMAP_SIZE) throw new Error(`unexpected heatmap dims ${hm.dims.join('x')}`)
      return hm.data as Float32Array
    },
  }
}

export async function loadImage(path: string, maxSide?: number): Promise<RGBAImage> {
  let s = sharp(path).rotate().ensureAlpha()
  if (maxSide) s = s.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) }
}

export async function saveImage(img: RGBAImage, path: string): Promise<void> {
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .toFile(path)
}

