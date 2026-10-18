---
name: bench/real-datasets
kind: fact
tags: []
related: [file:bench/real-datasets.ts, file:bench/run-bench.ts]
created: 2026-10-18T14:19:02.515Z
updated: 2026-10-18T14:19:02.515Z
---

Real-photo benchmarks (data in bench/data, gitignored; loaders in bench/real-datasets.ts):
- SmartDoc 2015 ch1 frames v2.0.0 (github.com/jchazalon/smartdoc15-ch1-dataset, frames.tar.gz 1GB, sha256 OK) extracted to bench/data/smartdoc (background01..05/, metadata.csv.gz). Run: npm run bench -- --no-synthetic --smartdoc bench/data/smartdoc --stride 10.
- DocCornerDataset test shards 0 and 3 (huggingface mapo80/DocCornerDataset, parquet, read with hyparquet utf8:false) in bench/data/doccorner: ~1756 positives from ~40 sources (MIDV ID cards, receipts, book pages, Roboflow sets, many with docs touching/exceeding frame or augmentation padding) + 244 COCO negatives.
Results 2026-10-18 (720px analysis, lcnet100): SmartDoc stride10 (2489 frames) mean IoU 0.982→0.985 after RANSAC refiner, detection 100%, model-only coarse 0.990 — refinement initially HURT on backgrounds 04/05 where paper vs desk contrast is ~0–13 gray levels and datasheets have printed border rules inside the edge. DocCorner: mean IoU ~0.69, detection ~74% at minCornerScore 0.2, 0 false positives on 244 negatives; misses are model-level (partial/no-document), many are non-scanning shots.
Tools: bench/summary.ts (compact table), bench/dev/failures.ts, viz-real.ts, viz-smartdoc.ts, edge-profile.ts.
