import {num,r,weightedWoba,normalizePlayer} from './baseball.mjs';
export const ALIASES={gamesPlayed:'g',gamesStarted:'gs',atBats:'ab',plateAppearances:'pa',battersFaced:'pa',hits:'h',runs:'r',doubles:'b2',triples:'b3',homeRuns:'hr',rbi:'rbi',baseOnBalls:'bb',strikeOuts:'so',intentionalWalks:'ibb',hitByPitch:'hbp',hitBatsmen:'hbp',stolenBases:'sb',caughtStealing:'cs',sacFlies:'sf',sacBunts:'sh',totalBases:'tb',numberOfPitches:'pitches',groundIntoDoublePlay:'gdp',gidp:'gdp',earnedRuns:'er',wins:'w',losses:'l',saves:'sv',holds:'hld',blownSaves:'bs',completeGames:'cg',shutouts:'sho',inningsPitched:'ip',strikeoutsPer9Inn:'k9',strikeoutsPer9:'k9',walksPer9Inn:'bb9',baseOnBallsPer9:'bb9',hitsPer9Inn:'h9',hitsPer9:'h9',homeRunsPer9:'hr9',homeRunsPer9Inn:'hr9',strikeoutWalkRatio:'kbb',strikesoutsToWalks:'kbb',pitchesPerPlateAppearance:'pPA',pitchesPerInning:'pIP',wRcPlus:'wrcPlus',wRaa:'wraa',wRc:'wrc',baseRunning:'bsr',batting:'battingRuns',fielding:'fieldingRuns',positional:'positionRuns',replacement:'replacementRuns',wLeague:'leagueRuns',wSb:'wsb',wGdp:'wgdp',ra9War:'ra9war',inheritedRunners:'ir',inheritedRunnersScored:'irs',bequeathedRunners:'bqr',bequeathedRunnersScored:'bqrs',qualityStarts:'qs',gamesFinished:'gf',extraBaseHits:'xbh',fieldingRunsPrevented:'frp',totalOutsAboveAverage:'oaa'};
export function statFields(stat={}){const out={};for(const [key,value] of Object.entries(stat)){if(value===null||typeof value==='object')continue;const k=ALIASES[key]??key;if(k==='ip'||key==='innings'){out[k]=String(value);continue;}out[k]=num(value);}return out;}
export function enrich(base,standard={},advanced={},saber={},metrics={}){
 const p={...statFields(standard),...statFields(advanced),...statFields(saber),...base};
 // The explicit source sabermetric values retain their own identity, including WAR.
 Object.assign(p,statFields(saber));delete p.woba;if(base.woba!==null&&base.woba!==undefined)p.woba=base.woba;else p.woba=weightedWoba(standard,base.season);
 for(const [k,v] of Object.entries(statFields(advanced)))if(!['age'].includes(k)&&p[k]===undefined)p[k]=v;
 p.b2=num(standard.doubles)??p.b2??null;p.b3=num(standard.triples)??p.b3??null;p.r=num(standard.runs)??p.r??null;p.age=num(advanced.age??standard.age)??null;
 const pa=p.pa,outs=num(standard.outs),ip=outs!==null?outs/3:p.ip?parseInt(p.ip)+Number(String(p.ip).split('.')[1]||0)/3:0;
 if(pa){p.kPct=num(p.so)!==null?r(100*p.so/pa,2):null;p.bbPct=num(p.bb)!==null?r(100*p.bb/pa,2):null;p.kbbPct=p.kPct!==null&&p.bbPct!==null?r(p.kPct-p.bbPct,2):null;p.hrPct=num(p.hr)!==null?r(100*p.hr/pa,2):null;}
 if(ip>0){if(p.k9===null||p.k9===undefined)p.k9=r(9*p.so/ip,2);if(p.bb9===null||p.bb9===undefined)p.bb9=r(9*p.bb/ip,2);if(p.hr9===null||p.hr9===undefined)p.hr9=r(9*p.hr/ip,2);}
 const swings=num(advanced.totalSwings),misses=num(advanced.swingAndMisses),pitches=num(standard.numberOfPitches??advanced.numberOfPitches);
 if(swings>0&&misses!==null){p.whiffPct=r(100*misses/swings,2);p.contactPct=r(100*(swings-misses)/swings,2);}
 if(pitches>0&&swings!==null)p.swingPct=r(100*swings/pitches,2);
 const contact=['ground','line','fly','pop'].map(k=>(num(advanced[k+'Hits'])??0)+(num(advanced[k+'Outs'])??0)),den=contact.reduce((a,b)=>a+b,0);
 if(den>0){p.gbPct=r(contact[0]/den*100,2);p.ldPct=r(contact[1]/den*100,2);p.fbPct=r(contact[2]/den*100,2);p.popPct=r(contact[3]/den*100,2);p.outcomeBBE=den;}
 if(p.ir>0)p.irsPct=r(100*p.irs/p.ir,2);if(p.bqr>0)p.bqrsPct=r(100*p.bqrs/p.bqr,2);
 if(p.sb+p.cs>0)p.sbPct=r(100*p.sb/(p.sb+p.cs),2);
 if(metrics.launchSpeed){const m=metrics.launchSpeed;p.ev=num(m.averageValue);p.maxEV=num(m.maxValue);p.bbe=num(m.occurrences);}
 if(metrics.launchAngle)p.la=num(metrics.launchAngle.averageValue);
 if(metrics.barreledBall)p.barrel=num(metrics.barreledBall.averageValue)!==null?r(100*Number(metrics.barreledBall.averageValue),1):null;
 if(metrics.releaseSpeed)p.velocity=num(metrics.releaseSpeed.averageValue);
 if(metrics.releaseSpinRate)p.spin=num(metrics.releaseSpinRate.averageValue);
 if(metrics.releaseExtension)p.extension=num(metrics.releaseExtension.averageValue);
 return p;
}
export function rowsFromStats(payload,year,kind,options={}){
 const group=kind==='pitching'?'pitching':'hitting',map=new Map();
 for(const block of payload.stats??[]){if(block.group?.displayName!==group)continue;for(const x of block.splits??[]){if(x.sport?.id&&x.sport.id!==1)continue;if(options.hand&&x.split?.code!==options.hand)continue;if(!x.player?.id)continue;const key=x.player.id;if(!map.has(key))map.set(key,{x,standard:{},advanced:{},saber:{}});const v=map.get(key),type=block.type?.displayName;
 if(['season','statSplits','gameLog'].includes(type)){v.standard={...v.standard,...x.stat};v.x=x;}else if(type==='sabermetrics')v.saber={...v.saber,...x.stat};else v.advanced={...v.advanced,...x.stat};}}
 return [...map.values()].map(v=>enrich(normalizePlayer({...v.x,stat:v.standard},year,kind),v.standard,v.advanced,v.saber));
}
export const PA_EVENTS=new Set(['single','double','triple','home_run','field_out','force_out','grounded_into_double_play','double_play','triple_play','fielders_choice','fielders_choice_out','field_error','other_out','sac_fly','sac_fly_double_play','sac_bunt','sac_bunt_double_play','walk','intent_walk','hit_by_pitch','strikeout','strikeout_double_play','catcher_interf']);
const excludeAB=new Set(['walk','intent_walk','hit_by_pitch','sac_fly','sac_fly_double_play','sac_bunt','sac_bunt_double_play','catcher_interf']);
export function eventStats(plays){const s={atBats:0,plateAppearances:0,hits:0,doubles:0,triples:0,homeRuns:0,baseOnBalls:0,intentionalWalks:0,strikeOuts:0,hitByPitch:0,sacFlies:0,sacBunts:0,totalBases:0};for(const p of plays){const e=p.result?.eventType??p.event;if(!PA_EVENTS.has(e))continue;s.plateAppearances++;if(!excludeAB.has(e))s.atBats++;const b={single:1,double:2,triple:3,home_run:4}[e];if(b){s.hits++;s.totalBases+=b;if(b===2)s.doubles++;if(b===3)s.triples++;if(b===4)s.homeRuns++;}if(['walk','intent_walk'].includes(e))s.baseOnBalls++;if(e==='intent_walk')s.intentionalWalks++;if(e.startsWith('strikeout'))s.strikeOuts++;if(e==='hit_by_pitch')s.hitByPitch++;if(e.startsWith('sac_fly'))s.sacFlies++;if(e.startsWith('sac_bunt'))s.sacBunts++;}
 s.avg=s.atBats?s.hits/s.atBats:null;const obden=s.atBats+s.baseOnBalls+s.hitByPitch+s.sacFlies;s.obp=obden?(s.hits+s.baseOnBalls+s.hitByPitch)/obden:null;s.slg=s.atBats?s.totalBases/s.atBats:null;s.ops=s.obp!==null&&s.slg!==null?s.obp+s.slg:null;return s;}
export function contactSummary(records){const ev=records.map(x=>num(x.ev)).filter(x=>x!==null),la=records.map(x=>num(x.la)).filter(x=>x!==null),sorted=[...ev].sort((a,b)=>a-b),half=sorted.slice(Math.floor(sorted.length/2));return {bbe:records.length,trackedEV:ev.length,ev:ev.length?r(ev.reduce((a,b)=>a+b,0)/ev.length,2):null,maxEV:ev.length?Math.max(...ev):null,hardhit:ev.length?r(100*ev.filter(x=>x>=95).length/ev.length,2):null,la:la.length?r(la.reduce((a,b)=>a+b,0)/la.length,2):null,sweetspot:la.length?r(100*la.filter(x=>x>=8&&x<=32).length/la.length,2):null,adjustedEV:ev.length?r(ev.reduce((a,b)=>a+Math.max(88,b),0)/ev.length,2):null,ev50:half.length?r(half.reduce((a,b)=>a+b,0)/half.length,2):null};}
