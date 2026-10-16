// Replay payloads deliberately exclude dates, season statistics, final linescores and future summaries.
const person=p=>({id:p?.id,name:p?.fullName??'Unknown player'});
export function buildReplay(feed){
 const plays=feed.liveData?.plays?.allPlays??[];
 if(feed.gameData?.status?.abstractGameState!=='Final'||!plays.length)throw Error('A complete game feed is not available.');
 const frames=[];let away=0,home=0,outs=0,half='',bases={};
 for(const p of plays){
  const nextHalf=String(p.about.inning)+p.about.halfInning;if(nextHalf!==half){half=nextHalf;outs=0;bases={};}
  const common={inning:p.about.inning,top:p.about.isTopInning,batter:person(p.matchup?.batter),pitcher:person(p.matchup?.pitcher),batSide:p.matchup?.batSide?.code,pitchHand:p.matchup?.pitchHand?.code,pa:p.atBatIndex};
  // Automatic runners are represented by explicit movement events when reported.
  const emit=(x)=>frames.push({...common,away,home,outs,bases:{...bases},...x});
  emit({kind:'start',text:'New plate appearance',balls:0,strikes:0,pitches:[]});
  let pitches=[];
  for(const e of p.playEvents??[]){
   const moves=(p.runners??[]).filter(r=>r.details?.playIndex===e.index);
   // Apply movement simultaneously: never overwrite another runner before removing starts.
   for(const r of moves)if(r.movement?.start)delete bases[r.movement.start];
   for(const r of moves){const m=r.movement??{};if(m.end==='score'&&!m.isOut){if(common.top)away++;else home++;}else if(!m.isOut&&['1B','2B','3B'].includes(m.end))bases[m.end]=r.details?.runner?.fullName??'Runner';}
   outs=e.count?.outs??outs;
   if(e.isPitch){const d=e.details??{},pd=e.pitchData??{};pitches=[...pitches,{number:e.pitchNumber,index:e.index,type:d.type?.description,code:d.type?.code,description:d.description,callCode:d.call?.code,isBall:d.isBall,isStrike:d.isStrike,isInPlay:d.isInPlay,isOut:d.isOut,trailColor:d.trailColor,velocity:pd.startSpeed,spin:pd.breaks?.spinRate,x:pd.coordinates?.pX,z:pd.coordinates?.pZ,top:pd.strikeZoneTop,bottom:pd.strikeZoneBottom,zoneWidth:pd.strikeZoneWidth,balls:e.count?.balls,strikes:e.count?.strikes,ev:e.hitData?.launchSpeed,la:e.hitData?.launchAngle,distance:e.hitData?.totalDistance}];}
   // Retain baseball actions; omit administrative notices that can contain calendar details.
   const action=!e.isPitch&&/pickoff|stolen_base|caught_stealing|wild_pitch|passed_ball|balk|runner_placed|defensive_substitution|pitching_substitution|offensive_substitution/.test(e.details?.eventType??'');
   if(e.isPitch||action)emit({kind:e.isPitch?'pitch':'action',text:e.details?.description??'Game action',balls:e.count?.balls??0,strikes:e.count?.strikes??0,pitches:[...pitches]});
  }
  away=p.result?.awayScore??away;home=p.result?.homeScore??home;outs=p.count?.outs??outs;
  emit({kind:'result',text:p.result?.description??p.result?.event??'Play complete',event:p.result?.event,eventType:p.result?.eventType,balls:p.count?.balls??0,strikes:p.count?.strikes??0,pitches:[...pitches]});
 }
 const team=t=>({id:t?.id,name:t?.name??'Team',abbreviation:t?.abbreviation??'MLB'});
 return {id:feed.gamePk,away:team(feed.gameData.teams.away),home:team(feed.gameData.teams.home),frames};
}
export function replayAt(replay,cursor){const index=Math.max(0,Math.min(replay.frames.length-1,Number.isFinite(cursor)?Math.floor(cursor):0)),frame=replay.frames[index];return {index,frame,finished:index===replay.frames.length-1,history:replay.frames.slice(0,index+1).filter(f=>f.kind==='result')};}
export function nextReplayPlay(frames,cursor){const next=frames.findIndex((f,i)=>i>cursor&&f.kind==='result');return next<0?frames.length-1:next;}
async function json(url){const c=new AbortController(),timer=setTimeout(()=>c.abort(),25000);try{const r=await fetch(url,{signal:c.signal,cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw Error('The MLB source is temporarily unavailable.');return await r.json();}finally{clearTimeout(timer);}}
export async function replayFeed(id){return json(`https://statsapi.mlb.com/api/v1.1/game/${id}/feed/live`);}
const random=n=>crypto.getRandomValues(new Uint32Array(1))[0]%n;
export async function mysteryReplay(){
 const today=new Date(),latest=Math.min(2026,today.getUTCFullYear());
 for(let attempt=0;attempt<4;attempt++){
  const year=2015+random(latest-2015+1),month=4+random(6),day=1+random(27),date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if(new Date(date)>=today)continue;
  const schedule=await json(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`),games=(schedule.dates??[]).flatMap(d=>d.games??[]).filter(g=>g.status?.abstractGameState==='Final'&&g.gameType==='R');
  if(games.length){const feed=await replayFeed(games[random(games.length)].gamePk);if(feed.liveData?.plays?.allPlays?.length)return buildReplay(feed);}
 }
 throw Error('No complete replay was returned. Please try another mystery game.');
}
export async function replayRequest(request){try{const url=new URL(request.url),id=url.searchParams.get('reveal');let value;if(id){if(!/^\d{5,8}$/.test(id))throw Error('Invalid replay.');const f=await replayFeed(Number(id));value={date:f.gameData?.datetime?.officialDate};}else value=await mysteryReplay();return Response.json(value,{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'The replay source is unavailable. Try again to load another mystery game.'},{status:502,headers:{'Cache-Control':'no-store'}});}}
