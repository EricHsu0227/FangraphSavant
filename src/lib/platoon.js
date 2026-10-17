// Platoon-specific models: regressed splits, matchup projection, Marcel-style
// projections by split, lineup optimizer and similarity scores.
import { guts } from './guts.js';

const n = (v) => (Number.isFinite(+v) ? +v : 0);

// ---------------------------------------------------------------------------
// Regressed platoon splits (Tango/Lichtman/Dolphin, "The Book" ch. 6).
// A hitter's observed platoon split is mostly noise until thousands of PA;
// regress his split (vs-opposite minus vs-same wOBA) toward the league split
// for his handedness, weighted by PA against the *minority* side.
// ---------------------------------------------------------------------------
export const PLATOON = {
  // league-average platoon split in wOBA points and regression constant (PA vs minority hand)
  batter: { L: { lg: 0.028, k: 1000 }, R: { lg: 0.020, k: 2200 }, S: { lg: 0.006, k: 2200 } },
  // pitchers: split = wOBA allowed vs opposite-hand batters minus same-hand
  pitcher: { L: { lg: 0.027, k: 800 }, R: { lg: 0.021, k: 1400 } },
};

/**
 * @param {object} p  { vL: {PA, wOBA, xwOBA}, vR: {...} }  (vL = vs left-handed opponents)
 * @param {'batter'|'pitcher'} role
 * @param {'L'|'R'|'S'} hand  batter's bat side or pitcher's throwing hand
 * @returns {{ vL, vR, obsSplit, regSplit, weight }} regressed vL / vR for wOBA and xwOBA
 */
export function regressSplits(p, role, hand) {
  const cfg = (PLATOON[role] || {})[hand] || { lg: 0.02, k: 2000 };
  const L = p.vL || {}, R = p.vR || {};
  const paL = n(L.PA || L.TBF), paR = n(R.PA || R.TBF);
  const tot = paL + paR;
  if (!tot) return null;
  // "opposite" side = platoon advantage side for batters, disadvantage for pitchers
  const oppIsR = hand === 'L' || (hand === 'S' && paR >= paL);
  const out = { weight: 0, metrics: {} };
  for (const m of ['wOBA', 'xwOBA']) {
    const wL = L[m], wR = R[m];
    if (wL == null || wR == null) continue;
    const overall = (wL * paL + wR * paR) / tot;
    let obs, sOpp, sSame, minor;
    if (role === 'batter') {
      obs = oppIsR ? wR - wL : wL - wR;            // positive = better vs opposite hand
      [sOpp, sSame] = oppIsR ? [paR / tot, paL / tot] : [paL / tot, paR / tot];
      minor = Math.min(paL, paR);
    } else {
      // pitcher: allowed vs opposite-hand batters minus vs same-hand (positive = normal platoon)
      const oppB = hand === 'L' ? 'R' : 'L';
      obs = oppB === 'R' ? wR - wL : wL - wR;
      [sOpp, sSame] = oppB === 'R' ? [paR / tot, paL / tot] : [paL / tot, paR / tot];
      minor = Math.min(paL, paR);
    }
    const reg = (obs * minor + cfg.lg * cfg.k) / (minor + cfg.k);
    const vsOpp = overall + reg * sSame;
    const vsSame = overall - reg * sOpp;
    const oppKey = role === 'batter' ? (oppIsR ? 'vR' : 'vL') : (hand === 'L' ? 'vR' : 'vL');
    const sameKey = oppKey === 'vR' ? 'vL' : 'vR';
    out.metrics[m] = { overall, obs, reg, [oppKey]: vsOpp, [sameKey]: vsSame };
    out.weight = minor / (minor + cfg.k);
  }
  out.cfg = cfg;
  return out;
}

// ---------------------------------------------------------------------------
// Matchup model: batter (vs pitcher's hand) x pitcher (vs batter's hand).
// Component odds-ratio (log5) on K, BB+HBP and HR per PA, additive on
// xwOBA on contact, then a pitch-mix adjustment from run values by pitch group.
// ---------------------------------------------------------------------------
const STAB = { K: 60, BB: 120, HR: 170, CON: 250 };   // Carleton-style stabilization points
const reg = (rate, pa, prior, k) => (rate * pa + prior * k) / (pa + k);
const odds = (p) => p / (1 - p);
const fromOdds = (o) => o / (1 + o);
const log5 = (b, p, lg) => fromOdds((odds(b) * odds(p)) / odds(lg));

function comps(line, lg) {
  const pa = n(line.PA || line.TBF);
  const bb = n(line.BB) - n(line.IBB) + n(line.HBP);
  const bip = pa - n(line.SO) - bb - n(line.HR);
  return {
    pa,
    K: reg(pa ? n(line.SO) / pa : lg.K, pa, lg.K, STAB.K),
    BB: reg(pa ? bb / pa : lg.BB, pa, lg.BB, STAB.BB),
    HR: reg(pa ? n(line.HR) / pa : lg.HR, pa, lg.HR, STAB.HR),
    CON: reg(line.xwOBAcon ?? line.wOBAcon ?? lg.CON, Math.max(0, bip), lg.CON, STAB.CON),
  };
}

export function leagueComps(lgLine) {
  const pa = n(lgLine?.PA) || 1;
  const bb = n(lgLine?.BB) - n(lgLine?.IBB) + n(lgLine?.HBP);
  return {
    K: lgLine ? n(lgLine.SO) / pa : 0.225, BB: lgLine ? bb / pa : 0.085, HR: lgLine ? n(lgLine.HR) / pa : 0.031,
    CON: lgLine?.xwOBAcon ?? 0.37,
  };
}

/**
 * @param bat  batter split line vs this pitcher's hand  (counting + xwOBAcon)
 * @param pit  pitcher split line vs this batter's hand
 * @param lg   league components (leagueComps)
 * @param mix  optional { batGroups, pitGroups } — run value per 100 by FB/BR/OS
 */
export function projectMatchup(bat, pit, lg, season, mix) {
  const g = guts(season);
  const b = comps(bat, lg), p = comps(pit, lg);
  const K = log5(b.K, p.K, lg.K);
  const BB = log5(b.BB, p.BB, lg.BB);
  const HR = log5(b.HR, p.HR, lg.HR);
  const CON = b.CON + p.CON - lg.CON;
  // non-HR contact: approximate wOBA of the HR-removed contact from xwOBAcon
  const bipShare = Math.max(0.01, 1 - K - BB - HR);
  const conNoHR = Math.max(0.1, (CON * (bipShare + HR) - g.wHR * HR) / bipShare);
  let woba = BB * ((g.wBB + g.wHBP) / 2) + HR * g.wHR + bipShare * conNoHR;
  let mixAdj = null;
  if (mix?.batGroups && mix?.pitGroups) {
    let edge = 0, used = 0;
    for (const grp of ['FB', 'BR', 'OS']) {
      const pg = mix.pitGroups[grp], bg = mix.batGroups[grp];
      if (!pg?.use) continue;
      // batter's run value per 100 vs this pitch group, regressed toward 0 with 300 pitches
      const brv = bg ? (n(bg.rv100) * n(bg.n)) / (n(bg.n) + 300) : 0;
      edge += pg.use * brv; used += pg.use;
    }
    // compare with the batter's results against his usual mix (≈ his overall RV, regressed)
    let base = 0, bu = 0;
    for (const grp of ['FB', 'BR', 'OS']) {
      const bg = mix.batGroups[grp];
      if (!bg) continue;
      base += n(bg.use) * (n(bg.rv100) * n(bg.n)) / (n(bg.n) + 300); bu += n(bg.use);
    }
    const delta100 = (used ? edge / used : 0) - (bu ? base / bu : 0);   // runs per 100 pitches
    const perPA = (delta100 / 100) * 3.9;                               // ~3.9 pitches per PA
    mixAdj = { delta100, wOBA: perPA * g.scale };
    woba += mixAdj.wOBA;
  }
  return {
    K, BB, HR, CON, woba, mixAdj,
    batter: b, pitcher: p,
    wrcPlus: Math.round((((woba - g.woba) / g.scale + g.rPA) / g.rPA) * 100),
  };
}

// ---------------------------------------------------------------------------
// Marcel-style projection by split: 5/4/3 season weights, regress to league
// with 1200 PA of league average, then age adjustment. Applied to all, vL, vR.
// ---------------------------------------------------------------------------
export function marcel(seasons, metric = 'wOBA', split = 'all', lgByYear = {}, age) {
  const recent = [...seasons].sort((a, b) => b.season - a.season).slice(0, 3);
  if (!recent.length) return null;
  const wts = [5, 4, 3];
  let num = 0, den = 0, paw = 0, lgNum = 0;
  recent.forEach((s, i) => {
    const l = s.splits?.[split];
    if (!l || l[metric] == null) return;
    const pa = n(l.PA || l.TBF);
    num += wts[i] * pa * l[metric];
    den += wts[i] * pa;
    paw += pa;
    lgNum += wts[i] * pa * (lgByYear[s.season] ?? 0.315);
  });
  if (!den) return null;
  const lg = lgNum / den;
  const obs = num / den;                                  // 5/4/3-weighted rate
  const k = split === 'all' ? 1200 : 800;                 // PA of league average added
  const r = (obs * paw + lg * k) / (paw + k);
  let adj = 0;
  if (age != null) adj = age < 29 ? (29 - age) * 0.0012 : -(age - 29) * 0.0018;
  return { value: r + adj, reliability: paw / (paw + k), basePA: paw };
}

// ---------------------------------------------------------------------------
// Lineup optimizer (The Book's batting-order values): best hitters in 1, 2, 4;
// next best in 3, 5; descending 6-9. Uses projected wOBA vs the starter's hand.
// ---------------------------------------------------------------------------
export function optimizeLineup(players, key) {
  const sorted = [...players].filter((p) => p[key] != null).sort((a, b) => b[key] - a[key]).slice(0, 9);
  if (sorted.length < 9) return sorted;
  // slots ranked by importance: 1, 2, 4 (top 3 bats; best OBP-type to 1), then 3, 5, then 6..9
  const [a, b, c, d, e, ...rest] = sorted;
  const top3 = [a, b, c].sort((x, y) => (y.obp ?? 0) - (x.obp ?? 0));
  const order = [top3[0], top3[1], d, top3[2], e, ...rest];
  return order;
}

/** Expected runs/game for a lineup from its average wOBA (linear around league). */
export function lineupRuns(lineup, key, season) {
  const g = guts(season);
  const w = lineup.reduce((s, p) => s + (p[key] || 0), 0) / (lineup.length || 1);
  const runsPA = (w - g.woba) / g.scale + g.rPA;
  return runsPA * 38.5;   // ~38.5 PA per team-game
}

// ---------------------------------------------------------------------------
// Similarity: z-score distance on a Statcast profile.
// ---------------------------------------------------------------------------
export function similar(rows, id, keys, split = 'all', minPA = 150, k = 10) {
  const pool = rows.filter((r) => n(r.splits?.[split]?.PA || r.splits?.[split]?.TBF) >= minPA);
  const me = rows.find((r) => r.id === id)?.splits?.[split];
  if (!me) return [];
  const stats = {};
  for (const key of keys) {
    const v = pool.map((r) => r.splits[split][key]).filter((x) => typeof x === 'number');
    if (v.length < 10 || typeof me[key] !== 'number') continue;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) || 1;
    stats[key] = { mean, sd };
  }
  const ks = Object.keys(stats);
  if (!ks.length) return [];
  return pool.filter((r) => r.id !== id).map((r) => {
    let d = 0, c = 0;
    for (const key of ks) {
      const v = r.splits[split][key];
      if (typeof v !== 'number') continue;
      d += ((v - me[key]) / stats[key].sd) ** 2; c++;
    }
    return { row: r, dist: c ? Math.sqrt(d / c) : Infinity };
  }).sort((a, b) => a.dist - b.dist).slice(0, k)
    .map((x) => ({ ...x, score: Math.max(0, Math.round(100 - x.dist * 40)) }));
}

/** Share of a team's PA taken with the platoon advantage. */
export function platoonAdvantageShare(hitters) {
  let adv = 0, tot = 0;
  for (const h of hitters) {
    const L = n(h.splits?.vL?.PA), R = n(h.splits?.vR?.PA);
    tot += L + R;
    if (h.bats === 'S') adv += L + R;
    else if (h.bats === 'L') adv += R;
    else if (h.bats === 'R') adv += L;
  }
  return tot ? adv / tot : null;
}
