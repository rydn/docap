import { expect, test } from '@playwright/test'
import { unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { PAGES, TIMELINE } from './make-video'

const LOOP_S = TIMELINE.lead + PAGES * (TIMELINE.enter + TIMELINE.hold + TIMELINE.leave + TIMELINE.gap)

/** Reads JPEG dimensions from the SOF marker. */
function jpegSize(buf: Uint8Array): { width: number; height: number } {
  let i = 2
  while (i < buf.length) {
    const marker = buf[i + 1]!
    const len = (buf[i + 2]! << 8) | buf[i + 3]!
    if (marker >= 0xc0 && marker <= 0xc3) return { height: (buf[i + 5]! << 8) | buf[i + 6]!, width: (buf[i + 7]! << 8) | buf[i + 8]! }
    i += 2 + len
  }
  throw new Error('no SOF marker')
}

test('auto-captures each page exactly once and exports a ZIP', async ({ page }) => {
  const logs: string[] = []
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))

  await page.goto('./')
  // Permission is pre-granted, so scanning starts without a tap; tap if the intro shows.
  const start = page.getByRole('button', { name: 'Start scanning' })
  if (await start.isVisible().catch(() => false)) await start.click()

  await expect(page.getByRole('status')).toBeVisible({ timeout: 30_000 })
  const badge = page.locator('.tray .badge')

  // One loop of the clip shows two different pages; both must be captured, once each.
  await expect(badge).toHaveText(String(PAGES), { timeout: (LOOP_S + 15) * 1000 })
  await page.waitForTimeout(2500)
  expect(await badge.textContent(), `duplicate captures; logs:\n${logs.join('\n')}`).toBe(String(PAGES))

  await page.getByRole('button', { name: 'Scanned pages' }).click()
  await expect(page.locator('.grid li.ready')).toHaveCount(PAGES, { timeout: 20_000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download ZIP/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^docap-\d{8}-\d{6}\.zip$/)
  const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)))
  const names = Object.keys(files).sort()
  expect(names).toHaveLength(PAGES)
  for (const name of names) {
    const { width, height } = jpegSize(files[name]!)
    // A4 pages, deskewed: exact ISO ratio after paper snapping.
    expect(Math.abs(width / height - 1 / Math.SQRT2)).toBeLessThan(0.01)
  }
})

test('shows guidance before a document is in view', async ({ page }) => {
  await page.goto('./')
  const start = page.getByRole('button', { name: 'Start scanning' })
  if (await start.isVisible().catch(() => false)) await start.click()
  await expect(page.getByRole('status')).toHaveText(/Loading detector|Point at a document/, { timeout: 30_000 })
})
