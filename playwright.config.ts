import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export const FAKE_VIDEO = fileURLToPath(new URL('./test-results/fixtures/two-pages.y4m', import.meta.url))

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/docap/',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-fake-camera',
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${FAKE_VIDEO}`],
        },
        permissions: ['camera'],
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/docap/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
