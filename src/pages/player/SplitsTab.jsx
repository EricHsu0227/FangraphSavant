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
export default function SplitsTab({ id, group, rows }) {
  const seasons = rows.map((r) => r.season).filter((s) => s >= SEASONS[0]);
  const [season, setSeason] = useState(seasons[seasons.length - 1] || SEASONS[SEASONS.length - 1]);
  const [cat, setCat] = usePref('splits:cat', 'Platoon');
  const codes = useAsync(() => getSituationCodes().catch(() => null), []);
  const menu = useMemo(() => {
    const m = {};
    for (const c of codes.data || []) {
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
      <div style={{ height: 10 }} />
      {codes.loading || sp.loading ? <Loading what="splits" /> : (
        <DataTable rows={data} heat cols={[{ key: 'split', label: 'Split', left: true, sticky: true },
          ...keys.map((k) => { const d = statDef(group, k); return { key: k, label: d.label, f: d.f, hb: d.hb }; })]} />
      )}
      <p className="small muted">Every situation MLB tracks (counts, runners, innings, months, batting-order spot, opponent, park…) with wOBA and wRC+ computed for each. Statcast L/R detail lives in the Statcast and Pitch Types tabs.</p>
    </>
  );
}
