import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGameLog, splitsOf } from '../../lib/mlbapi.js';
import { fromMLB, woba, wrcPlus, addLines } from '../../lib/stats.js';
import { fmt } from '../../lib/catalog.js';
import { SEASONS, guts } from '../../lib/guts.js';
import { teamById } from '../../lib/teams.js';
import { loadPlayerIndex } from '../../lib/data.js';
import { useAsync, Loading, Seg, PlayerLink } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { LineChart } from '../../components/charts.jsx';

const sgn = (v, d = 3) => (v == null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`);

/**
 * Game log (MLB box lines + Statcast per game: xwOBA, max EV, barrels, WPA, velo, CSW)
 * and a play log of every PA with result, EV/LA, xwOBA, pitches and WPA.
 */
export default function GameLogs({ id, group, rows, detail }) {
  const seasons = rows.map((r) => r.season).filter((s) => s >= SEASONS[0]);
  const [season, setSeason] = useState(seasons[seasons.length - 1] || SEASONS[SEASONS.length - 1]);
  const [view, setView] = useState('games');
  const d = detail?.[season] || detail?.[String(season)] || {};
  return (
    <>
      <div className="toolbar">
        <select value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{[...seasons].reverse().map((s) => <option key={s}>{s}</option>)}</select>
        <Seg value={view} onChange={setView} options={[{ value: 'games', label: 'Game log' }, { value: 'plays', label: `Play log${d.plays ? ` (${d.plays.length})` : ''}` }]} />
      </div>
      {view === 'games' ? <Games id={id} group={group} season={season} sc={d.games} /> : <Plays group={group} plays={d.plays} />}
    </>
  );
}

function Games({ id, group, season, sc }) {
  const gl = useAsync(() => getGameLog(id, season, group), [id, season, group]);
  const hitting = group === 'hitting';
  const list = useMemo(() => splitsOf(gl.data).map((x) => {
    const l = fromMLB(x.stat, group);
    const w = woba(l, season);
    const s = sc?.[String(x.game?.gamePk)];
    const xw = s && s[2] ? s[3] / s[2] : null;
    return {
      ...l, _key: `${x.game?.gamePk}-${x.date}`, date: x.date, pk: x.game?.gamePk, opp: x.opponent?.id, home: x.isHome, win: x.isWin,
      wOBA: w, wRC: wrcPlus(w, season), xwOBA: xw, xwRC: xw != null ? wrcPlus(xw, season) : null,
      maxEV: s?.[4], brl: s?.[5], hh: s?.[6], WPA: s?.[7], np: s?.[8], whiff: s?.[9], csw: s && s[8] ? s[10] / s[8] : null, velo: s?.[11],
      ERA: !hitting && l.IP ? (9 * l.ER) / l.IP : null,
      gsc: !hitting && l.GS ? Math.round(50 + Math.round(l.IP * 3) + 2 * Math.max(0, Math.floor(l.IP) - 4) + l.SO
        - 2 * l.H - 4 * l.ER - 2 * (l.Rallowed - l.ER) - l.BB) : null,
    };
  }), [gl.data, sc, season, group, hitting]);
  const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
  const roll = (key) => sorted.map((g, i) => {
    const win = sorted.slice(Math.max(0, i - 9), i + 1);
    if (key === 'x') {
      const pts = win.filter((r) => r.xwOBA != null);
      const den = pts.reduce((a, r) => a + (sc?.[String(r.pk)]?.[2] || 0), 0);
      return [i + 1, den ? pts.reduce((a, r) => a + (sc?.[String(r.pk)]?.[3] || 0), 0) / den : null];
    }
    return [i + 1, woba(win.reduce((a, r) => addLines(a, r), {}), season)];
  });
  const g = guts(season);
  const hasSC = list.some((r) => r.xwOBA != null);
  const cols = hitting ? ['PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'SO', 'SB'] : ['IP', 'H', 'Rallowed', 'ER', 'BB', 'SO', 'HR', 'pitches'];
  const wpaTot = list.reduce((a, r) => a + (r.WPA || 0), 0);
  if (gl.loading) return <Loading what="game log" />;
  return (
    <>
      {sorted.length > 5 && (
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="panel-h"><h3>Rolling 10-game wOBA{hitting ? '' : ' allowed'}{hasSC ? ' and xwOBA' : ''}</h3>
            {hasSC && <span className="small muted">WPA this season {sgn(wpaTot, 2)}</span>}</div>
          <LineChart height={160} series={[
            { name: 'wOBA', color: 'var(--accent-2)', points: roll('w'), labelOf: (p) => sorted[p[0] - 1]?.date },
            ...(hasSC ? [{ name: 'xwOBA', color: 'var(--accent)', points: roll('x').filter((p) => p[1] != null), labelOf: (p) => sorted[p[0] - 1]?.date }] : []),
          ]} refs={[{ y: g.woba, label: 'lg' }]} yFmt={(v) => v.toFixed(3).replace(/^0/, '')} xFmt={(v) => `G${v}`} />
        </div>
      )}
      <div style={{ height: 10 }} />
      <DataTable rows={list} defaultSort={{ key: 'date', dir: 'desc' }} heat cols={[
        { key: 'date', label: 'Date', left: true, sticky: true, render: (r) => <Link to={`/game/${r.pk}`}>{r.date}</Link> },
        { key: 'opp', label: 'Opp', left: true, render: (r) => <>{r.home ? 'vs' : '@'} {teamById[r.opp]?.abbr}</> },
        ...cols.map((k) => ({ key: k, label: { Rallowed: 'R', pitches: 'NP', SO: 'K' }[k] || k, f: k === 'IP' ? fmt.ip : undefined })),
        { key: 'wOBA', label: hitting ? 'wOBA' : 'wOBA a', f: fmt.r3, hb: hitting },
        ...(hasSC ? [{ key: 'xwOBA', label: hitting ? 'xwOBA' : 'xwOBA a', f: fmt.r3, hb: hitting }] : []),
        { key: 'wRC', label: hitting ? 'wRC+' : 'wRC+ a', hb: hitting },
        ...(hasSC ? [
          { key: 'maxEV', label: 'Max EV', f: fmt.r1, hb: hitting },
          { key: 'brl', label: 'Brl', hb: hitting }, { key: 'hh', label: 'HH', title: 'Hard-hit balls (95+ mph)', hb: hitting },
          ...(!hitting ? [{ key: 'velo', label: 'FB velo', f: fmt.r1, hb: true }, { key: 'whiff', label: 'Whiffs', hb: true }, { key: 'csw', label: 'CSW%', f: fmt.pct, hb: true }] : []),
          { key: 'WPA', label: 'WPA', f: (v) => sgn(v), hb: true },
        ] : []),
        ...(!hitting ? [{ key: 'gsc', label: 'GSc', title: 'Bill James game score', hb: true }] : []),
      ]} />
      {!hasSC && <p className="small muted">Per-game xwOBA, exit velocity and WPA appear once the Statcast detail for {season} is built.</p>}
    </>
  );
}

const RESULT_TONE = { HR: 'good', '3B': 'good', '2B': 'good', '1B': 'good', BB: 'ok', IBB: 'ok', HBP: 'ok', K: 'bad', GIDP: 'bad', DP: 'bad' };

function Plays({ group, plays }) {
  const [hand, setHand] = useState('all');
  const [res, setRes] = useState('all');
  const idx = useAsync(() => loadPlayerIndex(), []);
  const names = useMemo(() => Object.fromEntries((idx.data || []).map((p) => [p.id, p.name])), [idx.data]);
  if (!plays?.length) return <div className="loading">The play log needs this season’s Statcast detail, which the data pipeline builds.</div>;
  const hitting = group === 'hitting';
  let list = plays.map((p, i) => ({
    _key: i, n: i + 1, date: p[0], opp: p[1], inn: p[2], outs: p[3], res: p[4], ev: p[5], la: p[6], xw: p[7], np: p[8], wpa: p[9], hand: p[10], pk: p[11],
  }));
  if (hand !== 'all') list = list.filter((r) => r.hand === hand);
  if (res === 'hits') list = list.filter((r) => ['1B', '2B', '3B', 'HR'].includes(r.res));
  if (res === 'k') list = list.filter((r) => r.res === 'K');
  if (res === 'bip') list = list.filter((r) => r.ev != null);
  if (res === 'big') list = list.filter((r) => Math.abs(r.wpa || 0) >= 0.1);
  // results the batter/pitcher "deserved": high-xwOBA outs and low-xwOBA hits
  const unlucky = list.filter((r) => r.ev != null && r.res === 'Out' && r.xw >= 0.5).length;
  const lucky = list.filter((r) => r.ev != null && ['1B', '2B', '3B', 'HR'].includes(r.res) && r.xw < 0.2).length;
  const tone = (r) => {
    const t = RESULT_TONE[r.res];
    if (!t) return 'var(--muted)';
    const good = t === 'good' || t === 'ok';
    return (good === hitting) ? 'var(--good)' : 'var(--bad)';
  };
  return (
    <>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <Seg value={hand} onChange={setHand} options={[{ value: 'all', label: 'All' }, { value: 'L', label: hitting ? 'vs LHP' : 'vs LHB' }, { value: 'R', label: hitting ? 'vs RHP' : 'vs RHB' }]} />
        <Seg value={res} onChange={setRes} options={[{ value: 'all', label: 'All PA' }, { value: 'hits', label: 'Hits' }, { value: 'k', label: 'K' }, { value: 'bip', label: 'In play' }, { value: 'big', label: '|WPA| ≥ .10' }]} />
      </div>
      <div className="small muted" style={{ margin: '6px 0' }}>
        {list.length} PA · {hitting ? 'hard-luck outs' : 'hard-hit outs'} (xwOBA ≥ .500): <b>{unlucky}</b> · {hitting ? 'cheap hits' : 'soft hits allowed'} (xwOBA &lt; .200): <b>{lucky}</b>
      </div>
      <DataTable rows={list} limit={100} defaultSort={{ key: 'n', dir: 'desc' }} cols={[
        { key: 'n', label: '#', left: true },
        { key: 'date', label: 'Date', left: true, render: (r) => <Link to={`/game/${r.pk}`}>{r.date}</Link> },
        { key: 'opp', label: hitting ? 'Pitcher' : 'Batter', left: true, get: (r) => names[r.opp] || '', render: (r) => <PlayerLink id={r.opp} name={names[r.opp] || `#${r.opp}`} hand={r.hand} /> },
        { key: 'inn', label: 'Inn' }, { key: 'outs', label: 'Out' },
        { key: 'res', label: 'Result', left: true, render: (r) => <b style={{ color: tone(r) }}>{r.res}</b> },
        { key: 'ev', label: 'EV', f: (v) => (v == null ? '' : v) }, { key: 'la', label: 'LA', f: (v) => (v == null ? '' : `${v}°`) },
        { key: 'xw', label: 'xwOBA', f: fmt.r3 }, { key: 'np', label: 'Pitches' },
        { key: 'wpa', label: 'WPA', f: (v) => sgn(v) },
      ]} />
    </>
  );
}
