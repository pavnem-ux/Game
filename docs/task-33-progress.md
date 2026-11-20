# Task 33 — progress

Spec: [task-33-vfx.md](task-33-vfx.md). Branch `task-33-vfx`.

PR: https://github.com/pavnem-ux/Game/pull/32

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Library: procedural `vfx_*` textures (art-pack override by key), element palette, pooled emitters / rings / arcs / flashes / shards / trails, per-quality caps, crowd thinning
- [x] 2 Recipes: one `skillId → recipe` table (37 skills), basic attacks per class, synergies (III = bigger / brighter), talent secondaries and pet hits (lighter)
- [ ] 3 Scene: events → recipes; slash arcs, arrow / bolt trails, element impacts, crit flash; player VFX below telegraphs and enemy projectiles
- [ ] 4 Feel: hero lunge / cast glow / bow squash (≤ 120 ms), render-only hit-stop on crits / boss hits, heavy-hit shake (setting respected)
- [ ] 5 Delivery: VFX on / off ⇒ identical simulation, caps per quality, final checks, README line, PR

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
