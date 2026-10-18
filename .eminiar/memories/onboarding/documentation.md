---
name: onboarding/documentation
kind: onboarding
tags: []
related: []
created: 2026-10-18T13:23:56.579Z
updated: 2026-10-18T13:23:56.579Z
---

Registered documentation sources (.eminiar/docs.json):
- readme — local README.md.
- deploy-config — .github/workflows (Pages deploy).
- github — GitHub REST/Actions/Pages docs.
- onnxruntime-web — ORT web tutorials: WebGPU/WASM execution providers, wasmPaths, env flags.
- opencv-js — OpenCV.js tutorial root (Mat, contours, warpPerspective).
- mdn-media-capture — getUserMedia, ImageCapture, MediaTrackConstraints, VideoFrame, requestVideoFrameCallback.
- docaligner — DocsaidLab DocAligner repo + docs (corner heatmap model design, usage).
- vite-plugin-pwa — PWA plugin guide.
Third-party things the app depends on at runtime: DocAligner ONNX weights (self-hosted in public/models), onnxruntime-web and OpenCV.js WASM (bundled). No external APIs are called at runtime.
Rule: run `em_docs {action: "lookup", query}` before WebFetch/WebSearch for anything the project depends on; add missing sources with `em_docs {action: "add", name, url}`.
