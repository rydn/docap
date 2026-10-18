---
name: pipeline/detection-approach
kind: decision
tags: [pipeline, cv, ml]
related: []
created: 2026-10-18T13:18:18.619Z
updated: 2026-10-18T13:18:18.619Z
---

Detection pipeline (in a Web Worker): primary = DocAligner heatmap corner model (DocsaidLab, ONNX via onnxruntime-web, WebGPU→WASM fallback), pending license/size verification; secondary = OpenCV.js classic contour detector (Canny+findContours+approxPolyDP) used while model loads, for cross-check, and for sub-pixel side-line refinement. Corners smoothed with 1-Euro filter; auto-capture when motion <~1.5% diag for ~600ms + sharpness gate; perceptual-hash duplicate guard prevents re-capturing same page. Rectification aspect via Zhang-He whiteboard method. Accuracy target: SmartDoc 2015 mean IoU >= 0.97.
