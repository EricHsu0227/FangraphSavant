import { useState } from 'react';
import { catalog } from '../lib/catalog.js';

/** Pick any stats, grouped by category; selected order is preserved. */
export default function ColumnChooser({ group, value, onChange, max }) {
  const [q, setQ] = useState('');
  const cats = {};
  for (const s of catalog(group)) {
    if (q && !`${s.label} ${s.key} ${s.desc}`.toLowerCase().includes(q.toLowerCase())) continue;
    (cats[s.cat] ||= []).push(s);
  }
  const toggle = (k) => {
    if (value.includes(k)) onChange(value.filter((x) => x !== k));
    else if (!max || value.length < max) onChange([...value, k]);
  };
  const move = (k, d) => {
    const i = value.indexOf(k), j = i + d;
    if (j < 0 || j >= value.length) return;
    const nv = [...value]; [nv[i], nv[j]] = [nv[j], nv[i]]; onChange(nv);
  };
  return (
    <div className="col-chooser">
      <div className="row" style={{ marginBottom: 10 }}>
        <input type="text" placeholder="Filter stats…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{value.length} selected{max ? ` / ${max}` : ''}</span>
        <button className="btn ghost" onClick={() => onChange([])}>Clear</button>
      </div>
      {value.length > 0 && (
        <div className="cat">
          <b>Order (click ‹ › to move)</b>
          <div className="row">
            {value.map((k) => {
              const s = catalog(group).find((x) => x.key === k);
              return (
                <span key={k} className="chip on">
                  <span onClick={() => move(k, -1)}>‹</span>{s?.label || k}<span onClick={() => move(k, 1)}>›</span>
                  <span className="x" onClick={() => toggle(k)}>×</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {Object.entries(cats).map(([cat, list]) => (
        <div className="cat" key={cat}>
          <b>{cat}</b>
          <div className="row">
            {list.map((s) => (
              <span key={s.key} title={s.desc} className={`chip ${value.includes(s.key) ? 'on' : ''}`} onClick={() => toggle(s.key)}>{s.label}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
