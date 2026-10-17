import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getStandings, getSeasonSchedule, getRoster, getTeamTransactions, teamLogo, today } from '../lib/mlbapi.js';
import { loadTeamsMeta, loadTeamSeason } from '../lib/data.js';
import { deriveHitting, derivePitching, addLines } from '../lib/stats.js';
import { teamPlayers } from '../lib/teamPlayers.js';
import Summary from './team/Summary.jsx';
import Platoon from './team/Platoon.jsx';
import Lineups from './team/Lineups.jsx';
import { teamById } from '../lib/teams.js';
import { PRESETS, statDef } from '../lib/catalog.js';
import { SEASONS } from '../lib/guts.js';
import { Seg, useAsync, Loading, Err, PlayerLink, SeasonSelect } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';


/** Per-team player lines (MLB API, exact per stint) enriched with Statcast fields from the pipeline. */
export default function Team() {
  const { id, season: sParam } = useParams();
  const teamId = Number(id);
  const season = Number(sParam) || Number(today().slice(0, 4));
  const nav = useNavigate();
  const t = teamById[teamId];
  const [tab, setTab] = useState('summary');

  const standings = useAsync(() => getStandings(season), [season]);
  const rec = useMemo(() => {
    for (const r of standings.data?.records || []) for (const tr of r.teamRecords) if (tr.team.id === teamId) return tr;
    return null;
  }, [standings.data, teamId]);

  if (!t) return <Err e="Unknown team" />;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <img src={teamLogo(teamId)} width="56" height="56" alt="" />
          <div>
            <h1 style={{ margin: 0 }}>{season} {t.name}</h1>
            {rec && <div className="muted">
              {rec.wins}-{rec.losses} ({rec.winningPercentage}) · {ordinalPlace(rec.divisionRank)} in {t.lg} {t.div}
              {' '}· RS {rec.runsScored} · RA {rec.runsAllowed} · Diff {rec.runDifferential > 0 ? '+' : ''}{rec.runDifferential}
              {' '}· Pythag {Math.round((rec.runsScored ** 1.83 / (rec.runsScored ** 1.83 + rec.runsAllowed ** 1.83)) * (rec.wins + rec.losses))}-{Math.round((rec.runsAllowed ** 1.83 / (rec.runsScored ** 1.83 + rec.runsAllowed ** 1.83)) * (rec.wins + rec.losses))}
            </div>}
          </div>
        </div>
        <div className="row">
          <button className="btn ghost" disabled={season <= SEASONS[0]} onClick={() => nav(`/team/${teamId}/${season - 1}`)}>‹ {season - 1}</button>
          <SeasonSelect value={season} onChange={(s) => nav(`/team/${teamId}/${s}`)} />
          <button className="btn ghost" disabled={season >= SEASONS[SEASONS.length - 1]} onClick={() => nav(`/team/${teamId}/${season + 1}`)}>{season + 1} ›</button>
        </div>
      </div>
      <div className="tabs">
        {[['summary', 'Summary'], ['roster', 'Roster & Stats'], ['platoon', 'Platoon & Optimizer'], ['depth', 'Depth Chart'], ['lineups', 'Batting Orders'],
          ['schedule', 'Schedule'], ['splits', 'Team Splits'], ['tx', 'Transactions']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'summary' && <Summary teamId={teamId} season={season} rec={rec} />}
      {tab === 'roster' && <RosterStats teamId={teamId} season={season} />}
      {tab === 'platoon' && <Platoon teamId={teamId} season={season} />}
      {tab === 'lineups' && <Lineups teamId={teamId} season={season} />}
      {tab === 'tx' && <Transactions teamId={teamId} season={season} />}
      {tab === 'depth' && <Depth teamId={teamId} season={season} />}
      {tab === 'schedule' && <Schedule teamId={teamId} season={season} />}
      {tab === 'splits' && <TeamSplits teamId={teamId} season={season} />}
    </>
  );
}

const ordinalPlace = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[n] || `${n}th`);

function RosterStats({ teamId, season }) {
  const [split, setSplit] = useState('all');
  const [view, setView] = useState('Dashboard');
  const hit = useAsync(() => teamPlayers(teamId, season, 'hitting'), [teamId, season]);
  const pit = useAsync(() => teamPlayers(teamId, season, 'pitching'), [teamId, season]);
  const mk = (group, rows) => {
    const keys = PRESETS[group][view] || PRESETS[group].Dashboard;
    const rs = (rows || []).filter((r) => r.splits[split]).map((r) => ({ ...r.splits[split], id: r.id, _key: r.id, name: r.name, pos: r.pos, bats: r.bats, throws: r.throws }));
    const total = rs.reduce((a, r) => addLines(a, r), {});
    const tot = group === 'hitting' ? deriveHitting(total, season) : derivePitching(total, season);
    return { rs, tot, cols: [
      { key: 'name', label: 'Name', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} hand={group === 'hitting' ? r.bats : r.throws} /> },
      ...(group === 'hitting' ? [{ key: 'pos', label: 'Pos', left: true }] : []),
      ...keys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f, hb: d.hb, title: d.desc }; }),
    ] };
  };
  const h = mk('hitting', hit.data), p = mk('pitching', pit.data);
  const presetNames = [...new Set([...Object.keys(PRESETS.hitting), ...Object.keys(PRESETS.pitching)])];
  return (
    <>
      <div className="row">
        <Seg value={split} onChange={setSplit} options={[{ value: 'all', label: 'All' }, { value: 'vL', label: 'vs LH' }, { value: 'vR', label: 'vs RH' }]} />
        <select value={view} onChange={(e) => setView(e.target.value)}>{presetNames.map((n) => <option key={n}>{n}</option>)}</select>
      </div>
      <h2>Batting</h2>
      {hit.loading ? <Loading /> : hit.error ? <Err e={hit.error} /> : <DataTable rows={h.rs} cols={h.cols} totalRow={h.tot} defaultSort={{ key: 'PA', dir: 'desc' }} heat />}
      <h2>Pitching</h2>
      {pit.loading ? <Loading /> : pit.error ? <Err e={pit.error} /> : <DataTable rows={p.rs} cols={p.cols} totalRow={p.tot} defaultSort={{ key: 'IP', dir: 'desc' }} heat />}
    </>
  );
}

function Depth({ teamId, season }) {
  const meta = useAsync(() => loadTeamsMeta(season), [season]);
  const roster = useAsync(() => getRoster(teamId, season), [teamId, season]);
  const d = meta.data?.[teamId];
  const Lineup = ({ list, title }) => (
    <div className="panel">
      <h3>{title}</h3>
      <table className="t"><tbody>
        {(list || []).map((p, i) => (
          <tr key={i}><td className="l muted">{i + 1}</td><td className="l"><PlayerLink id={p.id} name={p.name} hand={p.bats || p.throws} /></td><td className="l muted">{p.pos}</td>
            <td className="num muted">{p.share != null ? `${Math.round(p.share * 100)}%` : ''}</td></tr>
        ))}
      </tbody></table>
      {!list?.length && <div className="muted small">Not available.</div>}
    </div>
  );
  if (meta.loading) return <Loading what="depth chart" />;
  return (
    <>
      {d ? (
        <div className="muted small" style={{ marginBottom: 8 }}>
          Source: {d.source === 'fangraphs' ? 'FanGraphs depth chart & platoon lineups' : 'most common lineups by opposing starter hand (FanGraphs depth charts not available for this season)'}
          {d.source !== 'fangraphs' && '. % = share of starts in that lineup slot.'}
        </div>
      ) : (
        <div className="notice">Depth charts for {season} haven’t been built yet — they come from the data pipeline. Showing the active roster below.</div>
      )}
      {d && (
        <div className="grid g2">
          <Lineup title="Lineup vs RHP" list={d.vsR} />
          <Lineup title="Lineup vs LHP" list={d.vsL} />
          <Lineup title="Rotation" list={d.rotation} />
          <Lineup title="Bullpen" list={d.bullpen} />
          {d.bench && <Lineup title="Bench" list={d.bench} />}
        </div>
      )}
      {!d && roster.data && (
        <DataTable rows={(roster.data.roster || []).map((r) => ({ _key: r.person.id, id: r.person.id, name: r.person.fullName, pos: r.position?.abbreviation, status: r.status?.description, num: r.jerseyNumber }))}
          cols={[{ key: 'num', label: '#', left: true }, { key: 'name', label: 'Name', left: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> }, { key: 'pos', label: 'Pos', left: true }, { key: 'status', label: 'Status', left: true }]} />
      )}
    </>
  );
}

function Schedule({ teamId, season }) {
  const sch = useAsync(() => getSeasonSchedule(season, 'R,F,D,L,W'), [season]);
  const rows = [];
  let w = 0, l = 0;
  for (const dt of sch.data?.dates || []) {
    for (const g of dt.games) {
      const home = g.teams.home.team.id === teamId, away = g.teams.away.team.id === teamId;
      if (!home && !away) continue;
      const me = home ? g.teams.home : g.teams.away, opp = home ? g.teams.away : g.teams.home;
      const done = g.status.abstractGameState === 'Final' && me.score != null;
      if (done && g.gameType === 'R') { if (me.isWinner) w++; else l++; }
      rows.push({ _key: g.gamePk, pk: g.gamePk, date: g.officialDate || dt.date, opp: opp.team.id, at: home ? 'vs' : '@', type: g.gameType,
        res: done ? `${me.isWinner ? 'W' : 'L'} ${me.score}-${opp.score}` : g.status.detailedState, rec: done && g.gameType === 'R' ? `${w}-${l}` : '' });
    }
  }
  if (sch.loading) return <Loading what="schedule" />;
  return (
    <DataTable rows={rows} cols={[
      { key: 'date', label: 'Date', left: true },
      { key: 'opp', label: 'Opponent', left: true, render: (r) => <>{r.at} <Link to={`/team/${r.opp}/${season}`}>{teamById[r.opp]?.abbr}</Link> {r.type !== 'R' && <span className="chip">Postseason</span>}</> },
      { key: 'res', label: 'Result', left: true, render: (r) => <Link to={`/game/${r.pk}`}>{r.res}</Link> },
      { key: 'rec', label: 'Record', left: true },
    ]} />
  );
}

function TeamSplits({ teamId, season }) {
  const hit = useAsync(() => loadTeamSeason(season, 'hitting'), [season]);
  const pit = useAsync(() => loadTeamSeason(season, 'pitching'), [season]);
  if (hit.loading || pit.loading) return <Loading />;
  const keysH = ['PA', 'AVG', 'OBP', 'SLG', 'K%', 'BB%', 'ISO', 'wOBA', 'xwOBA', 'wRCplus', 'Barrel%', 'HardHit%', 'Chase%', 'Whiff%'];
  const keysP = ['TBF', 'ERA', 'FIP', 'K%', 'BB%', 'K-BB%', 'wOBA', 'xwOBA', 'wRCplusAllowed', 'Barrel%', 'GB%', 'Chase%', 'Whiff%'];
  const mk = (rows, g, keys, labels) => {
    const me = rows?.find((r) => r.id === teamId);
    const rank = (s, k) => {
      const v = me?.splits?.[s]?.[k];
      if (v == null) return null;
      const hb = statDef(g, k).hb !== false;
      const vals = rows.map((r) => r.splits?.[s]?.[k]).filter((x) => x != null).sort((a, b) => (hb ? b - a : a - b));
      return vals.indexOf(v) + 1;
    };
    return {
      rows: ['all', 'vL', 'vR'].flatMap((s, i) => (me?.splits?.[s] ? [
        { _key: s, split: labels[i], ...me.splits[s] },
        { _key: `${s}-rk`, split: 'MLB rank', sub: true, ...Object.fromEntries(keys.map((k) => [k, rank(s, k)])) },
      ] : [])),
      cols: [{ key: 'split', label: 'Split', left: true, sticky: true, render: (r) => (r.sub ? <span className="muted small">{r.split}</span> : <b>{r.split}</b>) },
        ...keys.map((k) => { const d = statDef(g, k); return { key: k, label: d.label, f: (v, r) => v, render: (r) => (r.sub ? <span className="muted small">{r[k] ?? ''}</span> : d.f(r[k])) }; })],
    };
  };
  const h = mk(hit.data, 'hitting', keysH, ['Total', 'vs LHP', 'vs RHP']);
  const p = mk(pit.data, 'pitching', keysP, ['Total', 'vs LHB', 'vs RHB']);
  return (
    <>
      <h3>Team batting</h3><DataTable rows={h.rows} cols={h.cols} />
      <h3>Team pitching</h3><DataTable rows={p.rows} cols={p.cols} />
      <p className="small muted">Counting stats from MLB; Statcast columns from the pipeline’s team aggregates. Rank is among all 30 teams in that split.</p>
    </>
  );
}

function Transactions({ teamId, season }) {
  const tx = useAsync(() => getTeamTransactions(teamId, `${season}-01-01`, `${season}-12-31`), [teamId, season]);
  const [q, setQ] = useState('');
  if (tx.loading) return <Loading what="transactions" />;
  const list = (tx.data?.transactions || []).filter((t) => !q || (t.description || '').toLowerCase().includes(q.toLowerCase())).reverse();
  return (
    <>
      <input type="search" placeholder="Filter (e.g. injured, traded, recalled)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', maxWidth: 420 }} aria-label="Filter transactions" />
      <div className="panel" style={{ marginTop: 10 }}>
        {list.slice(0, 300).map((t, i) => (
          <div key={i} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="mono muted">{t.date}</span> <span className="pill">{t.typeDesc}</span> {t.description}
          </div>
        ))}
        {!list.length && <div className="muted small">No transactions.</div>}
      </div>
    </>
  );
}
