import { useMemo, useState } from 'react';

/**
 * Generic sortable table.
 * cols: [{ key, label, get?(row), render?(row), f?(v), left?, sticky?, hb?, title? }]
 * heat: color numeric cells by percentile within the table (red = good, blue = bad)
 */
export default function DataTable({ rows, cols, defaultSort, heat = false, rank = false, limit, totalRow, maxHeight }) {
  const [sort, setSort] = useState(defaultSort || null);
  const [shown, setShown] = useState(limit || Infinity);

  const getVal = (c, r) => (c.get ? c.get(r) : r[c.key]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getVal(c, a), vb = getVal(c, b);
      const na = va == null || Number.isNaN(va), nb = vb == null || Number.isNaN(vb);
      if (na && nb) return 0; if (na) return 1; if (nb) return -1;
      if (typeof va === 'string') return dir * va.localeCompare(vb);
      return dir * (va - vb);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, cols]);

  // percentile ranks per column for heat coloring
  const ranks = useMemo(() => {
    if (!heat) return {};
    const out = {};
    for (const c of cols) {
      if (c.hb == null || c.left) continue;
      const vals = rows.map((r) => getVal(c, r)).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
      if (vals.length < 5) continue;
      out[c.key] = (v) => {
        if (typeof v !== 'number') return null;
        // mid-rank so ties (e.g. every row at 650 PA) land at the same, neutral-ish percentile
        const first = lowerBound(vals, v, false), after = lowerBound(vals, v, true);
        if (vals[0] === vals[vals.length - 1]) return 0.5;
        const p = ((first + after - 1) / 2) / (vals.length - 1);
        return c.hb ? p : 1 - p;
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, heat]);

  const click = (c) => {
    if (c.nosort) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: c.key, dir: c.left ? 'asc' : (c.hb === false ? 'asc' : 'desc') }));
  };

  const visible = sorted.slice(0, shown);
  return (
    <>
      <div className="tbl-wrap" style={maxHeight ? { maxHeight } : undefined}>
        <table className="t">
          <thead>
            <tr>
              {rank && <th className="l">#</th>}
              {cols.map((c) => (
                <th key={c.key} title={c.title || ''} onClick={() => click(c)}
                  className={`${c.left ? 'l' : ''} ${c.sticky ? 'sticky' : ''} ${sort?.key === c.key ? 'sorted' : ''}`}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r._key ?? r.id ?? i}>
                {rank && <td className="l muted">{i + 1}</td>}
                {cols.map((c) => {
                  const v = getVal(c, r);
                  const p = ranks[c.key]?.(v);
                  const style = p != null ? { background: heatColor(p) } : undefined;
                  return (
                    <td key={c.key} className={`${c.left ? 'l' : 'num'} ${c.sticky ? 'sticky' : ''}`}>
                      {c.render ? c.render(r) : <span className={p != null ? 'heat' : ''} style={style}>{c.f ? c.f(v) : v ?? ''}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {totalRow && (
              <tr className="total">
                {rank && <td />}
                {cols.map((c) => <td key={c.key} className={c.left ? 'l' : 'num'}>{c.left ? (c.key === cols[0].key ? 'Total' : '') : (c.f ? c.f(getVal(c, totalRow)) : getVal(c, totalRow))}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > shown && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ghost" onClick={() => setShown((s) => s + (limit || 50))}>Show more ({sorted.length - shown} left)</button>
          <button className="btn ghost" onClick={() => setShown(Infinity)}>Show all</button>
        </div>
      )}
    </>
  );
}

function lowerBound(arr, v, strict) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (strict ? arr[m] <= v : arr[m] < v) lo = m + 1; else hi = m; }
  return lo;
}

/** Savant-style red/blue scale: p in [0,1], 0.5 = neutral. */
export function heatColor(p, alpha = 0.55) {
  const d = Math.abs(p - 0.5) * 2;
  if (d < 0.08) return 'transparent';
  return p > 0.5 ? `rgba(214, 41, 52, ${alpha * d})` : `rgba(29, 95, 168, ${alpha * d})`;
}

export function pctColor(p) {
  // solid 0..100 percentile color like Savant (blue -> gray -> red)
  const t = p / 100;
  const blue = [50, 90, 170], gray = [180, 180, 180], red = [210, 36, 44];
  const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
  const c = t < 0.5 ? mix(blue, gray, t / 0.5) : mix(gray, red, (t - 0.5) / 0.5);
  return `rgb(${c.join(',')})`;
}
