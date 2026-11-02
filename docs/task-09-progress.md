# Task 09 — progress

Spec: [task-09-talents.md](task-09-talents.md) (owner's text, Prettier-formatted). Content:
[talents.md](talents.md) (catalog `.docx` converted to Markdown). Gaps:
[talents-gaps.md](talents-gaps.md). Code map: reuse [task-08-progress.md](task-08-progress.md)
and [task-08.5-progress.md](task-08.5-progress.md) (additions below).

Current (Task 09): Phases 0–4 done; Phases 5–7 are carried out as Task 09.1 (below)

Branch `task-09-talents` from `task-08.5-playtest` (Task 08.5, PR #5): 08.5 is not merged into
`main` yet (spec 0.1). The draft PR targets `task-08.5-playtest` so its diff shows only Task 09;
retarget after PR #3/#4/#5 are merged.

## Steps

### Phase 0 — Setup & content audit

- [x] 0.1 Branch, progress file, draft PR; catalog + spec committed
- [x] 0.2 Existing save/RNG/run-stats APIs recorded in the code map
- [x] 0.3 Content gate: `docs/talents-gaps.md` — **gaps found** (G0 + 28 blocking + 26 clarification ranks)

### Phase 1 — Data model & rules

- [x] 1.1 Talent config schema + loader (missing entries marked, inert)
- [x] 1.2 Purchase/validation, points derivation, prerequisites, level-30 gate
- [x] Tests (4 × 3 × 14 × 3, prereq rank II, rank III optional, ≤ III, points ≥ 0, gate,
      superpower inactive before b3.n01 rank I, independent trees)

### Phase 2 — Persistence

- [x] 2.1 Schema bump, migration (`talents`, drop `talentsSpent`), validation
- [x] Tests (reload, class switch, export/import, migration, invalid data rejected)

### Phase 3 — Modifier pipeline

- [x] 3.1 Talent effects → existing hooks; apply once; source ids; anti-recursion
- [x] Tests (applied once, caps, no synergy unlock, run reset keeps talents)

### Phase 4 — UI & debug

- [x] 4.1 Talent screen
- [x] 4.2 Debug controls

### Phase 5 — Standard branches

- [ ] 5.1 Rogue · [ ] 5.2 Mage · [ ] 5.3 Warrior · [ ] 5.4 Archer

### Phase 6 — Superpowers

- [ ] 6.1 Rogue · [ ] 6.2 Mage · [ ] 6.3 Warrior · [ ] 6.4 Archer

### Phase 7 — Delivery

- [ ] 7.1 Full regression + production build
- [ ] 7.2 Talent checks in `docs/playtest.md`
- [ ] 7.3 PR description; ready only if no gaps remain (don't merge)

## Task 09.1 — talent combat effects (catalog v1.2)

Spec: [task-09.1-talent-effects.md](task-09.1-talent-effects.md). Source: `docs/talents.md` = catalog
v1.2 (byte-identical to the owner's file; excluded from Prettier). Gap resolution:
[talents-gaps.md](talents-gaps.md#resolution-table-catalog-v12-task-091).

Current: 09.1 Phase 7 (Warrior b3)

### 09.1 steps

- [x] 0.1 `docs/talents.md` = catalog v1.2 (56 nodes, 168 ranks, appendix G0–G12/C1–C8); config
      regenerated (verbatim texts, `refs` per rank); status model `pending`/`ready`/`blocked`
- [x] 0.2 Inert ranks listed below
- [x] 0.3 Resolution table in `docs/talents-gaps.md` (original audit kept)
- [x] 1.1 Condition helpers · [x] 1.2 Cooldowns/refresh buffs · [x] 1.3 Secondary sources ·
      [x] 1.4 Talent entities · [x] Phase 1 tests
- [x] Phase 2 Rogue b1–b2 (G3, G4, C8) — 28 ranks ready; `rogue.b1.n02` II–III blocked (E1)
- [x] Phase 3 Rogue b3 (G1, G2, G5, C5) — 10 ranks ready; `rogue.b3.n03` II–III blocked (E2)
- [x] Phase 4 Mage b1–b2 (C2) — 30 ranks ready, none blocked
- [x] Phase 5 Mage b3 (C1) — 12 ranks ready, none blocked
- [x] Phase 6 Warrior b1–b2 (C3, C6, G12) — 30 ranks ready, none blocked
- [ ] Phase 7 Warrior b3 (G6, G7, C4)
- [ ] Phase 8 Archer b1–b2 (G11)
- [ ] Phase 9 Archer b3 (G8, G9, G10, C7)
- [ ] 10.1 Coverage · [ ] 10.2 Regression · [ ] 10.3 Playtest smoke checks · [ ] 10.4 Docs ·
      [ ] 10.5 PR description

### 0.2 Inert ranks (status `pending`; updated as ranks become `ready`)

All 168 ranks are `pending` at the start of 09.1 (Task 09 built only the stat pipeline; no rank
had effect descriptors):

- rogue: `rogue.b1.n02` II–III **blocked** (E1); `rogue.b3.n03` II–III **blocked** (E2); all other 38 Rogue ranks ready (Phases 2–3)
- mage: all 42 Mage ranks ready (Phases 4–5)
- warrior: `warrior.b3.n01`–`n04` I–III pending; all Warrior b1–b2 ranks ready (Phase 6)
- archer: `archer.b1.n01`, `archer.b1.n02`, `archer.b1.n03`, `archer.b1.n04`, `archer.b1.n05`, `archer.b2.n01`, `archer.b2.n02`, `archer.b2.n03`, `archer.b2.n04`, `archer.b2.n05`, `archer.b3.n01`, `archer.b3.n02`, `archer.b3.n03`, `archer.b3.n04` — I–III

### 09.1 code map

- **Phase 1:**
  - `src/talents/effect-data.ts`: `TALENT_RANK_EFFECTS` (implemented ranks → `ready`) and `TALENT_BLOCKED`, applied by `withEffectData`; `effects.ts` gains the `behavior` kind (catalog params).
  - `src/talents/runtime.ts`: `TalentRuntime` with active `rank`/`params`, seeded `roll`, cooldowns, refresh-not-stack buffs (`onBuffsChanged` → `refreshStats`), the proc guard, and entities with `scheduled()` boundaries.
  - `src/talents/conditions.ts`: DoT stacks/types, HP %, stunned/slowed/marked, moving.
  - Wiring:
    - `SkillEngine.talents` merges the runtime entries into `nextEvent` and prunes them;
    - `SkillHost.talents {ranks, config?, random}`;
    - a new `talents` RNG stream (`STREAM_SALTS.talents`);
    - `GameplayWorld.cleanupTalentEntities` runs on death and run end, also while frozen.
  - Tests: `tests/talents/runtime.test.ts`.

- **Phase 2:**
  - `src/talents/combat.ts`: `TalentCombat` dispatcher providing the hit multiplier (direct % sum and exact crit-damage ratio), category crit chance, DoT factor, synergy factor and dodge reactions; also defines the `TalentEngine` view.
  - `src/talents/handlers/rogue.ts`, registered in `handlers/index.ts`.
  - Engine hooks:
    - `SkillEngine.targetMultiplier(…, tags)`;
    - `attack()` adds the talent crit bonus;
    - `playerEffect(def, {basic})` takes the DoT origin;
    - `onPlayerDodged`;
    - `weaponAttackBonus`;
    - `talentStrike(…, {noCritical})`;
    - talent stat buffs in `modifiers()`.
  - Additive APIs:
    - Combat Core `AttackRequest.noCritical`;
    - weapon `attackModifier` hook;
    - stat `movementSpeedPercent`.
  - The world forwards dodged enemy attacks.
  - Tests: `tests/talents/rogue.test.ts`.

- **Phase 3:**
  - Rogue handlers: `superpowerProcs` (3.1, `onBasicHit`), `rogue.b3.n02` in `direct`, `dotTakenMultiplier` (3.3 rank I), `synthesis` (3.4, `onStatusesApplied`).
  - Engine hooks:
    - `SkillEngine.handleImpact` calls `onBasicHit` for each basic weapon hit (`status === 'hit'`);
    - Status Effects option `damageMultiplier(group)` (additive; scales every stack contribution and the tick total; default 1);
    - the world collects enemies that received a status during a boundary and calls `onStatusesApplied` before `endStep`.
  - Tests: `tests/talents/rogue-b3.test.ts`, `tests/status-effects/damage-lifecycle.test.ts` (multiplier).

- **Phase 4:**
  - `src/talents/handlers/mage.ts`, registered in `handlers/index.ts`.
  - New `TalentClassHandlers` hooks: `dotDuration`, `synergySpread`, `skillAreaFactor`, `slowBonus`, `cooldownReductionBonus`, `onSkillCrit`, `onPlayerDirectDamage`; `DirectHitContext` gains `slowed` and `player`.
  - Engine hooks:
    - `SkillEngine.area()` applies the executing skill's talent radius factor before `areaSize`;
    - `playerEffect` passes the applying skill (`skillId`) and applies the duration factor;
    - `slow()` adds the talent Slow bonus of the executing ice skill before the existing cap;
    - `activate()` takes CDR from `cooldownReduction()`: a conditional talent CDR is composed through `composeRunStats` (cap applied once);
    - `afterHit` reports critical direct hits of the executing skill (`procs` hits only);
    - `grantBarrier` (C2 single slot) — the bonus Barrier now uses it too;
    - `reduceSkillCooldown`, `controlState`, `playerId` in the TalentEngine view;
    - Wildfire takes its radius/neighbour count from `synergySpread`.
  - The world forwards real direct damage to the player (`appliedDamage > 0`) as `onPlayerDirectDamage`.
  - Tests: `tests/talents/mage.test.ts`.

- **Phase 5:**
  - `RunSkills`: `enableExtraAutoSlot()` (set once at run start), `autoSlots` (4 or 5), `enhancedSkillId`, `pendingEnhancedChoice`, `chooseEnhanced`, `grantWithEvents`; offers use the run's slot maximum (`OwnedView.autoMax`, additive). New skill event `enhanced-skill` (`default` / `chosen`); the snapshot gains `enhancedSkillId` / `enhancedChoice`.
  - World: the slot comes from the handler hook `extraAutoSlots`; a pending enhanced choice pauses the world like a level-up offer; `chooseEnhancedSkill(id)`.
  - Talent hooks: `cooldownMultiplier` (after CDR), `enhancedSkillId()` in the engine view, `DirectHitContext.skillId/enhanced`, `DotOrigin.enhanced`, `skillAreaFactor(…, enhanced)`.
  - UI: `EnhancedSkillDialog` (screen `enhanced-skill`, bridge command `choose-enhanced`), enhanced chip marker in the skill bar; P/Esc does not unpause while the choice is open.
  - Tests: `tests/talents/mage-b3.test.ts`.

- **Phase 6:**
  - `src/talents/handlers/warrior.ts`, registered in `handlers/index.ts`.
  - New hooks: `onKill`, `buffStackBonus` (Battle Fury), `stunBonus`, `playerDamageTakenMultiplier`, `conditionalStats`, `onPlayerHpChanged`; `DirectHitContext` gains `stunned` and `targets`; the engine view gains `nearestEnemy` and `healPlayer`.
  - Additive module APIs:
    - EnemyAI option `playerDamageMultiplier(attack)` for contact and projectile hits on the player (G12; Core applies it before resistance and its single rounding);
    - `DamageModifierContext.targetCount`: a melee strike selects its targets first (same filter and order), then resolves them;
    - `SkillEngine.withTargetCount` used by `areaHit`.
  - `SkillEngine.onPlayerHpChanged(damage)` (world forwards every player damage/heal/revive/Max HP event): threshold reactions and one recomposition when a conditional stat flips.
  - Tests: `tests/talents/warrior.test.ts`.

### 09.1 decisions

- 0.1: the owner asked to keep the catalog content exactly, so `docs/talents.md` is the uploaded
  file byte-for-byte and listed in `.prettierignore` (Prettier would rewrite emphasis markers and
  spacing). The config test parses the v1.2 layout.
- **Phase 2:** catalog ranks are read as totals, so a higher rank's text replaces the lower one's.
  - Examples: `rogue.b1.n01` III gives +15%, plus +10% at 10 stacks; it does not carry rank II's «+5% at 5+». `rogue.b1.n04` III drops the rank II Bleed +5%.
  - Talent % bonuses from different nodes on one hit are summed, then applied once.
  - The shadow copy's first strike comes one interval after it appears; G3 doesn't define an earlier one.
  - Counterattacks may crit (the catalog only forbids crits for the copy, in G4).
  - Movement percents add up and are applied once to the composed movement speed.
- **Phase 3:**
  - 3.1 rolls on every basic dagger hit that lands (one roll for Poison, one for Burn, on each enemy the strike hits); the new stacks carry `talent:rogue.b3.n01` as their origin, so run stats list them as that source.
  - 3.2/3.3 count a DoT type as present when its group has at least one stack.
  - 3.4 checks the 10/10/10 condition after each boundary in which the enemy received a status. The radius uses body overlap (`distance ≤ radius + body radius`), the same rule as every skill AoE.
  - A blocked rank II/III of `rogue.b3.n03` is inert as a whole (ranks are totals), same as E1.
- **Phase 4:**
  - 1.1 «огненных и ледяных прямых навыков»: direct hits tagged `skill` + `fire`/`ice` (zone ticks included; synergy procs excluded). The AoE radius factor multiplies the skill's base radius before the existing `areaSize` scaling.
  - 1.2 «Burn, наложенный навыками Мага»: Burn applied while a Mage skill's code runs (including the Elemental Mastery passive); the basic weapon's Burn and Wildfire's Burn are not affected. Rank II/III's group duration bonus has the same scope.
  - 1.3 «Ледяные атаки»: any direct hit tagged `ice` (skills); the target counts as slowed at the moment of the hit. Slow «+3/+5 п.п.» is +0.03/+0.05 of the engine's Slow fraction; the existing 60% cap is unchanged.
  - 1.4 rank II keeps the rank I Thermal Shock +10% («Также Shattered Ice»).
  - 1.5 the radius bonus is added to Wildfire's base radius (130) before the `areaSize` scaling; neighbours are 3 + 1/2, capped at 4/5. No cascade already holds (synergy-applied Burn never re-spreads).
  - 2.2 crit damage +10/+20 p.p. applies to magical skills only (the node's scope), on critical hits.
  - 2.3 / C2: real direct damage = a Core `damage` event on the player with `appliedDamage > 0` (a hit fully absorbed by a barrier does not trigger). One barrier slot for the bonus Barrier and the talent: a weaker new barrier only extends the expiry. The bonus Barrier now follows the same C2 rule (before: it always replaced) — required by C2, which names the bonus Barrier.
  - 2.4 «HP выше 70%» is strict. The CDR bonus is read when a cooldown starts.
  - 2.5 the internal cooldown (1/1/0.8 s) is one per node, not per skill; the reduction never makes a cooldown end before «now».
- **Phase 5:**
  - C1: the choice opens right after the 5th distinct active is acquired (offer or DEV grant), with that skill enhanced by default; it pauses the world until the player picks one of the five (picking the default is allowed). There is no later reassignment (no further actives can be acquired).
  - Enhanced-skill % bonuses (3.1, 3.2, 3.4) are summed with the other talent bonuses of the same hit/area/DoT, then applied once. The enhanced skill's cooldown reductions (3.1 III −5%, 3.3 −5/10/15%) are summed and multiply the already CDR-scaled cooldown; they never touch other skills.
  - 3.2 «урон DoT этого навыка»: DoT applied while the enhanced skill's own code runs (not a passive reacting to its hit).
  - 3.4 «капы сохраняются»: crit chance and CDR caps stay central; Character Stats has no crit-damage cap, so the extra crit damage is not capped.
- **Phase 6:**
  - 1.1 «Прямой урон меча» = the basic sword (tags `basic` + `melee`); Warrior skills carry no sword tag. «Атаки в ближнем бою по 2+ целям» = any melee direct hit whose attack hits 2+ targets (sword sector or skill area).
  - 1.2 «физический урон» is applied as a direct-hit bonus to physical hits (no DoT, per the shared rule); thresholds are strict («ниже»).
  - 1.3 counts direct melee kills by the player's own hits (talent/secondary kills excluded); the buff is a separate timed `physicalDamagePercent` buff, never merged with Battle Fury.
  - 1.4 «Скорость атаки в ближнем бою» = the attack speed stat (the Warrior's weapon is melee).
  - 2.2 G12 applies to enemy contact attacks and enemy projectiles (including boss radial projectiles). Boss scripted contact abilities are «special scripted damage» and are not reduced.
  - 2.3 «ближайшему врагу»: nearest living enemy with no range limit (the catalog names none); retaliation can crit.
  - 2.4 the Stun bonus applies to Stuns applied by the Warrior's skills (not synergies), before the 1.5 s limit; Stun immunity is unchanged.
  - C3: the heal reacts to the player's HP percentage seen before/after each Combat Core damage event; the run starts at full HP, so starting «below» never heals.
- 0.1: status model per rule 7. `TALENT_CATALOG_APPROVED = true` (G0), but a rank is active only
  when `ready`, and a `ready` rank must carry effects; the loader enforces both. The UI marks
  pending ranks «пока не действует в бою».

## Code map (Task 09)

Existing APIs this task builds on (0.2, verified present):

- **Save** (`src/persistence/`): `saveSchema.ts`:
  - `SAVE_SCHEMA_VERSION` (= `PROFILE_SCHEMA_VERSION` = 1);
  - `migrations` (keyed by FROM version, empty);
  - `normalizeProfile`, `parseProfile(raw, {migrations, targetVersion})`, `parseProfileJson`;
  - `SaveDataError` codes; per-class `classProgress()` validates `xp`/`level`/`lifetimeXp`/`talentsSpent`.

  `saveStore.ts`:
  - keys `skazki.profile` / `.backup` / `.quarantine`;
  - `createSaveStore({storage, now, newProfileId})` → `load`/`save`/`clearForDev`.

  `progressionService.ts`:
  - `createProgressionService(store)` → `getState`, `subscribe`, `commitRun`, `selectClass`, `retrySave`, `replaceProfile`.

  `transfer.ts`: `exportProfile`, `prepareImport` (1 MB).

- **Profile** (`src/profile/`): `profile.ts`:
  - `PlayerProfile` v1, `createProfile`;
  - `classes[cls]: ClassProgress {xp, level, lifetimeXp, talentsSpent}` — `talentsSpent` is the placeholder Task 09 drops.

  `class-xp.ts`: `talentPoints(level)` (even levels + 1 at 30 = 26 max), `MAX_CLASS_LEVEL` 50, `addClassXp`.

  `apply-run.ts`: `applyRunResult` (pure, idempotent).

- **Seeded RNG** (`src/gameplay/rng.ts`): `createRunRandom(seed)` → `combat` / `skills` / `spawn` streams; `DEFAULT_SEED`, `validateSeed`, `lcgStream`. A new stream for talent procs must be a new salted stream so existing sequences stay identical.
- **Run stats** (`src/gameplay/run-stats.ts`): `RunStats` consumes recorded world events. Sources are:
  - `weapon:<id>` (via weapon `impact`);
  - `skill:<id>` / `synergy:<id>` (via `SkillEngine.attackSource`);
  - `status:<effect>`, `debug`.

  Talent secondary attacks need their own source ids (for example `talent:<nodeId>`) to show separately.

- **Combat stats**:
  - `src/character-stats/` `calculateCharacterStats(class, level)`, `COMBAT_ATTRIBUTE_CAPS`;
  - run stats composed once in `src/skills/stats.ts` `composeRunStats(primary, RunStatModifiers)` — caps applied there (the finalization stage for talent stat modifiers);
  - `GameplayWorld` builds the character from `options.characterClass` / `options.level`.
- **Skills**: `src/skills/RunSkills.ts`:
  - 4 automatic + 6 passive slots (snapshot `slots`);
  - offers, rerolls.

  `SkillEngine.ts` (abilities, zones, projectiles, attribution). `synergies.ts`: `SYNERGY_RULES` and unlock pairs, `synergyUnlocked`. `modifiers.ts`: `elementalDamageMultiplier`, `modifyPlayerEffect`.

- **Run start** (UI): `campaignStore.startRun(mapId, class, seed?)` sends `options {characterClass, level, seed, campaign}` — talents will be added to these options at run start.
- **Progression UI**: `src/gameplay-ui/CampaignPages.tsx` `ProgressionPage` holds the «Таланты · Снаряжение — скоро» placeholder (to be removed in 4.1); player text in `src/gameplay-ui/strings-ru.ts`.

Task 09 additions:

- 1.1 `src/talents/`:
  - `catalog.ts` holds the data, generated once from `docs/talents.md`, with verbatim texts plus per-rank status/gaps from `talents-gaps.md`;
  - `types.ts`;
  - `config.ts` provides `loadTalentConfig` (structure validation), `TALENT_CONFIG`, `TALENT_RULES`, and `TALENT_CATALOG_APPROVED = false` (G0);
  - `index.ts`.

  Test `tests/talents/catalog.test.ts` re-parses the Markdown (`?raw`) and fails on any difference. `tsconfig.stats.json` now typechecks `src/talents` and `tests/talents`; `npm run test:talents`.

- 1.2 `src/talents/rules.ts`:
  - `earnedTalentPoints` (= Task 08 `talentPoints`), `spentTalentPoints`, `availableTalentPoints` (never negative);
  - `checkPurchase` (reasons: unknown-node, wrong-class, max-rank, level, prerequisite, no-points) and `purchaseRank`;
  - `validateTalentRanks` (for saves/imports), `superpowerActive`, `talentNodeState`.

  Tests `tests/talents/rules.test.ts`.

- 2.1 save schema v2:
  - `PROFILE_SCHEMA_VERSION = 2`;
  - `ClassProgress.talents` (node → rank) replaces `talentsSpent`;
  - `saveSchema.migrateV1toV2`, `migrations {1: …}`;
  - `classProgress()` validates talents with `validateTalentRanks`.

  Other changes:
  - `ProgressionService.purchaseTalent(class, nodeId)` buys and autosaves;
  - the debug `setClassLevel` keeps talents.

  Tests `tests/persistence/talents.test.ts`.

- 3.1 pipeline:
  - **`src/talents/effects.ts`:** `TalentEffect` descriptors (`stat` kind; more kinds arrive with their catalog effects).
  - **`src/talents/pipeline.ts`:** `talentLoadout(class, level, ranks, config)` validates the tree, keeps only active current-rank effects, and builds the stat layer.
  - **`RunStatModifiers`:** additive `magicalDamagePercent`, `dodgeChance`, `cooldownReduction`.
  - **`SkillHost.talentModifiers`:** the base layer of `SkillEngine.modifiers()` (caps applied once in `composeRunStats`).
  - **`GameplayOptions.talents {ranks, config?}`:** the world composes start stats with talents; snapshot `talents`; `applyStats` passes the composed dodge.
  - **`SkillEngine.talentStrike(nodeId, …)`:** source `talent:<nodeId>`, tags `talent` + `secondary`, `procs: false` (anti-recursion).
  - **Run stats / labels / summaries:** accept `talent:` sources.
  - **`campaignStore.startRun`:** passes the class ranks.

  Tests `tests/talents/pipeline.test.ts`.

- 4.1 talent screen:
  - `src/gameplay-ui/TalentsPanel.tsx` sits in «Прогресс» (replacing the «Таланты — скоро» placeholder; «Снаряжение — скоро» stays) and has a class switcher;
  - `RU.talents` strings;
  - `campaignStore.purchaseTalent` autosaves and warns if the write fails;
  - styles in `alpha.css`.

  Browser check in `tests/campaign-browser.mjs` (screenshot `campaign-12-talents.png`).

- 4.2 debug (`campaign-debug.ts`, DEV panel fieldset «Таланты», aria-label "Talent Debug"):
  - `setClassLevel` grants/removes points via level and keeps the tree, or resets it if it no longer fits;
  - `setTalentRank(class, node, 0–3)` fills prerequisites to II, clears dependents below II, and raises the level only if needed;
  - `resetTalents`;
  - `toggleSuperpowerPreset`.

  Tests `tests/persistence/talents-debug.test.ts`, browser DEV check, production markers.

## Verification log

- Phase 1: typecheck ✓, format ✓, `npm test` 1044 Vitest tests + Node suites ✓ (talents 12).
- Phase 2: typecheck ✓, format ✓, `npm test` 1050 ✓, `npm run build` ✓, `test:production` 2 PASS,
  `test:e2e` 3 PASS.
- Phase 3: typecheck ✓, format ✓, `npm test` 1058 ✓ (unchanged behaviour: all talents inert),
  `npm run build` ✓, `test:production` 2 PASS, `test:e2e` 3 PASS.
- Phase 4: typecheck ✓, format ✓, `npm test` 1062 ✓, `npm run build` ✓, `test:production` 2 PASS
  (talent debug markers absent), QA build + `test:qa` PASS, `test:e2e` 3 PASS.

- 09.1 Phase 3: typecheck ✓, format ✓, `npm test` 1090 ✓, `npm run build` ✓, `test:production`
  static check only (run without `CHROMIUM_PATH`, so its browser half did not start — corrected in
  Phase 5), `test:e2e` 3 PASS. The campaign browser test still asserted the pre-G0 banner «Каталог
  талантов ещё не утверждён»; it now asserts the current one («Часть рангов пока не действует в бою»).

- 09.1 Phase 4: typecheck ✓, format ✓, `npm test` 1104 ✓ (one run hit the pre-existing ~4 s
  boss-world test's 5 s timeout under load; it passes alone and on rerun, unchanged duration),
  `npm run build` ✓, `test:production` static check only (same omission as Phase 3), `test:e2e` 3 PASS.

- 09.1 Phase 5: typecheck ✓, format ✓, `npm test` 1111 ✓, `npm run build` ✓, `test:production`
  2 PASS (static artifact + production browser check, with `CHROMIUM_PATH`), `test:e2e` 3 PASS.

- 09.1 Phase 6: typecheck ✓, format ✓, `npm test` 1125 ✓, `npm run build` ✓, `test:production`
  2 PASS, `test:e2e` 3 PASS.

## Decisions / deviations

- `docs/talents.md`: pandoc conversion of `Skazki_Task08_Full_Talent_Catalog_Draft.docx`.
  - The text is verified unchanged: all 303 paragraphs, in order, with nothing added.
  - The document title («Каталог талантов · Task 08», a Title-style paragraph that pandoc moves into metadata) is kept as the top heading, so the other headings are shifted one level down.
  - Prettier formatting only.
- An earlier upload, `Lumen_Fintech_Share_Issuance_Templates.docx`, was not a talent catalog and was not used.

- 1.1: the config is a TypeScript data file (spec 1.1: «data config»), not a runtime Markdown
  parser; «loader from the catalog» = generated once from `docs/talents.md` + a test that
  re-parses the Markdown and requires identical ids/names/branches/rank texts. Effect descriptors
  are added per rank only when it is `ready` and the catalog is approved (Phases 3/5). Inert
  ranks (`missing`/`unclear`, and every rank while G0 is open) are still purchasable — the tree
  rules are fully defined — but have no effect (`active: false`).

- 1.2: one rank costs one point (spec: «available = earned − spent ranks»). Purchase check order:
  class/id → max rank → level gate → prerequisite → points (first failing reason is shown).

- 2.1: required by the schema bump, these existing Task 08 tests were updated to the v2 equivalent
  without weakening them:
  - «v1 is current» → «v2 is current, migration 1→2»;
  - the `talentsSpent` default → the `talents` default `{}`;
  - «newer version» now uses v3 instead of v2;
  - the migration-seam test starts from an explicit v1 label;
  - `class-xp` expectations use `talents: {}`.

  Other decisions:
  - A v2 save is unreadable by Task 08/08.5 builds (`newer-version` → quarantine; the documented behaviour).
  - A refused purchase writes nothing.
  - A failed write keeps the purchase in memory as «unsaved» (same as run results).

- 3.1: catalog ranks are totals, so a node contributes only its current rank's effects.
  - **Inertness:** with G0 open no effects are active in the shipped config. The pipeline is tested with a test-only approved fixture whose stat descriptors use catalog values of `ready` ranks, plus one absurd value to prove the cap. The loader refuses effects on `missing`/`unclear` ranks.
  - **Start stats:** the player entity is created with composed stats, so the run starts at full talent HP. With no active talents the stats are identical to before.
  - **Dodge:** `applyStats` now passes the composed `dodgeChance`, which equals the Core value without talents.

- 4.1: the catalog has no separate node descriptions, so the screen shows the node name and the
  verbatim rank texts.
  - **Unapproved catalog:** a banner says the catalog is not approved and that learned ranks are stored but don't affect combat yet (G0).
  - **Gap marking:** ranks with gaps are marked «Параметр не определён» / «Правило ждёт уточнения» with the gap ids.
  - **Buttons:** only valid purchases are enabled; a locked node shows its reason.

- 4.2: the superpower preset = class level ≥ 30 plus rank I of the branch-3 first node (the
  activation rule). The catalog defines no preset; nothing else is assumed. All debug edits go
  through the validated `replaceProfile`.

## Blockers / known issues

- **Content gate (0.3):** the catalog is not approved (G0); 28 ranks miss parameters and 26 need
  a rule decision — see `docs/talents-gaps.md`. Phases 5–6 cannot start until answered.

- Cloudflare Preview cannot be opened by the agent (`*.workers.dev`).
