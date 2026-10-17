// Minor-league leaderboards straight from the MLB Stats API, with level-adjusted
// wOBA / wRC+ / FIP (league constants recomputed from each league's own totals)
// and age relative to the league.
import { api, splitsOf } from './mlbapi.js';
import { fromMLB, wobaDenom } from './stats.js';
import { guts } from './guts.js';

export const LEVELS = [
  { id: 11, label: 'AAA' }, { id: 12, label: 'AA' }, { id: 13, label: 'High-A' }, { id: 14, label: 'Single-A' }, { id: 16, label: 'Rookie' },
];

const n = (v) => +v || 0;

export async function milbAffiliates(season) {
  const j = await api(`/api/v1/teams?sportIds=11,12,13,14,16&season=${season}`, { ttl: 24 * 3600_000 });
  return Object.fromEntries((j.teams || []).map((t) => [t.id, { org: t.parentOrgId, name: t.teamName || t.name, abbr: t.abbreviation, league: t.league?.id }]));
}

export async function milbLeaders(season, sportId, group, split = 'all') {
  const sit = split === 'vL' ? 'vl' : split === 'vR' ? 'vr' : null;
  const url = `/api/v1/stats?stats=${sit ? 'statSplits' : 'season'}${sit ? `&sitCodes=${sit}` : ''}&group=${group}&season=${season}`
    + `&sportId=${sportId}&playerPool=All&limit=5000&hydrate=person`;
  const [resp, aff] = await Promise.all([api(url, { ttl: 30 * 60_000 }), milbAffiliates(season).catch(() => ({}))]);
  const rows = [];
  for (const sp of splitsOf(resp)) {
    const p = sp.player || {};
    if (!p.id) continue;
    const line = fromMLB(sp.stat, group);
    const team = aff[sp.team?.id] || {};
    const birth = p.birthDate || sp.person?.birthDate;
    rows.push({
      id: p.id, name: p.fullName, teamId: sp.team?.id, team: team.name || sp.team?.name, org: team.org, league: sp.league?.id || team.league,
      pos: sp.position?.abbreviation || p.primaryPosition?.abbreviation, bats: p.batSide?.code, throws: p.pitchHand?.code,
      age: birth ? ageOn(birth, `${season}-07-01`) : null, line,
    });
  }
  return deriveLevel(rows, group, season);
}

const ageOn = (birth, on) => (new Date(on) - new Date(birth)) / 3.15576e10;

/** League-relative stats: wOBA uses MLB weights rescaled to the league's OBP; wRC+, FIP-, age-vs-league. */
function deriveLevel(rows, group, season) {
  const g = guts(season);
  const byLg = new Map();
  for (const r of rows) {
    const t = byLg.get(r.league) || { line: {}, ageW: 0, ageN: 0 };
    for (const [k, v] of Object.entries(r.line)) t.line[k] = n(t.line[k]) + n(v);
    const w = group === 'hitting' ? n(r.line.PA) : n(r.line.IP);
    if (r.age != null) { t.ageW += r.age * w; t.ageN += w; }
    byLg.set(r.league, t);
  }
  const lgc = new Map();
  for (const [lg, t] of byLg) {
    const L = t.line;
    const den = wobaDenom(L);
    const raw = den ? (g.wBB * (n(L.BB) - n(L.IBB)) + g.wHBP * n(L.HBP) + g.w1B * n(L['1B']) + g.w2B * n(L['2B']) + g.w3B * n(L['3B']) + g.wHR * n(L.HR)) / den : 0;
    const obpD = n(L.AB) + n(L.BB) + n(L.HBP) + n(L.SF);
    const obp = obpD ? (n(L.H) + n(L.BB) + n(L.HBP)) / obpD : 0.32;
    const k = raw ? obp / raw : 1;              // rescale weights so league wOBA == league OBP
    const pa = n(L.PA) || 1;
    const runs = n(L.R) || n(L.Rallowed);
    const ip = n(L.IP);
    const era = ip ? (9 * n(L.ER)) / ip : null;
    const fipCore = ip ? (13 * n(L.HR) + 3 * (n(L.BB) + n(L.HBP)) - 2 * n(L.SO)) / ip : 0;
    lgc.set(lg, { k, woba: obp, scale: g.scale / k, rPA: runs / pa, age: t.ageN ? t.ageW / t.ageN : null, era, cFIP: era != null ? era - fipCore : g.cFIP,
      kPct: n(L.SO) / pa, bbPct: n(L.BB) / pa });
  }
  return rows.map((r) => {
    const c = lgc.get(r.league) || {};
    const l = r.line;
    const pa = n(l.PA) || n(l.TBF);
    const den = wobaDenom(l);
    const w = den ? c.k * (g.wBB * (n(l.BB) - n(l.IBB)) + g.wHBP * n(l.HBP) + g.w1B * n(l['1B']) + g.w2B * n(l['2B']) + g.w3B * n(l['3B']) + g.wHR * n(l.HR)) / den : null;
    const ab = n(l.AB);
    const out = {
      ...r, ...l, _key: `${r.id}-${r.teamId}`,
      ageRel: r.age != null && c.age != null ? r.age - c.age : null,
      'K%': pa ? n(l.SO) / pa : null, 'BB%': pa ? n(l.BB) / pa : null,
      AVG: ab ? n(l.H) / ab : null,
      OBP: (ab + n(l.BB) + n(l.HBP) + n(l.SF)) ? (n(l.H) + n(l.BB) + n(l.HBP)) / (ab + n(l.BB) + n(l.HBP) + n(l.SF)) : null,
      SLG: ab ? (n(l['1B']) + 2 * n(l['2B']) + 3 * n(l['3B']) + 4 * n(l.HR)) / ab : null,
      wOBA: w,
    };
    out.ISO = out.SLG != null && out.AVG != null ? out.SLG - out.AVG : null;
    out.wRCplus = w != null && c.rPA ? Math.round((((w - c.woba) / c.scale + c.rPA) / c.rPA) * 100) : null;
    if (group === 'pitching') {
      const ip = n(l.IP);
      out.ERA = ip ? (9 * n(l.ER)) / ip : null;
      out.FIP = ip ? (13 * n(l.HR) + 3 * (n(l.BB) + n(l.HBP)) - 2 * n(l.SO)) / ip + c.cFIP : null;
      out.WHIP = ip ? (n(l.BB) + n(l.H)) / ip : null;
      out['K-BB%'] = pa ? (n(l.SO) - n(l.BB)) / pa : null;
      out.HR9 = ip ? (9 * n(l.HR)) / ip : null;
      out.ERAminus = out.ERA != null && c.era ? Math.round((out.ERA / c.era) * 100) : null;
      out.FIPminus = out.FIP != null && c.era ? Math.round((out.FIP / c.era) * 100) : null;
      out.wRCplusAllowed = out.wRCplus;
      out.Kplus = pa && c.kPct ? Math.round(((n(l.SO) / pa) / c.kPct) * 100) : null;
    }
    return out;
  });
}
