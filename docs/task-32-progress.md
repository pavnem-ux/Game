# Task 32 — progress

Spec: [task-32-boss-sprites.md](task-32-boss-sprites.md). Branch `task-32-bosses-art` (from
`origin/task-31-art`: PR #30 is not merged yet; merge its latest state before finishing).

PR: https://github.com/pavnem-ux/Game/pull/31

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Pipeline: files, manifest, provenance, kind `boss`, registry, lazy (not in the preload), budget, tests
- [x] 2 In run: load the map's boss at run start, scale ≈ 2.6 × collision radius, feet anchor, flip, overlays on top
- [ ] 3 UI: map-path side panel and boss spawn notification portrait (locked maps: «?»)
- [ ] 4 Delivery: merge latest `task-31-art`, final checks, README line, PR

## Decisions / blockers

- Budget (provisional, owner to confirm): boss sprites are lazy (one per run / per selected map), so
  they are outside the 4 MiB in-game total; each file ≤ 128 KiB (largest 93,958 bytes, all 40 ≈ 3.17 MB).
- In run: the map's boss sprite is requested at run start (and when the manifest arrives, if the
  run started first), as its own loader batch after the boot art; the procedural boss is drawn until
  it loads. Boss telegraph outlines moved from the ground layer to the overlay so they stay visible
  over the larger sprite (fills stay on the ground). DEV `presentation().artBoss` for the e2e.
