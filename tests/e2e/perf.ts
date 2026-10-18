/** Dev helper: prints in-browser pipeline diagnostics (needs `vite preview --port 4173`). */
import { chromium, devices } from '@playwright/test'
import { FAKE_VIDEO } from '../../playwright.config'
import { makeVideo } from './make-video'

makeVideo(FAKE_VIDEO)
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${FAKE_VIDEO}`],
})
const page = await (await browser.newContext({ ...devices['Pixel 7'], permissions: ['camera'] })).newPage()
await page.goto('http://localhost:4173/docap/')
// With DOCAP_PAGES_LIKE=1 the server sends no isolation headers: the SW must add them.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => undefined)
await page.waitForLoadState('load')
console.log('crossOriginIsolated:', await page.evaluate(() => self.crossOriginIsolated))
const start = page.getByRole('button', { name: 'Start scanning' })
if (await start.isVisible().catch(() => false)) await start.click()
await page.waitForFunction(() => document.querySelector('.tray .badge')?.textContent === '1', null, { timeout: 30000 })
await page.waitForTimeout(3000)
await page.getByRole('button', { name: 'Settings' }).click()
console.log(await page.locator('.diag').textContent())
await browser.close()
