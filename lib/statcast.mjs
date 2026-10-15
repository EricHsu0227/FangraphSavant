import {WEIGHTS,weightedWoba} from './baseball.mjs';
/** FangraphSavant Statcast CSV adapter and handedness calculations.
 * Data source: Baseball Savant. No synthetic stats, no scraped HTML.
 * Source docs: https://baseballsavant.mlb.com/csv-docs
 */
export const MIN_YEAR=2021, MAX_YEAR=2026;

export function validSeason(raw) {
  const y=Number(raw);
  if (!Number.isInteger(y) || y<MIN_YEAR || y>MAX_YEAR) throw new Error('Season must be between 2021 and 2026');
  return y;
}
export function validPlayerId(raw) {
  const p=Number(raw);
  if (!Number.isInteger(p)||p<1||p>99999999) throw new Error('Invalid MLB player ID');
  return p;
}

/** RFC 4180 compatible parsing incl. escaped quotes, commas inside player names and CRLF. */
export function parseCSV(text) {
  if (text.charCodeAt(0)===0xfeff) text=text.slice(1);
  const out=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(c===','&&!quoted){row.push(field);field=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))out.push(row);row=[];field=''}
    else field+=c;
  }
  if(field||row.length){row.push(field);if(row.some(v=>v.trim()))out.push(row)}
  if(!out.length) return [];
  const headings=out.shift().map(x=>x.trim());
  return out.map(cells=>Object.fromEntries(headings.map((k,i)=>[k,cells[i]??''])));
}
const number=(v)=>v===undefined||v===null||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
const pick=(row,...names)=>{for(const n of names)if(Object.hasOwn(row,n))return row[n];return null};
const val=(row,...names)=>number(pick(row,...names));
const round=(v,places=3)=>v==null||!Number.isFinite(v)?null:(v<0?-1:1)*Math.round((Math.abs(v)+Number.EPSILON)*10**places)/10**places;

export function parseExpectedLeaderboard(csv, season) {
  const records=parseCSV(csv);
  if(records.length===0) throw new Error('Savant returned no leaderboard rows');
  if(!Object.hasOwn(records[0],'player_id')||!Object.hasOwn(records[0],'est_woba'))throw new Error('Unexpected Savant leaderboard CSV columns');
  return records.map(r=>({
    id:val(r,'player_id'),year:val(r,'year')??season,
    name:pick(r,'last_name, first_name','player_name','name')||'Unknown',
    pa:val(r,'pa'),bip:val(r,'bip'),avg:val(r,'ba'),xavg:val(r,'est_ba'),
    slg:val(r,'slg'),xslg:val(r,'est_slg'),woba:val(r,'woba'),xwoba:val(r,'est_woba'),
    gap:val(r,'woba')!=null&&val(r,'est_woba')!=null?round(val(r,'woba')-val(r,'est_woba')):null,
  })).filter(r=>r.id&&r.woba!=null).sort((a,b)=>(b.xwoba??-1)-(a.xwoba??-1));
}
export function parseContactLeaderboard(csv) {
  const rows=parseCSV(csv);if(!rows.length)throw new Error('Savant returned no contact rows');
  return Object.fromEntries(rows.map(r=>[val(r,'player_id'),{
    ev:val(r,'avg_hit_speed'),hardhit:val(r,'ev95percent'),barrel:val(r,'brl_percent'),
    sweetspot:val(r,'anglesweetspotpercent'),bbe:val(r,'attempts')
  }]).filter(([id])=>id));
}
function emptySplit(label){return {hand:label,pa:0,ab:0,h:0,hr:0,bb:0,ibb:0,hbp:0,so:0,sf:0,bip:0,
    wobaNumerator:0,wobaDenominator:0,wobaCoveredDenominator:0,xwobaNumerator:0,xwobaCoveredDenominator:0,
    xwobaMissing:0,hardHit:0,barrels:0,barrelN:0,missingDen:0,evSum:0,evN:0,totalBases:0,single:0,double:0,triple:0,
    avg:null,slg:null,woba:null,xwoba:null,hardHitPct:null,barrelPct:null,avgEV:null,coverage:null};}
const AB_EXCLUSIONS=new Set(['walk','intent_walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','sac_bunt_double_play','catcher_interf']);
const HITS={single:1,double:2,triple:3,home_run:4};
const BB_EVENTS=new Set(['walk','intent_walk']);
const K_EVENTS=new Set(['strikeout','strikeout_double_play']);
const SF_EVENTS=new Set(['sac_fly','sac_fly_double_play']);
const PA_EVENTS=new Set(['single','double','triple','home_run','field_out','force_out','grounded_into_double_play','double_play','triple_play','fielders_choice','fielders_choice_out','field_error','other_out','sac_fly','sac_fly_double_play','sac_bunt','sac_bunt_double_play','walk','intent_walk','hit_by_pitch','strikeout','strikeout_double_play','catcher_interf']);
// BB/HBP/K represent non-contact events for which actual and expected values match.
const NON_CONTACT=new Set(['walk','intent_walk','hit_by_pitch','strikeout','strikeout_double_play','catcher_interf']);

/**
 * Aggregate ONLY terminal pitch rows (events != '').
 * xwOBA = (expected contact values + actual BB/K/HBP outcomes) / full Statcast wOBA denominator.
 * Refuse xwOBA rather than silently substituting actual hit results for missing contact estimates.
 * Hand means pitcher hand: L = vs LHP, R = vs RHP.
 */
export function calculateSplits(rows, {playerId=null, perspective='batter'}={}) {
  const groups={ALL:emptySplit('ALL'),L:emptySplit('L'),R:emptySplit('R')};
  let terminalRows=0,missingHand=0;
  const unique=new Map();
  for(let i=0;i<rows.length;i++){const row=rows[i];if(!String(row.events||'').trim())continue;const key=row.game_pk&&row.at_bat_number?`${row.game_pk}:${row.at_bat_number}`:`row-${i}`;const prev=unique.get(key);if(!prev||Number(row.pitch_number||0)>=Number(prev.pitch_number||0))unique.set(key,row);}
  for(const row of unique.values()){
    const event=String(row.events||'').trim().toLowerCase();
    if(!PA_EVENTS.has(event))continue;
    if(playerId && Number(row[perspective==='pitcher'?'pitcher':'batter'])!==Number(playerId))continue;
    const hand=String(row[perspective==='pitcher'?'stand':'p_throws']||'').trim().toUpperCase();
    if(hand!=='L'&&hand!=='R')missingHand++;
    terminalRows++;
    for(const a of [groups.ALL,...(groups[hand]?[groups[hand]]:[])]){
      a.pa++;
      if(!AB_EXCLUSIONS.has(event)) a.ab++;
      if(event in HITS){a.h++;a.totalBases+=HITS[event];a[{single:'single',double:'double',triple:'triple',home_run:'hr'}[event]]++}
      if(BB_EVENTS.has(event))a.bb++;if(event==='intent_walk')a.ibb++;
      if(event==='hit_by_pitch')a.hbp++;
      if(K_EVENTS.has(event))a.so++;
      if(SF_EVENTS.has(event))a.sf++;
      const den=val(row,'woba_denom');
      if(den===null)a.missingDen++;
      const woba=val(row,'woba_value');
      const expected=val(row,'estimated_woba_using_speedangle');
      if(den!=null&&den>0){
        a.wobaDenominator+=den;
        if(woba!=null){a.wobaNumerator+=woba;a.wobaCoveredDenominator+=den;}
        if(NON_CONTACT.has(event)){
          if(woba!=null){a.xwobaNumerator+=woba;a.xwobaCoveredDenominator+=den}
          else a.xwobaMissing+=den;
        }else if(expected!=null){
          a.xwobaNumerator+=expected;a.xwobaCoveredDenominator+=den;
        }else a.xwobaMissing+=den;
      }
      const code=val(row,'launch_speed_angle');if(code!==null){a.barrelN++;if(code===6)a.barrels++;}
      const ev=val(row,'launch_speed');
      if(ev!=null){a.bip++;a.evSum+=ev;a.evN++;if(ev>=95)a.hardHit++}
    }
  }
  for(const group of Object.values(groups)){
    const a=group;
    a.avg=a.ab?round(a.h/a.ab):null;
    a.obp=(a.ab+a.bb+a.hbp+a.sf)?round((a.h+a.bb+a.hbp)/(a.ab+a.bb+a.hbp+a.sf)):null;
    a.ops=a.obp!==null&&a.ab?round(a.obp+a.totalBases/a.ab):null;
    a.slg=a.ab?round(a.totalBases/a.ab):null;
    a.woba=!a.missingDen&&a.wobaDenominator&&a.wobaCoveredDenominator>=a.wobaDenominator?round(a.wobaNumerator/a.wobaDenominator):null;
    a.coverage=!a.missingDen&&a.wobaDenominator?round(a.xwobaCoveredDenominator/a.wobaDenominator,4):null;
    // Never treat a missing expected contribution as zero.
    a.coveredXwoba=a.xwobaCoveredDenominator?round(a.xwobaNumerator/a.xwobaCoveredDenominator):null;
    a.xwoba=!a.missingDen&&a.wobaDenominator&&a.xwobaCoveredDenominator>=a.wobaDenominator?round(a.xwobaNumerator/a.wobaDenominator):null;
    a.hardHitPct=a.bip?round(100*a.hardHit/a.bip,1):null;
    a.barrelPct=a.barrelN?round(100*a.barrels/a.barrelN,1):null;
    a.avgEV=a.evN?round(a.evSum/a.evN,1):null;
    delete a.wobaNumerator;delete a.xwobaNumerator;delete a.evSum;
  }
  return {splits:groups,terminalRows,missingHand,
    methodology:'Statcast terminal events only; opponent hand (p_throws for batters, stand for pitchers). wOBA=sum(woba_value)/sum(woba_denom). xwOBA=(estimated_woba_using_speedangle on tracked contact + outcome woba_value for BB/HBP/K)/sum(woba_denom). Suppressed unless all weighted denominator contributions are covered.',
    note:'Savant event-based aggregates may differ slightly from official season leaderboards due to missing tracking, corrections or Statcast model updates.'};
}
export function makeStatcastPlayerURL(year,id,perspective='batter') {
  validSeason(year);validPlayerId(id);
  const url=new URL('https://baseballsavant.mlb.com/statcast_search/csv');
  const q={all:'true',type:'details',player_type:perspective,hfGT:'R|',hfSea:`${year}|`,
    game_date_gt:`${year}-03-01`,game_date_lt:`${year}-12-01`,
    min_pitches:'0',min_results:'0',group_by:'name',sort_col:'pitches',sort_order:'desc'};
  for(const [k,v]of Object.entries(q))url.searchParams.set(k,v);
  url.searchParams.append(perspective==='pitcher'?'pitchers_lookup[]':'batters_lookup[]',String(id));
  return url;
}

/** Full pitch + terminal-event summary for imported official Savant CSV. */
export function calculateDetailedCSV(rows,options={}){
 let inferredDenominators=0,inferredActualValues=0;
 const season=Number(options.season),weights=WEIGHTS[season];
 if(weights)rows=rows.map(row=>{const e=String(row.events??'');if(!PA_EVENTS.has(e))return row;const x={...row};if(number(x.woba_denom)===null){x.woba_denom=['intent_walk','sac_bunt','sac_bunt_double_play','catcher_interf'].includes(e)?'0':'1';inferredDenominators++;}if(number(x.woba_value)===null){const values={walk:weights[0],hit_by_pitch:weights[1],single:weights[2],double:weights[3],triple:weights[4],home_run:weights[5]};x.woba_value=String(values[e]??0);inferredActualValues++;}return x;});
 const base=calculateSplits(rows,options),group={ALL:[],L:[],R:[]},perspective=options.perspective??'batter';
 const unique=new Map();for(let i=0;i<rows.length;i++){const x=rows[i];if(options.playerId&&Number(x[perspective==='pitcher'?'pitcher':'batter'])!==Number(options.playerId))continue;const key=x.game_pk&&x.at_bat_number&&x.pitch_number?`${x.game_pk}:${x.at_bat_number}:${x.pitch_number}`:`row-${i}`;unique.set(key,x);}
 for(const x of unique.values()){const hand=String(x[perspective==='pitcher'?'stand':'p_throws']??'').trim().toUpperCase();group.ALL.push(x);if(group[hand])group[hand].push(x);}
 const swingTypes=new Set(['swinging_strike','swinging_strike_blocked','missed_bunt','foul','foul_tip','foul_bunt','bunt_foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score']),missTypes=new Set(['swinging_strike','swinging_strike_blocked','missed_bunt']);
 for(const [key,items] of Object.entries(group)){
 const s=base.splits[key];s.b2=s.double;s.b3=s.triple;if(weights){s.csvEventWoba=s.woba;s.woba=round(weightedWoba({atBats:s.ab,hits:s.h,doubles:s.double,triples:s.triple,homeRuns:s.hr,baseOnBalls:s.bb,intentionalWalks:s.ibb,hitByPitch:s.hbp,sacFlies:s.sf},season));}
 const terminal=items.filter(x=>PA_EVENTS.has(String(x.events??''))),ev=terminal.map(x=>number(x.launch_speed)).filter(x=>x!==null),angles=terminal.map(x=>number(x.launch_angle)).filter(x=>x!==null),classification=terminal.filter(x=>number(x.launch_speed_angle)!==null),bb=terminal.filter(x=>['ground_ball','line_drive','fly_ball','popup'].includes(x.bb_type));
 const pitches=items.filter(x=>!String(x.description??'').startsWith('automatic_')&&(String(x.pitch_type??'').trim()||['B','S','X'].includes(x.type))),swings=pitches.filter(x=>swingTypes.has(x.description)),misses=swings.filter(x=>missTypes.has(x.description)),zoned=pitches.filter(x=>(number(x.zone)>=1&&number(x.zone)<=9)||(number(x.zone)>=11&&number(x.zone)<=14)),inside=zoned.filter(x=>Number(x.zone)<=9),outside=zoned.filter(x=>Number(x.zone)>9);
 s.pN=pitches.length;s.swings=swings.length;s.misses=misses.length;s.swingPct=pitches.length?round(100*swings.length/pitches.length,2):null;s.whiffPct=swings.length?round(100*misses.length/swings.length,2):null;s.contactPct=swings.length?round(100*(swings.length-misses.length)/swings.length,2):null;
 s.zoneN=zoned.length;s.zonePct=zoned.length?round(100*inside.length/zoned.length,2):null;s.oSwingPct=outside.length?round(100*outside.filter(x=>swingTypes.has(x.description)).length/outside.length,2):null;s.zSwingPct=inside.length?round(100*inside.filter(x=>swingTypes.has(x.description)).length/inside.length,2):null;
 s.bbe=ev.length;s.ev=s.avgEV;s.hardhit=s.hardHitPct;s.barrel=classification.length?round(100*classification.filter(x=>Number(x.launch_speed_angle)===6).length/classification.length,2):null;s.maxEV=ev.length?Math.max(...ev):null;s.la=angles.length?round(angles.reduce((a,b)=>a+b,0)/angles.length,2):null;s.sweetspot=angles.length?round(100*angles.filter(x=>x>=8&&x<=32).length/angles.length,2):null;s.adjustedEV=ev.length?round(ev.reduce((a,b)=>a+Math.max(88,b),0)/ev.length,2):null;
 const sorted=[...ev].sort((a,b)=>a-b),half=perspective==='pitcher'?sorted.slice(0,Math.ceil(sorted.length/2)):sorted.slice(Math.floor(sorted.length/2));s.ev50=half.length?round(half.reduce((a,b)=>a+b,0)/half.length,2):null;
 for(const [field,kind] of [['gbPct','ground_ball'],['ldPct','line_drive'],['fbPct','fly_ball'],['popPct','popup']])s[field]=bb.length?round(100*bb.filter(x=>x.bb_type===kind).length/bb.length,2):null;
 const abs=terminal.filter(x=>!AB_EXCLUSIONS.has(x.events)),ks=abs.filter(x=>K_EVENTS.has(x.events)),contact=abs.filter(x=>!K_EVENTS.has(x.events));s.xba=abs.length&&contact.every(x=>number(x.estimated_ba_using_speedangle)!==null)?round(contact.reduce((a,x)=>a+number(x.estimated_ba_using_speedangle),0)/abs.length):null;s.xwobaCoverage=s.coverage!==null?round(s.coverage*100,1):null;const covered=contact.filter(x=>number(x.estimated_ba_using_speedangle)!==null),xbaDen=ks.length+covered.length;s.xbaCoverage=abs.length?round(100*xbaDen/abs.length,1):null;s.coveredXBA=xbaDen?round(covered.reduce((a,x)=>a+number(x.estimated_ba_using_speedangle),0)/xbaDen):null;
 }
 return {...base,inferredDenominators,inferredActualValues,methodology:base.methodology+' Detailed pitch rates use descriptions and the official zone field; unknown tracking is excluded from each tracked denominator.'};
}
