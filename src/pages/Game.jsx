import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getLiveFeed, getWinProb, teamLogo } from '../lib/mlbapi.js';
import { linesFromPlays, loadXwobaGrid, halfLabel } from '../lib/game.js';
import { woba, wrcPlus, ipToDec } from '../lib/stats.js';
import { guts } from '../lib/guts.js';
import { fmt } from '../lib/catalog.js';
import { loadSeason } from '../lib/data.js';
import { PlayerLink, Loading, Err, Seg } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import { Gameday, PitchTracker, GameInfo, Bullpen, LineupProjection } from './game/Extras.jsx';

export default function Game() {
  const { pk } = useParams();
  const [feed, setFeed] = useState(null);
  const [wp, setWp] = useState([]);
  const [err, setErr] = useState(null);
  const [grid, setGrid] = useState(null);
  const [tab, setTab] = useState('gameday');

  useEffect(() => { loadXwobaGrid().then(setGrid); }, []);
  useEffect(() => {
    let stop = false, timer;
    const load = async () => {
      try {
        const f = await getLiveFeed(pk);
        if (stop) return;
        setFeed(f);
        getWinProb(pk).then((w) => !stop && setWp(Array.isArray(w) ? w : [])).catch(() => {});
        const live = f.gameData.status.abstractGameState === 'Live';
        if (live) timer = setTimeout(load, 8000);
      } catch (e) { if (!stop) setErr(e); }
    };
    setFeed(null); load();
    return () => { stop = true; clearTimeout(timer); };
  }, [pk]);

  if (err) return <Err e={err} />;
  if (!feed) return <Loading what="game" />;
  const gd = feed.gameData, ld = feed.liveData;
  const season = Number(gd.game.season);
  const live = gd.status.abstractGameState === 'Live';
  const preview = gd.status.abstractGameState === 'Preview';

  return (
    <>
      <Scorebug gd={gd} ld={ld} />
      {live && <LivePanel gd={gd} ld={ld} season={season} />}
      {!preview && <Linescore gd={gd} ld={ld} />}
      {preview && <Preview gd={gd} season={season} />}
      {preview && (
        <>
          <h2>Projected matchups</h2>
          <LineupProjection gd={gd} ld={ld} season={season} />
          <h2>Bullpen</h2>
          <Bullpen gd={gd} />
        </>
      )}
      {!preview && (
        <>
          <div className="tabs">
            {[['gameday', 'Gameday'], ['box', 'Box Score'], ['pbp', 'Play-by-Play'], ['wp', 'Win Probability'], ['pitches', 'Pitch Tracker'],
              ['bb', 'Batted Balls'], ['proj', 'Matchups'], ['pen', 'Bullpen']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'gameday' && <Gameday gd={gd} ld={ld} />}
          {tab === 'box' && <><BoxScore gd={gd} ld={ld} wp={wp} grid={grid} season={season} /><div style={{ height: 14 }} /><GameInfo gd={gd} ld={ld} /></>}
          {tab === 'pitches' && <PitchTracker gd={gd} ld={ld} />}
          {tab === 'proj' && <LineupProjection gd={gd} ld={ld} season={season} />}
          {tab === 'pen' && <Bullpen gd={gd} />}
          {tab === 'pbp' && <PlayByPlay gd={gd} ld={ld} wp={wp} live={live} />}
          {tab === 'wp' && <WinProb gd={gd} wp={wp} />}
          {tab === 'bb' && <BattedBalls gd={gd} ld={ld} />}
        </>
      )}
    </>
  );
}

function Scorebug({ gd, ld }) {
  const ls = ld.linescore;
  const st = gd.status;
  const side = (s) => (
    <div className={`side ${s}`}>
      {s === 'away' && <img src={teamLogo(gd.teams.away.id)} alt="" />}
      <div>
        <div style={{ fontWeight: 700 }}>{gd.teams[s].teamName}</div>
        <div className="small" style={{ opacity: 0.7 }}>{gd.teams[s].record ? `${gd.teams[s].record.wins}-${gd.teams[s].record.losses}` : ''}</div>
      </div>
      <div className="big">{ls?.teams?.[s]?.runs ?? ''}</div>
      {s === 'home' && <img src={teamLogo(gd.teams.home.id)} alt="" />}
    </div>
  );
  return (
    <div className="scorebug">
      {side('away')}
      <div style={{ textAlign: 'center' }}>
        {st.abstractGameState === 'Live' && <div><span className="live-dot" />{ls.inningState} {ls.currentInningOrdinal}</div>}
        {st.abstractGameState !== 'Live' && <div>{st.detailedState}</div>}
        <div className="small" style={{ opacity: 0.7 }}>{gd.venue?.name} · {gd.datetime?.officialDate}</div>
      </div>
      {side('home')}
    </div>
  );
}

function Diamond({ offense, outs, balls, strikes }) {
  const on = (b) => (offense?.[b] ? '#ff6a3d' : 'transparent');
  return (
    <div className="diamond row" style={{ gap: 18 }}>
      <svg width="90" height="70" viewBox="0 0 90 70">
        <rect x="38" y="4" width="14" height="14" transform="rotate(45 45 11)" fill={on('second')} stroke="currentColor" strokeWidth="1.5" />
        <rect x="64" y="26" width="14" height="14" transform="rotate(45 71 33)" fill={on('first')} stroke="currentColor" strokeWidth="1.5" />
        <rect x="12" y="26" width="14" height="14" transform="rotate(45 19 33)" fill={on('third')} stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="mono">
        <div>{balls}-{strikes}</div>
        <div>{[0, 1, 2].map((i) => <span key={i} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 4, background: i < outs ? '#ff6a3d' : 'var(--chip)' }} />)}</div>
      </div>
    </div>
  );
}

function LivePanel({ gd, ld, season }) {
  const cur = ld.plays.currentPlay;
  const ls = ld.linescore;
  const [hit, setHit] = useState(null);
  const [pit, setPit] = useState(null);
  const b = cur?.matchup?.batter, p = cur?.matchup?.pitcher;
  const pHand = cur?.matchup?.pitchHand?.code, bSide = cur?.matchup?.batSide?.code;
  useEffect(() => {
    loadSeason(season, 'hitting').then(setHit).catch(() => {});
    loadSeason(season, 'pitching').then(setPit).catch(() => {});
  }, [season]);
  const bRow = hit?.find((r) => r.id === b?.id);
  const pRow = pit?.find((r) => r.id === p?.id);
  const bSplit = bRow?.splits?.[pHand === 'L' ? 'vL' : 'vR'];
  const pSplit = pRow?.splits?.[bSide === 'L' ? 'vL' : 'vR'];
  const pitches = (cur?.playEvents || []).filter((e) => e.isPitch);
  return (
    <div className="grid g3" style={{ marginTop: 14 }}>
      <div className="panel">
        <h3>Situation</h3>
        <Diamond offense={ls.offense} outs={ls.outs} balls={ls.balls} strikes={ls.strikes} />
      </div>
      <div className="panel">
        <h3>Matchup</h3>
        <div><b>AB:</b> <PlayerLink id={b?.id} name={b?.fullName} hand={bSide} /></div>
        <div className="small muted">
          Season vs {pHand}HP: {bSplit ? `${bSplit.PA} PA · wOBA ${fmt.r3(bSplit.wOBA)} · xwOBA ${fmt.r3(bSplit.xwOBA) || '—'} · wRC+ ${bSplit.wRCplus ?? '—'}` : '—'}
        </div>
        <div style={{ marginTop: 8 }}><b>P:</b> <PlayerLink id={p?.id} name={p?.fullName} hand={pHand} /></div>
        <div className="small muted">
          Season vs {bSide}HB: {pSplit ? `${pSplit.TBF || pSplit.PA} TBF · wOBA ${fmt.r3(pSplit.wOBA)} · xwOBA ${fmt.r3(pSplit.xwOBA) || '—'}` : '—'}
        </div>
      </div>
      <div className="panel">
        <h3>This at-bat</h3>
        <StrikeZone pitches={pitches} />
      </div>
    </div>
  );
}

function StrikeZone({ pitches }) {
  // plate x in ft (-2..2), z in ft (0..5)
  const X = (x) => 60 + x * 40, Z = (z) => 160 - z * 30;
  return (
    <div className="row zone-wrap" style={{ alignItems: 'flex-start' }}>
      <svg width="120" height="170" viewBox="0 0 120 170">
        <rect x={X(-0.83)} y={Z(3.5)} width={0.83 * 80} height={2 * 30} fill="none" stroke="currentColor" opacity=".6" />
        {pitches.map((e, i) => {
          const c = e.pitchData?.coordinates;
          if (c?.pX == null) return null;
          const col = e.details.isInPlay ? '#1d5fa8' : e.details.isStrike ? '#d62934' : '#3a9a52';
          return <g key={i}><circle cx={X(c.pX)} cy={Z(c.pZ)} r="8" fill={col} opacity=".85" /><text x={X(c.pX)} y={Z(c.pZ) + 4} fontSize="9" textAnchor="middle" fill="#fff">{i + 1}</text></g>;
        })}
      </svg>
      <div className="small mono">
        {pitches.map((e, i) => (
          <div key={i}>{i + 1}. {e.details.type?.code || ''} {e.pitchData?.startSpeed ? e.pitchData.startSpeed.toFixed(1) : ''} — {e.details.description}</div>
        ))}
      </div>
    </div>
  );
}

function Linescore({ gd, ld }) {
  const ls = ld.linescore;
  const n = Math.max(9, ls.innings?.length || 0);
  const inn = Array.from({ length: n }, (_, i) => ls.innings?.[i]);
  return (
    <div className="tbl-wrap" style={{ marginTop: 14 }}>
      <table className="t linescore">
        <thead><tr><th className="l"></th>{inn.map((_, i) => <th key={i}>{i + 1}</th>)}<th>R</th><th>H</th><th>E</th></tr></thead>
        <tbody>
          {['away', 'home'].map((s) => (
            <tr key={s}>
              <td className="l"><b>{gd.teams[s].abbreviation}</b></td>
              {inn.map((x, i) => <td key={i} className="num">{x?.[s]?.runs ?? ''}</td>)}
              <td className="num"><b>{ls.teams[s].runs}</b></td><td className="num">{ls.teams[s].hits}</td><td className="num">{ls.teams[s].errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Preview({ gd, season }) {
  const pp = gd.probablePitchers || {};
  return (
    <div className="grid g2" style={{ marginTop: 14 }}>
      {['away', 'home'].map((s) => (
        <div className="panel" key={s}>
          <h3>{gd.teams[s].name} probable</h3>
          {pp[s] ? <PlayerLink id={pp[s].id} name={pp[s].fullName} /> : 'TBD'}
          <div className="muted small">{season} season</div>
        </div>
      ))}
    </div>
  );
}

function BoxScore({ gd, ld, wp, grid, season }) {
  const g = guts(season);
  const { bat, pit } = useMemo(() => linesFromPlays(ld.plays.allPlays, wp, grid, g), [ld, wp, grid, g]);
  return (
    <div className="grid g2">
      {['away', 'home'].map((s) => {
        const bt = ld.boxscore.teams[s];
        const batters = (bt.batters || []).map((id) => bt.players[`ID${id}`]).filter((x) => x && (x.stats?.batting?.plateAppearances || x.battingOrder));
        const pitchers = (bt.pitchers || []).map((id) => bt.players[`ID${id}`]).filter(Boolean);
        const bRows = batters.map((p) => {
          const st = p.stats.batting || {};
          const l = bat[p.person.id] || {};
          const w = woba(l, season);
          const sub = p.battingOrder && Number(p.battingOrder) % 100 !== 0;
          return {
            id: p.person.id, _key: p.person.id, name: p.person.fullName, sub, pos: p.position?.abbreviation,
            AB: st.atBats, R: st.runs, H: st.hits, RBI: st.rbi, BB: st.baseOnBalls, SO: st.strikeOuts, HR: st.homeRuns,
            wOBA: w, wRC: l.PA ? wrcPlus(w, season) : null, xwOBA: l.xwOBA, WPA: l.WPA,
            seasonOPS: p.seasonStats?.batting?.ops,
          };
        });
        const pRows = pitchers.map((p) => {
          const st = p.stats.pitching || {};
          const l = pit[p.person.id] || {};
          const w = woba(l, season);
          return {
            id: p.person.id, _key: p.person.id, name: p.person.fullName, IP: ipToDec(st.inningsPitched), H: st.hits, R: st.runs, ER: st.earnedRuns,
            BB: st.baseOnBalls, SO: st.strikeOuts, HR: st.homeRuns, NP: st.numberOfPitches,
            wOBA: w, wRCa: l.PA ? wrcPlus(w, season) : null, xwOBA: l.xwOBA, WPA: l.WPA, ERA: p.seasonStats?.pitching?.era,
            note: p.stats?.pitching?.note,
          };
        });
        return (
          <div key={s}>
            <h3>{gd.teams[s].name}</h3>
            <DataTable rows={bRows} cols={[
              { key: 'name', label: 'Batter', left: true, sticky: true, render: (r) => <span style={{ paddingLeft: r.sub ? 12 : 0 }}><PlayerLink id={r.id} name={r.name} /> <span className="muted small">{r.pos}</span></span> },
              { key: 'AB', label: 'AB' }, { key: 'R', label: 'R' }, { key: 'H', label: 'H' }, { key: 'HR', label: 'HR' }, { key: 'RBI', label: 'RBI' },
              { key: 'BB', label: 'BB' }, { key: 'SO', label: 'K' },
              { key: 'wOBA', label: 'wOBA', f: fmt.r3, title: 'Game wOBA' },
              { key: 'xwOBA', label: 'xwOBA', f: fmt.r3, title: 'Game xwOBA (EV/LA grid)' },
              { key: 'wRC', label: 'wRC+', title: 'Game wRC+' },
              { key: 'WPA', label: 'WPA', f: (v) => (v == null ? '' : (v >= 0 ? '+' : '') + v.toFixed(3)) },
              { key: 'seasonOPS', label: 'OPS (szn)' },
            ]} />
            <div style={{ height: 10 }} />
            <DataTable rows={pRows} cols={[
              { key: 'name', label: 'Pitcher', left: true, sticky: true, render: (r) => <><PlayerLink id={r.id} name={r.name} /> <span className="muted small">{r.note}</span></> },
              { key: 'IP', label: 'IP', f: fmt.ip }, { key: 'H', label: 'H' }, { key: 'R', label: 'R' }, { key: 'ER', label: 'ER' },
              { key: 'BB', label: 'BB' }, { key: 'SO', label: 'K' }, { key: 'HR', label: 'HR' }, { key: 'NP', label: 'NP' },
              { key: 'wOBA', label: 'wOBA', f: fmt.r3, title: 'wOBA allowed this game' },
              { key: 'xwOBA', label: 'xwOBA', f: fmt.r3 },
              { key: 'wRCa', label: 'wRC+ a', title: 'wRC+ allowed this game' },
              { key: 'WPA', label: 'WPA', f: (v) => (v == null ? '' : (v >= 0 ? '+' : '') + v.toFixed(3)) },
              { key: 'ERA', label: 'ERA (szn)' },
            ]} />
          </div>
        );
      })}
    </div>
  );
}

function PlayByPlay({ gd, ld, wp, live }) {
  const [filter, setFilter] = useState('all');
  const [order, setOrder] = useState(live ? 'new' : 'old');
  const wpBy = Object.fromEntries((wp || []).map((w) => [w.atBatIndex, w]));
  let plays = (ld.plays.allPlays || []).filter((p) => p.result?.type === 'atBat' || p.about?.isComplete);
  if (filter === 'scoring') plays = plays.filter((p) => p.about.isScoringPlay);
  if (filter === 'big') plays = plays.filter((p) => Math.abs(wpBy[p.atBatIndex]?.homeTeamWinProbabilityAdded || 0) >= 8);
  if (order === 'new') plays = [...plays].reverse();
  let last = null;
  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: 8 }}>
        <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All plays' }, { value: 'scoring', label: 'Scoring' }, { value: 'big', label: 'Big WPA (≥8%)' }]} />
        <Seg value={order} onChange={setOrder} options={[{ value: 'old', label: 'Oldest first' }, { value: 'new', label: 'Newest first' }]} />
      </div>
      {plays.map((p) => {
        const h = halfLabel(p);
        const head = h !== last ? <div className="pbp-inning">{h}</div> : null;
        last = h;
        const w = wpBy[p.atBatIndex];
        const add = w?.homeTeamWinProbabilityAdded;
        const battingHome = !p.about.isTopInning;
        const forBat = add == null ? null : battingHome ? add : -add;
        const hd = p.playEvents?.slice().reverse().find((e) => e.hitData)?.hitData;
        const pitches = (p.playEvents || []).filter((e) => e.isPitch);
        return (
          <div key={p.atBatIndex}>
            {head}
            <div className={`pbp-play ${p.about.isScoringPlay ? 'scoring' : ''}`}>
              <div>
                <div className="desc">
                  <PlayerLink id={p.matchup.batter.id} name={p.matchup.batter.fullName} hand={p.matchup.batSide?.code} />{' '}
                  <span className="muted small">vs</span>{' '}
                  <PlayerLink id={p.matchup.pitcher.id} name={p.matchup.pitcher.fullName} hand={p.matchup.pitchHand?.code} />
                </div>
                <div className="desc">{p.result.description || p.result.event || '…'}</div>
                {hd && <div className="meta">EV {hd.launchSpeed ?? '—'} · LA {hd.launchAngle ?? '—'}° · {hd.totalDistance ?? '—'} ft · {hd.trajectory?.replace(/_/g, ' ') || ''}</div>}
                <div className="pitch-list">
                  {pitches.map((e, i) => `${e.details.type?.code || '?'} ${e.pitchData?.startSpeed?.toFixed(0) || ''} ${e.details.call?.code || ''}`).join(' · ')}
                </div>
              </div>
              <div className="meta" style={{ textAlign: 'right' }}>
                {p.about.isComplete && <>{p.result.awayScore}-{p.result.homeScore}<br />{p.count?.outs} out</>}
              </div>
              <div className="meta" style={{ textAlign: 'right', minWidth: 80 }}>
                {forBat != null && <span className={forBat >= 0 ? 'wpa-pos' : 'wpa-neg'}>{forBat >= 0 ? '+' : ''}{forBat.toFixed(1)}%</span>}
                {w && <div>{gd.teams.home.abbreviation} {w.homeTeamWinProbability?.toFixed(0)}%</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WinProb({ gd, wp }) {
  const [hover, setHover] = useState(null);
  if (!wp?.length) return <div className="loading">Win probability not available for this game.</div>;
  const W = 900, H = 220, pad = 30;
  const x = (i) => pad + (i / (wp.length - 1 || 1)) * (W - pad * 2);
  const y = (p) => H / 2 + ((50 - p) / 50) * (H / 2 - 12);
  const d = wp.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.homeTeamWinProbability).toFixed(1)}`).join(' ');
  const innStarts = [];
  wp.forEach((w, i) => { if (i === 0 || w.about.inning !== wp[i - 1].about.inning) innStarts.push([i, w.about.inning]); });
  const top = [...wp].map((w) => ({ ...w, abs: Math.abs(w.homeTeamWinProbabilityAdded || 0) })).sort((a, b) => b.abs - a.abs).slice(0, 8);
  return (
    <div className="grid g2">
      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        <div className="row small muted"><span>▲ {gd.teams.home.teamName}</span><span>▼ {gd.teams.away.teamName}</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} className="wp-chart" onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - pad) / (W - 2 * pad)) * (wp.length - 1));
            setHover(Math.max(0, Math.min(wp.length - 1, i)));
          }}>
          <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} stroke="currentColor" opacity=".25" />
          {innStarts.map(([i, inn]) => (
            <g key={i}><line x1={x(i)} x2={x(i)} y1={8} y2={H - 8} stroke="currentColor" opacity=".08" /><text x={x(i) + 3} y={H - 4} fontSize="10" fill="currentColor" opacity=".5">{inn}</text></g>
          ))}
          <path d={d} fill="none" stroke="#c8102e" strokeWidth="2.2" />
          {hover != null && <circle cx={x(hover)} cy={y(wp[hover].homeTeamWinProbability)} r="5" fill="#c8102e" />}
        </svg>
        {hover != null && (
          <div className="small">
            <b>{halfLabel(wp[hover])}</b> — {wp[hover].result?.description} <span className="muted">({gd.teams.home.abbreviation} {wp[hover].homeTeamWinProbability.toFixed(1)}%)</span>
          </div>
        )}
      </div>
      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        <h3>Biggest plays</h3>
        <DataTable rows={top.map((w) => ({ ...w, _key: w.atBatIndex }))} cols={[
          { key: 'inn', label: 'Inn', left: true, get: (w) => halfLabel(w) },
          { key: 'bat', label: 'Batter', left: true, render: (w) => <PlayerLink id={w.matchup.batter.id} name={w.matchup.batter.fullName} /> },
          { key: 'pit', label: 'Pitcher', left: true, render: (w) => <PlayerLink id={w.matchup.pitcher.id} name={w.matchup.pitcher.fullName} /> },
          { key: 'desc', label: 'Play', left: true, render: (w) => <span style={{ whiteSpace: 'normal' }}>{w.result.event}</span> },
          { key: 'abs', label: 'WPA', f: (v) => `${v.toFixed(1)}%` },
        ]} />
      </div>
    </div>
  );
}

function BattedBalls({ ld }) {
  const rows = (ld.plays.allPlays || []).flatMap((p) => {
    const e = p.playEvents?.slice().reverse().find((x) => x.hitData);
    if (!e?.hitData?.launchSpeed) return [];
    return [{ _key: p.atBatIndex, inn: halfLabel(p), b: p.matchup.batter, side: p.matchup.batSide?.code, pi: p.matchup.pitcher, res: p.result.event,
      EV: e.hitData.launchSpeed, LA: e.hitData.launchAngle, dist: e.hitData.totalDistance, pitch: e.details?.type?.description, velo: e.pitchData?.startSpeed }];
  });
  return (
    <DataTable rows={rows} defaultSort={{ key: 'EV', dir: 'desc' }} cols={[
      { key: 'inn', label: 'Inn', left: true },
      { key: 'b', label: 'Batter', left: true, render: (r) => <PlayerLink id={r.b.id} name={r.b.fullName} hand={r.side} />, get: (r) => r.b.fullName },
      { key: 'pi', label: 'Pitcher', left: true, render: (r) => <PlayerLink id={r.pi.id} name={r.pi.fullName} />, get: (r) => r.pi.fullName },
      { key: 'res', label: 'Result', left: true },
      { key: 'EV', label: 'EV', f: fmt.r1, hb: true }, { key: 'LA', label: 'LA', f: (v) => v }, { key: 'dist', label: 'Dist' },
      { key: 'pitch', label: 'Pitch', left: true }, { key: 'velo', label: 'Velo', f: fmt.r1 },
    ]} heat />
  );
}

