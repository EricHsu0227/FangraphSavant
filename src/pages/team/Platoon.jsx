import { useMemo, useState } from 'react';
import { teamPlayers } from '../../lib/teamPlayers.js';
import { loadSeason, loadTeamsMeta } from '../../lib/data.js';
import { regressSplits, optimizeLineup, lineupRuns, platoonAdvantageShare } from '../../lib/platoon.js';
import { fmt } from '../../lib/catalog.js';
import { useAsync, Loading, PlayerLink, Seg } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';

const POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/** Pick the best 9 (8 fielders + DH) by projected value, respecting positions played. */
function bestNine(players, key) {
  const elig = (p, pos) => pos === 'DH' || (p.gpos?.[pos] || 0) >= 5 || p.pos === pos || (['LF', 'RF'].includes(pos) && (p.gpos?.LF || p.gpos?.RF || p.gpos?.CF));
  const pool = players.filter((p) => p[key] != null);
  // scarcest positions first
  const order = [...POS].sort((a, b) => pool.filter((p) => elig(p, a)).length - pool.filter((p) => elig(p, b)).length);
  const pick = {}, used = new Set();
  for (const pos of order) {
    const best = pool.filter((p) => !used.has(p.id) && elig(p, pos)).sort((a, b) => b[key] - a[key])[0];
    if (best) { pick[pos] = best; used.add(best.id); }
  }
  // one pass of swaps: replace any starter with a better unused player who is eligible
  for (const pos of POS) {
    const better = pool.filter((p) => !used.has(p.id) && elig(p, pos) && p[key] > (pick[pos]?.[key] ?? -1)).sort((a, b) => b[key] - a[key])[0];
    if (better) { if (pick[pos]) used.delete(pick[pos].id); pick[pos] = better; used.add(better.id); }
  }
  return Object.entries(pick).map(([pos, p]) => ({ ...p, slotPos: pos }));
}

export default function Platoon({ teamId, season }) {
  const [metric, setMetric] = useState('xwOBA');
  const [minPA, setMinPA] = useState(50);
  const hit = useAsync(() => teamPlayers(teamId, season, 'hitting'), [teamId, season]);
  const lg = useAsync(() => loadSeason(season, 'hitting').catch(() => null), [season]);
  const depth = useAsync(() => loadTeamsMeta(season), [season]);

  const players = useMemo(() => {
    const gp = new Map((lg.data || []).map((r) => [r.id, r]));
    return (hit.data || []).filter((r) => (r.splits.all?.PA || 0) >= minPA).map((r) => {
      const src = gp.get(r.id);
      const bats = r.bats || src?.bats || 'R';
      const reg = regressSplits(r.splits, 'batter', bats);
      const m = reg?.metrics?.[metric] || reg?.metrics?.wOBA;
      return {
        _key: r.id, id: r.id, name: r.name, bats, pos: src?.pos || r.pos, gpos: src?.gpos,
        paL: r.splits.vL?.PA || 0, paR: r.splits.vR?.PA || 0,
        obsL: r.splits.vL?.[metric] ?? r.splits.vL?.wOBA, obsR: r.splits.vR?.[metric] ?? r.splits.vR?.wOBA,
        regL: m?.vL, regR: m?.vR, gap: m ? m.reg : null, obp: r.splits.all?.OBP,
        obpL: r.splits.vL?.OBP, obpR: r.splits.vR?.OBP,
      };
    });
  }, [hit.data, lg.data, metric, minPA]);

  if (hit.loading) return <Loading what="platoon data" />;
  const adv = platoonAdvantageShare((hit.data || []).map((r) => ({ ...r, bats: r.bats || 'R' })));
  const vsR = optimizeLineup(bestNine(players, 'regR').map((p) => ({ ...p, v: p.regR, obp: p.obpR })), 'v');
  const vsL = optimizeLineup(bestNine(players, 'regL').map((p) => ({ ...p, v: p.regL, obp: p.obpL })), 'v');
  const actual = depth.data?.[teamId];
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const actualRuns = (list, k) => {
    const ps = (list || []).map((x) => byId[x.id]).filter(Boolean).map((p) => ({ v: p[k] }));
    return ps.length >= 7 ? lineupRuns(ps, 'v', season) : null;
  };
  const LineupCard = ({ title, list, k, real }) => (
    <div className="panel">
      <div className="panel-h"><h3>{title}</h3>
        <span className="small mono">{fmt.r2(lineupRuns(list, 'v', season))} R/G{real != null ? ` · actual most-used ${fmt.r2(real)}` : ''}</span></div>
      <table className="t"><tbody>
        {list.map((p, i) => (
          <tr key={p.id}><td className="l muted">{i + 1}</td><td className="l"><PlayerLink id={p.id} name={p.name} hand={p.bats} /></td>
            <td className="l muted">{p.slotPos}</td><td className="num">{fmt.r3(p[k])}</td></tr>
        ))}
      </tbody></table>
    </div>
  );
  return (
    <>
      <div className="toolbar">
        <Seg value={metric} onChange={setMetric} options={[{ value: 'xwOBA', label: 'xwOBA' }, { value: 'wOBA', label: 'wOBA' }]} />
        <label className="row small" style={{ gap: 4 }}>Min PA <input type="number" style={{ width: 70 }} value={minPA} onChange={(e) => setMinPA(Number(e.target.value))} /></label>
        {adv != null && <span className="pill">Platoon advantage in {Math.round(adv * 100)}% of PA</span>}
      </div>
      <div className="grid g2" style={{ marginTop: 12 }}>
        <LineupCard title="Optimal lineup vs RHP" list={vsR} k="regR" real={actualRuns(actual?.vsR, 'regR')} />
        <LineupCard title="Optimal lineup vs LHP" list={vsL} k="regL" real={actualRuns(actual?.vsL, 'regL')} />
      </div>
      <p className="small muted">Built from each hitter’s regressed {metric} against that hand, limited to positions he has started at least 5 games. Batting order follows The Book: best three hitters in 1, 2 and 4 (highest OBP leads off), next two in 3 and 5. R/G is a linear runs estimate from lineup {metric}.</p>
      <h3>Hitters by hand</h3>
      <DataTable rows={players} defaultSort={{ key: 'paR', dir: 'desc' }} heat cols={[
        { key: 'name', label: 'Hitter', left: true, sticky: true, render: (r) => <PlayerLink id={r.id} name={r.name} hand={r.bats} /> },
        { key: 'pos', label: 'Pos', left: true },
        { key: 'paL', label: 'PA vL' }, { key: 'obsL', label: `${metric} vL`, f: fmt.r3, hb: true }, { key: 'regL', label: 'True vL', f: fmt.r3, hb: true },
        { key: 'paR', label: 'PA vR' }, { key: 'obsR', label: `${metric} vR`, f: fmt.r3, hb: true }, { key: 'regR', label: 'True vR', f: fmt.r3, hb: true },
        { key: 'gap', label: 'Platoon gap', f: (v) => (v == null ? '' : `${(v * 1000).toFixed(0)}`), title: 'Regressed split, wOBA points (vs opposite hand minus same hand)' },
      ]} />
    </>
  );
}
