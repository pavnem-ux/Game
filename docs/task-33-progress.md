# Task 33 — progress

Spec: [task-33-vfx.md](task-33-vfx.md). Branch `task-33-vfx`.

PR: https://github.com/pavnem-ux/Game/pull/32

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Library: procedural `vfx_*` textures (art-pack override by key), element palette, pooled emitters / rings / arcs / flashes / shards / trails, per-quality caps, crowd thinning
- [x] 2 Recipes: one `skillId → recipe` table (37 skills), basic attacks per class, synergies (III = bigger / brighter), talent secondaries and pet hits (lighter)
- [x] 3 Scene: events → recipes; slash arcs, arrow / bolt trails, element impacts, crit flash; player VFX below telegraphs and enemy projectiles
- [x] 4 Feel: hero lunge / cast glow / bow squash (≤ 120 ms), render-only hit-stop on crits / boss hits, heavy-hit shake (setting respected)
- [x] 5 Delivery: VFX on / off ⇒ identical simulation, caps per quality, final checks, README line, PR

## Decisions / blockers

- Library (`src/engine/vfx/`): every effect is a pooled sprite "particle" (fixed-capacity store,
  swap-remove, no allocation after start; clock = snapshot time, so effects pause with the game).
  Textures are generated white on canvases at boot and tinted by baked copies (the Canvas renderer
  ignores `setTint`). Caps per quality (provisional): High 220 / Medium 120 / Low 40 sprites; Low has
  no trails and no additive glow. Above `thinAbove` the layer thins (alpha × 0.6, every other optional
  particle skipped). An art pack replaces a `vfx_*` texture by manifest key (`kind: "vfx"`).
- Recipes (`src/engine/vfx/recipes.ts`, provisional): `SKILL_VFX` (all 37 ids; passives marked
  `passive`), `SYNERGY_VFX` (12; level III = `AWAKENED` ×1.45 + extra ring + core flash),
  `BASIC_VFX` per class, `SECONDARY_VFX` (off-hand, shadow copy, ballista, other talents, pets:
  `light` = ×0.6 size, ×0.7 alpha). `recipeFor(source)` routes `skill:` / `synergy:` / `talent:` /
  `pet.` / off-hand / basic attack; unknown ids fall back to the class's basic attack.
- Scene: `VfxDirector` (pure) reads this frame's events + the snapshot: weapon `attack-started`
  (slash arcs, staff glow), `impact` (element sparks / flash / shards; crit = bigger core flash +
  star), `damage` without a weapon impact (via the new read-only `GameplayWorld.attackSource`),
  `skill-activated` (cast), `skill-area` (rings, decals, plumes, slashes, bolts),
  `synergy-triggered` (level III bigger + core flash + extra ring), `pet-action`, projectile trails
  and zone decals / plumes (per-second rate on the simulation clock). Player VFX depth 6.6; enemy
  telegraphs (bombard circles, boss cast fills) moved to their own layer at 6.8 (outlines stay on the
  overlay), enemy projectiles at 7.
- Feel (`src/engine/vfx/feel.ts`, provisional): lunge 6 px / cast swell +7 % / bow squash, back at
  rest in 0.12 s (sprite offset and scale only); hit-stop freezes the struck sprite's animation clock
  (bob / squash) for 40 ms on crits and boss hits (position keeps following the simulation); a crit
  on the boss or a `heavy` area shakes 110 ms × 0.0035 only with the screen-shake setting, at most
  every 0.25 s.
- Delivery: `tests/engine/vfx-determinism.test.ts` runs each class twice (same seed / steps), once
  with the director reading every frame and the world's attack sources: identical digests. FPS
  (`tests/art-fps.mjs`, 117 enemies, DPR 1, one sandbox round): 56.1 procedural / 52.3 art — in line
  with the Task 25–26 table; not measured on real devices.
