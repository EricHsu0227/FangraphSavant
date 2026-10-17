import { useMemo, useState } from 'react';
import { loadSeason } from '../lib/data.js';
import { PRESETS, statDef, catalog, qualifies } from '../lib/catalog.js';
import { SEASONS } from '../lib/guts.js';
import { TEAMS } from '../lib/teams.js';
import { today } from '../lib/mlbapi.js';
import { deriveHitting, derivePitching, hitterValueExpected, pitcherValueExpected } from '../lib/stats.js';
import { Seg, useAsync, usePref, Loading, Err, PlayerLink, TeamLink, splitOpts, SourceNote } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import ColumnChooser from '../components/ColumnChooser.jsx';

const COUNTING = new Set(['G', 'GS', 'PA', 'AB', 'H', '1B', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'IBB', 'HBP', 'SO', 'SF', 'SH', 'GIDP', 'SB', 'CS',
  'IP', 'TBF', 'ER', 'W', 'L', 'SV', 'HLD', 'Rallowed', 'fWAR', 'bsr', 'frv', 'oaa', 'RV']);

/** Combine several seasons: sum counting stats, PA-weight everything else, then re-derive. */
function aggregate(perSeason, group, split) {
  const by = new Map();
  for (const { season, rows } of perSeason) {
    for (const r of rows) {
      const l = r.splits?.[split];
      if (!l) continue;
      let a = by.get(r.id);
      if (!a) { a = { id: r.id, name: r.name, teams: new Set(), pos: r.pos, line: {}, w: {}, seasons: 0, last: season, teamId: r.teamId }; by.set(r.id, a); }
      a.teams.add(r.team); a.seasons++; a.last = season; a.teamId = r.teamId;
      const wt = l.PA || l.TBF || 0;
      for (const [k, v] of Object.entries(l)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (COUNTING.has(k)) a.line[k] = (a.line[k] || 0) + v;
        else { a.w[k] = a.w[k] || [0, 0]; a.w[k][0] += v * wt; a.w[k][1] += wt; }
      }
    }
  }
  const out = [];
  for (const a of by.values()) {
    const l = { ...a.line };
    for (const [k, [s, w]] of Object.entries(a.w)) if (w > 0 && !(k in l)) l[k] = s / w;
    for (const k of ['wOBA', 'AVG', 'OBP', 'SLG', 'OPS', 'ISO', 'BABIP', 'ERA', 'WHIP', 'FIP', 'K%', 'BB%', 'wRCplus', 'WAR_FIP', 'WAR_wOBA', 'vWAR', 'eWAR', 'vRAA', 'eRAA', 'valuePlus', 'expectedPlus', 'wRCplusAllowed']) delete l[k];
    const s = a.last;
    const d = group === 'hitting' ? deriveHitting(l, s) : derivePitching(l, s);
    Object.assign(d, group === 'hitting'
      ? hitterValueExpected(d, s, { woba: d.wOBA, xwoba: d.xwOBA, bsr: l.bsr, frv: l.frv })
      : pitcherValueExpected(d, s, { woba: d.wOBA, xwoba: d.xwOBA }));
    out.push({ id: a.id, name: a.name, team: [...a.teams].filter(Boolean).join('/'), teamId: a.teamId, pos: a.pos, splits: { [split]: d } });
  }
  return out;
}

export default function Leaderboards() {
  const [group, setGroup] = usePref('lb:group', 'hitting');
  const cur = Math.min(SEASONS[SEASONS.length - 1], Number(today().slice(0, 4)));
  const [from, setFrom] = usePref('lb:from', cur);
  const [to, setTo] = usePref('lb:to', cur);
  const [split, setSplit] = useState('all');
  const [team, setTeam] = useState('');
  const [pos, setPos] = useState('');
  const [minMode, setMinMode] = useState('qual');
  const [minVal, setMinVal] = useState(100);
  const [preset, setPreset] = usePref(`lb:preset:${group}`, 'Dashboard');
  const [custom, setCustom] = usePref(`lb:custom:${group}`, PRESETS[group].Dashboard);
  const [editCols, setEditCols] = useState(false);
  const [name, setName] = useState('');
  const [filters, setFilters] = useState([]);

  const seasons = SEASONS.filter((s) => s >= Math.min(from, to) && s <= Math.max(from, to));
  const data = useAsync(async () => Promise.all(seasons.map(async (s) => ({ season: s, rows: await loadSeason(s, group) }))), [group, from, to]);

  const rows = useMemo(() => {
    if (!data.data) return [];
    let rs = seasons.length === 1 ? data.data[0].rows : aggregate(data.data, group, split);
    const single = seasons.length === 1 ? seasons[0] : null;
    rs = rs.filter((r) => {
      const l = r.splits?.[split];
      if (!l) return false;
      if (team && String(r.teamId) !== team) return false;
      if (pos && group === 'hitting' && r.pos !== pos) return false;
      if (pos && group === 'pitching' && ((pos === 'SP') !== ((l.GS || 0) >= (l.G || 1) / 2))) return false;
      if (name && !r.name.toLowerCase().includes(name.toLowerCase())) return false;
      if (minMode === 'qual') {
        if (split === 'all' && single) { if (!qualifies(group, r, single)) return false; }
        else if ((l.PA || l.TBF || 0) < (split === 'all' ? 300 * seasons.length : 100)) return false;
      } else if (minMode === 'min') {
        const v = group === 'hitting' ? l.PA : l.IP;
        if ((v || 0) < minVal) return false;
      }
      for (const f of filters) {
        const v = l[f.key];
        if (f.val === '' || f.val == null) continue;
        if (typeof v !== 'number') return false;
        const num = Number(f.val) / (statDef(group, f.key).f === statDef(group, 'K%').f && Number(f.val) > 1 ? 100 : 1);
        if (f.op === '>=' && !(v >= num)) return false;
        if (f.op === '<=' && !(v <= num)) return false;
      }
      return true;
    });
    return rs.map((r) => ({ ...r, ...r.splits[split], _key: r.id, name: r.name, team: r.team, teamId: r.teamId, pos: r.pos }));
  }, [data.data, split, team, pos, minMode, minVal, name, filters, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys = preset === 'Custom' ? custom : PRESETS[group][preset] || PRESETS[group].Dashboard;
  const cols = [
    { key: 'name', label: 'Name', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
    { key: 'team', label: 'Team', left: true, render: (r) => (seasons.length === 1 ? <TeamLink id={r.teamId} season={seasons[0]} name={r.team} /> : r.team) },
    ...(group === 'hitting' ? [{ key: 'pos', label: 'Pos', left: true }] : []),
    ...keys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f, hb: d.hb, title: d.desc }; }),
  ];
  const sortKey = keys.includes('wRCplus') ? 'wRCplus' : keys.includes('WAR_wOBA') ? 'WAR_wOBA' : keys[keys.length - 1];
  const source = data.data?.[data.data.length - 1]?.rows?.source;

  return (
    <>
      <h1>Leaderboards</h1>
      <div className="panel">
        <div className="row">
          <Seg value={group} onChange={(g) => { setGroup(g); setFilters([]); }} options={[{ value: 'hitting', label: 'Batters' }, { value: 'pitching', label: 'Pitchers' }]} />
          <label className="row small">Seasons
            <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{SEASONS.map((s) => <option key={s}>{s}</option>)}</select>–
            <select value={to} onChange={(e) => setTo(Number(e.target.value))}>{SEASONS.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All teams</option>{TEAMS.map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}
          </select>
          <select value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="">All positions</option>
            {(group === 'hitting' ? ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] : ['SP', 'RP']).map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={minMode} onChange={(e) => setMinMode(e.target.value)}>
            <option value="qual">Qualified</option><option value="min">Min {group === 'hitting' ? 'PA' : 'IP'}</option><option value="all">All</option>
          </select>
          {minMode === 'min' && <input type="number" style={{ width: 80 }} value={minVal} onChange={(e) => setMinVal(Number(e.target.value))} />}
          <input type="text" placeholder="Player name…" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small muted">Stat filters:</span>
          {filters.map((f, i) => (
            <span key={i} className="row" style={{ gap: 4 }}>
              <select value={f.key} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}>
                {catalog(group).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select value={f.op} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}><option>{'>='}</option><option>{'<='}</option></select>
              <input type="number" step="any" style={{ width: 80 }} value={f.val} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, val: e.target.value } : x)))} />
              <button className="btn ghost" onClick={() => setFilters(filters.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
          <button className="btn ghost" onClick={() => setFilters([...filters, { key: group === 'hitting' ? 'xwOBA' : 'xwOBA', op: group === 'hitting' ? '>=' : '<=', val: '' }])}>+ Add filter</button>
        </div>
      </div>
      <div className="tabs">
        {[...Object.keys(PRESETS[group]), 'Custom'].map((p) => (
          <button key={p} className={preset === p ? 'on' : ''} onClick={() => { setPreset(p); if (p === 'Custom') setEditCols(true); }}>{p}</button>
        ))}
        {preset === 'Custom' && <button onClick={() => setEditCols((e) => !e)}>{editCols ? 'Hide stat picker' : 'Edit columns'}</button>}
      </div>
      {preset === 'Custom' && editCols && <ColumnChooser group={group} value={custom} onChange={setCustom} />}
      <SourceNote source={source} />
      {data.error && <Err e={data.error} />}
      {data.loading ? <Loading what="leaderboard" /> : (
        <>
          <div className="muted small" style={{ marginBottom: 6 }}>{rows.length} players · click any header to sort · cells shaded by percentile within the table</div>
          <DataTable key={`${group}-${preset}-${split}`} rows={rows} cols={cols} defaultSort={{ key: sortKey, dir: statDef(group, sortKey).hb === false ? 'asc' : 'desc' }} heat rank limit={100} />
        </>
      )}
    </>
  );
}
