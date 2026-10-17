import { getPostseasonGames } from './mlbapi.js';
import { teamById } from './teams.js';

const bestOf = (type, season) => {
  if (type === 'W' || type === 'L') return 7;
  if (type === 'D') return 5;
  if (type === 'F') return season >= 2020 ? 3 : 1;
  return 7;
};

/** Group postseason games into series: [{ key, type, lg, teams:[id,id], wins:{id:n}, games:[], winner }] */
export async function loadSeries(season) {
  const sch = await getPostseasonGames(season);
  const map = new Map();
  for (const d of sch?.dates || []) {
    for (const g of d.games || []) {
      const a = g.teams.away.team.id, h = g.teams.home.team.id;
      const ids = [a, h].sort((x, y) => x - y);
      const key = `${g.gameType}-${ids.join('-')}`;
      let s = map.get(key);
      if (!s) {
        const lg = g.gameType === 'W' ? null : teamById[a]?.lg;
        s = { key, type: g.gameType, lg, teams: ids, wins: { [ids[0]]: 0, [ids[1]]: 0 }, games: [], higherSeed: h };
        map.set(key, s);
      }
      if (/Postponed|Cancelled/.test(g.status.detailedState) && g.status.abstractGameState !== 'Final') continue;
      s.games.push({ ...g, date: g.officialDate || d.date });
      if (g.status.abstractGameState === 'Final') {
        const w = g.teams.away.isWinner ? a : g.teams.home.isWinner ? h : null;
        if (w) s.wins[w]++;
      }
    }
  }
  const out = [...map.values()];
  for (const s of out) {
    s.games.sort((x, y) => (x.gameDate < y.gameDate ? -1 : 1));
    s.higherSeed = s.games[0]?.teams.home.team.id ?? s.teams[0];
    const need = Math.ceil(bestOf(s.type, season) / 2);
    s.winner = s.teams.find((t) => s.wins[t] >= need) || null;
    s.teamsOrdered = [s.higherSeed, s.teams.find((t) => t !== s.higherSeed)];
  }
  return out;
}

export const ROUND_ORDER = ['F', 'D', 'L', 'W'];
