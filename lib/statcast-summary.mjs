import {gunzipSync} from 'node:zlib';
import {selectableSplits} from './customization.mjs';
import packed from './data/statcast-splits.json' with {type:'json'};
import teamPacked from './data/statcast-teams.json' with {type:'json'};
const cache=new Map();
const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const rate=(a,b)=>n(b)>0?Math.round(1000*Number(a)/Number(b))/1000:null;
export function aggregateSearchURL(year,kind,hand='ALL',id=null){
 const u=new URL('https://baseballsavant.mlb.com/statcast_search');
 const p={hfSea:year+'|',hfGT:'R|',player_type:kind==='pitching'?'pitcher':'batter',group_by:'name',min_pitches:'0',min_results:'0',min_pas:'0',sort_col:'xwoba',sort_order:'desc',chk_stats_pa:'on',chk_stats_woba:'on',chk_stats_xwoba:'on',chk_stats_xba:'on',chk_stats_launch_speed:'on',outputFormat:'json'};
 if(hand!=='ALL')p[kind==='pitching'?'batter_stands':'pitcher_throws']=hand;
 if(id)p[kind==='pitching'?'pitchers_lookup[]':'batters_lookup[]']=String(id);
 for(const [k,v] of Object.entries(p))u.searchParams.set(k,v);
 return u;
}
export function normalizeAggregate(row){
 const x={id:Number(row.player_id),name:String(row.player_name??'').split(', ').reverse().join(' '),pa:n(row.pa),ab:n(row.abs),h:n(row.hits),b2:n(row.dbls),b3:n(row.triples),hr:n(row.hrs),bb:n(row.bb),hbp:n(row.hbp),so:n(row.so),avg:n(row.ba),obp:n(row.obp),slg:n(row.slg),iso:n(row.iso),babip:n(row.babip),woba:n(row.woba),xwoba:n(row.xwoba),xba:n(row.xba),xavg:n(row.xba),xslg:n(row.xslg),xobp:n(row.xobp),ev:n(row.launch_speed),la:n(row.launch_angle),hardhit:n(row.hardhit_percent),barrel:n(row.barrels_per_bbe_percent),barrels:n(row.barrels_total),barrelPA:n(row.barrels_per_pa_percent),bbe:n(row.bip),pN:n(row.pitches),swings:n(row.swings),misses:n(row.whiffs),whiffPct:n(row.swing_miss_percent),kPct:n(row.k_percent),bbPct:n(row.bb_percent),velocity:n(row.velocity),spin:n(row.spin_rate),extension:n(row.release_extension),adjustedEV:n(row.hyper_speed),batSpeed:n(row.sweetspot_speed_mph),swingLength:n(row.swing_length),attackAngle:n(row.attack_angle),attackDirection:n(row.attack_direction),swingPathTilt:n(row.swing_path_tilt)};
 x.ops=x.obp!==null&&x.slg!==null?Math.round((x.obp+x.slg)*1000)/1000:null;x.swingPct=x.pN?Math.round(10000*x.swings/x.pN)/100:null;x.contactPct=x.swings?Math.round(10000*(x.swings-x.misses)/x.swings)/100:null;
 for(const [k,v]of Object.entries(x))if(typeof v==='number'&&!Number.isInteger(v))x[k]=Math.round(v*10000)/10000;
 return x;
}
export function statcastAggregateRows(year,kind,hand='ALL'){
 const key=`${year}-${kind}-${hand}`;if(cache.has(key))return cache.get(key);
 const value=packed.tables[key];if(!value)return [];
 const rows=JSON.parse(gunzipSync(Buffer.from(value,'base64')).toString('utf8'));
 if(cache.size>=9){const victim=cache.keys().next().value;cache.delete(victim);updated.delete(victim)}cache.set(key,rows);return rows;
}
export function statcastSummary(year,id,kind){
 const splits=Object.fromEntries(['ALL','L','R'].map(hand=>[hand,statcastAggregateRows(year,kind,hand).find(x=>x.id===id)??null]).filter(([,x])=>x));
 return {id,year,kind,splits,terminalRows:splits.ALL?.pa??0,source:'Baseball Savant aggregate search',sourceType:'aggregate',capturedAt:year<2021?packed.historicalCapturedAt:packed.capturedAt,sourceURL:aggregateSearchURL(year,kind,'ALL',id).href,available:Object.keys(splits).length>0};
}
export function withStatcast(row,year,kind,hand='ALL'){
 const sc=statcastAggregateRows(year,kind,hand).find(x=>x.id===row.id),out={...row,...playerSplitColumns(year,row.id,kind)};if(!sc)return out;
 Object.assign(out,{scPA:sc.pa,scWoba:sc.woba});
 for(const k of ['xwoba','xavg','xslg','ev','la','hardhit','barrel','barrels','barrelPA','bbe','pN','swings','misses','whiffPct','swingPct','contactPct','velocity','spin','extension','adjustedEV','batSpeed','swingLength','attackAngle','attackDirection','swingPathTilt'])if(sc[k]!==null)out[k]=sc[k];
 return out;
}
export const statcastCapturedAt=packed.capturedAt;

const pending=new Map(),updated=new Map();
export async function refreshStatcastAggregate(year,kind,hand='ALL'){
 const key=`${year}-${kind}-${hand}`,recent=updated.get(key);if(recent&&Date.now()-recent<3600000)return new Date(recent).toISOString();if(pending.has(key))return pending.get(key);
 const task=(async()=>{const response=await fetch(aggregateSearchURL(year,kind,hand),{signal:AbortSignal.timeout(55000),headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'}});if(!response.ok)throw Error('Savant aggregate HTTP '+response.status);const rows=await response.json();if(!Array.isArray(rows)||!rows.length||!rows.every(x=>x.player_id&&x.pa!==undefined)||rows.some(x=>x.game_pk))throw Error('Savant did not return player aggregates');const normalized=rows.map(normalizeAggregate);cache.set(key,normalized);const at=Date.now();updated.set(key,at);return new Date(at).toISOString();})();pending.set(key,task);try{return await task}finally{pending.delete(key)}
}
export function aggregateCapturedAt(year,kind,hand='ALL'){return updated.has(`${year}-${kind}-${hand}`)?new Date(updated.get(`${year}-${kind}-${hand}`)).toISOString():year<2021?packed.historicalCapturedAt:statcastCapturedAt;}

export function playerSplitColumns(year,id,kind){return selectableSplits(statcastSummary(year,id,kind).splits);}

export function teamStatcastSummary(year,id,kind){
 const splits={};for(const hand of ['ALL','L','R']){const key=`team-${year}-${kind}-${hand}`;if(!cache.has(key)){const value=teamPacked.tables[`${year}-${kind}-${hand}`];if(value)cache.set(key,JSON.parse(gunzipSync(Buffer.from(value,'base64')).toString('utf8')))}const row=cache.get(key)?.find(x=>x.id===id);if(row)splits[hand]=row;}
 const url=aggregateSearchURL(year,kind);url.searchParams.set('group_by','team');return {year,id,kind,splits,capturedAt:year<2021?teamPacked.historicalCapturedAt:teamPacked.capturedAt,sourceURL:url.href,available:!!splits.ALL};
}
export function withTeamStatcast(row,year,id,kind){const sc=teamStatcastSummary(year,id,kind),all=sc.splits.ALL;return {...row,...selectableSplits(sc.splits),...(all?Object.fromEntries(['xwoba','xba','xslg','ev','la','hardhit','barrel','bbe','whiffPct','batSpeed'].map(k=>[k,all[k]])):{}),scPA:all?.pa??null,scWoba:all?.woba??null};}
