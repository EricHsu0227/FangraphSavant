import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getSchedule, teamLogo, today, shiftDate } from '../lib/mlbapi.js';
import { Loading, Err } from '../components/ui.jsx';

export default function Scores() {
  const { date: dParam } = useParams();
  const date = dParam || today();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let stop = false, timer;
    const load = async () => {
      try {
        const d = await getSchedule(date);
        if (stop) return;
        setData(d); setErr(null);
        const anyLive = d.dates?.[0]?.games?.some((g) => g.status.abstractGameState === 'Live');
        timer = setTimeout(load, anyLive ? 20_000 : 120_000);
      } catch (e) { if (!stop) setErr(e); }
    };
    setData(null); load();
    return () => { stop = true; clearTimeout(timer); };
  }, [date]);

  const games = data?.dates?.[0]?.games || [];
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Scores</h1>
        <div className="row">
          <button className="btn ghost" onClick={() => nav(`/scores/${shiftDate(date, -1)}`)}>‹ Prev</button>
          <input type="date" value={date} onChange={(e) => e.target.value && nav(`/scores/${e.target.value}`)} />
          <button className="btn ghost" onClick={() => nav(`/scores/${shiftDate(date, 1)}`)}>Next ›</button>
          <button className="btn ghost" onClick={() => nav('/scores')}>Today</button>
        </div>
      </div>
      {err && <Err e={err} />}
      {!data && !err && <Loading what="games" />}
      {data && games.length === 0 && <div className="loading">No games on {date}.</div>}
      <div className="games">
        {games.map((g) => <GameCard key={g.gamePk} g={g} />)}
      </div>
    </>
  );
}

function GameCard({ g }) {
  const st = g.status;
  const live = st.abstractGameState === 'Live';
  const fin = st.abstractGameState === 'Final';
  const ls = g.linescore;
  const side = (s) => {
    const t = g.teams[s];
    const won = fin && t.isWinner;
    const lost = fin && !t.isWinner;
    return (
      <div className={`tm ${lost ? 'lost' : ''}`}>
        <img src={teamLogo(t.team.id)} alt="" />
        <span>{t.team.teamName || t.team.name}</span>
        <span className="muted small">{t.leagueRecord ? `${t.leagueRecord.wins}-${t.leagueRecord.losses}` : ''}</span>
        <span className="sc">{st.abstractGameState === 'Preview' ? '' : t.score ?? ''}{won ? ' ◂' : ''}</span>
      </div>
    );
  };
  const time = new Date(g.gameDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <Link to={`/game/${g.gamePk}`} className="game-card">
      {side('away')}
      {side('home')}
      <div className="st">
        <span>
          {live && <><span className="live-dot" />{ls?.inningState} {ls?.currentInningOrdinal} · {ls?.outs ?? 0} out</>}
          {fin && `${st.detailedState}${ls?.currentInning && ls.currentInning !== 9 ? ` (${ls.currentInning})` : ''}`}
          {st.abstractGameState === 'Preview' && `${st.detailedState === 'Scheduled' ? time : st.detailedState}`}
        </span>
        {g.seriesStatus?.description && g.gameType !== 'R' && <span>{g.seriesStatus.shortDescription || g.seriesStatus.description}</span>}
      </div>
      {st.abstractGameState === 'Preview' && (
        <div className="st"><span>
          {g.teams.away.probablePitcher?.fullName || 'TBD'} vs {g.teams.home.probablePitcher?.fullName || 'TBD'}
        </span></div>
      )}
      {fin && g.decisions && (
        <div className="st"><span>W: {g.decisions.winner?.fullName} · L: {g.decisions.loser?.fullName}{g.decisions.save ? ` · SV: ${g.decisions.save.fullName}` : ''}</span></div>
      )}
    </Link>
  );
}
