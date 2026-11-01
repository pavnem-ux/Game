## Summary

<!-- What this PR does and which approved task/specification it implements (e.g. Task 07). -->

## Scope and gameplay impact

- [ ] No gameplay mechanics, balance values or existing behaviour changed
- [ ] Gameplay/balance changes are required by the approved specification and listed below

<!-- List every changed mechanic or provisional number, old → new. -->

## Invariants (AGENTS.md §4)

- [ ] Combat Core remains the only owner of HP/damage/death
- [ ] GameplayWorld remains the sole scheduler; tie order unchanged (or change approved)
- [ ] Simulation stays deterministic (seeded RNG only, no wall-clock time)
- [ ] DEV-only code stays behind `import.meta.env.DEV`

## Tests and verification

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run format:check`
- [ ] `npm run build`
- [ ] `npm run test:production` (if build/routing/DEV gating touched)
- [ ] `npm run test:e2e` (if UI/input/scene/world integration touched)
- [ ] Cloudflare Preview checked (playable changes): <!-- preview URL -->

<!-- New/changed tests and anything NOT verified. -->

## Documentation

- [ ] `docs/` and `README.md` updated; provisional values labelled

## Review

- [ ] Codex review requested (`@codex review`) and findings addressed
