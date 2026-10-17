import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
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
import Search from './pages/Search.jsx';

const TABS = [
  ['/scores', 'Scores'], ['/standings', 'Standings'], ['/leaderboards', 'Leaderboards'], ['/teams', 'Teams'],
  ['/postseason', 'Postseason'], ['/prospects', 'Prospects'], ['/tools/compare', 'Compare'],
];

export default function App() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <>
      <header className="top">
        <div className="top-inner">
          <NavLink to="/scores" className="brand"><span className="split"><i /><i /></span><span>Plat<b>oo</b>n</span></NavLink>
          <nav className="nav">
            {TABS.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
          </nav>
          <SearchBox />
        </div>
      </header>
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
          <Route path="/search" element={<Search />} />
          <Route path="*" element={<div className="loading">Page not found.</div>} />
        </Routes>
      </main>
    </>
  );
}
