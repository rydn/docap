---
name: onboarding/structure
kind: onboarding
tags: []
related: [file:src/App.vue, file:src/pipeline/detect.ts, file:src/worker/pipeline.worker.ts, file:src/camera/useScanner.ts, file:src/stores/queue.ts, file:bench/run-bench.ts, file:tests/e2e/scan.spec.ts]
created: 2026-10-18T13:23:43.488Z
updated: 2026-10-18T14:04:17.923Z
---

Layout:
- src/main.ts, src/App.vue — app entry; App switches between CameraView, QueueSheet, PageEditor, SettingsSheet.
- src/pipeline/ — pure TS image pipeline (no DOM/Vue; runs in worker, Vitest and Node bench identically):
  types.ts, quad.ts (geometry, validation, IoU), homography.ts, aspect.ts (Zhang–He aspect, paper snapping, output size), image.ts (gray, area resample, blur, sharpness, small warps), model.ts (DocAligner pre/post-process + corner assignment), refine.ts (sub-pixel edge line fitting), detect.ts (model → refine → validate), signature.ts (duplicate page signature), tracker.ts (1-Euro, StabilityGate), autocapture.ts (capture state machine), process.ts (bicubic rectify + enhance), capture.ts (still → final page).
- src/worker/ — pipeline.worker.ts (Comlink API: init, detect, capture, reprocess, preview; onnxruntime-web/wasm single-threaded), client.ts (two workers: detector + processor), types.ts.
- src/camera/ — useCamera (getUserMedia, ImageCapture.takePhoto, torch, frame grabbing), useScanner (live loop, smoothing, auto-capture, capture dispatch, haptics/sound).
- src/stores/ — queue.ts (Pinia + IndexedDB via idb-keyval: pages with page/thumb/still blobs, quad, rotation, enhance), settings.ts (localStorage).
- src/components/ — CameraView, QuadOverlay (SVG, preserveAspectRatio slice = object-fit cover), QueueSheet, PageEditor (corner drag + loupe, rotate, filter), SettingsSheet, Icon.
- src/export/zip.ts — fflate ZIP / single JPEG download.
- public/models/ — DocAligner lcnet100 ONNX (committed). 
- bench/ — synth.ts (synthetic scenes with exact GT), run-bench.ts (accuracy gates), node-runtime.ts (onnxruntime-node runner, sharp IO), dev/ (viz tools).
- tests/unit (Vitest), tests/e2e (Playwright + Chromium fake camera from a generated Y4M; make-video.ts, screens.ts for screenshots).
- .github/workflows/deploy.yml — lint, typecheck, unit, bench, e2e → build → Pages deploy (main only).
