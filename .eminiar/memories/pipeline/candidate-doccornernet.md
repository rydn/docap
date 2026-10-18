---
name: pipeline/candidate-doccornernet
kind: todo
tags: []
related: []
created: 2026-10-18T14:19:46.736Z
updated: 2026-10-18T14:19:46.736Z
---

Candidate model to evaluate later: DocCornerNet-CoordClass (github.com/mapo80/DocCornerNet-CoordClass, MIT). MobileNetV2 α=0.35 + SimCC coordinate-classification head, 495K params, 224/256 input, ImageNet mean/std normalisation, outputs coords[8] (TL,TR,BR,BL normalised) + score_logit. Reported mIoU 0.98 on DocCornerDataset test (in-domain: trained on it, incl. SmartDoc/MIDV) vs DocAligner lcnet100 ~0.69 on the same images (mostly misses). Blocker: repo ships only .keras/.h5 checkpoints + Python export scripts (tflite/onnx); user forbids Python, so using it needs a JS Keras(.keras zip + HDF5 via h5wasm) → ONNX/TF.js converter, or the author publishing ONNX/TFLite. TFLite could run in-browser via @tensorflow/tfjs-tflite if a .tflite becomes available.
