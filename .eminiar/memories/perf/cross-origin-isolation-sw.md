---
name: perf/cross-origin-isolation-sw
kind: decision
tags: []
related: [file:src/sw.ts, file:src/registerSW.ts, file:vite.config.ts, file:src/worker/pipeline.worker.ts, file:tests/e2e/perf.ts]
created: 2026-10-18T14:39:44.097Z
updated: 2026-10-18T14:39:44.097Z
---

Inference dominates detection cost (onnxruntime-web WASM: 48ms of ~54ms/frame single-threaded on desktop). Multi-threaded WASM halves it (27ms with 4 threads) but needs SharedArrayBuffer = cross-origin isolation, and GitHub Pages can't send COOP/COEP headers. Solution (2026-10-18): vite-plugin-pwa injectManifest with custom src/sw.ts that precaches the app (incl. model + 14MB wasm) and wraps every same-origin response with COOP same-origin / COEP require-corp / CORP same-origin; src/registerSW.ts reloads once (sessionStorage guard) when the SW first takes control and the page isn't isolated. Verified with `DOCAP_PAGES_LIKE=1 vite preview` (no server headers) + tests/e2e/perf.ts → crossOriginIsolated true, wasm×4. Detector worker gets 4 threads, processor 2 (capped at hardwareConcurrency−1). Settings sheet shows live diagnostics (camera res, backend, ms/frame, fps, last page ms) for on-phone checks.
