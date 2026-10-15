import constants from './data/season-constants.json' with {type:'json'};
export const YEARS=Array.from({length:12},(_,i)=>2026-i);
// FanGraphs seasonal constants, retrieved 2026-10-15. https://www.fangraphs.com/tools/guts?type=cn
export const WEIGHTS=Object.fromEntries(Object.entries(constants.seasons).map(([year,x])=>[year,[x.wBB,x.wHBP,x.w1B,x.w2B,x.w3B,x.wHR]]));
export const num=v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
export const r=(v,d=3)=>v===null||!Number.isFinite(v)?null:Number(v.toFixed(d));
export function weightedWoba(s,year){
 const w=WEIGHTS[year];if(!w)return null;
 const h=num(s.hits),bb=num(s.baseOnBalls),hr=num(s.homeRuns),d=num(s.doubles),t=num(s.triples);
 if([h,bb,hr,d,t].some(x=>x===null))return null;
 const ibb=num(s.intentionalWalks)||0,hbp=num(s.hitByPitch??s.hitBatsmen)||0,sf=num(s.sacFlies)||0,sh=num(s.sacBunts)||0,ci=num(s.catchersInterference)||0;
 const ab=num(s.atBats)??((num(s.battersFaced)??0)-bb-hbp-sf-sh-ci);
 const den=ab+bb-ibb+hbp+sf;
 return den>0?r((w[0]*(bb-ibb)+w[1]*hbp+w[2]*(h-d-t-hr)+w[3]*d+w[4]*t+w[5]*hr)/den,6):null;
}
export function normalizePlayer(x,year,kind,expected={}){
 const s=x.stat??{},e=expected[x.player?.id]?.stat??{};
 const pa=num(s.plateAppearances??s.battersFaced),ab=num(s.atBats),so=num(s.strikeOuts),bb=num(s.baseOnBalls);
 return {id:x.player.id,name:x.player.fullName,season:year,kind,teamId:x.team?.id??null,team:x.team?.name??'Multiple teams',position:x.position?.abbreviation??x.player?.primaryPosition?.abbreviation??(kind==='pitching'?'P':'—'),league:x.league?.id??null,
 g:num(s.gamesPlayed),pa,ab,h:num(s.hits),hr:num(s.homeRuns),rbi:num(s.rbi),sb:num(s.stolenBases),bb,so,avg:num(s.avg),obp:num(s.obp),slg:num(s.slg),ops:num(s.ops),era:num(s.era),ip:s.inningsPitched??null,w:num(s.wins),l:num(s.losses),sv:num(s.saves),whip:num(s.whip),k9:num(s.strikeoutsPer9Inn),
 woba:weightedWoba(s,year),xwoba:num(e.woba),xavg:num(e.avg),xslg:num(e.slg),kPct:pa&&so!==null?r(100*so/pa,1):null,bbPct:pa&&bb!==null?r(100*bb/pa,1):null,iso:num(s.slg)!==null&&num(s.avg)!==null?r(num(s.slg)-num(s.avg)):null};
}
export function expectedMap(payload){
 const out={};for(const x of payload?.stats?.[0]?.splits??[]){if(x.sport?.id!==1||x.gameType!=='R')continue;out[x.player.id]=x;}return out;
}
export function groupSeries(payload){
 const groups=new Map();const names={F:'Wild Card',D:'Division Series',L:'Championship Series',W:'World Series'};
 for(const g of (payload?.dates??[]).flatMap(x=>x.games??[])){
  if(!names[g.gameType])continue;const a=g.teams?.away,h=g.teams?.home;if(!a?.team?.id||!h?.team?.id)continue;
  const ids=[a.team.id,h.team.id].sort((a,b)=>a-b),key=g.gameType+'-'+ids.join('-');
  if(!groups.has(key))groups.set(key,{key,type:g.gameType,stage:names[g.gameType],ids,teams:ids.map(id=>id===a.team.id?a.team:h.team),wins:[0,0],games:[]});
  const s=groups.get(key);s.games.push({id:g.gamePk,date:g.officialDate??g.gameDate.slice(0,10),away:a.team,home:h.team,awayScore:a.score??null,homeScore:h.score??null,status:g.status?.detailedState??'Scheduled',final:g.status?.abstractGameState==='Final',seriesGameNumber:g.seriesGameNumber,venue:g.venue?.name??null});
  if(g.status?.abstractGameState==='Final'&&!g.isTie){const winner=a.isWinner?a.team.id:h.isWinner?h.team.id:null;if(winner)s.wins[ids.indexOf(winner)]++;}
 }
 return [...groups.values()].map(s=>({...s,games:s.games.sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id)})).sort((a,b)=>'W L D F'.indexOf(a.type)-'W L D F'.indexOf(b.type));
}
