import { marcel, regressSplits } from '../../lib/platoon.js';
import { guts } from '../../lib/guts.js';
import { fmt } from '../../lib/catalog.js';
import DataTable from '../../components/DataTable.jsx';

/**
 * Platoon projections: Marcel-style (5/4/3, regressed, age-adjusted) for the
 * overall line, then split into vs-L / vs-R with the regressed platoon split.
 */
export default function Projections({ group, rows, bats, throws }) {
  const recent = rows.filter((r) => r.season >= rows[rows.length - 1].season - 2);
  if (!recent.length) return null;
  const next = rows[rows.length - 1].season + 1;
  const age = (rows[rows.length - 1].age ?? null) != null ? rows[rows.length - 1].age + 1 : null;
  const lg = Object.fromEntries(rows.map((r) => [r.season, guts(r.season).woba]));
  const g = guts(Math.min(next, 2026));
  const role = group === 'hitting' ? 'batter' : 'pitcher';
  const hand = group === 'hitting' ? bats : throws;
  // pool the last three seasons' L/R lines for the split shape
  const pool = { vL: { PA: 0, wOBA: 0, xwOBA: 0, xn: 0 }, vR: { PA: 0, wOBA: 0, xwOBA: 0, xn: 0 } };
  for (const r of recent) for (const s of ['vL', 'vR']) {
    const l = r.splits[s]; if (!l) continue;
    const pa = l.PA || l.TBF || 0;
    pool[s].PA += pa; pool[s].wOBA += (l.wOBA || 0) * pa;
    if (l.xwOBA != null) { pool[s].xwOBA += l.xwOBA * pa; pool[s].xn += pa; }
  }
  for (const s of ['vL', 'vR']) {
    const P = pool[s];
    P.wOBA = P.PA ? P.wOBA / P.PA : null;
    P.xwOBA = P.xn ? P.xwOBA / P.xn : null;
  }
  const reg = regressSplits(pool, role, hand);
  const out = [];
  for (const m of ['wOBA', 'xwOBA']) {
    const base = marcel(rows, m, 'all', lg, age);
    if (!base) continue;
    const r = reg?.metrics?.[m];
    const shift = r ? { vL: r.vL - r.overall, vR: r.vR - r.overall } : { vL: 0, vR: 0 };
    const wrc = (v) => Math.round((((v - g.woba) / g.scale + g.rPA) / g.rPA) * 100);
    out.push({
      _key: m, metric: `${m}${group === 'pitching' ? ' allowed' : ''}`, all: base.value, vL: base.value + shift.vL, vR: base.value + shift.vR,
      wrcAll: wrc(base.value), wrcL: wrc(base.value + shift.vL), wrcR: wrc(base.value + shift.vR), rel: base.reliability,
    });
  }
  const lbl = group === 'hitting' ? ['vs LHP', 'vs RHP'] : ['vs LHB', 'vs RHB'];
  return (
    <div className="grid g2">
      <div className="panel">
        <div className="panel-h"><h3>{next} platoon projection</h3><span className="pill">Platoon Marcel</span></div>
        <DataTable rows={out} cols={[
          { key: 'metric', label: 'Metric', left: true }, { key: 'all', label: 'Overall', f: fmt.r3 },
          { key: 'vL', label: lbl[0], f: fmt.r3 }, { key: 'vR', label: lbl[1], f: fmt.r3 },
          { key: 'wrcAll', label: group === 'hitting' ? 'wRC+' : 'wRC+ a' }, { key: 'wrcL', label: `${group === 'hitting' ? 'wRC+' : 'wRC+ a'} ${lbl[0]}` },
          { key: 'wrcR', label: `${group === 'hitting' ? 'wRC+' : 'wRC+ a'} ${lbl[1]}` }, { key: 'rel', label: 'Reliability', f: fmt.pct },
        ]} />
        <p className="small muted">Last three seasons weighted 5/4/3, regressed with 1,200 PA of league average, age-adjusted{age != null ? ` (age ${age} next season)` : ''}. The overall projection is split into vs-L and vs-R with his platoon split regressed toward the league norm for his hand.</p>
      </div>
      <div className="panel">
        <h3>Why platoon projections</h3>
        <p className="small" style={{ marginTop: 0 }}>Public systems project one line for every hitter. Managers set lineups against a specific starter, so the number that matters is how a hitter projects against that hand. Raw splits from a season or two are mostly noise. This projection keeps his overall talent level and adds only as much of his personal split as his sample supports.</p>
        <p className="small muted">Regression basis: {reg ? `${Math.min(pool.vL.PA, pool.vR.PA)} PA vs the minority hand; ${Math.round(reg.weight * 100)}% weight on his own split.` : 'not enough split data.'}</p>
      </div>
    </div>
  );
}
