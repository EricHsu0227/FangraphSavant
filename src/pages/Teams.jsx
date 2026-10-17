import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getStandings, teamLogo, today } from '../lib/mlbapi.js';
import { TEAMS } from '../lib/teams.js';
import { SeasonSelect, useAsync, Loading } from '../components/ui.jsx';

export default function Teams() {
  const cur = Number(today().slice(0, 4));
  const [season, setSeason] = useState(cur);
  const st = useAsync(() => getStandings(season), [season]);
  const rec = {};
  for (const r of st.data?.records || []) for (const t of r.teamRecords) rec[t.team.id] = t;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Teams</h1>
        <SeasonSelect value={season} onChange={setSeason} />
      </div>
      {st.loading && <Loading what="teams" />}
      {['AL', 'NL'].map((lg) => (
        <div key={lg}>
          <h2>{lg === 'AL' ? 'American League' : 'National League'}</h2>
          <div className="grid g3">
            {['East', 'Central', 'West'].map((dv) => (
              <div className="panel" key={dv}>
                <h3>{lg} {dv}</h3>
                {TEAMS.filter((t) => t.lg === lg && t.div === dv)
                  .sort((a, b) => (rec[b.id]?.wins || 0) - (rec[a.id]?.wins || 0))
                  .map((t) => (
                    <Link key={t.id} to={`/team/${t.id}/${season}`} className="row" style={{ padding: '6px 0', color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>
                      <img src={teamLogo(t.id)} width="26" height="26" alt="" />
                      <b>{t.name}</b>
                      <span className="muted mono" style={{ marginLeft: 'auto' }}>{rec[t.id] ? `${rec[t.id].wins}-${rec[t.id].losses}` : ''}</span>
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
