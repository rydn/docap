import { describe, expect, it } from 'vitest'
import { project, renderBackground, renderPage, renderScene, rng } from '../../bench/synth'
import { toGray } from '@/pipeline/image'
import { documentSignature, signatureSimilarity } from '@/pipeline/signature'
import type { RGBAImage } from '@/pipeline/types'

const W = 480
const H = 360
const F = 0.6 * Math.hypot(W, H)

function shot(page: RGBAImage, seed: number) {
  const r = rng(seed)
  const pose = { rx: (r() - 0.5) * 0.5, ry: (r() - 0.5) * 0.5, rz: (r() - 0.5) * 0.4, distance: 2.2 + r() * 0.4, tx: 0, ty: 0 }
  const quad = project(210, 297, pose, F, W, H)
  const image = renderScene({ width: W, height: H, page, background: renderBackground(r, W, H, 'wood'), quad, r, noise: 4, gradient: r() })
  return documentSignature(toGray(image), quad)
}

describe('document signature', () => {
  const pages = [1, 2, 3, 4].map((s) => renderPage(rng(s), { width: 420, height: 594 }))

  it('recognises the same page across poses and lighting', () => {
    for (const page of pages) {
      const a = shot(page, 10)
      const b = shot(page, 11)
      expect(signatureSimilarity(a, b)).toBeGreaterThan(0.85)
    }
  })

  it('distinguishes different pages of similar layout', () => {
    for (let i = 0; i < pages.length; i++)
      for (let j = i + 1; j < pages.length; j++) {
        expect(signatureSimilarity(shot(pages[i]!, 10), shot(pages[j]!, 11))).toBeLessThan(0.7)
      }
  })

  it('treats a page rotated by 180° as the same page', () => {
    const page = pages[0]!
    const rotated = { ...page, data: new Uint8ClampedArray(page.data.length) }
    const n = page.width * page.height
    for (let i = 0; i < n; i++) rotated.data.set(page.data.subarray(i * 4, i * 4 + 4), (n - 1 - i) * 4)
    expect(signatureSimilarity(shot(page, 10), shot(rotated, 12))).toBeGreaterThan(0.85)
  })
})
