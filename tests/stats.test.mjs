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
