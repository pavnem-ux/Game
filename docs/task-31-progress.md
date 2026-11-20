# Task 31 — progress

Spec: [task-31-decor-menus-objects.md](task-31-decor-menus-objects.md). Branch `task-31-art`.

PR: https://github.com/pavnem-ux/Game/pull/30

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Pipeline: files, manifest, provenance, kinds, registry, split budget, tests
- [x] 2 Decor: art props per act, seeded placement, below all gameplay, tall-prop density / exclusion
- [x] 3 Objects: shrine, lanterns, open chests, buff icons + popups, Gold / Ore UI icons
- [x] 4 Menus: lazy backgrounds (hub, act regions of the map path) + emblem
- [x] 5 Delivery: final checks, README line, PR

## Decisions / blockers

- Art budget split (owner decision, Task 31): in-game / preloaded art ≤ 4 MiB, lazy menu backgrounds ≤ 2 MiB.
- Decor: no per-map tint on the art props (Canvas ignores setTint; the ground stays tinted). Tall props hidden within 250 of live activities / chests at render time (they spawn after the layout).
- Chests had no open effect before: the open art now shows 0.8 s at the chest (fading); `lastOpened` gained a read-only `x` / `y`.
- Step 4: `BackgroundArt` (lazy `<img>`, fades in on load, dark gradient + vignette; nothing on a
  missing/failed file) behind the hub and each map-path act region; `Emblem` (ICON_SIZES 168 / 96
  compact) above the hub title. The Task 27 "≤ 128 px" size check now skips the emblem sizes, which
  are checked against their 512 px source instead.
