import { useState } from 'react';
import { loadProspects } from '../lib/data.js';
import { TEAMS, teamById } from '../lib/teams.js';
import { SEASONS } from '../lib/guts.js';
import { useAsync, Loading, PlayerLink, Seg } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';

const HIT_TOOLS = ['Hit', 'Game Pwr', 'Raw Pwr', 'Spd', 'Fld', 'Arm'];
const PIT_TOOLS = ['FB', 'SL', 'CB', 'CH', 'CT', 'SPL', 'CMD'];

export default function Prospects() {
  const [year, setYear] = useState(SEASONS[SEASONS.length - 1]);
  const [org, setOrg] = useState('');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const data = useAsync(() => loadProspects(year), [year]);
  let rows = (data.data || []).map((p) => ({ ...p, _key: p.id || p.name, isP: /P$/.test(p.pos || '') }));
  if (org) rows = rows.filter((p) => String(p.orgId) === org);
  if (kind === 'hit') rows = rows.filter((p) => !p.isP);
  if (kind === 'pit') rows = rows.filter((p) => p.isP);
  if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const tools = kind === 'pit' ? PIT_TOOLS : kind === 'hit' ? HIT_TOOLS : [];
  return (
    <>
      <h1>Prospects</h1>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[...SEASONS].reverse().map((s) => <option key={s}>{s}</option>)}</select>
        <select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">All orgs</option>{TEAMS.map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}</select>
        <Seg value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'hit', label: 'Hitters' }, { value: 'pit', label: 'Pitchers' }]} />
        <input type="text" placeholder="Name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {data.loading && <Loading what="prospects" />}
      {!data.loading && !data.data && (
        <div className="notice">No {year} prospect list in the data yet. The pipeline pulls FanGraphs’ The Board each night; you can also drop a file at <code>public/data/prospects/{year}.json</code> (format in the README).</div>
      )}
      {data.data && (
        <>
          <DataTable rows={rows} defaultSort={{ key: org ? 'orgRank' : 'rank', dir: 'asc' }} limit={100} cols={[
            { key: 'rank', label: 'Rk', hb: false }, { key: 'orgRank', label: 'Org Rk', hb: false },
            { key: 'name', label: 'Name', left: true, sticky: true, render: (p) => <><PlayerLink id={p.id} name={p.name} /> <a className="small" onClick={() => setOpen(open === p._key ? null : p._key)} style={{ cursor: 'pointer' }}>{open === p._key ? '▾' : '▸'}</a>{open === p._key && <div className="small muted" style={{ whiteSpace: 'normal', maxWidth: 520 }}>{p.blurb || 'No report.'}</div>}</> },
            { key: 'orgId', label: 'Org', left: true, get: (p) => teamById[p.orgId]?.abbr || p.org },
            { key: 'pos', label: 'Pos', left: true }, { key: 'age', label: 'Age', f: (v) => (v == null ? '' : Number(v).toFixed(1)) },
            { key: 'level', label: 'Level', left: true }, { key: 'eta', label: 'ETA' },
            ...tools.map((t) => ({ key: t, label: t, get: (p) => p.tools?.[t], left: true })),
            { key: 'fv', label: 'FV', get: (p) => (typeof p.fv === 'string' ? parseInt(p.fv, 10) + (p.fv.includes('+') ? 0.5 : 0) : p.fv), render: (p) => <b>{p.fv}</b> },
          ]} />
        </>
      )}
    </>
  );
}
