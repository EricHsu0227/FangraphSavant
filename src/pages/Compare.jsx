import { useEffect, useMemo, useState } from 'react';
import { loadSeason } from '../lib/data.js';
import { searchPeople, headshot } from '../lib/mlbapi.js';
import { statDef, PRESETS, qualifies } from '../lib/catalog.js';
import { SEASONS } from '../lib/guts.js';
import { Seg, usePref, PlayerLink, splitOpts } from '../components/ui.jsx';
import ColumnChooser from '../components/ColumnChooser.jsx';
import { pctColor } from '../components/DataTable.jsx';

/** Compare up to 5 player-seasons on any stats, any split, with league percentiles. */
export default function Compare() {
  const [group, setGroup] = usePref('cmp:group', 'hitting');
  const [picks, setPicks] = usePref(`cmp:picks:${group}`, []);
  const [keys, setKeys] = usePref(`cmp:keys:${group}`, PRESETS[group].Dashboard);
  const [split, setSplit] = useState('all');
  const [edit, setEdit] = useState(false);
  const [seasonsData, setSeasonsData] = useState({});

  useEffect(() => {
    const need = [...new Set(picks.map((p) => p.season))].filter((s) => !seasonsData[`${group}:${s}`]);
    need.forEach((s) => loadSeason(s, group).then((rows) => setSeasonsData((d) => ({ ...d, [`${group}:${s}`]: rows }))));
  }, [picks, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = useMemo(() => picks.map((p) => {
    const rows = seasonsData[`${group}:${p.season}`];
    const r = rows?.find((x) => x.id === p.id);
    return { ...p, line: r?.splits?.[split], rows, loading: !rows };
  }), [picks, seasonsData, split, group]);

  const pct = (rows, season, k, v) => {
    if (!rows || typeof v !== 'number') return null;
    const vals = rows.filter((r) => qualifies(group, r, season)).map((r) => r.splits?.[split]?.[k]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
    if (vals.length < 10) return null;
    let i = 0; while (i < vals.length && vals[i] < v) i++;
    const p = Math.round((i / (vals.length - 1)) * 100);
    return statDef(group, k).hb === false ? 100 - p : p;
  };

  return (
    <>
      <h1>Player Comparison</h1>
      <div className="row">
        <Seg value={group} onChange={setGroup} options={[{ value: 'hitting', label: 'Batters' }, { value: 'pitching', label: 'Pitchers' }]} />
        <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
        <AddPlayer onAdd={(p) => picks.length < 5 && setPicks([...picks, p])} />
        <button className="btn ghost" onClick={() => setEdit((e) => !e)}>{edit ? 'Done' : 'Choose stats'}</button>
      </div>
      {edit && <ColumnChooser group={group} value={keys} onChange={setKeys} />}
      {picks.length === 0 && <div className="loading">Add up to five players (any season 2015–2026) to compare.</div>}
      {picks.length > 0 && (
        <div className="tbl-wrap" style={{ marginTop: 12 }}>
          <table className="t">
            <thead>
              <tr>
                <th className="l sticky">Stat</th>
                {cols.map((c, i) => (
                  <th key={i} className="l">
                    <div className="row" style={{ gap: 8 }}>
                      <img src={headshot(c.id, 60)} width="34" height="34" style={{ borderRadius: 6 }} alt="" />
                      <div>
                        <PlayerLink id={c.id} name={c.name} />
                        <div className="row" style={{ gap: 4 }}>
                          <select value={c.season} onChange={(e) => setPicks(picks.map((p, j) => (j === i ? { ...p, season: Number(e.target.value) } : p)))}>
                            {[...SEASONS].reverse().map((s) => <option key={s}>{s}</option>)}
                          </select>
                          <a style={{ cursor: 'pointer' }} onClick={() => setPicks(picks.filter((_, j) => j !== i))}>remove</a>
                        </div>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const d = statDef(group, k);
                const vals = cols.map((c) => c.line?.[k]);
                const nums = vals.filter((v) => typeof v === 'number');
                const best = nums.length > 1 && d.hb != null ? (d.hb ? Math.max(...nums) : Math.min(...nums)) : null;
                return (
                  <tr key={k}>
                    <td className="l sticky" title={d.desc}><b>{d.label}</b></td>
                    {cols.map((c, i) => {
                      const v = vals[i];
                      const p = pct(c.rows, c.season, k, v);
                      return (
                        <td key={i} className="l num">
                          {c.loading ? '…' : <span style={{ fontWeight: v === best ? 700 : 400 }}>{d.f(v) || '—'}</span>}
                          {p != null && <span className="heat small" style={{ marginLeft: 8, color: '#fff', background: pctColor(p) }}>{p}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Small badges are league percentiles among qualified players in that season and split. Bold = best of the group.</p>
    </>
  );
}

function AddPlayer({ onAdd }) {
  const [q, setQ] = useState('');
  const [season, setSeason] = useState(SEASONS[SEASONS.length - 1]);
  const [res, setRes] = useState([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 3) return setRes([]);
      const r = await searchPeople(q.trim()).catch(() => null);
      setRes((r?.people || []).slice(0, 8));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <span className="search-box" style={{ position: 'relative' }}>
      <span className="row" style={{ gap: 4 }}>
        <input type="text" placeholder="Add player…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={season} onChange={(e) => setSeason(Number(e.target.value))}>{[...SEASONS].reverse().map((s) => <option key={s}>{s}</option>)}</select>
      </span>
      {res.length > 0 && (
        <div className="search-pop" style={{ left: 0, right: 'auto' }}>
          {res.map((p) => (
            <a key={p.id} onClick={() => { onAdd({ id: p.id, name: p.fullName, season }); setQ(''); setRes([]); }}>{p.fullName} <span className="muted small">{p.primaryPosition?.abbreviation}</span></a>
          ))}
        </div>
      )}
    </span>
  );
}
