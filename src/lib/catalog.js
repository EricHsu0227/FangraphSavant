// Every stat the app can display: label, formatter, category, and direction.
// hb = higher is better (for percentiles / color scales). For pitchers the
// direction is from the pitcher's perspective (see pitcherHB).
export const fmt = {
  int: (v) => (v == null ? '' : Math.round(v).toLocaleString()),
  r3: (v) => (v == null ? '' : v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')),
  r2: (v) => (v == null ? '' : v.toFixed(2)),
  r1: (v) => (v == null ? '' : v.toFixed(1)),
  pct: (v) => (v == null ? '' : `${(v * 100).toFixed(1)}%`),
  ip: (v) => (v == null ? '' : `${Math.floor(v)}.${Math.round((v % 1) * 3)}`),
  plus: (v) => (v == null ? '' : Math.round(v)),
};

const S = (key, label, f, cat, hb = true, desc = '') => ({ key, label, f, cat, hb, desc });

export const HITTING = [
  S('G', 'G', fmt.int, 'Standard'), S('PA', 'PA', fmt.int, 'Standard'), S('AB', 'AB', fmt.int, 'Standard'),
  S('H', 'H', fmt.int, 'Standard'), S('2B', '2B', fmt.int, 'Standard'), S('3B', '3B', fmt.int, 'Standard'),
  S('HR', 'HR', fmt.int, 'Standard'), S('R', 'R', fmt.int, 'Standard'), S('RBI', 'RBI', fmt.int, 'Standard'),
  S('BB', 'BB', fmt.int, 'Standard'), S('SO', 'SO', fmt.int, 'Standard', false), S('SB', 'SB', fmt.int, 'Standard'),
  S('CS', 'CS', fmt.int, 'Standard', false),
  S('AVG', 'AVG', fmt.r3, 'Standard'), S('OBP', 'OBP', fmt.r3, 'Standard'), S('SLG', 'SLG', fmt.r3, 'Standard'),
  S('OPS', 'OPS', fmt.r3, 'Standard'), S('ISO', 'ISO', fmt.r3, 'Advanced'), S('BABIP', 'BABIP', fmt.r3, 'Advanced'),
  S('K%', 'K%', fmt.pct, 'Advanced', false), S('BB%', 'BB%', fmt.pct, 'Advanced'),
  S('wOBA', 'wOBA', fmt.r3, 'Value', true, 'Weighted on-base average'),
  S('xwOBA', 'xwOBA', fmt.r3, 'Value', true, 'Expected wOBA from exit velocity, launch angle (and sprint speed on topped/weak contact)'),
  S('xwOBA-wOBA', 'xwOBA−wOBA', fmt.r3, 'Value', true),
  S('wRCplus', 'wRC+', fmt.plus, 'Value', true, 'Park/league-adjusted runs created, 100 = average'),
  S('xwRCplus', 'xwRC+', fmt.plus, 'Value', true, 'wRC+ built on xwOBA (no park factor)'),
  S('wRAA', 'wRAA', fmt.r1, 'Value'),
  S('fWAR', 'fWAR', fmt.r1, 'Value', true, 'FanGraphs WAR'),
  S('valuePlus', 'Value+', fmt.plus, 'Value/Expected', true, 'Your stat: wOBA with K and GIDP penalty, park-adjusted, 100 = average'),
  S('expectedPlus', 'Expected+', fmt.plus, 'Value/Expected', true, 'Your stat: xwOBA with K and GIDP penalty, no park factor'),
  S('vRAA', 'vRAA', fmt.r1, 'Value/Expected'), S('eRAA', 'eRAA', fmt.r1, 'Value/Expected'),
  S('vWAR', 'vWAR', fmt.r1, 'Value/Expected'), S('eWAR', 'eWAR', fmt.r1, 'Value/Expected'),
  S('bsr', 'BsR', fmt.r1, 'Value', true, 'Baserunning run value (Savant)'),
  S('frv', 'FRV', fmt.int, 'Value', true, 'Fielding run value (Savant)'),
  S('oaa', 'OAA', fmt.int, 'Value'),
  // Statcast
  S('xBA', 'xBA', fmt.r3, 'Statcast'), S('xSLG', 'xSLG', fmt.r3, 'Statcast'), S('xISO', 'xISO', fmt.r3, 'Statcast'),
  S('xOBP', 'xOBP', fmt.r3, 'Statcast'),
  S('EV', 'Avg EV', fmt.r1, 'Statcast'), S('maxEV', 'Max EV', fmt.r1, 'Statcast'), S('EV90', 'EV90', fmt.r1, 'Statcast'),
  S('LA', 'LA', fmt.r1, 'Statcast', null), S('Barrel%', 'Barrel%', fmt.pct, 'Statcast'),
  S('HardHit%', 'HardHit%', fmt.pct, 'Statcast'), S('SweetSpot%', 'LA Sweet-Spot%', fmt.pct, 'Statcast'),
  S('BatSpeed', 'Bat Speed', fmt.r1, 'Statcast'), S('Squared%', 'Squared-Up%', fmt.pct, 'Statcast'),
  S('Blast%', 'Blast%', fmt.pct, 'Statcast'),
  S('GB%', 'GB%', fmt.pct, 'Batted Ball', null), S('LD%', 'LD%', fmt.pct, 'Batted Ball'), S('FB%', 'FB%', fmt.pct, 'Batted Ball', null),
  S('PU%', 'PU%', fmt.pct, 'Batted Ball', false), S('Pull%', 'Pull%', fmt.pct, 'Batted Ball', null),
  S('Straight%', 'Straight%', fmt.pct, 'Batted Ball', null), S('Oppo%', 'Oppo%', fmt.pct, 'Batted Ball', null),
  S('Whiff%', 'Whiff%', fmt.pct, 'Plate Discipline', false), S('Chase%', 'Chase%', fmt.pct, 'Plate Discipline', false),
  S('Zone%', 'Zone%', fmt.pct, 'Plate Discipline', null), S('ZSwing%', 'Z-Swing%', fmt.pct, 'Plate Discipline'),
  S('Swing%', 'Swing%', fmt.pct, 'Plate Discipline', null), S('ZContact%', 'Z-Contact%', fmt.pct, 'Plate Discipline'),
  S('Contact%', 'Contact%', fmt.pct, 'Plate Discipline'), S('FPS%', 'F-Strike%', fmt.pct, 'Plate Discipline', false),
  S('sprint', 'Sprint Speed', fmt.r1, 'Statcast'), S('RV', 'Run Value', fmt.r1, 'Statcast'),
];

export const PITCHING = [
  S('W', 'W', fmt.int, 'Standard'), S('L', 'L', fmt.int, 'Standard', false), S('G', 'G', fmt.int, 'Standard'),
  S('GS', 'GS', fmt.int, 'Standard'), S('SV', 'SV', fmt.int, 'Standard'), S('HLD', 'HLD', fmt.int, 'Standard'),
  S('IP', 'IP', fmt.ip, 'Standard'), S('TBF', 'TBF', fmt.int, 'Standard'), S('H', 'H', fmt.int, 'Standard', false),
  S('HR', 'HR', fmt.int, 'Standard', false), S('BB', 'BB', fmt.int, 'Standard', false), S('SO', 'SO', fmt.int, 'Standard'),
  S('ERA', 'ERA', fmt.r2, 'Standard', false), S('WHIP', 'WHIP', fmt.r2, 'Standard', false),
  S('K9', 'K/9', fmt.r2, 'Advanced'), S('BB9', 'BB/9', fmt.r2, 'Advanced', false), S('HR9', 'HR/9', fmt.r2, 'Advanced', false),
  S('K%', 'K%', fmt.pct, 'Advanced'), S('BB%', 'BB%', fmt.pct, 'Advanced', false), S('K-BB%', 'K-BB%', fmt.pct, 'Advanced'),
  S('FIP', 'FIP', fmt.r2, 'Advanced', false), S('xFIP', 'xFIP', fmt.r2, 'Advanced', false), S('xERA', 'xERA', fmt.r2, 'Statcast', false),
  S('wOBA', 'wOBA allowed', fmt.r3, 'Value', false), S('xwOBA', 'xwOBA allowed', fmt.r3, 'Value', false),
  S('wRCplusAllowed', 'wRC+ allowed', fmt.plus, 'Value', false, 'wRC+ of hitters against him; 100 = average, lower is better'),
  S('xwRCplusAllowed', 'xwRC+ allowed', fmt.plus, 'Value', false),
  S('WAR_FIP', 'WAR (FIP)', fmt.r1, 'Value', true, 'Standard FIP-based pitcher WAR'),
  S('WAR_wOBA', 'WAR (wOBA)', fmt.r1, 'Value', true, 'Pitcher WAR built on wOBA allowed instead of FIP'),
  S('fWAR', 'fWAR', fmt.r1, 'Value', true, 'FanGraphs published WAR'),
  S('valuePlus', 'Value+ allowed', fmt.plus, 'Value/Expected', false), S('expectedPlus', 'Expected+ allowed', fmt.plus, 'Value/Expected', false),
  S('vRAA', 'vRAA', fmt.r1, 'Value/Expected'), S('eRAA', 'eRAA', fmt.r1, 'Value/Expected'),
  S('vWAR', 'vWAR', fmt.r1, 'Value/Expected'), S('eWAR', 'eWAR', fmt.r1, 'Value/Expected'),
  S('xBA', 'xBA', fmt.r3, 'Statcast', false), S('xSLG', 'xSLG', fmt.r3, 'Statcast', false),
  S('EV', 'Avg EV', fmt.r1, 'Statcast', false), S('Barrel%', 'Barrel%', fmt.pct, 'Statcast', false),
  S('HardHit%', 'HardHit%', fmt.pct, 'Statcast', false), S('LA', 'LA', fmt.r1, 'Statcast', null),
  S('GB%', 'GB%', fmt.pct, 'Batted Ball'), S('FB%', 'FB%', fmt.pct, 'Batted Ball', null), S('LD%', 'LD%', fmt.pct, 'Batted Ball', false),
  S('Whiff%', 'Whiff%', fmt.pct, 'Plate Discipline'), S('Chase%', 'Chase%', fmt.pct, 'Plate Discipline'),
  S('Zone%', 'Zone%', fmt.pct, 'Plate Discipline', null), S('CSW%', 'CSW%', fmt.pct, 'Plate Discipline'),
  S('FPS%', 'F-Strike%', fmt.pct, 'Plate Discipline'),
  S('FBvelo', 'FB Velo', fmt.r1, 'Pitch'), S('FBspin', 'FB Spin', fmt.int, 'Pitch'), S('Ext', 'Extension', fmt.r1, 'Pitch'),
  S('IVB', 'FB IVB', fmt.r1, 'Pitch'), S('RV', 'Run Value', fmt.r1, 'Statcast'),
];

export const catalog = (group) => (group === 'pitching' ? PITCHING : HITTING);
export const statDef = (group, key) => catalog(group).find((s) => s.key === key) || S(key, key, (v) => (typeof v === 'number' ? fmt.r2(v) : v ?? ''), 'Other');

export const PRESETS = {
  hitting: {
    Dashboard: ['PA', 'HR', 'SB', 'BB%', 'K%', 'AVG', 'OBP', 'SLG', 'wOBA', 'xwOBA', 'wRCplus', 'vWAR', 'eWAR', 'fWAR'],
    Standard: ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'SO', 'SB', 'CS', 'AVG', 'OBP', 'SLG', 'OPS'],
    Advanced: ['PA', 'BB%', 'K%', 'ISO', 'BABIP', 'wOBA', 'xwOBA', 'xwOBA-wOBA', 'wRCplus', 'xwRCplus', 'wRAA'],
    Statcast: ['PA', 'EV', 'maxEV', 'EV90', 'LA', 'Barrel%', 'HardHit%', 'SweetSpot%', 'BatSpeed', 'xBA', 'xSLG', 'xwOBA'],
    'Batted Ball': ['PA', 'GB%', 'LD%', 'FB%', 'PU%', 'Pull%', 'Straight%', 'Oppo%', 'EV', 'LA'],
    'Plate Discipline': ['PA', 'Swing%', 'Zone%', 'ZSwing%', 'Chase%', 'Contact%', 'ZContact%', 'Whiff%', 'FPS%', 'K%', 'BB%'],
    'Value/Expected': ['PA', 'wOBA', 'xwOBA', 'valuePlus', 'expectedPlus', 'bsr', 'frv', 'vRAA', 'eRAA', 'vWAR', 'eWAR', 'fWAR'],
  },
  pitching: {
    Dashboard: ['W', 'L', 'G', 'GS', 'IP', 'K%', 'BB%', 'ERA', 'FIP', 'wOBA', 'xwOBA', 'wRCplusAllowed', 'WAR_FIP', 'WAR_wOBA', 'vWAR', 'eWAR'],
    Standard: ['W', 'L', 'ERA', 'G', 'GS', 'SV', 'HLD', 'IP', 'H', 'HR', 'BB', 'SO', 'WHIP'],
    Advanced: ['IP', 'K9', 'BB9', 'HR9', 'K%', 'BB%', 'K-BB%', 'ERA', 'FIP', 'xERA', 'wOBA', 'xwOBA', 'wRCplusAllowed'],
    Statcast: ['IP', 'EV', 'LA', 'Barrel%', 'HardHit%', 'xBA', 'xSLG', 'xwOBA', 'xERA', 'FBvelo', 'FBspin', 'IVB', 'Ext'],
    'Plate Discipline': ['IP', 'Zone%', 'Chase%', 'Whiff%', 'CSW%', 'FPS%', 'K%', 'BB%'],
    'WAR': ['IP', 'FIP', 'WAR_FIP', 'wOBA', 'WAR_wOBA', 'xwOBA', 'valuePlus', 'expectedPlus', 'vWAR', 'eWAR', 'fWAR'],
  },
};

// Stats offered by default on the customizable percentile chart (Savant-style).
export const PERCENTILE_DEFAULT = {
  hitting: ['xwOBA', 'wOBA', 'xBA', 'xSLG', 'EV', 'Barrel%', 'HardHit%', 'BatSpeed', 'Chase%', 'Whiff%', 'K%', 'BB%', 'sprint', 'frv', 'bsr'],
  pitching: ['xwOBA', 'wOBA', 'xERA', 'xBA', 'EV', 'Barrel%', 'HardHit%', 'Chase%', 'Whiff%', 'K%', 'BB%', 'FBvelo', 'Ext', 'GB%'],
};

export const qualifies = (group, row, season) => {
  const games = season === 2020 ? 60 : 162;
  const a = row.splits?.all || {};
  return group === 'hitting' ? (a.PA || 0) >= 3.1 * games * 0.98 : (a.IP || 0) >= games * 0.98;
};
