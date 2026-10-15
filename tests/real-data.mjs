import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getSeason,handleRequest,playerData,contactData} from '../lib/service.mjs';
import {weightedWoba} from '../lib/baseball.mjs';
const report={verifiedAt:new Date().toISOString(),checks:[],limits:[]};
for(let y=2021;y<=2026;y++){
 const s=getSeason(y);assert(s.batting.length>500);assert(s.pitching.length>500);assert.equal(s.teams.length,30);assert.equal(s.standings.flatMap(x=>x.teamRecords).length,30);
 const res=await handleRequest(new Request(`http://site/api/baseball?view=season&year=${y}`));assert.equal(res.status,200);const data=await res.json();assert.equal(data.year,y);assert(data.batting.some(p=>p.xwoba!==null));
 report.checks.push({page:'season',year:y,batters:s.batting.length,pitchers:s.pitching.length,expectedBatting:s.batting.filter(p=>p.xwoba!==null).length,expectedPitching:s.pitching.filter(p=>p.xwoba!==null).length,teams:s.teams.length,series:s.series.length});
}
const judge=getSeason(2024).batting.find(x=>x.id===592450);assert.equal(judge.avg,.322);assert.equal(judge.hr,58);assert.equal(judge.pa,704);assert.equal(judge.ops,1.159);assert(Math.abs(weightedWoba({hits:180,doubles:36,triples:1,homeRuns:58,baseOnBalls:133,intentionalWalks:20,hitByPitch:9,atBats:559,sacFlies:2},2024)-.475734)<.0001);assert.equal(judge.xwoba,.476);
const ws=getSeason(2024).series.find(s=>s.type==='W');assert(ws);assert.deepEqual([...ws.wins].sort(),[1,4]);assert.equal(ws.games.filter(g=>g.final).length,5);report.checks.push({page:'2024 World Series',teams:ws.teams.map(x=>x.name),wins:ws.wins,games:ws.games.length});
const invalid=await handleRequest(new Request('http://site/api/baseball?view=season&year=2014'));assert.equal(invalid.status,400);
const result=await Promise.allSettled([playerData(592450,2024),contactData(592450,2024),playerData(543037,2024,'pitching'),contactData(543037,2024,'pitching')]);
const fixtures={};
for(let i=0;i<result.length;i++){
 const r=result[i];if(r.status==='rejected'){report.limits.push({check:i,error:r.reason.message});continue;}
 const value=r.value;fixtures[(i<2?'592450-2024-batting':'543037-2024-pitching')+(i%2===0?'-person':'-contact')]=value;
 if(i%2===0){assert(value.bio?.fullName);assert(value.splits.some(s=>s.code==='vl'));assert(value.splits.some(s=>s.code==='vr'));assert(value.splits.filter(s=>s.code!=='all').every(s=>s.xwoba===null));if(i===0){assert.equal(value.splits.find(x=>x.code==='vl').pa+value.splits.find(x=>x.code==='vr').pa,704);}}
 else{assert(value.records.length>100);assert(value.summary.ALL.ev>70&&value.summary.ALL.ev<105);assert(value.summary.ALL.hardhit>10&&value.summary.ALL.hardhit<85);if(i===1)assert(value.summary.ALL.ev>96&&value.summary.ALL.ev<97);if(i===3){assert(value.records.length<300);assert(value.summary.ALL.ev>85&&value.summary.ALL.ev<95);}assert(value.records.every(x=>!['foul','foul_bunt','swinging_strike'].includes(x.event)));assert.equal(value.records.filter(x=>x.ev!==null).length,value.summary.ALL.trackedEV);}
 report.checks.push({page:i%2===0?'player':'Statcast contact',player:value.id,summary:value.summary??{history:value.history.length,splits:value.splits.map(s=>({split:s.code,pa:s.pa,avg:s.avg,woba:s.woba}))}});
 console.log('VERIFIED',i,value.id,i%2===0?value.bio?.fullName:value.summary.ALL);
}
report.limits.push('Direct Baseball Savant CSV returned HTTP 403 during source checks. MLB metric logs and local CSV import remain available.');report.limits.push('No browser-control skill is available in this managed environment, so interactive browser QA was not run.');report.limits.push('MLB expectedStatistics can have a different model vintage than current Savant leaderboards.');
fs.writeFileSync('lib/data/verified-players.json',JSON.stringify(fixtures));fs.writeFileSync('.sites-runtime/validation-report.json',JSON.stringify(report,null,2));
assert.equal(report.checks.filter(c=>c.page==='player').length,2);assert.equal(report.checks.filter(c=>c.page==='Statcast contact').length,2);
console.log(JSON.stringify(report,null,2));
