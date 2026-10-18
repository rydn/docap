/**
 * Loaders for real-photo benchmarks (downloaded into bench/data, never committed):
 *
 * - SmartDoc 2015 Challenge 1 (ICDAR 2015): ~25k smartphone preview frames of A4 pages on
 *   5 backgrounds, semi-automatic ground-truth quads. The standard benchmark for this task.
 *   https://github.com/jchazalon/smartdoc15-ch1-dataset (frames.tar.gz, v2.0.0)
 * - DocCornerDataset test split: real phone photos from several sources (MIDV ID cards,
 *   SmartDoc, Roboflow document sets) plus COCO negatives without documents.
 *   https://huggingface.co/datasets/mapo80/DocCornerDataset
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import sharp from 'sharp'
import { orderQuad } from '../src/pipeline/quad'
import type { Quad, RGBAImage } from '../src/pipeline/types'

export interface RealCase {
  id: string
  group: string
  image: RGBAImage
  /** Ground truth in `image` pixel coordinates; null for negatives. */
  truth: Quad | null
  /** SmartDoc: document model size, for the official reference-frame Jaccard index. */
  model?: { width: number; height: number }
}

async function decode(buf: Buffer | Uint8Array, maxSide: number): Promise<{ image: RGBAImage; scaleX: number; scaleY: number; origW: number; origH: number }> {
  const meta = await sharp(buf).metadata()
  const { data, info } = await sharp(buf)
    .rotate()
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const origW = meta.autoOrient?.width ?? meta.width!
  const origH = meta.autoOrient?.height ?? meta.height!
  return {
    image: { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) },
    scaleX: info.width / origW,
    scaleY: info.height / origH,
    origW,
    origH,
  }
}

const scaleQuad = (q: Quad, sx: number, sy: number) => q.map((p) => ({ x: (p.x + 0.5) * sx - 0.5, y: (p.y + 0.5) * sy - 0.5 })) as Quad

/** Parses SmartDoc's metadata.csv(.gz). */
function smartdocMeta(dir: string): Record<string, string>[] {
  const gz = join(dir, 'metadata.csv.gz')
  const text = existsSync(gz) ? gunzipSync(readFileSync(gz)).toString('utf8') : readFileSync(join(dir, 'metadata.csv'), 'utf8')
  const [head, ...rows] = text.trim().split(/\r?\n/)
  const cols = head!.split(',')
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i]!, v])))
}

export async function* smartdoc(dir: string, stride: number, maxSide: number): AsyncGenerator<RealCase> {
  const rows = smartdocMeta(dir)
  for (let i = 0; i < rows.length; i += stride) {
    const r = rows[i]!
    const { image, scaleX, scaleY } = await decode(readFileSync(join(dir, r.image_path!)), maxSide)
    const n = (k: string) => Number(r[k])
    // SmartDoc's ground truth uses continuous coordinates with the origin at the
    // top-left corner of the top-left pixel; ours put pixel centres at integers.
    const truth = orderQuad([
      { x: n('tl_x') - 0.5, y: n('tl_y') - 0.5 },
      { x: n('tr_x') - 0.5, y: n('tr_y') - 0.5 },
      { x: n('br_x') - 0.5, y: n('br_y') - 0.5 },
      { x: n('bl_x') - 0.5, y: n('bl_y') - 0.5 },
    ])
    yield {
      id: r.image_path!,
      group: `smartdoc/${r.bg_name}`,
      image,
      truth: scaleQuad(truth, scaleX, scaleY),
      model: { width: n('model_width'), height: n('model_height') },
    }
  }
}

export async function* docCorner(dir: string, maxSide: number, limit: number): AsyncGenerator<RealCase> {
  const { parquetReadObjects } = await import('hyparquet')
  let count = 0
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.parquet')).sort()) {
    const buf = readFileSync(join(dir, file))
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    // utf8: false keeps BYTE_ARRAY columns (the JPEG bytes) binary instead of decoding to text.
    const rows = (await parquetReadObjects({ file: ab, utf8: false })) as Record<string, unknown>[]
    const text = (v: unknown) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : String(v ?? ''))
    for (const row of rows) {
      if (count++ >= limit) return
      row.filename = text(row.filename)
      const img = row.image as { bytes: Uint8Array; path?: string } | Uint8Array
      const bytes = img instanceof Uint8Array ? img : img.bytes
      const { image } = await decode(Buffer.from(bytes), maxSide)
      const neg = !!row.is_negative
      // Source dataset is encoded in the file name: <source>_<index>.jpg
      const src = String(row.filename ?? 'unknown').replace(/_\d+\.\w+$/, '')
      const c = (k: string) => Number(row[k])
      const truth = neg
        ? null
        : orderQuad(
            (['tl', 'tr', 'br', 'bl'] as const).map((k) => ({
              x: c(`corner_${k}_x`) * image.width - 0.5,
              y: c(`corner_${k}_y`) * image.height - 0.5,
            })),
          )
      yield { id: `${file}#${count}`, group: neg ? 'doccorner/negative' : `doccorner/${src}`, image, truth }
    }
  }
}
