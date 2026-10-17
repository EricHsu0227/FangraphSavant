import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchPeople } from '../lib/mlbapi.js';
import { TEAMS } from '../lib/teams.js';
import { loadPlayerIndex } from '../lib/data.js';

/**
 * Parses free text into teams ("2016 Cubs", "cubs"), team-seasons, postseason
 * series ("2024 ALCS", "ws 2019", "2023 NLDS"), and players (MLB API + local index).
 */
export function parseQuery(q) {
  const out = { teams: [], series: [] };
  const s = q.trim().toLowerCase();
  if (!s) return out;
  const yearM = s.match(/\b(19|20)\d{2}\b/);
  const year = yearM ? Number(yearM[0]) : null;
  const rest = s.replace(/\b(19|20)\d{2}\b/, '').trim();
  if (rest.length >= 2) {
    for (const t of TEAMS) {
      const hay = [t.name, t.short, t.abbr, ...(t.alias || [])].map((x) => x.toLowerCase());
      if (hay.some((h) => h.includes(rest) || (rest.length >= 3 && rest.includes(h)))) out.teams.push({ ...t, year });
    }
  }
  const sm = rest.match(/^(al|nl)?\s*(ws|world series|alcs|nlcs|alds|nlds|cs|ds|wild ?card|wc|lcs)$/);
  if (sm && year) {
    const tok = sm[2].replace(/\s/g, '');
    let lg = sm[1]?.toUpperCase() || null;
    let type = null;
    if (tok === 'ws' || tok === 'worldseries') type = 'W';
    else if (tok.endsWith('cs')) { type = 'L'; if (tok.startsWith('al')) lg = 'AL'; if (tok.startsWith('nl')) lg = 'NL'; }
    else if (tok.endsWith('ds')) { type = 'D'; if (tok.startsWith('al')) lg = 'AL'; if (tok.startsWith('nl')) lg = 'NL'; }
    else type = 'F';
    const label = type === 'W' ? `${year} World Series` : `${year} ${lg || ''}${{ L: 'CS', D: 'DS', F: ' Wild Card' }[type]}`;
    out.series.push({ year, type, lg, label: label.replace(/\s+/g, ' ') });
  }
  if (year && !rest) out.series.push({ year, type: null, label: `${year} Postseason bracket` });
  return out;
}

export default function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState([]);
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const box = useRef();

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim().replace(/\b(19|20)\d{2}\b/, '').trim();
      if (s.length < 3) { setPlayers([]); return; }
      const [remote, idx] = await Promise.all([searchPeople(s).catch(() => null), loadPlayerIndex()]);
      const seen = new Set();
      const list = [];
      for (const p of remote?.people || []) {
        seen.add(p.id);
        list.push({ id: p.id, name: p.fullName, sub: `${p.primaryPosition?.abbreviation || ''} · ${p.currentTeam?.name || (p.active ? '' : 'Inactive')}` });
      }
      for (const p of (idx || []).filter((x) => x.name.toLowerCase().includes(s.toLowerCase())).slice(0, 20)) {
        if (!seen.has(p.id)) list.push({ id: p.id, name: p.name, sub: `${p.pos || ''} · ${p.first}–${p.last}` });
      }
      setPlayers(list.slice(0, 12));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const parsed = parseQuery(q);
  const items = [
    ...parsed.series.map((s) => ({ grp: 'Postseason', label: s.label, to: s.type ? `/series/${s.year}/${s.type}/${s.lg || '-'}` : `/postseason/${s.year}` })),
    ...parsed.teams.slice(0, 6).map((t) => ({ grp: 'Teams', label: `${t.year ? t.year + ' ' : ''}${t.name}`, to: `/team/${t.id}/${t.year || ''}` })),
    ...players.map((p) => ({ grp: 'Players', label: p.name, sub: p.sub, to: `/player/${p.id}` })),
  ];
  const go = (it) => { if (!it) return; nav(it.to); setOpen(false); setQ(''); };

  let lastGrp = null;
  return (
    <div className="search-box" ref={box}>
      <input placeholder="Search players, teams, 2016 Cubs, 2024 ALCS…" value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setSel((s) => Math.min(items.length - 1, s + 1)); e.preventDefault(); }
          if (e.key === 'ArrowUp') { setSel((s) => Math.max(0, s - 1)); e.preventDefault(); }
          if (e.key === 'Enter') go(items[sel]);
          if (e.key === 'Escape') setOpen(false);
        }} />
      {open && q.trim().length >= 2 && (
        <div className="search-pop">
          {items.length === 0 && <div className="muted small" style={{ padding: 12 }}>No matches yet…</div>}
          {items.map((it, i) => {
            const head = it.grp !== lastGrp ? <div className="grp">{it.grp}</div> : null;
            lastGrp = it.grp;
            return (
              <div key={i}>
                {head}
                <a className={i === sel ? 'sel' : ''} onMouseDown={(e) => { e.preventDefault(); go(it); }}>
                  {it.label} {it.sub && <span className="muted small">{it.sub}</span>}
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
