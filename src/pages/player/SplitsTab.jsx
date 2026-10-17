import { useMemo, useState } from 'react';
import { getSituationCodes, getPersonSit, splitsOf } from '../../lib/mlbapi.js';
import { fromMLB, deriveHitting, derivePitching } from '../../lib/stats.js';
import { statDef } from '../../lib/catalog.js';
import { SEASONS } from '../../lib/guts.js';
import { useAsync, usePref, Loading, Seg } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';

// Default groups when the situation-code menu isn't available
const FALLBACK = {
  Platoon: ['vl', 'vr'], Location: ['h', 'a'], 'Day/Night': ['d', 'n'],
  Runners: ['r0', 'r1', 'r2', 'r3', 'r12', 'r13', 'r23', 'r123', 'risp', 'ron'], Outs: ['o0', 'o1', 'o2'],
};

/** FanGraphs "Splits Tool": any MLB situation code, any season, side by side. */
const SIT_GROUPS = [
  ['Location', [['home', 'Home'], ['away', 'Away']]],
  ['Runners', [['empty', 'Bases empty'], ['on', 'Men on'], ['risp', 'RISP'], ['loaded', 'Bases loaded']]],
  ['Outs', [['o0', '0 out'], ['o1', '1 out'], ['o2', '2 out']]],
  ['Inning', [['i13', 'Inn 1-3'], ['i46', 'Inn 4-6'], ['i79', 'Inn 7-9'], ['ix', 'Extras']]],
  ['Score', [['ahead', 'Team ahead'], ['tied', 'Tied'], ['behind', 'Team behind'], ['lateclose', 'Late & close']]],
  ['Final pitch', [['pFB', 'Fastball'], ['pBR', 'Breaking'], ['pOS', 'Offspeed']]],
  ['Batted ball', [['gb', 'Ground ball'], ['ld', 'Line drive'], ['fb', 'Fly ball'], ['pu', 'Popup']]],
  ['Direction', [['pull', 'Pull'], ['cent', 'Center'], ['oppo', 'Opposite']]],
];

/** Statcast situational splits (xwOBA, EV, barrels, WPA) — each also split by the opponent's hand. */
function StatcastSits({ group, detail, season }) {
  const [mode, setMode] = usePref('sits:mode', 'all');
  const sits = (detail?.[season] || detail?.[String(season)] || {}).sits;
  if (!sits) return <div className="muted small">Statcast situational splits appear once {season}’s detail is built.</div>;
  const hitting = group === 'hitting';
  const hl = hitting ? ['vs LHP', 'vs RHP'] : ['vs LHB', 'vs RHB'];
  const rows = [];
  for (const [g, list] of SIT_GROUPS) {
    for (const [code, label] of list) {
      const r = sits[code];
      if (!r) continue;
      if (mode === 'both') {
        rows.push({ _key: code, grp: g, split: label, Lpa: r.vL?.pa, Lw: r.vL?.woba, Lx: r.vL?.xwoba, Rpa: r.vR?.pa, Rw: r.vR?.woba, Rx: r.vR?.xwoba,
          gap: r.vL?.xwoba != null && r.vR?.xwoba != null ? r.vR.xwoba - r.vL.xwoba : null });
      } else {
        const l = r[mode] || {};
        rows.push({ _key: code, grp: g, split: label, ...l });
      }
    }
  }
  const pct = fmtPct, r3 = fmt3;
  const cols = mode === 'both' ? [
    { key: 'grp', label: 'Group', left: true }, { key: 'split', label: 'Split', left: true, sticky: true },
    { key: 'Lpa', label: `${hl[0]} PA` }, { key: 'Lw', label: 'wOBA', f: r3, hb: hitting }, { key: 'Lx', label: 'xwOBA', f: r3, hb: hitting },
    { key: 'Rpa', label: `${hl[1]} PA` }, { key: 'Rw', label: 'wOBA', f: r3, hb: hitting }, { key: 'Rx', label: 'xwOBA', f: r3, hb: hitting },
    { key: 'gap', label: 'xwOBA gap (R−L)', f: (v) => (v == null ? '' : (v >= 0 ? '+' : '') + r3(v)) },
  ] : [
    { key: 'grp', label: 'Group', left: true }, { key: 'split', label: 'Split', left: true, sticky: true },
    { key: 'pa', label: 'PA' }, { key: 'avg', label: 'AVG', f: r3, hb: hitting }, { key: 'obp', label: 'OBP', f: r3, hb: hitting },
    { key: 'slg', label: 'SLG', f: r3, hb: hitting }, { key: 'hr', label: 'HR', hb: hitting },
    { key: 'k', label: 'K%', f: pct, hb: !hitting }, { key: 'bb', label: 'BB%', f: pct, hb: hitting },
    { key: 'woba', label: 'wOBA', f: r3, hb: hitting }, { key: 'xwoba', label: 'xwOBA', f: r3, hb: hitting },
    { key: 'ev', label: 'EV', f: (v) => (v == null ? '' : v.toFixed(1)), hb: hitting }, { key: 'brl', label: 'Brl%', f: pct, hb: hitting },
    { key: 'hh', label: 'HardHit%', f: pct, hb: hitting }, { key: 'wpa', label: 'WPA', f: (v) => (v == null ? '' : (v >= 0 ? '+' : '') + v.toFixed(2)), hb: true },
  ];
  return (
    <>
      <div className="toolbar">
        <Seg value={mode} onChange={setMode} options={[{ value: 'all', label: 'All' }, { value: 'vL', label: hl[0] }, { value: 'vR', label: hl[1] }, { value: 'both', label: 'L vs R side by side' }]} />
      </div>
      <div style={{ height: 8 }} />
      <DataTable rows={rows} heat cols={cols} />
    </>
  );
}

const fmt3 = (v) => (v == null ? '' : v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.'));
const fmtPct = (v) => (v == null ? '' : `${(v * 100).toFixed(1)}%`);

export default function SplitsTab({ id, group, rows, detail }) {
  const seasons = rows.map((r) => r.season).filter((s) => s >= SEASONS[0]);
  const [season, setSeason] = useState(seasons[seasons.length - 1] || SEASONS[SEASONS.length - 1]);
  const [cat, setCat] = usePref('splits:cat', 'Platoon');
  const codes = useAsync(() => getSituationCodes().catch(() => null), []);
  const menu = useMemo(() => {
    const m = {};
    for (const c of (Array.isArray(codes.data) ? codes.data : [])) {
      if (group === 'hitting' ? c.batting === false : c.pitching === false) continue;
      const k = c.navigationMenu || 'Other';
      (m[k] ||= []).push({ code: c.code, label: c.description });
    }
    if (!Object.keys(m).length) for (const [k, list] of Object.entries(FALLBACK)) m[k] = list.map((code) => ({ code, label: code }));
    return m;
  }, [codes.data, group]);
  const cats = Object.keys(menu);
  const active = menu[cat] ? cat : cats[0];
  const list = menu[active] || [];
  const sp = useAsync(() => (list.length ? getPersonSit(id, season, group, list.map((c) => c.code)) : null), [id, season, group, active, list.length]);
  const keys = group === 'hitting' ? ['PA', 'AVG', 'OBP', 'SLG', 'OPS', 'ISO', 'K%', 'BB%', 'BABIP', 'wOBA', 'wRCplus'] : ['TBF', 'IP', 'ERA', 'K%', 'BB%', 'K-BB%', 'HR9', 'FIP', 'wOBA', 'wRCplusAllowed'];
  const data = splitsOf(sp.data).map((x) => {
    const l = fromMLB(x.stat, group);
    const d = group === 'hitting' ? deriveHitting(l, season) : derivePitching(l, season);
    return { ...d, _key: x.split?.code, split: x.split?.description || list.find((c) => c.code === x.split?.code)?.label };
  });
  return (
    <>
      <div className="toolbar">
        <select value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{[...seasons].reverse().map((s) => <option key={s}>{s}</option>)}</select>
        {cats.length > 6
          ? <select value={active} onChange={(e) => setCat(e.target.value)} aria-label="Split category">{cats.map((c) => <option key={c}>{c}</option>)}</select>
          : <Seg value={active} onChange={setCat} options={cats} />}
      </div>
      <h3>Statcast situational splits</h3>
      <StatcastSits group={group} detail={detail} season={season} />
      <h3>Every MLB situation</h3>
      <div style={{ height: 4 }} />
      {codes.loading || sp.loading ? <Loading what="splits" /> : (
        <DataTable rows={data} heat cols={[{ key: 'split', label: 'Split', left: true, sticky: true },
          ...keys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f, hb: d.hb }; })]} />
      )}
      <p className="small muted">Every situation MLB tracks (counts, runners, innings, months, batting-order spot, opponent, park…) with wOBA and wRC+ computed for each. The Statcast table above adds xwOBA, contact quality and WPA, each split by the opponent’s hand.</p>
    </>
  );
}
