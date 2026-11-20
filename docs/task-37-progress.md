# Task 37 — progress

Spec: [task-37-ui-cleanup.md](task-37-ui-cleanup.md). Branch `task-37-ui-cleanup`.

PR: (draft)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [ ] 1 Top bar removed (QA corner badge kept, production none), unused styles removed
- [ ] 2 Class emblems: files, manifest, provenance, kind `class-emblem`, `ClassEmblem` art + SVG fallback, tests
- [ ] 3 Synergy banners: compact toasts, ≤ 2 visible, ~2.5 s, queue, tests
- [ ] 4 Delivery: final checks, README line, PR

## Decisions / blockers

- Pack numbering: the class emblems are the owner's «art pack 10» (provenance row 10). The Task 33 VFX
  textures (an unnumbered owner pack) had been given row 10; they move to row 11.
