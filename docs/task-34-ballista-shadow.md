# Task 34 — Ballista Sprite + Shadow Copy Look

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `task-34-summons-art`.
Input (attached): `art-pack-9.zip` — `assets/summons/ballista.webp` (256×256, bottom-centre anchor, faces right),
`manifest-pack9.json`, `ART_PROVENANCE-pack9.md`. Rendering only — talent mechanics, hitboxes and balance unchanged.
Don't edit the image file.

## Spec
- File → `public/assets/summons/ballista.webp`; merge the manifest into `public/assets/manifest.json`; append the
  provenance row to `docs/ART_PROVENANCE.md`. Registry kind `summon` keyed by `ballista`; fallback to the current
  shape (`AlphaScene.ts`, «Task 09.1: talent entities»).
- **Ballista (archer.b3):** draw the sprite at the entity position (feet anchor), visible width ≈ 2.4× its radius
  (config value). Flip toward its current target with the existing no-jitter threshold; small recoil (sprite nudge
  back ~4 px, ~100 ms) on each shot; short spawn pop-in and fade-out on expiry. Keep the lifetime indicator and
  the light source. Bolt projectile stays code-drawn (with the Task 33 arrow trail if present).
- **Rogue shadow copy (rogue.b2.n03):** reuse `player_rogue` art: dark-violet tint, ~55% opacity, soft violet
  glow/outline, slight trailing afterimage while moving; fade in/out on spawn/expiry; flip like the player.
  No new art file.
- Tests: `ballista` key resolves; missing key → fallback.
