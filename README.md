# docap

Hands-free document capture in the browser. Point your phone at a page: docap finds it, waits for it to hold still, then captures, crops and straightens it automatically and adds it to a queue. Keep feeding pages — each new page is picked up, the same page is never captured twice. Download the queue as a ZIP.

Everything runs on-device (WebAssembly in Web Workers). No uploads, no server.

**Live:** https://rydn.github.io/docap/

## How it works

```
camera ─▶ 720px frame ─▶ [detector worker]                         ─▶ outline overlay
                         DocAligner corner heatmaps (ONNX, WASM)      (1€-smoothed)
                         → corner assignment → small-radius sub-pixel
                           edge refinement → geometry checks
                                                │
                    AutoCapture: still for 650 ms, sharp frame, not the page just taken
                                                │
full-res still ─▶ [processor worker] re-detect on the still → edge re-fit at ~2200px
                  → true aspect ratio (Zhang–He) → bicubic perspective warp
                  → enhancement (illumination flattening / gray / B&W) → JPEG
                                                │
                                   IndexedDB queue ─▶ editor / ZIP export
```

- **Detection**: [DocAligner](https://github.com/DocsaidLab/DocAligner) `lcnet100` heatmap model (Apache-2.0, 4.8 MB) via onnxruntime-web. Each corner keeps its top blobs; the best convex, distinct assignment wins (fixes two corners firing on one spot on long receipts). A single hidden corner (thumb, glare) is recovered from the two paper edges that meet there.
- **Edge refinement**: RANSAC over every gradient extremum along each side, so continuity — not contrast — identifies the paper border; an asymmetric prior keeps printed rules and text columns inside the page from hijacking a side.
- **Aspect ratio**: recovered from the projective geometry of the quad (Zhang & He, *Whiteboard scanning*), with the focal length solved from the quad or a phone-camera prior; optional snapping to A-series / Letter / Legal / ID-1.
- **Enhancement**: the illumination field is estimated from paper pixels only (matched by chromaticity, brightness and texture) and divided out — shadows and gradients vanish while photos keep their colours.
- **Auto-capture**: anchored stability gate + sharpness gate; a page signature (rectified 32×32, rotation-invariant NCC) suppresses duplicates and re-arms on a new page or when the page leaves the view.

## Develop

```sh
npm install
npm run models   # fetch the DocAligner model into public/models (committed already)
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (camera needs https or localhost) |
| `npm run build` | Type-check and production build (base `/docap/`) |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests with Chromium's fake camera (Playwright) |
| `npm run bench` | Detection accuracy benchmark with CI gates |
| `npm run lint` | ESLint |

## Accuracy

`npm run bench` runs the shipped pipeline modules in Node on:

- **Synthetic** scenes with exact ground truth (random camera poses, backgrounds, clutter, shadows, blur, noise; plus negatives) — gated in CI.
- **SmartDoc 2015 Challenge 1** — the standard benchmark for this task (`--smartdoc bench/data/smartdoc`, data from [jchazalon/smartdoc15-ch1-dataset](https://github.com/jchazalon/smartdoc15-ch1-dataset)).
- **DocCornerDataset** test split — diverse real phone photos and COCO negatives (`--doccorner bench/data/doccorner`, from [mapo80/DocCornerDataset](https://huggingface.co/datasets/mapo80/DocCornerDataset)).

Metric: Jaccard index (IoU) of the detected vs ground-truth quadrilateral, missed detections counted as 0.

Results (October 2026, 720 px analysis frames, ~17 ms per frame on one CPU core in Node):

| Suite | Images | Mean IoU | 5th percentile | Detected | False positives |
| --- | --- | --- | --- | --- | --- |
| SmartDoc 2015 ch.1 (every 20th frame) | 1,245 | **0.990** | 0.982 | 100% | — |
| — hardest background (05, cluttered) | 129 | 0.986 | 0.977 | 100% | — |
| DocCornerDataset test (in-the-wild) | 1,756 + 244 neg. | 0.702 (median 0.949) | — | 74% | 0.4% |
| Synthetic / synthetic-hard | 200 / 200 | 0.962 / 0.974 | 0.956 / 0.961 | 99% / 100% | 0% |

SmartDoc mean IoU in the document's reference frame (the competition's official variant) is also 0.990; the 2015 competition's best entry scored ~0.97. Many DocCornerDataset misses are images where the page runs off the frame or is an augmentation artefact — situations the live app answers with a "fit the whole page in view" hint.

What the numbers changed: sub-pixel edge refinement looked excellent on synthetic scenes but slightly *lowered* accuracy on real photos (faint paper edges next to printed rules; a −0.2 px inward bias), so live detection and capture use the model's corners directly and edge fitting is reserved for recovering a hidden corner.

## Testing

- Unit tests cover geometry, aspect recovery across 300 random poses, model post-processing, edge refinement, tracking, auto-capture, the page signature, the full capture chain on rendered photos (pixel-level comparison with the source page) and ZIP export.
- The e2e test generates a webcam clip of two pages sliding in, holding and leaving, plays it through Chromium's fake camera, and asserts exactly one capture per page and a ZIP with correctly proportioned pages.
