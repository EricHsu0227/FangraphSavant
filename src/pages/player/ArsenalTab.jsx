import { useState } from 'react';
import { PITCH_NAME, PITCH_COLOR, fmt } from '../../lib/catalog.js';
import { Seg, splitOpts } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { MovementChart, StackBar, PitchDot } from '../../components/charts.jsx';
import { seasonsOf } from './Overview.jsx';

const signed = (v, d = 2) => (v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`);

/** Pitchers: full arsenal by batter hand. Hitters: results by pitch type by pitcher hand. */
export default function ArsenalTab({ group, rows, detail, throws }) {
  const avail = seasonsOf(rows).filter((s) => detail?.[s]);
  const [season, setSeason] = useState(avail[avail.length - 1]);
  const [split, setSplit] = useState('all');
  if (!avail.length) return <div className="empty">Pitch-type data comes from the Statcast detail the pipeline builds.</div>;
  const det = detail?.[season] || {};
  const pit = group === 'pitching';
  const table = (pit ? det.arsenal : det.vsPitch)?.[split] || [];
  const usage = (s) => ((pit ? det.arsenal : det.vsPitch)?.[s] || []).map((p) => ({ label: PITCH_NAME[p.pt] || p.pt, short: p.pt, v: p.use, color: PITCH_COLOR[p.pt] }));
  const cols = pit ? [
    { key: 'pt', label: 'Pitch', left: true, sticky: true, render: (r) => <><PitchDot pt={r.pt} />{PITCH_NAME[r.pt] || r.pt}</> },
    { key: 'n', label: '#' }, { key: 'use', label: 'Use%', f: fmt.pct }, { key: 'velo', label: 'Velo', f: fmt.r1 }, { key: 'spin', label: 'Spin', f: fmt.int },
    { key: 'ivb', label: 'IVB', f: fmt.r1 }, { key: 'hb', label: 'HB', f: fmt.r1 }, { key: 'ext', label: 'Ext', f: fmt.r1 }, { key: 'arm', label: 'Arm°', f: fmt.r1 },
    { key: 'zone', label: 'Zone%', f: fmt.pct }, { key: 'chase', label: 'Chase%', f: fmt.pct, hb: true }, { key: 'whiff', label: 'Whiff%', f: fmt.pct, hb: true },
    { key: 'csw', label: 'CSW%', f: fmt.pct, hb: true }, { key: 'putaway', label: 'PutAway%', f: fmt.pct, hb: true },
    { key: 'pa', label: 'PA' }, { key: 'woba', label: 'wOBA', f: fmt.r3, hb: false }, { key: 'xwoba', label: 'xwOBA', f: fmt.r3, hb: false },
    { key: 'hh', label: 'HardHit%', f: fmt.pct, hb: false }, { key: 'rv', label: 'RV', f: fmt.r1, hb: true }, { key: 'rv100', label: 'RV/100', f: (v) => signed(v), hb: true },
  ] : [
    { key: 'pt', label: 'Pitch', left: true, sticky: true, render: (r) => <><PitchDot pt={r.pt} />{PITCH_NAME[r.pt] || r.pt}</> },
    { key: 'n', label: 'Seen' }, { key: 'use', label: 'Share', f: fmt.pct }, { key: 'velo', label: 'Avg velo', f: fmt.r1 },
    { key: 'swing', label: 'Swing%', f: fmt.pct }, { key: 'chase', label: 'Chase%', f: fmt.pct, hb: false }, { key: 'whiff', label: 'Whiff%', f: fmt.pct, hb: false },
    { key: 'pa', label: 'PA' }, { key: 'woba', label: 'wOBA', f: fmt.r3, hb: true }, { key: 'xwoba', label: 'xwOBA', f: fmt.r3, hb: true },
    { key: 'ev', label: 'EV', f: fmt.r1, hb: true }, { key: 'la', label: 'LA', f: fmt.r1 }, { key: 'hh', label: 'HardHit%', f: fmt.pct, hb: true },
    { key: 'putaway', label: 'K on 2-str', f: fmt.pct, hb: false }, { key: 'rv', label: 'RV', f: fmt.r1, hb: true }, { key: 'rv100', label: 'RV/100', f: (v) => signed(v), hb: true },
  ];
  const groups = det.groups?.[split] || {};
  return (
    <>
      <div className="toolbar">
        <select value={season || ''} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{[...avail].reverse().map((s) => <option key={s}>{s}</option>)}</select>
        <Seg value={split} onChange={setSplit} options={splitOpts(group)} />
      </div>
      <div style={{ height: 10 }} />
      <DataTable rows={table.map((r) => ({ ...r, _key: r.pt }))} cols={cols} heat />
      <div className="grid g3" style={{ marginTop: 14 }}>
        {pit && (
          <div className="panel">
            <h3>Movement</h3>
            <MovementChart arsenal={table} throws={throws} />
          </div>
        )}
        <div className="panel">
          <h3>{pit ? 'Pitch mix by batter hand' : 'What pitchers throw him'}</h3>
          {['all', 'vL', 'vR'].map((s) => (
            <div key={s} style={{ marginBottom: 10 }}>
              <div className="kicker">{s === 'all' ? 'All' : splitOpts(group).find((o) => o.value === s).label}</div>
              <StackBar parts={usage(s)} height={20} />
            </div>
          ))}
          <div className="small muted">{pit ? 'How the mix changes against lefties and righties is where platoon splits come from.' : 'Pitch mix he sees from left- and right-handed pitchers.'}</div>
        </div>
        <div className="panel">
          <h3>By pitch group</h3>
          <DataTable rows={['FB', 'BR', 'OS'].filter((k) => groups[k]).map((k) => ({ _key: k, grp: { FB: 'Fastballs', BR: 'Breaking', OS: 'Offspeed' }[k], ...groups[k] }))} cols={[
            { key: 'grp', label: 'Group', left: true }, { key: 'use', label: pit ? 'Use%' : 'Seen', f: fmt.pct }, { key: 'whiff', label: 'Whiff%', f: fmt.pct },
            { key: 'woba', label: 'wOBA', f: fmt.r3 }, { key: 'xwoba', label: 'xwOBA', f: fmt.r3 }, { key: 'rv100', label: 'RV/100', f: (v) => signed(v) },
          ]} />
          <div className="small muted" style={{ marginTop: 6 }}>{pit ? 'RV/100 from the pitcher’s side (positive = runs saved).' : 'RV/100 from the hitter’s side (positive = runs created).'} These feed the matchup model.</div>
        </div>
      </div>
    </>
  );
}
