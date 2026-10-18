---
name: pipeline/refinement-off-by-default
kind: decision
tags: []
related: [file:src/pipeline/detect.ts, file:src/pipeline/refine.ts, file:src/pipeline/capture.ts]
created: 2026-10-18T14:28:03.000Z
updated: 2026-10-18T14:28:03.000Z
---

Edge refinement (src/pipeline/refine.ts) is OFF by default for live detection and capture (DEFAULT_DETECT.refine=false, DEFAULT_CAPTURE.refine=false), based on real data 2026-10-18: SmartDoc stride30 model-only coarse IoU 0.9902 vs refined 0.9879 (720px, R≥4px) and full-res 1920px refinement 0.9870–0.9891; DocCorner 0.7116 vs 0.7031. Side-bias study (bench/dev/side-bias.ts): model per-side error p10/p90 ±0.65px @720 with zero >3px; refined had median −0.22px inward bias + 1.7% sides jumping to inner printed rules (datasheet borders) when paper/desk contrast is ~0–13 gray levels. Synthetic scenes made refinement look great (+0.02) only because DocAligner has a domain gap on my renderer — do not tune on synthetic alone. Refinement code kept: used by completeCorner (recover one hidden corner, +0.9pt detection on DocCorner) and available as an option. minCornerScore lowered 0.35→0.2 (+2.6pt detection, still 0 FP on 244 real negatives). RANSAC multi-candidate refiner + asymmetric inward prior (INWARD_SIGMA 0.3) are the current refine internals.
