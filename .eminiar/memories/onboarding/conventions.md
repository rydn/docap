---
name: onboarding/conventions
kind: onboarding
tags: []
related: []
created: 2026-10-18T13:23:52.930Z
updated: 2026-10-18T13:23:52.930Z
---

- Front end only: no backend, no Python. Node only for tests/bench/scripts.
- Commits authored as Ryan Dick <noxinoobin@gmail.com> (repo-local config); never add Claude/AI attribution or Co-Authored-By trailers. Commit in logical implementation phases with descriptive messages (summary line + short body).
- TypeScript strict with noUncheckedIndexedAccess; Vue SFCs use <script setup lang="ts">; Pinia for state.
- Pipeline code in src/pipeline is pure functions over plain typed arrays (no DOM, no Vue) so it runs in the worker, in Vitest, and in the Node bench identically. OpenCV Mats must be .delete()'d — wrap in try/finally.
- Points are {x, y} in source-image pixels; quads are always ordered TL, TR, BR, BL (clockwise in image coords).
- Tests: unit tests per pipeline module in tests/unit/<module>.test.ts with synthetic, exact-ground-truth fixtures; accuracy regressions are caught by the bench thresholds, not unit tests.
- Vite base path is /docap/ — use import.meta.env.BASE_URL for runtime asset URLs (models, wasm).
