import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSeasonSchedule, headshot, api } from '../../lib/mlbapi.js';
import { loadSeason, loadLineups } from '../../lib/data.js';
import { loadSeries } from '../../lib/postseason.js';
import { teamById, seriesName } from '../../lib/teams.js';
import { fmt } from '../../lib/catalog.js';
import { useAsync, Loading, PlayerLink, Seg } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One-line postseason result, e.g. "Won WS 4-1 over NYY · Won NLCS 4-2 over NYM". */
export function PostseasonResult({ teamId, season }) {
  const s = useAsync(() => loadSeries(season).catch(() => []), [season]);
  const mine = (s.data || []).filter((x) => x.teams.includes(teamId));
  if (!mine.length) return null;
  const order = { W: 0, L: 1, D: 2, F: 3 };
  return (
    <div className="small" style={{ marginTop: 2 }}>
      {mine.sort((a, b) => order[a.type] - order[b.type]).map((x, i) => {
        const opp = x.teams.find((t) => t !== teamId);
        const won = x.winner === teamId;
        const label = x.type === 'W' ? 'WS' : seriesName(x.type, x.lg).replace(' Wild Card', ' WC');
        return (
          <span key={x.key}>{i ? ' · ' : ''}
            <Link to={`/series/${season}/${x.type}/${x.teams.join('-')}`} style={{ color: won ? 'var(--good)' : x.winner ? 'var(--bad)' : 'inherit' }}>
              {x.winner ? (won ? 'Won' : 'Lost') : 'Playing'} {label} {x.wins[teamId]}-{x.wins[opp]} vs {teamById[opp]?.abbr}
            </Link>
          </span>
        );
      })}
    </div>
  );
}

export const getAttendance = (teamId, season) => api(`/api/v1/attendance?teamId=${teamId}&season=${season}`, { ttl: 24 * 3600_000 });

/** Baseball-Reference-style game-by-game margin chart, grouped by month, every bar links to the box score. */
export function ResultsBars({ teamId, season }) {
  const sched = useAsync(() => getSeasonSchedule(season, 'R,F,D,L,W'), [season]);
  const [hover, setHover] = useState(null);
  const games = useMemo(() => {
    const out = [];
    for (const d of sched.data?.dates || []) for (const g of d.games) {
      const home = g.teams.home.team.id === teamId, away = g.teams.away.team.id === teamId;
      if (!home && !away || g.status?.abstractGameState !== 'Final') continue;
      const me = home ? g.teams.home : g.teams.away, op = home ? g.teams.away : g.teams.home;
      if (me.score == null) continue;
      out.push({ pk: g.gamePk, date: g.officialDate || d.date, home, opp: op.team.id, rs: me.score, ra: op.score, post: g.gameType !== 'R' });
    }
    return out;
  }, [sched.data, teamId]);
  if (sched.loading) return <Loading what="results" />;
  if (!games.length) return <div className="muted small">No completed games.</div>;
  const max = Math.max(5, ...games.map((g) => Math.abs(g.rs - g.ra)));
  const bw = 5, gap = 1, H = 110, mid = H / 2;
  const W = games.length * (bw + gap);
  const monthStarts = [];
  games.forEach((g, i) => { const m = Number(g.date.slice(5, 7)); if (!i || m !== Number(games[i - 1].date.slice(5, 7))) monthStarts.push([i, m]); });
  let streak = 0, best = 0, worst = 0;
  for (const g of games.filter((x) => !x.post)) { const w = g.rs > g.ra; streak = w ? (streak > 0 ? streak + 1 : 1) : (streak < 0 ? streak - 1 : -1); best = Math.max(best, streak); worst = Math.min(worst, streak); }
  const h = hover != null ? games[hover] : null;
  return (
    <div>
      <div className="chart-scroll">
        <svg width={W} height={H + 16} role="img" aria-label="Game-by-game run margins" onMouseLeave={() => setHover(null)}>
          <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--line)" />
          {monthStarts.map(([i, m]) => (
            <g key={i}><line x1={i * (bw + gap) - 1} x2={i * (bw + gap) - 1} y1="0" y2={H} stroke="var(--line)" />
              <text x={i * (bw + gap) + 2} y={H + 12} fontSize="10" fill="var(--muted)">{MONTHS[m]}</text></g>
          ))}
          {games.map((g, i) => {
            const m = g.rs - g.ra, len = (Math.abs(m) / max) * (mid - 4);
            return (
              <Link key={g.pk} to={`/game/${g.pk}`}>
                <rect x={i * (bw + gap)} y={m > 0 ? mid - len : mid} width={bw} height={Math.max(1, len)}
                  fill={m > 0 ? 'var(--win)' : 'var(--loss)'} opacity={g.post ? 1 : hover === i ? 1 : 0.8}
                  stroke={g.post ? 'var(--ink)' : 'none'} strokeWidth={g.post ? 0.6 : 0}
                  onMouseEnter={() => setHover(i)} />
              </Link>
            );
          })}
        </svg>
      </div>
      <div className="small muted" style={{ minHeight: 18 }}>
        {h ? <>{h.date} · {h.home ? 'vs' : '@'} {teamById[h.opp]?.abbr} · <b style={{ color: h.rs > h.ra ? 'var(--win)' : 'var(--loss)' }}>{h.rs > h.ra ? 'W' : 'L'} {h.rs}-{h.ra}</b>{h.post ? ' · postseason' : ''}</>
          : <>Bar height = run margin · outlined bars are postseason · longest win streak {best}, losing streak {Math.abs(worst)}</>}
      </div>
    </div>
  );
}

/** Top players by value with headshots (WAR three ways). */
export function TopPlayers({ teamId, season }) {
  const [metric, setMetric] = useState('vWAR');
  const data = useAsync(async () => {
    const [b, p] = await Promise.all([loadSeason(season, 'hitting'), loadSeason(season, 'pitching')]);
    const mine = (rows, kind) => rows.filter((r) => r.teamId === teamId || r.stints?.some((s) => s.teamId === teamId)).map((r) => ({ ...r, kind }));
    return [...mine(b, 'bat'), ...mine(p, 'pit')];
  }, [teamId, season]);
  if (data.loading) return <Loading />;
  const val = (r) => {
    const a = r.splits?.all || {};
    if (metric === 'fWAR') return a.fWAR ?? null;
    if (metric === 'eWAR') return a.eWAR ?? null;
    if (metric === 'vWAR') return a.vWAR ?? null;
    return r.kind === 'pit' ? a.WAR_wOBA : a.vWAR;
  };
  const merged = new Map();
  for (const r of data.data || []) {
    const v = val(r);
    if (v == null) continue;
    const cur = merged.get(r.id);
    if (!cur) merged.set(r.id, { ...r, v, roles: [r.kind] });
    else { cur.v += v; cur.roles.push(r.kind); }
  }
  const top = [...merged.values()].sort((a, b) => b.v - a.v).slice(0, 12);
  return (
    <>
      <div className="panel-h">
        <h3>Top players</h3>
        <Seg value={metric} onChange={setMetric} options={[{ value: 'vWAR', label: 'vWAR' }, { value: 'eWAR', label: 'eWAR' }, { value: 'fWAR', label: 'fWAR' }]} />
      </div>
      {!top.length ? <div className="muted small">Value stats appear once the season’s data is built.</div> : (
        <div className="top-players">
          {top.map((r, i) => (
            <Link key={r.id} to={`/player/${r.id}`} className="tp">
              <span className="tp-rank">{i + 1}</span>
              <img src={headshot(r.id, 90)} alt="" loading="lazy" />
              <span className="tp-name">{r.name}</span>
              <span className="tp-sub">{r.roles.includes('pit') && !r.roles.includes('bat') ? 'P' : r.pos || ''} · <b>{r.v.toFixed(1)}</b></span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

const POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/** Appearances: starts by position (BBRef "Full Season Roster & Appearances"), split by opposing starter hand. */
export function Appearances({ teamId, season }) {
  const [hand, setHand] = useState('all');
  const lu = useAsync(() => loadLineups(season), [season]);
  const games = lu.data?.teams?.[teamId] || lu.data?.teams?.[String(teamId)];
  const rows = useMemo(() => {
    if (!games) return [];
    const by = new Map();
    for (const g of games) {
      if (hand !== 'all' && g[7] !== hand) continue;
      (g[8] || []).forEach(([pid, pos], slot) => {
        let r = by.get(pid);
        if (!r) { r = { id: pid, _key: pid, GS: 0, slots: 0 }; by.set(pid, r); }
        r.GS++; r[pos] = (r[pos] || 0) + 1; r.slots += slot + 1;
      });
    }
    return [...by.values()].map((r) => ({ ...r, avgSlot: r.slots / r.GS, primary: POS.reduce((a, p) => ((r[p] || 0) > (r[a] || 0) ? p : a), 'C') }));
  }, [games, hand]);
  if (lu.loading) return <Loading what="appearances" />;
  if (!games) return <div className="loading">Starting lineups for {season} come from the data pipeline and haven’t been built yet.</div>;
  const names = lu.data?.names || {};
  const total = games.filter((g) => hand === 'all' || g[7] === hand).length;
  return (
    <>
      <div className="toolbar">
        <Seg value={hand} onChange={setHand} options={[{ value: 'all', label: 'All games' }, { value: 'R', label: 'vs RHP starters' }, { value: 'L', label: 'vs LHP starters' }]} />
        <span className="small muted">{total} games · cells are starts at each position</span>
      </div>
      <div style={{ height: 8 }} />
      <DataTable rows={rows} defaultSort={{ key: 'GS', dir: 'desc' }} heat cols={[
        { key: 'name', label: 'Player', left: true, sticky: true, get: (r) => names[r.id] || '', render: (r) => <PlayerLink id={r.id} name={names[r.id] || `#${r.id}`} /> },
        { key: 'primary', label: 'Pos', left: true },
        { key: 'GS', label: 'GS', hb: true }, { key: 'share', label: 'Start%', get: (r) => r.GS / Math.max(1, total), f: fmt.pct, hb: true },
        { key: 'avgSlot', label: 'Avg slot', f: (v) => v.toFixed(1), hb: false },
        ...POS.map((p) => ({ key: p, label: p, f: (v) => v || '', hb: true })),
      ]} />
    </>
  );
}
