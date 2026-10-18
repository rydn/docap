/** Dev helper: captures UI screenshots with the fake camera (npx tsx tests/e2e/screens.ts OUTDIR). */
import { chromium, devices } from '@playwright/test'
import { FAKE_VIDEO } from '../../playwright.config'
import { makeVideo } from './make-video'

const out = process.argv[2] ?? 'test-results/screens'
makeVideo(FAKE_VIDEO)
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${FAKE_VIDEO}`],
})
const ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['camera'] })
const page = await ctx.newPage()
await page.goto('http://localhost:4173/docap/')
await page.screenshot({ path: `${out}/1-start.png` })
const start = page.getByRole('button', { name: 'Start scanning' })
if (await start.isVisible().catch(() => false)) await start.click()
await page.waitForTimeout(2600)
await page.screenshot({ path: `${out}/2-holding.png` })
await page.locator('.tray .badge').waitFor({ timeout: 20000 })
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/3-captured.png` })
await page.waitForFunction(() => document.querySelector('.tray .badge')?.textContent === '2', null, { timeout: 30000 })
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Scanned pages' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/4-queue.png` })
await page.getByRole('button', { name: 'Edit page 2' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/5-editor.png` })
await page.getByRole('button', { name: 'Adjust crop' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/6-crop.png` })
await browser.close()
