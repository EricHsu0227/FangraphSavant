// Extra Game-page panels: Gameday field, pitch tracker, game info, bullpen usage, lineup projections.
import { useMemo, useState } from 'react';
import { getBoxscore, getTeamRange, shiftDate } from '../../lib/mlbapi.js';
import { matchupInputs, projectFromRows } from '../../lib/matchup.js';
import { loadPlayerFile } from '../../lib/data.js';
import { regressSplits } from '../../lib/platoon.js';
import { PITCH_NAME, PITCH_COLOR, fmt } from '../../lib/catalog.js';
import { halfLabel } from '../../lib/game.js';
import { useAsync, Loading, PlayerLink, Seg } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { SprayChart, LineChart, PitchDot } from '../../components/charts.jsx';

const RES = { single: 1, double: 2, triple: 3, home_run: 4 };

/** Batted balls of this game on a field, by team; plus the due-up card. */
export function Gameday({ gd, ld }) {
  const [side, setSide] = useState('both');
  const pts = useMemo(() => (ld.plays.allPlays || []).flatMap((p) => {
    const hd = p.playEvents?.slice().reverse().find((e) => e.hitData?.coordinates?.coordX != null)?.hitData;
    if (!hd) return [];
    const bat = p.about.isTopInning ? 'away' : 'home';
    if (side !== 'both' && side !== bat) return [];
    return [[hd.coordinates.coordX, hd.coordinates.coordY, hd.launchSpeed, hd.launchAngle, RES[p.result.eventType] || 0, p.matchup.pitchHand?.code === 'L' ? 0 : 1]];
  }), [ld, side]);
  const ls = ld.linescore || {};
  const off = ls.offense || {};
  const live = gd.status.abstractGameState === 'Live';
  return (
    <div className="grid g2">
      <div className="panel">
        <div className="panel-h"><h3>Batted balls</h3>
          <Seg value={side} onChange={setSide} options={[{ value: 'both', label: 'Both' }, { value: 'away', label: gd.teams.away.abbreviation }, { value: 'home', label: gd.teams.home.abbreviation }]} /></div>
        <SprayChart points={pts} size={460} />
      </div>
      <div className="grid">
        {live && (
          <div className="panel">
            <h3>Due up</h3>
            {[['At bat', off.batter], ['On deck', off.onDeck], ['In the hole', off.inHole]].map(([l, p]) => p && (
              <div key={l} className="row spread" style={{ padding: '4px 0' }}><span className="muted small">{l}</span><PlayerLink id={p.id} name={p.fullName} /></div>
            ))}
            {ls.defense?.pitcher && <div className="row spread" style={{ padding: '4px 0' }}><span className="muted small">Pitching</span><PlayerLink id={ls.defense.pitcher.id} name={ls.defense.pitcher.fullName} /></div>}
          </div>
        )}
        <ScoringSummary gd={gd} ld={ld} />
      </div>
    </div>
  );
}

function ScoringSummary({ gd, ld }) {
  const plays = (ld.plays.allPlays || []).filter((p) => p.about.isScoringPlay);
  return (
    <div className="panel">
      <h3>Scoring summary</h3>
      {!plays.length && <div className="muted small">No runs yet.</div>}
      {plays.map((p) => (
        <div key={p.atBatIndex} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <span className="mono muted">{halfLabel(p)}</span> · <b>{gd.teams[p.about.isTopInning ? 'away' : 'home'].abbreviation}</b> {p.result.description}
          <span className="mono"> ({p.result.awayScore}-{p.result.homeScore})</span>
        </div>
      ))}
    </div>
  );
}

/** Per-pitcher pitch mix, velocity by pitch number, and results this game. */
export function PitchTracker({ gd, ld }) {
  const byP = useMemo(() => {
    const m = new Map();
    let idx = {};
    for (const p of ld.plays.allPlays || []) {
      const pid = p.matchup.pitcher.id;
      if (!m.has(pid)) m.set(pid, { id: pid, name: p.matchup.pitcher.fullName, team: p.about.isTopInning ? 'home' : 'away', pitches: [] });
      for (const e of p.playEvents || []) {
        if (!e.isPitch) continue;
        idx[pid] = (idx[pid] || 0) + 1;
        m.get(pid).pitches.push({ n: idx[pid], pt: e.details?.type?.code, velo: e.pitchData?.startSpeed, spin: e.pitchData?.breaks?.spinRate,
          ivb: e.pitchData?.breaks?.breakVerticalInduced, hb: e.pitchData?.breaks?.breakHorizontal, call: e.details?.call?.code,
          whiff: ['S', 'W', 'T'].includes(e.details?.call?.code) && /Swinging/i.test(e.details?.description || ''),
          cs: e.details?.call?.code === 'C', strike: e.details?.isStrike || e.details?.isInPlay, inPlay: e.details?.isInPlay, ev: e.hitData?.launchSpeed,
          batSide: p.matchup.batSide?.code });
      }
    }
    return [...m.values()];
  }, [ld]);
  const [sel, setSel] = useState(null);
  const cur = byP.find((p) => p.id === sel) || byP[0];
  if (!cur) return <div className="empty">No pitches yet.</div>;
  const types = {};
  for (const p of cur.pitches) {
    const t = (types[p.pt || '?'] ||= { pt: p.pt || '?', n: 0, v: [], spin: [], ivb: [], hb: [], whiff: 0, sw: 0, csw: 0, strike: 0, vsL: 0, vsR: 0, evs: [] });
    t.n++; if (p.velo) t.v.push(p.velo); if (p.spin) t.spin.push(p.spin); if (p.ivb != null) t.ivb.push(p.ivb); if (p.hb != null) t.hb.push(p.hb);
    if (p.whiff) t.whiff++; if (p.whiff || p.inPlay || p.call === 'F') t.sw++; if (p.whiff || p.cs) t.csw++; if (p.strike) t.strike++;
    if (p.batSide === 'L') t.vsL++; else t.vsR++; if (p.ev) t.evs.push(p.ev);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const rows = Object.values(types).sort((a, b) => b.n - a.n).map((t) => ({
    _key: t.pt, pt: t.pt, n: t.n, use: t.n / cur.pitches.length, velo: avg(t.v), max: t.v.length ? Math.max(...t.v) : null, spin: avg(t.spin),
    ivb: avg(t.ivb), hb: avg(t.hb), whiff: t.whiff, whiffPct: t.sw ? t.whiff / t.sw : null, csw: t.csw / t.n, strike: t.strike / t.n,
    vsL: t.vsL, vsR: t.vsR, ev: avg(t.evs),
  }));
  const seriesBy = Object.keys(types).map((pt) => ({ name: PITCH_NAME[pt] || pt, color: PITCH_COLOR[pt] || '#888', points: cur.pitches.filter((p) => p.pt === pt && p.velo).map((p) => [p.n, p.velo]) }));
  return (
    <>
      <div className="toolbar">
        {['away', 'home'].map((side) => (
          <span key={side} className="row" style={{ gap: 6 }}>
            <span className="small muted">{gd.teams[side].abbreviation}</span>
            {byP.filter((p) => p.team === side).map((p) => (
              <button key={p.id} className={`chip ${cur.id === p.id ? 'on' : ''}`} onClick={() => setSel(p.id)}>{p.name.split(' ').slice(-1)[0]} · {p.pitches.length}</button>
            ))}
          </span>
        ))}
      </div>
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-h"><h3><PlayerLink id={cur.id} name={cur.name} /></h3><span className="small mono">{cur.pitches.length} pitches · {Math.round((cur.pitches.filter((p) => p.strike).length / cur.pitches.length) * 100)}% strikes</span></div>
        <DataTable rows={rows} cols={[
          { key: 'pt', label: 'Pitch', left: true, render: (r) => <><PitchDot pt={r.pt} />{PITCH_NAME[r.pt] || r.pt}</> },
          { key: 'n', label: '#' }, { key: 'use', label: 'Use%', f: fmt.pct }, { key: 'vsL', label: 'vs L' }, { key: 'vsR', label: 'vs R' },
          { key: 'velo', label: 'Velo', f: fmt.r1 }, { key: 'max', label: 'Max', f: fmt.r1 }, { key: 'spin', label: 'Spin', f: fmt.int },
          { key: 'ivb', label: 'IVB', f: fmt.r1 }, { key: 'hb', label: 'HB', f: fmt.r1 },
          { key: 'whiff', label: 'Whiffs' }, { key: 'whiffPct', label: 'Whiff%', f: fmt.pct }, { key: 'csw', label: 'CSW%', f: fmt.pct }, { key: 'ev', label: 'Avg EV', f: fmt.r1 },
        ]} />
        <h3>Velocity by pitch</h3>
        <LineChart height={180} series={seriesBy} xFmt={(v) => `#${v}`} yFmt={(v) => v.toFixed(0)} />
      </div>
    </>
  );
}

/** Weather, umpires, attendance, duration. */
export function GameInfo({ gd, ld }) {
  const info = ld.boxscore?.info || [];
  const officials = ld.boxscore?.officials || [];
  const w = gd.weather || {};
  return (
    <div className="panel">
      <h3>Game info</h3>
      <div className="small">
        {w.condition && <div><span className="muted">Weather:</span> {w.temp}°F, {w.condition}{w.wind ? ` · Wind ${w.wind}` : ''}</div>}
        {officials.length > 0 && <div><span className="muted">Umpires:</span> {officials.map((o) => `${o.officialType}: ${o.official?.fullName}`).join(' · ')}</div>}
        {info.filter((x) => x.value && !['Weather', 'Wind'].includes(x.label)).map((x, i) => <div key={i}><span className="muted">{x.label}:</span> {x.value.replace(/\.$/, '')}</div>)}
      </div>
    </div>
  );
}

/** Bullpen usage over the previous three days, from each team's box scores. */
export function Bullpen({ gd }) {
  const date = gd.datetime?.officialDate;
  const data = useAsync(async () => {
    const out = {};
    for (const side of ['away', 'home']) {
      const tid = gd.teams[side].id;
      const sch = await getTeamRange(tid, shiftDate(date, -3), shiftDate(date, -1));
      const games = (sch.dates || []).flatMap((d) => d.games.map((g) => ({ ...g, date: d.date }))).filter((g) => g.status.abstractGameState === 'Final');
      const use = {};
      for (const g of games) {
        const box = await getBoxscore(g.gamePk);
        const t = box.teams.away.team.id === tid ? box.teams.away : box.teams.home;
        (t.pitchers || []).forEach((pid, i) => {
          if (i === 0) return; // starter
          const p = t.players[`ID${pid}`];
          const u = (use[pid] ||= { id: pid, name: p?.person?.fullName, days: {} });
          u.days[g.date] = (u.days[g.date] || 0) + (p?.stats?.pitching?.numberOfPitches || 0);
        });
      }
      out[side] = { use: Object.values(use), dates: [shiftDate(date, -3), shiftDate(date, -2), shiftDate(date, -1)] };
    }
    return out;
  }, [gd.game?.pk, date]);
  if (data.loading) return <Loading what="bullpen usage" />;
  if (!data.data) return null;
  return (
    <div className="grid g2">
      {['away', 'home'].map((side) => {
        const d = data.data[side];
        return (
          <div className="panel" key={side}>
            <h3>{gd.teams[side].teamName} bullpen · last 3 days</h3>
            {!d.use.length ? <div className="muted small">No relievers used.</div> : (
              <DataTable rows={d.use.map((u) => ({ ...u, _key: u.id, tot: Object.values(u.days).reduce((a, b) => a + b, 0) }))} defaultSort={{ key: 'tot', dir: 'desc' }} cols={[
                { key: 'name', label: 'Reliever', left: true, render: (r) => <PlayerLink id={r.id} name={r.name} /> },
                ...d.dates.map((dt) => ({ key: dt, label: dt.slice(5), get: (r) => r.days[dt] || null, f: (v) => v ?? '' })),
                { key: 'tot', label: 'Total' },
              ]} />
            )}
            <div className="small muted" style={{ marginTop: 6 }}>Pitches thrown per day; relievers who pitched on back-to-back days are often unavailable.</div>
          </div>
        );
      })}
    </div>
  );
}

/** Projected wOBA of each hitter vs the opposing starter (matchup model). */
export function LineupProjection({ gd, ld, season }) {
  const pp = gd.probablePitchers || {};
  const data = useAsync(async () => {
    const inputs = await matchupInputs(season);
    const out = {};
    for (const side of ['away', 'home']) {
      const opp = side === 'away' ? 'home' : 'away';
      const sp = pp[opp]?.id;
      const bt = ld.boxscore?.teams?.[side];
      let hitters = (bt?.battingOrder || []).map((id) => ({ id, name: bt.players[`ID${id}`]?.person?.fullName }));
      if (!hitters.length) {
        // no lineup yet: use the team's top hitters by PA this season
        hitters = inputs.hit.filter((r) => r.teamId === gd.teams[side].id).sort((a, b) => (b.splits.all?.PA || 0) - (a.splits.all?.PA || 0)).slice(0, 9).map((r) => ({ id: r.id, name: r.name }));
      }
      const files = {};
      await Promise.all([sp, ...hitters.map((h) => h.id)].filter(Boolean).map(async (id) => { files[id] = await loadPlayerFile(id); }));
      out[side] = { sp, spName: pp[opp]?.fullName, rows: hitters.map((h) => {
        const r = sp ? projectFromRows(inputs, h.id, sp, season, files) : null;
        const row = inputs.hit.find((x) => x.id === h.id);
        const reg = row ? regressSplits(row.splits, 'batter', row.bats || 'R') : null;
        return { _key: h.id, id: h.id, name: h.name, bats: row?.bats, side: r?.side, proj: r?.proj?.woba, k: r?.proj?.K, hr: r?.proj?.HR, mix: r?.proj?.mixAdj?.wOBA,
          season: r?.bl?.wOBA, trueSplit: reg?.metrics?.xwOBA?.[r?.bSplit] ?? reg?.metrics?.wOBA?.[r?.bSplit] };
      }) };
    }
    return out;
  }, [gd.game?.pk, season]);
  if (data.loading) return <Loading what="matchup projections" />;
  return (
    <div className="grid g2">
      {['away', 'home'].map((side) => {
        const d = data.data?.[side];
        if (!d) return null;
        const avg = d.rows.filter((r) => r.proj != null);
        const mean = avg.length ? avg.reduce((a, r) => a + r.proj, 0) / avg.length : null;
        return (
          <div className="panel" key={side}>
            <div className="panel-h"><h3>{gd.teams[side].teamName} vs {d.spName || 'TBD'}</h3>{mean != null && <span className="mono small">lineup proj wOBA {fmt.r3(mean)}</span>}</div>
            <DataTable rows={d.rows} cols={[
              { key: 'name', label: 'Hitter', left: true, render: (r) => <PlayerLink id={r.id} name={r.name} hand={r.side || r.bats} /> },
              { key: 'season', label: 'Szn vs hand', f: fmt.r3, title: `This season's wOBA vs the starter's hand` },
              { key: 'trueSplit', label: 'True split', f: fmt.r3, title: 'Regressed platoon split' },
              { key: 'proj', label: 'Proj wOBA', f: fmt.r3, hb: true }, { key: 'k', label: 'K%', f: fmt.pct }, { key: 'hr', label: 'HR%', f: fmt.pct },
              { key: 'mix', label: 'Mix edge', f: (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${(v * 1000).toFixed(0)}`), title: 'Pitch-mix adjustment, wOBA points' },
            ]} heat />
          </div>
        );
      })}
      <p className="small muted" style={{ gridColumn: '1 / -1' }}>Batter vs starter, from the matchup model (component log5 + pitch-mix edge). Open the Matchup tool for any single pairing.</p>
    </div>
  );
}

