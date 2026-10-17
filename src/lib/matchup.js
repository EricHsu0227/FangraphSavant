// Assembles everything the matchup model needs for batter x pitcher in a season.
import { loadSeason, loadPlayerFile } from './data.js';
import { getVsPlayer, splitsOf } from './mlbapi.js';
import { fromMLB, deriveHitting } from './stats.js';
import { projectMatchup, leagueComps } from './platoon.js';

/** Batter's effective side against a pitcher (switch hitters bat opposite). */
export const sideVs = (bats, throws) => (bats === 'S' ? (throws === 'L' ? 'R' : 'L') : bats);

export async function matchupInputs(season) {
  const [hit, pit] = await Promise.all([loadSeason(season, 'hitting'), loadSeason(season, 'pitching')]);
  return { hit, pit };
}

/** Pure projection from loaded season rows (used for whole lineups in game previews). */
export function projectFromRows({ hit, pit }, batId, pitId, season, files = {}) {
  const b = hit.find((r) => r.id === batId), p = pit.find((r) => r.id === pitId);
  if (!b || !p) return null;
  const throws = p.throws || 'R';
  const side = sideVs(b.bats || 'R', throws);
  const bSplit = throws === 'L' ? 'vL' : 'vR';
  const pSplit = side === 'L' ? 'vL' : 'vR';
  const bl = b.splits?.[bSplit], pl = p.splits?.[pSplit];
  if (!bl || !pl) return null;
  const lg = leagueComps(hit.league?.[bSplit]);
  const bd = files[batId]?.detail?.hitting?.[season], pd = files[pitId]?.detail?.pitching?.[season];
  const mix = bd?.groups?.[bSplit] && pd?.groups?.[pSplit] ? { batGroups: bd.groups[bSplit], pitGroups: pd.groups[pSplit] } : null;
  return { b, p, side, throws, bSplit, pSplit, bl, pl, lg, proj: projectMatchup(bl, pl, lg, season, mix), bd, pd };
}

export async function fullMatchup(batId, pitId, season) {
  const inputs = await matchupInputs(season);
  const [bf, pf, h2h] = await Promise.all([
    loadPlayerFile(batId), loadPlayerFile(pitId),
    getVsPlayer(batId, pitId).catch(() => null),
  ]);
  const res = projectFromRows(inputs, batId, pitId, season, { [batId]: bf, [pitId]: pf });
  let career = null;
  const tot = (h2h?.stats || []).find((s) => s.type?.displayName === 'vsPlayerTotal');
  const sp = tot?.splits?.[0];
  if (sp) career = deriveHitting(fromMLB(sp.stat, 'hitting'), season);
  const bySeason = splitsOf({ stats: (h2h?.stats || []).filter((s) => s.type?.displayName === 'vsPlayer') })
    .map((x) => ({ season: x.season, ...deriveHitting(fromMLB(x.stat, 'hitting'), Number(x.season) || season) }));
  return { ...res, career, bySeason, inputs };
}
