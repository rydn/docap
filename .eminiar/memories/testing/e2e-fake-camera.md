---
name: testing/e2e-fake-camera
kind: fact
tags: []
related: [file:tests/e2e/make-video.ts, file:tests/e2e/scan.spec.ts, file:playwright.config.ts]
created: 2026-10-18T14:04:21.733Z
updated: 2026-10-18T14:04:21.733Z
---

E2E strategy: tests/e2e/make-video.ts renders a Y4M clip (640x480@10fps) from bench/synth: background → page A slides in, holds 3s with jitter, slides out → page B (with photo) same. Chromium flags --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<y4m> with camera permission granted play it as the webcam. scan.spec.ts asserts exactly 2 captures (no duplicates), queue shows 2 ready pages, ZIP downloads with 2 JPEGs at exact A4 ratio. Passed first run 2026-10-18 (~11s). The y4m is generated into test-results/fixtures (gitignored). tests/e2e/screens.ts captures UI screenshots (needs `vite preview --port 4173` running). Playwright webServer builds + previews on :4173/docap/.
