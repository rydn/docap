/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { processCapture, type CaptureOptions } from '@/pipeline/capture'
import { detectDocument } from '@/pipeline/detect'
import { enhance, type EnhanceMode } from '@/pipeline/process'
import { fitSize, resizeRGBA, sharpness } from '@/pipeline/image'
import { HEATMAP_SIZE, MODEL_INPUT, MODELS, type HeatmapRunner } from '@/pipeline/model'
import { quadIoU, rescaleQuad } from '@/pipeline/quad'
import { documentSignature } from '@/pipeline/signature'
import type { Detection, Quad, RGBAImage } from '@/pipeline/types'
import type { CaptureJob, CaptureOutput, FrameAnalysis, ReprocessJob } from './types'

/** Long side of frames analysed for detection (model input is 256; refinement uses this). */
const ANALYSIS_SIDE = 720

let runner: HeatmapRunner | null = null
let initPromise: Promise<{ backend: string; loadMs: number }> | null = null

async function createRunner(threads: number): Promise<{ backend: string; loadMs: number }> {
  const t0 = performance.now()
  ort.env.wasm.wasmPaths = { wasm: wasmUrl }
  // Threads need SharedArrayBuffer, i.e. cross-origin isolation (provided by src/sw.ts).
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(threads, (navigator.hardwareConcurrency || 2) - 1)) : 1
  const res = await fetch(`${import.meta.env.BASE_URL}models/${MODELS.lcnet100}`)
  if (!res.ok) throw new Error(`model download failed: HTTP ${res.status}`)
  const session = await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  runner = {
    async run(input: Float32Array) {
      const out = await session.run({ img: new ort.Tensor('float32', input, [1, 3, MODEL_INPUT, MODEL_INPUT]) })
      const hm = out.heatmap!
      if (hm.dims[2] !== HEATMAP_SIZE) throw new Error('unexpected heatmap shape')
      return hm.data as Float32Array
    },
  }
  // Warm-up run so the first real frame isn't slow.
  await runner.run(new Float32Array(3 * MODEL_INPUT * MODEL_INPUT))
  return { backend: `wasm×${ort.env.wasm.numThreads}`, loadMs: Math.round(performance.now() - t0) }
}

function bitmapToRGBA(bitmap: ImageBitmap, maxSide = Infinity): RGBAImage {
  const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height).data
  return { width, height, data }
}

async function encode(img: RGBAImage, type = 'image/jpeg', quality = 0.9): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')!
  const pixels = new Uint8ClampedArray(img.data.buffer as ArrayBuffer, img.data.byteOffset, img.data.byteLength)
  ctx.putImageData(new ImageData(pixels, img.width, img.height), 0, 0)
  return canvas.convertToBlob({ type, quality })
}

function rotate(img: RGBAImage, quarterTurns: number): RGBAImage {
  const k = ((quarterTurns % 4) + 4) % 4
  if (k === 0) return img
  const { width: w, height: h, data } = img
  const W = k % 2 ? h : w
  const H = k % 2 ? w : h
  const out = new Uint8ClampedArray(w * h * 4)
  const src = new Uint32Array(data.buffer, data.byteOffset, w * h)
  const dst = new Uint32Array(out.buffer)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [nx, ny] = k === 1 ? [h - 1 - y, x] : k === 2 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x]
      dst[ny * W + nx] = src[y * w + x]!
    }
  return { width: W, height: H, data: out }
}

async function finish(still: RGBAImage, quad: Quad, opts: Partial<CaptureOptions>, rotation: number): Promise<Omit<CaptureOutput, 'still'>> {
  const t0 = performance.now()
  const res = processCapture(still, quad, opts)
  const page = rotate(res.image, rotation)
  const thumbSize = fitSize(page.width, page.height, 360)
  const [pageBlob, thumb] = await Promise.all([encode(page, 'image/jpeg', 0.9), encode(resizeRGBA(page, thumbSize.width, thumbSize.height), 'image/jpeg', 0.8)])
  return {
    page: pageBlob,
    thumb,
    width: page.width,
    height: page.height,
    quad: res.quad,
    stillWidth: still.width,
    stillHeight: still.height,
    aspect: res.aspect,
    snapped: res.snapped,
    ms: Math.round(performance.now() - t0),
  }
}

const api = {
  init(threads = 4) {
    initPromise ??= createRunner(threads)
    return initPromise
  },

  /** Analyses one preview frame. The bitmap is consumed (closed). */
  async detect(frame: ImageBitmap): Promise<FrameAnalysis> {
    if (!runner) await api.init()
    const t0 = performance.now()
    const img = bitmapToRGBA(frame, ANALYSIS_SIDE)
    frame.close()
    const res = await detectDocument(img, runner!)
    const d: Detection | null = res.detection
    return {
      width: img.width,
      height: img.height,
      detection: d,
      failure: res.failure,
      sharpness: d ? sharpness(res.gray, d.quad) : 0,
      signature: d ? documentSignature(res.gray, d.quad) : null,
      ms: Math.round(performance.now() - t0),
    }
  },

  /**
   * Processes a captured still. The document is re-detected on the still itself (the
   * phone may have moved during the shot, and stills often have a different crop than
   * the preview); the preview quad is the fallback and a sanity check.
   */
  async capture(job: CaptureJob): Promise<CaptureOutput> {
    if (!runner) await api.init()
    const still = bitmapToRGBA(job.still)
    job.still.close()
    const analysis = fitSize(still.width, still.height, ANALYSIS_SIDE)
    const small = resizeRGBA(still, analysis.width, analysis.height)
    const det = await detectDocument(small, runner!)
    // Photo-mode stills can have a different crop than the preview; then the hint can't be mapped.
    const sameFraming = Math.abs(still.width / still.height / job.hintAspect - 1) < 0.01
    const hint =
      job.hint && sameFraming
        ? (job.hint.map((p) => ({ x: p.x * still.width - 0.5, y: p.y * still.height - 0.5 })) as Quad)
        : null
    let quad: Quad | null = det.detection ? rescaleQuad(det.detection.quad, small.width, small.height, still.width, still.height) : null
    if (quad && hint && quadIoU(quad, hint) < 0.6) quad = hint // detected something else entirely
    quad ??= hint
    if (!quad) throw new Error('No document found in the photo')
    const stillBlob = await encode(still, 'image/jpeg', 0.92)
    return { ...(await finish(still, quad, job.options, 0)), still: stillBlob }
  },

  /** Re-runs processing on a stored still with an edited quad / mode / rotation. */
  async reprocess(job: ReprocessJob): Promise<Omit<CaptureOutput, 'still'>> {
    const bitmap = await createImageBitmap(job.still)
    const still = bitmapToRGBA(bitmap)
    bitmap.close()
    return finish(still, job.quad, { ...job.options, refine: false }, job.rotation)
  },

  /** Applies only an enhancement mode to an already rectified page (fast preview). */
  async preview(page: Blob, mode: EnhanceMode, maxSide: number): Promise<Blob> {
    const bitmap = await createImageBitmap(page)
    const img = bitmapToRGBA(bitmap, maxSide)
    bitmap.close()
    return encode(enhance(img, mode), 'image/jpeg', 0.85)
  },
}

export type PipelineApi = typeof api
Comlink.expose(api)
