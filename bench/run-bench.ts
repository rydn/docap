/**
 * Detection accuracy benchmark (Node; runs the exact shipped pipeline modules).
 *
 *   npm run bench                              synthetic suites (CI gates)
 *   npm run bench -- --n 300                   cases per synthetic suite
 *   npm run bench -- --smartdoc bench/data/smartdoc/frames [--stride 10]
 *   npm run bench -- --doccorner bench/data/doccorner [--limit 2000]
 *   npm run bench -- --refine                  A/B with edge refinement (off by default)
 *
 * Metrics: Jaccard index (IoU) of predicted vs ground-truth quad — missed detections
 * count as 0, as in SmartDoc 2015; for SmartDoc also the official variant measured in
 * the document's own reference frame (so distant, foreshortened pages count fully);
 * worst-corner error relative to the frame diagonal; detection rate; false positives
 * on images without a document. Exits non-zero if a gate fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { detectDocument } from '../src/pipeline/detect'
import { applyH, homography, invert3 } from '../src/pipeline/homography'
import { fitSize, resizeRGBA } from '../src/pipeline/image'
import type { HeatmapRunner } from '../src/pipeline/model'
import { dist, quadIoU } from '../src/pipeline/quad'
import type { Quad, RGBAImage } from '../src/pipeline/types'
import { nodeRunner } from './node-runtime'
import { docCorner, smartdoc, type RealCase } from './real-datasets'
import { randomCase, renderBackground, rng } from './synth'

const args = process.argv.slice(2)
const arg = (k: string) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : undefined
}
const N = Number(arg('--n') ?? 150)
const ANALYSIS = Number(arg('--size') ?? 720)
const detectOpts = {
  refine: args.includes('--refine'),
  completeCorner: !args.includes('--no-complete'),
  ...(arg('--min-corner') ? { minCornerScore: Number(arg('--min-corner')) } : {}),
}

interface CaseResult {
  id: string
  group: string
  /** Null for negatives (no document present). */
  iou: number | null
  iouCoarse: number | null
  /** SmartDoc official: IoU in the document reference frame. */
  iouRef?: number
  cornerErr: number | null
  detected: boolean
  ms: number
  failure?: string | null
  meta?: unknown
}

const mean = (a: number[]) => a.reduce((p, c) => p + c, 0) / Math.max(1, a.length)
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)] ?? 0

function summarise(name: string, r: CaseResult[]) {
  const pos = r.filter((x) => x.iou !== null)
  const neg = r.filter((x) => x.iou === null)
  const ious = pos.map((x) => x.iou!)
  const refs = pos.filter((x) => x.iouRef !== undefined).map((x) => x.iouRef!)
  const errs = pos.filter((x) => x.detected).map((x) => x.cornerErr!)
  return {
    suite: name,
    cases: pos.length,
    meanIoU: +mean(ious).toFixed(4),
    ...(refs.length ? { meanIoURef: +mean(refs).toFixed(4) } : {}),
    meanIoUCoarse: +mean(pos.map((x) => x.iouCoarse ?? 0)).toFixed(4),
    medianIoU: +q(ious, 0.5).toFixed(4),
    p05IoU: +q(ious, 0.05).toFixed(4),
    detectionRate: +(pos.filter((x) => x.detected).length / Math.max(1, pos.length)).toFixed(4),
    medianCornerErrPctDiag: +(q(errs, 0.5) * 100).toFixed(3),
    p90CornerErrPctDiag: +(q(errs, 0.9) * 100).toFixed(3),
    meanMs: +mean(r.map((x) => x.ms)).toFixed(1),
    ...(neg.length ? { negatives: neg.length, falsePositiveRate: +(neg.filter((x) => x.detected).length / neg.length).toFixed(4) } : {}),
  }
}

/** IoU after mapping both quads into the document's model frame through the GT homography. */
function referenceIoU(pred: Quad, truth: Quad, model: { width: number; height: number }): number {
  const H = invert3(
    homography(
      [
        { x: 0, y: 0 },
        { x: model.width, y: 0 },
        { x: model.width, y: model.height },
        { x: 0, y: model.height },
      ],
      truth,
    ),
  )
  const toRef = (qq: Quad) => qq.map((p) => applyH(H, p)) as Quad
  return quadIoU(toRef(pred), toRef(truth))
}

async function evalCase(runner: HeatmapRunner, c: { id: string; group: string; image: RGBAImage; truth: Quad | null; model?: { width: number; height: number }; meta?: unknown }): Promise<CaseResult> {
  const { image, truth } = c
  const size = fitSize(image.width, image.height, ANALYSIS)
  const scale = size.width / image.width
  const img = scale < 1 ? resizeRGBA(image, size.width, size.height) : image
  const t0 = performance.now()
  const res = await detectDocument(img, runner, detectOpts)
  const ms = performance.now() - t0
  const toFull = (qq: Quad) => qq.map((p) => ({ x: (p.x + 0.5) / scale - 0.5, y: (p.y + 0.5) / scale - 0.5 })) as Quad
  const pred = res.detection ? toFull(res.detection.quad) : null
  const diag = Math.hypot(image.width, image.height)
  return {
    id: c.id,
    group: c.group,
    iou: truth ? (pred ? quadIoU(pred, truth) : 0) : null,
    iouCoarse: truth ? (res.coarse ? quadIoU(toFull(res.coarse), truth) : 0) : null,
    ...(truth && c.model ? { iouRef: pred ? referenceIoU(pred, truth, c.model) : 0 } : {}),
    cornerErr: truth && pred ? Math.max(...pred.map((p, i) => dist(p, truth[i]!))) / diag : null,
    detected: !!pred,
    ms,
    failure: res.failure,
    meta: c.meta,
  }
}

async function synthetic(runner: HeatmapRunner, name: string, hard: boolean, seed0: number): Promise<CaseResult[]> {
  const out: CaseResult[] = []
  for (let i = 0; i < N; i++) {
    const c = randomCase(seed0 + i, 960, 720, { hard })
    out.push(await evalCase(runner, { id: `${name}-${seed0 + i}`, group: name, image: c.image, truth: c.quad, meta: c.meta }))
  }
  // Frames with no document (textures and non-rectangular clutter) must not trigger.
  const kinds = ['wood', 'desk', 'fabric', 'dark', 'light', 'clutter', 'paperlike'] as const
  for (let i = 0; i < Math.round(N / 3); i++) {
    const bg = renderBackground(rng(seed0 + 50000 + i), 720, 540, kinds[i % kinds.length]!, 'blobs')
    out.push(await evalCase(runner, { id: `${name}-neg-${i}`, group: name, image: bg, truth: null }))
  }
  return out
}

async function real(runner: HeatmapRunner, source: AsyncGenerator<RealCase>, label: string): Promise<CaseResult[]> {
  const out: CaseResult[] = []
  let n = 0
  const t0 = performance.now()
  for await (const c of source) {
    out.push(await evalCase(runner, c))
    if (++n % 250 === 0) console.error(`${label}: ${n} images, ${((performance.now() - t0) / 1000).toFixed(0)}s`)
  }
  return out
}

// Mean IoU counts a missed frame as 0 (SmartDoc convention), so it mostly measures
// detection rate; p05 measures how bad the worst detections are. In live use a missed
// frame only delays capture, while a bad quad produces a bad scan — p05 matters most.
// Calibrated 2026-10-18 just below measured values (SmartDoc stride 20: 0.9903 / p05 0.9824
// / 100%; synthetic n=200: 0.9617 / 0.9556 / 99%), so a real regression fails CI.
const GATES: Record<string, { meanIoU: number; p05IoU: number; detectionRate: number; falsePositiveRate?: number }> = {
  smartdoc: { meanIoU: 0.988, p05IoU: 0.975, detectionRate: 0.995 },
  synthetic: { meanIoU: 0.95, p05IoU: 0.94, detectionRate: 0.97, falsePositiveRate: 0.02 },
  'synthetic-hard': { meanIoU: 0.96, p05IoU: 0.95, detectionRate: 0.97, falsePositiveRate: 0.05 },
}

const runner = await nodeRunner('lcnet100')
const all: CaseResult[] = []
if (!args.includes('--no-synthetic')) {
  all.push(...(await synthetic(runner, 'synthetic', false, 10000)))
  all.push(...(await synthetic(runner, 'synthetic-hard', true, 20000)))
}
const sd = arg('--smartdoc')
if (sd) all.push(...(await real(runner, smartdoc(sd, Number(arg('--stride') ?? 10), 1280), 'smartdoc')))
const dc = arg('--doccorner')
if (dc) all.push(...(await real(runner, docCorner(dc, 1280, Number(arg('--limit') ?? 1e9)), 'doccorner')))

// Summaries: per top-level suite, then per group within real datasets.
const groups = new Map<string, CaseResult[]>()
for (const r of all) {
  const top = r.group.split('/')[0]!
  groups.set(top, [...(groups.get(top) ?? []), r])
  if (r.group.includes('/')) groups.set(r.group, [...(groups.get(r.group) ?? []), r])
}
const summary = [...groups.entries()].map(([name, r]) => summarise(name, r))
console.table(summary)
mkdirSync('bench/out', { recursive: true })
writeFileSync('bench/out/report.json', JSON.stringify({ date: new Date().toISOString(), analysis: ANALYSIS, detectOpts, summary, results: all }, null, 1))

const worst = all
  .filter((r) => r.iou !== null)
  .sort((a, b) => a.iou! - b.iou!)
  .slice(0, 12)
console.log('worst cases:')
for (const w of worst) console.log(' ', w.id, 'iou', w.iou!.toFixed(3), 'coarse', (w.iouCoarse ?? 0).toFixed(3), w.failure ?? '', JSON.stringify(w.meta ?? ''))
const fps = all.filter((r) => r.iou === null && r.detected).slice(0, 8)
if (fps.length) console.log('false positives:', fps.map((r) => r.id).join(' '))

let failed = false
for (const s of summary) {
  const g = GATES[s.suite]
  if (!g) continue
  if (s.meanIoU < g.meanIoU || s.p05IoU < g.p05IoU || s.detectionRate < g.detectionRate || (g.falsePositiveRate !== undefined && (s.falsePositiveRate ?? 0) > g.falsePositiveRate)) {
    console.error(`GATE FAILED: ${s.suite}`, g)
    failed = true
  }
}
process.exitCode = failed ? 1 : 0
