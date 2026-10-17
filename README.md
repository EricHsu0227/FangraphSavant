# Platoon

An MLB stats web app — FanGraphs + Baseball Savant + Baseball-Reference + the MLB app in one place —
built around **lefty/righty splits, wOBA and xwOBA**. Every Statcast stat is calculated for vs-LHP and
vs-RHP (vs-LHB / vs-RHB for pitchers). Seasons 2015–2026.

## Tabs

| Tab | What's there |
|---|---|
| **Scores** | Date-pickable scoreboard (auto-refresh). Game page = MLB-app live screen (base/out/count diamond, current matchup with each player's season wOBA/xwOBA vs that hand, pitch-by-pitch strike zone), linescore, **box score with game wOBA, game xwOBA, wRC+ and wRC+ allowed, and WPA**, play-by-play with pitch sequences, EV/LA/distance and per-play WPA (filters: scoring / big WPA), win-probability chart with biggest plays, batted-ball table. |
| **Standings** | Any season, **any date** ("as of"). Division / Wild Card / League / MLB views, home/away, vs LHP/RHP starters, L10, Pythag, and **playoff odds** (Monte Carlo from that date, correct format per season: 5-team, 2020's 8-team, 6-team since 2022 with byes). |
| **Leaderboards** | FanGraphs-style presets (Dashboard, Standard, Advanced, Statcast, Batted Ball, Plate Discipline, Value/Expected, WAR) plus a **Custom** board with any stat in any order. Split toggle, season ranges (aggregated), team/position, qualified/min PA/IP, name search, and stat filters (e.g. xwOBA ≥ .350). Click any header to sort; cells shaded by percentile. |
| **Teams** | Baseball-Reference-style team-season page: roster batting/pitching with splits + team totals, **depth chart & platoon lineups** (FanGraphs for the current season when available, otherwise the most common lineup vs RHP and vs LHP by slot), rotation, bullpen, bench, schedule & results, team splits. |
| **Players** | Savant + FanGraphs: **customizable percentile rankings** (any stats, by split, qualified or all), **choose your own front stats**, FanGraphs-style stat tables with presets/custom columns and L/R toggle, situational splits, Statcast L/R table, Value/Expected by season, game logs (with game wOBA/wRC+), contract & transactions, prospect history. |
| **Postseason** | Bracket per season; each series page has games and series batting/pitching leaders with wOBA, xwOBA, wRC+, EV and WPA. |
| **Prospects** | FanGraphs Board-style list: rank, org rank, FV, ETA, tool grades, reports; filter by org and hitter/pitcher. |
| **Compare** | Up to five player-seasons, any stats, any split, with league percentile badges. |
| **Search** | Players, teams, team-seasons (`2016 Cubs`), postseason series (`2024 ALCS`, `ws 2019`, `2023 NLDS`). Every player name in the app links to the player page. |

## Stats that aren't standard

- **wRC+ allowed** — wRC+ of the hitters a pitcher faced (100 = average, lower is better). Used in box scores and everywhere for pitchers.
- **Pitcher WAR (wOBA)** — same framework and replacement level as FIP-WAR, but runs saved come from wOBA allowed (park-adjusted) instead of FIP. Shown next to standard **WAR (FIP)** and FanGraphs' published **fWAR**.
- **Value / Expected (your stat)** — for hitters *and* pitchers:
  - *Value+ / vRAA / vWAR*: wOBA with a strikeout penalty (and GIDP penalty for hitters), park-adjusted; hitters add Savant baserunning, FRV and positional adjustment.
  - *Expected+ / eRAA / eWAR*: xwOBA with the same penalties, no park factor; raw Savant FRV, no positional adjustment, DH starts get the fielding value of players who mostly DH; a sprint-speed baserunning version is computed too.
  - K and GIDP penalties are measured each season from Statcast run values (`kPen`, `gdpPen` in `guts.json`).
- **Park factors** are self-calculated: 5-year rolling, regressed, with separate factors for LHB and RHB.
- **Guts** (wOBA weights, scale, R/PA, R/W, cFIP) are recomputed every season from Statcast run values; FanGraphs-like fallbacks ship in `src/lib/guts.js`.

## How data flows

```
Browser ── MLB Stats API (live): scores, live feeds, win probability, standings by date, rosters,
                                 game logs, splits, transactions, search, postseason
       └── ./data/*.json (built nightly by GitHub Actions):
             Statcast L/R aggregates, xwOBA, Savant leaderboards (sprint, BsR, FRV, OAA),
             FanGraphs WAR / depth charts / prospects, guts, park factors, lineups, xwOBA grid
```

If a season's data isn't built yet the app still works: it falls back to MLB Stats API counting stats and
computes wOBA / wRC+ / WAR (FIP and wOBA) in the browser, with a notice that Statcast columns are pending.

## Hosting: GitHub + Cloudflare

- **GitHub** holds the code and runs the data pipeline (`.github/workflows/data.yml`): nightly for the current season, manual runs for backfills. Each run commits refreshed JSON to `public/data`.
- **Cloudflare** serves the site from the `fangraphsavant` Worker (static assets, `wrangler.jsonc`). Workers Builds is connected to this repo
  and redeploys on every push to `main` — code changes and nightly data commits alike. Build command `npm run build`, deploy command `npx wrangler deploy`.
- CI (`.github/workflows/ci.yml`) runs the stats and pipeline tests on every push.

First-time backfill: **Actions → Build data → Run workflow** with seasons `2015-2026` (runs 3 seasons at a time).

Local dev: `npm install && npm run dev`. Pipeline: `pip install -r pipeline/requirements.txt && SEASON=2025 python pipeline/build_season.py && python pipeline/build_global.py`.
Tests: `npm test` (stats engine) and `python pipeline/tests/test_pipeline.py` (whole pipeline on synthetic Statcast, no network).

## Hand-maintained data

`public/data/contracts.json` — keyed by MLBAM id:

```json
{ "592450": [{ "years": 9, "total": 360, "aav": 40, "start": 2023, "end": 2031,
               "details": "Opt-outs none; full no-trade", "seasons": { "2025": 40, "2026": 40 } }] }
```

`public/data/prospects/<year>.json` — written by the pipeline from FanGraphs' The Board when reachable; you can also drop in your own list:

```json
[{ "id": 691406, "name": "…", "org": "BAL", "orgId": 110, "pos": "SS", "age": 20.4, "rank": 1, "orgRank": 1,
   "fv": "65", "eta": 2026, "level": "AAA", "tools": { "Hit": "40/60", "Game Pwr": "45/60" }, "blurb": "…" }]
```

## Notes on sources

Some endpoints are best-effort and may need adjusting if a site changes: Savant leaderboard CSVs
(sprint speed, baserunning, FRV, OAA), FanGraphs leaderboard JSON (WAR), FanGraphs depth-chart and prospect APIs.
Each failure is logged in the Actions run and the rest of the build continues.
