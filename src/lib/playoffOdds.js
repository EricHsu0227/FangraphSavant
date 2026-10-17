// Monte Carlo playoff odds as of any date: games before the date use real results,
// games after are simulated with log5 on regressed Pythagorean strength, then the
// full postseason bracket is simulated in that season's format.
import { teamById } from './teams.js';

export function seasonGames(season) { return season === 2020 ? 60 : 162; }

function format(season) {
  if (season >= 2022) return 'six';      // 3 division winners + 3 WC, top 2 bye; WCS bo3, DS bo5, LCS/WS bo7
  if (season === 2020) return 'eight';   // top 2 each division + 2 WC, all bo3 first round
  return 'five';                         // 3 division winners + 2 WC, WC game
}

const HFA = 0.04;
const gameP = (a, b, sA, sB, home) => {
  const pa = sA[a], pb = sB[b];
  let p = (pa * (1 - pb)) / (pa * (1 - pb) + pb * (1 - pa));
  if (home === 'a') p += HFA / 2; else if (home === 'b') p -= HFA / 2;
  return Math.min(0.97, Math.max(0.03, p));
};
function series(a, b, bestOf, str) {
  // a has home field; 2-3-2 (7), 2-2-1 (5), all at a (3, since 2022), single game (1)
  const need = Math.ceil(bestOf / 2);
  const homeA = bestOf === 7 ? [1, 1, 0, 0, 0, 1, 1] : bestOf === 5 ? [1, 1, 0, 0, 1] : [1, 1, 1];
  let wa = 0, wb = 0, i = 0;
  while (wa < need && wb < need) {
    const p = gameP(a, b, str, str, homeA[i] ? 'a' : 'b');
    if (Math.random() < p) wa++; else wb++;
    i++;
  }
  return wa === need ? a : b;
}

export function simulateOdds(schedule, season, asOf, sims = 4000) {
  const games = [];
  for (const d of schedule?.dates || []) {
    for (const g of d.games || []) {
      if (g.gameType !== 'R') continue;
      const day = g.officialDate || d.date;
      const a = g.teams.away.team.id, h = g.teams.home.team.id;
      if (!teamById[a] || !teamById[h]) continue;
      const done = g.status?.abstractGameState === 'Final' && day < asOf && g.teams.away.score != null;
      const postponed = /Postponed|Cancelled/.test(g.status?.detailedState || '');
      if (postponed && !done) continue;
      games.push({ a, h, done, as: g.teams.away.score, hs: g.teams.home.score, day });
    }
  }
  const T = {};
  for (const id of Object.keys(teamById)) T[id] = { W: 0, L: 0, RS: 0, RA: 0 };
  const remaining = [];
  for (const g of games) {
    if (g.done) {
      const hw = g.hs > g.as;
      T[g.h][hw ? 'W' : 'L']++; T[g.a][hw ? 'L' : 'W']++;
      T[g.h].RS += g.hs; T[g.h].RA += g.as; T[g.a].RS += g.as; T[g.a].RA += g.hs;
    } else if (g.day >= asOf) remaining.push(g);
  }
  const str = {};
  for (const [id, t] of Object.entries(T)) {
    const gp = t.W + t.L;
    const py = t.RS + t.RA > 0 ? t.RS ** 1.83 / (t.RS ** 1.83 + t.RA ** 1.83) : 0.5;
    str[id] = (py * gp + 0.5 * 70) / (gp + 70);
  }
  // strength of remaining schedule
  const sos = {};
  for (const id of Object.keys(T)) sos[id] = [0, 0];
  for (const g of remaining) { sos[g.h][0] += str[g.a]; sos[g.h][1]++; sos[g.a][0] += str[g.h]; sos[g.a][1]++; }

  const fm = format(season);
  const out = {};
  for (const id of Object.keys(T)) out[id] = { po: 0, div: 0, bye: 0, wcs: 0, lds: 0, lcs: 0, ws: 0, wins: 0 };
  const jitterW = (W) => (id) => W[id] + Math.random() * 0.01;
  for (let s = 0; s < sims; s++) {
    const W = {};
    for (const id of Object.keys(T)) W[id] = T[id].W;
    for (const g of remaining) { if (Math.random() < gameP(g.h, g.a, str, str, 'a')) W[g.h]++; else W[g.a]++; }
    const jit = jitterW(W);
    const pennant = {};
    for (const lg of ['AL', 'NL']) {
      const lgTeams = Object.keys(T).filter((id) => teamById[id].lg === lg);
      const divW = [], div2 = [];
      for (const dv of ['East', 'Central', 'West']) {
        const t = lgTeams.filter((id) => teamById[id].div === dv).sort((a, b) => jit(b) - jit(a));
        divW.push(t[0]); div2.push(t[1]); out[t[0]].div++;
      }
      divW.sort((a, b) => jit(b) - jit(a));
      let champ;
      if (fm === 'six') {
        const wc = lgTeams.filter((id) => !divW.includes(id)).sort((a, b) => jit(b) - jit(a)).slice(0, 3);
        const seeds = [...divW, ...wc];
        seeds.forEach((id) => out[id].po++);
        out[seeds[0]].bye++; out[seeds[1]].bye++;
        const w36 = series(seeds[2], seeds[5], 3, str), w45 = series(seeds[3], seeds[4], 3, str);
        out[w36].wcs++; out[w45].wcs++; out[seeds[0]].wcs++; out[seeds[1]].wcs++;
        const d1 = series(seeds[0], w45, 5, str), d2 = series(seeds[1], w36, 5, str);
        out[d1].lds++; out[d2].lds++;
        champ = jit(d1) >= jit(d2) ? series(d1, d2, 7, str) : series(d2, d1, 7, str);
      } else if (fm === 'eight') {
        const rest = lgTeams.filter((id) => !divW.includes(id) && !div2.includes(id)).sort((a, b) => jit(b) - jit(a)).slice(0, 2);
        const seeds = [...divW, ...div2.sort((a, b) => jit(b) - jit(a)), ...rest];
        seeds.forEach((id) => out[id].po++);
        const r1 = [series(seeds[0], seeds[7], 3, str), series(seeds[3], seeds[4], 3, str), series(seeds[1], seeds[6], 3, str), series(seeds[2], seeds[5], 3, str)];
        r1.forEach((id) => out[id].wcs++);
        const d1 = series(r1[0], r1[1], 5, str), d2 = series(r1[2], r1[3], 5, str);
        out[d1].lds++; out[d2].lds++;
        champ = series(d1, d2, 7, str);
      } else {
        const wc = lgTeams.filter((id) => !divW.includes(id)).sort((a, b) => jit(b) - jit(a)).slice(0, 2);
        const seeds = [...divW, ...wc];
        seeds.forEach((id) => out[id].po++);
        const wcw = series(wc[0], wc[1], 1, str);
        [...divW, wcw].forEach((id) => out[id].wcs++);
        const d1 = series(seeds[0], wcw, 5, str), d2 = series(seeds[1], seeds[2], 5, str);
        out[d1].lds++; out[d2].lds++;
        champ = series(d1, d2, 7, str);
      }
      out[champ].lcs++;
      pennant[lg] = champ;
    }
    const ws = jit(pennant.AL) >= jit(pennant.NL) ? series(pennant.AL, pennant.NL, 7, str) : series(pennant.NL, pennant.AL, 7, str);
    out[ws].ws++;
    for (const id of Object.keys(T)) out[id].wins += W[id];
  }
  for (const id of Object.keys(out)) {
    const o = out[id];
    for (const k of ['po', 'div', 'bye', 'wcs', 'lds', 'lcs', 'ws', 'wins']) o[k] /= sims;
    Object.assign(o, T[id]);
    o.strength = str[id];
    o.sos = sos[id][1] ? sos[id][0] / sos[id][1] : null;
    o.left = sos[id][1];
  }
  return { teams: out, remaining: remaining.length, format: fm };
}

/** Division magic / elimination numbers from current W-L. */
export function magicNumbers(records, season) {
  const G = seasonGames(season);
  const out = {};
  for (const lg of ['AL', 'NL']) for (const dv of ['East', 'Central', 'West']) {
    const t = records.filter((r) => r.lg === lg && r.div === dv).sort((a, b) => b.pct - a.pct);
    if (!t.length) continue;
    const lead = t[0], second = t[1];
    if (second) out[lead.id] = { magic: Math.max(0, G + 1 - lead.W - second.L) };
    for (const r of t.slice(1)) out[r.id] = { elim: Math.max(0, G + 1 - lead.W - r.L) };
  }
  return out;
}
