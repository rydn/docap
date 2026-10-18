---
name: pipeline/model-choice
kind: decision
status: accepted
supersedes: pipeline/detection-approach
tags: []
related: [file:src/pipeline/model.ts, file:src/pipeline/refine.ts]
created: 2026-10-18T13:35:36.828Z
updated: 2026-10-18T13:54:31.163Z
---

Ship DocAligner lcnet100_h_e_bifpn_256_fp32.onnx (4.8MB) as the only detector model. On 60 synthetic scenes at 720x540 (bench/dev/model-debug.ts, 2026-10-18): lcnet100 mean IoU 0.968 (median corner err 2.5px, 0 missing) vs fastvit_t8 (13MB) 0.894 with 4/60 missing corners. Channel order BGR vs RGB made little difference on synthetic data (reference code uses BGR; keep BGR, re-check on real photos). Raw model accuracy is not enough alone — sub-pixel edge refinement (src/pipeline/refine.ts) brings corners to ~0.1-0.4px when edges are visible. Classic OpenCV contour detector dropped as unnecessary: model + refinement is strictly better. OpenCV.js later removed entirely (see pipeline/pure-ts-processing).
