// Publish existing verified MLB season records as static data, avoiding twelve
// full-season decompressions on each player request in the Worker runtime.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {withStatcast} from '../lib/statcast-summary.mjs';
import {withWobaWar} from '../lib/woba-war.mjs';
const seasons=JSON.parse(fs.readFileSync('lib/data/seasons.json','utf8'));
const historical=JSON.parse(fs.readFileSync('lib/data/seasons-history.json','utf8'));
const packed=JSON.parse(fs.readFileSync('lib/data/expanded.json','utf8'));
const people=new Map();
fs.mkdirSync('public/data/profiles',{recursive:true});
for(const [season,blob] of Object.entries(packed)){
 const data=JSON.parse(gunzipSync(Buffer.from(blob,'base64')).toString());
 const teams=(seasons[season]??JSON.parse(gunzipSync(Buffer.from(historical[season],'base64')).toString())).teams;
 for(const kind of ['batting','pitching']){
  data[kind]=data[kind].map(row=>withStatcast({...row,...(kind==='pitching'?withWobaWar(row):{}),teamAbbr:teams.find(t=>t.id===row.teamId)?.abbr??'TOT'},Number(season),kind));
  fs.mkdirSync('public/data/leaders',{recursive:true});
  fs.writeFileSync(`public/data/leaders/${season}-${kind}.json`,JSON.stringify({year:Number(season),kind,rows:data[kind],source:'Verified MLB season snapshot',snapshot:true}));
  for(const row of data[kind]){const key=row.id+'-'+kind;if(!people.has(key))people.set(key,{id:row.id,kind,history:[]});people.get(key).history.push(row);}
 }
}
for(const [key,person] of people){
 person.history.sort((a,b)=>b.season-a.season);
 const latest=person.history[0];
 fs.writeFileSync(`public/data/profiles/${key}.json`,JSON.stringify({...person,bio:{id:person.id,fullName:latest.name,primaryPosition:{abbreviation:latest.position}},splits:[],fielding:[],oaa:[],arsenal:[],failures:[],source:'Verified MLB season records; optional live details load separately',snapshot:true}));
}
console.log(`Prepared ${people.size} player records and ${Object.keys(packed).length*2} season leaderboards.`);
