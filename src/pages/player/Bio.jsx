import { getAwards, getTransactions } from '../../lib/mlbapi.js';
import { loadProspects } from '../../lib/data.js';
import { SEASONS } from '../../lib/guts.js';
import { useAsync, Loading } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';

export default function Bio({ id, person, contract }) {
  const tx = useAsync(() => getTransactions(id), [id]);
  const aw = useAsync(() => getAwards(id).catch(() => null), [id]);
  const pros = useAsync(async () => {
    const hits = [];
    for (const y of [...SEASONS].reverse()) {
      const list = await loadProspects(y);
      const me = list?.find((p) => p.id === id);
      if (me) hits.push({ year: y, ...me });
    }
    return hits;
  }, [id]);
  const awards = (aw.data?.awards || [])
    .sort((a, b) => (b.season || '').localeCompare(a.season || ''));
  return (
    <div className="grid g2">
      <div className="panel">
        <h3>Bio</h3>
        <table className="t"><tbody>
          {[['Full name', person.fullName], ['Born', person.birthDate && `${person.birthDate}${person.birthCity ? ` · ${person.birthCity}${person.birthStateProvince ? ', ' + person.birthStateProvince : ''}, ${person.birthCountry}` : ''}`],
            ['Bats / Throws', `${person.batSide?.description || ''} / ${person.pitchHand?.description || ''}`], ['Height / Weight', `${person.height || ''} ${person.weight ? `· ${person.weight} lb` : ''}`],
            ['Debut', person.mlbDebutDate], ['Draft', person.drafts?.[0] && `${person.drafts[0].year}, round ${person.drafts[0].pickRound}, pick ${person.drafts[0].pickNumber} (${person.drafts[0].team?.name || ''})${person.drafts[0].school?.name ? ` from ${person.drafts[0].school.name}` : ''}`],
            ['Nickname', person.nickName]].filter(([, v]) => v).map(([k, v]) => <tr key={k}><td className="l muted">{k}</td><td className="l" style={{ whiteSpace: 'normal' }}>{v}</td></tr>)}
        </tbody></table>
      </div>
      <div className="panel">
        <h3>Contract</h3>
        {contract ? contract.map((k, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <b>{k.years} yr / ${k.total}M</b> <span className="muted">({k.start}–{k.end}, AAV ${k.aav}M)</span>
            {k.details && <div className="small muted">{k.details}</div>}
            {k.seasons && <table className="t"><tbody>{Object.entries(k.seasons).map(([y, v]) => <tr key={y}><td className="l">{y}</td><td className="num">${v}M</td></tr>)}</tbody></table>}
          </div>
        )) : <div className="muted small">No contract on file. Add it to <code>public/data/contracts.json</code>.</div>}
      </div>
      <div className="panel">
        <h3>Awards</h3>
        {aw.loading ? <Loading /> : awards.length ? (
          <DataTable rows={awards.map((a, i) => ({ _key: i, season: a.season, name: a.name, team: a.team?.name }))} cols={[
            { key: 'season', label: 'Year', left: true }, { key: 'name', label: 'Award', left: true }, { key: 'team', label: 'Team', left: true },
          ]} limit={20} />
        ) : <div className="muted small">No awards listed.</div>}
      </div>
      <div className="panel">
        <h3>Prospect history</h3>
        {pros.loading ? <Loading /> : pros.data?.length ? (
          <DataTable rows={pros.data.map((r) => ({ ...r, _key: r.year }))} cols={[
            { key: 'year', label: 'List', left: true }, { key: 'rank', label: 'Top 100' }, { key: 'orgRank', label: 'Org' },
            { key: 'fv', label: 'FV' }, { key: 'eta', label: 'ETA' },
            { key: 'tools', label: 'Tools (present/future)', left: true, render: (r) => Object.entries(r.tools || {}).map(([k, v]) => `${k} ${v}`).join(' · ') },
          ]} />
        ) : <div className="muted small">Not on any prospect list in the data.</div>}
      </div>
      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        <h3>Transactions</h3>
        {tx.loading ? <Loading /> : (tx.data?.transactions || []).slice().reverse().slice(0, 60).map((t, i) => (
          <div key={i} className="small" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}><span className="mono muted">{t.date}</span> {t.description}</div>
        ))}
      </div>
    </div>
  );
}
