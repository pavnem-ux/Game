# Task 33 — progress

Spec: [task-33-vfx.md](task-33-vfx.md). Branch `task-33-vfx`.

PR: (draft)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [ ] 1 Library: procedural `vfx_*` textures (art-pack override by key), element palette, pooled emitters / rings / arcs / flashes / shards / trails, per-quality caps, crowd thinning
- [ ] 2 Recipes: one `skillId → recipe` table (37 skills), basic attacks per class, synergies (III = bigger / brighter), talent secondaries and pet hits (lighter)
- [ ] 3 Scene: events → recipes; slash arcs, arrow / bolt trails, element impacts, crit flash; player VFX below telegraphs and enemy projectiles
- [ ] 4 Feel: hero lunge / cast glow / bow squash (≤ 120 ms), render-only hit-stop on crits / boss hits, heavy-hit shake (setting respected)
- [ ] 5 Delivery: VFX on / off ⇒ identical simulation, caps per quality, final checks, README line, PR

## Decisions / blockers
