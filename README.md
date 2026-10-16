# FangraphSavant

MLB research desk covering 2015–2026. Built with React, Vinext/Vite, Cloudflare Workers and D1. The current owner-only app is https://fangraphsavant.blondsky6.chatgpt.site.

Includes batting, pitching and fielding leaderboards with saved column layouts; official Statcast left/right aggregates; player and team research; historical rosters and platoons; schedule, scorebooks and play-by-play; MLB win probability; pitcher/batter career matchups; and a configurable independent pitching wOBA-WAR model. Game contact details include Savant xBA and official home-run ballpark counts when available. No intensity scores or simulator.

## Run and validate

Use Node24 and Corepack with the pinned pnpm version:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit --incremental false
pnpm dev
```

The default `pnpm build` retains the managed Sites deployment and ChatGPT authentication. `pnpm build:cloudflare` creates the standalone Cloudflare Worker in `dist/server` and client assets in `dist/client`. Both builds use the same app and statistics adapters. The Cloudflare build is publicly accessible and does not depend on Zero Trust. The managed Sites deployment retains its original private audience.

## Public Cloudflare deployment

The repository includes a root `wrangler.jsonc`, so the existing Workers Builds command `npx wrangler deploy` uses the Vinext build and compiled `dist/server/index.js`. It does not run framework auto-configuration or OpenNext. The custom build runs `pnpm run build:cloudflare`; the worker uploads its compiled ESM modules and client assets.

For Workers Builds, the dashboard can explicitly use build command `pnpm run build:cloudflare` and deploy command `npx wrangler deploy --config dist/server/wrangler.json`. This avoids reliance on custom-build handling in the build service. Set Node24, repository root `/`, and production branch `main`. Git-connected Workers Builds may deploy on a push; the separate GitHub deploy workflow remains manual.

No Cloudflare Access variables or Zero Trust setup are required. Public pages, assets and baseball APIs are accessible to every visitor. Incoming account identity headers are stripped. The account preference API refuses anonymous reads/writes before touching D1, and public visitors save customizations in their own browser. Export/Restore transfers preferences between devices; account cloud sync is not available on this public deployment. Existing D1 account data is retained and is never exposed as shared public preferences.

**If Cloudflare Access was previously enabled in the dashboard, disable it for this Worker hostname** (Workers & Pages → fangraphsavant → Settings → Domains & Routes, or the Domains tab). Dashboard Access intercepts requests before the Worker; a code deployment cannot remove that login screen. Also remove any separate Access application protecting a custom hostname if present.

The `DB` binding retains the existing named `fangraphsavant-preferences` database. For manual GitHub deployment, the existing `cloudflare-private` environment name is retained: configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, plus the `CLOUDFLARE_D1_DATABASE_ID` variable. Run **Deploy Cloudflare Worker**. Git-connected Workers Builds deploy directly on main pushes without Access variables.

Verify anonymous navigation and statistics APIs succeed, account preferences return401, and forged identity headers cannot read or write any existing account. Preview URLs remain disabled. Repository visibility is unchanged; publishing the app does not make its source repository public.

## Data behavior

MLB official Stats API supplies schedules, full game feeds, standard/advanced statistics, rosters, standings and win probability. Baseball Savant supplies aggregate handedness statistics, game xBA, and `contextMetrics.homeRunBallparks`. Park counts compare a batted-ball trajectory to30 MLB ballparks and are not home-run probabilities. Missing counts stay unavailable; zero stays zero. The measured catcher-view strike zone uses pX/pZ and reported batter bounds. Outcome colors follow current MLB Gameday; pitch-type trail colors come from the official feed.

Core2015–2026 datasets and verified fallback snapshots are included, with live sources requested where available. 2026 snapshots may be partial. Career matchup records are current career totals, not historical as-of totals; regular season and postseason are separate. wOBA uses seasonal coefficients; custom wOBA-WAR is explicitly independent of FanGraphs WAR and bWAR. Source outages preserve usable cached/local sections and show unavailable fields as dashes. Live MLB requests are uncached and updates stay in place; browser scheduling, network conditions and upstream latency still apply.

## Validation

`pnpm test` covers statistics, scope separation, paired splits, roster history, game normalization, official park counts, pitch coordinates/colors, career matchups, account isolation, revision conflicts, large background round-trips and Cloudflare Access verification. Real-data scripts under `tests/` check live MLB/Savant adapters. `VALIDATION-v8.json` records the current verification limits. No interactive browser QA was available in the build environment.

Independent fan project. Data © MLB Advanced Media and respective sources; no affiliation with MLB, FanGraphs or Baseball-Reference. The source repository remains private. The standalone Cloudflare deployment is public by owner request.
