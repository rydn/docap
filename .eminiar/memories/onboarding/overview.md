---
name: onboarding/overview
kind: onboarding
tags: []
related: []
created: 2026-10-18T13:23:37.924Z
updated: 2026-10-18T13:23:37.924Z
---

docap is a hands-free document scanner web app (Vue 3 + TypeScript), hosted on GitHub Pages at https://rydn.github.io/docap/ (repo rydn/docap). For people scanning many pages in a row: point the phone camera at a page, the app draws the detected document outline, auto-captures once the outline is stable, crops + deskews (perspective-rectifies) it, optionally enhances it, and adds it to a queue (persisted in IndexedDB). The user selects queued pages and downloads them as a ZIP (single page → single image).

Runtime pieces (all front end, no server/Python):
- Main thread: Vue UI (camera view, SVG quad overlay, queue tray, page editor), camera via getUserMedia/ImageCapture.
- Web Worker (Comlink): detection pipeline — DocAligner ONNX corner-heatmap model via onnxruntime-web (WebGPU→WASM) + OpenCV.js classic contour detector + sub-pixel edge refinement; rectification and enhancement at full resolution.
- Temporal tracker: 1-Euro filter + stability gate + perceptual-hash duplicate guard drive auto-capture.
Quality bar: match/beat native phone scanners; SmartDoc-style mean IoU >= 0.97 measured by the bench.
