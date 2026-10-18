---
name: onboarding/commands
kind: onboarding
tags: []
related: []
created: 2026-10-18T13:23:48.184Z
updated: 2026-10-18T13:23:48.184Z
---

Node >= 20 (dev machine has 25), npm.
- Install: `npm install` then `npm run models` (downloads DocAligner ONNX weights into public/models; committed once added).
- Dev server: `npm run dev` (camera needs https or localhost; for phone testing use `npm run dev -- --host` behind an https tunnel).
- Type-check: `npm run typecheck` (vue-tsc -b; TypeScript pinned ~6.0 because vue-tsc needs the JS API, TS 7 is Go-native).
- Lint: `npm run lint` (ESLint flat config, eslint-plugin-vue + typescript-eslint).
- Unit tests: `npm test` (Vitest, node env, tests/unit/**/*.test.ts).
- E2E: `npm run e2e` (Playwright, Chromium fake camera from a .y4m fixture).
- Accuracy benchmark: `npm run bench` (tsx bench/run-bench.ts; Node allowed for testing).
- Build: `npm run build` → dist/ with base /docap/ (override with DOCAP_BASE env). `npm run preview` to serve it.
- Release: push to main → GitHub Actions deploy.yml lints, tests, builds and deploys to Pages.
