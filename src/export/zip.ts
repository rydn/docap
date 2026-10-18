import { zip, type Zippable } from 'fflate'

export interface ExportPage {
  page: Blob
  createdAt: number
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export function timestamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** File names in capture order: docap-<session time>-01.jpg, -02.jpg, … */
export function pageNames(pages: ExportPage[], now = new Date()): string[] {
  const stamp = timestamp(pages[0] ? new Date(pages[0].createdAt) : now)
  const width = Math.max(2, String(pages.length).length)
  return pages.map((_, i) => `docap-${stamp}-${pad(i + 1, width)}.jpg`)
}

/** Builds a ZIP of the pages. JPEGs are stored, not re-compressed (no gain, just CPU). */
export async function buildZip(pages: ExportPage[]): Promise<Blob> {
  const names = pageNames(pages)
  const files: Zippable = {}
  const buffers = await Promise.all(pages.map((p) => p.page.arrayBuffer()))
  buffers.forEach((b, i) => {
    files[names[i]!] = [new Uint8Array(b), { level: 0, mtime: new Date(pages[i]!.createdAt) }]
  })
  const data = await new Promise<Uint8Array>((res, rej) => zip(files, (err, out) => (err ? rej(err) : res(out))))
  return new Blob([data as BlobPart], { type: 'application/zip' })
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** One page → its JPEG; several → a ZIP. Returns the downloaded file name. */
export async function exportPages(pages: ExportPage[]): Promise<string> {
  if (pages.length === 0) throw new Error('Nothing selected')
  if (pages.length === 1) {
    const name = pageNames(pages)[0]!
    downloadBlob(pages[0]!.page, name)
    return name
  }
  const name = `docap-${timestamp(new Date(pages[0]!.createdAt))}.zip`
  downloadBlob(await buildZip(pages), name)
  return name
}
