import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getSchedule, teamLogo, today, shiftDate } from '../lib/mlbapi.js';
import { Loading, Err, Seg, usePref } from '../components/ui.jsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Scores() {
  const { date: dParam } = useParams();
  const date = dParam || today();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = usePref('scores:filter', 'all');

  useEffect(() => {
    let stop = false, timer;
    const load = async () => {
      try {
        const d = await getSchedule(date);
        if (stop) return;
        setData(d); setErr(null);
        const anyLive = d.dates?.[0]?.games?.some((g) => g.status.abstractGameState === 'Live');
        timer = setTimeout(load, anyLive ? 15_000 : 120_000);
      } catch (e) { if (!stop) setErr(e); }
    };
    setData(null); load();
    return () => { stop = true; clearTimeout(timer); };
  }, [date]);

  let games = data?.dates?.[0]?.games || [];
  const counts = { live: games.filter((g) => g.status.abstractGameState === 'Live').length };
  if (filter === 'live') games = games.filter((g) => g.status.abstractGameState === 'Live');
  if (filter === 'final') games = games.filter((g) => g.status.abstractGameState === 'Final');
  if (filter === 'upcoming') games = games.filter((g) => g.status.abstractGameState === 'Preview');
  const strip = Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 3));
  return (
    <>
      <div className="row spread">
        <h1>Scores</h1>
        <div className="row" style={{ gap: 6 }}>
          <input type="date" value={date} onChange={(e) => e.target.value && nav(`/scores/${e.target.value}`)} aria-label="Date" />
          <button className="btn ghost" onClick={() => nav('/scores')}>Today</button>
        </div>
      </div>
      <div className="date-strip" style={{ marginBottom: 10 }}>
        {strip.map((d) => {
          const [y, m, dd] = d.split('-').map(Number);
          return (
            <Link key={d} to={`/scores/${d}`} className={d === date ? 'on' : ''}>
              <span className="dow">{DOW[new Date(y, m - 1, dd).getDay()]}</span>{m}/{dd}
            </Link>
          );
        })}
      </div>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'live', label: `Live${counts.live ? ` (${counts.live})` : ''}` }, { value: 'final', label: 'Final' }, { value: 'upcoming', label: 'Upcoming' }]} />
      </div>
      {err && <Err e={err} />}
      {!data && !err && <Loading what="games" />}
      {data && games.length === 0 && <div className="empty">No games{filter !== 'all' ? ' in this filter' : ''} on {date}.</div>}
      <div className="games">
        {games.map((g) => <GameCard key={g.gamePk} g={g} />)}
      </div>
    </>
  );
}

function MiniDiamond({ ls }) {
  const on = (b) => (ls?.offense?.[b] ? '#ff6a3d' : 'none');
  return (
    <svg width="34" height="26" viewBox="0 0 34 26" aria-label="Bases">
      <rect x="13" y="2" width="8" height="8" transform="rotate(45 17 6)" fill={on('second')} stroke="currentColor" />
      <rect x="23" y="12" width="8" height="8" transform="rotate(45 27 16)" fill={on('first')} stroke="currentColor" />
      <rect x="3" y="12" width="8" height="8" transform="rotate(45 7 16)" fill={on('third')} stroke="currentColor" />
    </svg>
  );
}

function GameCard({ g }) {
  const nav = useNavigate();
  const st = g.status;
  const live = st.abstractGameState === 'Live';
  const fin = st.abstractGameState === 'Final';
  const pre = st.abstractGameState === 'Preview';
  const ls = g.linescore;
  const open = () => nav(`/game/${g.gamePk}`);
  const stop = (e) => e.stopPropagation();
  const P = ({ p }) => (p ? <Link to={`/player/${p.id}`} onClick={stop}>{p.fullName}</Link> : <span>TBD</span>);
  const side = (s) => {
    const t = g.teams[s];
    return (
      <div className={`tm ${fin && !t.isWinner ? 'lost' : ''}`}>
        <img src={teamLogo(t.team.id)} alt="" />
        <Link to={`/team/${t.team.id}/${g.season || ''}`} onClick={stop} style={{ color: 'inherit' }}>{t.team.teamName || t.team.name}</Link>
        <span className="muted small">{t.leagueRecord ? `${t.leagueRecord.wins}-${t.leagueRecord.losses}` : ''}</span>
        <span className="sc">{pre ? '' : t.score ?? ''}</span>
      </div>
    );
  };
  const time = new Date(g.gameDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="game-card" role="link" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()} style={{ cursor: 'pointer' }}>
      {side('away')}
      {side('home')}
      <div className="st">
        <span>
          {live && <><span className="live-dot" />{ls?.inningState} {ls?.currentInningOrdinal}</>}
          {fin && `${st.detailedState}${ls?.currentInning && ls.currentInning !== 9 ? ` (${ls.currentInning})` : ''}`}
          {pre && (st.detailedState === 'Scheduled' || st.detailedState === 'Pre-Game' ? time : st.detailedState)}
        </span>
        {live && <span className="row" style={{ gap: 6 }}><MiniDiamond ls={ls} /><span className="mono">{ls?.balls ?? 0}-{ls?.strikes ?? 0}, {ls?.outs ?? 0} out</span></span>}
        {g.seriesStatus?.description && g.gameType !== 'R' && <span>{g.seriesStatus.shortDescription || g.seriesStatus.description}</span>}
      </div>
      {pre && <div className="st"><span><P p={g.teams.away.probablePitcher} /> vs <P p={g.teams.home.probablePitcher} /></span></div>}
      {live && ls?.offense?.batter && <div className="st"><span>AB: <P p={ls.offense.batter} /> · P: <P p={ls.defense?.pitcher} /></span></div>}
      {fin && g.decisions && (
        <div className="st"><span>W <P p={g.decisions.winner} /> · L <P p={g.decisions.loser} />{g.decisions.save && <> · SV <P p={g.decisions.save} /></>}</span></div>
      )}
    </div>
  );
}
