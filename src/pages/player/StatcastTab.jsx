import { useState } from 'react';
import { statDef, fmt } from '../../lib/catalog.js';
import { Seg, splitOpts } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { StackBar, LineChart } from '../../components/charts.jsx';
import { seasonsOf } from './Overview.jsx';

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

/** Savant-style Statcast profile for one season & split. */
export default function StatcastTab({ group, rows, detail }) {
  const avail = seasonsOf(rows);
  const [season, setSeason] = useState(avail[avail.length - 1]);
  const [split, setSplit] = useState('all');
  const l = rows.find((r) => r.season === season)?.splits?.[split] || {};
  const det = detail?.[season] || {};
  const tiles = (keys) => (
    <div className="stat-tiles">
      {keys.map((k) => { const d = statDef(group, k); return <div className="tile" key={k} title={d.desc}><div className="k">{d.label}</div><div className="v">{d.f(l[k]) || '—'}</div></div>; })}
    </div>
  );
  const hit = group === 'hitting';
  return (
    <>
      <div className="toolbar">
        <select value={season || ''} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{[...avail].reverse().map((s) => <option key={s}>{s}</option>)}</select>
        <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
      </div>
      <div className="grid g2" style={{ marginTop: 12 }}>
        <div className="panel">
          <h3>Expected stats</h3>
          {tiles(['wOBA', 'xwOBA', 'xBA', 'xSLG', 'xISO', 'xwOBAcon', 'wOBAcon', hit ? 'xwRCplus' : 'xERA'])}
        </div>
        <div className="panel">
          <h3>Contact quality</h3>
          {tiles(['EV', 'maxEV', 'EV90', 'LA', 'Barrel%', 'HardHit%', 'SweetSpot%', 'BBE'])}
          <div style={{ marginTop: 10 }}>
            <div className="kicker">Quality of contact</div>
            <StackBar parts={[
              { label: 'Weak', v: l['Weak%'], color: '#9aa3ad' }, { label: 'Topped', v: l['Topped%'], color: '#c2c7ce' },
              { label: 'Under', v: l['Under%'], color: '#d9cfa8' }, { label: 'Flare/Burner', short: 'Flare', v: l['Flare%'], color: '#f2c14e' },
              { label: 'Solid', v: l['Solid%'], color: '#f08a4b' }, { label: 'Barrel', v: l['Barrel%'], color: '#d64545' },
            ]} />
          </div>
        </div>
        <div className="panel">
          <h3>Batted-ball profile</h3>
          <div className="kicker">Type</div>
          <StackBar parts={[{ label: 'GB', v: l['GB%'], color: '#b8875a' }, { label: 'LD', v: l['LD%'], color: '#58a55c' }, { label: 'FB', v: l['FB%'], color: '#4a86c5' }, { label: 'PU', v: l['PU%'], color: '#9c7bd1' }]} />
          <div className="kicker" style={{ marginTop: 10 }}>Direction</div>
          <StackBar parts={[{ label: 'Pull', v: l['Pull%'], color: '#d0563b' }, { label: 'Straight', v: l['Straight%'], color: '#9aa3ad' }, { label: 'Oppo', v: l['Oppo%'], color: '#3b7dd0' }]} />
          <div className="small muted" style={{ marginTop: 8 }}>Pull air {pct(l['Pull Air%'])} · GB {pct(l['GB%'])} · LD {pct(l['LD%'])} · FB {pct(l['FB%'])}</div>
        </div>
        <div className="panel">
          <h3>Plate discipline</h3>
          {tiles(['Swing%', 'Zone%', 'ZSwing%', 'Chase%', 'Contact%', 'ZContact%', 'Whiff%', 'FPS%', 'FPSwing%', hit ? 'K%' : 'CSW%'])}
        </div>
        <AttackZones l={l} group={group} />
        {hit ? (
          <div className="panel">
            <h3>Bat tracking</h3>
            {l.BatSpeed != null ? tiles(['BatSpeed', 'Squared%', 'Blast%']) : <div className="muted small">Bat tracking starts in 2023 (full 2024+).</div>}
            <h3>Running & fielding</h3>
            {tiles(['sprint', 'bsr', 'frv', 'oaa'])}
          </div>
        ) : <TTO det={det} split={split} />}
        <Counts det={det} split={split} group={group} />
        <Monthly det={det} />
      </div>
    </>
  );
}

function AttackZones({ l, group }) {
  const regions = [['heart', 'Heart'], ['shadow', 'Shadow'], ['chase', 'Chase'], ['waste', 'Waste']];
  const data = regions.map(([k, label]) => ({ _key: k, label, share: l[`${k}%`], swing: l[`${k}Sw%`], rv: l[`${k}RV`] }));
  return (
    <div className="panel">
      <h3>Run value by attack zone</h3>
      <DataTable rows={data} cols={[
        { key: 'label', label: 'Zone', left: true }, { key: 'share', label: 'Pitch%', f: fmt.pct }, { key: 'swing', label: 'Swing%', f: fmt.pct },
        { key: 'rv', label: group === 'hitting' ? 'Runs' : 'Runs saved', f: fmt.r1 },
      ]} />
      <div className="small muted" style={{ marginTop: 6 }}>Swing RV {fmt.r1(l['Swing RV']) || '—'} · Take RV {fmt.r1(l['Take RV']) || '—'} · total {fmt.r1(l.RV) || '—'}</div>
    </div>
  );
}

function Counts({ det, split, group }) {
  const c = det.counts?.[split];
  if (!c) return null;
  const lab = { first: 'First pitch', a10: 'After 1-0', a01: 'After 0-1', two: 'Two strikes', full: 'Full count' };
  const data = Object.entries(lab).map(([k, label]) => ({ _key: k, label, ...(c[k] || {}) }));
  return (
    <div className="panel">
      <h3>By count</h3>
      <DataTable rows={data} cols={[
        { key: 'label', label: 'After count', left: true }, { key: 'pa', label: group === 'hitting' ? 'PA' : 'BF' },
        { key: 'woba', label: 'wOBA', f: fmt.r3 }, { key: 'xwoba', label: 'xwOBA', f: fmt.r3 }, { key: 'k', label: 'K%', f: fmt.pct }, { key: 'bb', label: 'BB%', f: fmt.pct },
      ]} />
    </div>
  );
}

function TTO({ det, split }) {
  const t = det.tto?.[split];
  if (!t) return <div className="panel"><h3>Times through the order</h3><div className="muted small">Not available.</div></div>;
  const data = ['1', '2', '3'].map((k) => ({ _key: k, label: k === '3' ? '3rd+' : k === '1' ? '1st' : '2nd', ...(t[k] || {}) }));
  return (
    <div className="panel">
      <h3>Times through the order</h3>
      <DataTable rows={data} cols={[
        { key: 'label', label: 'Time through', left: true }, { key: 'pa', label: 'BF' }, { key: 'woba', label: 'wOBA', f: fmt.r3 },
        { key: 'xwoba', label: 'xwOBA', f: fmt.r3 }, { key: 'k', label: 'K%', f: fmt.pct }, { key: 'bb', label: 'BB%', f: fmt.pct },
      ]} />
    </div>
  );
}

function Monthly({ det }) {
  const m = det.monthly;
  if (!m) return null;
  const MN = { '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct' };
  const keys = Object.keys(m).sort();
  return (
    <div className="panel">
      <h3>By month</h3>
      <LineChart height={160} series={[
        { name: 'wOBA', color: 'var(--accent-2)', points: keys.map((k) => [Number(k), m[k].woba]) },
        { name: 'xwOBA', color: 'var(--accent)', points: keys.map((k) => [Number(k), m[k].xwoba]) },
      ]} xFmt={(v) => MN[String(v).padStart(2, '0')] || v} yFmt={(v) => v.toFixed(3).replace(/^0/, '')} />
      <DataTable rows={keys.map((k) => ({ _key: k, month: MN[k] || k, ...m[k] }))} cols={[
        { key: 'month', label: 'Month', left: true }, { key: 'pa', label: 'PA' }, { key: 'woba', label: 'wOBA', f: fmt.r3 }, { key: 'xwoba', label: 'xwOBA', f: fmt.r3 },
        { key: 'k', label: 'K%', f: fmt.pct }, { key: 'bb', label: 'BB%', f: fmt.pct },
      ]} />
    </div>
  );
}
