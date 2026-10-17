import { useMemo, useState } from 'react';
import { LEVELS, milbLeaders } from '../lib/milb.js';
import { fmt } from '../lib/catalog.js';
import { usePref, splitOpts } from '../components/ui.jsx';
import { loadProspects } from '../lib/data.js';
import { TEAMS, teamById } from '../lib/teams.js';
import { SEASONS } from '../lib/guts.js';
import { useAsync, Loading, PlayerLink, Seg } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';

const HIT_TOOLS = ['Hit', 'Game Pwr', 'Raw Pwr', 'Spd', 'Fld', 'Arm'];
const PIT_TOOLS = ['FB', 'SL', 'CB', 'CH', 'CT', 'SPL', 'CMD'];

export default function Prospects() {
  const [tab, setTab] = usePref('prospects:tab', 'milb');
  return (
    <>
      <h1>Prospects & minors</h1>
      <div className="tabs">
        {[['milb', 'Minor league leaders'], ['board', 'Prospect board'], ['orgs', 'Farm systems']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'milb' && <MilbLeaders />}
      {tab === 'board' && <Board />}
      {tab === 'orgs' && <Farms />}
    </>
  );
}

function Board() {
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

/** Live MiLB leaderboards with level-adjusted wOBA / wRC+ / FIP- and age vs league. */
function MilbLeaders() {
  const cur = SEASONS[SEASONS.length - 1];
  const [season, setSeason] = useState(cur);
  const [level, setLevel] = usePref('milb:level', 11);
  const [group, setGroup] = usePref('milb:group', 'hitting');
  const [split, setSplit] = useState('all');
  const [org, setOrg] = useState('');
  const [minPA, setMinPA] = useState(150);
  const [young, setYoung] = useState(false);
  const data = useAsync(() => milbLeaders(season, level, group, split), [season, level, group, split]);
  const hitting = group === 'hitting';
  const rows = useMemo(() => (data.data || []).filter((r) => {
    if (org && String(r.org) !== org) return false;
    if (hitting ? (r.PA || 0) < minPA : (r.IP || 0) < minPA / 3) return false;
    if (young && !(r.ageRel != null && r.ageRel <= -1.5)) return false;
    return true;
  }), [data.data, org, minPA, young, hitting]);
  const age = [{ key: 'age', label: 'Age', f: (v) => (v == null ? '' : v.toFixed(1)) },
    { key: 'ageRel', label: 'vs Lg', title: 'Years younger (−) or older (+) than the league’s playing-time-weighted average', f: (v) => (v == null ? '' : (v > 0 ? '+' : '') + v.toFixed(1)), hb: false }];
  const cols = hitting ? [
    ...age, { key: 'PA', label: 'PA' }, { key: 'HR', label: 'HR' }, { key: 'SB', label: 'SB' },
    { key: 'BB%', label: 'BB%', f: fmt.pct, hb: true }, { key: 'K%', label: 'K%', f: fmt.pct, hb: false }, { key: 'ISO', label: 'ISO', f: fmt.r3, hb: true },
    { key: 'AVG', label: 'AVG', f: fmt.r3, hb: true }, { key: 'OBP', label: 'OBP', f: fmt.r3, hb: true }, { key: 'SLG', label: 'SLG', f: fmt.r3, hb: true },
    { key: 'wOBA', label: 'wOBA', f: fmt.r3, hb: true, title: 'MLB weights rescaled to this league' }, { key: 'wRCplus', label: 'wRC+', hb: true, title: '100 = this league’s average' },
  ] : [
    ...age, { key: 'G', label: 'G' }, { key: 'GS', label: 'GS' }, { key: 'IP', label: 'IP', f: fmt.ip },
    { key: 'K%', label: 'K%', f: fmt.pct, hb: true }, { key: 'BB%', label: 'BB%', f: fmt.pct, hb: false }, { key: 'K-BB%', label: 'K-BB%', f: fmt.pct, hb: true },
    { key: 'Kplus', label: 'K%+', hb: true, title: 'K% vs league, 100 = average' }, { key: 'HR9', label: 'HR/9', f: fmt.r2, hb: false },
    { key: 'ERA', label: 'ERA', f: fmt.r2, hb: false }, { key: 'FIP', label: 'FIP', f: fmt.r2, hb: false, title: 'League-specific FIP constant' },
    { key: 'ERAminus', label: 'ERA-', hb: false }, { key: 'FIPminus', label: 'FIP-', hb: false }, { key: 'wRCplusAllowed', label: 'wRC+ a', hb: false },
  ];
  return (
    <>
      <div className="toolbar">
        <select value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{[...SEASONS].reverse().map((s) => <option key={s}>{s}</option>)}</select>
        <Seg value={level} onChange={setLevel} options={LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
        <Seg value={group} onChange={setGroup} options={[{ value: 'hitting', label: 'Hitters' }, { value: 'pitching', label: 'Pitchers' }]} />
        <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
        <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Organization"><option value="">All orgs</option>{TEAMS.map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}</select>
        <label className="row small" style={{ gap: 4 }}>Min {hitting ? 'PA' : 'IP×3'} <input type="number" style={{ width: 70 }} value={minPA} onChange={(e) => setMinPA(Number(e.target.value))} /></label>
        <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={young} onChange={(e) => setYoung(e.target.checked)} /> 1.5+ yrs young for level</label>
      </div>
      <div style={{ height: 8 }} />
      {data.loading ? <Loading what="minor league stats" /> : data.error ? <div className="notice">Couldn’t load minor league stats: {String(data.error.message || data.error)}</div> : (
        <>
          <div className="small muted" style={{ marginBottom: 6 }}>{rows.length} players · wOBA, wRC+, FIP and ERA-/FIP- are computed against each league’s own run environment, so they compare fairly across the PCL and the International League, or High-A and AA.</div>
          <DataTable rows={rows} heat rank limit={100} defaultSort={{ key: hitting ? 'wRCplus' : 'FIPminus', dir: hitting ? 'desc' : 'asc' }} cols={[
            { key: 'name', label: 'Name', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} hand={hitting ? r.bats : r.throws} /> },
            { key: 'org', label: 'Org', left: true, get: (r) => teamById[r.org]?.abbr || '' },
            { key: 'team', label: 'Team', left: true }, { key: 'pos', label: 'Pos', left: true },
            ...cols,
          ]} />
        </>
      )}
    </>
  );
}

/** Farm-system view: prospects per org with FV totals, plus each org's top names. */
function Farms() {
  const [year, setYear] = useState(SEASONS[SEASONS.length - 1]);
  const data = useAsync(() => loadProspects(year), [year]);
  const fv = (p) => (typeof p.fv === 'string' ? parseInt(p.fv, 10) + (p.fv.includes('+') ? 2.5 : 0) : Number(p.fv) || 0);
  const orgs = useMemo(() => {
    const m = new Map();
    for (const p of data.data || []) {
      const id = p.orgId; if (!id) continue;
      const o = m.get(id) || { id, _key: id, n: 0, f50: 0, f55: 0, top100: 0, pts: 0, list: [] };
      const v = fv(p);
      o.n++; if (v >= 50) o.f50++; if (v >= 55) o.f55++; if (p.rank && p.rank <= 100) o.top100++;
      // surplus-style points: FV above 40, convex so stars count more
      o.pts += Math.max(0, v - 40) ** 1.5;
      o.list.push(p);
      m.set(id, o);
    }
    return [...m.values()].map((o) => ({ ...o, list: o.list.sort((a, b) => fv(b) - fv(a)).slice(0, 5) }));
  }, [data.data]);
  return (
    <>
      <div className="toolbar"><select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[...SEASONS].reverse().map((s) => <option key={s}>{s}</option>)}</select></div>
      {data.loading ? <Loading /> : !orgs.length ? <div className="notice">No {year} prospect list in the data yet, so farm-system rankings can’t be computed. The minor league leaders tab works without it.</div> : (
        <DataTable rows={orgs} rank defaultSort={{ key: 'pts', dir: 'desc' }} cols={[
          { key: 'org', label: 'Org', left: true, sticky: true, get: (o) => teamById[o.id]?.name || o.id },
          { key: 'pts', label: 'Farm score', f: (v) => Math.round(v), title: 'Sum of (FV−40)^1.5 across the org’s ranked prospects' },
          { key: 'top100', label: 'Top 100' }, { key: 'f55', label: '55+ FV' }, { key: 'f50', label: '50+ FV' }, { key: 'n', label: 'Ranked' },
          { key: 'list', label: 'Best prospects', left: true, nosort: true, render: (o) => o.list.map((p, i) => <span key={i}>{i ? ', ' : ''}<PlayerLink id={p.id} name={p.name} /> <span className="muted small">{p.fv}</span></span>) },
        ]} />
      )}
    </>
  );
}
