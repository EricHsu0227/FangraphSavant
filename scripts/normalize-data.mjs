import fs from 'node:fs';import {normalizePlayer,expectedMap,groupSeries} from '../lib/baseball.mjs';
const raw=JSON.parse(fs.readFileSync('lib/data/raw.json','utf8')),out={};
for(let y=2021;y<=2026;y++){
 const teams=raw[y+'-teams']?.teams??[],season={year:y,updated:new Date().toISOString(),source:'MLB Stats API · regular season',teams:teams.map(t=>({id:t.id,name:t.name,abbr:t.abbreviation,league:t.league?.name,leagueId:t.league?.id,division:t.division?.name,divisionId:t.division?.id,venue:t.venue?.name})),standings:raw[y+'-standings']?.records??[],series:groupSeries(raw[y+'-postseason'])};
 for(const kind of ['batting','pitching']){
  const map=expectedMap(raw[y+'-'+(kind==='batting'?'expectedBatting':'expectedPitching')]);
  const rows=(raw[y+'-'+kind]?.stats?.[0]?.splits??[]).filter(x=>!x.sport?.id||x.sport.id===1);
  const seen=new Set();season[kind]=rows.filter(x=>{if(seen.has(x.player.id))return false;seen.add(x.player.id);return true;}).map(x=>normalizePlayer(x,y,kind,map));
 }
 out[y]=season;console.log(y,'batting',season.batting.length,'pitching',season.pitching.length,'xwOBA',season.batting.filter(x=>x.xwoba!==null).length,'series',season.series.length);
}
fs.writeFileSync('lib/data/seasons.json',JSON.stringify(out));
