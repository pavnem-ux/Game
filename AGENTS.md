# AGENTS.md — shared rules for «Последний свет» (Fantasy Survivors)

This file is the single source of project rules for every AI agent and human contributor.
`CLAUDE.md` imports it; Codex reads it directly. If a rule here conflicts with an older document,
this file wins until the project owner decides otherwise.

## 1. Project and roles

Browser-based 2D top-down action roguelite. TypeScript (strict), React 19 for screens/HUD,
Phaser 3 for rendering/input, Vite for builds, Vitest + Playwright (`playwright-core`) for tests.
Hosted as a static-assets Cloudflare Worker `game`, built and deployed by Cloudflare Workers Builds
(not Pages); configuration in `wrangler.jsonc`, details in `docs/DEPLOY_CLOUDFLARE_WORKERS.md`. No backend, accounts, external APIs or CDN assets.

| Role                      | Responsibility                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Project owner (human)     | Approves gameplay decisions, specifications, balance and every merge into `main`. Only the owner merges.                        |
| Claude Code (primary dev) | Implements approved tasks on feature branches, writes/runs tests and docs, opens PRs, addresses review findings.                |
| OpenAI Codex (reviewer)   | Independent code review of every PR, following [Review guidelines](#9-review-guidelines). Does not push to the author's branch. |

Work is organised in numbered tasks (Task 01 … Task 07 are done or in review). **A task starts only when the
owner explicitly requests it.** Never start the next task (e.g. Task 07) on your own initiative,
and never bundle unrequested features into a PR.

## 2. Commands

Node.js **24** (`.node-version` pins `24.19.0`), npm, committed `package-lock.json`.

```bash
npm ci                  # install exactly from the lockfile
npm run dev             # Vite dev server on :5173 (/?debug enables Developer Testing Mode)
npm run typecheck       # strict tsc for the app and the Character Stats project
npm test                # prototype Node tests + all Vitest suites
npm run format:check    # Prettier check (config: .prettierrc.json)
npm run build           # typecheck + production build into dist/
npm run test:production # builds must exist; serves dist/ on :4179 and checks prod behaviour
npm run test:e2e        # needs a running dev server; Chromium via CHROMIUM_PATH
```

Per-module suites: `test:stats`, `test:combat`, `test:weapons`, `test:status`, `test:enemies`,
`test:survival`, `test:alpha`. Browser tests read `CHROMIUM_PATH` (default `/usr/bin/chromium`)
and `GAME_URL` (default `http://127.0.0.1:5173`). Screenshots go to the ignored `artifacts/`.

## 3. Architecture and ownership

Each gameplay module is framework-independent (no Phaser/React imports) and owns one concern.
Detailed contracts live in `docs/`; read the relevant document before changing a module.

| Module                                                            | Owns                                                                                      | Doc                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/character-stats/`                                            | Permanent class attributes, levels 1–50, pure formulas                                    | `docs/CHARACTER_STATS.md`                                   |
| `src/combat-core/`                                                | **The only owner** of HP, Max HP, Resistance, damage resolution, crit/Dodge, death events | `docs/COMBAT_CORE.md`                                       |
| `src/weapon-attacks/`                                             | Targeting, attack cycles, melee sectors, player projectiles, swept collision              | `docs/WEAPON_ATTACKS.md`                                    |
| `src/status-effects/`                                             | Poison/Burn/Bleed groups, stacks, ticks, expirations, weapon-impact adapter               | `docs/STATUS_EFFECTS.md`                                    |
| `src/enemy-ai/`                                                   | Enemy movement, separation grid, contact/ranged attacks, enemy projectiles                | `docs/ENEMY_AI.md`                                          |
| `src/player-survival/`                                            | Hit protection, death/decision lifecycle, one manual revival, survival policies           | `docs/PLAYER_SURVIVAL.md`                                   |
| `src/gameplay/`                                                   | `GameplayWorld`: the **sole scheduler** of the alpha; run XP, waves, provisional config   | `docs/PLAYABLE_COMBAT_ALPHA.md`, `docs/EXPERIENCE_WAVES.md` |
| `src/skills/`                                                     | In-run skills: catalogue, level-up offers, auto abilities, passives, Slow/Stun, synergies | `docs/IN_RUN_SKILLS.md`                                     |
| `src/gameplay-ui/`, `src/engine/AlphaScene.ts`                    | React screens/HUD/DEV panel; Phaser rendering and input only                              | `docs/PLAYABLE_COMBAT_ALPHA.md`                             |
| `src/config`, `core`, `engine` (other files), `ui`, `progression` | Preserved first prototype at `/?prototype`                                                | `docs/ARCHITECTURE.md`                                      |

## 4. Gameplay invariants (must not be broken)

1. **Single source of truth.** HP, damage, crit/Dodge, Resistance and death are resolved only by
   Combat Core. No other module, scene or UI keeps its own HP, damage or cooldown copy.
2. **One scheduler.** `GameplayWorld` drives everything through `peekBoundary` →
   `advanceToBoundary` → `resolveBoundary`. Never call module `update(dt)` methods sequentially
   inside the world, and never let external code advance a module behind the world's back.
3. **Boundaries before damage.** All clocks/positions advance to the globally earliest time T
   _before_ any damage at T; then exactly one event resolves and its results are delivered
   immediately. Next boundaries are recomputed from the changed state — no queued stale commands.
4. **Stable tie order** at equal timestamps (see `docs/PLAYABLE_COMBAT_ALPHA.md`,
   `docs/IN_RUN_SKILLS.md`): input sample → enemy projectiles → player projectiles → status ticks →
   AI steering → player strikes → skill actions → enemy attacks → status expirations → skill
   expirations → reinforcement spawning. Do not reorder without owner approval.
5. **Determinism.** Simulation uses only seeded RNG streams (Combat Core RNG and the separate spawn
   RNG). No `Math.random()`, `Date.now()`, `performance.now()` or timers inside simulation code.
   Same seed + same inputs/actions ⇒ same results. Frame rate must not change rewards or deadlines.
6. **Death and revival.** Player death freezes all clocks at T; only events already due at T
   finish. Revival continues the _same_ world (same Core, run ID, projectiles, timers), restores
   50% of current Max HP, cleanses the player's negative effects and grants 3 s of full protection.
   A second death ends the run. Ordinary healing never revives.
7. **Rewards are deduplicated.** Each enemy death is rewarded at most once; XP enters progression
   only on crystal collection; no XP is lost at the crystal cap.
8. **Run vs permanent progression.** Run level/XP never changes permanent level. Run skills combine
   with Character Stats only through `composeRunStats` (central caps applied once); the permanent
   snapshot is never modified. The prototype's XP/upgrades are never mixed into the alpha.
   Synergy/secondary hits never trigger synergies (no proc chains).
9. **Immutable outputs.** Snapshots and events returned by modules are frozen/immutable; React
   receives throttled snapshots (~10 Hz), never per-enemy components or per-frame state.
10. **Production / QA isolation (owner-approved Task 07.1).** Normal `npm run build` always
    excludes testing controllers and debug globals, even with `?debug`. Alpha QA tools may exist
    only under `import.meta.env.DEV || __QA_BUILD__`; the latter is set exclusively by the explicit
    non-main QA build policy in `config/qa-build.mjs`. Legacy debug remains DEV-only. QA artifacts
    go to `dist-qa/`, served only with the separate Preview configuration; production still uses
    `wrangler.jsonc` and `dist/`. Never enable QA for `main` or rely on a URL query as the boundary.
    `npm run test:production`, `test:build-policy` and `test:qa` enforce the separation.
11. **Bounded work.** Respect existing caps (alpha: 120 enemies, 512 crystal piles; prototype pools)
    and allocation-free hot loops in Phaser `update`.
12. **Original content.** Procedural art or art created/commissioned by the project owner, listed in
    `docs/ART_PROVENANCE.md`. No assets from other games, no CDN assets.

All numbers in `src/gameplay/config.ts`, `experience.ts` and `spawning.ts` are **provisional** but
still owner-controlled: do not change balance, mechanics or existing behaviour unless the approved
task explicitly requires it, and call out every such change in the PR description.

## 5. Coding conventions

- Strict TypeScript; no `any` without a justified comment; keep `verbatimModuleSyntax`-compatible
  `import type`. Prettier formatting (`npm run format:check` must pass).
- Extend modules with **additive, backward-compatible APIs** (as Tasks 03–06 did). Preserve old
  signatures and standalone behaviour; do not duplicate resolver logic in a second place.
- Validate public inputs and reject invalid configuration before mutating state (see `validation.ts`
  files). Prefer pure functions for formulas.
- No new runtime dependencies, dependency upgrades or lockfile churn without owner approval.
- UI text is English (owner decision, Task 23): player-facing strings live in the locale file
  `src/gameplay-ui/strings-en.ts` or the English content catalogs and use the names in
  `docs/glossary-en.md`; `src/` contains no Cyrillic (enforced by `tests/engine/no-cyrillic.test.ts`).
  Design docs in `docs/` may stay Russian. Code, identifiers and commit messages are English.
- Never commit secrets, tokens, `.env*`, `dist/`, `node_modules/` or `artifacts/`.

## 6. Tests and verification

- Every behaviour change ships with Vitest tests next to the existing suite in `tests/<module>/`.
  Bug fixes include a regression test that fails before the fix.
- Before pushing, run at least: `npm run typecheck`, `npm test`, `npm run format:check`,
  `npm run build`. Run `npm run test:production` for anything touching build, routing, DEV gating
  or `src/main.tsx`; run `npm run test:e2e` for UI, input, scene or GameplayWorld integration changes.
- Never skip, disable, weaken or delete a test to get green. Report test results truthfully in the PR.
- A green CI is necessary but not sufficient: playable features also need a Cloudflare Preview check
  (see `docs/DEVELOPMENT_WORKFLOW.md`).

## 7. Documentation

- Each task gets `docs/<FEATURE>.md` (API, rules, provisional values, limits, verification) and a
  short section in `README.md`. Update existing module docs when a contract changes.
- Mark provisional numbers as provisional. State what was _not_ verified.

## 8. Git, branches and Pull Requests

Full process: [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).

- `main` is always deployable; it is the Workers Builds production branch (every push to `main`
  deploys production). `wrangler.jsonc` controls production: change it only with owner approval.
- **Mandatory, procedurally enforced.** GitHub rulesets/branch protection are not available for this
  private personal repository on the current plan, so nothing technically blocks a direct push.
  These rules are mandatory for every agent and contributor regardless:
  1. Never commit or push directly to `main`; never force-push `main`.
  2. Every change goes on a separate feature/fix branch and through a Pull Request against `main`.
  3. Wait for all CI checks to pass.
  4. Wait for the independent Codex code review and resolve or answer its findings.
  5. Never merge without the owner's explicit approval; only the owner merges.
- One branch per task/change, created from the latest `main`: `feature/task-NN-<slug>`,
  `fix/<slug>`, `chore/<slug>`, `docs/<slug>` (agent-session branches such as `claude/<slug>` are
  acceptable when the session assigns one; after its PR is merged, restart it from `main`). Never
  force-push a branch someone else owns.
- Commit titles: `Task NN: <imperative summary>` for task work, otherwise `<area>: <summary>`.
- Open a PR against `main` using `.github/pull_request_template.md`. CI must be green, Codex review
  findings must be resolved or answered, and the owner must approve gameplay before merging.
- Agents never merge, approve their own PRs, or change repository settings.

## 9. Review guidelines

Codex (and any reviewer) should check, in priority order:

1. **Invariant violations** from section 4: HP/damage outside Combat Core, a second scheduler,
   damage before boundary advancement, tie-order changes, non-seeded randomness or wall-clock time
   in simulation, reward duplication/loss, revival creating a new world, DEV code reachable in
   production.
2. **Unapproved gameplay/balance changes**: any diff to mechanics or provisional numbers not
   required by the task specification.
3. **Correctness**: edge cases at equal timestamps, pause/death/revival, caps, invalid input,
   large `delta` vs many small updates, dispose/lifecycle leaks in Phaser/React.
4. **Tests**: new behaviour covered; no weakened or skipped tests; deterministic tests (fixed seeds).
5. **Compatibility**: existing public APIs and standalone module behaviour preserved.
6. **Performance**: allocations in hot loops, unbounded growth, O(n²) where a grid exists.
7. **Docs**: docs/README updated, provisional values labelled.

Classify findings as **P0** (breaks invariant/data/production), **P1** (bug or missing test for
required behaviour), **P2** (maintainability/performance), **nit**. Style-only issues that Prettier
handles are not findings.
