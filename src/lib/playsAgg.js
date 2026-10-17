// Aggregate live feeds for a set of games: player lines with game xwOBA and WPA,
// plus Savant-postseason-style "top plays" (hardest hit, longest HR, fastest pitch, biggest WPA).
import { getLiveFeed, getWinProb } from './mlbapi.js';
import { linesFromPlays, loadXwobaGrid, halfLabel } from './game.js';
import { addLines } from './stats.js';
import { guts } from './guts.js';

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k).catch(() => null); }
  }));
  return out;
}

export async function aggregateGames(games, season, onProgress) {
  const grid = await loadXwobaGrid();
  const g = guts(season);
  const bat = {}, pit = {}, info = {};
  const hard = [], hrs = [], velo = [], wpaPlays = [];
  let done = 0;
  await pool(games, 6, async (game) => {
    const [feed, wp] = await Promise.all([getLiveFeed(game.gamePk), getWinProb(game.gamePk).catch(() => [])]);
    const res = linesFromPlays(feed.liveData.plays.allPlays, wp, grid, g);
    for (const side of ['away', 'home']) {
      const bt = feed.liveData.boxscore.teams[side];
      for (const p of Object.values(bt.players)) info[p.person.id] = { name: p.person.fullName, team: bt.team.id };
    }
    for (const [id, l] of Object.entries(res.bat)) bat[id] = addLines(bat[id], l);
    for (const [id, l] of Object.entries(res.pit)) pit[id] = addLines(pit[id], l);
    const wpBy = Object.fromEntries((wp || []).map((w) => [w.atBatIndex, w]));
    const date = feed.gameData.datetime?.officialDate;
    for (const p of feed.liveData.plays.allPlays || []) {
      const base = { pk: game.gamePk, date, inn: halfLabel(p), batter: p.matchup.batter, pitcher: p.matchup.pitcher, event: p.result.event, desc: p.result.description };
      const hd = p.playEvents?.slice().reverse().find((e) => e.hitData)?.hitData;
      if (hd?.launchSpeed) hard.push({ ...base, ev: hd.launchSpeed, la: hd.launchAngle, dist: hd.totalDistance });
      if (p.result.eventType === 'home_run' && hd?.totalDistance) hrs.push({ ...base, ev: hd.launchSpeed, la: hd.launchAngle, dist: hd.totalDistance });
      for (const e of p.playEvents || []) if (e.isPitch && e.pitchData?.startSpeed) velo.push({ ...base, velo: e.pitchData.startSpeed, pt: e.details?.type?.code, call: e.details?.description });
      const w = wpBy[p.atBatIndex];
      if (w?.homeTeamWinProbabilityAdded != null) wpaPlays.push({ ...base, wpa: Math.abs(w.homeTeamWinProbabilityAdded), li: w.leverageIndex });
    }
    done++; onProgress?.(done, games.length);
  });
  const top = (a, k, n = 10) => a.sort((x, y) => (y[k] ?? 0) - (x[k] ?? 0)).slice(0, n);
  return { bat, pit, info, top: { hard: top(hard, 'ev'), hrs: top(hrs, 'dist'), velo: top(velo, 'velo'), wpa: top(wpaPlays, 'wpa') } };
}
