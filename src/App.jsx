import { NavLink, Route, Routes, Navigate, useLocation, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import SearchBox from './components/SearchBox.jsx';
import Scores from './pages/Scores.jsx';
import Game from './pages/Game.jsx';
import Standings from './pages/Standings.jsx';
import Leaderboards from './pages/Leaderboards.jsx';
import Teams from './pages/Teams.jsx';
import Team from './pages/Team.jsx';
import Player from './pages/Player.jsx';
import Postseason from './pages/Postseason.jsx';
import Series from './pages/Series.jsx';
import Prospects from './pages/Prospects.jsx';
import Compare from './pages/Compare.jsx';
import Matchup from './pages/Matchup.jsx';
import Search from './pages/Search.jsx';

const TABS = [
  ['/scores', 'Scores'], ['/standings', 'Standings'], ['/leaderboards', 'Leaderboards'], ['/teams', 'Teams'],
  ['/postseason', 'Postseason'], ['/prospects', 'Prospects'], ['/tools/matchup', 'Matchup'], ['/tools/compare', 'Compare'],
];

// Phone: four primary tabs + More
const ICON = {
  scores: <path d="M4 5h16v14H4zM4 10h16M9 5v14" />,
  standings: <path d="M5 19V9M12 19V5M19 19v-7" />,
  leaders: <path d="M4 7h10M4 12h16M4 17h7" />,
  teams: <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
};
const Icon = ({ k }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[k]}</svg>
);

export default function App() {
  const loc = useLocation();
  const [more, setMore] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); setMore(false); setSearchOpen(false); }, [loc.pathname]);
  const moreActive = ['/postseason', '/series', '/prospects', '/tools'].some((p) => loc.pathname.startsWith(p));
  return (
    <>
      <header className="top">
        <div className="top-inner">
          <NavLink to="/scores" className="brand"><span className="split"><i /><i /></span><span>Plat<b>oo</b>n</span></NavLink>
          <nav className="nav desktop-only">
            {TABS.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
          </nav>
          <div className="desktop-only"><SearchBox /></div>
          <button className="icon-btn mobile-only" aria-label="Search" onClick={() => setSearchOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          </button>
        </div>
      </header>
      {searchOpen && (
        <div className="sheet-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="search-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}><SearchBox autoFocus /></div>
              <button className="btn ghost" onClick={() => setSearchOpen(false)}>Cancel</button>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>Try “Judge”, “2016 Cubs”, “2024 ALCS”, “ws 2019”.</div>
          </div>
        </div>
      )}
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/scores" replace />} />
          <Route path="/scores" element={<Scores />} />
          <Route path="/scores/:date" element={<Scores />} />
          <Route path="/game/:pk" element={<Game />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/team/:id" element={<Team />} />
          <Route path="/team/:id/:season" element={<Team />} />
          <Route path="/player/:id" element={<Player />} />
          <Route path="/postseason" element={<Postseason />} />
          <Route path="/postseason/:season" element={<Postseason />} />
          <Route path="/series/:season/:type/:key" element={<Series />} />
          <Route path="/prospects" element={<Prospects />} />
          <Route path="/tools/compare" element={<Compare />} />
          <Route path="/tools/matchup" element={<Matchup />} />
          <Route path="/search" element={<Search />} />
          <Route path="*" element={<div className="loading">Page not found.</div>} />
        </Routes>
      </main>
      <nav className="bottom-nav mobile-only" aria-label="Sections">
        <NavLink to="/scores"><Icon k="scores" /><span>Scores</span></NavLink>
        <NavLink to="/standings"><Icon k="standings" /><span>Standings</span></NavLink>
        <NavLink to="/leaderboards"><Icon k="leaders" /><span>Leaders</span></NavLink>
        <NavLink to="/teams"><Icon k="teams" /><span>Teams</span></NavLink>
        <button className={moreActive || more ? 'active' : ''} onClick={() => setMore((m) => !m)}><Icon k="more" /><span>More</span></button>
      </nav>
      {more && (
        <div className="sheet-backdrop" onClick={() => setMore(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            {[['/postseason', 'Postseason', 'Brackets & series'], ['/prospects', 'Prospects', 'Lists, tools & farm rankings'],
              ['/tools/matchup', 'Matchup', 'Batter vs pitcher projection'], ['/tools/compare', 'Compare', 'Players side by side']].map(([to, l, d]) => (
              <Link key={to} to={to} className="more-item"><b>{l}</b><span className="muted small">{d}</span></Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
