import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPerson, headshot } from '../lib/mlbapi.js';
import { loadContracts } from '../lib/data.js';
import { careerLines } from '../lib/player.js';
import { statDef } from '../lib/catalog.js';
import { Seg, useAsync, usePref, Loading, Err, splitOpts, TeamLink, Hand } from '../components/ui.jsx';
import ColumnChooser from '../components/ColumnChooser.jsx';
import Overview from './player/Overview.jsx';
import StatsTab from './player/StatsTab.jsx';
import StatcastTab from './player/StatcastTab.jsx';
import ChartsTab from './player/ChartsTab.jsx';
import ArsenalTab from './player/ArsenalTab.jsx';
import SplitsTab from './player/SplitsTab.jsx';
import GameLogs from './player/GameLogs.jsx';
import Projections from './player/Projections.jsx';
import Bio from './player/Bio.jsx';

const FRONT_DEFAULT = {
  hitting: ['PA', 'HR', 'AVG', 'OBP', 'SLG', 'wOBA', 'xwOBA', 'wRCplus', 'vWAR', 'eWAR', 'fWAR'],
  pitching: ['IP', 'ERA', 'FIP', 'K%', 'BB%', 'wOBA', 'xwOBA', 'wRCplusAllowed', 'WAR_FIP', 'WAR_wOBA', 'vWAR', 'eWAR'],
};
const TABS = [['overview', 'Overview'], ['stats', 'Stats'], ['statcast', 'Statcast'], ['charts', 'Charts'], ['arsenal', 'Pitch Types'],
  ['splits', 'Splits'], ['logs', 'Game Log'], ['proj', 'Projections'], ['bio', 'Bio & Contract']];

export default function Player() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const [qs, setQs] = useSearchParams();
  const p = useAsync(() => getPerson(id), [id]);
  const person = p.data?.people?.[0];
  const isPitcher = person?.primaryPosition?.code === '1';
  const twoWay = person?.primaryPosition?.code === 'Y';
  const [groupSel, setGroupSel] = useState(null);
  const group = groupSel || (isPitcher ? 'pitching' : 'hitting');
  const tab = qs.get('tab') || 'overview';
  const setTab = (t) => setQs((q) => { q.set('tab', t); return q; }, { replace: true });
  const career = useAsync(() => (person ? careerLines(id, group, person) : null), [id, group, person]);
  const contracts = useAsync(() => loadContracts(), []);

  if (p.error) return <Err e={p.error} />;
  if (!person) return <Loading what="player" />;
  const age = person.birthDate ? Math.floor((Date.now() - new Date(person.birthDate)) / 3.15576e10) : null;
  const rows = career.data?.rows || [];
  const latest = rows[rows.length - 1];
  const contract = contracts.data?.[id]?.[0];
  const ctx = { id, person, group, rows, detail: career.data?.detail || {}, source: career.data?.source, throws: person.pitchHand?.code, bats: person.batSide?.code };

  return (
    <>
      <div className="ph">
        <img src={headshot(id, 220)} alt="" />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{person.fullName} <span className="muted" style={{ fontSize: 16 }}>#{person.primaryNumber || '—'}</span></h1>
          <div className="bio">
            {person.primaryPosition?.abbreviation} · Bats <Hand h={person.batSide?.code} /> Throws <Hand h={person.pitchHand?.code} />
            {age != null && ` · Age ${age}`}{person.height ? ` · ${person.height}` : ''}{person.weight ? ` ${person.weight} lb` : ''}
            {person.currentTeam && <> · <TeamLink id={person.currentTeam.id} name={person.currentTeam.name} /></>}
          </div>
          <div className="bio hide-sm">
            {person.mlbDebutDate && `Debut ${person.mlbDebutDate}`}
            {person.drafts?.[0] && ` · Drafted ${person.drafts[0].year} R${person.drafts[0].pickRound} #${person.drafts[0].pickNumber}`}
            {contract && ` · Contract: ${contract.years} yr / $${contract.total}M (${contract.start}–${contract.end})`}
          </div>
          {twoWay && (
            <div style={{ marginTop: 6 }}><Seg value={group} onChange={setGroupSel} options={[{ value: 'hitting', label: 'Hitting' }, { value: 'pitching', label: 'Pitching' }]} /></div>
          )}
        </div>
      </div>
      <FrontStats group={group} latest={latest} />
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {career.loading && <Loading what="stats" />}
      {career.error && <Err e={career.error} />}
      {career.data?.source === 'mlbapi' && !['bio', 'logs', 'splits'].includes(tab) && (
        <div className="notice">Statcast data for this player hasn’t been built yet; showing MLB Stats API numbers (wOBA/wRC+ computed in-app).</div>
      )}
      {career.data && tab === 'overview' && <Overview {...ctx} />}
      {career.data && tab === 'stats' && <StatsTab {...ctx} />}
      {career.data && tab === 'statcast' && <StatcastTab {...ctx} />}
      {career.data && tab === 'charts' && <ChartsTab {...ctx} />}
      {career.data && tab === 'arsenal' && <ArsenalTab {...ctx} />}
      {tab === 'splits' && <SplitsTab {...ctx} />}
      {tab === 'logs' && <GameLogs {...ctx} />}
      {career.data && tab === 'proj' && <Projections {...ctx} />}
      {tab === 'bio' && <Bio {...ctx} contract={contracts.data?.[id]} />}
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
      <div className="panel-h">
        <div className="row"><b>{latest.season}</b><Seg value={split} onChange={setSplit} options={splitOpts(group)} /></div>
        <button className="btn ghost" onClick={() => setEdit((e) => !e)}>{edit ? 'Done' : 'Choose stats'}</button>
      </div>
      {edit && <ColumnChooser group={group} value={keys} onChange={setKeys} max={16} />}
      <div className="front-stats">
        {keys.map((k) => { const d = statDef(group, k); return <div className="fs" key={k} title={d.desc}><div className="k">{d.label}</div><div className="v">{d.f(l[k]) || '—'}</div></div>; })}
      </div>
    </div>
  );
}
