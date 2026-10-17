// Core sabermetric math. Every function takes a normalized "line":
// { PA, AB, H, '1B','2B','3B', HR, BB, IBB, HBP, SO, SF, SH, GIDP, SB, CS, R, RBI,
//   IP (decimal innings), TBF, ER, Rallowed, G, GS }
// Statcast fields (xwOBA, EV, ...) ride along untouched.
import { guts } from './guts.js';

const n = (v) => (Number.isFinite(+v) ? +v : 0);

/** "123.1" (MLB notation) -> 123.333 */
export function ipToDec(ip) {
  if (ip == null) return 0;
  const s = String(ip);
  const [w, f = '0'] = s.split('.');
  return n(w) + n(f) / 3;
}

/** Normalize an MLB Stats API stat object (hitting or pitching) to a line. */
export function fromMLB(st = {}, group = 'hitting') {
  const H = n(st.hits), D = n(st.doubles), T = n(st.triples), HR = n(st.homeRuns);
  const line = {
    G: n(st.gamesPlayed), GS: n(st.gamesStarted),
    PA: n(st.plateAppearances) || n(st.battersFaced),
    AB: n(st.atBats), H, '2B': D, '3B': T, HR, '1B': H - D - T - HR,
    BB: n(st.baseOnBalls), IBB: n(st.intentionalWalks), HBP: n(st.hitByPitch),
    SO: n(st.strikeOuts), SF: n(st.sacFlies), SH: n(st.sacBunts),
    GIDP: n(st.groundIntoDoublePlay), SB: n(st.stolenBases), CS: n(st.caughtStealing),
    R: n(st.runs), RBI: n(st.rbi),
  };
  if (group === 'pitching') {
    Object.assign(line, {
      IP: ipToDec(st.inningsPitched), TBF: n(st.battersFaced), ER: n(st.earnedRuns),
      W: n(st.wins), L: n(st.losses), SV: n(st.saves), HLD: n(st.holds),
      GF: n(st.gamesFinished), Rallowed: n(st.runs), WP: n(st.wildPitches),
      pitches: n(st.numberOfPitches),
    });
    line.PA = line.TBF || line.PA;
  }
  return line;
}

export function addLines(a = {}, b = {}) {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    if (typeof b[k] === 'number') out[k] = n(out[k]) + b[k];
  }
  return out;
}

export function wobaDenom(l) {
  return n(l.AB) + n(l.BB) - n(l.IBB) + n(l.SF) + n(l.HBP);
}

export function wobaNum(l, g) {
  return g.wBB * (n(l.BB) - n(l.IBB)) + g.wHBP * n(l.HBP) + g.w1B * n(l['1B']) +
    g.w2B * n(l['2B']) + g.w3B * n(l['3B']) + g.wHR * n(l.HR);
}

export function woba(l, season) {
  const g = guts(season);
  const d = wobaDenom(l);
  return d > 0 ? wobaNum(l, g) / d : null;
}

/** wRAA: runs above average from wOBA. */
export function wraa(wobaVal, pa, season) {
  const g = guts(season);
  if (wobaVal == null) return null;
  return ((wobaVal - g.woba) / g.scale) * pa;
}

/** wRC+ (100 = average). pf = park factor as a ratio (1.00 neutral). */
export function wrcPlus(wobaVal, season, pf = 1) {
  if (wobaVal == null) return null;
  const g = guts(season);
  const perPA = (wobaVal - g.woba) / g.scale + g.rPA;
  return Math.round(((perPA + (g.rPA - pf * g.rPA)) / g.rPA) * 100);
}

/** wRC+ allowed for a pitcher: same scale, from wOBA allowed (lower is better). */
export const wrcPlusAllowed = wrcPlus;

export function slash(l) {
  const AB = n(l.AB), H = n(l.H);
  const avg = AB ? H / AB : null;
  const obpD = AB + n(l.BB) + n(l.HBP) + n(l.SF);
  const obp = obpD ? (H + n(l.BB) + n(l.HBP)) / obpD : null;
  const tb = n(l['1B']) + 2 * n(l['2B']) + 3 * n(l['3B']) + 4 * n(l.HR);
  const slg = AB ? tb / AB : null;
  return { AVG: avg, OBP: obp, SLG: slg, OPS: obp != null && slg != null ? obp + slg : null,
    ISO: slg != null && avg != null ? slg - avg : null,
    BABIP: (AB - n(l.SO) - n(l.HR) + n(l.SF)) > 0 ? (H - n(l.HR)) / (AB - n(l.SO) - n(l.HR) + n(l.SF)) : null };
}

export function fip(l, season) {
  const g = guts(season);
  const ip = n(l.IP);
  if (!ip) return null;
  return (13 * n(l.HR) + 3 * (n(l.BB) + n(l.HBP)) - 2 * n(l.SO)) / ip + g.cFIP;
}

/** FanGraphs replacement level for pitchers, in wins per 9 innings. */
function replPer9(l) {
  const G = n(l.G) || 1;
  const gsShare = Math.min(1, n(l.GS) / G);
  return 0.03 * (1 - gsShare) + 0.12 * gsShare;
}

/** Standard pitcher WAR built on FIP (FanGraphs framework). */
export function pitcherWarFIP(l, season, pf = 1) {
  const g = guts(season);
  const f = fip(l, season);
  if (f == null) return null;
  const ip = n(l.IP);
  const lgRA9 = g.lgERA * g.raPerEra;
  const fipR9 = (f + (lgRA9 - g.lgERA)) / pf;
  const runsAboveAvg = ((lgRA9 - fipR9) * ip) / 9;
  return runsAboveAvg / g.rW + replPer9(l) * (ip / 9);
}

/**
 * Pitcher WAR built on wOBA allowed instead of FIP.
 * Runs saved vs average = (lgwOBA - wOBA allowed)/scale per batter faced,
 * park-adjusted, then the same replacement level as FIP-WAR.
 */
export function pitcherWarWOBA(l, season, pf = 1, wobaAllowed = null) {
  const g = guts(season);
  const w = wobaAllowed ?? woba(l, season);
  const ip = n(l.IP);
  const tbf = n(l.TBF) || n(l.PA);
  if (w == null || !ip || !tbf) return null;
  const adjW = w / pf; // park-neutral wOBA allowed
  const runsAboveAvg = ((g.woba - adjW) / g.scale) * tbf;
  return runsAboveAvg / g.rW + replPer9(l) * (ip / 9);
}

// ---------------------------------------------------------------------------
// Value / Expected (Eric's stat)
//   Value:    wOBA with a strikeout penalty (and GIDP for hitters), park-adjusted
//   Expected: same built on xwOBA, no park factor
//   vRAA / eRAA = runs above average; vWAR / eWAR add replacement level.
//   Expected drops positional adjustment and is meant as a skill rate.
// ---------------------------------------------------------------------------
const POS_ADJ_600 = { C: 12.5, '1B': -12.5, '2B': 2.5, '3B': 2.5, SS: 7.5, LF: -7.5, CF: 2.5, RF: -7.5, DH: -17.5, OF: -4, IF: 2, P: 0 };
const REPL_RUNS_600 = 20;

/** League-average penalty per wOBA-denominator PA (lgK% and lgGIDP% from guts). */
function leaguePen(g, isHitter) {
  const k = (g.lgKrate ?? 0.225) * g.kPen;
  const d = isHitter ? (g.lgGDPrate ?? 0.018) * g.gdpPen : 0;
  return (k + d) * g.scale;
}

function penaltyWoba(l, g, isHitter) {
  const d = wobaDenom(l);
  if (!d) return 0;
  const pen = n(l.SO) * g.kPen + (isHitter ? n(l.GIDP) * g.gdpPen : 0);
  return (pen * g.scale) / d; // runs -> wOBA points
}

/**
 * Hitter Value/Expected.
 * extras: { xwoba, pf, bsr (Savant baserunning runs), bsrSpeed (sprint-speed version),
 *           frv (fielding run value), pos, dhPA, dhFrvPerPA }
 */
export function hitterValueExpected(l, season, extras = {}) {
  const g = guts(season);
  const pa = n(l.PA) || wobaDenom(l);
  const w = extras.woba ?? woba(l, season);
  if (!pa || w == null) return {};
  const pen = penaltyWoba(l, g, true);
  const pf = extras.pf || 1;
  const vW = (w - pen) / pf;            // park-neutral Value wOBA
  const lgPen = leaguePen(g, true); // league-average penalty in wOBA points
  const lgV = g.woba - lgPen;
  const out = {};
  const bat = ((vW - lgV) / g.scale) * pa;
  const bsr = n(extras.bsr), frv = n(extras.frv);
  const posAdj = extras.pos ? (POS_ADJ_600[extras.pos] ?? 0) * (pa / 600) : 0;
  out.valuePlus = Math.round((((vW - lgV) / g.scale + g.rPA) / g.rPA) * 100);
  out.vRAA = bat + bsr + frv + posAdj;
  out.vWAR = (out.vRAA + REPL_RUNS_600 * (pa / 600)) / g.rW;
  if (extras.xwoba != null) {
    const eW = extras.xwoba - pen;          // no park factor
    const eBat = ((eW - lgV) / g.scale) * pa;
    const dhRuns = n(extras.dhPA) * n(extras.dhFrvPerPA);
    const bsrE = extras.bsrSpeed != null ? n(extras.bsrSpeed) : bsr;
    out.expectedPlus = Math.round((((eW - lgV) / g.scale + g.rPA) / g.rPA) * 100);
    out.eRAA = eBat + bsrE + frv + dhRuns; // raw Savant FRV, no positional adj
    out.eWAR = (out.eRAA + REPL_RUNS_600 * (pa / 600)) / g.rW;
    out.eRAA_speed = extras.bsrSpeed != null ? eBat + n(extras.bsrSpeed) + frv + dhRuns : null;
  }
  return out;
}

/** Pitcher Value (wOBA allowed + park) / Expected (xwOBA allowed, no park). K penalty only. */
export function pitcherValueExpected(l, season, extras = {}) {
  const g = guts(season);
  const tbf = n(l.TBF) || n(l.PA);
  const ip = n(l.IP);
  const w = extras.woba ?? woba(l, season);
  if (!tbf || w == null) return {};
  // A strikeout is *better* for the pitcher than an ordinary out, so credit it.
  const pen = penaltyWoba(l, g, false);
  const lgPen = leaguePen(g, false);
  const lgV = g.woba - lgPen;
  const pf = extras.pf || 1;
  const vW = (w - pen) / pf;
  const out = {};
  const repl = replPer9(l) * (ip / 9);
  out.valuePlus = Math.round((((vW - lgV) / g.scale + g.rPA) / g.rPA) * 100); // lower is better
  out.vRAA = ((lgV - vW) / g.scale) * tbf;
  out.vWAR = out.vRAA / g.rW + repl;
  if (extras.xwoba != null) {
    const eW = extras.xwoba - pen;
    out.expectedPlus = Math.round((((eW - lgV) / g.scale + g.rPA) / g.rPA) * 100);
    out.eRAA = ((lgV - eW) / g.scale) * tbf;
    out.eWAR = out.eRAA / g.rW + repl;
  }
  return out;
}

/** Derive every rate stat we show from a line (hitter or pitcher perspective). */
export function deriveHitting(l, season, pf = 1) {
  const s = slash(l);
  const w = l.wOBA ?? woba(l, season);
  const pa = n(l.PA);
  return {
    ...l, ...s,
    wOBA: w,
    wRCplus: wrcPlus(w, season, pf),
    wRAA: wraa(w, pa, season),
    'K%': pa ? n(l.SO) / pa : null,
    'BB%': pa ? n(l.BB) / pa : null,
    'xwOBA-wOBA': l.xwOBA != null && w != null ? l.xwOBA - w : null,
    xwRCplus: l.xwOBA != null ? wrcPlus(l.xwOBA, season, 1) : null,
  };
}

/** xERA-style: runs implied by xwOBA allowed, on the ERA scale. */
function xeraFrom(xw, tbf, ip, season) {
  const g = guts(season);
  const lgRA9 = g.lgERA * g.raPerEra;
  const ra9 = lgRA9 + (((xw - g.woba) / g.scale) * tbf * 9) / ip;
  return ra9 / g.raPerEra;
}

export function derivePitching(l, season, pf = 1) {
  const ip = n(l.IP), tbf = n(l.TBF) || n(l.PA);
  const w = l.wOBA ?? woba(l, season);
  return {
    ...l,
    ERA: ip ? (9 * n(l.ER)) / ip : null,
    WHIP: ip ? (n(l.BB) + n(l.H)) / ip : null,
    FIP: fip(l, season),
    'K%': tbf ? n(l.SO) / tbf : null,
    'BB%': tbf ? n(l.BB) / tbf : null,
    'K-BB%': tbf ? (n(l.SO) - n(l.BB)) / tbf : null,
    K9: ip ? (9 * n(l.SO)) / ip : null,
    BB9: ip ? (9 * n(l.BB)) / ip : null,
    HR9: ip ? (9 * n(l.HR)) / ip : null,
    wOBA: w,
    wRCplusAllowed: wrcPlus(w, season, pf),
    xwRCplusAllowed: l.xwOBA != null ? wrcPlus(l.xwOBA, season, 1) : null,
    xFIP: l.FBn != null && ip ? (13 * l.FBn * (guts(season).lgHRFB ?? 0.12) + 3 * (n(l.BB) + n(l.HBP)) - 2 * n(l.SO)) / ip + guts(season).cFIP : null,
    xERA: l.xwOBA != null && ip && tbf ? xeraFrom(l.xwOBA, tbf, ip, season) : null,
    WAR_FIP: l.WAR_FIP ?? pitcherWarFIP(l, season, pf),
    WAR_wOBA: pitcherWarWOBA(l, season, pf, w),
  };
}
