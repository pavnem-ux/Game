# Deploy the combat alpha to Cloudflare Pages

This is deployment preparation for the existing Task 06 alpha, not Task 07. Gameplay, class progression, formulas, visuals and provisional balancing are unchanged. The site is a static Vite/React/Phaser build; it needs no backend, Pages Functions or server process after deployment.

## What is prepared

- `.node-version` pins **Node.js 24.19.0**, the version used to validate this project. Cloudflare Pages supports this file; an explicit `NODE_VERSION` dashboard setting can use the same value.
- `npm run build` runs both TypeScript checks and Vite's production build, producing `dist/index.html` and hashed JS/CSS in `dist/assets/`.
- Cloudflare Pages serves `index.html` for unknown non-asset paths when there is **no top-level `404.html`**. This build has no such file, so native SPA fallback is sufficient. No `_redirects`, router change or Worker is needed. Existing `/?prototype` and `/?debug` conventions use query strings, not separate server routes.
- Developer Testing Mode is gated by `import.meta.env.DEV`. Production builds remove its UI, globals and testing controller imports. Adding `?debug` to the hosted URL does not enable it, including Cloudflare's branch preview deployments, which also run the production build.
- `dist/`, dependencies, local environment files, screenshots and credentials stay out of Git. No Cloudflare token, account ID, GitHub token or secret is required in this repository.

The GitHub repository can remain **private**. Cloudflare's GitHub App reads the selected private repository and publishes only the generated `dist/` website. The website and its compiled browser JS are publicly accessible by default; repository privacy does not restrict the deployed site's visitors.

## Publish from the private GitHub repository

Complete these steps in your own browser; no local Node.js installation is needed.

1. Sign in to GitHub and open [pavnem-ux/Game](https://github.com/pavnem-ux/Game). Confirm the repository has the **Private** badge and that the deployment-preparation commit is on `main`. The package.json `private: true` flag controls npm publishing, not GitHub visibility. This preparation does not change repository visibility. If the repository is currently public, make it private in **Settings → General → Danger Zone → Change repository visibility** before connecting it.
2. Sign in or create an account at [Cloudflare Dashboard](https://dash.cloudflare.com/), then choose the Cloudflare account that should own this game.
3. Open **Workers & Pages → Create application → Pages → Connect to Git**. Use the **Pages** flow; it uploads static build output. A Workers deploy-command form is a different flow.
4. Choose **GitHub**. When asked, install/authorize **Cloudflare Workers & Pages** in the GitHub account that owns `pavnem-ux/Game`. Choose **Only select repositories** and select **Game**. Complete **Install & Authorize** and return to Cloudflare. An organization-owned repository may require its owner's approval of the GitHub App.
5. Select **pavnem-ux/Game**, then **Begin setup**. Choose a project name, for example `fantasy-survivors-game` if available. Cloudflare will assign the final hostname; the example name is not a verified live site.
6. Enter these build settings:

   | Setting                | Exact value                                                            |
   | ---------------------- | ---------------------------------------------------------------------- |
   | Production branch      | `main`                                                                 |
   | Framework preset       | `Vite`; if unavailable, use `None` and enter the values below manually |
   | Build command          | `npm run build`                                                        |
   | Build output directory | `dist`                                                                 |
   | Root directory / Path  | Leave empty: `package.json` is at the GitHub repository root           |
   | Node version           | `.node-version` already pins `24.19.0`                                 |

   In **Environment variables**, add the non-secret setting **`NODE_VERSION` = `24.19.0`** for Production and Preview environments when available. Keep it consistent with `.node-version`. Leave `NODE_ENV` unset: Vite's build selects production automatically, and the TypeScript/Vite devDependencies are needed during the build. Leave automatic dependency installation enabled so Pages installs from the committed package.json/package-lock.json. There are no application secrets or other required environment variables.

7. Select **Save and Deploy**. Cloudflare will clone the private repository using the authorized GitHub App, install dependencies, run the production build and publish `dist/`. Check the build logs and verify the deployment uses the expected `main` commit. A successful build is followed by a deployment-success result.
8. Select **Continue to project**, open **Deployments**, and copy the actual **Production URL** shown by Cloudflare, ending in `.pages.dev`. Open that exact HTTPS URL. A custom domain is optional. No Codex Preview, localhost address, running Vite process or port 5173 is involved in the deployed site.
9. Verify the live deployment using the checklist below. Share the actual URL if you want it checked from this environment. Until a real URL has been opened and checked, this task establishes deployment readiness only, not a verified live site.

For future releases, pushing to `main` triggers the connected Pages production build. Non-production branches can produce Cloudflare preview URLs according to the project's branch-build settings. Both use `npm run build`; neither exposes Developer Testing Mode. To roll back, use the project's **Deployments** history and select the previous production deployment's rollback action.

## Live verification checklist

Use the actual deployment URL from the dashboard:

1. Open the root URL: the four-class selection screen loads, with no failed JS/CSS requests or uncaught errors in browser DevTools.
2. Start Warrior; move with WASD/arrows, observe attacks and enemies, pause and resume. Repeat a fresh run as Mage, Archer and Rogue.
3. Take normal enemy damage, die, choose **Revive**, confirm the same arena continues with half HP and three seconds of protection; a later death ends the run. Production has no controlled-death debug action.
4. Open the same URL with `/?debug`: there is **no DEV button**, no level-testing input and no Developer Testing Mode. Browser console `typeof window.__alpha` is `"undefined"`.
5. Open `/?prototype&debug`: the preserved prototype loads and `typeof window.__survivors` is `"undefined"`.
6. Open `/alpha/routing-check` directly and reload it: Pages' native SPA fallback should show the alpha selection screen. The app has no path-based router, so this route is just a deployment fallback check.
7. Check a phone-sized browser: the HUD fits and the lower-left touchscreen joystick moves the player.
8. Confirm the GitHub repository still has its **Private** badge.

Cloudflare's success badge alone does not verify browser gameplay. This preparation has not authenticated to a Cloudflare account, created a Pages project, deployed a site or verified a Cloudflare hostname.

## Checks available in the repository

```bash
npm ci
npm test
npm run build
npm run test:production
```

`npm run build` includes `npm run typecheck`. `npm run test:production` checks the generated static artifact, compiled asset references, per-file size limits, absence of source maps/environment/source/dependency files and absence of a root 404.html. It serves the built site locally and checks actual gameplay/pause, a nested SPA path, alpha/legacy debug URLs and elimination of DEV code from production JS. Chromium is needed only to run this local regression; it is not needed in Cloudflare's build command.

The Pages build command is only `npm run build`; unit/browser tests are verified separately before publishing. Do not upload the repository root or `node_modules/` as the website; Pages publishes the configured `dist/` directory. There is no need to commit generated `dist/` files.

The local SPA test uses Vite preview's fallback. Cloudflare's matching fallback is based on its documented no-404 behavior; actual edge routing is verified only after deployment with a real Pages URL.

## Preparation verification results

- Clean `npm ci` succeeded with Node.js 24.19.0 and npm 11.9.0.
- `npm test`: all 576 Vitest tests and 6 Node tests passed; no skips.
- `npm run build`: both TypeScript checks and production build passed. Output: index.html (0.65 kB), hashed CSS (19.16 kB) and JS (1,532.83 kB). The existing Phaser chunk-size advisory remains.
- `npm run test:production`: static artifact checks and Chromium gameplay/pause, nested path and production debug-exclusion checks passed.
- No files under `src/`, gameplay configuration, dependency declarations or the lockfile were changed. Only the Node version pin, deployment documentation/README and deployment regression were changed. Generated output and secrets are not committed.
- Repository visibility could not be read through the metadata API (`Forbidden`); it was not changed. Cloudflare login, GitHub App authorization and the first live deployment/URL verification remain manual steps above.

## Authentication and troubleshooting

- **Cloudflare login/GitHub approval:** you must complete the browser login and GitHub App authorization yourself. No token needs to be sent in chat or committed. This environment has no Cloudflare account/deployment capability.
- **Repository missing:** open [GitHub App installations](https://github.com/settings/installations), configure **Cloudflare Workers & Pages**, and grant access to **Game** under **Only select repositories**. Return to Pages and refresh the repository picker. For organizations, request the repository owner's App approval.
- **GitHub visibility check here:** the GitHub metadata API returned `Forbidden`, so visibility could not be independently confirmed from Codex. No repository visibility setting was changed. Confirm the Private badge in step 1 and after deployment.
- **Wrong Node version:** set `NODE_VERSION=24.19.0`, confirm the same value in `.node-version`, and retry the deployment. Current Pages build images support version files; package.json engines alone is not the version selector used here.
- **Missing Vite/TypeScript during build:** ensure dependencies are installed and `NODE_ENV` was not set to skip devDependencies before installation.
- **Asset 404 or a blank page:** verify the root directory is the repository root, build command is `npm run build`, output is `dist`, and the latest intended commit was deployed. Build assets use root-relative `/assets/...` URLs, suitable for the Pages project hostname.
- **Deep-link 404:** ensure a top-level `404.html` has not been added and that this is a Pages static deployment.
- **Large bundle warning:** the existing Phaser bundle exceeds Vite's advisory chunk threshold, but the build succeeds and the artifact is below Pages' per-file limit. No gameplay dependencies or bundling behavior were changed for deployment.
- **Hosted DEV controls are visible:** do not use that deployment for production testing. Check that the command was `npm run build`, not a development server/custom development build, leave `NODE_ENV` unset and redeploy. The included production regression rejects a bundle containing the debug UI/controller/globals.

## Cloudflare references

- [Git integration and deployment setup](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [GitHub App and private repository access](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Build image and Node version overrides](https://developers.cloudflare.com/pages/configuration/build-image/)
- [Serving Pages and native SPA fallback](https://developers.cloudflare.com/pages/configuration/serving-pages/)

Setup instructions were checked against these pages' public source in Cloudflare's documentation repository. If dashboard wording changes, use the linked Pages Git-integration guide.
