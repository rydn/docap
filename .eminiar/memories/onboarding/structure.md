---
name: onboarding/structure
kind: onboarding
tags: []
related: [file:src/main.ts, file:src/App.vue, file:vite.config.ts, file:scripts/fetch-models.mjs, file:.github/workflows/deploy.yml]
created: 2026-10-18T13:23:43.488Z
updated: 2026-10-18T13:23:43.488Z
---

Layout:
- src/main.ts, src/App.vue — app entry.
- src/pipeline/ — pure TS image pipeline, framework-free and runnable in Node tests: quad.ts (geometry, validation, IoU), homography/rectify.ts (aspect estimation + warp), detect-model.ts (DocAligner pre/post-process), detect-cv.ts (OpenCV.js contours), refine.ts (sub-pixel side refinement), tracker.ts (1-Euro + stability), sharpness.ts, phash.ts, enhance.ts.
- src/worker/pipeline.worker.ts — Comlink API wrapping the pipeline.
- src/camera/ — useCamera composable (constraints, ImageCapture, torch).
- src/stores/ — Pinia stores (queue persisted to IndexedDB via idb-keyval).
- src/components/ — CameraView, QuadOverlay, QueueTray, PageEditor, ExportBar.
- src/export/ — ZIP export (fflate).
- public/models/ — DocAligner ONNX weights (fetched by scripts/fetch-models.mjs).
- bench/ — accuracy benchmark (Node) over synthetic + public datasets; bench/data and bench/out are gitignored.
- tests/unit (Vitest), tests/e2e (Playwright with fake camera), tests/fixtures.
- scripts/ — fetch-models.mjs, icons.mjs.
- .github/workflows/deploy.yml — lint, test, build, deploy to Pages on push to main.
- .eminiar/memories, .eminiar/docs.json — committed project knowledge.
