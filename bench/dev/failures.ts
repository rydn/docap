/** Failure breakdown from bench/out/report.json (npx tsx bench/dev/failures.ts [groupPrefix]). */
import { readFileSync } from 'node:fs'

interface R {
  id: string
  group: string
  iou: number | null
  detected: boolean
  failure?: string | null
}
const prefix = process.argv[2] ?? ''
const { results } = JSON.parse(readFileSync('bench/out/report.json', 'utf8')) as { results: R[] }
const pos = results.filter((r) => r.iou !== null && r.group.startsWith(prefix))
const missed = pos.filter((r) => !r.detected)
const counts = new Map<string, number>()
for (const r of missed) counts.set(r.failure ?? 'none', (counts.get(r.failure ?? 'none') ?? 0) + 1)
console.log(`positives ${pos.length}, missed ${missed.length}`)
console.log([...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join('\n'))
const poor = pos.filter((r) => r.detected && r.iou! < 0.85)
console.log(`detected but IoU<0.85: ${poor.length}`)
console.log('sample missed ids:', missed.slice(0, 12).map((r) => r.id).join(' '))
console.log('sample poor ids:', poor.slice(0, 8).map((r) => `${r.id}(${r.iou!.toFixed(2)})`).join(' '))
