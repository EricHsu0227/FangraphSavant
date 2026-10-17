import { useMemo, useState } from 'react';
import { statDef, PERCENTILE_DEFAULT, qualifies } from '../lib/catalog.js';
import { pctColor } from './DataTable.jsx';
import ColumnChooser from './ColumnChooser.jsx';
import { usePref, Seg, splitOpts } from './ui.jsx';

/**
 * Savant-style percentile rankings, customizable: pick any stats, and the
 * comparison pool (qualified players) can be split by pitcher/batter hand.
 */
export default function Percentiles({ group, season, rows, playerId }) {
  const [keys, setKeys] = usePref(`pct:${group}`, PERCENTILE_DEFAULT[group]);
  const [split, setSplit] = useState('all');
  const [edit, setEdit] = useState(false);
  const [pool, setPool] = useState('qualified');

  const data = useMemo(() => {
    if (!rows) return [];
    const me = rows.find((r) => r.id === playerId);
    const line = me?.splits?.[split];
    if (!line) return [];
    const minPA = group === 'hitting' ? (split === 'all' ? null : 100) : (split === 'all' ? null : 100);
    const peers = rows.filter((r) => {
      if (pool === 'all') return (r.splits?.[split]?.PA || 0) >= 50;
      if (split === 'all') return qualifies(group, r, season);
      return (r.splits?.[split]?.PA || 0) >= minPA;
    });
    return keys.map((k) => {
      const d = statDef(group, k);
      const v = line[k];
      const vals = peers.map((r) => r.splits?.[split]?.[k]).filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
      if (typeof v !== 'number' || vals.length < 10) return { d, v, p: null };
      let below = 0; while (below < vals.length && vals[below] < v) below++;
      let p = Math.round((below / (vals.length - 1)) * 100);
      if (d.hb === false) p = 100 - p;
      return { d, v, p: Math.max(1, Math.min(100, p)) };
    });
  }, [rows, keys, split, playerId, group, season, pool]);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{season} Percentile Rankings</h3>
        <button className="btn ghost" onClick={() => setEdit((e) => !e)}>{edit ? 'Done' : 'Customize'}</button>
      </div>
      <div className="row" style={{ margin: '8px 0' }}>
        <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
        <Seg value={pool} onChange={setPool} options={[{ value: 'qualified', label: 'Qualified' }, { value: 'all', label: 'All (50+ PA)' }]} />
      </div>
      {edit && <ColumnChooser group={group} value={keys} onChange={setKeys} />}
      {data.length === 0 && <div className="muted small">No percentile data for this split yet.</div>}
      {data.map(({ d, v, p }) => (
        <div className="pct-row" key={d.key}>
          <span title={d.desc}>{d.label}</span>
          <div className="pct-bar">
            {p != null && <>
              <div className="fill" style={{ width: `${p}%`, background: pctColor(p), opacity: 0.35 }} />
              <div className="dot" style={{ left: `${p}%`, background: pctColor(p) }}>{p}</div>
            </>}
          </div>
          <span className="mono small" style={{ textAlign: 'right' }}>{d.f(v)}</span>
        </div>
      ))}
    </div>
  );
}
