import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { loadSeries } from '../lib/postseason.js';
import { teamLogo, today } from '../lib/mlbapi.js';
import { aggregateGames } from '../lib/playsAgg.js';
import { deriveHitting, derivePitching } from '../lib/stats.js';
import { teamById, seriesName } from '../lib/teams.js';
import { fmt } from '../lib/catalog.js';
import { SEASONS } from '../lib/guts.js';
import { useAsync, Loading, Err, SeasonSelect, PlayerLink } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import TopPlays from '../components/TopPlays.jsx';

export function SeriesCard({ s, season }) {
  return (
    <Link to={`/series/${season}/${s.type}/${s.teams.join('-')}`} className="series-card">
      {s.teamsOrdered.map((t) => (
        <div key={t} className={`s-tm ${s.winner === t ? 'w' : ''}`} style={s.winner && s.winner !== t ? { opacity: 0.55 } : undefined}>
          <img src={teamLogo(t)} alt="" /><span>{teamById[t]?.short || t}</span><span className="w-ct">{s.wins[t]}</span>
        </div>
      ))}
    </Link>
  );
}

export default function Postseason() {
  const { season: sParam } = useParams();
  const t = today();
  const latest = Number(t.slice(0, 4)) - (t.slice(5) < '09-30' ? 1 : 0);
  const season = Number(sParam) || latest;
  const nav = useNavigate();
  const [tab, setTab] = useState('bracket');
  const data = useAsync(() => loadSeries(season), [season]);
  const col = (lg, type) => (data.data || []).filter((s) => s.type === type && (type === 'W' || s.lg === lg));
  const rounds = [['AL', 'F'], ['AL', 'D'], ['AL', 'L'], [null, 'W'], ['NL', 'L'], ['NL', 'D'], ['NL', 'F']];
  const champ = data.data?.find((s) => s.type === 'W' && s.winner)?.winner;
  return (
    <>
      <div className="row spread">
        <h1>{season} Postseason</h1>
        <SeasonSelect value={season} onChange={(s) => nav(`/postseason/${s}`)} seasons={SEASONS.filter((s) => s <= latest)} />
      </div>
      {champ && <div className="row" style={{ gap: 8, marginBottom: 6 }}><img src={teamLogo(champ)} width="28" height="28" alt="" /><b>{teamById[champ]?.name}</b><span className="muted">won the World Series</span></div>}
      <div className="tabs">
        {[['bracket', 'Bracket'], ['leaders', 'Leaders'], ['plays', 'Top plays'], ['history', 'Series list']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {data.loading && <Loading what="bracket" />}
      {data.error && <Err e={data.error} />}
      {data.data && data.data.length === 0 && <div className="empty">No postseason games for {season} yet.</div>}
      {tab === 'bracket' && data.data?.length > 0 && (
        <>
          <div className="bracket">
            {rounds.map(([lg, type]) => {
              const list = col(lg, type);
              if (!list.length) return null;
              return (
                <div className="round" key={`${lg}-${type}`}>
                  <h4>{type === 'W' ? 'World Series' : seriesName(type, lg)}</h4>
                  {list.map((s) => <SeriesCard key={s.key} s={s} season={season} />)}
                </div>
              );
            })}
          </div>
          <p className="muted small">Open a series for its games, box scores, and series leaders with wOBA, xwOBA, wRC+ and WPA.</p>
        </>
      )}
      {(tab === 'leaders' || tab === 'plays') && data.data?.length > 0 && <AllGames series={data.data} season={season} tab={tab} />}
      {tab === 'history' && data.data?.length > 0 && (
        <DataTable rows={data.data.map((s) => ({ _key: s.key, s, round: s.type === 'W' ? 'World Series' : seriesName(s.type, s.lg), order: 'FDLW'.indexOf(s.type) }))}
          defaultSort={{ key: 'order', dir: 'asc' }} cols={[
            { key: 'round', label: 'Round', left: true, render: (r) => <Link to={`/series/${season}/${r.s.type}/${r.s.teams.join('-')}`}>{r.round}</Link> },
            { key: 'w', label: 'Winner', left: true, get: (r) => teamById[r.s.winner]?.short || '—' },
            { key: 'res', label: 'Result', left: true, get: (r) => r.s.teamsOrdered.map((t) => `${teamById[t]?.abbr} ${r.s.wins[t]}`).join(' – ') },
            { key: 'g', label: 'Games', get: (r) => r.s.games.length },
          ]} />
      )}
    </>
  );
}

function AllGames({ series, season, tab }) {
  const [prog, setProg] = useState(null);
  const games = useMemo(() => series.flatMap((s) => s.games).filter((g) => g.status.abstractGameState !== 'Preview'), [series]);
  const agg = useAsync(() => aggregateGames(games, season, (d, n) => setProg(`${d}/${n}`)), [season, games.length]);
  if (agg.loading) return <Loading what={`every postseason game (${prog || '0'})`} />;
  if (agg.error) return <Err e={agg.error} />;
  if (tab === 'plays') return <TopPlays top={agg.data.top} />;
  const mk = (map, group) => Object.entries(map).map(([id, l]) => {
    const inf = agg.data.info[id] || {};
    const d = group === 'hitting' ? deriveHitting(l, season) : derivePitching({ ...l, TBF: l.PA }, season);
    return { ...d, xwOBA: l.xwOBA, id: Number(id), _key: id, name: inf.name, team: inf.team, WPA: l.WPA };
  });
  return (
    <>
      <h3>Batting</h3>
      <DataTable rows={mk(agg.data.bat, 'hitting').filter((r) => r.PA >= 5)} defaultSort={{ key: 'WPA', dir: 'desc' }} heat rank limit={50} cols={[
        { key: 'name', label: 'Batter', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
        { key: 'team', label: 'Tm', left: true, get: (r) => teamById[r.team]?.abbr },
        { key: 'PA', label: 'PA' }, { key: 'H', label: 'H' }, { key: 'HR', label: 'HR', hb: true }, { key: 'BB', label: 'BB' }, { key: 'SO', label: 'K', hb: false },
        { key: 'AVG', label: 'AVG', f: fmt.r3 }, { key: 'OBP', label: 'OBP', f: fmt.r3 }, { key: 'SLG', label: 'SLG', f: fmt.r3 },
        { key: 'wOBA', label: 'wOBA', f: fmt.r3, hb: true }, { key: 'xwOBA', label: 'xwOBA', f: fmt.r3, hb: true }, { key: 'wRCplus', label: 'wRC+', hb: true },
        { key: 'WPA', label: 'WPA', f: (v) => (v == null ? '' : v.toFixed(2)), hb: true },
      ]} />
      <h3>Pitching</h3>
      <DataTable rows={mk(agg.data.pit, 'pitching').filter((r) => r.PA >= 5)} defaultSort={{ key: 'WPA', dir: 'desc' }} heat rank limit={50} cols={[
        { key: 'name', label: 'Pitcher', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
        { key: 'team', label: 'Tm', left: true, get: (r) => teamById[r.team]?.abbr },
        { key: 'PA', label: 'TBF' }, { key: 'SO', label: 'K', hb: true }, { key: 'BB', label: 'BB', hb: false }, { key: 'HR', label: 'HR', hb: false },
        { key: 'K%', label: 'K%', f: fmt.pct, hb: true }, { key: 'BB%', label: 'BB%', f: fmt.pct, hb: false },
        { key: 'wOBA', label: 'wOBA a', f: fmt.r3, hb: false }, { key: 'xwOBA', label: 'xwOBA a', f: fmt.r3, hb: false }, { key: 'wRCplusAllowed', label: 'wRC+ a', hb: false },
        { key: 'WPA', label: 'WPA', f: (v) => (v == null ? '' : v.toFixed(2)), hb: true },
      ]} />
    </>
  );
}
