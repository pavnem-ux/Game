# Deploy the game with Cloudflare Workers Builds

The game is published as a **static-assets Cloudflare Worker** named `game`, built and deployed by
**Cloudflare Workers Builds** from the private GitHub repository `pavnem-ux/Game`. There is no
Worker script, backend, API or secret: the Worker serves only the Vite output in `dist/`.

This is the confirmed production target (verified by the project owner in the Cloudflare dashboard
on 01.11.2026). An earlier version of this document described a Cloudflare Pages setup that was
never used; Pages is not part of the deployment.

## Project settings (Workers & Pages → `game` → Settings → Builds)

| Setting                         | Value                                        |
| ------------------------------- | -------------------------------------------- |
| Git repository                  | `pavnem-ux/Game` (Cloudflare GitHub App)     |
| Production branch               | `main`                                       |
| Build command                   | `npm run build`                              |
| Deploy command (production)     | `npx wrangler deploy`                        |
| Builds for preview branches     | enabled                                      |
| Preview command (Previews Base) | `npx wrangler preview` (Cloudflare Previews) |
| Root directory                  | empty / `/` (repository root)                |
| Automatic builds                | enabled                                      |
| Node.js                         | `24.19.0` from `.node-version`               |
| Build variables and secrets     | none                                         |

Every push to `main` builds and deploys production. Every push to another branch with an open PR
builds a Preview; the Cloudflare bot comments the Preview URL on the PR and reports the check
`Workers Builds: game`. Production lives on `game.<account-subdomain>.workers.dev`; Previews on
`<branch>-game.<account-subdomain>.workers.dev`.

## `wrangler.jsonc`

[`wrangler.jsonc`](../wrangler.jsonc) in the repository root is the Worker configuration read by
both `wrangler deploy` and `wrangler preview`:

- `name: "game"` — the existing Worker; changing it would deploy a different Worker.
- `assets.directory: "./dist"` — upload only the output of `npm run build`.
- `assets.not_found_handling: "single-page-application"` — unknown non-asset paths serve
  `index.html`, so deep links open the game instead of a 404.
- `observability.enabled: true` — Workers Logs.
- `previews: {}` — required by `wrangler preview`; without it Preview builds fail with
  "Your Wrangler configuration is missing a `previews` block".

**Why the file is needed and how it preserves production.** Before this file existed, production
`wrangler deploy` ran Wrangler's automatic project configuration on each build: it detected Vite,
output `dist`, and generated a temporary configuration with SPA `not_found_handling` and
observability enabled (Workers Builds supplies the Worker name `game`). That automatic path does
not satisfy `wrangler preview`, so Preview builds failed. The committed file reproduces the same
settings explicitly. Differences after merge:

- Wrangler no longer re-configures the project during the Cloudflare build (no temporary
  `@cloudflare/vite-plugin` install); it uploads exactly the `dist/` produced by `npm run build`,
  which is the artifact CI verifies.
- The compatibility date is pinned instead of being the build date; a static-assets-only Worker
  has no runtime code affected by it.

Gameplay, routing, DEV exclusion and the served files are unchanged. Edit this file only with owner
approval: it controls production. Check it locally with `npx wrangler@<version> deploy --dry-run`
after `npm run build` (no Cloudflare login needed).

## Rollback

Workers & Pages → `game` → **Deployments** lists versions; use the previous version's **⋯ →
Rollback** (or deploy it at 100% traffic). A bad configuration change can also be reverted by a PR
to `main`.

## Live verification checklist

Use the actual Production or Preview URL from the dashboard/PR comment:

1. Open the root URL: the four-class selection screen loads, with no failed JS/CSS requests or
   uncaught errors in browser DevTools.
2. Start Warrior; move with WASD/arrows, observe attacks and enemies, pause and resume. Repeat a
   fresh run as Mage, Archer and Rogue.
3. Take enemy damage, die, choose **Revive**, confirm the same arena continues with half HP and
   three seconds of protection; a later death ends the run.
4. On Production (or a standard Preview), open `/?debug`: there is **no DEV/QA button**; console `typeof window.__alpha` is `"undefined"`.
5. Open `/?prototype&debug`: the preserved prototype loads and `typeof window.__survivors` is
   `"undefined"`.
6. Open `/alpha/routing-check` directly and reload it: the SPA fallback shows the alpha selection
   screen (the app has no path router; this only checks deployment fallback).
7. Check a phone-sized browser: the HUD fits and the lower-left touchscreen joystick works.

Cloudflare's success badge alone does not verify gameplay in the browser.

## Checks in the repository

```bash
npm ci
npm test
npm run build
npm run test:production
```

`npm run build` includes the TypeScript checks. `npm run test:production` checks the static
artifact (compiled asset references, ≤ 25 MiB per file — the Workers static-asset limit, no source
maps, environment, source or dependency files), serves `dist/` locally with Vite preview (which
models the same SPA fallback) and checks gameplay/pause, a nested path, `?debug` routes and the
elimination of DEV code. GitHub Actions runs these on every PR; Cloudflare's build command runs
only `npm run build`.

## Developer Testing Mode and QA Preview (Task 07.1)

Production remains `main` → `npm run build` → `npx wrangler deploy`, using `wrangler.jsonc`
and `dist/`. It always excludes DEV/QA code. Standard Previews using this same build are also
without debug tools.

For an explicitly enabled QA Preview, change **only Previews Base** to `npm run build:qa` and
`npx wrangler preview --config wrangler.qa.jsonc`. This builds `dist-qa/` with a compile-time QA
flag and fails closed unless Workers Builds supplies a non-main `WORKERS_CI_BRANCH`. The normal
production configuration/file is unchanged. Do not set branch variables manually in Cloudflare.

Exact setup, URL patterns, local tests and a separate QA Worker fallback:
[GAMEPLAY_BALANCE_QA.md](GAMEPLAY_BALANCE_QA.md). Production must still pass
`npm run test:production`. Local development remains `npm run dev` → `/?debug`.

## Troubleshooting

- **Preview build fails with a missing `previews` block:** `wrangler.jsonc` is missing or lost its
  `previews` key.
- **Deploy uploads to a new Worker:** the `name` in `wrangler.jsonc` no longer matches `game`.
- **Blank page or asset 404:** check that the build command is `npm run build`, the root directory
  is the repository root and `assets.directory` is `./dist`.
- **Deep-link 404:** check `assets.not_found_handling` is `single-page-application`.
- **Wrong Node version:** `.node-version` must stay `24.19.0`; the build log shows the detected
  version.
- **Production DEV/QA controls are visible:** verify the main build is `npm run build` with
  `wrangler.jsonc` / `dist/`; redeploy the production artifact. An explicitly configured QA Preview
  is expected to expose its QA tools. `npm run test:production` rejects such bundles.
- **Large bundle warning:** Vite's Phaser chunk advisory is expected and is not an error.

## References

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Static assets](https://developers.cloudflare.com/workers/static-assets/)
- [SPA routing / `not_found_handling`](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Worker Previews](https://developers.cloudflare.com/workers/previews/)
