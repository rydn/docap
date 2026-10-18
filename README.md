# docap

Hands-free document capture in the browser. Point your phone at a page: docap finds the document, waits for it to hold still, then captures, crops and deskews it automatically and adds it to a queue you can download as a ZIP.

Everything runs on-device (WebAssembly / WebGPU). No uploads, no server.

Live: https://rydn.github.io/docap/

## Develop

```sh
npm install
npm run models   # fetch the DocAligner corner models into public/models
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and production build (base `/docap/`) |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests with a fake camera (Playwright) |
| `npm run bench` | Detection accuracy benchmark |
| `npm run lint` | ESLint |
