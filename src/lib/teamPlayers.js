// One team's player lines for a season (MLB API counting per stint + pipeline Statcast rates).
import { getTeamPlayerStats, getPeople, splitsOf } from './mlbapi.js';
import { loadSeason, parkFactor } from './data.js';
import { fromMLB, deriveHitting, derivePitching, hitterValueExpected, pitcherValueExpected } from './stats.js';

const SIT = { all: null, vL: 'vl', vR: 'vr' };
const cache = new Map();

export function teamPlayers(teamId, season, group) {
  const key = `${teamId}:${season}:${group}`;
  if (!cache.has(key)) cache.set(key, build(teamId, season, group).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}

async function build(teamId, season, group) {
  const [parts, sc, pf] = await Promise.all([
    Promise.all(['all', 'vL', 'vR'].map((s) => getTeamPlayerStats(teamId, season, group, SIT[s]).catch(() => null))),
    loadSeason(season, group).catch(() => []),
    parkFactor(season, teamId),
  ]);
  const scById = new Map((sc || []).map((r) => [r.id, r]));
  const byId = new Map();
  ['all', 'vL', 'vR'].forEach((s, i) => {
    for (const sp of splitsOf(parts[i])) {
      const id = sp.player?.id;
      if (!id) continue;
      let r = byId.get(id);
      if (!r) { r = { id, name: sp.player.fullName, pos: sp.position?.abbreviation, splits: {} }; byId.set(id, r); }
      const line = fromMLB(sp.stat, group);
      const scRow = scById.get(id);
      const stint = scRow?.stints?.find((x) => x.teamId === teamId)?.splits?.[s];
      const scLine = stint || (scRow && (!scRow.stints || scRow.stints.length <= 1) ? scRow.splits?.[s] : null);
      if (scLine) for (const [k, v] of Object.entries(scLine)) if (!(k in line) && typeof v === 'number') line[k] = v;
      // drop pipeline-derived rates so they recompute on this team's line
      delete line.wOBA;
      const d = group === 'hitting' ? deriveHitting(line, season, pf) : derivePitching(line, season, pf);
      if (s === 'all') {
        Object.assign(d, group === 'hitting'
          ? hitterValueExpected(d, season, { woba: d.wOBA, xwoba: d.xwOBA, pf, bsr: scRow?.bsr, frv: scRow?.frv, pos: r.pos })
          : pitcherValueExpected(d, season, { woba: d.wOBA, xwoba: d.xwOBA, pf }));
        if (scRow?.bats) r.bats = scRow.bats;
        if (scRow?.throws) r.throws = scRow.throws;
      }
      r.splits[s] = d;
    }
  });
  const out = [...byId.values()];
  const missing = out.filter((r) => !r.bats || !r.throws).map((r) => r.id);
  if (missing.length) {
    const ppl = await getPeople(missing).catch(() => null);
    for (const p of ppl?.people || []) {
      const r = byId.get(p.id);
      if (r) { r.bats ||= p.batSide?.code; r.throws ||= p.pitchHand?.code; }
    }
  }
  return out;
}

