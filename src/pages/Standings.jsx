import { useEffect, useMemo, useState } from 'react';
import { getStandings, getSeasonSchedule, today, teamLogo, shiftDate } from '../lib/mlbapi.js';
import { simulateOdds, magicNumbers } from '../lib/playoffOdds.js';
import { teamById, TEAMS } from '../lib/teams.js';
import { Seg, SeasonSelect, useAsync, Loading, Err, TeamLink, usePref } from '../components/ui.jsx';
import DataTable, { heatColor } from '../components/DataTable.jsx';
import { LineChart } from '../components/charts.jsx';
import { fmt } from '../lib/catalog.js';

const SEASON_END = (s) => (s === 2020 ? '2020-09-28' : `${s}-10-01`);
const SEASON_START = (s) => `${s}-03-15`;
const TEAM_COLORS = ['#c8102e', '#0b4f8a', '#1a8a3a', '#d18b00', '#6b4fa0', '#00838f'];

export default function Standings() {
  const t = today();
  const curSeason = Number(t.slice(0, 4));
  const [season, setSeason] = useState(curSeason);
  const defaultDate = (s) => (s === curSeason ? (t > SEASON_END(s) ? SEASON_END(s) : t) : SEASON_END(s));
  const [date, setDate] = useState(defaultDate(curSeason));
  const [view, setView] = usePref('st:view', 'div');
  const [display, setDisplay] = usePref('st:display', 'odds');
  const changeSeason = (s) => { setSeason(s); setDate(defaultDate(s)); };
  const st = useAsync(() => getStandings(season, date), [season, date]);
  const sched = useAsync(() => getSeasonSchedule(season), [season]);
  const odds = useMemo(() => (sched.data ? simulateOdds(sched.data, season, date, 4000) : null), [sched.data, season, date]);
  const prev = useMemo(() => (sched.data && display === 'changes' ? simulateOdds(sched.data, season, shiftDate(date, -7), 2000) : null), [sched.data, season, date, display]);

  const records = useMemo(() => {
    const out = [];
    for (const rec of st.data?.records || []) {
      for (const tr of rec.teamRecords) {
        const split = (type) => tr.records?.splitRecords?.find((x) => x.type === type);
        const id = tr.team.id;
        const o = odds?.teams[id], p = prev?.teams[id];
        out.push({
          id, _key: id, name: tr.team.name, lg: teamById[id]?.lg, div: teamById[id]?.div,
          W: tr.wins, L: tr.losses, pct: Number(tr.winningPercentage), GB: tr.gamesBack, WCGB: tr.wildCardGamesBack,
          RS: tr.runsScored, RA: tr.runsAllowed, diff: tr.runDifferential,
          pyth: tr.runsScored + tr.runsAllowed ? tr.runsScored ** 1.83 / (tr.runsScored ** 1.83 + tr.runsAllowed ** 1.83) : null,
          home: split('home'), away: split('away'), l10: split('lastTen'), vsL: split('left'), vsR: split('right'),
          oneRun: split('oneRun'), xtra: split('extraInning'), strk: tr.streak?.streakCode,
          ...(o ? { po: o.po, divp: o.div, bye: o.bye, ds: o.wcs, lcs: o.lds, pen: o.lcs, ws: o.ws, projW: o.wins, sos: o.sos, left: o.left, str: o.strength } : {}),
          ...(p ? { dpo: o.po - p.po, dws: o.ws - p.ws, ddiv: o.div - p.div } : {}),
        });
      }
    }
    const mg = magicNumbers(out, season);
    for (const r of out) Object.assign(r, mg[r.id] || {});
    return out;
  }, [st.data, odds, prev, season]);

  const wl = (r) => (r ? `${r.wins}-${r.losses}` : '');
  const pctCell = (v) => (v == null ? '' : <span className="heat" style={{ background: heatColor(v) }}>{v >= 0.9995 ? '100' : v < 0.0005 ? '0' : (v * 100).toFixed(1)}%</span>);
  const delta = (v) => (v == null ? '' : <span className={v > 0.0005 ? 'wpa-pos' : v < -0.0005 ? 'wpa-neg' : 'muted'}>{v > 0 ? '+' : ''}{(v * 100).toFixed(1)}</span>);
  const base = [
    { key: 'name', label: 'Team', left: true, sticky: true, render: (r) => <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><img src={teamLogo(r.id)} width="18" height="18" alt="" /><TeamLink id={r.id} season={season} name={teamById[r.id]?.short || r.name} /></span> },
    { key: 'W', label: 'W' }, { key: 'L', label: 'L' }, { key: 'pct', label: 'Pct', f: fmt.r3 },
    { key: view === 'wc' ? 'WCGB' : 'GB', label: view === 'wc' ? 'WCGB' : 'GB', get: (r) => (view === 'wc' ? r.WCGB : r.GB), nosort: true },
    ...(view === 'div' ? [{ key: 'mg', label: 'M# / E#', get: (r) => r.magic ?? -(r.elim ?? 0), render: (r) => (r.magic != null ? <b>{r.magic || 'Clinched'}</b> : r.elim === 0 ? <span className="muted">Elim</span> : r.elim), title: 'Division magic number (leader) or elimination number' }] : []),
  ];
  const cols = display === 'odds' ? [
    ...base,
    { key: 'projW', label: 'Proj W', f: fmt.r1 }, { key: 'divp', label: 'Win Div', render: (r) => pctCell(r.divp) },
    ...(season >= 2022 ? [{ key: 'bye', label: 'Bye', render: (r) => pctCell(r.bye) }] : []),
    { key: 'po', label: 'Playoffs', render: (r) => pctCell(r.po) }, { key: 'ds', label: 'Make DS', render: (r) => pctCell(r.ds) },
    { key: 'lcs', label: 'Make LCS', render: (r) => pctCell(r.lcs) }, { key: 'pen', label: 'Pennant', render: (r) => pctCell(r.pen) },
    { key: 'ws', label: 'Win WS', render: (r) => pctCell(r.ws) },
    { key: 'sos', label: 'SOS left', f: fmt.r3, title: 'Average regressed strength of remaining opponents' },
  ] : display === 'changes' ? [
    ...base, { key: 'po', label: 'Playoffs', render: (r) => pctCell(r.po) }, { key: 'dpo', label: 'Δ 7 days', render: (r) => delta(r.dpo) },
    { key: 'divp', label: 'Win Div', render: (r) => pctCell(r.divp) }, { key: 'ddiv', label: 'Δ Div', render: (r) => delta(r.ddiv) },
    { key: 'ws', label: 'Win WS', render: (r) => pctCell(r.ws) }, { key: 'dws', label: 'Δ WS', render: (r) => delta(r.dws) },
  ] : [
    ...base,
    { key: 'RS', label: 'RS' }, { key: 'RA', label: 'RA' }, { key: 'diff', label: 'Diff', f: (v) => (v > 0 ? `+${v}` : v) },
    { key: 'pyth', label: 'xW-L', get: (r) => r.pyth, render: (r) => (r.pyth != null ? `${Math.round(r.pyth * (r.W + r.L))}-${Math.round((1 - r.pyth) * (r.W + r.L))}` : '') },
    { key: 'home', label: 'Home', get: (r) => r.home?.pct, render: (r) => wl(r.home) }, { key: 'away', label: 'Away', get: (r) => r.away?.pct, render: (r) => wl(r.away) },
    { key: 'vsL', label: 'vs LHP', get: (r) => r.vsL?.pct, render: (r) => wl(r.vsL), title: 'Record vs left-handed starters' },
    { key: 'vsR', label: 'vs RHP', get: (r) => r.vsR?.pct, render: (r) => wl(r.vsR), title: 'Record vs right-handed starters' },
    { key: 'oneRun', label: '1-run', get: (r) => r.oneRun?.pct, render: (r) => wl(r.oneRun) }, { key: 'xtra', label: 'Extras', get: (r) => r.xtra?.pct, render: (r) => wl(r.xtra) },
    { key: 'l10', label: 'L10', get: (r) => r.l10?.pct, render: (r) => wl(r.l10) }, { key: 'strk', label: 'Strk' },
  ];

  const groups = [];
  for (const lg of ['AL', 'NL']) {
    if (view === 'div') for (const dv of ['East', 'Central', 'West']) groups.push({ title: `${lg} ${dv}`, rows: records.filter((r) => r.lg === lg && r.div === dv).sort((a, b) => b.pct - a.pct) });
    else if (view === 'wc' || view === 'lg') groups.push({ title: `${lg}${view === 'wc' ? ' Wild Card' : ''}`, rows: records.filter((r) => r.lg === lg).sort((a, b) => b.pct - a.pct) });
  }
  if (view === 'mlb') groups.push({ title: 'MLB', rows: [...records].sort((a, b) => b.pct - a.pct) });

  return (
    <>
      <h1>Standings & playoff odds</h1>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <SeasonSelect value={season} onChange={changeSeason} />
        <button className="btn ghost" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">‹</button>
        <input type="date" value={date} min={SEASON_START(season)} max={SEASON_END(season)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="As of date" />
        <button className="btn ghost" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">›</button>
        <Seg value={view} onChange={setView} options={[{ value: 'div', label: 'Division' }, { value: 'wc', label: 'Wild Card' }, { value: 'lg', label: 'League' }, { value: 'mlb', label: 'MLB' }]} />
        <Seg value={display} onChange={setDisplay} options={[{ value: 'odds', label: 'Odds' }, { value: 'changes', label: 'Changes' }, { value: 'records', label: 'Records' }, { value: 'graph', label: 'Odds graph' }]} />
      </div>
      {odds && <div className="muted small">4,000 simulations of the {odds.remaining} games left after {date} plus the full {odds.format === 'six' ? '12-team' : odds.format === 'eight' ? '16-team' : '10-team'} postseason, log5 on regressed Pythagorean records with home field.</div>}
      {st.error && <Err e={st.error} />}
      {(st.loading || sched.loading) && <Loading what="standings" />}
      {display === 'graph' ? <OddsGraph sched={sched.data} season={season} date={date} /> : (
        <div className="grid" style={{ marginTop: 10 }}>
          {groups.map((g) => <div key={g.title}><h3>{g.title}</h3><DataTable rows={g.rows} cols={cols} /></div>)}
        </div>
      )}
    </>
  );
}

function OddsGraph({ sched, season, date }) {
  const [lg, setLg] = useState('AL');
  const [div, setDiv] = useState('East');
  const [metric, setMetric] = useState('po');
  const [series, setSeries] = useState(null);
  useEffect(() => {
    if (!sched) return;
    let stop = false;
    const dates = [];
    for (let d = `${season}-04-01`; d <= date; d = shiftDate(d, 7)) dates.push(d);
    if (dates[dates.length - 1] !== date) dates.push(date);
    const acc = {};
    let i = 0;
    const step = () => {
      if (stop || i >= dates.length) { if (!stop) setSeries({ dates, acc }); return; }
      const o = simulateOdds(sched, season, dates[i], 600);
      for (const [id, v] of Object.entries(o.teams)) (acc[id] ||= []).push(v);
      i++;
      setTimeout(step, 0);
    };
    setSeries(null);
    step();
    return () => { stop = true; };
  }, [sched, season, date]);
  if (!series) return <Loading what="odds history (simulating each week)" />;
  const teams = TEAMS.filter((t) => t.lg === lg && t.div === div);
  return (
    <div className="panel" style={{ marginTop: 10 }}>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <Seg value={lg} onChange={setLg} options={['AL', 'NL']} />
        <Seg value={div} onChange={setDiv} options={['East', 'Central', 'West']} />
        <Seg value={metric} onChange={setMetric} options={[{ value: 'po', label: 'Playoffs' }, { value: 'div', label: 'Division' }, { value: 'ws', label: 'World Series' }]} />
      </div>
      <LineChart height={260} yMin={0} yMax={1} yFmt={(v) => `${Math.round(v * 100)}%`} xFmt={(v) => series.dates[v]?.slice(5) || ''}
        series={teams.map((t, i) => ({ name: t.short, color: TEAM_COLORS[i], points: (series.acc[t.id] || []).map((o, j) => [j, o[metric]]) }))} />
      <div className="small muted">Re-simulated weekly (600 runs each) using only results known on that date.</div>
    </div>
  );
}
