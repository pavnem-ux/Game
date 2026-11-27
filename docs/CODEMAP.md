# Code map

One current map of the code (Task 29; merged from the Task 08–18 progress files and updated to
Task 37). Update it when you add or move important files. Rules: [AGENTS.md](../AGENTS.md),
workflow: [TASK_WORKFLOW.md](TASK_WORKFLOW.md).

## Entry points

- `src/main.tsx` — mounts the alpha (`AlphaApp` inside `CrashGuard`); `/?prototype` = the first
  prototype (`src/ui/App.tsx`, `src/engine/GameScene.ts`, `src/core/`, `src/progression/`).
- `src/gameplay-ui/AlphaApp.tsx` — screens: menu (`CampaignMenu.tsx`), run (`AlphaCanvas.tsx` →
  Phaser `src/engine/AlphaScene.ts`), HUD (`CampaignHud.tsx`, `SkillPanels.tsx`), results
  (`ResultsScreen.tsx`, `RunStatsPanel.tsx`), banners (`SynergyBanners.tsx`, compact toast queue since Task 37).
- `src/gameplay-ui/store.ts` — `alphaBridge`: throttled snapshots (~10 Hz) and commands between React
  and the scene. `campaign-state.ts` — `campaignStore` (progression service, pages, `startRun`,
  purchases, talents, pets, quests).

## Simulation (framework-free; `GameplayWorld` is the only scheduler)

- `src/gameplay/` — `GameplayWorld.ts` (boundaries `peekBoundary` → `advanceToBoundary` →
  `resolveBoundary`, tie order, snapshot), `config.ts` (provisional numbers, `DASH_RULES`),
  `experience.ts` (`XP_RULES`, `runXpCost`), `spawning.ts`, `enemy-types.ts` (5 kinds, `ENEMY_MIX`),
  `chests.ts` (`CHEST_RULES`, buffs), `coins.ts`, `activities.ts` (shrine / thief / lantern / nest; Task 38 snare / altar / chain / seals),
  `rng.ts` (`createRunRandom` seeded streams), `run-stats.ts`, `qa.ts` / `testing.ts` (DEV / QA only).
- `src/combat-core/` — `CombatCore.ts`: the only owner of HP, damage, crit / Dodge, Resistance,
  death; `attack.ts`, `periodic.ts`.
- `src/weapon-attacks/` — targeting, attack cycles, melee sectors, projectiles, swept collision.
- `src/status-effects/` — Poison / Burn / Bleed (`StatusEffects.ts`, `WeaponStatusAdapter.ts`).
- `src/enemy-ai/` — `EnemyAI.ts`, `SpatialGrid.ts`, `EnemyProjectiles.ts`, `telegraph.ts`
  (artillery / boss circles).
- `src/player-survival/` — hit protection, death / one revival, `integration.ts`.
- `src/skills/` — `catalog/` (`SKILL_CATALOG`, 37 skills), `RunSkills.ts` (owned, offers,
  rerolls / banish / skip), `offers.ts`, `SkillEngine.ts` + `abilities.ts` (auto abilities, zones,
  Slow / Stun, attribution), `synergies.ts` (`SYNERGY_RULES`, levels, `SynergyResolver`),
  `synergy-info.ts` (UI info, card hints), `damage-readout.ts`, `stats.ts` (`composeRunStats`, caps
  once), `config.ts` (`SKILL_RULES`, tuning).
- `src/campaign/` — `config.ts` (`CAMPAIGN_MAPS` 1–40, acts, modifiers, Task 39 `DIFFICULTY_TIERS` / `getCampaignMap(id, tier)`), `timer.ts`, `schedule.ts`
  (elites / boss), `run-state.ts`, `elites.ts`, `bosses.ts`, `boss-abilities.ts`.
- `src/talents/` — `catalog.ts` (`TALENT_CATALOG_DATA`), `config.ts` (`TALENT_CONFIG`,
  `TALENT_RULES`), `rules.ts` (points, purchase, node state), `effects.ts`, `effect-data.ts`,
  `pipeline.ts`, `combat.ts` + `handlers/` (in-run behaviour), `runtime.ts`.
- `src/pets/` — `config.ts`, `logic.ts`, `runtime.ts` (six pet effects).
- `src/character-stats/` — classes, levels 1–50, `calculateCharacterStats`, caps.

## Meta progression and saves

- `src/profile/` — `profile.ts` (`PlayerProfile`, schema version), `class-xp.ts`, `rewards.ts`
  (`runRewards`), `apply-run.ts` (idempotent by run id), `equipment.ts` (`buyOffer`, `equipItem`, `grantItem`, `upgradeSlot`, `salvageItems`, `markItemsSeen`,
  Task 42 `receiveLoot`, `reforgeProfileItem`, `refreshShop`, `buyBagExpansion`), `pets.ts`, `quests.ts`,
  `recommended-level.ts`.
- `src/persistence/` — `saveSchema.ts` (parse, migrations, `normalizeProfile`), `saveStore.ts`
  (keys `skazki.profile` / `.backup` / `.quarantine`), `progressionService.ts`, `transfer.ts`.
- `src/equipment/` — Task 40 items model: `config.ts` (rarities, main / secondary stat rules, slot
  pools, name bands, shop rules), `items.ts` (`ItemInstance`, `generateItem`, `itemName`,
  `validateItem`), `logic.ts` (loadouts by uid, level gate, seeded `shopStock`), `stats.ts`
  (`gearModifiers`, `permanentStats`), `economy.ts` (`COIN_RULES`, Ore), Task 41 `slots.ts` (slot
  upgrade levels / multipliers / costs) and `bag.ts` (capacity, salvage, «better», `bagView`), Task 42 `drops.ts` (boss / elite rolls,
  item level caps) and `reforge.ts`, Task 43 `legendaries.ts` (catalogue, pools); effects in
  `src/talents/legendary.ts` ([LEGENDARIES.md](LEGENDARIES.md)).
- `src/quests/` — `config.ts`, `counters.ts`, `logic.ts`.

## UI

- `src/gameplay-ui/meta/` — `Hub.tsx`, `CharacterSelect.tsx`, `EquipmentScreen.tsx`,
  `TalentsScreen.tsx`, `BagScreen.tsx` (Task 41: equipped slots + upgrade, bag grid, item card), `ForgeScreen.tsx`, `PetsScreen.tsx`, `QuestsScreen.tsx`, `MapPath.tsx`;
  styles `meta.css`. Shop: `ShopPages.tsx`; settings / saves: `SaveManagement.tsx`.
- `src/gameplay-ui/kit/` — design tokens and components (`components.tsx`, `logic.ts`), art icons
  (`SkillIcon.tsx`, `ArtIcon.tsx` incl. `ItemIcon`, `BuffIcon`, lazy `BackgroundArt`, `Emblem`, `BossPortrait`, `CurrencyIcon.tsx`, `ClassPortrait.tsx`, `ClassEmblem.tsx` — pack art with the SVG fallback),
  pet portraits `src/gameplay-ui/pets/PetPortrait.tsx` (pack sprite, SVG fallback), sizes `icon-sizes.ts`
  (`ICON_SIZES` → `--icon-*`).
- Text: `src/gameplay-ui/strings-en.ts` (player text), `strings-en-debug.ts`; no Cyrillic in `src/`.
- DEV / QA only: `DeveloperPanel.tsx`, `DebugOverlay.tsx`, `campaign-debug.ts` (behind
  `import.meta.env.DEV || __QA_BUILD__`).
- Touch (frozen until pre-release): `TouchControls.tsx`, `touch.ts`, `DeviceChrome.tsx`,
  `src/engine/touch-input.ts`.
- Sound: `src/audio/` (`cues.ts`, `mapping.ts`, `director.ts`, `engine.ts`), `gameplay-ui/sound.ts`.

## Rendering (Phaser; rendering only)

- `src/engine/AlphaScene.ts` — input, drawing, scene commands; `time-scale.ts` — frame step, player
  game speed (Task 36) and fixed simulation steps (`SimStepper`); UI `gameplay-ui/GameSpeed.tsx`.
- `src/engine/visuals/` — procedural textures (`keys.ts`, `art.ts`, `texture-factory.ts`),
  `UnitRenderer.ts`, `BiomeRenderer.ts` + `biomes.ts` (procedural / art decor layout), `LightRenderer.ts`, `quality.ts`; art packs:
  `art-manifest.ts` (parser), `art-registry.ts` (key → look incl. pet followers, icon / item / pet lookups), `art-pack.ts`
  (manifest store), `art-loader.ts` (incl. lazy `loadBossArt`), `art-display.ts` (incl. `OBJECT_ART_SIZE`, `BOSS_BODY_WIDTH_PER_RADIUS`), `art-ground.ts`, `summons.ts`
  (Task 34: ballista / shadow copy presentation).
- Art files: `public/assets/` + `public/assets/manifest.json`; provenance `docs/ART_PROVENANCE.md`.
- `src/engine/vfx/` (Task 33, render only) — `textures.ts` (14 procedural `vfx_*` textures; an art pack
  replaces them by key), `palette.ts` (elements), `caps.ts` (per-quality caps), `particles.ts` (pooled
  store), `emitters.ts` (flashes, rings, arcs, sparks, shards, decals, plumes, bolts, trails),
  `recipes.ts` (one table: skills, synergies, basic / secondary attacks), `director.ts` (events →
  effects + feel signals), `feel.ts` (hero motion, hit-stop, heavy shake), `VfxRenderer.ts`.

## Config and build

- `vite.config.mjs`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.stats.json`, `.prettierrc.json`, `.node-version`.
- `config/qa-build.mjs` (QA build policy), `config/build-info.mjs` (version / commit label).
- `wrangler.jsonc` (production Worker; owner approval to change), `wrangler.qa.jsonc` (Preview /
  QA). CI: `.github/workflows/ci.yml`.

## Tests

- `npm test` — build-policy checks, `tests/model.test.ts`, all Vitest suites in `tests/<module>/`
  (per module: `test:combat`, `test:skills`, `test:campaign`, `test:talents`, …; see
  `package.json`).
- `npm run test:e2e` — desktop core flows (needs a dev server; `CHROMIUM_PATH`, `GAME_URL`):
  `tests/browser.mjs`, `alpha-browser.mjs`, `campaign-browser.mjs`, `activities-browser.mjs`,
  `art-browser.mjs`.
- `npm run test:e2e:extended` (opt-in) — mobile viewports and screenshot capture:
  `tests/mobile-browser.mjs`, `english-screens.mjs`.
- `npm run test:production` (`tests/alpha-production.mjs`), `npm run test:qa` (`alpha-qa.mjs`).
- Manual scripts (not in any suite): `tests/*-screens.mjs`, `*-shots.mjs`, `*-fps.mjs`,
  `ui-screenshots.mjs`, `skills-ui-browser.mjs`, `qa-tools-browser.mjs`.
