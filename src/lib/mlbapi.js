// Thin client for the public MLB Stats API (CORS-enabled, called straight from the browser).
const BASE = 'https://statsapi.mlb.com';
const cache = new Map();

export async function api(path, { ttl = 5 * 60_000, live = false } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const hit = cache.get(url);
  if (!live && hit && Date.now() - hit.t < ttl) return hit.v;
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`MLB API ${r.status}: ${path}`);
    return r.json();
  });
  if (!live) cache.set(url, { t: Date.now(), v: p });
  try { return await p; } catch (e) { cache.delete(url); throw e; }
}

export const headshot = (id, w = 120) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${w},q_auto:best/v1/people/${id}/headshot/67/current`;
export const teamLogo = (id) => `https://www.mlbstatic.com/team-logos/${id}.svg`;

export const getSchedule = (date) =>
  api(`/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore,team,probablePitcher,decisions,seriesStatus`, { ttl: 20_000 });

export const getSeasonSchedule = (season, gameTypes = 'R') =>
  api(`/api/v1/schedule?sportId=1&season=${season}&gameType=${gameTypes}&fields=dates,date,games,gamePk,gameDate,officialDate,status,detailedState,abstractGameState,teams,away,home,team,id,score,isWinner,gameType,doubleHeader`, { ttl: 30 * 60_000 });

export const getLiveFeed = (pk) => api(`/api/v1.1/game/${pk}/feed/live`, { live: true });
export const getWinProb = (pk) => api(`/api/v1/game/${pk}/winProbability`, { live: true });
export const getBoxscore = (pk) => api(`/api/v1/game/${pk}/boxscore`, { ttl: 60_000 });

export const getStandings = (season, date) =>
  api(`/api/v1/standings?leagueId=103,104&season=${season}${date ? `&date=${date}` : ''}&standingsTypes=regularSeason&hydrate=team,division,league`);

export const getTeams = (season) => api(`/api/v1/teams?sportId=1&season=${season}&hydrate=division,league,venue`, { ttl: 24 * 3600_000 });

export const getRoster = (teamId, season) =>
  api(`/api/v1/teams/${teamId}/roster?rosterType=fullSeason&season=${season}&hydrate=person`);

export const getTeamPlayerStats = (teamId, season, group, sitCode) =>
  api(`/api/v1/stats?stats=${sitCode ? 'statSplits' : 'season'}${sitCode ? `&sitCodes=${sitCode}` : ''}&group=${group}&season=${season}&teamId=${teamId}&sportId=1&playerPool=All&limit=200`);

export const getLeagueStats = (season, group, sitCode, gameType = 'R') =>
  api(`/api/v1/stats?stats=${sitCode ? 'statSplits' : 'season'}${sitCode ? `&sitCodes=${sitCode}` : ''}&group=${group}&season=${season}&sportId=1&playerPool=All&gameType=${gameType}&limit=3000`, { ttl: 30 * 60_000 });

export const getPerson = (id) =>
  api(`/api/v1/people/${id}?hydrate=currentTeam,draft,stats(group=[hitting,pitching,fielding],type=[yearByYear,career])`);

export const getPersonSplits = (id, season, group) =>
  api(`/api/v1/people/${id}/stats?stats=statSplits&group=${group}&season=${season}&sitCodes=vl,vr,h,a,d,n,risp,ron,r0`);

export const getGameLog = (id, season, group) =>
  api(`/api/v1/people/${id}/stats?stats=gameLog&group=${group}&season=${season}`);

export const getTransactions = (id) => api(`/api/v1/transactions?playerId=${id}`, { ttl: 3600_000 });

export const searchPeople = (q) => api(`/api/v1/people/search?names=${encodeURIComponent(q)}&sportIds=1&active=false&hydrate=currentTeam`, { ttl: 3600_000 });

export const getPostseasonSeries = (season) =>
  api(`/api/v1/schedule/postseason/series?season=${season}&sportId=1&hydrate=team`, { ttl: 10 * 60_000 });

export const getPostseasonGames = (season) =>
  api(`/api/v1/schedule?sportId=1&season=${season}&gameType=F,D,L,W&hydrate=team,linescore,seriesStatus`, { ttl: 10 * 60_000 });

/** Flatten MLB `stats[].splits[]` to [{player, team, stat}] */
export function splitsOf(resp) {
  return (resp?.stats?.[0]?.splits || []);
}

// MLB's "official date" follows US Eastern time, not the viewer's (Taipei) clock.
export const today = () =>
  fmtDate(new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })));
export function fmtDate(d) {
  const z = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function shiftDate(s, days) {
  const [y, m, d] = s.split('-').map(Number);
  return fmtDate(new Date(y, m - 1, d + days));
}
