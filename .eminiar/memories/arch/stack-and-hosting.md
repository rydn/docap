---
name: arch/stack-and-hosting
kind: decision
tags: [architecture, hosting]
related: []
created: 2026-10-18T13:18:18.606Z
updated: 2026-10-18T13:18:18.606Z
---

docap: Vue 3 (<script setup>) + TypeScript strict + Vite + Pinia. Hosted on GitHub Pages from public repo rydn/docap at https://rydn.github.io/docap/ — Vite base must be '/docap/'; deploy via GitHub Actions Pages workflow. All processing on-device (no server). Export = ZIP of selected images (fflate); single selection downloads the lone image. Queue persisted in IndexedDB.
