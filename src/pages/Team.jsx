import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getStandings, getTeamPlayerStats, getSeasonSchedule, getRoster, splitsOf, teamLogo, today } from '../lib/mlbapi.js';
import { loadSeason, loadTeamsMeta, parkFactor } from '../lib/data.js';
import { fromMLB, deriveHitting, derivePitching, addLines, hitterValueExpected, pitcherValueExpected } from '../lib/stats.js';
import { teamById } from '../lib/teams.js';
import { PRESETS, statDef } from '../lib/catalog.js';
import { SEASONS } from '../lib/guts.js';
import { Seg, useAsync, Loading, Err, PlayerLink, SeasonSelect } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';

const SIT = { all: null, vL: 'vl', vR: 'vr' };

/** Per-team player lines (MLB API, exact per stint) enriched with Statcast fields from the pipeline. */
async function teamPlayers(teamId, season, group) {
  const [parts, sc, pf] = await Promise.all([
    Promise.all(['all', 'vL', 'vR'].map((s) => getTeamPlayerStats(teamId, season, group, SIT[s]).catch(() => null))),
    loadSeason(season, group).catch(() => []),
    parkFactor(season, teamId),
  ]);
  const scById = new Map((sc || []).map((r) => [r.id, r]));
  const byId = new Map();
  ['all', 'vL', 'vR'].forEach((s, i) => {
    for (const sp of splitsOf(parts[i])) {
      const id = sp.player?.id;
      if (!id) continue;
      let r = byId.get(id);
      if (!r) { r = { id, name: sp.player.fullName, pos: sp.position?.abbreviation, splits: {} }; byId.set(id, r); }
      const line = fromMLB(sp.stat, group);
      const scRow = scById.get(id);
      const stint = scRow?.stints?.find((x) => x.teamId === teamId)?.splits?.[s];
      const scLine = stint || (scRow && (!scRow.stints || scRow.stints.length <= 1) ? scRow.splits?.[s] : null);
      if (scLine) for (const [k, v] of Object.entries(scLine)) if (!(k in line) && typeof v === 'number') line[k] = v;
      // drop pipeline-derived rates so they recompute on this team's line
      delete line.wOBA;
      const d = group === 'hitting' ? deriveHitting(line, season, pf) : derivePitching(line, season, pf);
      if (s === 'all') {
        Object.assign(d, group === 'hitting'
          ? hitterValueExpected(d, season, { woba: d.wOBA, xwoba: d.xwOBA, pf, bsr: scRow?.bsr, frv: scRow?.frv, pos: r.pos })
          : pitcherValueExpected(d, season, { woba: d.wOBA, xwoba: d.xwOBA, pf }));
        if (scRow?.bats) r.bats = scRow.bats;
        if (scRow?.throws) r.throws = scRow.throws;
      }
      r.splits[s] = d;
    }
  });
  return [...byId.values()];
}

export default function Team() {
  const { id, season: sParam } = useParams();
  const teamId = Number(id);
  const season = Number(sParam) || Number(today().slice(0, 4));
  const nav = useNavigate();
  const t = teamById[teamId];
  const [tab, setTab] = useState('roster');

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
        {[['roster', 'Roster & Stats'], ['depth', 'Depth Chart & Lineups'], ['schedule', 'Schedule & Results'], ['splits', 'Team Splits']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'roster' && <RosterStats teamId={teamId} season={season} />}
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
  const hit = useAsync(() => teamPlayers(teamId, season, 'hitting'), [teamId, season]);
  const pit = useAsync(() => teamPlayers(teamId, season, 'pitching'), [teamId, season]);
  if (hit.loading || pit.loading) return <Loading />;
  const sum = (rows, s, g) => {
    const t = (rows || []).reduce((a, r) => (r.splits[s] ? addLines(a, r.splits[s]) : a), {});
    return g === 'hitting' ? deriveHitting(t, season) : derivePitching(t, season);
  };
  const keysH = ['PA', 'AVG', 'OBP', 'SLG', 'K%', 'BB%', 'wOBA', 'wRCplus'];
  const keysP = ['TBF', 'K%', 'BB%', 'ERA', 'FIP', 'wOBA', 'wRCplusAllowed'];
  const mk = (rows, g, keys, labels) => ({
    rows: ['all', 'vL', 'vR'].map((s, i) => ({ _key: s, split: labels[i], ...sum(rows, s, g) })),
    cols: [{ key: 'split', label: 'Split', left: true }, ...keys.map((k) => { const d = statDef(g, k); return { key: k, label: d.label, f: d.f }; })],
  });
  const h = mk(hit.data, 'hitting', keysH, ['Total', 'vs LHP', 'vs RHP']);
  const p = mk(pit.data, 'pitching', keysP, ['Total', 'vs LHB', 'vs RHB']);
  return (
    <div className="grid g2">
      <div><h3>Team batting</h3><DataTable rows={h.rows} cols={h.cols} /></div>
      <div><h3>Team pitching</h3><DataTable rows={p.rows} cols={p.cols} /></div>
    </div>
  );
}

