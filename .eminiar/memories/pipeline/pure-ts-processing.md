---
name: pipeline/pure-ts-processing
kind: decision
supersedes: pipeline/model-choice
tags: []
related: [file:src/pipeline/process.ts, file:src/pipeline/capture.ts]
created: 2026-10-18T13:54:25.935Z
updated: 2026-10-18T13:54:25.935Z
---

OpenCV.js was removed (2026-10-18). Rectification (bicubic Catmull-Rom perspective warp with area pre-downsampling, 0.25% inset to hide edge anti-aliasing) and enhancement live in pure TS in src/pipeline/process.ts. Reason: OpenCV.js is 10.9MB on top of ORT's 14MB wasm; only a handful of ops were needed and capture runs in the background so ~1s/page in JS is fine. Enhancement 'color' divides by an illumination field estimated at ~360px from PAPER pixels only (morph close removes ink; paper = bright + chromaticity within 0.025 of the median paper chromaticity + low texture), interpolated with multi-scale normalised convolution — this keeps pale photos/colour boxes from being washed out. 'bw' = normalised luminance + local-mean adaptive threshold (photos become outlines; accepted, B&W is a text mode). Output cap 3600px long side / 9MP (A4@300dpi fits).
