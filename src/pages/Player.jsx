import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPerson, getPersonSplits, getGameLog, getTransactions, headshot, splitsOf } from '../lib/mlbapi.js';
import { loadJSON, loadSeason, loadContracts, loadProspects, parkFactor } from '../lib/data.js';
import { fromMLB, addLines, deriveHitting, derivePitching, hitterValueExpected, pitcherValueExpected, woba, wrcPlus } from '../lib/stats.js';
import { PRESETS, statDef, fmt } from '../lib/catalog.js';
import { SEASONS } from '../lib/guts.js';
import { teamById } from '../lib/teams.js';
import { Seg, useAsync, usePref, Loading, Err, splitOpts, TeamLink, Hand } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import ColumnChooser from '../components/ColumnChooser.jsx';
import Percentiles from '../components/Percentiles.jsx';

const FRONT_DEFAULT = {
  hitting: ['PA', 'HR', 'AVG', 'OBP', 'SLG', 'wOBA', 'xwOBA', 'wRCplus', 'vWAR', 'eWAR', 'fWAR'],
  pitching: ['IP', 'ERA', 'FIP', 'K%', 'BB%', 'wOBA', 'xwOBA', 'wRCplusAllowed', 'WAR_FIP', 'WAR_wOBA', 'vWAR', 'eWAR'],
};

/** Year-by-year lines with all/vL/vR, from the pipeline file or rebuilt from the MLB API. */
async function careerLines(id, group, person) {
  const file = await loadJSON(`players/${id}.json`);
  const derive = async (season, r) => {
    const pf = await parkFactor(season, r.teamId);
    const out = { season, team: r.team, teamId: r.teamId, splits: {} };
    for (const s of ['all', 'vL', 'vR']) {
      const l = r.splits?.[s];
      if (!l) continue;
      const d = group === 'hitting' ? deriveHitting(l, season, pf) : derivePitching(l, season, pf);
      if (s === 'all') Object.assign(d, group === 'hitting'
        ? hitterValueExpected(d, season, { woba: d.wOBA, xwoba: d.xwOBA, pf, bsr: r.bsr, bsrSpeed: r.bsrSpeed, frv: r.frv, pos: r.pos, dhPA: r.dhPA, dhFrvPerPA: r.dhFrvPerPA })
        : pitcherValueExpected(d, season, { woba: d.wOBA, xwoba: d.xwOBA, pf }));
      if (s === 'all') for (const k of ['bsr', 'frv', 'oaa', 'sprint']) if (r[k] != null) d[k] = r[k];
      if (s === 'all' && r.WAR_fg != null) d.fWAR = r.WAR_fg;
      out.splits[s] = d;
    }
    return out;
  };
  if (file?.[group]?.length) return { source: 'statcast', rows: await Promise.all(file[group].map((r) => derive(r.season, r))) };

  // Fallback: MLB API yearByYear (combined across teams) + vl/vr statSplits per season
  const yby = (person?.stats || []).find((s) => s.group?.displayName === group && s.type?.displayName === 'yearByYear');
  const bySeason = new Map();
  for (const sp of yby?.splits || []) {
    if (sp.sport?.id && sp.sport.id !== 1) continue;
    const season = Number(sp.season);
    const cur = bySeason.get(season) || { season, team: [], teamId: sp.team?.id, line: {} };
    if (sp.team) cur.team.push(sp.team.abbreviation || teamById[sp.team.id]?.abbr || sp.team.name);
    cur.teamId = sp.team?.id || cur.teamId;
    cur.line = addLines(cur.line, fromMLB(sp.stat, group));
    bySeason.set(season, cur);
  }
  const rows = await Promise.all([...bySeason.values()].map(async (r) => {
    const raw = { team: r.team.join('/'), teamId: r.teamId, splits: { all: r.line } };
    if (r.season >= SEASONS[0]) {
      const sp = await getPersonSplits(id, r.season, group).catch(() => null);
      for (const x of splitsOf(sp)) {
        if (x.split?.code === 'vl') raw.splits.vL = fromMLB(x.stat, group);
        if (x.split?.code === 'vr') raw.splits.vR = fromMLB(x.stat, group);
      }
    }
    return derive(r.season, raw);
  }));
  return { source: 'mlbapi', rows: rows.sort((a, b) => a.season - b.season) };
}

export default function Player() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const p = useAsync(() => getPerson(id), [id]);
  const person = p.data?.people?.[0];
  const isPitcher = person?.primaryPosition?.code === '1';
  const twoWay = person?.primaryPosition?.code === 'Y';
  const [groupSel, setGroupSel] = useState(null);
  const group = groupSel || (isPitcher ? 'pitching' : 'hitting');
  const [tab, setTab] = useState('overview');

  const career = useAsync(() => (person ? careerLines(id, group, person) : null), [id, group, person]);

  if (p.error) return <Err e={p.error} />;
  if (!person) return <Loading what="player" />;
  const age = person.birthDate ? Math.floor((Date.now() - new Date(person.birthDate)) / 3.15576e10) : null;
  const rows = career.data?.rows || [];
  const latest = rows[rows.length - 1];

  return (
    <>
      <div className="ph">
        <img src={headshot(id, 220)} alt="" />
        <div>
          <h1 style={{ margin: 0 }}>{person.fullName} <span className="muted" style={{ fontSize: 16 }}>#{person.primaryNumber || '—'}</span></h1>
          <div className="bio">
            {person.primaryPosition?.abbreviation} · Bats <Hand h={person.batSide?.code} /> Throws <Hand h={person.pitchHand?.code} />
            {age != null && ` · Age ${age}`} · {person.height} {person.weight} lb
            {person.currentTeam && <> · <TeamLink id={person.currentTeam.id} name={person.currentTeam.name} /></>}
          </div>
          <div className="bio">
            {person.birthCity && `Born ${person.birthDate} in ${person.birthCity}${person.birthStateProvince ? ', ' + person.birthStateProvince : ''}, ${person.birthCountry}`}
            {person.mlbDebutDate && ` · Debut ${person.mlbDebutDate}`}
            {person.drafts?.[0] && ` · Drafted ${person.drafts[0].year} R${person.drafts[0].pickRound} #${person.drafts[0].pickNumber} (${person.drafts[0].team?.name || ''})`}
          </div>
          {(twoWay || isPitcher === false) && twoWay && (
            <div style={{ marginTop: 6 }}><Seg value={group} onChange={setGroupSel} options={[{ value: 'hitting', label: 'Hitting' }, { value: 'pitching', label: 'Pitching' }]} /></div>
          )}
        </div>
      </div>
      <FrontStats group={group} latest={latest} />
      <div className="tabs">
        {[['overview', 'Overview'], ['stats', 'Stats'], ['splits', 'Splits'], ['statcast', 'Statcast'], ['ve', 'Value / Expected'], ['logs', 'Game Logs'], ['contract', 'Contract & Transactions'], ['prospect', 'Prospect']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {career.loading && <Loading what="stats" />}
      {career.error && <Err e={career.error} />}
      {career.data && career.data.source === 'mlbapi' && tab !== 'contract' && tab !== 'prospect' && (
        <div className="notice">Statcast data for this player hasn’t been built yet; showing MLB Stats API numbers (wOBA/wRC+ computed in-app, no xwOBA).</div>
      )}
      {tab === 'overview' && career.data && <Overview id={id} group={group} rows={rows} />}
      {tab === 'stats' && career.data && <StatsTab group={group} rows={rows} />}
      {tab === 'splits' && <SplitsTab id={id} group={group} rows={rows} />}
      {tab === 'statcast' && career.data && <StatsTab group={group} rows={rows} fixed="Statcast" />}
      {tab === 've' && career.data && <ValueExpected group={group} rows={rows} />}
      {tab === 'logs' && <GameLogs id={id} group={group} rows={rows} />}
      {tab === 'contract' && <Contract id={id} />}
      {tab === 'prospect' && <ProspectInfo id={id} />}
    </>
  );
}

function FrontStats({ group, latest }) {
  const [keys, setKeys] = usePref(`front:${group}`, FRONT_DEFAULT[group]);
  const [split, setSplit] = useState('all');
  const [edit, setEdit] = useState(false);
  if (!latest) return null;
  const l = latest.splits[split] || {};
  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row"><b>{latest.season}</b><Seg value={split} onChange={setSplit} options={splitOpts(group)} /></div>
        <button className="btn ghost" onClick={() => setEdit((e) => !e)}>{edit ? 'Done' : 'Choose front stats'}</button>
      </div>
      {edit && <ColumnChooser group={group} value={keys} onChange={setKeys} max={16} />}
      <div className="front-stats">
        {keys.map((k) => { const d = statDef(group, k); return <div className="fs" key={k} title={d.desc}><div className="k">{d.label}</div><div className="v">{d.f(l[k]) || '—'}</div></div>; })}
      </div>
    </div>
  );
}

function Overview({ id, group, rows }) {
  const seasonsAvail = rows.map((r) => r.season).filter((s) => s >= SEASONS[0]);
  const [season, setSeason] = useState(seasonsAvail[seasonsAvail.length - 1]);
  const all = useAsync(() => (season ? loadSeason(season, group) : null), [season, group]);
  return (
    <div className="grid g2">
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="small muted">Percentiles for</span>
          <select value={season || ''} onChange={(e) => setSeason(Number(e.target.value))}>{[...seasonsAvail].reverse().map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        {all.loading ? <Loading /> : <Percentiles group={group} season={season} rows={all.data} playerId={id} />}
      </div>
      <div>
        <h3>Platoon splits by season</h3>
        <PlatoonTable group={group} rows={rows} />
      </div>
    </div>
  );
}

function PlatoonTable({ group, rows }) {
  const keys = group === 'hitting' ? ['PA', 'wOBA', 'xwOBA', 'wRCplus'] : ['TBF', 'wOBA', 'xwOBA', 'wRCplusAllowed'];
  const out = rows.filter((r) => r.season >= SEASONS[0]).map((r) => {
    const o = { _key: r.season, season: r.season };
    for (const s of ['vL', 'vR']) for (const k of keys) o[`${s}_${k}`] = r.splits[s]?.[k];
    return o;
  });
  const lbl = group === 'hitting' ? { vL: 'vL', vR: 'vR' } : { vL: 'vLHB', vR: 'vRHB' };
  return (
    <DataTable rows={out} cols={[
      { key: 'season', label: 'Season', left: true },
      ...['vL', 'vR'].flatMap((s) => keys.map((k) => { const d = statDef(group, k); return { key: `${s}_${k}`, label: `${lbl[s]} ${d.label.replace(' allowed', '')}`, f: d.f }; })),
    ]} defaultSort={{ key: 'season', dir: 'desc' }} />
  );
}

function StatsTab({ group, rows, fixed }) {
  const [split, setSplit] = useState('all');
  const [preset, setPreset] = useState(fixed || 'Dashboard');
  const [custom, setCustom] = usePref(`pstats:custom:${group}`, PRESETS[group].Dashboard);
  const [edit, setEdit] = useState(false);
  const keys = preset === 'Custom' ? custom : PRESETS[group][preset] || PRESETS[group].Dashboard;
  const data = rows.filter((r) => r.splits[split]).map((r) => ({ ...r.splits[split], _key: r.season, season: r.season, team: r.team, teamId: r.teamId }));
  const total = data.reduce((a, r) => addLines(a, r), {});
  const lastSeason = rows[rows.length - 1]?.season;
  const tot = group === 'hitting' ? deriveHitting(total, lastSeason) : derivePitching(total, lastSeason);
  const cols = [
    { key: 'season', label: 'Season', left: true, sticky: true },
    { key: 'team', label: 'Team', left: true, render: (r) => (r.teamId && !String(r.team).includes('/') ? <TeamLink id={r.teamId} season={r.season} name={r.team} /> : r.team) },
    ...keys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f, title: d.desc }; }),
  ];
  return (
    <>
      <div className="row">
        <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
        {!fixed && <div className="seg">{[...Object.keys(PRESETS[group]), 'Custom'].map((p) => <button key={p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>{p}</button>)}</div>}
        {preset === 'Custom' && <button className="btn ghost" onClick={() => setEdit((e) => !e)}>{edit ? 'Done' : 'Edit columns'}</button>}
      </div>
      {preset === 'Custom' && edit && <ColumnChooser group={group} value={custom} onChange={setCustom} />}
      <div style={{ height: 10 }} />
      <DataTable rows={data} cols={cols} totalRow={tot} />
    </>
  );
}

function SplitsTab({ id, group, rows }) {
  const seasons = rows.map((r) => r.season).filter((s) => s >= SEASONS[0]);
  const [season, setSeason] = useState(seasons[seasons.length - 1] || SEASONS[SEASONS.length - 1]);
  const sp = useAsync(() => getPersonSplits(id, season, group), [id, season, group]);
  const keys = group === 'hitting' ? ['PA', 'AVG', 'OBP', 'SLG', 'OPS', 'K%', 'BB%', 'wOBA', 'wRCplus'] : ['TBF', 'IP', 'ERA', 'K%', 'BB%', 'FIP', 'wOBA', 'wRCplusAllowed'];
  const list = splitsOf(sp.data).map((x) => {
    const l = fromMLB(x.stat, group);
    const d = group === 'hitting' ? deriveHitting(l, season) : derivePitching(l, season);
    return { ...d, _key: x.split?.code, split: x.split?.description };
  });
  // add Statcast L/R lines (xwOBA etc.) from the career rows
  const cr = rows.find((r) => r.season === season);
  const scKeys = group === 'hitting' ? ['PA', 'wOBA', 'xwOBA', 'xBA', 'xSLG', 'EV', 'Barrel%', 'HardHit%', 'Whiff%', 'Chase%', 'K%', 'BB%'] : ['TBF', 'wOBA', 'xwOBA', 'xBA', 'xSLG', 'EV', 'Barrel%', 'HardHit%', 'Whiff%', 'Chase%', 'K%', 'BB%'];
  const lr = cr ? ['all', 'vL', 'vR'].filter((s) => cr.splits[s]).map((s) => ({ ...cr.splits[s], _key: s, split: { all: 'Total', vL: group === 'hitting' ? 'vs LHP' : 'vs LHB', vR: group === 'hitting' ? 'vs RHP' : 'vs RHB' }[s] })) : [];
  return (
    <>
      <div className="row"><span className="small muted">Season</span><select value={season} onChange={(e) => setSeason(Number(e.target.value))}>{[...seasons].reverse().map((s) => <option key={s}>{s}</option>)}</select></div>
      <h3>Statcast by handedness</h3>
      <DataTable rows={lr} cols={[{ key: 'split', label: 'Split', left: true }, ...scKeys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f }; })]} />
      <h3>Situational splits</h3>
      {sp.loading ? <Loading /> : <DataTable rows={list} cols={[{ key: 'split', label: 'Split', left: true }, ...keys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f }; })]} />}
    </>
  );
}

function ValueExpected({ group, rows }) {
  const data = rows.filter((r) => r.season >= SEASONS[0]).map((r) => ({ ...r.splits.all, _key: r.season, season: r.season, team: r.team }));
  const keys = group === 'hitting'
    ? ['PA', 'wOBA', 'xwOBA', 'valuePlus', 'expectedPlus', 'bsr', 'frv', 'vRAA', 'eRAA', 'vWAR', 'eWAR', 'fWAR']
    : ['IP', 'wOBA', 'xwOBA', 'valuePlus', 'expectedPlus', 'vRAA', 'eRAA', 'vWAR', 'eWAR', 'WAR_FIP', 'WAR_wOBA', 'fWAR'];
  const tot = { _key: 'tot' };
  for (const k of ['vRAA', 'eRAA', 'vWAR', 'eWAR', 'fWAR', 'WAR_FIP', 'WAR_wOBA', 'PA', 'IP']) tot[k] = data.reduce((a, r) => a + (r[k] || 0), 0);
  return (
    <>
      <p className="muted small">
        Value uses wOBA{group === 'hitting' ? ' with K and GIDP penalties' : ' allowed with the K adjustment'}, park-adjusted. Expected uses xwOBA with no park factor
        {group === 'hitting' ? ', raw Savant FRV and no positional adjustment' : ''}. vWAR − eWAR shows how much the results ran ahead of (or behind) the skill.
      </p>
      <DataTable rows={data} totalRow={tot} cols={[
        { key: 'season', label: 'Season', left: true }, { key: 'team', label: 'Team', left: true },
        ...keys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f, title: d.desc }; }),
        { key: 'gap', label: 'vWAR−eWAR', get: (r) => (r.vWAR != null && r.eWAR != null ? r.vWAR - r.eWAR : null), f: fmt.r1 },
      ]} defaultSort={{ key: 'season', dir: 'desc' }} />
    </>
  );
}

function GameLogs({ id, group, rows }) {
  const seasons = rows.map((r) => r.season).filter((s) => s >= SEASONS[0]);
  const [season, setSeason] = useState(seasons[seasons.length - 1] || SEASONS[SEASONS.length - 1]);
  const gl = useAsync(() => getGameLog(id, season, group), [id, season, group]);
  const list = splitsOf(gl.data).map((x) => {
    const l = fromMLB(x.stat, group);
    const w = woba(l, season);
    return {
      ...l, _key: `${x.game?.gamePk}-${x.date}`, date: x.date, pk: x.game?.gamePk, opp: x.opponent?.id, home: x.isHome, win: x.isWin,
      wOBA: w, wRC: wrcPlus(w, season), ERA: group === 'pitching' && l.IP ? (9 * l.ER) / l.IP : null,
    };
  });
  const cols = group === 'hitting'
    ? ['PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'SO', 'SB']
    : ['IP', 'H', 'Rallowed', 'ER', 'BB', 'SO', 'HR', 'pitches'];
  return (
    <>
      <div className="row"><span className="small muted">Season</span><select value={season} onChange={(e) => setSeason(Number(e.target.value))}>{[...seasons].reverse().map((s) => <option key={s}>{s}</option>)}</select></div>
      <div style={{ height: 8 }} />
      {gl.loading ? <Loading /> : (
        <DataTable rows={list} defaultSort={{ key: 'date', dir: 'desc' }} cols={[
          { key: 'date', label: 'Date', left: true, render: (r) => <Link to={`/game/${r.pk}`}>{r.date}</Link> },
          { key: 'opp', label: 'Opp', left: true, render: (r) => <>{r.home ? 'vs' : '@'} {teamById[r.opp]?.abbr}</> },
          ...cols.map((k) => ({ key: k, label: { Rallowed: 'R', pitches: 'NP', SO: 'K' }[k] || k, f: k === 'IP' ? fmt.ip : undefined })),
          { key: 'wOBA', label: group === 'hitting' ? 'wOBA' : 'wOBA a', f: fmt.r3 },
          { key: 'wRC', label: group === 'hitting' ? 'wRC+' : 'wRC+ a' },
        ]} />
      )}
    </>
  );
}

function Contract({ id }) {
  const c = useAsync(() => loadContracts(), []);
  const tx = useAsync(() => getTransactions(id), [id]);
  const mine = c.data?.[id];
  return (
    <div className="grid g2">
      <div className="panel">
        <h3>Contract</h3>
        {mine ? mine.map((k, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <b>{k.years} yr / ${k.total}M</b> <span className="muted">({k.start}–{k.end}, AAV ${k.aav}M)</span>
            {k.details && <div className="small muted">{k.details}</div>}
            {k.seasons && <table className="t"><tbody>{Object.entries(k.seasons).map(([y, v]) => <tr key={y}><td className="l">{y}</td><td className="num">${v}M</td></tr>)}</tbody></table>}
          </div>
        )) : <div className="muted small">No contract on file. Contracts come from data/contracts.json (see README for the format).</div>}
      </div>
      <div className="panel">
        <h3>Transactions</h3>
        {tx.loading ? <Loading /> : (tx.data?.transactions || []).slice().reverse().slice(0, 40).map((t, i) => (
          <div key={i} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}><span className="mono muted">{t.date}</span> {t.description}</div>
        ))}
      </div>
    </div>
  );
}

function ProspectInfo({ id }) {
  const years = [...SEASONS].reverse();
  const data = useAsync(async () => {
    const hits = [];
    for (const y of years) {
      const list = await loadProspects(y);
      const me = list?.find((p) => p.id === id);
      if (me) hits.push({ year: y, ...me });
    }
    return hits;
  }, [id]);
  if (data.loading) return <Loading />;
  if (!data.data?.length) return <div className="muted">Not found on any prospect list in the data.</div>;
  return (
    <DataTable rows={data.data.map((r) => ({ ...r, _key: r.year }))} cols={[
      { key: 'year', label: 'List', left: true }, { key: 'rank', label: 'Overall' }, { key: 'orgRank', label: 'Org rank' },
      { key: 'fv', label: 'FV' }, { key: 'eta', label: 'ETA' }, { key: 'level', label: 'Level', left: true },
      { key: 'tools', label: 'Tools (present/future)', left: true, render: (r) => Object.entries(r.tools || {}).map(([k, v]) => `${k} ${v}`).join(' · ') },
    ]} />
  );
}
