import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadSeries } from '../lib/postseason.js';
import { teamLogo } from '../lib/mlbapi.js';
import { loadPostseasonStatcast } from '../lib/data.js';
import { aggregateGames } from '../lib/playsAgg.js';
import { deriveHitting, derivePitching } from '../lib/stats.js';
import { fmt } from '../lib/catalog.js';
import { teamById, seriesName } from '../lib/teams.js';
import { useAsync, Loading, Err, PlayerLink, Seg } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import TopPlays from '../components/TopPlays.jsx';
import { SeriesCard } from './Postseason.jsx';

/** Aggregate every game of a series from live feeds: lines, WPA, names, sides, top plays. */
const seriesLines = (s, season) => aggregateGames(s.games.filter((x) => x.status.abstractGameState !== 'Preview'), season);

export default function Series() {
  const { season: sp, type, key } = useParams();
  const season = Number(sp);
  const all = useAsync(() => loadSeries(season), [season]);
  if (all.loading) return <Loading what="series" />;
  if (all.error) return <Err e={all.error} />;
  let matches = (all.data || []).filter((s) => s.type === type);
  if (key && key !== '-') {
    if (key === 'AL' || key === 'NL') matches = matches.filter((s) => s.lg === key);
    else { const ids = key.split('-').map(Number).sort((a, b) => a - b).join('-'); matches = matches.filter((s) => s.teams.join('-') === ids); }
  }
  if (!matches.length) return <div className="loading">No matching series found for {season}.</div>;
  if (matches.length > 1) {
    return (
      <>
        <h1>{season} {seriesName(type, key !== '-' ? key : '')}</h1>
        <div className="grid g3">{matches.map((s) => <SeriesCard key={s.key} s={s} season={season} />)}</div>
      </>
    );
  }
  return <SeriesDetail s={matches[0]} season={season} />;
}

function SeriesDetail({ s, season }) {
  const [side, setSide] = useState('both');
  const lines = useAsync(() => seriesLines(s, season), [s.key]);
  const sc = useAsync(() => loadPostseasonStatcast(season), [season]);
  const scSeries = sc.data?.[s.key] || {};
  const [a, b] = s.teamsOrdered;
  const title = s.type === 'W' ? 'World Series' : seriesName(s.type, s.lg);

  const mk = (map, group) => Object.entries(map || {}).map(([id, l]) => {
    const inf = lines.data.info[id] || {};
    const d = group === 'hitting' ? deriveHitting(l, season) : derivePitching({ ...l, TBF: l.PA }, season);
    const extra = scSeries[group === 'hitting' ? 'batters' : 'pitchers']?.[id] || {};
    return { ...d, ...extra, xwOBA: extra.xwOBA ?? l.xwOBA, id: Number(id), _key: id, name: inf.name, team: inf.team, WPA: l.WPA };
  }).filter((r) => side === 'both' || String(r.team) === side);

  return (
    <>
      <div className="row">
        <img src={teamLogo(a)} width="44" height="44" alt="" />
        <h1 style={{ margin: 0 }}>{season} {title}: {teamById[a]?.short} {s.wins[a]}, {teamById[b]?.short} {s.wins[b]}</h1>
        <img src={teamLogo(b)} width="44" height="44" alt="" />
      </div>
      {s.winner && <div className="muted">{teamById[s.winner]?.name} win the series.</div>}
      <h2>Games</h2>
      <div className="games">
        {s.games.map((g, i) => (
          <Link key={g.gamePk} to={`/game/${g.gamePk}`} className="game-card">
            <div className="small muted">Game {i + 1} · {g.date} · {g.venue?.name || ''}</div>
            {['away', 'home'].map((x) => (
              <div key={x} className={`tm ${g.status.abstractGameState === 'Final' && !g.teams[x].isWinner ? 'lost' : ''}`}>
                <img src={teamLogo(g.teams[x].team.id)} alt="" />{teamById[g.teams[x].team.id]?.short}<span className="sc">{g.teams[x].score ?? ''}</span>
              </div>
            ))}
            <div className="st"><span>{g.status.detailedState}</span></div>
          </Link>
        ))}
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0 }}>Series stats</h2>
        <Seg value={side} onChange={setSide} options={[{ value: 'both', label: 'Both' }, { value: String(a), label: teamById[a]?.abbr }, { value: String(b), label: teamById[b]?.abbr }]} />
      </div>
      {lines.loading && <Loading what="series stats" />}
      {lines.error && <Err e={lines.error} />}
      {lines.data && (
        <>
          <h3>Batting</h3>
          <DataTable rows={mk(lines.data.bat, 'hitting')} defaultSort={{ key: 'WPA', dir: 'desc' }} heat cols={[
            { key: 'name', label: 'Batter', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
            { key: 'team', label: 'Tm', left: true, get: (r) => teamById[r.team]?.abbr },
            { key: 'PA', label: 'PA' }, { key: 'H', label: 'H' }, { key: 'HR', label: 'HR' }, { key: 'BB', label: 'BB' }, { key: 'SO', label: 'K', hb: false },
            { key: 'AVG', label: 'AVG', f: fmt.r3 }, { key: 'OBP', label: 'OBP', f: fmt.r3 }, { key: 'SLG', label: 'SLG', f: fmt.r3 },
            { key: 'wOBA', label: 'wOBA', f: fmt.r3, hb: true }, { key: 'xwOBA', label: 'xwOBA', f: fmt.r3, hb: true },
            { key: 'wRCplus', label: 'wRC+', hb: true }, { key: 'EV', label: 'EV', f: fmt.r1, hb: true }, { key: 'maxEV', label: 'Max EV', f: fmt.r1, hb: true },
            { key: 'WPA', label: 'WPA', f: (v) => (v == null ? '' : v.toFixed(2)), hb: true },
          ]} />
          <h3>Pitching</h3>
          <DataTable rows={mk(lines.data.pit, 'pitching')} defaultSort={{ key: 'WPA', dir: 'desc' }} heat cols={[
            { key: 'name', label: 'Pitcher', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
            { key: 'team', label: 'Tm', left: true, get: (r) => teamById[r.team]?.abbr },
            { key: 'PA', label: 'TBF' }, { key: 'H', label: 'H', hb: false }, { key: 'HR', label: 'HR', hb: false }, { key: 'BB', label: 'BB', hb: false }, { key: 'SO', label: 'K', hb: true },
            { key: 'K%', label: 'K%', f: fmt.pct, hb: true },
            { key: 'wOBA', label: 'wOBA a', f: fmt.r3, hb: false }, { key: 'xwOBA', label: 'xwOBA a', f: fmt.r3, hb: false },
            { key: 'wRCplusAllowed', label: 'wRC+ a', hb: false }, { key: 'Whiff%', label: 'Whiff%', f: fmt.pct, hb: true },
            { key: 'WPA', label: 'WPA', f: (v) => (v == null ? '' : v.toFixed(2)), hb: true },
          ]} />
          <h2>Top plays</h2>
          <TopPlays top={lines.data.top} />
        </>
      )}
    </>
  );
}
