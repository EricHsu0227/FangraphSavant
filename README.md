# FangraphSavant

Private MLB research desk covering 2015–2026. Built with React, Vinext/Vite, Cloudflare Workers and D1. The current owner-only app is https://fangraphsavant.blondsky6.chatgpt.site.

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

The default `pnpm build` retains the managed Sites deployment and ChatGPT authentication. `pnpm build:cloudflare` creates the standalone Cloudflare Worker in `dist/server` and client assets in `dist/client`. Both builds use the same app and statistics adapters. The Cloudflare build has a separate verified Access boundary and does not depend on Sites dispatch for identity.

## Private Cloudflare deployment

Deployment to the owner's Cloudflare account requires account configuration. Nothing automatically publishes on a GitHub push. The manual **Deploy private Cloudflare Worker** action is the supported deploy path.

1. Create a Cloudflare Zero Trust Access self-hosted application covering the entire intended hostname. Use an allow policy restricted to your own email. Protect the Workers hostname as well as any custom domain. Copy the application audience and your `TEAM.cloudflareaccess.com` domain. Do not add a public bypass policy.
2. Create the D1 database `fangraphsavant-preferences` in your Cloudflare account. Copy its ID.
3. In this private GitHub repo, create an environment named `cloudflare-private`. Add environment **secrets** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `OWNER_EMAIL`. The API token needs Workers Scripts Edit and D1 Edit for the selected account. Add environment **variables** `CLOUDFLARE_D1_DATABASE_ID`, `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUDIENCE`.
4. Run **Deploy private Cloudflare Worker** from Actions. It validates configuration, runs tests and TypeScript, builds, applies D1 migrations, and deploys `fangraphsavant`. Configure the matching Access protection before using its hostname.
5. Verify an anonymous request is challenged/denied and that only the owner's Access session opens the app. The worker independently verifies the RS256 signature, issuer, audience, expiry and owner email on **every request**, including static assets. Missing Access configuration returns503; missing or invalid identity returns403. Preview URLs are disabled. No statistics or preferences are served anonymously.

Settings, layouts, percentile choices, split pairs and backgrounds sync to a D1 profile keyed by authenticated user ID. Optimistic revisions prevent concurrent overwrite; a browser copy supports offline use. Unsaved changes retry after reconnection. No service token or credentials are included in source. Sites and Cloudflare use separate identities/databases: export preferences in Settings and restore them on the new host for the initial transfer.

Cloudflare resources, quotas and billing belong to the account owner. No account-side deployment or resource creation has been claimed without access to that account.

## Data behavior

MLB official Stats API supplies schedules, full game feeds, standard/advanced statistics, rosters, standings and win probability. Baseball Savant supplies aggregate handedness statistics, game xBA, and `contextMetrics.homeRunBallparks`. Park counts compare a batted-ball trajectory to30 MLB ballparks and are not home-run probabilities. Missing counts stay unavailable; zero stays zero. The measured catcher-view strike zone uses pX/pZ and reported batter bounds. Outcome colors follow current MLB Gameday; pitch-type trail colors come from the official feed.

Core2015–2026 datasets and verified fallback snapshots are included, with live sources requested where available. 2026 snapshots may be partial. Career matchup records are current career totals, not historical as-of totals; regular season and postseason are separate. wOBA uses seasonal coefficients; custom wOBA-WAR is explicitly independent of FanGraphs WAR and bWAR. Source outages preserve usable cached/local sections and show unavailable fields as dashes. Live MLB requests are uncached and updates stay in place; browser scheduling, network conditions and upstream latency still apply.

## Validation

`pnpm test` covers statistics, scope separation, paired splits, roster history, game normalization, official park counts, pitch coordinates/colors, career matchups, account isolation, revision conflicts, large background round-trips and Cloudflare Access verification. Real-data scripts under `tests/` check live MLB/Savant adapters. `VALIDATION-v8.json` records the current verification limits. No interactive browser QA was available in the build environment.

Independent fan project. Data © MLB Advanced Media and respective sources; no affiliation with MLB, FanGraphs or Baseball-Reference. Keep this repository and deployments private.
