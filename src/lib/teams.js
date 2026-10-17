// Static franchise table (MLB team ids are stable across relocations/renames).
export const TEAMS = [
  { id: 110, abbr: 'BAL', name: 'Baltimore Orioles', short: 'Orioles', lg: 'AL', div: 'East' },
  { id: 111, abbr: 'BOS', name: 'Boston Red Sox', short: 'Red Sox', lg: 'AL', div: 'East' },
  { id: 147, abbr: 'NYY', name: 'New York Yankees', short: 'Yankees', lg: 'AL', div: 'East' },
  { id: 139, abbr: 'TB', name: 'Tampa Bay Rays', short: 'Rays', lg: 'AL', div: 'East' },
  { id: 141, abbr: 'TOR', name: 'Toronto Blue Jays', short: 'Blue Jays', lg: 'AL', div: 'East' },
  { id: 145, abbr: 'CWS', name: 'Chicago White Sox', short: 'White Sox', lg: 'AL', div: 'Central' },
  { id: 114, abbr: 'CLE', name: 'Cleveland Guardians', short: 'Guardians', lg: 'AL', div: 'Central', alias: ['Indians'] },
  { id: 116, abbr: 'DET', name: 'Detroit Tigers', short: 'Tigers', lg: 'AL', div: 'Central' },
  { id: 118, abbr: 'KC', name: 'Kansas City Royals', short: 'Royals', lg: 'AL', div: 'Central' },
  { id: 142, abbr: 'MIN', name: 'Minnesota Twins', short: 'Twins', lg: 'AL', div: 'Central' },
  { id: 117, abbr: 'HOU', name: 'Houston Astros', short: 'Astros', lg: 'AL', div: 'West' },
  { id: 108, abbr: 'LAA', name: 'Los Angeles Angels', short: 'Angels', lg: 'AL', div: 'West' },
  { id: 133, abbr: 'ATH', name: 'Athletics', short: 'Athletics', lg: 'AL', div: 'West', alias: ['Oakland', "A's", 'OAK', 'Sacramento'] },
  { id: 136, abbr: 'SEA', name: 'Seattle Mariners', short: 'Mariners', lg: 'AL', div: 'West' },
  { id: 140, abbr: 'TEX', name: 'Texas Rangers', short: 'Rangers', lg: 'AL', div: 'West' },
  { id: 144, abbr: 'ATL', name: 'Atlanta Braves', short: 'Braves', lg: 'NL', div: 'East' },
  { id: 146, abbr: 'MIA', name: 'Miami Marlins', short: 'Marlins', lg: 'NL', div: 'East' },
  { id: 121, abbr: 'NYM', name: 'New York Mets', short: 'Mets', lg: 'NL', div: 'East' },
  { id: 143, abbr: 'PHI', name: 'Philadelphia Phillies', short: 'Phillies', lg: 'NL', div: 'East' },
  { id: 120, abbr: 'WSH', name: 'Washington Nationals', short: 'Nationals', lg: 'NL', div: 'East' },
  { id: 112, abbr: 'CHC', name: 'Chicago Cubs', short: 'Cubs', lg: 'NL', div: 'Central' },
  { id: 113, abbr: 'CIN', name: 'Cincinnati Reds', short: 'Reds', lg: 'NL', div: 'Central' },
  { id: 158, abbr: 'MIL', name: 'Milwaukee Brewers', short: 'Brewers', lg: 'NL', div: 'Central' },
  { id: 134, abbr: 'PIT', name: 'Pittsburgh Pirates', short: 'Pirates', lg: 'NL', div: 'Central' },
  { id: 138, abbr: 'STL', name: 'St. Louis Cardinals', short: 'Cardinals', lg: 'NL', div: 'Central' },
  { id: 109, abbr: 'ARI', name: 'Arizona Diamondbacks', short: 'D-backs', lg: 'NL', div: 'West', alias: ['Diamondbacks'] },
  { id: 115, abbr: 'COL', name: 'Colorado Rockies', short: 'Rockies', lg: 'NL', div: 'West' },
  { id: 119, abbr: 'LAD', name: 'Los Angeles Dodgers', short: 'Dodgers', lg: 'NL', div: 'West' },
  { id: 135, abbr: 'SD', name: 'San Diego Padres', short: 'Padres', lg: 'NL', div: 'West' },
  { id: 137, abbr: 'SF', name: 'San Francisco Giants', short: 'Giants', lg: 'NL', div: 'West' },
];
export const teamById = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
export const abbrOf = (id) => teamById[id]?.abbr || '';

export const SERIES_TYPES = { F: 'Wild Card Series', D: 'Division Series', L: 'Championship Series', W: 'World Series' };
export const seriesName = (type, lg) =>
  type === 'W' ? 'World Series' : `${lg || ''}${type === 'L' ? 'CS' : type === 'D' ? 'DS' : ' Wild Card'}`.trim();
