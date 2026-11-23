# Task 37 — Remove Top Bar, Class Emblem Art, Smaller Synergy Banners

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `task-37-ui-cleanup`.
Input (attached): `art-pack-10.zip` — `assets/ui/classes/class_{warrior,mage,archer,rogue}.webp` (256×320, shield
emblems), `manifest-pack10.json`, `ART_PROVENANCE-pack10.md`. UI only — no gameplay changes. Don't edit the images.

## Spec
1. **Top bar:** remove the `<header className="topbar">` in `src/gameplay-ui/AlphaApp.tsx` (logo «Fantasy Survivors»,
   «Chronicles of the Last Light», «Combat Alpha · 08 Campaign») from every screen; screens use the freed height.
   QA builds keep a small corner badge «QA PREVIEW» (required by `tests/alpha-qa.mjs`; production must still have
   none — `tests/alpha-production.mjs`). Remove now-unused styles.
2. **Class emblems:** files → `public/assets/ui/classes/*`, merge the manifest, append the provenance row. Registry
   kind `class-emblem` keyed by class. `ClassEmblem` (`src/gameplay-ui/kit/ClassEmblem.tsx`) renders the art when
   loaded (keep aspect 4:5, no extra frame), falling back to the current procedural SVG. This covers every usage
   (hub, equipment, talents, `ClassPortrait` fallback). Size props keep meaning height ≈ size × 1.25.
3. **Synergy banners** (`src/gameplay-ui/SynergyBanners.tsx`): compact toast instead of a large panel — top-centre
   below the timer, max width ~360 px desktop, one line: synergy icon (32 px) + name + level (I/II/III, awakening in
   gold) and the two skill icons small; max 2 visible at once (queue the rest), ~2.5 s each, fade in/out, never
   covers the play area centre or the HUD bars. Keep `role="status"` and the existing test ids.
- Tests: emblem key per class resolves / fallback; banner queue shows at most 2; existing production/QA tests pass.
