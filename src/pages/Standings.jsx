import { useMemo, useState } from 'react';
import { getStandings, getSeasonSchedule, today, teamLogo } from '../lib/mlbapi.js';
import { simulateOdds } from '../lib/playoffOdds.js';
import { teamById } from '../lib/teams.js';
import { Seg, SeasonSelect, useAsync, Loading, Err, TeamLink } from '../components/ui.jsx';
import DataTable, { heatColor } from '../components/DataTable.jsx';
import { fmt } from '../lib/catalog.js';

const SEASON_END = (s) => `${s}-10-05`;
const SEASON_START = (s) => `${s}-03-15`;

export default function Standings() {
  const t = today();
  const curSeason = Number(t.slice(0, 4));
  const [season, setSeason] = useState(curSeason);
  const defaultDate = (s) => (s === curSeason ? (t > SEASON_END(s) ? SEASON_END(s) : t) : SEASON_END(s));
  const [date, setDate] = useState(defaultDate(curSeason));
  const [view, setView] = useState('div');
  const [withOdds, setWithOdds] = useState(true);

  const changeSeason = (s) => { setSeason(s); setDate(defaultDate(s)); };
  const st = useAsync(() => getStandings(season, date), [season, date]);
  const sched = useAsync(() => (withOdds ? getSeasonSchedule(season) : null), [season, withOdds]);
  const odds = useMemo(() => (sched.data ? simulateOdds(sched.data, season, date) : null), [sched.data, season, date]);

  const records = useMemo(() => {
    const out = [];
    for (const rec of st.data?.records || []) {
      for (const tr of rec.teamRecords) {
        const split = (type) => tr.records?.splitRecords?.find((x) => x.type === type);
        const id = tr.team.id;
        out.push({
          id, _key: id, name: tr.team.name, lg: teamById[id]?.lg, div: teamById[id]?.div,
          W: tr.wins, L: tr.losses, pct: Number(tr.winningPercentage), GB: tr.gamesBack, WCGB: tr.wildCardGamesBack,
          RS: tr.runsScored, RA: tr.runsAllowed, diff: tr.runDifferential,
          pyth: tr.runsScored + tr.runsAllowed ? tr.runsScored ** 1.83 / (tr.runsScored ** 1.83 + tr.runsAllowed ** 1.83) : null,
          home: split('home'), away: split('away'), l10: split('lastTen'),
          vsL: split('left'), vsR: split('right'), strk: tr.streak?.streakCode,
          po: odds?.teams[id]?.po, divp: odds?.teams[id]?.div, bye: odds?.teams[id]?.bye, projW: odds?.teams[id]?.wins,
        });
      }
    }
    return out;
  }, [st.data, odds]);

  const wl = (r) => (r ? `${r.wins}-${r.losses}` : '');
  const pctCell = (v) => (v == null ? '' : <span className="heat" style={{ background: heatColor(v) }}>{v >= 0.999 ? '100' : v < 0.001 ? '0' : (v * 100).toFixed(1)}%</span>);
  const cols = [
    { key: 'name', label: 'Team', left: true, sticky: true, render: (r) => <span className="row" style={{ gap: 6 }}><img src={teamLogo(r.id)} width="18" height="18" alt="" /><TeamLink id={r.id} season={season} name={r.name} /></span> },
    { key: 'W', label: 'W' }, { key: 'L', label: 'L' }, { key: 'pct', label: 'Pct', f: fmt.r3 },
    { key: view === 'wc' ? 'WCGB' : 'GB', label: view === 'wc' ? 'WCGB' : 'GB', get: (r) => (view === 'wc' ? r.WCGB : r.GB), nosort: true },
    { key: 'RS', label: 'RS' }, { key: 'RA', label: 'RA', hb: false }, { key: 'diff', label: 'Diff', f: (v) => (v > 0 ? `+${v}` : v) },
    { key: 'pyth', label: 'xW-L', get: (r) => r.pyth, f: () => '', render: (r) => r.pyth != null ? `${Math.round(r.pyth * (r.W + r.L))}-${Math.round((1 - r.pyth) * (r.W + r.L))}` : '' },
    { key: 'home', label: 'Home', get: (r) => r.home?.pct, render: (r) => wl(r.home) },
    { key: 'away', label: 'Away', get: (r) => r.away?.pct, render: (r) => wl(r.away) },
    { key: 'vsL', label: 'vs LHP', get: (r) => r.vsL?.pct, render: (r) => wl(r.vsL), title: 'Record vs left-handed starters' },
    { key: 'vsR', label: 'vs RHP', get: (r) => r.vsR?.pct, render: (r) => wl(r.vsR), title: 'Record vs right-handed starters' },
    { key: 'l10', label: 'L10', get: (r) => r.l10?.pct, render: (r) => wl(r.l10) }, { key: 'strk', label: 'Strk' },
    ...(withOdds ? [
      { key: 'projW', label: 'Proj W', f: fmt.r1 },
      { key: 'divp', label: 'Div %', render: (r) => pctCell(r.divp) },
      ...(season >= 2022 ? [{ key: 'bye', label: 'Bye %', render: (r) => pctCell(r.bye) }] : []),
      { key: 'po', label: 'Playoff %', render: (r) => pctCell(r.po) },
    ] : []),
  ];

  const groups = [];
  for (const lg of ['AL', 'NL']) {
    if (view === 'div') for (const dv of ['East', 'Central', 'West']) groups.push({ title: `${lg} ${dv}`, rows: records.filter((r) => r.lg === lg && r.div === dv).sort((a, b) => b.pct - a.pct) });
    else if (view === 'wc' || view === 'lg') groups.push({ title: `${lg}${view === 'wc' ? ' Wild Card' : ''}`, rows: records.filter((r) => r.lg === lg).sort((a, b) => b.pct - a.pct) });
  }
  if (view === 'mlb') groups.push({ title: 'MLB', rows: [...records].sort((a, b) => b.pct - a.pct) });

  return (
    <>
      <h1>Standings</h1>
      <div className="row" style={{ marginBottom: 10 }}>
        <SeasonSelect value={season} onChange={changeSeason} />
        <label className="row small">As of <input type="date" value={date} min={SEASON_START(season)} max={SEASON_END(season)} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <Seg value={view} onChange={setView} options={[{ value: 'div', label: 'Division' }, { value: 'wc', label: 'Wild Card' }, { value: 'lg', label: 'League' }, { value: 'mlb', label: 'MLB' }]} />
        <label className="row small"><input type="checkbox" checked={withOdds} onChange={(e) => setWithOdds(e.target.checked)} /> Playoff odds</label>
      </div>
      {withOdds && odds && <div className="muted small">Odds: 4,000 simulations of the {odds.remaining} games left after {date}, log5 on regressed Pythagorean records, {season >= 2022 ? '6-team' : season === 2020 ? '8-team' : '5-team'} league format.</div>}
      {st.error && <Err e={st.error} />}
      {st.loading && <Loading what="standings" />}
      <div className="grid" style={{ marginTop: 10 }}>
        {groups.map((g) => (
          <div key={g.title}>
            <h3>{g.title}</h3>
            <DataTable rows={g.rows} cols={cols} />
          </div>
        ))}
      </div>
    </>
  );
}
