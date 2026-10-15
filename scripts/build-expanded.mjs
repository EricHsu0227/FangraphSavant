import fs from 'node:fs';import {gzipSync} from 'node:zlib';import {enrich} from '../lib/research-stats.mjs';
const raw=JSON.parse(fs.readFileSync('lib/data/raw.json','utf8')),base=JSON.parse(fs.readFileSync('lib/data/seasons.json','utf8')),out={};
for(let y=2021;y<=2026;y++){
 const file=`.sites-runtime/expanded-cache/${y}-advanced.json`,d=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{stats:[]},year={};
 for(const kind of ['batting','pitching']){
 const group=kind==='batting'?'hitting':'pitching',standard=Object.fromEntries((raw[`${y}-${kind}`]?.stats?.[0]?.splits??[]).map(x=>[x.player.id,x.stat])),advanced={},saber={};
 for(const st of d.stats??[])if(st.group?.displayName===group)for(const x of st.splits??[]){if(x.sport?.id&&x.sport.id!==1)continue;(st.type.displayName==='sabermetrics'?saber:advanced)[x.player.id]=x.stat;}
 year[kind]=base[y][kind].map(p=>enrich(p,standard[p.id]??{},advanced[p.id]??{},saber[p.id]??{}));console.log(y,kind,year[kind].length,'columns',new Set(year[kind].flatMap(p=>Object.keys(p))).size);
 }
 out[y]=gzipSync(JSON.stringify(year)).toString('base64');
}
fs.writeFileSync('lib/data/expanded.json',JSON.stringify(out));
