import { useState } from 'react';
import { guts } from '../../lib/guts.js';
import { Seg } from '../../components/ui.jsx';
import { SprayChart, ZoneGrid } from '../../components/charts.jsx';
import { seasonsOf } from './Overview.jsx';

const METRICS = {
  hitting: [['xwoba', 'xwOBA'], ['woba', 'wOBA'], ['swing', 'Swing%'], ['whiff', 'Whiff%'], ['freq', 'Pitches seen'], ['rv', 'RV/100']],
  pitching: [['freq', 'Location'], ['xwoba', 'xwOBA allowed'], ['woba', 'wOBA allowed'], ['whiff', 'Whiff%'], ['swing', 'Swing%'], ['rv', 'RV/100 (batter)']],
};

export default function ChartsTab({ group, rows, detail }) {
  const avail = seasonsOf(rows).filter((s) => detail?.[s]);
  const [season, setSeason] = useState(avail[avail.length - 1]);
  const [metric, setMetric] = useState(METRICS[group][0][0]);
  const [hand, setHand] = useState('all');
  const [show, setShow] = useState('all');
  const det = detail?.[season];
  if (!avail.length) return <div className="empty">Charts need the Statcast detail for this player, which the data pipeline builds.</div>;
  const g = guts(season);
  const lbl = group === 'hitting' ? { vL: 'vs LHP', vR: 'vs RHP' } : { vL: 'vs LHB', vR: 'vs RHB' };
  // pitcher zones read better as "batter's" values with lower = better for him; ZoneGrid colors by higher = red
  const zoneLg = { woba: g.woba, xwoba: g.woba };
  return (
    <>
      <div className="toolbar">
        <select value={season || ''} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{[...avail].reverse().map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="grid g2" style={{ marginTop: 12 }}>
        {group === 'hitting' && (
          <div className="panel">
            <div className="panel-h"><h3>Spray chart</h3>
              <div className="row" style={{ gap: 6 }}>
                <Seg value={hand} onChange={setHand} options={[{ value: 'all', label: 'All' }, { value: 'vL', label: 'vs LHP' }, { value: 'vR', label: 'vs RHP' }]} />
                <Seg value={show} onChange={setShow} options={[{ value: 'all', label: 'All BIP' }, { value: 'hits', label: 'Hits' }, { value: 'hr', label: 'HR' }, { value: 'outs', label: 'Outs' }]} />
              </div>
            </div>
            <SprayChart points={det?.spray || []} filterHand={hand} show={show} size={420} />
          </div>
        )}
        <div className="panel">
          <div className="panel-h"><h3>Zone profile</h3>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Zone metric">{METRICS[group].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {['all', 'vL', 'vR'].map((s) => <ZoneGrid key={s} zones={det?.zones?.[s] || {}} metric={metric} lg={zoneLg} title={s === 'all' ? 'All' : lbl[s]} />)}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Catcher’s view. Gameday zones 1–9 inside, four outside quadrants. Red = high, blue = low{metric === 'freq' ? '' : ' (vs league)'}; cells need a minimum sample to show.</div>
        </div>
      </div>
    </>
  );
}
