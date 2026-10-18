---
name: arch/frontend-only
kind: constraint
tags: [architecture, constraint, testing]
related: []
created: 2026-10-18T13:19:37.051Z
updated: 2026-10-18T13:20:01.759Z
---

User rule: the app is front end only — no Python, no backend/server. All detection, rectification, enhancement and export run in the browser (TS + WASM/WebGPU). Node IS allowed for testing (user, 2026-10-18): Vitest unit tests, the accuracy benchmark (may use onnxruntime-node + opencv-js running the same TS pipeline modules), and Playwright e2e. Python sources (e.g. DocAligner) may only be read as reference to port logic to TS; never run Python.
