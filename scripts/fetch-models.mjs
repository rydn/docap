// Downloads the DocAligner ONNX corner-heatmap model (Apache-2.0, DocsaidLab) into public/models.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const RELEASE = 'https://github.com/DocsaidLab/DocAligner/releases/download/1.1.1/'
const MODELS = ['lcnet100_h_e_bifpn_256_fp32.onnx']
const dir = new URL('../public/models/', import.meta.url)
mkdirSync(dir, { recursive: true })

for (const name of MODELS) {
  const out = new URL(name, dir)
  if (existsSync(out)) {
    console.log(`have ${name} sha256=${createHash('sha256').update(readFileSync(out)).digest('hex').slice(0, 16)}`)
    continue
  }
  const res = await fetch(RELEASE + name)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(out, buf)
  console.log(`fetched ${name} (${(buf.length / 1e6).toFixed(1)} MB)`)
}
