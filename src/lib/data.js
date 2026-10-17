// Loads pipeline-built JSON (Statcast/FanGraphs layer) from ./data/, falling back to
// MLB Stats API counting stats (wOBA/wRC+ computed client-side) when a season
// has not been built yet.
import { getLeagueStats, splitsOf } from './mlbapi.js';
import { fromMLB, deriveHitting, derivePitching, hitterValueExpected, pitcherValueExpected } from './stats.js';
import { setGutsOverride } from './guts.js';

const cache = new Map();

export async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`./data/${path}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  cache.set(path, p);
  return p;
}

let boot = null;
/** Load guts + park factors once at startup. */
export function bootData() {
  if (!boot) {
    boot = Promise.all([loadJSON('guts.json'), loadJSON('parks.json'), loadJSON('index.json')]).then(([g, parks, index]) => {
      if (g) setGutsOverride(g);
      return { parks: parks || {}, index: index || { seasons: [] } };
    });
  }
  return boot;
}

export async function parkFactor(season, teamId, hand = 'all') {
  const { parks } = await bootData();
  const p = parks?.[season]?.[teamId];
  if (!p) return 1;
  return (hand === 'L' ? p.L : hand === 'R' ? p.R : p.all) || p.all || 1;
}

const SPLITS = ['all', 'vL', 'vR'];
const SIT = { all: null, vL: 'vl', vR: 'vr' };

/**
 * Returns [{ id, name, team, teamId, pos, splits: { all, vL, vR } }] with every
 * derived stat filled in, for 'hitting' or 'pitching'.
 */
export async function loadSeason(season, group) {
  const key = `${season}:${group}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const { parks } = await bootData();
    const file = await loadJSON(`${season}/${group === 'hitting' ? 'batters' : 'pitchers'}.json`);
    let rows = file;
    let source = 'statcast';
    if (!rows) {
      source = 'mlbapi';
      rows = await fromMlbApi(season, group);
    }
    const pfOf = (r) => parks?.[season]?.[r.teamId]?.all || 1;
    for (const r of rows) {
      const pf = pfOf(r);
      for (const s of SPLITS) {
        const l = r.splits?.[s];
        if (!l) continue;
        r.splits[s] = group === 'hitting' ? deriveHitting(l, season, pf) : derivePitching(l, season, pf);
      }
      const all = r.splits.all;
      if (!all) continue;
      if (group === 'hitting') {
        Object.assign(all, hitterValueExpected(all, season, {
          woba: all.wOBA, xwoba: all.xwOBA, pf, bsr: r.bsr, bsrSpeed: r.bsrSpeed, frv: r.frv,
          pos: r.pos, dhPA: r.dhPA, dhFrvPerPA: r.dhFrvPerPA,
        }));
        if (r.WAR_fg != null) all.fWAR = r.WAR_fg;
        for (const k of ['bsr', 'frv', 'oaa', 'sprint']) if (r[k] != null) all[k] = r[k];
      } else {
        Object.assign(all, pitcherValueExpected(all, season, { woba: all.wOBA, xwoba: all.xwOBA, pf }));
        if (r.WAR_fg != null) all.fWAR = r.WAR_fg;
      }
    }
    rows.source = source;
    return rows;
  })();
  cache.set(key, p);
  return p;
}

async function fromMlbApi(season, group) {
  const parts = await Promise.all(SPLITS.map((s) => getLeagueStats(season, group, SIT[s]).catch(() => null)));
  const byId = new Map();
  parts.forEach((resp, i) => {
    for (const sp of splitsOf(resp)) {
      const id = sp.player?.id;
      if (!id) continue;
      let r = byId.get(id);
      if (!r) {
        r = { id, name: sp.player.fullName, team: sp.team?.abbreviation || sp.team?.name || '', teamId: sp.team?.id,
          pos: sp.position?.abbreviation, splits: {} };
        byId.set(id, r);
      }
      r.splits[SPLITS[i]] = fromMLB(sp.stat, group);
    }
  });
  return [...byId.values()];
}

export async function loadTeamsMeta(season) { return loadJSON(`${season}/teams.json`); }
export async function loadPostseasonStatcast(season) { return loadJSON(`${season}/postseason.json`); }
export async function loadProspects(year) { return loadJSON(`prospects/${year}.json`); }
export async function loadContracts() { return loadJSON('contracts.json'); }
export async function loadPlayerIndex() { return loadJSON('players.json'); }

/** Find one player's row across built seasons (for the Player page). */
export async function playerSeasons(id, group) {
  const { index } = await bootData();
  const seasons = index.seasons?.length ? index.seasons : [];
  const out = [];
  for (const s of seasons) {
    const rows = await loadSeason(s, group);
    const r = rows.find((x) => x.id === id);
    if (r) out.push({ season: s, ...r });
  }
  return out;
}
