import { Link, useNavigate, useParams } from 'react-router-dom';
import { loadSeries } from '../lib/postseason.js';
import { teamLogo, today } from '../lib/mlbapi.js';
import { teamById, seriesName } from '../lib/teams.js';
import { SEASONS } from '../lib/guts.js';
import { useAsync, Loading, Err, SeasonSelect } from '../components/ui.jsx';

export function SeriesCard({ s, season }) {
  return (
    <Link to={`/series/${season}/${s.type}/${s.teams.join('-')}`} className="series-card">
      {s.teamsOrdered.map((t) => (
        <div key={t} className={`s-tm ${s.winner === t ? 'w' : ''}`} style={s.winner && s.winner !== t ? { opacity: 0.55 } : undefined}>
          <img src={teamLogo(t)} alt="" /><span>{teamById[t]?.short || t}</span><span className="w-ct">{s.wins[t]}</span>
        </div>
      ))}
    </Link>
  );
}

export default function Postseason() {
  const { season: sParam } = useParams();
  const t = today();
  const latest = Number(t.slice(0, 4)) - (t.slice(5) < '09-30' ? 1 : 0);
  const season = Number(sParam) || latest;
  const nav = useNavigate();
  const data = useAsync(() => loadSeries(season), [season]);

  const col = (lg, type) => (data.data || []).filter((s) => s.type === type && (type === 'W' || s.lg === lg));
  const rounds = [
    ['AL', 'F'], ['AL', 'D'], ['AL', 'L'], [null, 'W'], ['NL', 'L'], ['NL', 'D'], ['NL', 'F'],
  ];
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{season} Postseason</h1>
        <SeasonSelect value={season} onChange={(s) => nav(`/postseason/${s}`)} seasons={SEASONS.filter((s) => s <= latest)} />
      </div>
      {data.loading && <Loading what="bracket" />}
      {data.error && <Err e={data.error} />}
      {data.data && data.data.length === 0 && <div className="loading">No postseason games for {season} yet.</div>}
      {data.data?.length > 0 && (
        <div className="bracket">
          {rounds.map(([lg, type]) => {
            const list = col(lg, type);
            if (!list.length) return null;
            return (
              <div className="round" key={`${lg}-${type}`}>
                <h4>{type === 'W' ? 'World Series' : seriesName(type, lg)}</h4>
                {list.map((s) => <SeriesCard key={s.key} s={s} season={season} />)}
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">Click any series for games, box scores, and series leaders with wOBA, xwOBA, wRC+ and WPA.</p>
    </>
  );
}
