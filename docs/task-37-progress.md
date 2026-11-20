# Task 37 — progress

Spec: [task-37-ui-cleanup.md](task-37-ui-cleanup.md). Branch `task-37-ui-cleanup`.

PR: https://github.com/pavnem-ux/Game/pull/35

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Top bar removed (QA corner badge kept, production none), unused styles removed
- [x] 2 Class emblems: files, manifest, provenance, kind `class-emblem`, `ClassEmblem` art + SVG fallback, tests
- [ ] 3 Synergy banners: compact toasts, ≤ 2 visible, ~2.5 s, queue, tests
- [ ] 4 Delivery: final checks, README line, PR

## Decisions / blockers

- Pack numbering: the class emblems are the owner's «art pack 10» (provenance row 10). The Task 33 VFX
  textures (an unnumbered owner pack) had been given row 10; they move to row 11.
- Top bar: the alpha's `<header className="topbar">` is gone from every screen (the shell is a flex
  column, so the arena / menus take the height). QA builds show a small fixed corner badge «QA
  PREVIEW» (`__QA_BUILD__` only; eliminated from production JS). Removed the alpha's `.topbar` media
  rules; the shared `.topbar` / `.brand` / `.build-badge` styles in `src/ui/styles.css` stay — the
  preserved prototype (`src/ui/App.tsx`) still uses them.
- Class emblems: kind `class-emblem` (key `class_<class>`, `characterClass` validated);
  `classEmblemEntry`; `ClassEmblem` now renders the shield `<img>` (width = size, height = size × 1.25,
  no frame) once the manifest has it, else the Task 13 SVG (`ClassEmblemSvg`), also when the image
  fails. Every usage goes through it (hub chips, equipment doll, talents header, `ClassPortrait`'s
  fallback). DOM images only — not in the scene preload.
