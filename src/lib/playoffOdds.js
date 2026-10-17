// Monte Carlo playoff odds as of any date: games before the date use real results,
// games after are simulated with log5 on regressed Pythagorean strength.
import { teamById } from './teams.js';

function format(season) {
  if (season >= 2022) return { wc: 3, byes: 2 };       // 6 per league, top-2 division winners bye
  if (season === 2020) return { wc: 2, byes: 0, top2: true }; // 8 per league: top 2 each div + 2 WC
  return { wc: 2, byes: 0 };                           // 5 per league
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
  // Regressed strength: Pythag (exp 1.83) blended toward .500 with 70 games of ballast
  const str = {};
  for (const [id, t] of Object.entries(T)) {
    const gp = t.W + t.L;
    const py = t.RS + t.RA > 0 ? t.RS ** 1.83 / (t.RS ** 1.83 + t.RA ** 1.83) : 0.5;
    str[id] = (py * gp + 0.5 * 70) / (gp + 70);
  }
  const fm = format(season);
  const out = {};
  for (const id of Object.keys(T)) out[id] = { po: 0, div: 0, bye: 0, wins: 0 };
  const HFA = 0.04;
  for (let s = 0; s < sims; s++) {
    const W = {};
    for (const id of Object.keys(T)) W[id] = T[id].W;
    for (const g of remaining) {
      const ph = str[g.h], pa = str[g.a];
      let p = (ph * (1 - pa)) / (ph * (1 - pa) + pa * (1 - ph));
      p = Math.min(0.95, p + HFA / 2);
      if (Math.random() < p) W[g.h]++; else W[g.a]++;
    }
    for (const lg of ['AL', 'NL']) {
      const lgTeams = Object.keys(T).filter((id) => teamById[id].lg === lg);
      const jitter = (id) => W[id] + Math.random() * 0.01; // random tiebreak
      const divWinners = [];
      const divSecond = [];
      for (const dv of ['East', 'Central', 'West']) {
        const t = lgTeams.filter((id) => teamById[id].div === dv).sort((a, b) => jitter(b) - jitter(a));
        divWinners.push(t[0]); divSecond.push(t[1]);
        out[t[0]].div++;
      }
      let rest = lgTeams.filter((id) => !divWinners.includes(id));
      let made = [...divWinners];
      if (fm.top2) { made.push(...divSecond); rest = rest.filter((id) => !divSecond.includes(id)); }
      rest.sort((a, b) => jitter(b) - jitter(a));
      made.push(...rest.slice(0, fm.wc));
      for (const id of made) out[id].po++;
      if (fm.byes) divWinners.sort((a, b) => jitter(b) - jitter(a)).slice(0, fm.byes).forEach((id) => out[id].bye++);
    }
    for (const id of Object.keys(T)) out[id].wins += W[id];
  }
  for (const id of Object.keys(out)) {
    out[id].po /= sims; out[id].div /= sims; out[id].bye /= sims; out[id].wins /= sims;
    out[id].W = T[id].W; out[id].L = T[id].L; out[id].RS = T[id].RS; out[id].RA = T[id].RA;
  }
  return { teams: out, remaining: remaining.length };
}
