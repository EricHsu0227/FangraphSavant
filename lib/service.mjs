import {gunzipSync} from 'node:zlib';
import historicalPacked from './data/seasons-history.json' with {type:'json'};
import historicalCoverage from './data/history-coverage.json' with {type:'json'};
import seasons from './data/seasons.json' with {type:'json'};
import verifiedPlayers from './data/verified-players.json' with {type:'json'};
import {YEARS,num,r,normalizePlayer,expectedMap,weightedWoba,groupSeries} from './baseball.mjs';
import {parseCSV,calculateSplits,makeStatcastPlayerURL} from './statcast.mjs';
const memory=new Map(),pending=new Map();
export async function mlb(path,seconds=25){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),seconds*1000);
 try {const res=await fetch('https://statsapi.mlb.com/api/v1/'+path,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});if(!res.ok)throw new Error('MLB returned HTTP '+res.status);return await res.json();}finally{clearTimeout(timer);}
}
async function cached(key,fn){const old=memory.get(key);if(old&&Date.now()-old.at<3600000)return old.value;if(pending.has(key))return pending.get(key);const p=fn().catch(error=>{const match=key.match(/^(person|contact)-(\d+)-(\d+)-(batting|pitching)$/);const fallback=match&&verifiedPlayers[`${match[2]}-${match[3]}-${match[4]}-${match[1]}`];if(fallback)return {...fallback,warning:'Live source unavailable; showing verified saved player data.',fallback:true};throw error;}).then(value=>{if(memory.size>=32)memory.delete(memory.keys().next().value);memory.set(key,{at:Date.now(),value});return value;}).finally(()=>pending.delete(key));pending.set(key,p);return p;}
const historicalCache=new Map();
export function getSeason(year){if(seasons[year])return seasons[year];if(historicalCache.has(year))return historicalCache.get(year);if(!historicalPacked[year])return undefined;const value=JSON.parse(gunzipSync(Buffer.from(historicalPacked[year],'base64')).toString('utf8'));if(historicalCache.size>=2)historicalCache.delete(historicalCache.keys().next().value);historicalCache.set(year,value);return value;}
export const seasonCoverage={...Object.fromEntries(historicalCoverage.seasons.map(x=>[x.year,{batting:x.batting,pitching:x.pitching,expected:x.battingXwoba}])),...Object.fromEntries(Object.entries(seasons).map(([y,x])=>[y,{batting:x.batting.length,pitching:x.pitching.length,expected:x.batting.filter(p=>p.xwoba!==null).length}]))};
function slim(s){const clean=rows=>rows.map(({raw,...p})=>p);return {...s,coverage:seasonCoverage,batting:clean(s.batting),pitching:clean(s.pitching)};}
async function refreshSeason(year){
 const old=getSeason(year);
 const [h,p,eh,ep,st,sch]=await Promise.allSettled(['hitting','pitching'].map(group=>mlb(`stats?stats=season&group=${group}&season=${year}&sportIds=1&sportId=1&playerPool=ALL&limit=5000&gameType=R`)).concat(['hitting','pitching'].map(group=>mlb(`stats?stats=expectedStatistics&group=${group}&season=${year}&sportIds=1&sportId=1&playerPool=ALL&limit=5000&gameType=R`)),mlb(`standings?leagueId=103,104&season=${year}&standingsTypes=regularSeason&hydrate=team`),mlb(`schedule?sportId=1&startDate=${year}-09-01&endDate=${year}-12-01&gameTypes=F,D,L,W`)));
 const out={...old,mode:'live',updated:new Date().toISOString(),warnings:[]};
 for(const [kind,res,exp] of [['batting',h,eh],['pitching',p,ep]]){
  if(res.status==='fulfilled'&&res.value.stats?.[0]?.splits?.length){const map=exp.status==='fulfilled'?expectedMap(exp.value):{};const seen=new Set();out[kind]=res.value.stats[0].splits.filter(x=>(!x.sport?.id||x.sport.id===1)&&!seen.has(x.player.id)&&seen.add(x.player.id)).map(x=>normalizePlayer(x,year,kind,map));if(exp.status==='rejected')out.warnings.push(kind+' expected stats unavailable');}
  else {out.warnings.push(kind+' uses saved snapshot');out.mode='partial';}
 }
 if(st.status==='fulfilled')out.standings=st.value.records??old.standings;
 if(sch.status==='fulfilled')out.series=groupSeries(sch.value);
 return slim(out);
}
export async function playerData(id,year,kind='batting'){
 return cached(`person-${id}-${year}-${kind}`,async()=>{
 const group=kind==='pitching'?'pitching':'hitting';
 const results=await Promise.allSettled([mlb(`people/${id}`),mlb(`people/${id}/stats?stats=statSplits&group=${group}&season=${year}&sitCodes=vl,vr,h,a&gameType=R&sportIds=1`)]);
 const bio=results[0].status==='fulfilled'?results[0].value.people?.[0]:null;
 const history=YEARS.map(y=>getSeason(y)[kind].find(x=>x.id===id)).filter(Boolean).map(({raw,...x})=>x);
 const current=getSeason(year)[kind].find(x=>x.id===id),splits=[];
 if(current)splits.push({...current,code:'all',label:'Overall'});
 if(results[1].status==='fulfilled')for(const x of results[1].value.stats?.[0]?.splits??[]){splits.push({...normalizePlayer(x,year,kind),code:x.split?.code,label:x.split?.description??x.split?.code,xwoba:null});}
 return {id,year,kind,bio,history,splits,updated:new Date().toISOString(),warning:results[1].status==='rejected'?'MLB handedness splits are temporarily unavailable.':null,source:'MLB Stats API. Split wOBA calculated with FanGraphs seasonal weights; xwOBA split is unavailable from this endpoint.'};
 });
}
export function summarizeContact(records){
 const groups={ALL:[],L:[],R:[],home:[],away:[]};
 for(const x of records){groups.ALL.push(x);if(groups[x.hand])groups[x.hand].push(x);if(x.home===true)groups.home.push(x);if(x.home===false)groups.away.push(x);}
 return Object.fromEntries(Object.entries(groups).map(([key,rows])=>{const ev=rows.filter(x=>x.ev!==null),br=rows.filter(x=>x.barrel!==null);return [key,{bbe:rows.length,trackedEV:ev.length,ev:ev.length?r(ev.reduce((a,x)=>a+x.ev,0)/ev.length,1):null,hardhit:ev.length?r(100*ev.filter(x=>x.ev>=95).length/ev.length,1):null,barrel:br.length?r(100*br.filter(x=>x.barrel>=1).length/br.length,1):null,trackedBarrel:br.length}];}));
}
export async function contactData(id,year,kind='batting'){
 return cached(`contact-${id}-${year}-${kind}`,async()=>{
 const group=kind==='pitching'?'pitching':'hitting';
 const fields='stats,type,displayName,splits,season,date,stat,metric,name,value,event,details,type,code,description,playId,player,id,fullName,pitcher,batter,gameType,battingTeam,fieldingTeam,game,gamePk,teams,home,away,team';
 const data=await mlb(`people/${id}/stats?stats=metricLog&group=${group}&season=${year}&metrics=launchSpeed,launchAngle,barreledBall&limit=5000&gameType=R&fields=${fields}`,35);
 const allLogs=(data.stats??[]).flatMap(x=>x.splits??[]);
 const contactEvents=new Set(['single','double','triple','home_run','field_out','force_out','grounded_into_double_play','double_play','triple_play','fielders_choice','fielders_choice_out','field_error','error','sac_fly','sac_fly_double_play','sac_bunt','sac_bunt_double_play']);
 const logs=allLogs.filter(x=>x.gameType==='R'&&Number(x.season)===year&&Number(x[kind==='pitching'?'pitcher':'batter']?.id)===id&&contactEvents.has(x.stat?.event?.details?.event));
 const aggregateBarrels=allLogs.find(x=>x.stat?.metric?.name==='barreledBall'&&!x.stat?.event?.playId)?.stat?.metric?.value;
 const averages=await mlb(`people/${id}/stats?stats=metricAverages&group=${group}&season=${year}&metrics=barreledBall&gameType=R`,20).catch(()=>null);
 const barrelAverage=averages?.stats?.flatMap(x=>x.splits??[]).find(x=>x.stat?.metric?.name==='barreledBall');
 const barrelDen=num(barrelAverage?.numOccurrences),barrelRate=barrelDen?num(aggregateBarrels)!==null?r(100*num(aggregateBarrels)/barrelDen,1):num(barrelAverage?.stat?.metric?.averageValue)!==null?r(100*num(barrelAverage.stat.metric.averageValue),1):null:null;
 const events=new Map();
 for(const x of logs){const s=x.stat,key=s?.event?.playId;if(!key)continue;if(!events.has(key))events.set(key,{key,date:x.date,ev:null,la:null,barrel:null,event:s.event.details?.event??'',pitchType:s.event.details?.type?.description??'Unknown',opponent:kind==='pitching'?x.batter?.id:x.pitcher?.id,home:kind==='pitching'?x.game?.teams?.home?.team?.id===x.fieldingTeam?.id:x.game?.teams?.home?.team?.id===x.battingTeam?.id,gamePk:x.game?.gamePk});const v=num(s.metric?.value),row=events.get(key);if(s.metric?.name==='launchSpeed')row.ev=v;if(s.metric?.name==='launchAngle')row.la=v;if(s.metric?.name==='barreledBall')row.barrel=v;}
 const records=[...events.values()];const ids=[...new Set(records.map(x=>x.opponent).filter(Boolean))],hands={};
 const batches=[];for(let i=0;i<ids.length;i+=100)batches.push(ids.slice(i,i+100));
 const meta=await Promise.allSettled(batches.map(b=>mlb(`people?personIds=${b.join(',')}&fields=people,id,pitchHand,batSide,code`,20)));
 for(const result of meta)if(result.status==='fulfilled')for(const p of result.value.people??[])hands[p.id]=kind==='pitching'?p.batSide?.code:p.pitchHand?.code;
 for(const x of records){x.hand=hands[x.opponent]??null;if(x.hand==='S')x.hand='S';}
 const summary=summarizeContact(records);if(barrelRate!==null){summary.ALL.barrel=barrelRate;summary.ALL.trackedBarrel=barrelDen;}
 return {id,year,kind,records:records.sort((a,b)=>a.date.localeCompare(b.date)),summary,barrelSource:barrelRate!==null?'Overall barrel rate from MLB metricAverages; per-event barrel labels unavailable.':null,updated:new Date().toISOString(),missingHand:records.filter(x=>!x.hand).length,source:'Statcast tracking via MLB Stats API metricLog · regular season',note:kind==='pitching'?'Opponent hand is listed batter side; switch hitters remain S.':'Opponent hand is pitcher throwing hand. Expected PA values are not supplied by this endpoint.'};
 });
}
export async function statcastData(id,year,kind){
 return cached(`csv-${id}-${year}-${kind}`,async()=>{
 const u=makeStatcastPlayerURL(year,id,kind==='pitching'?'pitcher':'batter');const res=await fetch(u,{signal:AbortSignal.timeout(45000),headers:{Accept:'text/csv'}});
 if(!res.ok)throw new Error('Baseball Savant CSV unavailable (HTTP '+res.status+'). MLB contact logs remain available. You can also import an official Statcast CSV.');
 const text=await res.text();if(text.length>10000000)throw new Error('CSV is too large. Import a smaller date range.');const rows=parseCSV(text);if(!rows.length||!('events' in rows[0]))throw new Error('Baseball Savant returned no usable pitch data.');
 return {id,year,kind,...calculateSplits(rows,{playerId:id,perspective:kind==='pitching'?'pitcher':'batter'}),source:'Baseball Savant pitch-level CSV',updated:new Date().toISOString()};
 });
}
export async function handleRequest(request){
 const u=new URL(request.url),view=u.searchParams.get('view')??'season',year=Number(u.searchParams.get('year')??2026),id=Number(u.searchParams.get('id')),kind=u.searchParams.get('kind')==='pitching'?'pitching':'batting';
 if(!YEARS.includes(year))return Response.json({error:'Choose a season from 2015–2026.'},{status:400});
 try{
 let data;
 if(view==='season')data=u.searchParams.get('refresh')==='1'?await cached(`refresh-${year}`,()=>refreshSeason(year)):slim({...getSeason(year),mode:'snapshot'});
 else if(['person','contact','statcast'].includes(view)){
  if(!Number.isInteger(id)||id<1||id>99999999)return Response.json({error:'Invalid MLB player ID'},{status:400});
  data=await (view==='person'?playerData(id,year,kind):view==='contact'?contactData(id,year,kind):statcastData(id,year,kind));
 }else if(view==='team'){
  if(!getSeason(year).teams.some(t=>t.id===id))return Response.json({error:'Unknown MLB team'},{status:400});
  const roster=await mlb(`teams/${id}/roster?rosterType=fullSeason&season=${year}`);data={id,year,roster:roster.roster??[]};
 }else if(view==='search'){
  const q=(u.searchParams.get('q')??'').trim();if(q.length<2)return Response.json({people:[]});data=await mlb(`people/search?names=${encodeURIComponent(q)}`);
 }else if(view==='game'){
  if(!Number.isInteger(id)||id<1)return Response.json({error:'Invalid game ID'},{status:400});data=await mlb(`game/${id}/boxscore`);
 }else return Response.json({error:'Unknown data view'},{status:404});
 return Response.json(data,{headers:{'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
 }catch(e){return Response.json({error:e.name==='TimeoutError'||e.name==='AbortError'?'The data source timed out. Please try again.':e.message??'Data temporarily unavailable.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
