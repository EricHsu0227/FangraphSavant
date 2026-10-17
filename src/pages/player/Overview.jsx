import { useState } from 'react';
import { loadSeason } from '../../lib/data.js';
import { regressSplits, similar } from '../../lib/platoon.js';
import { statDef, fmt } from '../../lib/catalog.js';
import { guts, SEASONS } from '../../lib/guts.js';
import { useAsync, Loading, PlayerLink, Seg } from '../../components/ui.jsx';
import Percentiles from '../../components/Percentiles.jsx';
import DataTable from '../../components/DataTable.jsx';
import { LineChart } from '../../components/charts.jsx';

export const seasonsOf = (rows) => rows.map((r) => r.season).filter((s) => s >= SEASONS[0]);

export default function Overview({ id, group, rows, detail, bats, throws }) {
  const avail = seasonsOf(rows);
  const [season, setSeason] = useState(avail[avail.length - 1]);
  const all = useAsync(() => (season ? loadSeason(season, group) : null), [season, group]);
  const cur = rows.find((r) => r.season === season);
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="small muted">Season</span>
        <select value={season || ''} onChange={(e) => setSeason(Number(e.target.value))}>{[...avail].reverse().map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="grid g2">
        <div className="grid">
          {all.loading ? <Loading /> : <Percentiles group={group} season={season} rows={all.data} playerId={id} />}
          <ValueTiles group={group} line={cur?.splits?.all} />
        </div>
        <div className="grid">
          <PlatoonCard group={group} row={cur} hand={group === 'hitting' ? bats : throws} season={season} />
          <Rolling detail={detail?.[season]} season={season} group={group} />
        </div>
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <YearToYear group={group} rows={rows} season={season} />
        <Similar group={group} rows={all.data} id={id} season={season} />
      </div>
    </>
  );
}

function ValueTiles({ group, line }) {
  if (!line) return null;
  const keys = group === 'hitting'
    ? [['fWAR', 'fWAR'], ['vWAR', 'vWAR'], ['eWAR', 'eWAR'], ['wRCplus', 'wRC+'], ['xwRCplus', 'xwRC+'], ['WPA', 'WPA'], ['RE24', 'RE24'], ['bsr', 'BsR'], ['frv', 'FRV']]
    : [['fWAR', 'fWAR'], ['WAR_FIP', 'WAR (FIP)'], ['WAR_wOBA', 'WAR (wOBA)'], ['vWAR', 'vWAR'], ['eWAR', 'eWAR'], ['wRCplusAllowed', 'wRC+ a'], ['WPA', 'WPA'], ['RE24', 'RE24']];
  return (
    <div className="panel">
      <div className="panel-h"><h3>Value</h3><span className="small muted">WAR three ways + context</span></div>
      <div className="stat-tiles">
        {keys.map(([k, l]) => <div className="tile" key={k}><div className="k">{l}</div><div className="v">{statDef(group, k).f(line[k]) || '—'}</div></div>)}
      </div>
    </div>
  );
}

/** Observed vs regressed platoon split (the core of the app). */
export function PlatoonCard({ group, row, hand, season }) {
  if (!row?.splits?.vL || !row?.splits?.vR) return null;
  const role = group === 'hitting' ? 'batter' : 'pitcher';
  const r = regressSplits(row.splits, role, hand);
  const g = guts(season);
  const lbl = group === 'hitting' ? ['vs LHP', 'vs RHP'] : ['vs LHB', 'vs RHB'];
  const w = r?.metrics?.wOBA, x = r?.metrics?.xwOBA;
  const wrc = (v) => (v == null ? '—' : Math.round((((v - g.woba) / g.scale + g.rPA) / g.rPA) * 100));
  return (
    <div className="panel">
      <div className="panel-h"><h3>Platoon split</h3><span className="pill">{group === 'hitting' ? `bats ${hand}` : `throws ${hand}`}</span></div>
      <div className="platoon-bar">
        {['vL', 'vR'].map((s, i) => (
          <div key={s} className={s === 'vL' ? 'L' : 'R'}>
            <div className="kicker">{lbl[i]} · {row.splits[s].PA || row.splits[s].TBF} PA</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{fmt.r3(row.splits[s].wOBA)}</div>
            <div className="small mono">xwOBA {fmt.r3(row.splits[s].xwOBA) || '—'} · {group === 'hitting' ? 'wRC+' : 'wRC+ a'} {group === 'hitting' ? row.splits[s].wRCplus : row.splits[s].wRCplusAllowed}</div>
            {w && <div className="small mono" title="Regressed toward the league platoon split for his handedness">
              True talent: <b>{fmt.r3(w[s])}</b>{x ? ` / x ${fmt.r3(x[s])}` : ''} · {group === 'hitting' ? 'wRC+' : 'wRC+ a'} {wrc(w[s])}
            </div>}
          </div>
        ))}
      </div>
      {w && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Observed split {(w.obs * 1000).toFixed(0)} wOBA points; regressed {(w.reg * 1000).toFixed(0)} (league {(r.cfg.lg * 1000).toFixed(0)} for {hand === 'S' ? 'switch hitters' : `${hand}H${role === 'batter' ? 'B' : 'P'}`},
          {' '}{Math.round(r.weight * 100)}% weight on his own split). Platoon splits need thousands of PA to stabilize, so the regressed line is the better estimate.
        </p>
      )}
    </div>
  );
}

function Rolling({ detail, season, group }) {
  const rows = detail?.rolling || [];
  const g = guts(season);
  if (!rows.length) return <div className="panel"><h3>Rolling wOBA</h3><div className="muted small">Not enough PA, or Statcast detail not built yet.</div></div>;
  return (
    <div className="panel">
      <div className="panel-h"><h3>Rolling {group === 'hitting' ? '100 PA' : '150 BF'}</h3><span className="small muted">wOBA vs xwOBA{group === 'pitching' ? ' allowed' : ''}</span></div>
      <LineChart height={190}
        series={[{ name: 'wOBA', color: 'var(--accent-2)', points: rows.map((r) => [r[0], r[2]]), labelOf: (p) => rows.find((r) => r[0] === p[0])?.[1] },
          { name: 'xwOBA', color: 'var(--accent)', points: rows.map((r) => [r[0], r[3]]) }]}
        refs={[{ y: g.woba, label: `lg ${g.woba.toFixed(3).slice(1)}` }]} yFmt={(v) => v.toFixed(3).replace(/^0/, '')} xFmt={(v) => `${v}`} />
    </div>
  );
}

function YearToYear({ group, rows, season }) {
  const cur = rows.find((r) => r.season === season)?.splits?.all;
  const prev = rows.find((r) => r.season === season - 1)?.splits?.all;
  const keys = group === 'hitting'
    ? ['wOBA', 'xwOBA', 'K%', 'BB%', 'EV', 'Barrel%', 'HardHit%', 'LA', 'Chase%', 'Whiff%', 'BatSpeed', 'Pull Air%', 'sprint']
    : ['wOBA', 'xwOBA', 'K%', 'BB%', 'Whiff%', 'Chase%', 'CSW%', 'Barrel%', 'HardHit%', 'GB%', 'FBvelo', 'IVB', 'Ext'];
  if (!cur || !prev) return <div className="panel"><h3>Year-to-year</h3><div className="muted small">No prior season to compare.</div></div>;
  const data = keys.filter((k) => cur[k] != null && prev[k] != null).map((k) => {
    const d = statDef(group, k);
    const diff = cur[k] - prev[k];
    const good = d.hb == null ? 0 : (d.hb ? diff : -diff);
    return { _key: k, k: d.label, prev: d.f(prev[k]), cur: d.f(cur[k]), diff, good, f: d.f };
  });
  return (
    <div className="panel">
      <div className="panel-h"><h3>Year-to-year changes</h3><span className="small muted">{season - 1} → {season}</span></div>
      <DataTable rows={data} cols={[
        { key: 'k', label: 'Stat', left: true }, { key: 'prev', label: String(season - 1) }, { key: 'cur', label: String(season) },
        { key: 'diff', label: 'Change', render: (r) => <span className={r.good > 0 ? 'wpa-pos' : r.good < 0 ? 'wpa-neg' : ''}>{r.diff > 0 ? '+' : ''}{r.f(r.diff)}</span> },
      ]} />
    </div>
  );
}

function Similar({ group, rows, id, season }) {
  const [split, setSplit] = useState('all');
  if (!rows) return <Loading />;
  const keys = group === 'hitting'
    ? ['xwOBA', 'EV', 'Barrel%', 'LA', 'K%', 'BB%', 'Chase%', 'Whiff%', 'Pull%', 'GB%', 'sprint']
    : ['xwOBA', 'K%', 'BB%', 'Whiff%', 'Chase%', 'GB%', 'Barrel%', 'FBvelo', 'IVB', 'Ext'];
  const list = similar(rows, id, keys, split, split === 'all' ? 150 : 80, 10);
  return (
    <div className="panel">
      <div className="panel-h"><h3>Most similar {season} {group === 'hitting' ? 'hitters' : 'pitchers'}</h3>
        <Seg value={split} onChange={setSplit} options={[{ value: 'all', label: 'All' }, { value: 'vL', label: 'vs L' }, { value: 'vR', label: 'vs R' }]} /></div>
      <div className="small muted" style={{ marginBottom: 6 }}>Statcast profile distance on {keys.length} metrics{split !== 'all' ? ` in the ${split === 'vL' ? 'vs-left' : 'vs-right'} split` : ''}.</div>
      <DataTable rows={list.map((x) => ({ _key: x.row.id, id: x.row.id, name: x.row.name, team: x.row.team, score: x.score, xwOBA: x.row.splits[split]?.xwOBA }))} cols={[
        { key: 'name', label: 'Player', left: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
        { key: 'team', label: 'Team', left: true }, { key: 'xwOBA', label: 'xwOBA', f: fmt.r3 }, { key: 'score', label: 'Similarity' },
      ]} />
    </div>
  );
}
