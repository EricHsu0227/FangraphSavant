import { useState } from 'react';
import { getMinors } from '../../lib/mlbapi.js';
import { minorLeagueRows } from '../../lib/player.js';
import { addLines, deriveHitting, derivePitching } from '../../lib/stats.js';
import { PRESETS, statDef } from '../../lib/catalog.js';
import { Seg, usePref, useAsync, Loading, splitOpts, TeamLink } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import ColumnChooser from '../../components/ColumnChooser.jsx';

/** FanGraphs-style season tables: every preset, custom columns, L/R toggle, heat map, minors. */
export default function StatsTab({ id, group, rows }) {
  const [split, setSplit] = useState('all');
  const [preset, setPreset] = usePref(`pstats:preset:${group}`, 'Dashboard');
  const [custom, setCustom] = usePref(`pstats:custom:${group}`, PRESETS[group].Dashboard);
  const [edit, setEdit] = useState(false);
  const [heat, setHeat] = usePref('pstats:heat', false);
  const [minors, setMinors] = useState(false);
  const keys = preset === 'Custom' ? custom : PRESETS[group][preset] || PRESETS[group].Dashboard;
  const data = rows.filter((r) => r.splits[split]).map((r) => ({ ...r.splits[split], _key: r.season, season: r.season, team: r.team, teamId: r.teamId, age: r.age }));
  const total = data.reduce((a, r) => addLines(a, r), {});
  const lastSeason = rows[rows.length - 1]?.season;
  const tot = group === 'hitting' ? deriveHitting(total, lastSeason) : derivePitching(total, lastSeason);
  const cols = [
    { key: 'season', label: 'Season', left: true, sticky: true },
    { key: 'team', label: 'Team', left: true, render: (r) => (r.teamId && !String(r.team).includes('/') ? <TeamLink id={r.teamId} season={r.season} name={r.team} /> : r.team) },
    { key: 'age', label: 'Age' },
    ...keys.filter((k) => k !== 'age').map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f, title: d.desc, hb: d.hb }; }),
  ];
  return (
    <>
      <div className="toolbar">
        <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
        <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Stat group">
          {[...Object.keys(PRESETS[group]), 'Custom'].map((p) => <option key={p}>{p}</option>)}
        </select>
        {preset === 'Custom' && <button className="btn ghost" onClick={() => setEdit((e) => !e)}>{edit ? 'Done' : 'Edit columns'}</button>}
        <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> Heat map</label>
        <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={minors} onChange={(e) => setMinors(e.target.checked)} /> Minor leagues</label>
      </div>
      {preset === 'Custom' && edit && <ColumnChooser group={group} value={custom} onChange={setCustom} />}
      <div style={{ height: 10 }} />
      <DataTable rows={data} cols={cols} totalRow={tot} heat={heat} />
      {minors && <Minors id={id} group={group} />}
    </>
  );
}

function Minors({ id, group }) {
  const m = useAsync(() => getMinors(id, group), [id, group]);
  if (m.loading) return <Loading what="minor league stats" />;
  const rows = minorLeagueRows(m.data, group);
  if (!rows.length) return <div className="empty" style={{ marginTop: 12 }}>No minor league seasons on record.</div>;
  const keys = group === 'hitting' ? ['G', 'PA', 'HR', 'SB', 'BB%', 'K%', 'ISO', 'AVG', 'OBP', 'SLG', 'wOBA'] : ['G', 'GS', 'IP', 'K%', 'BB%', 'K-BB%', 'HR9', 'ERA', 'FIP', 'WHIP'];
  return (
    <>
      <h3>Minor leagues</h3>
      <div className="small muted" style={{ marginBottom: 6 }}>wOBA and FIP use MLB constants, so read them as relative, not level-adjusted.</div>
      <DataTable rows={rows} defaultSort={{ key: 'season', dir: 'desc' }} cols={[
        { key: 'season', label: 'Season', left: true }, { key: 'level', label: 'Lvl', left: true }, { key: 'team', label: 'Team', left: true },
        ...keys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f }; }),
      ]} />
    </>
  );
}
