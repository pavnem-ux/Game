# Task 30 — progress

Spec: [task-30-item-icons.md](task-30-item-icons.md). Branch `task-30-items-pets-art`.

PR: https://github.com/pavnem-ux/Game/pull/28

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Pipeline: files, manifests, provenance, kinds `item-icon` / `pet`, registry, tests
- [x] 2 Item icons: shop, equipment slots / owned rows, details, forge, compare tooltip, quest rewards
- [x] 3 Pets: in-run follower sprite; pet cards / portraits (selection, shop, forge, quest rewards)
- [x] 4 Delivery: final checks, README line, PR

## Decisions / blockers

- Art budget raised from 2 MiB to 3 MiB (owner decision, Task 30): packs 5 + 6 bring the set to ≈ 2.37 MB.
- CI: the intermittent alpha e2e dash failure (since Task 25) came from the test itself — its no-op hotkey check presses `s` (move down), which could leave the facing pointing down; the test now faces right before the dash. Artifact uploads fail on the account storage quota (owner action, see PR comment).
