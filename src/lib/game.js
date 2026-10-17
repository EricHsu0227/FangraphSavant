// Turn an MLB live feed into per-player game lines (for game wOBA / wRC+ and
// wRC+ allowed), WPA totals, and an approximate game xwOBA from EV/LA.
import { loadJSON } from './data.js';

const EV = {
  single: { '1B': 1, H: 1, AB: 1 }, double: { '2B': 1, H: 1, AB: 1 }, triple: { '3B': 1, H: 1, AB: 1 },
  home_run: { HR: 1, H: 1, AB: 1 }, walk: { BB: 1 }, intent_walk: { BB: 1, IBB: 1 }, hit_by_pitch: { HBP: 1 },
  strikeout: { SO: 1, AB: 1 }, strikeout_double_play: { SO: 1, AB: 1 }, strikeout_triple_play: { SO: 1, AB: 1 },
  sac_fly: { SF: 1 }, sac_fly_double_play: { SF: 1 }, sac_bunt: { SH: 1 }, sac_bunt_double_play: { SH: 1 },
  grounded_into_double_play: { AB: 1, GIDP: 1 }, catcher_interf: {},
};
const isBIP = (ev) => !['walk', 'intent_walk', 'hit_by_pitch', 'strikeout', 'strikeout_double_play', 'strikeout_triple_play', 'catcher_interf', 'sac_bunt'].includes(ev);

export function playEventLine(eventType) {
  if (!eventType) return null;
  const base = EV[eventType] || { AB: 1 }; // field_out, force_out, fielders_choice, field_error, double_play...
  return { PA: 1, ...base };
}

let grid = null;
export async function loadXwobaGrid() {
  if (grid === null) grid = (await loadJSON('xwoba_grid.json')) || false;
  return grid;
}
/** grid: { evMin, evStep, laMin, laStep, cells: [[...]] } built by the pipeline from Statcast. */
export function xwobaFor(g, ev, la) {
  if (!g || ev == null || la == null) return null;
  const i = Math.floor((ev - g.evMin) / g.evStep);
  const j = Math.floor((la - g.laMin) / g.laStep);
  const row = g.cells[Math.max(0, Math.min(g.cells.length - 1, i))];
  return row ? row[Math.max(0, Math.min(row.length - 1, j))] : null;
}

/** Aggregate plays -> { bat: {id: line}, pit: {id: line} } including xwOBA numerator. */
export function linesFromPlays(plays, wp, g, gutsRow) {
  const bat = {}, pit = {};
  const wpaByIdx = {};
  for (const w of wp || []) wpaByIdx[w.atBatIndex] = w.homeTeamWinProbabilityAdded;
  const add = (map, id, l) => {
    const t = (map[id] ||= { PA: 0, AB: 0, H: 0, '1B': 0, '2B': 0, '3B': 0, HR: 0, BB: 0, IBB: 0, HBP: 0, SO: 0, SF: 0, SH: 0, GIDP: 0, xNum: 0, xDen: 0, WPA: 0 });
    for (const k of Object.keys(l)) t[k] = (t[k] || 0) + l[k];
  };
  for (const p of plays || []) {
    if (!p.about?.isComplete) continue;
    const et = p.result?.eventType;
    const l = playEventLine(et);
    if (!l) continue;
    const b = p.matchup.batter.id, pi = p.matchup.pitcher.id;
    const isTop = p.about.isTopInning;
    const wpa = (wpaByIdx[p.atBatIndex] ?? 0) / 100;
    // xwOBA contribution: actual wOBA weight for BB/HBP/K; grid value for balls in play
    const x = { xNum: 0, xDen: 0 };
    if (gutsRow && et !== 'intent_walk' && et !== 'sac_bunt' && et !== 'catcher_interf') {
      x.xDen = 1;
      if (et === 'walk') x.xNum = gutsRow.wBB;
      else if (et === 'hit_by_pitch') x.xNum = gutsRow.wHBP;
      else if (isBIP(et)) {
        const hd = p.playEvents?.slice().reverse().find((e) => e.hitData)?.hitData;
        const xv = xwobaFor(g, hd?.launchSpeed, hd?.launchAngle);
        if (xv != null) x.xNum = xv; else { x.xDen = 0; }
      }
    }
    add(bat, b, { ...l, ...x, WPA: isTop ? -wpa : wpa });
    add(pit, pi, { ...l, ...x, WPA: isTop ? wpa : -wpa });
  }
  for (const m of [bat, pit]) for (const id of Object.keys(m)) {
    const t = m[id];
    t.xwOBA = t.xDen > 0 && t.xDen >= (t.PA - t.IBB - t.SH) * 0.8 ? t.xNum / t.xDen : null;
  }
  return { bat, pit };
}

export const halfLabel = (p) => `${p.about.isTopInning ? 'Top' : 'Bottom'} ${ordinal(p.about.inning)}`;
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
