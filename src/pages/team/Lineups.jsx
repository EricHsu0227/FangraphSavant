import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadLineups } from '../../lib/data.js';
import { teamById } from '../../lib/teams.js';
import { useAsync, Loading, PlayerLink, Seg, Hand } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';

const POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/** Baseball-Reference "Batting Orders" + "Defensive Lineups", with an opposing-starter-hand filter. */
export default function Lineups({ teamId, season }) {
  const data = useAsync(() => loadLineups(season), [season]);
  const [hand, setHand] = useState('all');
  const [view, setView] = useState('orders');
  const games = useMemo(() => (data.data?.teams?.[teamId] || []).filter((g) => hand === 'all' || g[7] === hand), [data.data, teamId, hand]);
  const names = data.data?.names || {};
  const nm = (id) => names[id] || `#${id}`;
  if (data.loading) return <Loading what="lineups" />;
  if (!data.data) return <div className="empty">Game-by-game lineups for {season} come from the data pipeline and aren’t built yet.</div>;

  // defensive matrix + slot matrix
  const def = {}, slots = {};
  for (const g of games) g[8].forEach((x, i) => {
    if (!x) return;
    const [id, pos] = x;
    (def[id] ||= {})[pos] = (def[id][pos] || 0) + 1;
    (slots[id] ||= {})[i + 1] = (slots[id][i + 1] || 0) + 1;
  });
  const lineupKey = (g) => g[8].map((x) => x?.[0]).join('-');
  const distinct = new Set(games.map(lineupKey)).size;
  return (
    <>
      <div className="toolbar">
        <Seg value={view} onChange={setView} options={[{ value: 'orders', label: 'Batting orders' }, { value: 'def', label: 'Defensive starts' }, { value: 'slots', label: 'Starts by slot' }]} />
        <Seg value={hand} onChange={setHand} options={[{ value: 'all', label: 'All starters' }, { value: 'R', label: 'vs RHP' }, { value: 'L', label: 'vs LHP' }]} />
        <span className="small muted">{games.length} games · {distinct} different lineups</span>
      </div>
      <div style={{ height: 10 }} />
      {view === 'orders' && (
        <DataTable rows={games.map((g) => ({ _key: g[1], g }))} defaultSort={{ key: 'date', dir: 'desc' }} limit={60} cols={[
          { key: 'date', label: 'Date', left: true, sticky: true, get: (r) => r.g[0], render: (r) => <Link to={`/game/${r.g[1]}`}>{r.g[0].slice(5)}</Link> },
          { key: 'opp', label: 'Opp', left: true, get: (r) => teamById[r.g[2]]?.abbr, render: (r) => `${r.g[3] ? 'vs' : '@'} ${teamById[r.g[2]]?.abbr || ''}` },
          { key: 'res', label: 'Result', left: true, get: (r) => (r.g[4] ?? 0) - (r.g[5] ?? 0), render: (r) => (r.g[4] == null ? '' : `${r.g[4] > r.g[5] ? 'W' : 'L'} ${r.g[4]}-${r.g[5]}`) },
          { key: 'sp', label: 'Opp SP', left: true, get: (r) => nm(r.g[6]), render: (r) => <><PlayerLink id={r.g[6]} name={nm(r.g[6])} /><Hand h={r.g[7]} /></> },
          ...Array.from({ length: 9 }, (_, i) => ({ key: `s${i}`, label: String(i + 1), left: true, get: (r) => nm(r.g[8][i]?.[0]),
            render: (r) => (r.g[8][i] ? <><PlayerLink id={r.g[8][i][0]} name={short(nm(r.g[8][i][0]))} /> <span className="muted small">{r.g[8][i][1]}</span></> : '') })),
        ]} />
      )}
      {view === 'def' && (
        <DataTable rows={Object.entries(def).map(([id, c]) => ({ _key: id, id: Number(id), name: nm(id), ...c, total: Object.values(c).reduce((a, b) => a + b, 0) }))}
          defaultSort={{ key: 'total', dir: 'desc' }} heat cols={[
            { key: 'name', label: 'Player', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
            { key: 'total', label: 'Starts' }, ...POS.map((p) => ({ key: p, label: p, hb: true })),
          ]} />
      )}
      {view === 'slots' && (
        <DataTable rows={Object.entries(slots).map(([id, c]) => ({ _key: id, id: Number(id), name: nm(id), ...Object.fromEntries(Object.entries(c).map(([k, v]) => [`b${k}`, v])), total: Object.values(c).reduce((a, b) => a + b, 0) }))}
          defaultSort={{ key: 'total', dir: 'desc' }} heat cols={[
            { key: 'name', label: 'Player', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
            { key: 'total', label: 'Starts' }, ...Array.from({ length: 9 }, (_, i) => ({ key: `b${i + 1}`, label: `#${i + 1}`, hb: true })),
          ]} />
      )}
    </>
  );
}

const short = (s) => { const p = String(s).split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : s; };
