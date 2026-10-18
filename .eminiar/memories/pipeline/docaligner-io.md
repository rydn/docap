---
name: pipeline/docaligner-io
kind: fact
tags: [pipeline, ml, model]
related: []
created: 2026-10-18T13:23:30.216Z
updated: 2026-10-18T13:23:30.216Z
---

DocAligner heatmap ONNX models (public/models, fetched by `npm run models` from GitHub release 1.1.1, Apache-2.0): lcnet100_h_e_bifpn_256_fp32.onnx (4.8MB) and fastvit_t8_h_e_bifpn_256_fp32.onnx (13.2MB). Input name 'img' float32 [1,3,256,256], **BGR channel order** (reference code does cv2 RGB2BGR), values /255, plain stretch-resize to 256x256 (no letterbox/normalisation). Output 'heatmap' [1,4,128,128] sigmoid, one channel per corner in order TL, TR, BR, BL. Reference postprocess: resize heatmap to image size, threshold 0.3, binarize, centroid of largest blob. We use the weighted centroid of the largest above-threshold component for sub-pixel accuracy. Node probe: ~19ms lcnet100, ~9ms fastvit_t8 on M-series CPU.
