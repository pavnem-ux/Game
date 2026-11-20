# Task 34 — progress

Spec: [task-34-ballista-shadow.md](task-34-ballista-shadow.md). Branch `task-34-summons-art`.

PR: https://github.com/pavnem-ux/Game/pull/33

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Pipeline: file, manifest, provenance, kind `summon` (`summon_ballista`), registry, tests
- [x] 2 Ballista: sprite (feet, 2.4 × radius), flip to target, recoil on shots, pop-in / fade-out, lifetime ring, light
- [x] 3 Shadow copy: `player_rogue` art, dark violet, ~55 %, glow, afterimage, fade in / out, flip like the player
- [x] 4 Delivery: final checks, README line, PR

## Decisions / blockers

- Pack numbering: this ballista pack is the owner's «art pack 9» (provenance row 9). Task 33 (PR #32,
  not merged) had called the VFX textures «pack 9»; they become row 10 there.
- Ballista (`src/engine/visuals/summons.ts`, provisional): display radius 22 (width ≈ 52.8 px),
  feet at the entity position, mirrored toward the nearest living enemy (the ballista's own targeting
  rule) with the 8 px no-jitter threshold; pop-in 0.18 s (slight overshoot), fade-out over the last
  0.35 s, recoil 4 px back easing home in 0.1 s when a `talent:archer.b3.*` bolt appears within 48 px.
- The spec says «keep the lifetime indicator and the light source», but `main` had neither (the
  ballista was a plain square). Added: a gold lifetime arc at its feet and a small warm light (90 px).
- Shadow copy: `player_rogue` art (same baked size as the player), multiply-tinted dark violet
  (`0x5b3c9e`), 55 % opacity with a violet glow, fade in 0.15 s / out 0.3 s, mirrored like the
  player; while it moves (> 30 px/s) two afterimages trail along its last 0.2 s of positions.
- Without the art (manifest missing / still loading) both keep the Task 09.1 shapes.
