# Task 06.1 — Experience, run levels and continuous waves

The playable alpha now has collectible XP drops and continuous mixed enemy reinforcements. These are provisional combat-testing rules. Task 07 skills, skill selection, permanent progression and new combat-stat growth are not implemented.

## Play and inspect

Start with `npm ci` and `npm run dev`, or use the production Cloudflare Workers deployment. All four classes retain their Character Stats and main weapons. Defeat enemies, approach the green diamond crystals, and watch the HUD's run level, current XP and next-level progress. New groups arrive continuously from beyond the camera.

The HUD explicitly distinguishes **run level** (`забег`) from **permanent level** (`Пост. ур.`). Collecting XP never calls calculateCharacterStats again, changes permanent level, raises HP/damage or pauses for a skill choice. A new run starts at run level 1 and 0 XP independently of the selected permanent level 1–50.

In development only, open `/?debug` and **DEV · Тестирование**. The new **XP и волны** section supports granting test XP, dropping a crystal 90 units to the right, enabling/disabling continuous spawns, and changing the initial interval, batch count and active cap. It displays collected XP, crystal count, wave count and the next deadline. Existing class/HP/status/enemy/protection controls remain available. A controlled restart repeats the selected class/permanent level, wave settings and on-hit setup. Explicit manual DEV spawn distances can place enemies on screen for testing; normal reinforcements always use off-screen placement.

## Provisional XP rules

`src/gameplay/experience.ts` owns `RunExperience`, `XP_RULES`, `runXpCost`, immutable `RunProgression` and `XpCrystal` snapshots. It does not import the prototype's progression or combat-stat calculations.

| Parameter                               | Value                                                               |
| --------------------------------------- | ------------------------------------------------------------------- |
| Starting run level / XP                 | 1 / 0                                                               |
| Cost from run level L to L+1            | `20 + 10 * (L - 1)`                                                 |
| First three costs                       | 20, 30, 40 XP                                                       |
| Melee / ranged death drop               | 10 / 15 XP                                                          |
| Collection distance from crystal center | player radius + 42 + crystal radius 5 (60 at current player radius) |
| Spatial crystal pile cell               | 64 × 64 world units                                                 |
| Maximum active crystal piles            | 512                                                                 |

Example: collect 25 XP → run level 2, 5/30 XP. Overflow can cross multiple levels; the remaining XP carries forward. XP, levels and values are safe non-negative integers. State/events/crystals are immutable.

A death creates a crystal pile at the enemy's final position; XP enters progression only on collection. Crystals have no lifetime, attraction timer or despawn. Drops in the same cell merge into the existing pile at its existing position. At 512 piles, another drop adds its full value to the nearest existing pile instead of losing XP or allocating another object. Thus every earned XP unit remains collectible until collection, with bounded render/pickup work. Pile consolidation can move a new drop's effective collection location to a nearby existing pile; no existing pile is removed or moved by consolidation.

Collection uses the existing 60 Hz discrete player movement samples. It also runs while standing still on those samples, and never while the player is dead or the world is paused. No wall-clock timers are used.

## Reward attribution and deduplication

GameplayWorld processes the actual Combat Core death immediately, before unregistering the enemy from AI/target geometry. It captures the final position and enemy type there. Each active enemy ID is removed once, so replayed cleanup, further damage to a corpse and repeated clear operations cannot duplicate a reward.

Provisional attribution policy:

- Direct death: credit the player when the Core source is the player.
- Periodic death: credit the player when at least one source with **positive raw contribution** in the lethal group belongs to the player. This permits shared lethal groups; a zero-raw player stack alone does not claim a kill.
- Enemy-only/self deaths with no positive player contribution receive no player kill or XP drop. They still perform normal combat cleanup.
- The Core representative source field is preserved; it is not substituted for the full periodic source list.

A single `enemy-rewarded` world event records enemy ID, representative source, positive contributors, direct/periodic cause, optional effect ID, XP value, crystal ID and death position. The kill count increments once at death, while total/current XP changes later at collection. `xp-collected` and `run-level-up` events represent collection/progression; one bulk gain may report one level-up event covering multiple levels.

The existing DEV clear-enemies action uses actual player-attributed Core deaths, so it produces test kills and crystals as well. It is not available in production. Test XP grants are separately marked `test-xp-granted`. No currency, loot, persistent reward or skill points are introduced.

## Provisional wave settings

`src/gameplay/spawning.ts` contains pure configuration/placement/pressure helpers, with `SpawnSettings` exposed through GameplayOptions and snapshots. The existing GameplayWorld remains the only scheduler; there is no separate spawn update loop or clock.

| Parameter                                       | Default                                                    |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Continuous spawning                             | enabled                                                    |
| Initial pack                                    | 12, clipped to active cap; off-screen during normal starts |
| First reinforcement deadline / initial interval | 4 simulated seconds                                        |
| Initial batch                                   | 3                                                          |
| Pressure period                                 | 30 simulated seconds                                       |
| Batch growth                                    | +1 per pressure stage, maximum 8                           |
| Interval reduction                              | 0.35 seconds per stage, minimum 1.5 seconds                |
| Maximum active enemies                          | 120, shared with manual DEV spawns                         |
| Composition                                     | every third automatic spawn is ranged; others melee        |
| Extra camera margin                             | 64 world units + enemy radius                              |
| Spawn band beyond that margin                   | 180 world units                                            |

At time T, stage is `floor(T / pressurePeriod)`, batch is `min(maximumCount, count + stage)`, and interval is `max(minimumInterval, interval - intervalReduction * stage)`. Each processed deadline schedules the next interval from that deadline using the current stage. Spawn attempts at a full cap are consumed without creating actors or queuing a later burst. This is reinforcement pressure, not a boss/wave-completion system; enemy HP/damage/movement/weapon balance is unchanged.

The configurable minimum interval is at least 0.25 s, initial interval at most 60 s, batch 1–24, and active cap 1–120. Invalid configuration is rejected before changing settings. Lowering the cap below the current population is rejected; clear enemies first or start a new test configuration. Explicit DEV setting/toggle changes schedule a new interval from current simulation time, avoiding backfill. Ordinary pause and revival do not invoke this rescheduling API.

## Camera-aware placement

AlphaScene passes actual Canvas viewport dimensions when creating the world and before each simulation update. GameplayWorld derives the camera rectangle from the current player position, viewport size and clamped arena bounds. Defaults for standalone worlds are 1280 × 720; tests can supply a viewport explicitly.

Placement selects an area-weighted point from clipped off-screen rectangles around that camera. The entire enemy hitbox is outside the visible area plus the configured margin, and its center respects the enemy radius at all arena boundaries. This handles corners without an unbounded rejection loop. If the viewport/margin covers every valid location, the spawn attempt is skipped and its next deadline still advances; there is no on-screen fallback.

Spawning has a separate deterministic seeded RNG stream, so placement does not consume Combat Core crit/Dodge RNG draws. The stream advances through both normal and explicit manual placement actions. Reproducibility requires the same seed, viewport/input/configuration changes and action ordering. Rendering frame-rate alone does not determine rewards or wave deadlines.

## Timeline, death and revival

The previous shared boundary priorities are preserved. Movement/pickup samples occur first on their 60 Hz timestamps; existing flights, status ticks, steering, attacks and expirations retain their ordering. Reinforcement spawning is last at an equal timestamp. Therefore an actual player death at T cancels a not-yet-processed spawn at T. Valid simultaneous enemy deaths still produce crystals, but a dead player does not collect them.

A pending deadline at a death timestamp remains pending; after explicit revival it can execute at the same timestamp before time advances. Later deadlines, wave count, existing enemies, crystals, XP and run level are preserved. Manual pause, awaiting revival and ended runs stop all collection/spawning clocks. Frame time remaining after death is not accumulated. Full post-revival protection follows Player Survival's existing three-second rules.

The integration now rechecks all module peeks against the actual selected horizon before advancing any clock. This handles a numerical root that shifts a few ULPs when the peek horizon is shortened, without resolving future damage or weakening boundary guards. Long continuous-play tests also exposed inconsistent start-overlap tolerance in the shared swept geometry helper. That helper now compares distances to its existing `1e-9` distance tolerance consistently with contact eligibility, instead of comparing squared distance to a linear tolerance. A zero-length and a long sweep agree at the same contact boundary. This is a narrow numerical fix in Weapon Attacks' pure geometry; Combat Core, EnemyAI, StatusEffects, PlayerSurvival and their formulas/interfaces were not rewritten or modified.

## Public additions

- GameplayOptions: `spawning?: Partial<SpawnSettings>`, `viewport?: ViewportSize`.
- GameplaySnapshot: `progression`, `crystals`, and `spawning` (settings, nextSpawnAt, waves, viewport).
- GameplayWorld: `setViewport(width,height)`, `setSpawning(settings)`, validated `grantTestXp(amount)` and `dropTestCrystal(value,distance?)`.
- New world channels: `progression`, `spawning`; events include `enemy-rewarded`, `xp-collected`, `run-level-up`, `test-xp-granted` and `wave-spawned`.
- The DEV controller accepts `grant-xp`, `xp-crystal`, `spawning` actions; production removes the controller/UI as before.

`initialEnemies: false` now only disables the initial pack. To isolate a standalone combat fixture with no later reinforcements, also set `spawning: { enabled: false }`. Existing combat tests were updated to state that isolation explicitly; their original assertions and the legacy prototype XP/spawn implementation remain covered.

## Verification and limitations

Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e` (dev server on 5173), and `npm run test:production`. The new integration file adds 30 deterministic tests for XP boundaries/invalid input, distance collection/one-time rewards, direct and periodic attribution, persistence/merging/cap, off-screen edges/corners, pressure, continuous spawning, pause/revival, exact death/spawn ties, caps, large-vs-small deltas, five simulated minutes and DEV validation. Existing unit tests remain in place.

Browser regression collects real enemy-death crystals by moving, verifies run level and unchanged permanent stats, exercises interactive DEV XP and off-screen reinforcement deadlines/caps, and retains all four class weapons, death/revival, pause, mobile and legacy prototype checks. Screenshots include `artifacts/alpha-10-xp.png` and `alpha-11-waves.png`. Production regression checks the XP HUD, static artifact/routing and exclusion of debug globals/controller/UI.

Active actors are capped at 120, crystal piles at 512, history at 160 and render FX at 64. Existing AI separation still uses its spatial grid. Pickup scans at most 512 piles per movement sample; boundary processing still scans active actors/flights. Core keeps historical unique entity IDs for projectile/DoT attribution for the life of a run; very long sessions can grow that inherited registry even though active actors/reward history are bounded. No global Core reclamation was added.

There are no skill choices, stat gains from run levels, permanent XP saves, bosses, victory condition or final balance. XP restarts with each new run and is preserved only within the current run/revival. Enemy pressure eventually reaches its configured ceiling. If the whole arena is visible, new off-screen enemies are skipped by design.

## Results for this change

- `npm test`: **606 Vitest tests** (576 previous + 30 new) and **6 Node tests** passed with no skips.
- Type checks and `npm run build` passed with the existing Phaser chunk-size advisory. The static artifact remains three files, approximately 1.54 MB of JavaScript plus CSS/HTML, below the Cloudflare static-asset per-file limit.
- `npm run test:e2e`: legacy prototype and alpha scenarios passed, including actual crystal pickup/run-level progress, interactive XP control, off-screen waves/caps, four weapons, pause/revival and touchscreen joystick, with no uncaught browser errors.
- `npm run test:production`: static artifact, nested SPA path, XP HUD/gameplay and production DEV-exclusion checks passed.
- The bounded five-minute simulation passed. The short headless 120-enemy browser check recorded 74 animation frames in 1.2135 s (about 61 FPS); this is not a mobile-device or long-duration performance profile.

## Cloudflare deployment

The build contract is unchanged: Node.js 24.19.0, production branch `main`, build command `npm run build`, output `dist`, repository root. No server/API/secret is needed. Developer Testing Mode remains excluded from all production and Preview builds. The deployment target is Cloudflare Workers Builds (static-assets Worker `game`); see [deployment instructions](DEPLOY_CLOUDFLARE_WORKERS.md).

A successful local production build and static/browser regression establish that the new version can be built with the configured command. They do not establish a successful remote Cloudflare deployment; actual deployment status and the live URL require Cloudflare dashboard access or a provided URL. No live Cloudflare URL was verified in this task. Task 07 has not begun.
