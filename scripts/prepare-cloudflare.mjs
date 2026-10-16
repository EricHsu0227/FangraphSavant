import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('dist/server/wrangler.json','utf8'));
if(config.assets?.run_worker_first!==true||config.assets?.binding!=='ASSETS'||config.preview_urls!==false)throw Error('Cloudflare Worker routing configuration is invalid.');
if(config.d1_databases?.filter(x=>x.binding==='DB').length!==1)throw Error('Preferences D1 binding is missing.');
fs.cpSync('drizzle','dist/server/drizzle',{recursive:true});
console.log('Cloudflare build prepared: public browsing, isolated local preferences, D1 migrations included.');
