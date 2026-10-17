import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getGameLog, splitsOf } from '../../lib/mlbapi.js';
import { fromMLB, woba, wrcPlus, addLines } from '../../lib/stats.js';
import { fmt } from '../../lib/catalog.js';
import { SEASONS, guts } from '../../lib/guts.js';
import { teamById } from '../../lib/teams.js';
import { useAsync, Loading } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { LineChart } from '../../components/charts.jsx';

export default function GameLogs({ id, group, rows }) {
  const seasons = rows.map((r) => r.season).filter((s) => s >= SEASONS[0]);
  const [season, setSeason] = useState(seasons[seasons.length - 1] || SEASONS[SEASONS.length - 1]);
  const gl = useAsync(() => getGameLog(id, season, group), [id, season, group]);
  const list = splitsOf(gl.data).map((x) => {
    const l = fromMLB(x.stat, group);
    const w = woba(l, season);
    return {
      ...l, _key: `${x.game?.gamePk}-${x.date}`, date: x.date, pk: x.game?.gamePk, opp: x.opponent?.id, home: x.isHome, win: x.isWin,
      wOBA: w, wRC: wrcPlus(w, season), ERA: group === 'pitching' && l.IP ? (9 * l.ER) / l.IP : null,
      // Bill James game score (starts only)
      gsc: group === 'pitching' && l.GS ? Math.round(50 + Math.round(l.IP * 3) + 2 * Math.max(0, Math.floor(l.IP) - 4) + l.SO
        - 2 * l.H - 4 * l.ER - 2 * (l.Rallowed - l.ER) - l.BB) : null,
    };
  });
  // rolling 10-game wOBA
  const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
  const roll = sorted.map((g, i) => {
    const win = sorted.slice(Math.max(0, i - 9), i + 1).reduce((a, r) => addLines(a, r), {});
    return [i + 1, woba(win, season)];
  });
  const cols = group === 'hitting' ? ['PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'SO', 'SB'] : ['IP', 'H', 'Rallowed', 'ER', 'BB', 'SO', 'HR', 'pitches'];
  const g = guts(season);
  return (
    <>
      <div className="toolbar"><select value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{[...seasons].reverse().map((s) => <option key={s}>{s}</option>)}</select></div>
      {gl.loading ? <Loading /> : (
        <>
          {roll.length > 5 && (
            <div className="panel" style={{ marginTop: 10 }}>
              <h3>Rolling 10-game wOBA{group === 'pitching' ? ' allowed' : ''}</h3>
              <LineChart height={150} series={[{ name: '10-game wOBA', color: 'var(--accent-2)', points: roll, labelOf: (p) => sorted[p[0] - 1]?.date }]}
                refs={[{ y: g.woba, label: 'lg' }]} yFmt={(v) => v.toFixed(3).replace(/^0/, '')} xFmt={(v) => `G${v}`} area />
            </div>
          )}
          <div style={{ height: 10 }} />
          <DataTable rows={list} defaultSort={{ key: 'date', dir: 'desc' }} heat cols={[
            { key: 'date', label: 'Date', left: true, sticky: true, render: (r) => <Link to={`/game/${r.pk}`}>{r.date}</Link> },
            { key: 'opp', label: 'Opp', left: true, render: (r) => <>{r.home ? 'vs' : '@'} {teamById[r.opp]?.abbr}</> },
            ...cols.map((k) => ({ key: k, label: { Rallowed: 'R', pitches: 'NP', SO: 'K' }[k] || k, f: k === 'IP' ? fmt.ip : undefined })),
            { key: 'wOBA', label: group === 'hitting' ? 'wOBA' : 'wOBA a', f: fmt.r3, hb: group === 'hitting' },
            { key: 'wRC', label: group === 'hitting' ? 'wRC+' : 'wRC+ a', hb: group === 'hitting' },
            ...(group === 'pitching' ? [{ key: 'gsc', label: 'GSc', title: 'Bill James game score', hb: true }] : []),
          ]} />
        </>
      )}
    </>
  );
}
