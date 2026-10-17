import { useMemo, useState } from 'react';
import { loadSeason, loadTeamSeason, loadArsenal } from '../lib/data.js';
import { PRESETS, statDef, catalog, qualifies, PITCH_NAME, fmt } from '../lib/catalog.js';
import { SEASONS } from '../lib/guts.js';
import { TEAMS, teamById } from '../lib/teams.js';
import { today } from '../lib/mlbapi.js';
import { deriveHitting, derivePitching, hitterValueExpected, pitcherValueExpected } from '../lib/stats.js';
import { Seg, useAsync, usePref, Loading, Err, PlayerLink, TeamLink, splitOpts, SourceNote } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import ColumnChooser from '../components/ColumnChooser.jsx';
import { PitchDot } from '../components/charts.jsx';

const COUNTING = new Set(['G', 'GS', 'PA', 'AB', 'H', '1B', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'IBB', 'HBP', 'SO', 'SF', 'SH', 'GIDP', 'SB', 'CS',
  'IP', 'TBF', 'ER', 'W', 'L', 'SV', 'HLD', 'Rallowed', 'fWAR', 'bsr', 'frv', 'oaa', 'RV', 'WPA', 'RE24', 'heartRV', 'shadowRV', 'chaseRV',
  'wasteRV', 'Swing RV', 'Take RV', 'BBE', 'pitches']);
const DERIVED = ['wOBA', 'AVG', 'OBP', 'SLG', 'OPS', 'ISO', 'BABIP', 'ERA', 'WHIP', 'FIP', 'K%', 'BB%', 'K-BB%', 'wRCplus', 'WAR_FIP', 'WAR_wOBA',
  'vWAR', 'eWAR', 'vRAA', 'eRAA', 'valuePlus', 'expectedPlus', 'wRCplusAllowed', 'xwRCplus', 'xwRCplusAllowed', 'wRAA', 'K9', 'BB9', 'HR9', 'xFIP', 'xERA'];

/** Combine seasons: sum counting stats, PA-weight rates, then re-derive. */
function aggregate(perSeason, group, split, splitSeasons) {
  const by = new Map();
  for (const { season, rows } of perSeason) {
    for (const r of rows) {
      const l = r.splits?.[split];
      if (!l) continue;
      const key = splitSeasons ? `${r.id}-${season}` : r.id;
      let a = by.get(key);
      if (!a) { a = { id: r.id, name: r.name, teams: new Set(), pos: r.pos, bats: r.bats, throws: r.throws, age: r.age, rookie: r.rookie, line: {}, w: {}, last: season, teamId: r.teamId, season }; by.set(key, a); }
      a.teams.add(r.team); a.last = season; a.teamId = r.teamId; a.age = r.age;
      const wt = l.PA || l.TBF || 0;
      for (const [k, v] of Object.entries(l)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (COUNTING.has(k)) a.line[k] = (a.line[k] || 0) + v;
        else { a.w[k] = a.w[k] || [0, 0]; a.w[k][0] += v * wt; a.w[k][1] += wt; }
      }
    }
  }
  const out = [];
  for (const [key, a] of by.entries()) {
    const l = { ...a.line };
    for (const [k, [s, w]] of Object.entries(a.w)) if (w > 0 && !(k in l)) l[k] = s / w;
    for (const k of DERIVED) delete l[k];
    const s = a.last;
    const d = group === 'hitting' ? deriveHitting(l, s) : derivePitching(l, s);
    Object.assign(d, group === 'hitting'
      ? hitterValueExpected(d, s, { woba: d.wOBA, xwoba: d.xwOBA, bsr: l.bsr, frv: l.frv })
      : pitcherValueExpected(d, s, { woba: d.wOBA, xwoba: d.xwOBA }));
    out.push({ ...a, _key: key, team: [...a.teams].filter(Boolean).join('/'), splits: { [split]: d } });
  }
  return out;
}

function toCSV(rows, cols) {
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = cols.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => {
    const v = c.get ? c.get(r) : r[c.key];
    return esc(typeof v === 'number' && c.f ? c.f(v) : v);
  }).join(',')).join('\n');
  return `${head}\n${body}`;
}
function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Leaderboards() {
  const cur = Math.min(SEASONS[SEASONS.length - 1], Number(today().slice(0, 4)));
  const [scope, setScope] = usePref('lb:scope', 'players');
  const [group, setGroup] = usePref('lb:group', 'hitting');
  const [from, setFrom] = usePref('lb:from', cur);
  const [to, setTo] = usePref('lb:to', cur);
  const [splitSeasons, setSplitSeasons] = useState(false);
  const [split, setSplit] = useState('all');
  const [lg, setLg] = useState('');
  const [team, setTeam] = useState('');
  const [pos, setPos] = useState('');
  const [hand, setHand] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [rookies, setRookies] = useState(false);
  const [minMode, setMinMode] = useState('qual');
  const [minVal, setMinVal] = useState(100);
  const [preset, setPreset] = usePref(`lb:preset:${group}`, 'Dashboard');
  const [custom, setCustom] = usePref(`lb:custom:${group}`, PRESETS[group].Dashboard);
  const [reports, setReports] = usePref('lb:reports', []);
  const [editCols, setEditCols] = useState(false);
  const [name, setName] = useState('');
  const [filters, setFilters] = useState([]);
  const [heat, setHeat] = usePref('lb:heat', true);
  const [pageSize, setPageSize] = usePref('lb:page', 50);
  const [showFilters, setShowFilters] = useState(false);

  const seasons = SEASONS.filter((s) => s >= Math.min(from, to) && s <= Math.max(from, to));
  const data = useAsync(async () => {
    if (scope === 'pitches') return null;
    if (scope === 'teams') return Promise.all(seasons.map(async (s) => ({ season: s, rows: await loadTeamSeason(s, group) })));
    return Promise.all(seasons.map(async (s) => ({ season: s, rows: await loadSeason(s, group) })));
  }, [scope, group, from, to]);

  const rows = useMemo(() => {
    if (!data.data) return [];
    if (scope === 'league') {
      return data.data.map(({ season, rows }) => ({ ...(rows.league?.[split] || {}), _key: season, season, name: `${season} MLB` }));
    }
    let rs;
    if (scope === 'teams') {
      rs = splitSeasons || seasons.length === 1
        ? data.data.flatMap(({ season, rows }) => rows.map((r) => ({ ...r, season, _key: `${r.id}-${season}` })))
        : aggregate(data.data, group, split, false);
    } else {
      rs = seasons.length === 1 ? data.data[0].rows.map((r) => ({ ...r, season: seasons[0], _key: r.id })) : aggregate(data.data, group, split, splitSeasons);
    }
    const single = seasons.length === 1 || splitSeasons;
    rs = rs.filter((r) => {
      const l = r.splits?.[split];
      if (!l) return false;
      const tm = teamById[r.teamId];
      if (lg && tm?.lg !== lg) return false;
      if (team && String(r.teamId) !== team) return false;
      if (scope === 'players') {
        if (pos && group === 'hitting' && r.pos !== pos) return false;
        if (pos && group === 'pitching' && ((pos === 'SP') !== ((l.GS || 0) >= (l.G || 1) / 2))) return false;
        if (hand && (group === 'hitting' ? r.bats : r.throws) !== hand) return false;
        if (ageMin && (r.age == null || r.age < Number(ageMin))) return false;
        if (ageMax && (r.age == null || r.age > Number(ageMax))) return false;
        if (rookies && !r.rookie) return false;
        if (name && !r.name.toLowerCase().includes(name.toLowerCase())) return false;
        if (minMode === 'qual') {
          if (split === 'all' && single) { if (!qualifies(group, r, r.season)) return false; }
          else if ((l.PA || l.TBF || 0) < (split === 'all' ? 300 * seasons.length : 100 * (single ? 1 : seasons.length))) return false;
        } else if (minMode === 'min') {
          const v = group === 'hitting' ? l.PA : l.IP;
          if ((v || 0) < minVal) return false;
        }
      }
      for (const f of filters) {
        if (f.val === '' || f.val == null) continue;
        const v = l[f.key];
        if (typeof v !== 'number') return false;
        const isPct = statDef(group, f.key).f === fmt.pct;
        const num = Number(f.val) / (isPct && Math.abs(Number(f.val)) > 1 ? 100 : 1);
        if (f.op === '>=' && !(v >= num)) return false;
        if (f.op === '<=' && !(v <= num)) return false;
      }
      return true;
    });
    return rs.map((r) => ({ ...r, ...r.splits[split], _key: r._key, name: r.name, team: r.team, teamId: r.teamId, pos: r.pos, season: r.season }));
  }, [data.data, scope, split, lg, team, pos, hand, ageMin, ageMax, rookies, minMode, minVal, name, filters, group, splitSeasons]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys = preset === 'Custom' ? custom : PRESETS[group][preset] || PRESETS[group].Dashboard;
  const showSeason = scope === 'league' || splitSeasons || (scope === 'teams' && seasons.length > 1 && splitSeasons);
  const cols = [
    ...(scope === 'league' ? [{ key: 'season', label: 'Season', left: true, sticky: true }] : []),
    ...(scope === 'players' ? [{ key: 'name', label: 'Name', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} hand={group === 'hitting' ? r.bats : r.throws} /> }] : []),
    ...(scope === 'teams' ? [{ key: 'name', label: 'Team', left: true, sticky: true, render: (r) => <TeamLink id={r.teamId} season={r.season} name={r.name} /> }] : []),
    ...(showSeason && scope !== 'league' ? [{ key: 'season', label: 'Season', left: true }] : []),
    ...(scope === 'players' ? [{ key: 'team', label: 'Team', left: true, render: (r) => (seasons.length === 1 || splitSeasons ? <TeamLink id={r.teamId} season={r.season} name={r.team} /> : r.team) }] : []),
    ...(scope === 'players' && group === 'hitting' ? [{ key: 'pos', label: 'Pos', left: true }] : []),
    ...(scope === 'players' ? [{ key: 'age', label: 'Age' }] : []),
    ...keys.filter((k) => k !== 'age').map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f, hb: d.hb, title: d.desc }; }),
  ];
  const sortKey = keys.includes('wRCplus') ? 'wRCplus' : keys.includes('WAR_wOBA') ? 'WAR_wOBA' : keys[keys.length - 1];
  const source = data.data?.[data.data.length - 1]?.rows?.source;

  const saveReport = () => {
    const label = (document.getElementById('report-name')?.value || '').trim() || `${group === 'hitting' ? 'Bat' : 'Pit'} ${preset} ${new Date().toLocaleDateString()}`;
    setReports([...reports.filter((r) => r.label !== label), { label, group, preset, custom, split, filters, minMode, minVal, pos, hand }]);
  };
  const loadReport = (r) => {
    setGroup(r.group); setPreset(r.preset); if (r.custom) setCustom(r.custom); setSplit(r.split || 'all');
    setFilters(r.filters || []); setMinMode(r.minMode || 'qual'); setMinVal(r.minVal || 100); setPos(r.pos || ''); setHand(r.hand || '');
  };

  return (
    <>
      <h1>Leaderboards</h1>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <Seg value={scope} onChange={setScope} options={[{ value: 'players', label: 'Players' }, { value: 'teams', label: 'Teams' }, { value: 'league', label: 'League' }, { value: 'pitches', label: 'Pitch Types' }]} />
        {scope !== 'pitches' && <Seg value={group} onChange={(g) => { setGroup(g); setFilters([]); setPos(''); }} options={[{ value: 'hitting', label: 'Batting' }, { value: 'pitching', label: 'Pitching' }]} />}
      </div>
      {scope === 'pitches' ? <PitchBoard /> : (
        <>
          <div className="panel">
            <div className="toolbar">
              <label className="row small" style={{ gap: 4 }}>Seasons
                <select value={from} onChange={(e) => setFrom(Number(e.target.value))} aria-label="From season">{SEASONS.map((s) => <option key={s}>{s}</option>)}</select>–
                <select value={to} onChange={(e) => setTo(Number(e.target.value))} aria-label="To season">{SEASONS.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
              {seasons.length > 1 && scope !== 'league' && <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={splitSeasons} onChange={(e) => setSplitSeasons(e.target.checked)} /> Split seasons</label>}
              <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
              {scope === 'players' && (
                <>
                  <select value={minMode} onChange={(e) => setMinMode(e.target.value)} aria-label="Playing time">
                    <option value="qual">Qualified</option><option value="min">Min {group === 'hitting' ? 'PA' : 'IP'}</option><option value="all">All</option>
                  </select>
                  {minMode === 'min' && <input type="number" style={{ width: 80 }} value={minVal} onChange={(e) => setMinVal(Number(e.target.value))} aria-label="Minimum" />}
                  <input type="search" placeholder="Player…" value={name} onChange={(e) => setName(e.target.value)} aria-label="Player name" style={{ width: 140 }} />
                </>
              )}
              <button className="btn ghost" onClick={() => setShowFilters((s) => !s)}>{showFilters ? 'Fewer filters' : 'More filters'}{filters.length ? ` (${filters.length})` : ''}</button>
            </div>
            {showFilters && (
              <div className="toolbar" style={{ marginTop: 10 }}>
                <select value={lg} onChange={(e) => setLg(e.target.value)} aria-label="League"><option value="">MLB</option><option value="AL">AL</option><option value="NL">NL</option></select>
                {scope !== 'league' && <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team"><option value="">All teams</option>{TEAMS.map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}</select>}
                {scope === 'players' && (
                  <>
                    <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position">
                      <option value="">All positions</option>
                      {(group === 'hitting' ? ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] : ['SP', 'RP']).map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <select value={hand} onChange={(e) => setHand(e.target.value)} aria-label={group === 'hitting' ? 'Bats' : 'Throws'}>
                      <option value="">{group === 'hitting' ? 'All hitters' : 'All pitchers'}</option>
                      <option value="L">{group === 'hitting' ? 'Bats L' : 'LHP'}</option><option value="R">{group === 'hitting' ? 'Bats R' : 'RHP'}</option>
                      {group === 'hitting' && <option value="S">Switch</option>}
                    </select>
                    <label className="row small" style={{ gap: 4 }}>Age <input type="number" style={{ width: 60 }} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} aria-label="Min age" />–<input type="number" style={{ width: 60 }} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} aria-label="Max age" /></label>
                    <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={rookies} onChange={(e) => setRookies(e.target.checked)} /> Rookies</label>
                  </>
                )}
                <span className="small muted">Stat filters:</span>
                {filters.map((f, i) => (
                  <span key={i} className="row" style={{ gap: 4 }}>
                    <select value={f.key} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} aria-label="Filter stat">
                      {catalog(group).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <select value={f.op} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))} aria-label="Operator"><option>{'>='}</option><option>{'<='}</option></select>
                    <input type="number" step="any" style={{ width: 80 }} value={f.val} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, val: e.target.value } : x)))} aria-label="Value" />
                    <button className="btn ghost" onClick={() => setFilters(filters.filter((_, j) => j !== i))} aria-label="Remove filter">×</button>
                  </span>
                ))}
                <button className="btn ghost" onClick={() => setFilters([...filters, { key: 'xwOBA', op: group === 'hitting' ? '>=' : '<=', val: '' }])}>+ Stat filter</button>
              </div>
            )}
          </div>
          <div className="tabs">
            {[...Object.keys(PRESETS[group]), 'Custom'].map((p) => (
              <button key={p} className={preset === p ? 'on' : ''} onClick={() => { setPreset(p); if (p === 'Custom') setEditCols(true); }}>{p}</button>
            ))}
          </div>
          {preset === 'Custom' && (
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <button className="btn ghost" onClick={() => setEditCols((e) => !e)}>{editCols ? 'Hide stat picker' : 'Edit columns'}</button>
            </div>
          )}
          {preset === 'Custom' && editCols && <ColumnChooser group={group} value={custom} onChange={setCustom} />}
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <span className="small muted">{rows.length} {scope === 'players' ? 'players' : scope === 'teams' ? 'teams' : 'seasons'}</span>
            <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> Heat map</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">{[30, 50, 100, 200, 100000].map((n) => <option key={n} value={n}>{n > 1000 ? 'All rows' : `${n} rows`}</option>)}</select>
            <button className="btn ghost" onClick={() => download(`platoon-${scope}-${group}-${seasons[0]}${seasons.length > 1 ? '-' + seasons[seasons.length - 1] : ''}.csv`, toCSV(rows, cols))}>Export CSV</button>
            <span className="row" style={{ gap: 4 }}>
              <input id="report-name" type="text" placeholder="Report name" style={{ width: 130 }} aria-label="Report name" />
              <button className="btn ghost" onClick={saveReport}>Save report</button>
            </span>
            {reports.length > 0 && (
              <select value="" onChange={(e) => { const r = reports.find((x) => x.label === e.target.value); if (r) loadReport(r); }} aria-label="Saved reports">
                <option value="">Saved reports…</option>{reports.map((r) => <option key={r.label}>{r.label}</option>)}
              </select>
            )}
          </div>
          <SourceNote source={source} />
          {data.error && <Err e={data.error} />}
          {data.loading ? <Loading what="leaderboard" /> : (
            <DataTable key={`${scope}-${group}-${preset}-${split}-${pageSize}`} rows={rows} cols={cols}
              defaultSort={scope === 'league' ? { key: 'season', dir: 'desc' } : { key: sortKey, dir: statDef(group, sortKey).hb === false ? 'asc' : 'desc' }}
              heat={heat && scope !== 'league'} rank={scope !== 'league'} limit={pageSize} />
          )}
        </>
      )}
    </>
  );
}

/** FanGraphs "Pitch Type" / Savant "Pitch Arsenal" leaderboard — every pitch, by batter hand. */
function PitchBoard() {
  const cur = Math.min(SEASONS[SEASONS.length - 1], Number(today().slice(0, 4)));
  const [season, setSeason] = usePref('pb:season', cur);
  const [pt, setPt] = usePref('pb:pt', 'SL');
  const [split, setSplit] = useState('all');
  const [minN, setMinN] = useState(200);
  const [throws, setThrows] = useState('');
  const data = useAsync(() => loadArsenal(season), [season]);
  const types = useMemo(() => [...new Set((data.data || []).map((r) => r.pt))].sort(), [data.data]);
  const rows = (data.data || []).filter((r) => r.split === split && (pt === 'ALL' || r.pt === pt) && r.n >= minN && (!throws || r.throws === throws))
    .map((r) => ({ ...r, _key: `${r.id}-${r.pt}` }));
  return (
    <>
      <div className="panel">
        <div className="toolbar">
          <select value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{[...SEASONS].reverse().map((s) => <option key={s}>{s}</option>)}</select>
          <select value={pt} onChange={(e) => setPt(e.target.value)} aria-label="Pitch type">
            <option value="ALL">All pitch types</option>{types.map((t) => <option key={t} value={t}>{PITCH_NAME[t] || t}</option>)}
          </select>
          <Seg value={split} onChange={setSplit} options={[{ value: 'all', label: 'All' }, { value: 'vL', label: 'vs LHB' }, { value: 'vR', label: 'vs RHB' }]} />
          <select value={throws} onChange={(e) => setThrows(e.target.value)} aria-label="Throws"><option value="">LHP + RHP</option><option value="L">LHP</option><option value="R">RHP</option></select>
          <label className="row small" style={{ gap: 4 }}>Min pitches <input type="number" style={{ width: 80 }} value={minN} onChange={(e) => setMinN(Number(e.target.value))} /></label>
        </div>
      </div>
      <div style={{ height: 10 }} />
      {data.loading ? <Loading what="pitch types" /> : !data.data ? <div className="empty">The pitch-type leaderboard for {season} hasn’t been built yet.</div> : (
        <DataTable rows={rows} rank heat limit={100} defaultSort={{ key: 'rv100', dir: 'desc' }} cols={[
          { key: 'name', label: 'Pitcher', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} hand={r.throws} /> },
          { key: 'teamId', label: 'Team', left: true, get: (r) => teamById[r.teamId]?.abbr },
          { key: 'pt', label: 'Pitch', left: true, render: (r) => <><PitchDot pt={r.pt} />{PITCH_NAME[r.pt] || r.pt}</> },
          { key: 'n', label: '#' }, { key: 'use', label: 'Use%', f: fmt.pct, hb: null }, { key: 'velo', label: 'Velo', f: fmt.r1, hb: true },
          { key: 'spin', label: 'Spin', f: fmt.int, hb: true }, { key: 'ivb', label: 'IVB', f: fmt.r1, hb: null }, { key: 'hb', label: 'HB', f: fmt.r1, hb: null },
          { key: 'ext', label: 'Ext', f: fmt.r1, hb: true }, { key: 'arm', label: 'Arm°', f: fmt.r1, hb: null },
          { key: 'zone', label: 'Zone%', f: fmt.pct, hb: null }, { key: 'chase', label: 'Chase%', f: fmt.pct, hb: true }, { key: 'whiff', label: 'Whiff%', f: fmt.pct, hb: true },
          { key: 'csw', label: 'CSW%', f: fmt.pct, hb: true }, { key: 'putaway', label: 'PutAway%', f: fmt.pct, hb: true },
          { key: 'xwoba', label: 'xwOBA', f: fmt.r3, hb: false }, { key: 'hh', label: 'HardHit%', f: fmt.pct, hb: false },
          { key: 'rv', label: 'RV', f: fmt.r1, hb: true }, { key: 'rv100', label: 'RV/100', f: fmt.r2, hb: true },
        ]} />
      )}
    </>
  );
}

