/** Compact view of bench/out/report.json: one line per suite/group (npx tsx bench/summary.ts [minCases]). */
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync('bench/out/report.json', 'utf8')) as { summary: Record<string, number | string>[] }
const min = Number(process.argv[2] ?? 1)
const cols = ['cases', 'meanIoU', 'meanIoURef', 'meanIoUCoarse', 'medianIoU', 'p05IoU', 'detectionRate', 'medianCornerErrPctDiag', 'negatives', 'falsePositiveRate', 'meanMs']
const short: Record<string, string> = { meanIoU: 'mIoU', meanIoURef: 'mIoUref', meanIoUCoarse: 'coarse', medianIoU: 'med', p05IoU: 'p05', detectionRate: 'det', medianCornerErrPctDiag: 'err%', negatives: 'neg', falsePositiveRate: 'FP', meanMs: 'ms' }
console.log(['suite'.padEnd(44), ...cols.map((c) => (short[c] ?? c).padStart(7))].join(' '))
for (const s of report.summary) {
  if (Number(s.cases) + Number(s.negatives ?? 0) < min) continue
  console.log([String(s.suite).slice(0, 44).padEnd(44), ...cols.map((c) => String(s[c] ?? '').padStart(7))].join(' '))
}
