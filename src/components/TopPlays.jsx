import { Link } from 'react-router-dom';
import { PITCH_NAME } from '../lib/catalog.js';
import { PlayerLink } from './ui.jsx';
import DataTable from './DataTable.jsx';
import { PitchDot } from './charts.jsx';

/** Savant-postseason-style leaderboards of individual plays. */
export default function TopPlays({ top }) {
  if (!top) return null;
  const who = (k) => ({ key: k, label: k === 'batter' ? 'Batter' : 'Pitcher', left: true, get: (r) => r[k]?.fullName, render: (r) => <PlayerLink id={r[k]?.id} name={r[k]?.fullName} /> });
  const when = { key: 'date', label: 'Game', left: true, render: (r) => <Link to={`/game/${r.pk}`}>{r.date?.slice(5)} · {r.inn}</Link> };
  return (
    <div className="grid g2">
      <div className="panel">
        <h3>Hardest-hit balls</h3>
        <DataTable rows={top.hard.map((r, i) => ({ ...r, _key: i }))} cols={[who('batter'), { key: 'ev', label: 'EV' }, { key: 'la', label: 'LA' }, { key: 'event', label: 'Result', left: true }, when]} />
      </div>
      <div className="panel">
        <h3>Longest home runs</h3>
        {top.hrs.length ? <DataTable rows={top.hrs.map((r, i) => ({ ...r, _key: i }))} cols={[who('batter'), { key: 'dist', label: 'Feet' }, { key: 'ev', label: 'EV' }, who('pitcher'), when]} /> : <div className="muted small">No home runs.</div>}
      </div>
      <div className="panel">
        <h3>Fastest pitches</h3>
        <DataTable rows={top.velo.map((r, i) => ({ ...r, _key: i }))} cols={[who('pitcher'), { key: 'velo', label: 'MPH', f: (v) => v.toFixed(1) },
          { key: 'pt', label: 'Pitch', left: true, render: (r) => <><PitchDot pt={r.pt} />{PITCH_NAME[r.pt] || r.pt}</> }, who('batter'), when]} />
      </div>
      <div className="panel">
        <h3>Biggest swings in win probability</h3>
        <DataTable rows={top.wpa.map((r, i) => ({ ...r, _key: i }))} cols={[who('batter'), { key: 'wpa', label: 'WPA', f: (v) => `${v.toFixed(1)}%` },
          { key: 'li', label: 'LI', f: (v) => (v == null ? '' : v.toFixed(2)), title: 'Leverage index' }, { key: 'event', label: 'Play', left: true }, when]} />
      </div>
    </div>
  );
}
