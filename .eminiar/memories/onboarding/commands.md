---
name: onboarding/commands
kind: onboarding
tags: []
related: []
created: 2026-10-18T13:23:48.184Z
updated: 2026-10-18T14:40:23.541Z
---

Node >= 20 (dev machine 25, CI 22), npm. Shell is zsh (see env/zsh-and-hooks).
- Install: `npm install`; model is committed (public/models), `npm run models` re-fetches it.
- Dev: `npm run dev` (COOP/COEP headers set → threaded WASM). Camera needs https/localhost.
- Type-check `npm run typecheck` (TS pinned ~6.0 for vue-tsc), lint `npm run lint`, unit `npm test`.
- E2E: `npm run e2e` (Playwright builds + `vite preview` on :4173/docap/, Chromium fake camera from generated Y4M). First run: `npx playwright install chromium`.
- Bench: `npm run bench` (synthetic gates); real data: `npm run data:smartdoc` (1GB → bench/data/smartdoc) then `npm run bench -- --smartdoc bench/data/smartdoc --stride 20`; DocCorner: parquet shards in bench/data/doccorner then `--doccorner bench/data/doccorner --limit N`. Flags: --no-synthetic, --n, --refine (A/B), --no-complete, --min-corner X, --size. Compact view: `npx tsx bench/summary.ts [minCases]`; failures: `npx tsx bench/dev/failures.ts <groupPrefix>`.
- Perf/isolation check like Pages: `npm run build && DOCAP_PAGES_LIKE=1 npx vite preview --port 4173` then `npx tsx tests/e2e/perf.ts` (prints crossOriginIsolated + ms/frame). Screenshots: tests/e2e/screens.ts OUTDIR.
- Release: push to main → .github/workflows/deploy.yml: lint, typecheck, unit, SmartDoc download (cached) + bench gates, e2e → build → deploy to https://rydn.github.io/docap/ (Pages source = GitHub Actions, enabled 2026-10-18).
