import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
const manifestPath=process.argv[2];if(!manifestPath)throw Error('Pass a verified Savant manifest path');
const output=new URL('../lib/data/statcast-splits.json',import.meta.url);
const provenance=new URL('../lib/data/statcast-provenance.json',import.meta.url);
if(!fs.existsSync(output))fs.writeFileSync(output,JSON.stringify({capturedAt:'',tables:{}}));
const {normalizeAggregate}=await import('../lib/statcast-summary.mjs');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),tables={},sources=[];
for(const entry of manifest.tables){const raw=JSON.parse(fs.readFileSync(entry.path,'utf8')),kind=entry.kind??raw.kind,year=entry.year??raw.year,hand=entry.hand??raw.hand,key=`${year}-${kind}-${hand}`;if(![2021,2022,2023,2024,2025,2026].includes(Number(year))||!['batting','pitching'].includes(kind)||!['ALL','L','R'].includes(hand))throw Error('Unexpected snapshot identity '+key);const rows=raw.rows.map(normalizeAggregate);if(!rows.length||rows.some(x=>!x.id||!Number.isFinite(x.pa))||new Set(rows.map(x=>x.id)).size!==rows.length)throw Error('Invalid aggregate table '+key);tables[key]=gzipSync(Buffer.from(JSON.stringify(rows))).toString('base64');sources.push({year,kind,hand,rows:rows.length,url:raw.url,capturedAt:raw.fetched});}
if(Object.keys(tables).length!==36)throw Error('Need every year, perspective and hand');
const capturedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify({capturedAt,tables}));fs.writeFileSync(provenance,JSON.stringify({capturedAt,source:'Official Baseball Savant aggregate search. No synthetic or inferred split expectations.',sources},null,2));console.log(JSON.stringify({tables:sources.length,rows:sources.reduce((a,b)=>a+b.rows,0),bytes:fs.statSync(output).size,capturedAt}));
