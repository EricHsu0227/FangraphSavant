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

// Pitch types in Statcast codes, with FanGraphs-style short labels
export const PITCH_TYPES = [['FF', 'FA'], ['SI', 'SI'], ['FC', 'FC'], ['SL', 'SL'], ['ST', 'SW'], ['CU', 'CU'], ['KC', 'KC'], ['CH', 'CH'], ['FS', 'FS']];
export const PITCH_NAME = { FF: '4-Seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper', SV: 'Slurve', CU: 'Curveball', KC: 'Knuckle Curve',
  CS: 'Slow Curve', CH: 'Changeup', FS: 'Splitter', FO: 'Forkball', SC: 'Screwball', KN: 'Knuckleball', EP: 'Eephus', FA: 'Fastball' };
export const PITCH_COLOR = { FF: '#d22d49', SI: '#fe9d00', FC: '#933f2c', SL: '#eee716', ST: '#ddb33a', SV: '#93afd4', CU: '#00d1ed',
  KC: '#6236cd', CS: '#0068ff', CH: '#1dbe3a', FS: '#3bacac', FO: '#55ccab', SC: '#60db33', KN: '#3c44cd', EP: '#888888', FA: '#d22d49' };

/** Flat pitch-type columns, e.g. pt_SL_use, built from row.pt in data.js */
function pitchTypeStats(group) {
  const out = [];
  for (const [pt, short] of PITCH_TYPES) {
    if (group === 'pitching') {
      out.push(S(`pt_${pt}_use`, `${short}%`, fmt.pct, 'Pitch Type', null, `${PITCH_NAME[pt]} usage`));
      out.push(S(`pt_${pt}_velo`, `v${short}`, fmt.r1, 'Velocity', true, `${PITCH_NAME[pt]} velocity`));
      out.push(S(`pt_${pt}_hb`, `${short}-X`, fmt.r1, 'Movement', null, `${PITCH_NAME[pt]} horizontal break (in)`));
      out.push(S(`pt_${pt}_ivb`, `${short}-Z`, fmt.r1, 'Movement', null, `${PITCH_NAME[pt]} induced vertical break (in)`));
      out.push(S(`pt_${pt}_spin`, `${short} Spin`, fmt.int, 'Spin', true, `${PITCH_NAME[pt]} spin rate`));
      out.push(S(`pt_${pt}_rv100`, `w${short}/C`, fmt.r2, 'Pitch Value', true, `${PITCH_NAME[pt]} run value per 100`));
      out.push(S(`pt_${pt}_whiff`, `${short} Whiff%`, fmt.pct, 'Pitch Value', true));
      out.push(S(`pt_${pt}_xwoba`, `${short} xwOBA`, fmt.r3, 'Pitch Value', false));
    } else {
      out.push(S(`pt_${pt}_use`, `${short}% seen`, fmt.pct, 'Pitch Type', null, `Share of pitches seen that were ${PITCH_NAME[pt]}`));
      out.push(S(`pt_${pt}_rv100`, `w${short}/C`, fmt.r2, 'Pitch Value', true, `Run value per 100 vs ${PITCH_NAME[pt]}`));
      out.push(S(`pt_${pt}_whiff`, `${short} Whiff%`, fmt.pct, 'Pitch Value', false));
      out.push(S(`pt_${pt}_xwoba`, `${short} xwOBA`, fmt.r3, 'Pitch Value', true));
    }
  }
  return out;
}

export const HITTING = [
  S('pL_PA', 'PA vL', fmt.int, 'Platoon', null), S('pL_wOBA', 'wOBA vL', fmt.r3, 'Platoon'), S('pL_xwOBA', 'xwOBA vL', fmt.r3, 'Platoon'),
  S('pR_PA', 'PA vR', fmt.int, 'Platoon', null), S('pR_wOBA', 'wOBA vR', fmt.r3, 'Platoon'), S('pR_xwOBA', 'xwOBA vR', fmt.r3, 'Platoon'),
  S('platGap', 'Split (wOBA)', fmt.r3, 'Platoon', null, 'Observed wOBA vs opposite-hand pitchers minus same-hand'),
  S('platGapX', 'Split (xwOBA)', fmt.r3, 'Platoon', null, 'Observed xwOBA vs opposite-hand minus same-hand'),
  S('regGap', 'True split', fmt.r3, 'Platoon', null, 'Platoon split regressed to the league norm for his handedness (The Book method)'),
  S('trueL', 'True xwOBA vL', fmt.r3, 'Platoon', true, 'Regressed xwOBA vs LHP'), S('trueR', 'True xwOBA vR', fmt.r3, 'Platoon', true, 'Regressed xwOBA vs RHP'),
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
  S('BBE', 'BBE', fmt.int, 'Statcast', null), S('pitches', 'Pitches', fmt.int, 'Statcast', null),
  // Win probability / context
  S('WPA', 'WPA', fmt.r2, 'Win Probability', true, 'Win probability added'),
  S('RE24', 'RE24', fmt.r1, 'Win Probability', true, 'Run expectancy added (Statcast run value)'),
  // + stats (100 = league average for that season and split)
  S('AVG+', 'AVG+', fmt.plus, '+ Stats'), S('OBP+', 'OBP+', fmt.plus, '+ Stats'), S('SLG+', 'SLG+', fmt.plus, '+ Stats'),
  S('ISO+', 'ISO+', fmt.plus, '+ Stats'), S('BABIP+', 'BABIP+', fmt.plus, '+ Stats'), S('K%+', 'K%+', fmt.plus, '+ Stats', false),
  S('BB%+', 'BB%+', fmt.plus, '+ Stats'), S('wOBA+', 'wOBA+', fmt.plus, '+ Stats'), S('xwOBA+', 'xwOBA+', fmt.plus, '+ Stats'),
  // quality of contact (Savant)
  S('Weak%', 'Weak%', fmt.pct, 'Quality of Contact', false), S('Topped%', 'Topped%', fmt.pct, 'Quality of Contact', false),
  S('Under%', 'Under%', fmt.pct, 'Quality of Contact', false), S('Flare%', 'Flare/Burner%', fmt.pct, 'Quality of Contact'),
  S('Solid%', 'Solid%', fmt.pct, 'Quality of Contact'), S('xwOBAcon', 'xwOBAcon', fmt.r3, 'Quality of Contact'),
  S('wOBAcon', 'wOBAcon', fmt.r3, 'Quality of Contact'), S('Pull Air%', 'Pull Air%', fmt.pct, 'Batted Ball'),
  // attack zones
  S('heart%', 'Heart%', fmt.pct, 'Attack Zones', null), S('shadow%', 'Shadow%', fmt.pct, 'Attack Zones', null),
  S('chase%', 'Chase-zone%', fmt.pct, 'Attack Zones', null), S('waste%', 'Waste%', fmt.pct, 'Attack Zones', null),
  S('heartSw%', 'Heart Swing%', fmt.pct, 'Attack Zones'), S('shadowSw%', 'Shadow Swing%', fmt.pct, 'Attack Zones', null),
  S('chaseSw%', 'Chase-zone Swing%', fmt.pct, 'Attack Zones', false), S('wasteSw%', 'Waste Swing%', fmt.pct, 'Attack Zones', false),
  S('heartRV', 'Heart RV', fmt.r1, 'Attack Zones'), S('shadowRV', 'Shadow RV', fmt.r1, 'Attack Zones'),
  S('chaseRV', 'Chase RV', fmt.r1, 'Attack Zones'), S('wasteRV', 'Waste RV', fmt.r1, 'Attack Zones'),
  S('Swing RV', 'Swing RV', fmt.r1, 'Attack Zones'), S('Take RV', 'Take RV', fmt.r1, 'Attack Zones'),
  S('FPSwing%', '1st-Pitch Swing%', fmt.pct, 'Plate Discipline', null),
  S('age', 'Age', fmt.int, 'Standard', null),
  ...pitchTypeStats('hitting'),
];

export const PITCHING = [
  S('pL_PA', 'PA vL', fmt.int, 'Platoon', null), S('pL_wOBA', 'wOBA vL', fmt.r3, 'Platoon', false), S('pL_xwOBA', 'xwOBA vL', fmt.r3, 'Platoon', false),
  S('pR_PA', 'PA vR', fmt.int, 'Platoon', null), S('pR_wOBA', 'wOBA vR', fmt.r3, 'Platoon', false), S('pR_xwOBA', 'xwOBA vR', fmt.r3, 'Platoon', false),
  S('platGap', 'Split (wOBA)', fmt.r3, 'Platoon', null, 'Observed wOBA allowed vs opposite-hand batters minus same-hand'),
  S('platGapX', 'Split (xwOBA)', fmt.r3, 'Platoon', null, 'Observed xwOBA allowed vs opposite-hand minus same-hand'),
  S('regGap', 'True split', fmt.r3, 'Platoon', null, 'Platoon split regressed to the league norm for his handedness (The Book method)'),
  S('trueL', 'True xwOBA vL', fmt.r3, 'Platoon', false, 'Regressed xwOBA allowed vs LHB'), S('trueR', 'True xwOBA vR', fmt.r3, 'Platoon', false, 'Regressed xwOBA allowed vs RHB'),
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
  S('BBE', 'BBE', fmt.int, 'Statcast', null), S('pitches', 'Pitches', fmt.int, 'Statcast', null),
  S('xwOBAcon', 'xwOBAcon', fmt.r3, 'Statcast', false), S('wOBAcon', 'wOBAcon', fmt.r3, 'Statcast', false), S('xISO', 'xISO', fmt.r3, 'Statcast', false), S('maxEV', 'Max EV', fmt.r1, 'Statcast', false), S('EV90', 'EV90', fmt.r1, 'Statcast', false), S('SweetSpot%', 'Sweet-Spot%', fmt.pct, 'Statcast', false), S('Swing%', 'Swing%', fmt.pct, 'Plate Discipline', null), S('ZSwing%', 'Z-Swing%', fmt.pct, 'Plate Discipline', null), S('Contact%', 'Contact%', fmt.pct, 'Plate Discipline', false), S('ZContact%', 'Z-Contact%', fmt.pct, 'Plate Discipline', false), S('FPSwing%', '1st-Pitch Swing%', fmt.pct, 'Plate Discipline', null), S('Pull%', 'Pull%', fmt.pct, 'Batted Ball', null), S('Straight%', 'Straight%', fmt.pct, 'Batted Ball', null), S('Oppo%', 'Oppo%', fmt.pct, 'Batted Ball', null), S('PU%', 'PU%', fmt.pct, 'Batted Ball', null), S('Pull Air%', 'Pull Air%', fmt.pct, 'Batted Ball', false),
  S('WPA', 'WPA', fmt.r2, 'Win Probability', true, 'Win probability added (pitcher side)'),
  S('RE24', 'RE24', fmt.r1, 'Win Probability', true, 'Runs saved vs expectancy'),
  S('ERA-', 'ERA-', fmt.plus, '+ Stats', false), S('FIP-', 'FIP-', fmt.plus, '+ Stats', false),
  S('K%+', 'K%+', fmt.plus, '+ Stats'), S('BB%+', 'BB%+', fmt.plus, '+ Stats', false), S('xwOBA+', 'xwOBA+ allowed', fmt.plus, '+ Stats', false),
  S('Weak%', 'Weak%', fmt.pct, 'Quality of Contact'), S('Topped%', 'Topped%', fmt.pct, 'Quality of Contact'),
  S('Under%', 'Under%', fmt.pct, 'Quality of Contact'), S('Flare%', 'Flare/Burner%', fmt.pct, 'Quality of Contact', false),
  S('Solid%', 'Solid%', fmt.pct, 'Quality of Contact', false), S('xwOBAcon', 'xwOBAcon', fmt.r3, 'Quality of Contact', false),
  S('heart%', 'Heart%', fmt.pct, 'Attack Zones', false), S('shadow%', 'Shadow%', fmt.pct, 'Attack Zones'),
  S('chase%', 'Chase-zone%', fmt.pct, 'Attack Zones', null), S('waste%', 'Waste%', fmt.pct, 'Attack Zones', false),
  S('chaseSw%', 'Chase-zone Swing%', fmt.pct, 'Attack Zones'), S('heartRV', 'Heart RV', fmt.r1, 'Attack Zones'),
  S('shadowRV', 'Shadow RV', fmt.r1, 'Attack Zones'), S('chaseRV', 'Chase RV', fmt.r1, 'Attack Zones'),
  S('Swing RV', 'Swing RV', fmt.r1, 'Attack Zones'), S('Take RV', 'Take RV', fmt.r1, 'Attack Zones'),
  S('age', 'Age', fmt.int, 'Standard', null),
  ...pitchTypeStats('pitching'),
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
    '+ Stats': ['PA', 'AVG+', 'OBP+', 'SLG+', 'ISO+', 'BABIP+', 'K%+', 'BB%+', 'wOBA+', 'xwOBA+', 'wRCplus'],
    'Win Probability': ['PA', 'WPA', 'RE24', 'wOBA', 'wRCplus'],
    'Quality of Contact': ['PA', 'BBE', 'Weak%', 'Topped%', 'Under%', 'Flare%', 'Solid%', 'Barrel%', 'xwOBAcon', 'wOBAcon'],
    'Attack Zones': ['PA', 'heart%', 'shadow%', 'chase%', 'waste%', 'heartSw%', 'chaseSw%', 'heartRV', 'shadowRV', 'chaseRV', 'wasteRV', 'Swing RV', 'Take RV'],
    'Bat Tracking': ['PA', 'BatSpeed', 'Squared%', 'Blast%', 'EV', 'EV90', 'Barrel%', 'xwOBAcon'],
    'Pitch Value': ['PA', ...PITCH_TYPES.map(([p]) => `pt_${p}_rv100`)],
    'Pitch Type': ['PA', ...PITCH_TYPES.map(([p]) => `pt_${p}_use`)],
    Platoon: ['PA', 'pL_PA', 'pL_wOBA', 'pL_xwOBA', 'pR_PA', 'pR_wOBA', 'pR_xwOBA', 'platGap', 'platGapX', 'regGap', 'trueL', 'trueR'],
  },
  pitching: {
    Dashboard: ['W', 'L', 'G', 'GS', 'IP', 'K%', 'BB%', 'ERA', 'FIP', 'wOBA', 'xwOBA', 'wRCplusAllowed', 'WAR_FIP', 'WAR_wOBA', 'vWAR', 'eWAR'],
    Standard: ['W', 'L', 'ERA', 'G', 'GS', 'SV', 'HLD', 'IP', 'H', 'HR', 'BB', 'SO', 'WHIP'],
    Advanced: ['IP', 'K9', 'BB9', 'HR9', 'K%', 'BB%', 'K-BB%', 'ERA', 'FIP', 'xERA', 'wOBA', 'xwOBA', 'wRCplusAllowed'],
    Statcast: ['IP', 'EV', 'LA', 'Barrel%', 'HardHit%', 'xBA', 'xSLG', 'xwOBA', 'xERA', 'FBvelo', 'FBspin', 'IVB', 'Ext'],
    'Plate Discipline': ['IP', 'Zone%', 'Chase%', 'Whiff%', 'CSW%', 'FPS%', 'K%', 'BB%'],
    Platoon: ['TBF', 'pL_PA', 'pL_wOBA', 'pL_xwOBA', 'pR_PA', 'pR_wOBA', 'pR_xwOBA', 'platGap', 'platGapX', 'regGap', 'trueL', 'trueR'],
    'WAR': ['IP', 'FIP', 'WAR_FIP', 'wOBA', 'WAR_wOBA', 'xwOBA', 'valuePlus', 'expectedPlus', 'vWAR', 'eWAR', 'fWAR'],
    '+ Stats': ['IP', 'ERA-', 'FIP-', 'K%+', 'BB%+', 'xwOBA+', 'wRCplusAllowed'],
    'Win Probability': ['IP', 'WPA', 'RE24', 'ERA', 'wOBA'],
    'Quality of Contact': ['IP', 'Weak%', 'Topped%', 'Under%', 'Flare%', 'Solid%', 'Barrel%', 'xwOBAcon'],
    'Attack Zones': ['IP', 'heart%', 'shadow%', 'chase%', 'waste%', 'chaseSw%', 'heartRV', 'shadowRV', 'chaseRV', 'Swing RV', 'Take RV'],
    'Pitch Type': ['IP', ...PITCH_TYPES.map(([p]) => `pt_${p}_use`)],
    'Velocity': ['IP', ...PITCH_TYPES.map(([p]) => `pt_${p}_velo`)],
    'Movement': ['IP', ...PITCH_TYPES.flatMap(([p]) => [`pt_${p}_hb`, `pt_${p}_ivb`])],
    'Pitch Value': ['IP', ...PITCH_TYPES.map(([p]) => `pt_${p}_rv100`)],
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
