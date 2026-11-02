# Task 09 — progress

Spec: [task-09-talents.md](task-09-talents.md) (owner's text, Prettier-formatted). Content:
[talents.md](talents.md) (catalog `.docx` converted to Markdown). Gaps:
[talents-gaps.md](talents-gaps.md). Code map: reuse [task-08-progress.md](task-08-progress.md)
and [task-08.5-progress.md](task-08.5-progress.md) (additions below).

Current: Phase 1, step 1.2 (content gate: gaps found — build Phases 1–4, then stop and report)

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
- [ ] 1.2 Purchase/validation, points derivation, prerequisites, level-30 gate
- [ ] Tests (4 × 3 × 14 × 3, prereq rank II, rank III optional, ≤ III, points ≥ 0, gate,
      superpower inactive before b3.n01 rank I, independent trees)

### Phase 2 — Persistence

- [ ] 2.1 Schema bump, migration (`talents`, drop `talentsSpent`), validation
- [ ] Tests (reload, class switch, export/import, migration, invalid data rejected)

### Phase 3 — Modifier pipeline

- [ ] 3.1 Talent effects → existing hooks; apply once; source ids; anti-recursion
- [ ] Tests (applied once, caps, no synergy unlock, run reset keeps talents)

### Phase 4 — UI & debug

- [ ] 4.1 Talent screen
- [ ] 4.2 Debug controls

### Phase 5 — Standard branches

- [ ] 5.1 Rogue · [ ] 5.2 Mage · [ ] 5.3 Warrior · [ ] 5.4 Archer

### Phase 6 — Superpowers

- [ ] 6.1 Rogue · [ ] 6.2 Mage · [ ] 6.3 Warrior · [ ] 6.4 Archer

### Phase 7 — Delivery

- [ ] 7.1 Full regression + production build
- [ ] 7.2 Talent checks in `docs/playtest.md`
- [ ] 7.3 PR description; ready only if no gaps remain (don't merge)

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

## Blockers / known issues

- **Content gate (0.3):** the catalog is not approved (G0); 28 ranks miss parameters and 26 need
  a rule decision — see `docs/talents-gaps.md`. Phases 5–6 cannot start until answered.

- Cloudflare Preview cannot be opened by the agent (`*.workers.dev`).
