import { readFileSync } from 'node:fs'
import { parquetMetadata, parquetSchema, parquetReadObjects } from 'hyparquet'

const buf = readFileSync(process.argv[2]!)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
const meta = parquetMetadata(ab)
console.log('rows', meta.num_rows)
console.log(parquetSchema(meta).children.map((c) => `${c.element.name}:${c.element.type ?? 'group'}`).join(' '))
const rows = (await parquetReadObjects({ file: ab, rowStart: 0, rowEnd: 3 })) as Record<string, unknown>[]
for (const r of rows)
  console.log(
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, v instanceof Uint8Array ? `bytes(${v.length})` : typeof v === 'object' && v ? Object.keys(v) : v]),
    ),
  )
