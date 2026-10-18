/**
 * Builds a Y4M "webcam" clip for Chromium's fake camera: two different pages, each
 * sliding in, holding still (with hand-shake jitter), and sliding out.
 */
import { existsSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs'
import { dirname } from 'node:path'
import { project, renderBackground, renderPage, renderScene, rng, type Pose } from '../../bench/synth'
import type { RGBAImage } from '../../src/pipeline/types'

export const VIDEO = { width: 640, height: 480, fps: 10 }
/** Seconds: [enter, hold, leave, gap] per page. */
export const TIMELINE = { lead: 1, enter: 0.6, hold: 3, leave: 0.6, gap: 1 }
export const PAGES = 2

function toI420(img: RGBAImage): Buffer {
  const { width: w, height: h, data } = img
  const out = Buffer.alloc((w * h * 3) / 2)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]!, g = data[i * 4 + 1]!, b = data[i * 4 + 2]!
    out[i] = Math.max(0, Math.min(255, 0.299 * r + 0.587 * g + 0.114 * b))
  }
  const uo = w * h
  const vo = uo + (w * h) / 4
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      let r = 0, g = 0, b = 0
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const k = ((y + dy) * w + x + dx) * 4
        r += data[k]!
        g += data[k + 1]!
        b += data[k + 2]!
      }
      r /= 4
      g /= 4
      b /= 4
      const j = (y / 2) * (w / 2) + x / 2
      out[uo + j] = Math.max(0, Math.min(255, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b))
      out[vo + j] = Math.max(0, Math.min(255, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b))
    }
  return out
}

export function makeVideo(path: string): void {
  if (existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  const { width: W, height: H, fps } = VIDEO
  const r = rng(77)
  const bg = renderBackground(r, W, H, 'wood')
  const f = 0.6 * Math.hypot(W, H)
  const fd = openSync(path, 'w')
  writeSync(fd, `YUV4MPEG2 W${W} H${H} F${fps}:1 Ip A1:1 C420jpeg\n`)
  const frame = (img: RGBAImage) => {
    writeSync(fd, 'FRAME\n')
    writeSync(fd, toI420(img))
  }
  const n = (s: number) => Math.round(s * fps)
  for (let i = 0; i < n(TIMELINE.lead); i++) frame(bg)
  for (let p = 0; p < PAGES; p++) {
    const page = renderPage(rng(500 + p), { width: 420, height: 594, density: 0.9, photo: p === 1 })
    const base: Pose = { rx: 0.25, ry: -0.12, rz: 0.08, distance: 1.9, tx: 0, ty: 0 }
    const at = (tx: number, jitter = 0) =>
      renderScene({
        width: W,
        height: H,
        page,
        background: bg,
        quad: project(210, 297, { ...base, tx: tx + (r() - 0.5) * jitter, ty: (r() - 0.5) * jitter }, f, W, H),
        r,
        noise: 3,
        ss: 1,
      })
    for (let i = 0; i < n(TIMELINE.enter); i++) frame(at(-1.2 * (1 - (i + 1) / n(TIMELINE.enter))))
    for (let i = 0; i < n(TIMELINE.hold); i++) frame(at(0, 0.002))
    for (let i = 0; i < n(TIMELINE.leave); i++) frame(at(1.2 * ((i + 1) / n(TIMELINE.leave))))
    for (let i = 0; i < n(TIMELINE.gap); i++) frame(bg)
  }
  closeSync(fd)
}
