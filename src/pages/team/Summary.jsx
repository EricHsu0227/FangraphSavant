import { useMemo } from 'react';
import { getCoaches, getSeasonSchedule } from '../../lib/mlbapi.js';
import { loadTeamSeason, bootData } from '../../lib/data.js';
import { statDef, fmt } from '../../lib/catalog.js';
import { useAsync, Loading, PlayerLink } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { LineChart } from '../../components/charts.jsx';
import { ResultsBars, TopPlayers, getAttendance } from './Extras.jsx';

const n = (v) => +v || 0;

/** BaseRuns (David Smyth) from a team line. */
export function baseRuns(l) {
  const TB = n(l['1B']) + 2 * n(l['2B']) + 3 * n(l['3B']) + 4 * n(l.HR);
  const A = n(l.H) + n(l.BB) + n(l.HBP) - n(l.HR) - 0.5 * n(l.IBB);
  const B = (1.4 * TB - 0.6 * n(l.H) - 3 * n(l.HR) + 0.1 * (n(l.BB) + n(l.HBP) - n(l.IBB)) + 0.9 * (n(l.SB) - n(l.CS) - n(l.GIDP))) * 1.1;
  const C = n(l.AB) - n(l.H) + n(l.SF) + n(l.SH) + n(l.CS) + n(l.GIDP);
  return B + C > 0 ? (A * B) / (B + C) + n(l.HR) : null;
}
const pythagenpat = (rs, ra, g) => {
  const x = ((rs + ra) / Math.max(g, 1)) ** 0.287;
  return rs ** x / (rs ** x + ra ** x);
};

export default function Summary({ teamId, season, rec }) {
  const bat = useAsync(() => loadTeamSeason(season, 'hitting'), [season]);
  const pit = useAsync(() => loadTeamSeason(season, 'pitching'), [season]);
  const coaches = useAsync(() => getCoaches(teamId, season).catch(() => null), [teamId, season]);
  const sched = useAsync(() => getSeasonSchedule(season), [season]);
  const boot = useAsync(() => bootData(), []);
  const att = useAsync(() => getAttendance(teamId, season).catch(() => null), [teamId, season]);
  const attRec = att.data?.records?.[0];
  const pf = boot.data?.parks?.[season]?.[teamId];

  const run = useMemo(() => {
    const pts = [], wl = [];
    let diff = 0, w = 0, l = 0, i = 0;
    for (const d of sched.data?.dates || []) for (const g of d.games) {
      if (g.gameType !== 'R' || g.status?.abstractGameState !== 'Final') continue;
      const home = g.teams.home.team.id === teamId, away = g.teams.away.team.id === teamId;
      if (!home && !away) continue;
      const me = home ? g.teams.home : g.teams.away, op = home ? g.teams.away : g.teams.home;
      if (me.score == null) continue;
      i++; diff += me.score - op.score; if (me.isWinner) w++; else l++;
      pts.push([i, diff]); wl.push([i, w - l]);
    }
    return { pts, wl };
  }, [sched.data, teamId]);

  const ranks = (rows, key, hb) => {
    const me = rows?.find((r) => r.id === teamId)?.splits?.all;
    if (!me || me[key] == null) return null;
    const vals = rows.map((r) => r.splits?.all?.[key]).filter((v) => v != null).sort((a, b) => (hb ? b - a : a - b));
    return { v: me[key], rank: vals.indexOf(me[key]) + 1 };
  };
  const tile = (rows, group, key) => {
    const d = statDef(group, key);
    const r = ranks(rows, key, d.hb !== false);
    return (
      <div className="tile" key={`${group}-${key}`}>
        <div className="k">{d.label}</div><div className="v">{r ? d.f(r.v) : '—'}</div>
        {r && <div className={`d ${r.rank <= 5 ? 'wpa-pos' : r.rank >= 26 ? 'wpa-neg' : 'muted'}`}>{ordinal(r.rank)} of 30</div>}
      </div>
    );
  };
  const hb = bat.data?.find((r) => r.id === teamId)?.splits?.all;
  const pb = pit.data?.find((r) => r.id === teamId)?.splits?.all;
  const G = rec ? rec.wins + rec.losses : 0;
  const bsrS = hb ? baseRuns(hb) : null, bsrA = pb ? baseRuns(pb) : null;
  const recs = rec?.records || {};
  const split = (arr, type) => arr?.find((x) => x.type === type);
  const recRows = [
    ['Home', split(recs.splitRecords, 'home')], ['Away', split(recs.splitRecords, 'away')],
    ['vs LHP starters', split(recs.splitRecords, 'left')], ['vs RHP starters', split(recs.splitRecords, 'right')],
    ['One-run games', split(recs.splitRecords, 'oneRun')], ['Extra innings', split(recs.splitRecords, 'extraInning')],
    ['vs .500+ teams', split(recs.splitRecords, 'winners')], ['Day', split(recs.splitRecords, 'day')], ['Night', split(recs.splitRecords, 'night')],
    ['Last 10', split(recs.splitRecords, 'lastTen')],
    ...(recs.divisionRecords || []).map((d) => [`vs ${d.division?.name?.replace(/American League|National League/, (m) => (m.startsWith('A') ? 'AL' : 'NL'))}`, d]),
    ...(recs.leagueRecords || []).map((d) => [`vs ${d.league?.name?.startsWith('A') ? 'AL' : 'NL'}`, d]),
  ].filter(([, r]) => r).map(([label, r]) => ({ _key: label, label, w: r.wins, l: r.losses, pct: r.wins + r.losses ? r.wins / (r.wins + r.losses) : null }));

  return (
    <div className="grid g2">
      <div className="panel span-all">
        <h3>Game results</h3>
        <ResultsBars teamId={teamId} season={season} />
      </div>
      <div className="panel span-all">
        <TopPlayers teamId={teamId} season={season} />
      </div>
      <div className="panel">
        <h3>Season summary</h3>
        {rec ? (
          <div className="stat-tiles">
            <div className="tile"><div className="k">Record</div><div className="v">{rec.wins}-{rec.losses}</div><div className="d muted">{rec.winningPercentage}</div></div>
            <div className="tile"><div className="k">Run diff</div><div className="v">{rec.runDifferential > 0 ? '+' : ''}{rec.runDifferential}</div><div className="d muted">{rec.runsScored} RS · {rec.runsAllowed} RA</div></div>
            <div className="tile"><div className="k">Pythag W-L</div><div className="v">{Math.round(pythagenpat(rec.runsScored, rec.runsAllowed, G) * G)}-{G - Math.round(pythagenpat(rec.runsScored, rec.runsAllowed, G) * G)}</div><div className="d muted">Pythagenpat</div></div>
            {bsrS != null && bsrA != null && (
              <div className="tile"><div className="k">BaseRuns W-L</div><div className="v">{Math.round(pythagenpat(bsrS, bsrA, G) * G)}-{G - Math.round(pythagenpat(bsrS, bsrA, G) * G)}</div>
                <div className="d muted">{Math.round(bsrS)} BsR · {Math.round(bsrA)} BsRA</div></div>
            )}
            <div className="tile"><div className="k">Division</div><div className="v">{ordinal(Number(rec.divisionRank))}</div><div className="d muted">GB {rec.gamesBack}</div></div>
            <div className="tile"><div className="k">League</div><div className="v">{ordinal(Number(rec.leagueRank))}</div><div className="d muted">WCGB {rec.wildCardGamesBack}</div></div>
          </div>
        ) : <Loading />}
        <h3>Run differential</h3>
        {run.pts.length > 3 ? (
          <LineChart height={170} series={[{ name: 'Run differential', color: 'var(--accent-2)', points: run.pts }, { name: 'Games over .500', color: 'var(--accent)', points: run.wl }]}
            refs={[{ y: 0, label: '' }]} xFmt={(v) => `G${v}`} yFmt={(v) => Math.round(v)} />
        ) : <div className="muted small">No games yet.</div>}
      </div>
      <div className="panel">
        <h3>Offense</h3>
        {bat.loading ? <Loading /> : <div className="stat-tiles">{['wRCplus', 'wOBA', 'xwOBA', 'K%', 'BB%', 'ISO', 'Barrel%', 'HardHit%', 'Chase%', 'WPA'].map((k) => tile(bat.data, 'hitting', k))}</div>}
        <h3>Pitching</h3>
        {pit.loading ? <Loading /> : <div className="stat-tiles">{['ERA', 'FIP', 'xwOBA', 'K%', 'BB%', 'K-BB%', 'Whiff%', 'Barrel%', 'GB%', 'WAR_wOBA'].map((k) => tile(pit.data, 'pitching', k))}</div>}
        <div className="small muted" style={{ marginTop: 6 }}>Ranks among the 30 teams this season.</div>
      </div>
      <div className="panel">
        <h3>Records</h3>
        <DataTable rows={recRows} cols={[{ key: 'label', label: 'Split', left: true }, { key: 'w', label: 'W' }, { key: 'l', label: 'L' }, { key: 'pct', label: 'Pct', f: fmt.r3 }]} />
      </div>
      <div className="panel">
        <h3>Ballpark & staff</h3>
        {pf ? (
          <div className="stat-tiles" style={{ marginBottom: 10 }}>
            <div className="tile"><div className="k">Park factor</div><div className="v">{Math.round(pf.all * 100)}</div><div className="d muted">runs, 5-yr</div></div>
            {pf.L && <div className="tile"><div className="k">vs LHB</div><div className="v">{Math.round(pf.L * 100)}</div><div className="d muted">wOBA-based</div></div>}
            {pf.R && <div className="tile"><div className="k">vs RHB</div><div className="v">{Math.round(pf.R * 100)}</div><div className="d muted">wOBA-based</div></div>}
          </div>
        ) : <div className="muted small">Park factors appear once the data is built.</div>}
        {attRec?.attendanceTotal && (
          <div className="small" style={{ marginBottom: 8 }}>
            Attendance <b>{Number(attRec.attendanceTotal).toLocaleString()}</b>
            {attRec.attendanceAverageHome ? <> · {Number(attRec.attendanceAverageHome).toLocaleString()} per home game</> : null}
          </div>
        )}
        {(coaches.data?.roster || []).slice(0, 14).map((c, i) => (
          <div key={i} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="muted">{c.job}</span> · <PlayerLink id={c.person?.id} name={c.person?.fullName} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const ordinal = (k) => (!k ? '—' : `${k}${['th', 'st', 'nd', 'rd'][((k % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][k % 100] || 'th'}`);
