// Loads one player's career: season rows with all/vL/vR derived lines, Statcast
// detail per season, and (when the pipeline hasn't built him) an MLB-API fallback.
import { loadJSON, parkFactor } from './data.js';
import { getPersonSplits, splitsOf } from './mlbapi.js';
import { fromMLB, addLines, deriveHitting, derivePitching, hitterValueExpected, pitcherValueExpected } from './stats.js';
import { SEASONS } from './guts.js';
import { teamById } from './teams.js';

export async function careerLines(id, group, person) {
  const file = await loadJSON(`players/${id}.json`);
  const derive = async (season, r) => {
    const pf = await parkFactor(season, r.teamId);
    const out = { season, team: r.team, teamId: r.teamId, age: r.age, pos: r.pos, gpos: r.gpos, splits: {} };
    for (const s of ['all', 'vL', 'vR']) {
      const l = r.splits?.[s];
      if (!l) continue;
      const d = group === 'hitting' ? deriveHitting(l, season, pf) : derivePitching(l, season, pf);
      if (s === 'all') {
        Object.assign(d, group === 'hitting'
          ? hitterValueExpected(d, season, { woba: d.wOBA, xwoba: d.xwOBA, pf, bsr: r.bsr, bsrSpeed: r.bsrSpeed, frv: r.frv, pos: r.pos, dhPA: r.dhPA, dhFrvPerPA: r.dhFrvPerPA })
          : pitcherValueExpected(d, season, { woba: d.wOBA, xwoba: d.xwOBA, pf }));
        for (const k of ['bsr', 'frv', 'oaa', 'sprint']) if (r[k] != null) d[k] = r[k];
        if (r.WAR_fg != null) d.fWAR = r.WAR_fg;
        for (const [pt, v] of Object.entries(r.pt || {})) for (const [k, x] of Object.entries(v || {})) if (x != null) d[`pt_${pt}_${k}`] = x;
      }
      out.splits[s] = d;
    }
    return out;
  };
  if (file?.[group]?.length) {
    return {
      source: 'statcast',
      rows: (await Promise.all(file[group].map((r) => derive(r.season, r)))).sort((a, b) => a.season - b.season),
      detail: file.detail?.[group] || {},
    };
  }
  // Fallback: MLB API yearByYear + vl/vr statSplits per season
  const yby = (person?.stats || []).find((s) => s.group?.displayName === group && s.type?.displayName === 'yearByYear');
  const bySeason = new Map();
  for (const sp of yby?.splits || []) {
    if (sp.sport?.id && sp.sport.id !== 1) continue;
    const season = Number(sp.season);
    const cur = bySeason.get(season) || { season, team: [], teamId: sp.team?.id, line: {} };
    if (sp.team) cur.team.push(sp.team.abbreviation || teamById[sp.team.id]?.abbr || sp.team.name);
    cur.teamId = sp.team?.id || cur.teamId;
    cur.line = addLines(cur.line, fromMLB(sp.stat, group));
    bySeason.set(season, cur);
  }
  const rows = await Promise.all([...bySeason.values()].map(async (r) => {
    const raw = { team: r.team.join('/'), teamId: r.teamId, splits: { all: r.line } };
    if (r.season >= SEASONS[0]) {
      const sp = await getPersonSplits(id, r.season, group).catch(() => null);
      for (const x of splitsOf(sp)) {
        if (x.split?.code === 'vl') raw.splits.vL = fromMLB(x.stat, group);
        if (x.split?.code === 'vr') raw.splits.vR = fromMLB(x.stat, group);
      }
    }
    return derive(r.season, raw);
  }));
  return { source: 'mlbapi', rows: rows.sort((a, b) => a.season - b.season), detail: {} };
}

/** Minor-league seasons from getMinors() (sportIds 11–16). */
export function minorLeagueRows(resp, group) {
  const LV = { 11: 'AAA', 12: 'AA', 13: 'A+', 14: 'A', 15: 'A-', 16: 'Rk', 17: 'Win' };
  return splitsOf(resp).filter((sp) => sp.sport?.id && sp.sport.id !== 1).map((sp) => {
    const l = fromMLB(sp.stat, group);
    const season = Number(sp.season);
    const d = group === 'hitting' ? deriveHitting(l, Math.max(SEASONS[0], season)) : derivePitching(l, Math.max(SEASONS[0], season));
    return { ...d, _key: `${season}-${sp.team?.id}-${sp.sport.id}`, season, team: sp.team?.name, level: LV[sp.sport.id] || sp.sport?.abbreviation || '' };
  });
}
