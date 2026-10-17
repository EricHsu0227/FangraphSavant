import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fullMatchup } from '../lib/matchup.js';
import { searchPeople, headshot } from '../lib/mlbapi.js';
import { PITCH_NAME, fmt } from '../lib/catalog.js';
import { SEASONS, guts } from '../lib/guts.js';
import { useAsync, Loading, PlayerLink, Hand } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import { PitchDot, Bars } from '../components/charts.jsx';

/** Batter vs pitcher: component log5 projection with platoon splits and pitch-mix edge. */
export default function Matchup() {
  const [qs, setQs] = useSearchParams();
  const b = Number(qs.get('b')) || null, p = Number(qs.get('p')) || null;
  const season = Number(qs.get('s')) || SEASONS[SEASONS.length - 1];
  const set = (k, v) => setQs((q) => { if (v == null) q.delete(k); else q.set(k, v); return q; }, { replace: true });
  const m = useAsync(() => (b && p ? fullMatchup(b, p, season) : null), [b, p, season]);

  return (
    <>
      <h1>Matchup</h1>
      <div className="grid g3">
        <Picker label="Batter" id={b} name={qs.get('bn')} onPick={(x) => setQs((q) => { q.set('b', x.id); q.set('bn', x.name); return q; })} />
        <Picker label="Pitcher" id={p} name={qs.get('pn')} onPick={(x) => setQs((q) => { q.set('p', x.id); q.set('pn', x.name); return q; })} />
        <div className="panel">
          <div className="kicker">Data season</div>
          <select value={season} onChange={(e) => set('s', e.target.value)} aria-label="Season">{[...SEASONS].reverse().map((s) => <option key={s}>{s}</option>)}</select>
          <div className="small muted" style={{ marginTop: 8 }}>Uses each player’s {season} line against the other’s hand.</div>
        </div>
      </div>
      {!b || !p ? <div className="empty" style={{ marginTop: 14 }}>Pick a batter and a pitcher to project the matchup.</div> : null}
      {m.loading && b && p && <Loading what="matchup" />}
      {m.data === null && b && p && !m.loading && <div className="empty">One of these players has no {season} line.</div>}
      {m.data && !m.data.proj && <div className="empty" style={{ marginTop: 14 }}>No {season} split data for one of these players. Try another season.</div>}
      {m.data?.proj && <Result m={m.data} season={season} />}
    </>
  );
}

function Picker({ label, id, name, onPick }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 3) return setRes([]);
      const r = await searchPeople(q.trim()).catch(() => null);
      setRes((r?.people || []).slice(0, 8));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="panel">
      <div className="kicker">{label}</div>
      <div className="row" style={{ gap: 8, margin: '6px 0' }}>
        {id && <img src={headshot(id, 60)} width="36" height="36" style={{ borderRadius: 6 }} alt="" />}
        {id ? <PlayerLink id={id} name={name || `#${id}`} /> : <span className="muted">None selected</span>}
      </div>
      <div className="search-box" style={{ position: 'relative' }}>
        <input type="text" placeholder={`Find a ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} aria-label={`Find ${label}`} />
        {res.length > 0 && (
          <div className="search-pop" style={{ left: 0, right: 'auto', width: '100%' }}>
            {res.map((x) => <a key={x.id} onClick={() => { onPick({ id: x.id, name: x.fullName }); setQ(''); setRes([]); }}>{x.fullName} <span className="muted small">{x.primaryPosition?.abbreviation} · {x.currentTeam?.name || ''}</span></a>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Result({ m, season }) {
  const { proj, b, p, side, throws, bl, pl, lg, bd, pd, bSplit, pSplit } = m;
  const g = guts(season);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const verdict = proj.woba - g.woba;
  // pitch-by-pitch edge: pitcher's mix vs this side x batter's results vs those pitches from this hand
  const ars = pd?.arsenal?.[pSplit] || [];
  const vsp = Object.fromEntries((bd?.vsPitch?.[bSplit] || []).map((r) => [r.pt, r]));
  const edge = ars.map((a) => ({ _key: a.pt, pt: a.pt, use: a.use, velo: a.velo, pWhiff: a.whiff, pX: a.xwoba, pRV: a.rv100,
    bSeen: vsp[a.pt]?.n, bWhiff: vsp[a.pt]?.whiff, bX: vsp[a.pt]?.xwoba, bRV: vsp[a.pt]?.rv100 }));
  return (
    <>
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="row spread">
          <div>
            <div className="kicker">Projected per PA · {season} data</div>
            <div className="row" style={{ gap: 18, alignItems: 'baseline' }}>
              <span className="mono" style={{ fontSize: 34, fontWeight: 700 }}>{fmt.r3(proj.woba)}</span>
              <span className="mono">wOBA · wRC+ {proj.wrcPlus}</span>
              <span className={`pill ${verdict > 0.015 ? 'good' : verdict < -0.015 ? 'bad' : ''}`}>
                {verdict > 0.015 ? 'Batter edge' : verdict < -0.015 ? 'Pitcher edge' : 'Even'}
              </span>
            </div>
          </div>
          <div className="small muted" style={{ maxWidth: 380 }}>
            <PlayerLink id={b.id} name={b.name} /> bats <Hand h={side} /> vs <PlayerLink id={p.id} name={p.name} /> <Hand h={throws} />.
            {side === throws ? ' Same-handed matchup.' : ' Batter has the platoon advantage.'}
          </div>
        </div>
        <div className="grid g3" style={{ marginTop: 12 }}>
          <Bars items={[{ label: 'Strikeout', v: proj.K, color: 'var(--bad)' }, { label: 'Walk + HBP', v: proj.BB, color: 'var(--ok)' }, { label: 'Home run', v: proj.HR, color: 'var(--hr)' }]}
            max={0.4} fmtV={pct} />
          <div className="small">
            <div>League baseline: K {pct(lg.K)} · BB {pct(lg.BB)} · HR {pct(lg.HR)}</div>
            <div>xwOBA on contact: <b className="mono">{fmt.r3(proj.CON)}</b> (lg {fmt.r3(lg.CON)})</div>
            {proj.mixAdj && <div>Pitch-mix edge: <b className={proj.mixAdj.wOBA >= 0 ? 'wpa-pos' : 'wpa-neg'}>{proj.mixAdj.wOBA >= 0 ? '+' : ''}{(proj.mixAdj.wOBA * 1000).toFixed(0)} wOBA pts</b></div>}
          </div>
          <div className="small muted">Each rate is regressed to the league by its stabilization point (K 60 PA, BB 120, HR 170, contact 250), combined with odds-ratio log5, then adjusted by how the hitter does against this pitcher’s pitch-group mix.</div>
        </div>
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="panel">
          <h3>Inputs</h3>
          <DataTable rows={[
            { _key: 'b', who: `${b.name} vs ${throws}HP`, PA: bl.PA, K: bl['K%'], BB: bl['BB%'], w: bl.wOBA, x: bl.xwOBA },
            { _key: 'p', who: `${p.name} vs ${side}HB`, PA: pl.TBF || pl.PA, K: pl['K%'], BB: pl['BB%'], w: pl.wOBA, x: pl.xwOBA },
          ]} cols={[{ key: 'who', label: 'Split', left: true }, { key: 'PA', label: 'PA' }, { key: 'K', label: 'K%', f: fmt.pct }, { key: 'BB', label: 'BB%', f: fmt.pct },
            { key: 'w', label: 'wOBA', f: fmt.r3 }, { key: 'x', label: 'xwOBA', f: fmt.r3 }]} />
        </div>
        <div className="panel">
          <h3>Career head-to-head</h3>
          {m.career ? (
            <>
              <DataTable rows={[{ _key: 'c', ...m.career }]} cols={['PA', 'AB', 'H', 'HR', 'BB', 'SO'].map((k) => ({ key: k, label: k }))
                .concat([{ key: 'AVG', label: 'AVG', f: fmt.r3 }, { key: 'OPS', label: 'OPS', f: fmt.r3 }, { key: 'wOBA', label: 'wOBA', f: fmt.r3 }])} />
              <div className="small muted" style={{ marginTop: 6 }}>Head-to-head samples are tiny; the projection above does not use them.</div>
            </>
          ) : <div className="muted small">They haven’t faced each other.</div>}
        </div>
      </div>
      {edge.length > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <h3>Pitch-by-pitch</h3>
          <DataTable rows={edge} cols={[
            { key: 'pt', label: 'Pitch', left: true, render: (r) => <><PitchDot pt={r.pt} />{PITCH_NAME[r.pt] || r.pt}</> },
            { key: 'use', label: `Use vs ${side}HB`, f: fmt.pct }, { key: 'velo', label: 'Velo', f: fmt.r1 },
            { key: 'pWhiff', label: 'P whiff%', f: fmt.pct }, { key: 'pX', label: 'P xwOBA', f: fmt.r3 }, { key: 'pRV', label: 'P RV/100', f: fmt.r2 },
            { key: 'bSeen', label: `B seen vs ${throws}HP` }, { key: 'bWhiff', label: 'B whiff%', f: fmt.pct }, { key: 'bX', label: 'B xwOBA', f: fmt.r3 }, { key: 'bRV', label: 'B RV/100', f: fmt.r2 },
          ]} />
          <div className="small muted" style={{ marginTop: 6 }}>P = pitcher against {side}-handed hitters. B = batter against {throws}-handed pitchers, by pitch type.</div>
        </div>
      )}
    </>
  );
}
