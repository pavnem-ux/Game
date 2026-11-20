# Task 33 — Attack & Skill VFX Pass

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `task-33-vfx`.
Rendering only: effects never change simulation, timing, hitboxes or balance (render layer reads events/snapshots,
nothing feeds back; same seed ⇒ identical results with VFX on/off). Original procedural art; an owner VFX texture
pack may come later (keys `vfx_*`, see below) — build with procedural textures and the art-registry fallback.

## Spec
- **VFX library** (`src/engine/vfx/`): pooled particle emitters, trails, expanding rings, arcs, flashes, floating
  shards; additive blending for glows; per-effect caps; all counts scale with the existing «Graphics quality»
  setting (Low = minimal). Allocation-free in hot loops.
- **Textures:** generate soft procedural textures at boot (glow, spark, ring, smoke, slash arc, shard, flame,
  droplet, lightning segment, rune circle, ground cracks, trail). Register them under keys `vfx_glow_soft`,
  `vfx_spark_star`, `vfx_shockwave_ring`, `vfx_smoke_puff`, `vfx_slash_arc`, `vfx_ice_shard`, `vfx_flame`,
  `vfx_poison_drop`, `vfx_lightning`, `vfx_rune_circle`, `vfx_cracks_ground`, `vfx_arrow_trail`,
  `vfx_blood_splash`, `vfx_frost_burst` so a later art pack replaces them by manifest only.
- **Element palette** (one table): physical white/steel, fire orange, ice light blue, poison green, bleed crimson,
  lightning violet, arcane gold. White textures are tinted by element.
- **Recipes:** one data table `skillId → recipe` (cast, projectile/trail, impact, area) for all 37 skills, plus
  basic attacks per class, synergies (level III = larger/brighter variant) and talent secondary attacks (off-hand,
  shadow copy, ballista, pet hits — lighter). New/changed skills are tuned by data only.
- **Basic attacks:** sword/dagger slash arc with fading tail; arrows with short trail; staff bolt with glow and
  spark trail; impact sparks coloured by element; crits get a bigger flash + star.
- **Hero motion (sprite only):** short lunge toward the target on melee swing, cast glow before spells, small bow
  pull squash; return within ~120 ms.
- **Impact feel:** hit flash already exists; add a render-only micro «hit-stop» on crits/boss hits (freeze the
  struck sprite pose ~40 ms, never the simulation) and small screen shake only for heavy hits (respects the
  existing screen-shake setting).
- **Readability rules:** player VFX render below enemy telegraphs and enemy projectiles and use reduced alpha in
  crowds (auto-thin when > N effects on screen); telegraphs always on top and fully opaque.
- Tests: recipe table covers every skill id and synergy id; VFX on/off ⇒ identical simulation for a fixed seed;
  emitter caps per quality level.
