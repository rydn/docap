/**
 * Detection accuracy benchmark (Node; runs the exact shipped pipeline modules).
 *
 *   npm run bench                  synthetic suites
 *   npm run bench -- --real DIR    also real photos with ground truth (see bench/README.md)
 *   npm run bench -- --n 300       cases per synthetic suite
 *
 * Metric is the SmartDoc 2015 Jaccard index (IoU of predicted vs ground-truth quad),
 * plus worst-corner error relative to the frame diagonal, detection rate, and false
 * positives on frames without a document. Exits non-zero if a gate fails.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { detectDocument } from '../src/pipeline/detect'
import { dist, quadIoU, orderQuad } from '../src/pipeline/quad'
import { fitSize, resizeRGBA } from '../src/pipeline/image'
import type { Quad, RGBAImage } from '../src/pipeline/types'
import type { HeatmapRunner } from '../src/pipeline/model'
import { loadImage, nodeRunner } from './node-runtime'
import { randomCase, renderBackground, rng } from './synth'

const args = process.argv.slice(2)
const arg = (k: string) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : undefined
}
const N = Number(arg('--n') ?? 150)
const ANALYSIS = Number(arg('--size') ?? 720)
const realDir = arg('--real')
const detectOpts = { zoom: !args.includes('--no-zoom'), refine: !args.includes('--no-refine') }

interface CaseResult {
  id: string
  iou: number
  iouCoarse: number
  cornerErr: number
  detected: boolean
  ms: number
  failure?: string | null
  meta?: unknown
}

interface Suite {
  name: string
  results: CaseResult[]
  negatives?: { total: number; falsePositives: number }
}

function summarise(s: Suite) {
  const r = s.results
  const ious = r.map((x) => x.iou).sort((a, b) => a - b)
  const coarse = r.map((x) => x.iouCoarse)
  const errs = r.filter((x) => x.detected).map((x) => x.cornerErr).sort((a, b) => a - b)
  const mean = (a: number[]) => a.reduce((p, c) => p + c, 0) / Math.max(1, a.length)
  return {
    suite: s.name,
    cases: r.length,
    meanIoU: +mean(ious).toFixed(4),
    meanIoUCoarse: +mean(coarse).toFixed(4),
    medianIoU: +(ious[Math.floor(ious.length / 2)] ?? 0).toFixed(4),
    p05IoU: +(ious[Math.floor(ious.length * 0.05)] ?? 0).toFixed(4),
    detectionRate: +(r.filter((x) => x.detected).length / Math.max(1, r.length)).toFixed(4),
    medianCornerErrPctDiag: +((errs[Math.floor(errs.length / 2)] ?? 0) * 100).toFixed(3),
    p90CornerErrPctDiag: +((errs[Math.floor(errs.length * 0.9)] ?? 0) * 100).toFixed(3),
    meanMs: +mean(r.map((x) => x.ms)).toFixed(1),
    ...(s.negatives ? { falsePositiveRate: +(s.negatives.falsePositives / s.negatives.total).toFixed(4) } : {}),
  }
}

async function evalCase(runner: HeatmapRunner, id: string, image: RGBAImage, truth: Quad, meta?: unknown): Promise<CaseResult> {
  const size = fitSize(image.width, image.height, ANALYSIS)
  const scale = size.width / image.width
  const img = scale < 1 ? resizeRGBA(image, size.width, size.height) : image
  const t0 = performance.now()
  const res = await detectDocument(img, runner, detectOpts)
  const ms = performance.now() - t0
  const toFull = (q: Quad) => q.map((p) => ({ x: (p.x + 0.5) / scale - 0.5, y: (p.y + 0.5) / scale - 0.5 })) as Quad
  const diag = Math.hypot(image.width, image.height)
  const q = res.detection ? toFull(res.detection.quad) : null
  return {
    id,
    iou: q ? quadIoU(q, truth) : 0,
    iouCoarse: res.coarse ? quadIoU(toFull(res.coarse), truth) : 0,
    cornerErr: q ? Math.max(...q.map((p, i) => dist(p, truth[i]!))) / diag : 1,
    detected: !!q,
    ms,
    failure: res.failure,
    meta,
  }
}

async function syntheticSuite(runner: HeatmapRunner, name: string, hard: boolean, seed0: number): Promise<Suite> {
  const results: CaseResult[] = []
  for (let i = 0; i < N; i++) {
    const c = randomCase(seed0 + i, 960, 720, { hard })
    results.push(await evalCase(runner, `${name}-${seed0 + i}`, c.image, c.quad, c.meta))
  }
  // Frames with no document at all must not trigger a detection.
  let fp = 0
  const fpInfo: string[] = []
  const negN = Math.round(N / 3)
  for (let i = 0; i < negN; i++) {
    const r = rng(seed0 + 50000 + i)
    const kinds = ['wood', 'desk', 'fabric', 'dark', 'light', 'clutter', 'paperlike'] as const
    const bg = renderBackground(r, 720, 540, kinds[i % kinds.length]!, 'blobs')
    const res = await detectDocument(bg, runner, detectOpts)
    if (res.detection) {
      fp++
      const d = res.detection
      fpInfo.push(`score=${d.score.toFixed(2)} edge=${(d.edgeSupport ?? 0).toFixed(2)} corners=${d.cornerScores?.map((c) => c.toFixed(2)).join('/')}`)
    }
  }
  if (fpInfo.length) console.log(`${name} false positives:\n  ${fpInfo.join('\n  ')}`)
  return { name, results, negatives: { total: negN, falsePositives: fp } }
}

/**
 * Real photos: DIR contains images plus a labels.json mapping file name → four [x, y]
 * corners in full-resolution pixel coordinates (any order).
 */
async function realSuite(runner: HeatmapRunner, dir: string): Promise<Suite> {
  const labels = JSON.parse(readFileSync(join(dir, 'labels.json'), 'utf8')) as Record<string, [number, number][]>
  const results: CaseResult[] = []
  for (const file of readdirSync(dir)) {
    const corners = labels[file]
    if (!corners) continue
    const image = await loadImage(join(dir, file))
    const truth = orderQuad(corners.map(([x, y]) => ({ x, y })))
    results.push(await evalCase(runner, file, image, truth))
  }
  return { name: `real:${dir}`, results }
}

// Mean IoU counts a missed frame as 0 (SmartDoc convention), so it mostly measures
// detection rate; p05 measures how bad the worst detections are. In live use a missed
// frame only delays capture, while a bad quad produces a bad scan — p05 matters most.
const GATES: Record<string, { meanIoU: number; p05IoU: number; detectionRate: number; falsePositiveRate?: number }> = {
  synthetic: { meanIoU: 0.97, p05IoU: 0.95, detectionRate: 0.97, falsePositiveRate: 0.02 },
  'synthetic-hard': { meanIoU: 0.96, p05IoU: 0.93, detectionRate: 0.95, falsePositiveRate: 0.05 },
}

const runner = await nodeRunner('lcnet100')
const suites: Suite[] = [await syntheticSuite(runner, 'synthetic', false, 10000), await syntheticSuite(runner, 'synthetic-hard', true, 20000)]
if (realDir && existsSync(realDir)) suites.push(await realSuite(runner, realDir))

const summary = suites.map(summarise)
console.table(summary)
mkdirSync('bench/out', { recursive: true })
writeFileSync('bench/out/report.json', JSON.stringify({ date: new Date().toISOString(), analysis: ANALYSIS, summary, suites }, null, 1))

const worst = suites
  .flatMap((s) => s.results)
  .sort((a, b) => a.iou - b.iou)
  .slice(0, 8)
console.log('worst cases:')
for (const w of worst) console.log(' ', w.id, 'iou', w.iou.toFixed(3), 'coarse', w.iouCoarse.toFixed(3), w.failure ?? '', JSON.stringify(w.meta ?? ''))

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
