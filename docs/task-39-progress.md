# Task 39 — progress

Spec: [task-39-difficulty-tiers.md](task-39-difficulty-tiers.md). Branch `task-39-difficulty-tiers`.

PR: https://github.com/pavnem-ux/Game/pull/39

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Elites ×10 health
- [x] 2 Tier config + world (Hard / Nightmare multipliers, Elite Trial schedule)
- [x] 3 Profile: per-map tier unlocks, rewards, save migration
- [x] 4 UI: tier choice on the map card, tier in pause / results / recent runs
- [x] 5 Delivery: docs, final checks, PR

## Decisions / blockers

- Spec written from the owner's chat request and answers (2026-11-25).
- Elite ×10 = `CAMPAIGN_BALANCE.elite.hpMultiplier` 10 (applies through the map's enemy stats, so
  every tier scales it too); «Strong elites» keeps ×1.25 / ×1.15 on top.
- Tiers are map variants: `getCampaignMap(id, tier)` (cached, frozen) with `tier`, `eliteTimes`,
  `waves`, `bossScale`, `rewardScale`; Hard / Nightmare scale `difficulty.hp` / `damage`, so normal
  enemies, elites and the boss all follow. The schedule reads `map.eliteTimes`; the Trial skips the
  600 s boss minimum (validated per tier against the reserved slots).
- Trial reading of the owner's answer: elites ×3 health and damage on top of the map's Normal elites
  (so ×30 the normal enemy health), boss ×3 health and damage; 5 per wave, profiles alternate.
- Rewards: victory Gold = (coins + bonus) × scale, map Ore × scale (rounded); activity Ore, class XP
  and defeat rewards unchanged. The first-victory ×3 Ore only ever applies on Normal.
- Save v9: `mapTiers` (hardest above Normal; Normal = `completedMaps`), recent runs `difficulty` /
  `unlockedTier`. Tests updated only for the version number / new field and elites ×10; e2e
  `campaign-browser` and `activities-browser` pass locally with v9.
