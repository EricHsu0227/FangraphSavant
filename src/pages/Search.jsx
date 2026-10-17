import { Link, useSearchParams } from 'react-router-dom';
import { searchPeople } from '../lib/mlbapi.js';
import { parseQuery } from '../components/SearchBox.jsx';
import { useAsync, Loading, PlayerLink } from '../components/ui.jsx';

/** Full-page search results: /search?q=... */
export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const parsed = parseQuery(q);
  const name = q.replace(/\b(19|20)\d{2}\b/, '').trim();
  const people = useAsync(() => (name.length >= 3 ? searchPeople(name) : null), [name]);
  return (
    <>
      <h1>Search: “{q}”</h1>
      {parsed.series.length > 0 && <><h3>Postseason</h3>{parsed.series.map((s, i) => <div key={i}><Link to={s.type ? `/series/${s.year}/${s.type}/${s.lg || '-'}` : `/postseason/${s.year}`}>{s.label}</Link></div>)}</>}
      {parsed.teams.length > 0 && <><h3>Teams</h3>{parsed.teams.map((t) => <div key={t.id}><Link to={`/team/${t.id}/${t.year || ''}`}>{t.year ? `${t.year} ` : ''}{t.name}</Link></div>)}</>}
      <h3>Players</h3>
      {people.loading ? <Loading /> : (people.data?.people || []).map((p) => (
        <div key={p.id}><PlayerLink id={p.id} name={p.fullName} /> <span className="muted small">{p.primaryPosition?.abbreviation} · {p.currentTeam?.name || ''}</span></div>
      ))}
    </>
  );
}
