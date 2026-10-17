// Sanity checks for the stats engine: npm test
import assert from 'node:assert/strict';
import { woba, wrcPlus, fip, pitcherWarFIP, pitcherWarWOBA, hitterValueExpected, pitcherValueExpected, ipToDec, deriveHitting } from '../src/lib/stats.js';
import { guts } from '../src/lib/guts.js';

const S = 2024;
const g = guts(S);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// League-average wOBA -> wRC+ 100; +1 scale-unit of wOBA per PA -> 100 + 100/rPA... monotonic
assert.equal(wrcPlus(g.woba, S), 100);
assert.ok(wrcPlus(g.woba + 0.040, S) > 125 && wrcPlus(g.woba + 0.040, S) < 135, 'a .350 hitter is ~+30%');
assert.ok(wrcPlus(g.woba, S, 1.1) < 100, 'hitter park lowers wRC+');

// A 600 PA, .400 wOBA-ish line
const line = { PA: 650, AB: 560, H: 170, '1B': 95, '2B': 35, '3B': 2, HR: 38, BB: 80, IBB: 10, HBP: 5, SO: 130, SF: 5, GIDP: 10 };
const w = woba(line, S);
close(w, 0.405, 0.02, 'wOBA of star line');
const ve = hitterValueExpected(line, S, { woba: w, xwoba: 0.410, pf: 1, bsr: 2, frv: 5, pos: 'RF' });
assert.ok(ve.vWAR > 5 && ve.vWAR < 9, `vWAR plausible (${ve.vWAR})`);
assert.ok(ve.eWAR > 5 && ve.eWAR < 9.5, `eWAR plausible (${ve.eWAR})`);
assert.ok(ve.valuePlus > 140, 'Value+ star');

// League-average hitter -> ~0 vRAA ignoring fielding, Value+ ~100
const avg = { PA: 600, AB: 535, H: 131, '1B': 85, '2B': 26, '3B': 2, HR: 18, BB: 50, IBB: 3, HBP: 7, SO: 135, SF: 5, GIDP: 11 };
const avgVE = hitterValueExpected(avg, S, { woba: g.woba, xwoba: g.woba });
close(avgVE.valuePlus, 100, 3, 'avg Value+');
close(avgVE.vWAR, 20 / g.rW, 0.6, 'avg hitter ~2 wins above replacement');

// Pitchers: average 180 IP starter ~ 2 WAR on both versions
const p = { IP: 180, TBF: 760, G: 30, GS: 30, HR: 22, BB: 55, HBP: 7, SO: 170, AB: 690, H: 165, '1B': 110, '2B': 30, '3B': 3, IBB: 2, SF: 5, GIDP: 15 };
const f = fip(p, S);
close(f, g.lgERA, 0.6, 'avg FIP near lgERA');
const wf = pitcherWarFIP(p, S), ww = pitcherWarWOBA(p, S);
assert.ok(wf > 1 && wf < 4.5, `FIP-WAR plausible ${wf}`);
assert.ok(ww > 0.5 && ww < 4.5, `wOBA-WAR plausible ${ww}`);
const pve = pitcherValueExpected(p, S, { xwoba: g.woba });
assert.ok(pve.eWAR > 1 && pve.eWAR < 5, `pitcher eWAR plausible ${pve.eWAR}`);

assert.equal(ipToDec('123.1').toFixed(3), '123.333');
const d = deriveHitting(line, S);
assert.ok(d.OPS > 0.9 && d['K%'] > 0.19);
console.log('stats tests passed', { w: w.toFixed(3), vWAR: ve.vWAR.toFixed(1), eWAR: ve.eWAR.toFixed(1), FIPWAR: wf.toFixed(1), wOBAWAR: ww.toFixed(1) });

// ---- platoon models
import { regressSplits, projectMatchup, leagueComps, marcel, optimizeLineup } from '../src/lib/platoon.js';
{
  // LHB with a huge observed split in a small sample gets pulled toward the league split
  const r = regressSplits({ vL: { PA: 120, wOBA: 0.250, xwOBA: 0.260 }, vR: { PA: 480, wOBA: 0.380, xwOBA: 0.370 } }, 'batter', 'L');
  const m = r.metrics.wOBA;
  close(m.obs, 0.130, 1e-9, 'observed split');
  assert.ok(m.reg < 0.06 && m.reg > 0.028, `regressed split shrinks (${m.reg})`);
  const back = (m.vL * 120 + m.vR * 480) / 600;
  close(back, m.overall, 1e-9, 'regressed splits keep the overall wOBA');
  const lg = leagueComps({ PA: 180000, SO: 40500, BB: 15300, IBB: 500, HBP: 2000, HR: 5600, xwOBAcon: 0.37 });
  const avg = { PA: 600, SO: 135, BB: 51, IBB: 2, HBP: 7, HR: 19, xwOBAcon: 0.37 };
  const pr = projectMatchup(avg, avg, lg, 2024);
  close(pr.woba, 0.31, 0.03, 'avg vs avg ~ league wOBA');
  const star = { PA: 600, SO: 90, BB: 90, IBB: 5, HBP: 5, HR: 40, xwOBAcon: 0.45 };
  assert.ok(projectMatchup(star, avg, lg, 2024).woba > pr.woba + 0.05, 'star batter projects higher');
  const ace = { PA: 700, SO: 230, BB: 40, IBB: 1, HBP: 4, HR: 15, xwOBAcon: 0.33 };
  assert.ok(projectMatchup(avg, ace, lg, 2024).woba < pr.woba - 0.03, 'ace suppresses');
  const mc = marcel([{ season: 2025, splits: { all: { PA: 600, wOBA: 0.400 } } }, { season: 2024, splits: { all: { PA: 600, wOBA: 0.380 } } }], 'wOBA', 'all', { 2025: 0.315, 2024: 0.31 }, 27);
  assert.ok(mc.value > 0.35 && mc.value < 0.39, `marcel regresses (${mc.value})`);
  const lu = optimizeLineup(Array.from({ length: 10 }, (_, i) => ({ id: i, w: 0.3 + i / 100, obp: 0.3 + (i % 3) / 100 })), 'w');
  assert.equal(lu.length, 9); assert.equal(lu[2].w, 0.36, 'fourth-best bat bats 3rd');
  console.log('platoon tests passed', { regSplit: m.reg.toFixed(3), avgMatchup: pr.woba.toFixed(3), marcel: mc.value.toFixed(3) });
}
