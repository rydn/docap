---
name: pipeline/rejected-zoom-pass
kind: decision
tags: []
related: [file:src/pipeline/detect.ts, file:src/pipeline/model.ts]
created: 2026-10-18T13:45:12.731Z
updated: 2026-10-18T13:45:12.731Z
---

REJECTED: a second "zoomed" DocAligner pass on a crop around the coarse quad (to sharpen corners / recover missing ones). Measured on bench (200 cases/suite, 2026-10-18): model-only coarse IoU 0.9617; model+edge-refine 0.9826 (synthetic) / 0.9892 (hard); zoom+refine 0.964 / 0.977 — zoom pass corners were worse (coarse 0.9505), likely because stretching a tight, oddly-shaped crop to 256x256 departs from the training distribution, and channel↔corner assignment varies between passes. Do not reintroduce without new evidence. Also learned: DocAligner can fire two corner channels on one spot for long receipts/extreme perspective — fixed in model.ts postprocess via top-3 blobs per channel + convex distinct-corner assignment.
